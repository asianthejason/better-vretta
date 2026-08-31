-- Makes a classroom the owning container for each assessment.
alter table public.assessments
add column if not exists classroom_id uuid references public.classrooms(id) on delete cascade;

-- Preserve classroom assignments created before classroom_id existed on assessments.
with latest_classroom_assignment as (
  select distinct on (assessment_id)
    assessment_id,
    classroom_id
  from public.classroom_assessments
  order by assessment_id, assigned_at desc
)
update public.assessments as assessment
set classroom_id = assignment.classroom_id
from latest_classroom_assignment as assignment
where assessment.id = assignment.assessment_id
  and assessment.classroom_id is null;

create index if not exists assessments_classroom_id_idx on public.assessments(classroom_id);

create or replace function public.enforce_assessment_classroom_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_id uuid;
begin
  if new.classroom_id is null then
    return new; -- permits legacy assessments until they are assigned
  end if;
  select teacher_id into owner_id from public.classrooms where id = new.classroom_id;
  if owner_id is null then raise exception 'Classroom not found'; end if;
  if owner_id <> auth.uid() then raise exception 'You do not own this classroom'; end if;
  new.teacher_id := owner_id;
  return new;
end;
$$;

drop trigger if exists assessments_enforce_classroom_owner on public.assessments;
create trigger assessments_enforce_classroom_owner
before insert or update of classroom_id on public.assessments
for each row execute function public.enforce_assessment_classroom_owner();

create or replace function public.assign_new_assessment_to_classroom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.classroom_id is not null then
    insert into public.classroom_assessments(classroom_id, assessment_id, allow_all_students)
    values(new.classroom_id, new.id, true)
    on conflict (classroom_id, assessment_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists assessments_auto_assign_classroom on public.assessments;
create trigger assessments_auto_assign_classroom
after insert or update of classroom_id on public.assessments
for each row execute function public.assign_new_assessment_to_classroom();
