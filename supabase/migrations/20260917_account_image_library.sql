begin;

create table if not exists public.account_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  label text not null default 'Uploaded image',
  created_at timestamptz not null default now(),
  unique (owner_id, image_path)
);

create index if not exists account_images_owner_created_idx
on public.account_images(owner_id, created_at desc);

alter table public.account_images enable row level security;

drop policy if exists "teachers manage own image library" on public.account_images;
create policy "teachers manage own image library"
on public.account_images for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

grant select, insert, update, delete on table public.account_images to authenticated;

-- Find image objects at any depth in existing question JSON so current uploads
-- are retained when the library is introduced.
create or replace function public.extract_image_references(document jsonb)
returns table(image_url text, image_path text)
language sql
immutable
set search_path = ''
as $$
  with recursive nodes(value) as (
    select document
    union all
    select child.value
    from nodes node
    cross join lateral (
      select entry.value
      from jsonb_each(case when jsonb_typeof(node.value) = 'object' then node.value else '{}'::jsonb end) entry
      union all
      select entry.value
      from jsonb_array_elements(case when jsonb_typeof(node.value) = 'array' then node.value else '[]'::jsonb end) entry
    ) child
  )
  select distinct
    coalesce(value ->> 'imageUrl', value ->> 'image_url') as image_url,
    coalesce(value ->> 'imagePath', value ->> 'image_path') as image_path
  from nodes
  where jsonb_typeof(value) = 'object'
    and coalesce(value ->> 'imageUrl', value ->> 'image_url', '') <> ''
    and coalesce(value ->> 'imagePath', value ->> 'image_path', '') <> '';
$$;

insert into public.account_images (owner_id, image_url, image_path, label)
select distinct assessment.teacher_id, image.image_url, image.image_path, 'Imported question image'
from public.questions question
join public.assessments assessment on assessment.id = question.assessment_id
cross join lateral public.extract_image_references(question.question_data) image
on conflict (owner_id, image_path) do update set image_url = excluded.image_url;

insert into public.account_images (owner_id, image_url, image_path, label)
select reference.owner_id, reference.image_url, reference.image_path, reference.name
from public.reference_builds reference
where reference.image_url <> '' and reference.image_path <> ''
on conflict (owner_id, image_path) do update set image_url = excluded.image_url;

drop function public.extract_image_references(jsonb);

-- Recursively blank matching image fields without changing the rest of a
-- question's structure.
create or replace function public.remove_image_reference(
  document jsonb,
  target_url text,
  target_path text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb;
  object_matches boolean;
begin
  if document is null then return document; end if;

  if jsonb_typeof(document) = 'array' then
    select coalesce(jsonb_agg(public.remove_image_reference(entry.value, target_url, target_path) order by entry.ordinality), '[]'::jsonb)
    into result
    from jsonb_array_elements(document) with ordinality entry(value, ordinality);
    return result;
  end if;

  if jsonb_typeof(document) = 'object' then
    object_matches :=
      coalesce(document ->> 'imageUrl', '') = target_url or
      coalesce(document ->> 'imagePath', '') = target_path or
      coalesce(document ->> 'image_url', '') = target_url or
      coalesce(document ->> 'image_path', '') = target_path;

    select coalesce(jsonb_object_agg(entry.key,
      case
        when object_matches and entry.key in ('imageUrl', 'imagePath', 'image_url', 'image_path') then '""'::jsonb
        else public.remove_image_reference(entry.value, target_url, target_path)
      end
    ), '{}'::jsonb)
    into result
    from jsonb_each(document) entry;
    return result;
  end if;

  return document;
end;
$$;

create or replace function public.delete_account_image(target_image uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_image public.account_images%rowtype;
begin
  select * into selected_image
  from public.account_images
  where id = target_image and owner_id = auth.uid();

  if not found then raise exception 'Image not found'; end if;

  update public.questions question
  set question_data = public.remove_image_reference(question.question_data, selected_image.image_url, selected_image.image_path)
  from public.assessments assessment
  where assessment.id = question.assessment_id
    and assessment.teacher_id = auth.uid();

  update public.reference_builds reference
  set image_url = case when reference.image_url = selected_image.image_url or reference.image_path = selected_image.image_path then '' else reference.image_url end,
      image_path = case when reference.image_url = selected_image.image_url or reference.image_path = selected_image.image_path then '' else reference.image_path end,
      table_data = public.remove_image_reference(reference.table_data, selected_image.image_url, selected_image.image_path),
      updated_at = now()
  where reference.owner_id = auth.uid();

  delete from public.account_images where id = selected_image.id;
  return selected_image.image_path;
end;
$$;

revoke all on function public.remove_image_reference(jsonb,text,text) from public, anon, authenticated;
revoke all on function public.delete_account_image(uuid) from public, anon;
grant execute on function public.delete_account_image(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
