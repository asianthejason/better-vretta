create table if not exists public.reference_builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  title text not null default '',
  top_content text not null default '',
  content text not null default '',
  image_url text not null default '',
  image_path text not null default '',
  table_data jsonb not null default '{"enabled":false,"hasBorder":true,"cells":[["", ""], ["", ""]]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reference_builds_owner_id_idx
on public.reference_builds(owner_id);

alter table public.reference_builds enable row level security;

drop policy if exists "teachers manage own reference builds" on public.reference_builds;
create policy "teachers manage own reference builds"
on public.reference_builds
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

grant select, insert, update, delete on table public.reference_builds to authenticated;

notify pgrst, 'reload schema';
