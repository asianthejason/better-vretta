import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("built-in question templates are snapshotted outside user-owned assessments", async () => {
  const db = new PGlite();
  const assessmentId = "00000000-0000-4000-8000-000000000001";
  const templateOrders = [1, 2, 3, 4, 5, 7, 8, 11, 12, 13, 16, 18, 19, 21, 22];
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.assessments(
        id uuid primary key, title text not null, description text, formula_sheet jsonb,
        created_at timestamptz not null default now()
      );
      create table public.questions(
        id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade,
        question_order integer not null, question_type text not null, prompt text, question_data jsonb not null
      );
      insert into public.assessments(id,title,description,formula_sheet)
      values ('${assessmentId}','Grade 9 Practice Test - Mathematics - Part B','Source','{}');
      ${templateOrders.map((order) => `insert into public.questions(assessment_id,question_order,question_type,prompt,question_data) values ('${assessmentId}',${order},'multiple-choice','Question ${order}','{"choices":["A","B"]}');`).join("\n")}
    `);
    const migration = await readFile(new URL("../supabase/migrations/20261105_repair_protected_question_templates.sql", import.meta.url), "utf8");
    await db.exec(migration);

    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from default_assessment_template_questions")).rows[0].count, 15);
    await db.exec(`delete from assessments where id='${assessmentId}'`);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from default_assessment_template_questions")).rows[0].count, 15);
    assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated', 'default_assessment_template_questions', 'select') as allowed")).rows[0].allowed, false);
  } finally {
    await db.close();
  }
});

test("Sort into Groups is protected from assessment deletion", async () => {
  const db = new PGlite();
  const assessmentId = "00000000-0000-4000-8000-000000000010";
  const questionId = "f33a8b0e-c4cf-4b98-b6df-d860ec7b37d2";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.assessments(id uuid primary key, title text not null);
      create table public.questions(
        id uuid primary key, assessment_id uuid not null references public.assessments(id) on delete cascade,
        question_order integer not null, question_type text not null, prompt text, question_data jsonb not null
      );
      insert into public.assessments values ('${assessmentId}', 'Source');
      insert into public.questions values (
        '${questionId}', '${assessmentId}', 1, 'sort-into-groups', 'Sort the statements',
        '{"dragDrop":{"preset":"category-canvas"}}'
      );
    `);
    const migration = await readFile(new URL("../supabase/migrations/20261106_protect_sort_into_groups_template.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(`delete from assessments where id='${assessmentId}'`);
    const protectedRows = await db.query<{ question_type: string; preset: string }>(`
      select question_type, question_data #>> '{dragDrop,preset}' as preset
      from default_assessment_template_questions
      where template_key='variation-sort-into-groups'
    `);
    assert.deepEqual(protectedRows.rows, [{ question_type: "sort-into-groups", preset: "category-canvas" }]);
  } finally {
    await db.close();
  }
});
