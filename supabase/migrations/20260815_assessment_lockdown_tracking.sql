-- Tracks assessment attendance independently from submissions so first-open,
-- focused time, and lockdown exits are retained even before an attempt exists.
create table if not exists public.assessment_sessions (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  kick_count integer not null default 0 check (kick_count >= 0),
  last_activity_at timestamptz not null default now(),
  primary key (assessment_id, student_id)
);

alter table public.assessment_sessions enable row level security;

drop policy if exists "students read own assessment sessions" on public.assessment_sessions;
create policy "students read own assessment sessions"
on public.assessment_sessions for select
using (student_id = auth.uid());

drop policy if exists "teachers read classroom assessment sessions" on public.assessment_sessions;
create policy "teachers read classroom assessment sessions"
on public.assessment_sessions for select
using (
  exists (
    select 1
    from public.assessments assessment
    where assessment.id = assessment_sessions.assessment_id
      and assessment.classroom_id is not null
      and public.is_classroom_teacher(assessment.classroom_id)
  )
);

create or replace function public.start_assessment_session(target_assessment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_assessment(target_assessment) then
    raise exception 'You do not have access to this assessment';
  end if;

  insert into public.assessment_sessions (assessment_id, student_id)
  values (target_assessment, auth.uid())
  on conflict (assessment_id, student_id)
  do update set last_activity_at = now();
end;
$$;

create or replace function public.record_assessment_activity(
  target_assessment uuid,
  seconds_to_add integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assessment_sessions
  set active_seconds = active_seconds + greatest(0, least(seconds_to_add, 60)),
      last_activity_at = now()
  where assessment_id = target_assessment and student_id = auth.uid();

  if not found then
    raise exception 'Assessment session not found';
  end if;
end;
$$;

create or replace function public.record_assessment_kick(
  target_assessment uuid,
  seconds_to_add integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assessment_sessions
  set active_seconds = active_seconds + greatest(0, least(seconds_to_add, 60)),
      kick_count = kick_count + 1,
      last_activity_at = now()
  where assessment_id = target_assessment and student_id = auth.uid();

  if not found then
    raise exception 'Assessment session not found';
  end if;
end;
$$;

revoke all on function public.start_assessment_session(uuid) from public;
revoke all on function public.record_assessment_activity(uuid, integer) from public;
revoke all on function public.record_assessment_kick(uuid, integer) from public;
grant execute on function public.start_assessment_session(uuid) to authenticated;
grant execute on function public.record_assessment_activity(uuid, integer) to authenticated;
grant execute on function public.record_assessment_kick(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
