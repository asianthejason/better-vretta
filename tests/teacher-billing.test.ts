import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import Stripe from "stripe";
import { teacherQuote, isPaidTeacherSession } from "../lib/teacherPricing";

test("annual teacher plans and coupon pricing are enforced server-side", () => {
  assert.deepEqual(teacherQuote(""), { amount: 6000, currency: "cad", plan: "basic" });
  assert.deepEqual(teacherQuote(" WebberTeam "), { amount: 0, currency: "cad", plan: "unlimited" });
  assert.deepEqual(teacherQuote("", "unlimited"), { amount: 10000, currency: "cad", plan: "unlimited" });
  assert.throws(() => teacherQuote("", "forged"));
  for (const invalid of ["free", "webberteam1", 0, null, {}, "x".repeat(101)]) {
    assert.throws(() => teacherQuote(invalid));
  }
});

test("fulfillment rejects unpaid, wrong-price, wrong-currency, or misbound sessions", () => {
  const valid = { status: "complete", payment_status: "paid", mode: "subscription", amount_total: 6000,
    currency: "cad", client_reference_id: "user-1", metadata: { purpose: "teacher_signup", user_id: "user-1", plan: "basic" } };
  assert.equal(isPaidTeacherSession(valid), true);
  for (const change of [
    { status: "open" }, { payment_status: "unpaid" }, { payment_status: "no_payment_required" },
    { mode: "payment" }, { amount_total: 0 }, { amount_total: 3999 }, { currency: "usd" },
    { client_reference_id: null }, { metadata: null },
    { metadata: { purpose: "teacher_signup", user_id: "another-user" } },
    { metadata: { purpose: "another_product", user_id: "user-1" } },
  ]) assert.equal(isPaidTeacherSession({ ...valid, ...change }), false);
});

test("Stripe signature verification rejects tampered webhook bodies", () => {
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_test_only";
  const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed", data: { object: {} } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, signature, secret).id, "evt_test");
  assert.throws(() => stripe.webhooks.constructEvent(payload + " ", signature, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, signature, "wrong-secret"));
});

