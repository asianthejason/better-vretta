begin;

-- Location canvases store their image under backgroundImageUrl/backgroundImagePath.
-- Add existing canvas backgrounds to the permanent account image library.
insert into public.account_images (owner_id, image_url, image_path, label)
select distinct
  assessment.teacher_id,
  question.question_data #>> '{dragDrop,backgroundImageUrl}',
  question.question_data #>> '{dragDrop,backgroundImagePath}',
  'Imported location background'
from public.questions question
join public.assessments assessment on assessment.id = question.assessment_id
where coalesce(question.question_data #>> '{dragDrop,backgroundImageUrl}', '') <> ''
  and coalesce(question.question_data #>> '{dragDrop,backgroundImagePath}', '') <> ''
on conflict (owner_id, image_path) do update
set image_url = excluded.image_url;

-- Deleting an account image must also clear location-canvas background fields.
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

notify pgrst, 'reload schema';
commit;
