import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("teachers can duplicate questions across assessments in classes they teach", async () => {
  const db = new PGlite();
  const teacher = "00000000-0000-4000-8000-000000000001";
  const sourceClass = "00000000-0000-4000-8000-000000000002";
  const targetClass = "00000000-0000-4000-8000-000000000003";
  const forbiddenClass = "00000000-0000-4000-8000-000000000004";
  const sourceAssessment = "00000000-0000-4000-8000-000000000005";
  const targetAssessment = "00000000-0000-4000-8000-000000000006";
  const forbiddenAssessment = "00000000-0000-4000-8000-000000000007";
  const sourceQuestion = "00000000-0000-4000-8000-000000000008";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.classroom_teachers(classroom_id uuid not null, teacher_id uuid not null, primary key(classroom_id,teacher_id));
      create function public.is_classroom_teacher(target uuid) returns boolean language sql stable as $$
        select exists(select 1 from public.classroom_teachers where classroom_id=target and teacher_id=auth.uid())
      $$;
      create table public.assessments(id uuid primary key, classroom_id uuid not null);
      create table public.questions(
        id uuid primary key default gen_random_uuid(), assessment_id uuid not null references assessments(id),
        question_order integer not null, question_type text not null, prompt text, question_data jsonb not null
      );
      grant usage on schema public to authenticated;
      grant select on public.questions to authenticated;
    `);
    await db.exec(`
      insert into classroom_teachers values ('${sourceClass}','${teacher}'),('${targetClass}','${teacher}');
      insert into assessments values ('${sourceAssessment}','${sourceClass}'),('${targetAssessment}','${targetClass}'),('${forbiddenAssessment}','${forbiddenClass}');
      insert into questions values ('${sourceQuestion}','${sourceAssessment}',1,'multiple-choice','Source','{"answer":"A"}');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261103_duplicate_questions_across_assessments.sql", import.meta.url), "utf8"));
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacher}',false);`);
    await db.exec(`select duplicate_question('${sourceQuestion}','${targetAssessment}')`);
    const copy = (await db.query<{ assessment_id: string; question_order: number; prompt: string }>(`
      select assessment_id,question_order,prompt from questions where assessment_id='${targetAssessment}'
    `)).rows[0];
    assert.equal(copy.assessment_id, targetAssessment);
    assert.equal(copy.question_order, 1);
    assert.equal(copy.prompt, "Source");
    await assert.rejects(db.query(`select duplicate_question('${sourceQuestion}','${forbiddenAssessment}')`), /destination classroom/i);
  } finally {
    await db.close();
  }
});
