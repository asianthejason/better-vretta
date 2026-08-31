-- One-time ownership transfer from Jason's original email/password account
-- to Jason's current Google teacher account.
-- This is deliberately explicit because both authentication accounts are active.
-- Assessments used to reference the legacy public.users table. The current app
-- uses public.profiles as its canonical teacher identity table, as classrooms do.
alter table public.assessments
drop constraint if exists assessments_teacher_id_fkey;

alter table public.assessments
add constraint assessments_teacher_id_fkey
foreign key (teacher_id)
references public.profiles(id)
on delete cascade;

do $$
declare
  current_teacher uuid;
begin
  select teacher_id into current_teacher
  from public.classrooms
  where lower(trim(name)) = lower('Math 8C')
  order by created_at desc
  limit 1;

  if current_teacher is null then
    raise exception 'Could not find the Math 8C classroom';
  end if;

  update public.assessments
  set teacher_id = current_teacher
  where teacher_id = 'ce49fef0-752d-4edd-8fdb-da1db7859629'::uuid;
end;
$$;

notify pgrst, 'reload schema';
