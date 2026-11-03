begin;

create or replace function public.duplicate_assessment(
  source_assessment uuid,
  target_classroom uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.assessments%rowtype;
  target_owner uuid;
  duplicate_id uuid;
begin
  select assessment.* into source
  from public.assessments assessment
  where assessment.id = source_assessment;
  if not found then raise exception 'Assessment not found'; end if;

  if source.classroom_id is null or not public.is_classroom_teacher(source.classroom_id) then
    raise exception 'You do not teach the source classroom';
  end if;
  if not public.is_classroom_teacher(target_classroom) then
    raise exception 'You do not teach the destination classroom';
  end if;

  select teacher_id into target_owner
  from public.classrooms where id = target_classroom;
  if target_owner is null then raise exception 'Destination classroom not found'; end if;

  insert into public.assessments(
    teacher_id, classroom_id, title, description, formula_sheet,
    assessment_code, is_published
  ) values (
    target_owner,
    target_classroom,
    source.title || ' (Copy)',
    source.description,
    source.formula_sheet,
    substr(upper(md5(gen_random_uuid()::text)), 1, 6),
    false
  ) returning id into duplicate_id;

  insert into public.questions(
    assessment_id, question_order, question_type, prompt, question_data
  )
  select duplicate_id, question_order, question_type, prompt, question_data
  from public.questions
  where assessment_id = source_assessment
  order by question_order;

  return duplicate_id;
end;
$$;

revoke all on function public.duplicate_assessment(uuid, uuid) from public, anon;
grant execute on function public.duplicate_assessment(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
