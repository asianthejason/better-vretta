import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mergeQuestionDrafts, type QuestionDraft } from "../lib/questionDrafts";

test("newer draft and publication records win over stale offline snapshots", () => {
  const draft: QuestionDraft = { id: "one", owner_id: "teacher", assessment_id: "assessment", question_id: null, status: "draft", snapshot: { text: "old" }, updated_at: "2026-09-21T10:00:00.000Z" };
  const published = { ...draft, status: "published" as const, snapshot: {}, updated_at: "2026-09-21T10:01:00.000Z" };
  assert.deepEqual(mergeQuestionDrafts([published], [draft]), [published]);
  assert.deepEqual(mergeQuestionDrafts([draft], [published]), [published]);
});

test("draft migration enforces private ownership, assessment access, and stale-write protection", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create table public.profiles(id uuid primary key);
      create table public.assessments(id uuid primary key, teacher_id uuid, classroom_id uuid);
      create table public.questions(id uuid primary key, assessment_id uuid);
      create function public.is_classroom_teacher(uuid) returns boolean language sql as $$ select false $$;
      grant usage on schema auth to authenticated;
      grant select on public.assessments, public.questions to authenticated;
      insert into public.profiles values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
      insert into public.assessments values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', null);
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20260923_question_editor_drafts.sql", import.meta.url), "utf8"));
    await db.exec(`
      set role authenticated;
      select set_config('test.uid', '00000000-0000-0000-0000-000000000001', false);
      insert into public.question_drafts (id, owner_id, assessment_id, snapshot, updated_at)
      values ('00000000-0000-0000-0000-000000000100', auth.uid(), '00000000-0000-0000-0000-000000000010', '{"text":"new"}', '2026-09-21T11:00:00Z');
      update public.question_drafts set snapshot = '{"text":"stale"}', updated_at = '2026-09-21T10:00:00Z';
    `);
    assert.equal((await db.query<{ snapshot: { text: string } }>("select snapshot from public.question_drafts")).rows[0].snapshot.text, "new");
    await db.exec("update public.question_drafts set status = 'published', snapshot = '{}', updated_at = '2026-09-21T12:00:00Z'");
    await db.exec("update public.question_drafts set status = 'draft', updated_at = '2026-09-21T11:30:00Z'");
    assert.equal((await db.query<{ status: string }>("select status from public.question_drafts")).rows[0].status, "published");
    await db.exec("select set_config('test.uid', '00000000-0000-0000-0000-000000000002', false)");
    assert.equal((await db.query("select * from public.question_drafts")).rows.length, 0);
    await assert.rejects(db.exec(`insert into public.question_drafts (id, owner_id, assessment_id) values ('00000000-0000-0000-0000-000000000101', auth.uid(), '00000000-0000-0000-0000-000000000010')`), /row-level security/);
  } finally { await db.close(); }
});
