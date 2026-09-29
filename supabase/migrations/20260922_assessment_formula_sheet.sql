begin;

alter table public.assessments
  add column if not exists formula_sheet jsonb;

alter table public.assessments
  drop constraint if exists assessments_formula_sheet_object;

alter table public.assessments
  add constraint assessments_formula_sheet_object
  check (formula_sheet is null or jsonb_typeof(formula_sheet) = 'object');

-- Define image helpers here as well so this migration does not depend on
-- the earlier image-cleanup or private-bucket migrations having been applied.
create or replace function public.jsonb_references_image_path(document jsonb, target_path text)
returns boolean
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
  select exists (
    select 1
    from nodes
    where jsonb_typeof(value) = 'object'
      and target_path in (
        coalesce(value ->> 'imagePath', ''),
        coalesce(value ->> 'image_path', ''),
        coalesce(value ->> 'backgroundImagePath', ''),
        coalesce(value ->> 'leftPanelImagePath', '')
      )
  );
$$;

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
      coalesce(document ->> 'image_path', '') = target_path or
      coalesce(document ->> 'backgroundImageUrl', '') = target_url or
      coalesce(document ->> 'backgroundImagePath', '') = target_path;

    select coalesce(jsonb_object_agg(entry.key,
      case
        when object_matches and entry.key in (
          'imageUrl', 'imagePath', 'image_url', 'image_path',
          'backgroundImageUrl', 'backgroundImagePath'
        ) then '""'::jsonb
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

revoke all on function public.jsonb_references_image_path(jsonb, text) from public, anon, authenticated;

-- Resource images have the same live-session access rules as question images.
create or replace function public.student_can_read_question_image(target_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessments assessment
    join public.assessment_sessions session on session.assessment_id = assessment.id
    join public.assessment_runs run on run.assessment_id = assessment.id
    where session.student_id = auth.uid()
      and session.status = 'active'
      and run.status = 'live'
      and assessment.is_published
      and public.can_access_assessment(assessment.id)
      and (
        public.jsonb_references_image_path(assessment.formula_sheet, target_path)
        or exists (
          select 1 from public.questions question
          where question.assessment_id = assessment.id
            and public.jsonb_references_image_path(question.question_data, target_path)
        )
      )
  );
$$;

revoke all on function public.student_can_read_question_image(text) from public, anon;
grant execute on function public.student_can_read_question_image(text) to authenticated;

-- Keep saved sheets consistent when an image is deleted from the library.
create or replace function public.clear_formula_sheet_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessments
  set formula_sheet = public.remove_image_reference(formula_sheet, old.image_url, old.image_path)
  where teacher_id = old.owner_id
    and public.jsonb_references_image_path(formula_sheet, old.image_path);
  return old;
end;
$$;

revoke all on function public.clear_formula_sheet_image() from public, anon, authenticated;
drop trigger if exists clear_deleted_formula_sheet_image on public.account_images;
create trigger clear_deleted_formula_sheet_image
before delete on public.account_images
for each row execute function public.clear_formula_sheet_image();

notify pgrst, 'reload schema';
commit;
