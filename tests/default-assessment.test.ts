import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("the Grade 9 example is copied once into every classroom and remains deletable", async () => {
  const db = new PGlite();
  const sourceAssessment = "9172cd6c-e319-40a3-821e-84a6c365508b";
  const teacher = "00000000-0000-4000-8000-000000000001";
  const firstClass = "00000000-0000-4000-8000-000000000002";
  const secondClass = "00000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.profiles(id uuid primary key);
      create table public.classrooms(id uuid primary key default gen_random_uuid(), teacher_id uuid not null, name text not null);
      create table public.assessments(
        id uuid primary key default gen_random_uuid(), teacher_id uuid not null,
        classroom_id uuid not null references public.classrooms(id) on delete cascade,
        title text not null, description text, formula_sheet jsonb not null default '{}'::jsonb,
        assessment_code text not null, is_published boolean not null default false,
        created_at timestamptz not null default now()
      );
      create table public.questions(
        id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade,
        question_order integer not null, question_type text not null, prompt text, question_data jsonb not null
      );
      insert into public.profiles values ('${teacher}');
      insert into public.classrooms(id,teacher_id,name) values ('${firstClass}','${teacher}','First');
      insert into public.assessments(id,teacher_id,classroom_id,title,description,formula_sheet,assessment_code,is_published)
      values ('${sourceAssessment}','${teacher}','${firstClass}','Grade 9 Practice Test - Mathematics - Part B',null,'{"version":2}','SOURCE',true);
      insert into public.questions(assessment_id,question_order,question_type,prompt,question_data) values
        ('${sourceAssessment}',1,'multiple-choice','One','{"correctAnswer":"A"}'),
        ('${sourceAssessment}',2,'fill-in-the-blank','Two','{"correctAnswer":"2"}');
    `);
    const migration = await readFile(new URL("../supabase/migrations/20261103_default_grade9_practice_assessment.sql", import.meta.url), "utf8");
    await db.exec(migration);

    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from assessments where classroom_id='${firstClass}'`)).rows[0].count, 1);
    await db.exec(`insert into classrooms(id,teacher_id,name) values ('${secondClass}','${teacher}','Second')`);
    const copy = (await db.query<{ id: string; is_published: boolean; question_count: number }>(`
      select assessment.id, assessment.is_published, count(question.id)::int as question_count
      from assessments assessment join questions question on question.assessment_id=assessment.id
      where assessment.classroom_id='${secondClass}' group by assessment.id
    `)).rows[0];
    assert.equal(copy.is_published, false);
    assert.equal(copy.question_count, 2);

    await db.exec(`delete from assessments where id='${copy.id}'`);
    assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from assessments where classroom_id='${secondClass}'`)).rows[0].count, 0);
  } finally {
    await db.close();
  }
});
