-- Adds shareable classroom codes and a safe student self-enrollment function.
alter table public.classrooms
add column if not exists join_code text;

update public.classrooms
set join_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where join_code is null;

alter table public.classrooms
alter column join_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

alter table public.classrooms
alter column join_code set not null;

create unique index if not exists classrooms_join_code_key
on public.classrooms (join_code);

create or replace function public.join_classroom_by_code(classroom_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_classroom uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'student'
  ) then
    raise exception 'Only student accounts can join classrooms';
  end if;

  select id into target_classroom
  from public.classrooms
  where join_code = upper(trim(classroom_code));

  if target_classroom is null then
    raise exception 'Classroom code not found';
  end if;

  insert into public.classroom_students (classroom_id, student_id)
  values (target_classroom, auth.uid())
  on conflict do nothing;

  return target_classroom;
end;
$$;

revoke all on function public.join_classroom_by_code(text) from public;
grant execute on function public.join_classroom_by_code(text) to authenticated;

notify pgrst, 'reload schema';
