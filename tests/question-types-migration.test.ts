import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("drag-and-drop questions are allowed after the corrective migration", async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.questions (
      id bigint generated always as identity primary key,
      question_type text not null,
      constraint questions_multiple_choice_only check (question_type = 'multiple-choice'),
      constraint questions_question_type_check check (question_type in ('multiple-choice', 'drag-and-drop'))
    );
  `);

  const migration = await readFile(
    new URL("../supabase/migrations/20260916_allow_drag_drop_questions.sql", import.meta.url),
    "utf8"
  );
  await db.exec(migration);

  await db.exec("insert into public.questions (question_type) values ('multiple-choice'), ('drag-and-drop');");
  const saved = await db.query<{ question_type: string }>("select question_type from public.questions order by id;");
  assert.deepEqual(saved.rows.map((row) => row.question_type), ["multiple-choice", "drag-and-drop"]);

  await assert.rejects(
    db.exec("insert into public.questions (question_type) values ('short-answer');"),
    /questions_question_type_check/
  );
  await db.close();
});
