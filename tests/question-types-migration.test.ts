import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("supported assessment question types are allowed after the corrective migrations", async () => {
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
  const dropdownMigration = await readFile(
    new URL("../supabase/migrations/20260919_allow_dropdown_questions.sql", import.meta.url),
    "utf8"
  );
  await db.exec(dropdownMigration);
  const fillBlankMigration = await readFile(
    new URL("../supabase/migrations/20260920_allow_fill_in_blank_questions.sql", import.meta.url),
    "utf8"
  );
  await db.exec(fillBlankMigration);
  await db.exec(await readFile(new URL("../supabase/migrations/20260924_allow_sort_into_groups.sql", import.meta.url), "utf8"));

  await db.exec("insert into public.questions (question_type) values ('multiple-choice'), ('drag-and-drop'), ('dropdown'), ('fill-in-the-blank'), ('sort-into-groups');");
  const saved = await db.query<{ question_type: string }>("select question_type from public.questions order by id;");
  assert.deepEqual(saved.rows.map((row) => row.question_type), ["multiple-choice", "drag-and-drop", "dropdown", "fill-in-the-blank", "sort-into-groups"]);

  await assert.rejects(
    db.exec("insert into public.questions (question_type) values ('short-answer');"),
    /questions_question_type_check/
  );
  await db.close();
});
