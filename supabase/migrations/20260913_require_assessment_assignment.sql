begin;

create or replace function public.enforce_assessment_classroom_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if new.classroom_id is null then
    raise exception 'Every assessment must be assigned to a classroom';
  end if;

  select teacher_id into owner_id from public.classrooms where id=new.classroom_id;
  if owner_id is null then raise exception 'Classroom not found'; end if;
  if auth.uid() is not null and not public.is_classroom_teacher(new.classroom_id) then
    raise exception 'You do not teach this classroom';
  end if;
  new.teacher_id := owner_id;
  return new;
end;
$$;

drop trigger if exists assessments_enforce_classroom_owner on public.assessments;
create trigger assessments_enforce_classroom_owner
before insert or update of classroom_id on public.assessments
for each row execute function public.enforce_assessment_classroom_owner();

create or replace function public.enforce_published_assessment_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_published and (
    new.classroom_id is null
    or not exists (
      select 1 from public.classroom_assessments assignment
      where assignment.classroom_id=new.classroom_id and assignment.assessment_id=new.id
    )
  ) then raise exception 'Assign this assessment to a classroom before publishing it'; end if;
  return new;
end;
$$;

drop trigger if exists assessments_require_assignment_to_publish on public.assessments;
create constraint trigger assessments_require_assignment_to_publish
after insert or update of is_published, classroom_id on public.assessments
deferrable initially deferred
for each row execute function public.enforce_published_assessment_assignment();

revoke all on function public.enforce_assessment_classroom_owner() from public, anon, authenticated;
revoke all on function public.enforce_published_assessment_assignment() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
