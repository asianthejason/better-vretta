-- Adds multiple teachers per classroom while retaining classrooms.teacher_id
-- as the permanent owner for compatibility and deletion authority.
create table if not exists public.classroom_teachers (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  is_owner boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, teacher_id)
);

insert into public.classroom_teachers (classroom_id, teacher_id, is_owner)
select id, teacher_id, true from public.classrooms
on conflict (classroom_id, teacher_id)
do update set is_owner = true;

alter table public.classroom_teachers enable row level security;

create or replace function public.is_classroom_teacher(target_classroom uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classroom_teachers
    where classroom_id = target_classroom and teacher_id = auth.uid()
  ) or exists (
    select 1 from public.classrooms
    where id = target_classroom and teacher_id = auth.uid()
  );
$$;

create or replace function public.is_classroom_owner(target_classroom uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classrooms
    where id = target_classroom and teacher_id = auth.uid()
  );
$$;

create or replace function public.teacher_can_view_student(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classroom_students cs
    where cs.student_id = target_student
      and public.is_classroom_teacher(cs.classroom_id)
  );
$$;

create or replace function public.teacher_can_view_teacher(target_teacher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_teacher = auth.uid() or exists (
    select 1
    from public.classroom_teachers mine
    join public.classroom_teachers theirs
      on theirs.classroom_id = mine.classroom_id
    where mine.teacher_id = auth.uid()
      and theirs.teacher_id = target_teacher
  );
$$;

revoke all on function public.is_classroom_owner(uuid) from public;
revoke all on function public.teacher_can_view_teacher(uuid) from public;
grant execute on function public.is_classroom_owner(uuid) to authenticated;
grant execute on function public.teacher_can_view_teacher(uuid) to authenticated;

drop policy if exists "classroom teachers read memberships" on public.classroom_teachers;
create policy "classroom teachers read memberships" on public.classroom_teachers
for select using (public.is_classroom_teacher(classroom_id));

drop policy if exists "owners manage teacher memberships" on public.classroom_teachers;
create policy "owners manage teacher memberships" on public.classroom_teachers
for all using (public.is_classroom_owner(classroom_id))
with check (public.is_classroom_owner(classroom_id));

drop policy if exists "co-teachers read classrooms" on public.classrooms;
create policy "co-teachers read classrooms" on public.classrooms
for select using (public.is_classroom_teacher(id));

drop policy if exists "teachers read fellow teacher profiles" on public.profiles;
create policy "teachers read fellow teacher profiles" on public.profiles
for select using (public.teacher_can_view_teacher(id));

create or replace function public.add_teacher_to_classroom(
  target_classroom uuid,
  teacher_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_teacher uuid;
begin
  if not public.is_classroom_owner(target_classroom) then
    raise exception 'Only the classroom owner can add teachers';
  end if;

  select id into target_teacher
  from public.profiles
  where lower(email) = lower(trim(teacher_email)) and role = 'teacher';

  if target_teacher is null then
    raise exception 'No teacher account uses that email';
  end if;

  insert into public.classroom_teachers (classroom_id, teacher_id, is_owner)
  values (target_classroom, target_teacher, false)
  on conflict do nothing;
end;
$$;

create or replace function public.remove_teacher_from_classroom(
  target_classroom uuid,
  target_teacher uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_classroom_owner(target_classroom) then
    raise exception 'Only the classroom owner can remove teachers';
  end if;

  if exists (
    select 1 from public.classrooms
    where id = target_classroom and teacher_id = target_teacher
  ) then
    raise exception 'The classroom owner cannot be removed';
  end if;

  delete from public.classroom_teachers
  where classroom_id = target_classroom and teacher_id = target_teacher;
end;
$$;

revoke all on function public.add_teacher_to_classroom(uuid, text) from public;
revoke all on function public.remove_teacher_from_classroom(uuid, uuid) from public;
grant execute on function public.add_teacher_to_classroom(uuid, text) to authenticated;
grant execute on function public.remove_teacher_from_classroom(uuid, uuid) to authenticated;

create or replace function public.sync_classroom_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.classroom_teachers (classroom_id, teacher_id, is_owner)
  values (new.id, new.teacher_id, true)
  on conflict (classroom_id, teacher_id) do update set is_owner = true;
  return new;
end;
$$;

drop trigger if exists classrooms_sync_owner_membership on public.classrooms;
create trigger classrooms_sync_owner_membership
after insert or update of teacher_id on public.classrooms
for each row execute function public.sync_classroom_owner_membership();

create or replace function public.add_student_to_classroom(target_classroom uuid, student_email text)
returns void language plpgsql security definer set search_path=public as $$
declare target_student uuid;
begin
  if not public.is_classroom_teacher(target_classroom) then raise exception 'Not authorized'; end if;
  select id into target_student from profiles where lower(email)=lower(trim(student_email)) and role='student';
  if target_student is null then raise exception 'No student account uses that email'; end if;
  insert into classroom_students(classroom_id,student_id) values(target_classroom,target_student) on conflict do nothing;
end; $$;

create or replace function public.enforce_assessment_classroom_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.classroom_id is null then
    return new;
  end if;

  if not public.is_classroom_teacher(new.classroom_id) then
    raise exception 'You do not teach this classroom';
  end if;

  if tg_op = 'INSERT' or new.teacher_id is null then
    new.teacher_id := auth.uid();
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
