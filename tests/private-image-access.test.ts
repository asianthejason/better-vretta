import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { collectPrivateImagePaths, hydratePrivateImageUrls } from "../lib/privateImageUrls";

test("private image URLs are refreshed recursively without changing stored paths", async () => {
  const document = {
    imagePath: "teacher-a/question.png",
    imageUrl: "expired",
    nested: [{ backgroundImagePath: "teacher-a/background.png", backgroundImageUrl: "expired" }],
  };
  assert.deepEqual([...collectPrivateImagePaths(document)].sort(), [
    "teacher-a/background.png",
    "teacher-a/question.png",
  ]);

  const requests: string[][] = [];
  const fakeSupabase = {
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "question-images");
        return {
          getPublicUrl: (path: string) => ({ data: { publicUrl: `canonical:${path}` } }),
          createSignedUrls: async (paths: string[]) => {
            requests.push(paths);
            return { data: paths.map((path) => ({ path, signedUrl: `private:${path}` })), error: null };
          },
        };
      },
    },
  };
  const hydrated = await hydratePrivateImageUrls(fakeSupabase as never, document);
  assert.equal(requests.length, 1);
  assert.deepEqual(hydrated, {
    imagePath: "teacher-a/question.png",
    imageUrl: "private:teacher-a/question.png",
    nested: [{ backgroundImagePath: "teacher-a/background.png", backgroundImageUrl: "private:teacher-a/background.png" }],
  });
  assert.equal(document.imageUrl, "expired");
});

test("a signing failure falls back to the canonical storage URL instead of hiding the library image", async () => {
  const document = { image_path: "teacher-a/question.png", image_url: "expired-or-untrusted" };
  const fakeSupabase = {
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "question-images");
        return {
          getPublicUrl: (path: string) => ({ data: { publicUrl: `canonical:${path}` } }),
          createSignedUrls: async () => ({ data: [{ path: "teacher-a/question.png", signedUrl: null, error: "not signed" }], error: null }),
          createSignedUrl: async () => ({ data: null, error: { message: "not signed" } }),
        };
      },
    },
  };
  assert.deepEqual(await hydratePrivateImageUrls(fakeSupabase as never, document), {
    image_path: "teacher-a/question.png",
    image_url: "canonical:teacher-a/question.png",
  });
});

