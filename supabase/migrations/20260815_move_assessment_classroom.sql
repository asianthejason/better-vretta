-- Moves an assessment between classrooms atomically after verifying ownership.
create or replace function public.move_assessment_to_classroom(
  target_assessment uuid,
  target_classroom uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  assessment_owner uuid;
begin
  select teacher_id into assessment_owner
  from public.assessments
  where id = target_assessment;

  if not found then
    raise exception 'Assessment not found';
  end if;

  if target_classroom is not null and not public.is_classroom_teacher(target_classroom) then
    raise exception 'Classroom not found or not taught by this teacher';
  end if;

  if assessment_owner is distinct from auth.uid() then
    if assessment_owner is not null and exists (
      select 1 from auth.users where id = assessment_owner
    ) then
      raise exception 'Assessment belongs to another active teacher account';
    end if;

    -- Reclaim assessments left behind by a deleted authentication account.
    update public.assessments
    set teacher_id = auth.uid()
    where id = target_assessment;
  end if;

  update public.assessments
  set classroom_id = target_classroom
  where id = target_assessment;

  delete from public.classroom_assessments
  where assessment_id = target_assessment
    and classroom_id is distinct from target_classroom;

  if target_classroom is not null then
    insert into public.classroom_assessments (
      classroom_id,
      assessment_id,
      allow_all_students
    )
    values (target_classroom, target_assessment, true)
    on conflict (classroom_id, assessment_id) do nothing;
  end if;
end;
$$;

revoke all on function public.move_assessment_to_classroom(uuid, uuid) from public;
grant execute on function public.move_assessment_to_classroom(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
