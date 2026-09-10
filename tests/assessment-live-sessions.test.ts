import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

type LiveState = { runStatus: string; studentStatus: string; blockReason: string | null; kickCount: number };

test("assessment waiting, lockdown, teacher grant, and submission are enforced by the database", async () => {
  const db = new PGlite();
  const teacher = "00000000-0000-4000-8000-000000000101";
  const student = "00000000-0000-4000-8000-000000000102";
  const classroom = "00000000-0000-4000-8000-000000000103";
  const assessment = "00000000-0000-4000-8000-000000000104";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create type public.user_role as enum ('teacher', 'student');
      create table public.profiles (id uuid primary key, email text, full_name text, role public.user_role not null);
      create table public.teacher_entitlements (user_id uuid primary key, active boolean not null default true);
      create function public.teacher_has_access(target_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.teacher_entitlements where user_id=target_user_id and active) $$;
      create table public.classrooms (id uuid primary key, teacher_id uuid references profiles(id), name text);
      create table public.classroom_teachers (classroom_id uuid references classrooms(id), teacher_id uuid references profiles(id), primary key(classroom_id,teacher_id));
      create function public.is_classroom_teacher(target_classroom uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.classroom_teachers where classroom_id=target_classroom and teacher_id=auth.uid()) $$;
      create table public.assessments (id uuid primary key default gen_random_uuid(), teacher_id uuid references profiles(id), classroom_id uuid references classrooms(id), title text, is_published boolean);
      create table public.questions (id uuid primary key default gen_random_uuid(), assessment_id uuid references assessments(id), prompt text);
      create table public.classroom_students (classroom_id uuid references classrooms(id), student_id uuid references profiles(id), primary key(classroom_id,student_id));
      create table public.classroom_assessments (classroom_id uuid, assessment_id uuid, allow_all_students boolean not null default true, primary key(classroom_id,assessment_id));
      create table public.assessment_student_access (classroom_id uuid, assessment_id uuid, student_id uuid, allowed boolean, primary key(classroom_id,assessment_id,student_id));
      create function public.can_access_assessment(target_assessment uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.classroom_assessments ca join public.classroom_students cs on cs.classroom_id=ca.classroom_id where ca.assessment_id=target_assessment and cs.student_id=auth.uid() and (ca.allow_all_students or exists(select 1 from public.assessment_student_access asa where asa.classroom_id=ca.classroom_id and asa.assessment_id=ca.assessment_id and asa.student_id=auth.uid() and asa.allowed))) $$;
      create table public.student_attempts (id uuid primary key default gen_random_uuid(), assessment_id uuid references assessments(id), student_id uuid references profiles(id));
      create table public.student_answers (id uuid primary key default gen_random_uuid(), attempt_id uuid references student_attempts(id));
      create table public.assessment_sessions (assessment_id uuid references assessments(id), student_id uuid references profiles(id), first_opened_at timestamptz default now(), active_seconds bigint default 0, kick_count integer default 0, last_activity_at timestamptz default now(), primary key(assessment_id,student_id));
      alter table public.questions enable row level security;
      create policy base_question_read on public.questions for select using (true);
      grant usage on schema public, auth to authenticated;
      grant select, insert, update on all tables in schema public to authenticated;
      insert into profiles values ('${teacher}','teacher@example.test','Teacher','teacher'), ('${student}','student@example.test','Student','student');
      insert into teacher_entitlements values ('${teacher}',true);
      insert into classrooms values ('${classroom}','${teacher}','Science');
      insert into classroom_teachers values ('${classroom}','${teacher}');
      insert into assessments values ('${assessment}','${teacher}','${classroom}','Quiz',true);
      insert into questions(assessment_id,prompt) values ('${assessment}','Question');
      insert into classroom_students values ('${classroom}','${student}');
      insert into classroom_assessments values ('${classroom}','${assessment}',true);
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20260910_assessment_live_sessions.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260911_grant_waiting_room_reentry.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260912_assessment_answer_autosave.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260913_require_assessment_assignment.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260914_assessment_active_question_time.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260915_assessment_room_presence.sql", import.meta.url), "utf8"));

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${student}',false);`);
    await db.exec(`select start_assessment_session('${assessment}')`);
    let state = (await db.query<{ state: LiveState }>(`select assessment_entry_state('${assessment}') as state`)).rows[0].state;
    assert.deepEqual(state, { runStatus: "waiting", studentStatus: "waiting", blockReason: null, kickCount: 0 });
    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from questions`)).rows[0].count, 0);
    await assert.rejects(db.exec(`select record_assessment_activity('${assessment}', 10)`), /not active/);
    await db.exec(`update assessment_sessions set last_activity_at='2026-01-01T00:00:00Z' where assessment_id='${assessment}' and student_id='${student}'; select record_assessment_presence('${assessment}');`);
    assert.equal((await db.query<{ fresh: boolean }>(`select last_activity_at > '2026-01-01T00:00:00Z'::timestamptz as fresh from assessment_sessions where assessment_id='${assessment}' and student_id='${student}'`)).rows[0].fresh, true);

    await db.exec(`select record_assessment_kick('${assessment}', 2)`);
    assert.equal((await db.query<{ active_seconds: number }>(`select active_seconds from assessment_sessions where assessment_id='${assessment}' and student_id='${student}'`)).rows[0].active_seconds, 0);
    state = (await db.query<{ state: LiveState }>(`select assessment_entry_state('${assessment}') as state`)).rows[0].state;
    assert.equal(state.studentStatus, "blocked");
    await db.exec(`select set_config('request.jwt.claim.sub','${teacher}',false); select grant_assessment_reentry('${assessment}','${student}');`);
    await db.exec(`select set_config('request.jwt.claim.sub','${student}',false);`);
    state = (await db.query<{ state: LiveState }>(`select assessment_entry_state('${assessment}') as state`)).rows[0].state;
    assert.equal(state.studentStatus, "waiting");
    assert.equal(state.blockReason, null);

    await db.exec(`select set_config('request.jwt.claim.sub','${teacher}',false); select start_assessment_run('${assessment}');`);
    await db.exec(`select set_config('request.jwt.claim.sub','${student}',false);`);
    state = (await db.query<{ state: LiveState }>(`select assessment_entry_state('${assessment}') as state`)).rows[0].state;
    assert.equal(state.studentStatus, "active");
    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from questions`)).rows[0].count, 1);
    await db.exec(`select record_assessment_activity('${assessment}', 5)`);
    assert.equal((await db.query<{ active_seconds: number }>(`select active_seconds from assessment_sessions where assessment_id='${assessment}' and student_id='${student}'`)).rows[0].active_seconds, 5);

    const question = (await db.query<{ id: string }>(`select id from questions where assessment_id='${assessment}'`)).rows[0].id;
    await db.exec(`select save_assessment_draft_answers('${assessment}', '[{"question_id":"${question}","answer_data":{"answer":"B"}}]'::jsonb)`);
    const savedDraft = (await db.query<{ answer_data: { answer: string } }>(`select answer_data from load_assessment_draft_answers('${assessment}')`)).rows[0];
    assert.equal(savedDraft.answer_data.answer, "B");
    await db.exec(`select record_assessment_kick('${assessment}', 1)`);
    assert.equal((await db.query<{ active_seconds: number }>(`select active_seconds from assessment_sessions where assessment_id='${assessment}' and student_id='${student}'`)).rows[0].active_seconds, 6);
    await assert.rejects(db.exec(`select save_assessment_draft_answers('${assessment}', '[{"question_id":"${question}","answer_data":{"answer":"C"}}]'::jsonb)`), /not active/);
    const pausedDraft = (await db.query<{ answer_data: { answer: string } }>(`select answer_data from load_assessment_draft_answers('${assessment}')`)).rows[0];
    assert.equal(pausedDraft.answer_data.answer, "B");
    await db.exec(`select set_config('request.jwt.claim.sub','${teacher}',false); select grant_assessment_reentry('${assessment}','${student}');`);
    await db.exec(`select set_config('request.jwt.claim.sub','${student}',false);`);
    state = (await db.query<{ state: LiveState }>(`select assessment_entry_state('${assessment}') as state`)).rows[0].state;
    assert.equal(state.studentStatus, "active");

    await db.exec(`select set_config('request.jwt.claim.sub','${teacher}',false); update assessments set is_published=false where id='${assessment}';`);
    await db.exec(`select set_config('request.jwt.claim.sub','${student}',false);`);
    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from questions`)).rows[0].count, 0);
    await assert.rejects(db.exec(`insert into student_attempts(assessment_id,student_id) values ('${assessment}','${student}')`), /not opened/);
    await db.exec(`select set_config('request.jwt.claim.sub','${teacher}',false); update assessments set is_published=true where id='${assessment}'; select start_assessment_run('${assessment}');`);
    await db.exec(`select set_config('request.jwt.claim.sub','${student}',false);`);

    await db.exec(`select record_assessment_kick('${assessment}', 4)`);
    state = (await db.query<{ state: LiveState }>(`select assessment_entry_state('${assessment}') as state`)).rows[0].state;
    assert.equal(state.studentStatus, "blocked");
    assert.equal(state.blockReason, "Tried to leave lockdown browser");
    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from questions`)).rows[0].count, 0);
    await assert.rejects(db.exec(`insert into student_attempts(assessment_id,student_id) values ('${assessment}','${student}')`), /not opened/);

    await db.exec(`select set_config('request.jwt.claim.sub','${teacher}',false); select grant_assessment_reentry('${assessment}','${student}');`);
    await db.exec(`select set_config('request.jwt.claim.sub','${student}',false);`);
    const attempt = (await db.query<{ id: string }>(`insert into student_attempts(assessment_id,student_id) values ('${assessment}','${student}') returning id`)).rows[0].id;
    await db.exec(`insert into student_answers(attempt_id) values ('${attempt}'); select complete_assessment_session('${assessment}');`);
    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from load_assessment_draft_answers('${assessment}')`)).rows[0].count, 0);
    state = (await db.query<{ state: LiveState }>(`select assessment_entry_state('${assessment}') as state`)).rows[0].state;
    assert.equal(state.studentStatus, "submitted");
    await assert.rejects(db.exec(`insert into student_answers(attempt_id) values ('${attempt}')`), /not active/);

    await assert.rejects(db.exec(`insert into assessments(teacher_id,classroom_id,title) values ('${student}','${classroom}','Forbidden')`), /teacher|teach/i);
    await db.exec(`select set_config('request.jwt.claim.sub','${teacher}',false);`);
    await assert.rejects(db.exec(`insert into assessments(teacher_id,title) values ('${teacher}','Unassigned')`), /assigned to a classroom/);
    const draft = (await db.query<{ is_published: boolean }>(`insert into assessments(teacher_id,classroom_id,title) values ('${teacher}','${classroom}','Draft') returning is_published`)).rows[0];
    assert.equal(draft.is_published, false);
  } finally {
    await db.close();
  }
});