test("private image migration makes the bucket private and installs owner access policies", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.profiles (id uuid primary key, role text not null);
    create table public.assessments (id uuid primary key, teacher_id uuid not null, is_published boolean not null);
    create table public.questions (id uuid primary key, assessment_id uuid not null, question_data jsonb not null);
    create table public.assessment_sessions (assessment_id uuid not null, student_id uuid not null, status text not null);
    create table public.assessment_runs (assessment_id uuid not null, status text not null);
    create table public.account_images (owner_id uuid not null, image_path text not null);
    create table storage.buckets (id text primary key, public boolean not null);
    create table storage.objects (id uuid primary key, bucket_id text not null, name text not null, owner_id text);
    alter table storage.objects enable row level security;
    create function public.can_access_assessment(uuid) returns boolean language sql stable as $$ select true $$;
    insert into storage.buckets values ('question-images', true);
    insert into public.profiles values
      ('00000000-0000-0000-0000-000000000001', 'teacher'),
      ('00000000-0000-0000-0000-000000000002', 'teacher'),
      ('00000000-0000-0000-0000-000000000003', 'student');
    insert into public.assessments values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', true);
    insert into public.questions values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{"imagePath":"teacher-a/question.png","imageUrl":"old"}');
    insert into public.assessment_sessions values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'active');
    insert into public.assessment_runs values ('10000000-0000-0000-0000-000000000001', 'live');
    insert into public.account_images values ('00000000-0000-0000-0000-000000000001', 'teacher-a/question.png');
    insert into storage.objects values
      ('30000000-0000-0000-0000-000000000001', 'question-images', 'teacher-a/question.png', '00000000-0000-0000-0000-000000000001'),
      ('30000000-0000-0000-0000-000000000002', 'question-images', 'teacher-b/private.png', '00000000-0000-0000-0000-000000000002');
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
    grant select on public.profiles, public.account_images to authenticated;
  `);
  const migration = await readFile(new URL("../supabase/migrations/20260921_private_account_images.sql", import.meta.url), "utf8");
  await db.exec(migration);

  const bucket = await db.query<{ public: boolean }>("select public from storage.buckets where id='question-images'");
  assert.equal(bucket.rows[0].public, false);
  const policies = await db.query<{ policyname: string; permissive: string; roles: string[] }>(`
    select policyname, permissive, roles from pg_policies
    where schemaname='storage' and tablename='objects'
    order by policyname
  `);
  assert.ok(policies.rows.some((policy) => policy.policyname === "private question image reads" && policy.permissive === "RESTRICTIVE" && policy.roles.includes("public")));
  assert.ok(policies.rows.some((policy) => policy.policyname === "authorized question image reads" && policy.permissive === "PERMISSIVE" && policy.roles.includes("authenticated")));
  assert.ok(policies.rows.some((policy) => policy.policyname === "private question image uploads" && policy.permissive === "RESTRICTIVE" && policy.roles.includes("public")));

  await db.exec("set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';");
  const ownerFiles = await db.query<{ name: string }>("select name from storage.objects order by name");
  assert.deepEqual(ownerFiles.rows.map((row) => row.name), ["teacher-a/question.png"]);
  await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';");
  const otherTeacherFiles = await db.query<{ name: string }>("select name from storage.objects order by name");
  assert.deepEqual(otherTeacherFiles.rows.map((row) => row.name), ["teacher-b/private.png"]);
  await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';");
  const studentFiles = await db.query<{ name: string }>("select name from storage.objects order by name");
  assert.deepEqual(studentFiles.rows.map((row) => row.name), ["teacher-a/question.png"]);
  await db.exec("reset role; set role anon; reset request.jwt.claim.sub;");
  const anonymousFiles = await db.query<{ name: string }>("select name from storage.objects");
  assert.deepEqual(anonymousFiles.rows, []);
  await db.exec("reset role");
  await db.exec("alter table public.account_images add column image_url text;");
  // Reproduce applying formula sheets without the earlier image helpers.
  await db.exec("drop function public.jsonb_references_image_path(jsonb, text);");
  const formulaMigration = await readFile(new URL("../supabase/migrations/20260922_assessment_formula_sheet.sql", import.meta.url), "utf8");
  await db.exec(formulaMigration);
  // It must also be safe to rerun from the SQL editor.
  await db.exec(formulaMigration);
  await db.exec(`
    update public.assessments set formula_sheet = '{"version":2,"elements":[{"imagePath":"teacher-a/formula.png","imageUrl":"old"}]}';
    insert into storage.objects values ('30000000-0000-0000-0000-000000000003', 'question-images', 'teacher-a/formula.png', '00000000-0000-0000-0000-000000000001');
    set role authenticated;
    set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
  `);
  const resourceFiles = await db.query<{ name: string }>("select name from storage.objects order by name");
  assert.deepEqual(resourceFiles.rows.map((row) => row.name), ["teacher-a/formula.png", "teacher-a/question.png"]);
  await db.exec("reset role; update public.assessment_runs set status='ended'; set role authenticated;");
  assert.deepEqual((await db.query("select name from storage.objects")).rows, []);
  await db.exec("reset role; update public.assessment_runs set status='live'; update public.assessment_sessions set status='blocked'; set role authenticated;");
  assert.deepEqual((await db.query("select name from storage.objects")).rows, []);
  await db.exec("reset role;");
  await assert.rejects(db.exec("update public.assessments set formula_sheet='[]'"), /assessments_formula_sheet_object/);
  await db.exec(`
    insert into public.account_images values ('00000000-0000-0000-0000-000000000001', 'teacher-a/formula.png', 'old');
    delete from public.account_images where image_path='teacher-a/formula.png';
  `);
  const cleanedSheet = await db.query<{ path: string }>("select formula_sheet #>> '{elements,0,imagePath}' as path from public.assessments");
  assert.equal(cleanedSheet.rows[0].path, "");
  await db.close();
});
