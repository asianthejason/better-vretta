begin;

create or replace function public.duplicate_question(
  source_question uuid,
  target_assessment uuid
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.questions%rowtype;
  source_classroom uuid;
  destination_classroom uuid;
  duplicate public.questions%rowtype;
begin
  select question.* into source
  from public.questions question where question.id = source_question;
  if not found then raise exception 'Question not found'; end if;

  select classroom_id into source_classroom
  from public.assessments where id = source.assessment_id;
  select classroom_id into destination_classroom
  from public.assessments where id = target_assessment;
  if destination_classroom is null then raise exception 'Destination assessment not found'; end if;
  if not public.is_classroom_teacher(source_classroom) then
    raise exception 'You do not teach the source classroom';
  end if;
  if not public.is_classroom_teacher(destination_classroom) then
    raise exception 'You do not teach the destination classroom';
  end if;

  insert into public.questions(
    assessment_id, question_type, prompt, question_data, question_order
  ) values (
    target_assessment,
    source.question_type,
    source.prompt,
    source.question_data,
    coalesce((select max(question_order) + 1 from public.questions where assessment_id = target_assessment), 1)
  ) returning * into duplicate;

  return duplicate;
end;
$$;

revoke all on function public.duplicate_question(uuid, uuid) from public, anon;
grant execute on function public.duplicate_question(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
