-- Run this migration in the Supabase SQL editor before using classroom features.
create type public.user_role as enum ('teacher', 'student');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'student'));
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table public.classroom_students (
  classroom_id uuid references public.classrooms(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, student_id)
);
create table public.classroom_assessments (
  classroom_id uuid references public.classrooms(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete cascade,
  allow_all_students boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (classroom_id, assessment_id)
);
create table public.assessment_student_access (
  classroom_id uuid not null,
  assessment_id uuid not null,
  student_id uuid references public.profiles(id) on delete cascade,
  allowed boolean not null default true,
  primary key (classroom_id, assessment_id, student_id),
  foreign key (classroom_id, assessment_id) references public.classroom_assessments(classroom_id, assessment_id) on delete cascade
);
alter table public.student_attempts add column if not exists student_id uuid references public.profiles(id) on delete set null;

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_students enable row level security;
alter table public.classroom_assessments enable row level security;
alter table public.assessment_student_access enable row level security;

create policy "read own profile" on public.profiles for select using (id = auth.uid());
create policy "teachers read enrolled profiles" on public.profiles for select using (exists (select 1 from public.classroom_students cs join public.classrooms c on c.id=cs.classroom_id where cs.student_id=profiles.id and c.teacher_id=auth.uid()));
create policy "teachers manage classrooms" on public.classrooms for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy "students read their classrooms" on public.classrooms for select using (exists (select 1 from public.classroom_students cs where cs.classroom_id=id and cs.student_id=auth.uid()));
create policy "teachers manage rosters" on public.classroom_students for all using (exists (select 1 from public.classrooms c where c.id=classroom_id and c.teacher_id=auth.uid())) with check (exists (select 1 from public.classrooms c where c.id=classroom_id and c.teacher_id=auth.uid()));
create policy "students read own membership" on public.classroom_students for select using (student_id=auth.uid());
create policy "teachers manage assignments" on public.classroom_assessments for all using (exists (select 1 from public.classrooms c where c.id=classroom_id and c.teacher_id=auth.uid())) with check (exists (select 1 from public.classrooms c where c.id=classroom_id and c.teacher_id=auth.uid()));
create policy "students read assignments" on public.classroom_assessments for select using (exists (select 1 from public.classroom_students cs where cs.classroom_id=classroom_id and cs.student_id=auth.uid()));
create policy "teachers manage access" on public.assessment_student_access for all using (exists (select 1 from public.classrooms c where c.id=classroom_id and c.teacher_id=auth.uid())) with check (exists (select 1 from public.classrooms c where c.id=classroom_id and c.teacher_id=auth.uid()));
create policy "students read own access" on public.assessment_student_access for select using (student_id=auth.uid());

create or replace function public.add_student_to_classroom(target_classroom uuid, student_email text)
returns void language plpgsql security definer set search_path=public as $$
declare target_student uuid;
begin
  if not exists(select 1 from classrooms where id=target_classroom and teacher_id=auth.uid()) then raise exception 'Not authorized'; end if;
  select id into target_student from profiles where lower(email)=lower(trim(student_email)) and role='student';
  if target_student is null then raise exception 'No student account uses that email'; end if;
  insert into classroom_students(classroom_id,student_id) values(target_classroom,target_student) on conflict do nothing;
end; $$;

create or replace function public.can_access_assessment(target_assessment uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from classroom_assessments ca join classroom_students cs on cs.classroom_id=ca.classroom_id
    where ca.assessment_id=target_assessment and cs.student_id=auth.uid()
      and (ca.allow_all_students or exists(select 1 from assessment_student_access asa where asa.classroom_id=ca.classroom_id and asa.assessment_id=ca.assessment_id and asa.student_id=auth.uid() and asa.allowed))
  );
$$;
