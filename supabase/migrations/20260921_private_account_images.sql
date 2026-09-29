begin;

-- Image metadata remains account-wide for its owner. The underlying bucket is
-- private, so knowing an object path is no longer enough to download it.
update storage.buckets
set public = false
where id = 'question-images';

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

create or replace function public.student_can_read_question_image(target_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions question
    join public.assessments assessment on assessment.id = question.assessment_id
    join public.assessment_sessions session on session.assessment_id = assessment.id
    join public.assessment_runs run on run.assessment_id = assessment.id
    where session.student_id = auth.uid()
      and session.status = 'active'
      and run.status = 'live'
      and assessment.is_published
      and public.can_access_assessment(assessment.id)
      and public.jsonb_references_image_path(question.question_data, target_path)
  );
$$;

revoke all on function public.jsonb_references_image_path(jsonb,text) from public, anon, authenticated;
revoke all on function public.student_can_read_question_image(text) from public, anon;
grant execute on function public.student_can_read_question_image(text) to authenticated;

drop policy if exists "private question image reads" on storage.objects;
create policy "private question image reads"
on storage.objects as restrictive for select to public
using (
  bucket_id <> 'question-images'
  or (auth.uid() is not null and owner_id = auth.uid()::text)
  or exists (
    select 1 from public.account_images image
    where image.image_path = name and image.owner_id = auth.uid()
  )
  or public.student_can_read_question_image(name)
);

drop policy if exists "private question image uploads" on storage.objects;
create policy "private question image uploads"
on storage.objects as restrictive for insert to public
with check (
  bucket_id <> 'question-images'
  or (
    auth.uid() is not null
    and owner_id = auth.uid()::text
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid() and profile.role = 'teacher'
    )
  )
);

drop policy if exists "authorized question image uploads" on storage.objects;
create policy "authorized question image uploads"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'question-images'
  and owner_id = auth.uid()::text
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'teacher'
  )
);

-- A permissive policy is required when a project did not already have a
-- question-image read policy. The restrictive policy above still limits any
-- broader pre-existing policy.
drop policy if exists "authorized question image reads" on storage.objects;
create policy "authorized question image reads"
on storage.objects for select to authenticated
using (
  bucket_id = 'question-images' and (
    owner_id = auth.uid()::text
    or exists (
      select 1 from public.account_images image
      where image.image_path = name and image.owner_id = auth.uid()
    )
    or public.student_can_read_question_image(name)
  )
);

drop policy if exists "owners modify question images" on storage.objects;
create policy "owners modify question images"
on storage.objects as restrictive for update to public
using (
  bucket_id <> 'question-images'
  or owner_id = auth.uid()::text
  or exists (
    select 1 from public.account_images image
    where image.image_path = name and image.owner_id = auth.uid()
  )
)
with check (bucket_id <> 'question-images' or owner_id = auth.uid()::text);

drop policy if exists "authorized question image updates" on storage.objects;
create policy "authorized question image updates"
on storage.objects for update to authenticated
using (bucket_id = 'question-images' and owner_id = auth.uid()::text)
with check (bucket_id = 'question-images' and owner_id = auth.uid()::text);

drop policy if exists "owners delete question images" on storage.objects;
create policy "owners delete question images"
on storage.objects as restrictive for delete to public
using (
  bucket_id <> 'question-images'
  or owner_id = auth.uid()::text
  or exists (
    select 1 from public.account_images image
    where image.image_path = name and image.owner_id = auth.uid()
  )
);

drop policy if exists "authorized question image deletes" on storage.objects;
create policy "authorized question image deletes"
on storage.objects for delete to authenticated
using (
  bucket_id = 'question-images' and (
    owner_id = auth.uid()::text
    or exists (
      select 1 from public.account_images image
      where image.image_path = name and image.owner_id = auth.uid()
    )
  )
);

notify pgrst, 'reload schema';
commit;
