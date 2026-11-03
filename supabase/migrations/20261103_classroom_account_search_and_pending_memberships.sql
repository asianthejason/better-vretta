-- Account autocomplete and invitations that become roster memberships after signup.
create table public.pending_classroom_memberships (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  email text not null,
  role public.user_role not null,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (classroom_id, email, role),
  check (email = lower(trim(email)))
);

alter table public.pending_classroom_memberships enable row level security;

create policy "teachers read pending classroom memberships"
on public.pending_classroom_memberships for select
using (
  public.is_classroom_teacher(classroom_id)
  and (role = 'student' or public.is_classroom_owner(classroom_id))
);

create or replace function public.search_accounts(search_text text, account_role public.user_role)
returns table (id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.email, profile.full_name
  from public.profiles profile
  where length(trim(search_text)) >= 3
    and profile.role = account_role
    and (profile.email ilike '%' || trim(search_text) || '%'
      or profile.full_name ilike '%' || trim(search_text) || '%')
    and exists (
      select 1 from public.profiles caller
      where caller.id = auth.uid() and caller.role = 'teacher'
    )
  order by
    case when lower(profile.email) like lower(trim(search_text)) || '%' then 0 else 1 end,
    profile.email
  limit 8;
$$;

drop function if exists public.add_student_to_classroom(uuid, text);
create function public.add_student_to_classroom(target_classroom uuid, student_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(student_email));
  target_student uuid;
begin
  if not public.is_classroom_teacher(target_classroom) then raise exception 'Not authorized'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;

  select id into target_student from public.profiles
  where lower(email) = normalized_email and role = 'student';

  if target_student is not null then
    insert into public.classroom_students(classroom_id, student_id)
    values(target_classroom, target_student) on conflict do nothing;
    delete from public.pending_classroom_memberships
    where classroom_id = target_classroom and email = normalized_email and role = 'student';
    return 'added';
  end if;

  insert into public.pending_classroom_memberships(classroom_id, email, role, invited_by)
  values(target_classroom, normalized_email, 'student', auth.uid()) on conflict do nothing;
  return 'pending';
end;
$$;

drop function if exists public.add_teacher_to_classroom(uuid, text);
create function public.add_teacher_to_classroom(target_classroom uuid, teacher_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(teacher_email));
  target_teacher uuid;
begin
  if not public.is_classroom_owner(target_classroom) then
    raise exception 'Only the classroom owner can add teachers';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;

  select id into target_teacher from public.profiles
  where lower(email) = normalized_email and role = 'teacher';

  if target_teacher is not null then
    insert into public.classroom_teachers(classroom_id, teacher_id, is_owner)
    values(target_classroom, target_teacher, false) on conflict do nothing;
    delete from public.pending_classroom_memberships
    where classroom_id = target_classroom and email = normalized_email and role = 'teacher';
    return 'added';
  end if;

  insert into public.pending_classroom_memberships(classroom_id, email, role, invited_by)
  values(target_classroom, normalized_email, 'teacher', auth.uid()) on conflict do nothing;
  return 'pending';
end;
$$;

create or replace function public.remove_pending_classroom_membership(
  target_classroom uuid,
  target_email text,
  target_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_role = 'teacher' and not public.is_classroom_owner(target_classroom) then
    raise exception 'Only the classroom owner can remove pending teachers';
  elsif target_role = 'student' and not public.is_classroom_teacher(target_classroom) then
    raise exception 'Not authorized';
  end if;

  delete from public.pending_classroom_memberships
  where classroom_id = target_classroom
    and email = lower(trim(target_email))
    and role = target_role;
end;
$$;

create or replace function public.fulfill_pending_classroom_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending record;
begin
  for pending in
    select classroom_id, email, role
    from public.pending_classroom_memberships
    where email = lower(trim(new.email)) and role = new.role
  loop
    begin
      if new.role = 'student' then
        insert into public.classroom_students(classroom_id, student_id)
        values(pending.classroom_id, new.id) on conflict do nothing;
      else
        insert into public.classroom_teachers(classroom_id, teacher_id, is_owner)
        values(pending.classroom_id, new.id, false) on conflict do nothing;
      end if;

      delete from public.pending_classroom_memberships
      where classroom_id = pending.classroom_id and email = pending.email and role = pending.role;
    exception when others then
      -- Keep the invitation when a membership constraint (such as a plan limit)
      -- prevents fulfillment; account creation must never be rolled back.
      null;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_fulfill_pending_classroom_memberships on public.profiles;
create trigger profiles_fulfill_pending_classroom_memberships
after insert or update of email, role on public.profiles
for each row execute function public.fulfill_pending_classroom_memberships();

revoke all on function public.search_accounts(text, public.user_role) from public;
revoke all on function public.add_student_to_classroom(uuid, text) from public;
revoke all on function public.add_teacher_to_classroom(uuid, text) from public;
revoke all on function public.remove_pending_classroom_membership(uuid, text, public.user_role) from public;
revoke all on function public.fulfill_pending_classroom_memberships() from public;
grant execute on function public.search_accounts(text, public.user_role) to authenticated;
grant execute on function public.add_student_to_classroom(uuid, text) to authenticated;
grant execute on function public.add_teacher_to_classroom(uuid, text) to authenticated;
grant execute on function public.remove_pending_classroom_membership(uuid, text, public.user_role) to authenticated;

notify pgrst, 'reload schema';
