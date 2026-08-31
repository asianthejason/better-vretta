-- Fixes infinite RLS recursion between classrooms and classroom_students.
-- Safe to run after 20260814_classrooms.sql.

create or replace function public.is_classroom_teacher(target_classroom uuid)
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

create or replace function public.is_classroom_student(target_classroom uuid, target_student uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classroom_students
    where classroom_id = target_classroom and student_id = target_student
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
    select 1
    from public.classroom_students cs
    join public.classrooms c on c.id = cs.classroom_id
    where cs.student_id = target_student and c.teacher_id = auth.uid()
  );
$$;

revoke all on function public.is_classroom_teacher(uuid) from public;
revoke all on function public.is_classroom_student(uuid, uuid) from public;
revoke all on function public.teacher_can_view_student(uuid) from public;
grant execute on function public.is_classroom_teacher(uuid) to authenticated;
grant execute on function public.is_classroom_student(uuid, uuid) to authenticated;
grant execute on function public.teacher_can_view_student(uuid) to authenticated;

drop policy if exists "teachers read enrolled profiles" on public.profiles;
create policy "teachers read enrolled profiles" on public.profiles
for select using (public.teacher_can_view_student(id));

drop policy if exists "students read their classrooms" on public.classrooms;
create policy "students read their classrooms" on public.classrooms
for select using (public.is_classroom_student(id));

drop policy if exists "teachers manage rosters" on public.classroom_students;
create policy "teachers manage rosters" on public.classroom_students
for all using (public.is_classroom_teacher(classroom_id))
with check (public.is_classroom_teacher(classroom_id));

drop policy if exists "students read own membership" on public.classroom_students;
create policy "students read own membership" on public.classroom_students
for select using (student_id = auth.uid());

drop policy if exists "teachers manage assignments" on public.classroom_assessments;
create policy "teachers manage assignments" on public.classroom_assessments
for all using (public.is_classroom_teacher(classroom_id))
with check (public.is_classroom_teacher(classroom_id));

drop policy if exists "students read assignments" on public.classroom_assessments;
create policy "students read assignments" on public.classroom_assessments
for select using (public.is_classroom_student(classroom_id));

drop policy if exists "teachers manage access" on public.assessment_student_access;
create policy "teachers manage access" on public.assessment_student_access
for all using (public.is_classroom_teacher(classroom_id))
with check (public.is_classroom_teacher(classroom_id));