test("database blocks self-promotion and metadata bypass; activation is atomic and idempotent", async () => {
  const db = new PGlite();
  const legacy = "00000000-0000-4000-8000-000000000001";
  const student = "00000000-0000-4000-8000-000000000002";
  const paid = "00000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create type public.user_role as enum ('teacher', 'student');
      create table public.profiles (id uuid primary key references auth.users(id), email text, full_name text, role public.user_role default 'student');
      grant usage on schema public to authenticated, service_role;
      grant select, insert, update on public.profiles to authenticated;
      grant update (full_name, role) on public.profiles to authenticated;
      insert into auth.users values ('${legacy}', 'legacy@example.test', '{}');
      insert into public.profiles values ('${legacy}', 'legacy@example.test', '', 'teacher');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20260908_teacher_signup_billing.sql", import.meta.url), "utf8"));
    await db.exec(`create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
      insert into auth.users values ('${student}', 'student@example.test', '{"role":"teacher"}'), ('${paid}', 'paid@example.test', '{}');`);
    assert.equal((await db.query<{ role: string }>(`select role from profiles where id = '${student}'`)).rows[0].role, "student");
    assert.equal((await db.query<{ source: string }>(`select source from teacher_entitlements where user_id = '${legacy}'`)).rows[0].source, "legacy");

    await db.exec("set role authenticated");
    await assert.rejects(db.exec(`update profiles set role = 'teacher' where id = '${student}'`), /permission denied/);
    await assert.rejects(db.exec(`insert into teacher_entitlements(user_id, source) values ('${student}', 'coupon')`), /permission denied/);
    await assert.rejects(db.exec(`select activate_teacher_account('${student}', 'coupon')`), /permission denied/);
    await db.exec(`update profiles set full_name = 'New Name' where id = '${student}'`);
    await db.exec("reset role");
    // The trigger still blocks a privileged or SECURITY DEFINER role update.
    await assert.rejects(db.exec(`update profiles set role = 'teacher' where id = '${student}'`), /verified payment or coupon/);

    await db.exec("set role service_role");
    await db.exec(`insert into teacher_checkout_attempts(user_id) values ('${student}')`);
    await assert.rejects(db.exec(`select activate_teacher_account('${student}', 'coupon')`), /Cancel the existing checkout/);
    await db.exec(`delete from teacher_checkout_attempts where user_id = '${student}'`);
    await db.exec(`select activate_teacher_account('${student}', 'coupon'); select activate_teacher_account('${student}', 'coupon');`);
    await assert.rejects(db.exec(`insert into teacher_checkout_attempts(user_id) values ('${student}')`), /already active/);
    await assert.rejects(db.exec(`select activate_teacher_account('${paid}', 'stripe', null)`), /check constraint/);
    await db.exec(`select activate_teacher_account('${paid}', 'stripe', 'cs_test_paid'); select activate_teacher_account('${paid}', 'stripe', 'cs_test_paid');`);
    await db.exec("reset role");
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from teacher_entitlements")).rows[0].count, 3);
    assert.deepEqual((await db.query<{ role: string }>(`select role from profiles where id in ('${student}', '${paid}')`)).rows.map(row => row.role), ["teacher", "teacher"]);
    await db.exec(`
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.classrooms (id uuid primary key default gen_random_uuid(), teacher_id uuid references profiles(id), name text);
      create table public.classroom_teachers (classroom_id uuid references classrooms(id) on delete cascade, teacher_id uuid references profiles(id), primary key (classroom_id, teacher_id));
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20260909_teacher_annual_plans.sql", import.meta.url), "utf8"));
    const basic = "00000000-0000-4000-8000-000000000004";
    const free = "00000000-0000-4000-8000-000000000005";
    await db.exec(`insert into auth.users values ('${basic}', 'basic@example.test', '{}'), ('${free}', 'free@example.test', '{}');`);
    await db.exec("set role service_role");
    await assert.rejects(db.exec(`select activate_teacher_plan('${free}', 'coupon', 'basic')`), /free unlimited/);
    await db.exec(`select activate_teacher_plan('${free}', 'coupon', 'unlimited');`);
    await db.exec(`select activate_teacher_plan('${basic}', 'stripe', 'basic', 'cs_annual', 'sub_annual', now() + interval '1 year', 'active', false);`);
    await db.exec("reset role");
    await db.exec(`insert into classrooms(teacher_id,name) values ('${basic}','One'), ('${basic}','Two');`);
    await assert.rejects(db.exec(`insert into classrooms(teacher_id,name) values ('${basic}','Three')`), /includes 2 classrooms/);
    await db.exec(`insert into classrooms(teacher_id,name) values ('${free}','A'), ('${free}','B'), ('${free}','C');`);
    await assert.rejects(db.exec(`insert into classroom_teachers select id,'${basic}'::uuid from classrooms where name='A'`), /includes 2 classrooms/);
    await db.exec(`delete from classrooms where teacher_id='${basic}' and name='One';`);
    await db.exec(`insert into classroom_teachers select id,'${basic}'::uuid from classrooms where name='A';`);
    await assert.rejects(db.exec(`insert into classrooms(teacher_id,name) values ('${basic}','Three')`), /includes 2 classrooms/);
    await db.exec(`select sync_teacher_subscription('sub_annual', 'basic', 'canceled', null, true);`);
    assert.equal((await db.query<{ active: boolean }>(`select teacher_has_access('${basic}') as active`)).rows[0].active, false);
    await assert.rejects(db.exec(`insert into classrooms(teacher_id,name) values ('${basic}','Expired')`), /active teacher plan/);
    await db.exec(`select sync_teacher_subscription('sub_annual', 'basic', 'active', now() + interval '2 years', false);`);
    assert.equal((await db.query<{ active: boolean }>(`select teacher_has_access('${basic}') as active`)).rows[0].active, true);
    await db.exec("set role authenticated");
    await assert.rejects(db.exec(`select activate_teacher_plan('${basic}', 'coupon', 'unlimited')`), /permission denied/);
    await assert.rejects(db.exec(`select sync_teacher_subscription('sub_annual', 'unlimited', 'active', now()+interval '5 years', false)`), /permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});
