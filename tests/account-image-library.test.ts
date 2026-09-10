import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("account image migration backfills and removes nested question references", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.profiles (id uuid primary key);
    create table public.assessments (id uuid primary key, teacher_id uuid references public.profiles(id));
    create table public.questions (id uuid primary key, assessment_id uuid references public.assessments(id), question_data jsonb not null);
    create table public.reference_builds (
      id uuid primary key,
      owner_id uuid references public.profiles(id),
      name text not null,
      image_url text not null default '',
      image_path text not null default '',
      table_data jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
    insert into public.profiles values ('00000000-0000-0000-0000-000000000001');
    insert into public.assessments values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');
    insert into public.questions values (
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000002',
      '{"dragDrop":{"backgroundImageUrl":"https://example.test/background.png","backgroundImagePath":"account/background.png","items":[{"imageUrl":"https://example.test/a.png","imagePath":"account/a.png"}]}}'
    );
  `);

  const migration = await readFile(new URL("../supabase/migrations/20260917_account_image_library.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const locationMigration = await readFile(new URL("../supabase/migrations/20260918_location_background_image_cleanup.sql", import.meta.url), "utf8");
  await db.exec(locationMigration);

  const images = await db.query<{ image_url: string; image_path: string }>("select image_url, image_path from public.account_images order by image_path;");
  assert.deepEqual(images.rows, [
    { image_url: "https://example.test/a.png", image_path: "account/a.png" },
    { image_url: "https://example.test/background.png", image_path: "account/background.png" },
  ]);

  const cleaned = await db.query<{ value: { dragDrop: { items: Array<{ imageUrl: string; imagePath: string }> } } }>(`
    select public.remove_image_reference(
      question_data,
      'https://example.test/a.png',
      'account/a.png'
    ) as value from public.questions;
  `);
  assert.equal(cleaned.rows[0].value.dragDrop.items[0].imageUrl, "");
  assert.equal(cleaned.rows[0].value.dragDrop.items[0].imagePath, "");

  const cleanedBackground = await db.query<{ value: { dragDrop: { backgroundImageUrl: string; backgroundImagePath: string } } }>(`
    select public.remove_image_reference(
      question_data,
      'https://example.test/background.png',
      'account/background.png'
    ) as value from public.questions;
  `);
  assert.equal(cleanedBackground.rows[0].value.dragDrop.backgroundImageUrl, "");
  assert.equal(cleanedBackground.rows[0].value.dragDrop.backgroundImagePath, "");
  await db.close();
});
