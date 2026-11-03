import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("teachers can duplicate an assessment into any classroom they teach", async () => {
  const db = new PGlite();
  const teacher = "00000000-0000-4000-8000-000000000001";
  const otherTeacher = "00000000-0000-4000-8000-000000000002";
  const sourceClass = "00000000-0000-4000-8000-000000000003";
  const targetClass = "00000000-0000-4000-8000-000000000004";
  const forbiddenClass = "00000000-0000-4000-8000-000000000005";
  const sourceAssessment = "00000000-0000-4000-8000-000000000006";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.classrooms(id uuid primary key, teacher_id uuid not null);
      create table public.classroom_teachers(classroom_id uuid not null, teacher_id uuid not null, primary key(classroom_id,teacher_id));
      create function public.is_classroom_teacher(target uuid) returns boolean language sql stable as $$
        select exists(select 1 from public.classroom_teachers where classroom_id=target and teacher_id=auth.uid())
      $$;
      create table public.assessments(
        id uuid primary key default gen_random_uuid(), teacher_id uuid not null, classroom_id uuid not null,
        title text not null, description text, formula_sheet jsonb not null default '{}'::jsonb,
        assessment_code text not null, is_published boolean not null default false
      );
      create table public.questions(
        id uuid primary key default gen_random_uuid(), assessment_id uuid not null references assessments(id) on delete cascade,
        question_order integer not null, question_type text not null, prompt text, question_data jsonb not null
      );
      grant usage on schema public to authenticated;
      grant select on public.assessments, public.questions to authenticated;
      insert into classrooms values ('${sourceClass}','${teacher}'),('${targetClass}','${otherTeacher}'),('${forbiddenClass}','${otherTeacher}');
      insert into classroom_teachers values ('${sourceClass}','${teacher}'),('${targetClass}','${teacher}'),('${targetClass}','${otherTeacher}'),('${forbiddenClass}','${otherTeacher}');
      insert into assessments values ('${sourceAssessment}','${teacher}','${sourceClass}','Quiz','Description','{"version":2}','SOURCE',true);
      insert into questions(assessment_id,question_order,question_type,prompt,question_data) values
        ('${sourceAssessment}',1,'multiple-choice','One','{"answer":"A"}'),
        ('${sourceAssessment}',2,'fill-in-the-blank','Two','{"answer":"2"}');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261103_duplicate_assessments.sql", import.meta.url), "utf8"));
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacher}',false);`);
    const duplicateId = (await db.query<{ id: string }>(`select duplicate_assessment('${sourceAssessment}','${targetClass}') as id`)).rows[0].id;
    const copy = (await db.query<{ title: string; teacher_id: string; classroom_id: string; is_published: boolean }>(`select title,teacher_id,classroom_id,is_published from assessments where id='${duplicateId}'`)).rows[0];
    assert.deepEqual(copy, { title: "Quiz (Copy)", teacher_id: otherTeacher, classroom_id: targetClass, is_published: false });
    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from questions where assessment_id='${duplicateId}'`)).rows[0].count, 2);
    await assert.rejects(db.query(`select duplicate_assessment('${sourceAssessment}','${forbiddenClass}')`), /destination classroom/i);
  } finally {
    await db.close();
  }
});
