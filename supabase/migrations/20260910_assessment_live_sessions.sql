begin;

-- Publishing makes an assessment visible. A separate live state controls when
-- students may load questions and submit answers.
alter table public.assessments alter column is_published set default false;
update public.assessments set is_published = false where is_published is null;
alter table public.assessments alter column is_published set not null;

create or replace function public.enforce_teacher_assessment_author() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (
    new.teacher_id is distinct from auth.uid()
    or not exists (select 1 from public.profiles where id=auth.uid() and role='teacher')
  ) then raise exception 'Only teacher accounts can create assessments'; end if;
  return new;
end;
$$;
drop trigger if exists assessments_require_teacher_author on public.assessments;
create trigger assessments_require_teacher_author before insert or update of teacher_id on public.assessments
for each row execute function public.enforce_teacher_assessment_author();

create table if not exists public.assessment_runs (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'live', 'ended')),
  started_at timestamptz,
  ended_at timestamptz,
  started_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.assessment_runs (assessment_id)
select id from public.assessments
on conflict (assessment_id) do nothing;

create or replace function public.create_assessment_run() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.assessment_runs (assessment_id) values (new.id)
  on conflict (assessment_id) do nothing;
  return new;
end;
$$;
drop trigger if exists assessments_create_run on public.assessments;
create trigger assessments_create_run after insert on public.assessments
for each row execute function public.create_assessment_run();

create or replace function public.sync_assessment_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_published = old.is_published then return new; end if;
  if new.is_published then
    update public.assessment_runs set status='waiting', started_at=null, ended_at=null, updated_at=now()
    where assessment_id=new.id;
  else
    update public.assessment_runs set status='ended', ended_at=now(), updated_at=now()
    where assessment_id=new.id;
    update public.assessment_sessions set status='waiting'
    where assessment_id=new.id and status='active';
  end if;
  return new;
end;
$$;
drop trigger if exists assessments_sync_publication on public.assessments;
create trigger assessments_sync_publication after update of is_published on public.assessments
for each row execute function public.sync_assessment_publication();

alter table public.assessment_sessions
  add column if not exists status text not null default 'waiting' check (status in ('waiting', 'active', 'blocked', 'submitted')),
  add column if not exists admitted_at timestamptz,
  add column if not exists blocked_at timestamptz,
  add column if not exists block_reason text;

update public.assessment_sessions session
set status = 'submitted'
where exists (
  select 1 from public.student_attempts attempt
  where attempt.assessment_id = session.assessment_id and attempt.student_id = session.student_id
);

alter table public.assessment_runs enable row level security;
drop policy if exists "teachers read their assessment runs" on public.assessment_runs;
create policy "teachers read their assessment runs" on public.assessment_runs for select
using (exists (
  select 1 from public.assessments assessment
  where assessment.id = assessment_runs.assessment_id
    and assessment.classroom_id is not null
    and public.is_classroom_teacher(assessment.classroom_id)
));
drop policy if exists "students read available assessment runs" on public.assessment_runs;
create policy "students read available assessment runs" on public.assessment_runs for select
using (public.can_access_assessment(assessment_id));
grant select on public.assessment_runs to authenticated;

drop function if exists public.start_assessment_session(uuid);
create function public.start_assessment_session(target_assessment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare run_status text;
begin
  if not exists (select 1 from public.assessments where id = target_assessment and is_published) then
    raise exception 'This assessment is not published';
  end if;
  if not public.can_access_assessment(target_assessment) then
    raise exception 'You do not have access to this assessment';
  end if;
  insert into public.assessment_runs (assessment_id) values (target_assessment)
  on conflict (assessment_id) do nothing;
  select status into run_status from public.assessment_runs where assessment_id = target_assessment;
  insert into public.assessment_sessions (assessment_id, student_id, status, admitted_at)
  values (target_assessment, auth.uid(), case when run_status = 'live' then 'active' else 'waiting' end,
    case when run_status = 'live' then now() else null end)
  on conflict (assessment_id, student_id) do update
  set last_activity_at = now(),
      status = case
        when assessment_sessions.status in ('blocked', 'submitted') then assessment_sessions.status
        when run_status = 'live' then 'active'
        else 'waiting'
      end,
      admitted_at = case
        when assessment_sessions.status in ('blocked', 'submitted') then assessment_sessions.admitted_at
        when run_status = 'live' then coalesce(assessment_sessions.admitted_at, now())
        else assessment_sessions.admitted_at
      end;
end;
$$;

create or replace function public.assessment_entry_state(target_assessment uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'runStatus', run.status,
    'studentStatus', session.status,
    'blockReason', session.block_reason,
    'kickCount', session.kick_count
  )
  from public.assessment_runs run
  join public.assessment_sessions session on session.assessment_id = run.assessment_id
  where run.assessment_id = target_assessment and session.student_id = auth.uid()
    and public.can_access_assessment(target_assessment);
$$;

create or replace function public.start_assessment_run(target_assessment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.assessments assessment
    where assessment.id = target_assessment and assessment.is_published
      and assessment.classroom_id is not null and public.is_classroom_teacher(assessment.classroom_id)
      and public.teacher_has_access(auth.uid())
  ) then raise exception 'Only a classroom teacher can start a published assessment'; end if;
  if not exists (select 1 from public.questions where assessment_id=target_assessment) then
    raise exception 'Add at least one question before starting the assessment';
  end if;
  insert into public.assessment_runs (assessment_id, status, started_at, ended_at, started_by, updated_at)
  values (target_assessment, 'live', now(), null, auth.uid(), now())
  on conflict (assessment_id) do update set status='live', started_at=now(), ended_at=null,
    started_by=auth.uid(), updated_at=now();
  update public.assessment_sessions set status='active', admitted_at=now(), block_reason=null
  where assessment_id=target_assessment and status='waiting';
end;
$$;

create or replace function public.end_assessment_run(target_assessment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.assessments assessment where assessment.id=target_assessment
      and assessment.classroom_id is not null and public.is_classroom_teacher(assessment.classroom_id)
  ) then raise exception 'Only a classroom teacher can end this assessment'; end if;
  update public.assessment_runs set status='ended', ended_at=now(), updated_at=now()
  where assessment_id=target_assessment;
  update public.assessment_sessions set status='waiting'
  where assessment_id=target_assessment and status='active';
end;
$$;

create or replace function public.grant_assessment_reentry(target_assessment uuid, target_student uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare run_status text;
begin
  if not exists (
    select 1 from public.assessments assessment where assessment.id=target_assessment
      and assessment.classroom_id is not null and public.is_classroom_teacher(assessment.classroom_id)
      and public.teacher_has_access(auth.uid())
  ) then raise exception 'Only a classroom teacher can grant access'; end if;
  select status into run_status from public.assessment_runs where assessment_id=target_assessment;
  if run_status <> 'live' then raise exception 'Start the assessment before granting access'; end if;
  update public.assessment_sessions set status='active', admitted_at=now(), blocked_at=null,
    block_reason=null, last_activity_at=now()
  where assessment_id=target_assessment and student_id=target_student and status='blocked';
  if not found then raise exception 'This student is not waiting for re-entry'; end if;
end;
$$;

create or replace function public.record_assessment_kick(target_assessment uuid, seconds_to_add integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.assessment_sessions
  set active_seconds = active_seconds + greatest(0, least(seconds_to_add, 60)),
      kick_count = kick_count + 1,
      status = 'blocked',
      blocked_at = now(),
      block_reason = 'Tried to leave lockdown browser',
      last_activity_at = now()
  where assessment_id = target_assessment and student_id = auth.uid()
    and status in ('waiting', 'active');
  if not found then raise exception 'Assessment session is not active'; end if;
end;
$$;

create or replace function public.complete_assessment_session(target_assessment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.assessment_sessions set status='submitted', last_activity_at=now()
  where assessment_id=target_assessment and student_id=auth.uid() and status='active';
  if not found then raise exception 'Assessment access is not active'; end if;
end;
$$;

create or replace function public.enforce_live_assessment_attempt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists (select 1 from public.profiles where id=auth.uid() and role='student') then
    if new.student_id is distinct from auth.uid() or not exists (
      select 1 from public.assessment_sessions session
      join public.assessment_runs run on run.assessment_id=session.assessment_id
      join public.assessments assessment on assessment.id=session.assessment_id
      where session.assessment_id=new.assessment_id and session.student_id=auth.uid()
        and session.status='active' and run.status='live' and assessment.is_published
    ) then raise exception 'The teacher has not opened this assessment for you'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists require_live_assessment_attempt on public.student_attempts;
create trigger require_live_assessment_attempt before insert or update on public.student_attempts
for each row execute function public.enforce_live_assessment_attempt();

create or replace function public.enforce_live_assessment_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists (select 1 from public.profiles where id=auth.uid() and role='student')
    and not exists (
      select 1 from public.student_attempts attempt
      join public.assessment_sessions session on session.assessment_id=attempt.assessment_id and session.student_id=attempt.student_id
      join public.assessment_runs run on run.assessment_id=attempt.assessment_id
      join public.assessments assessment on assessment.id=attempt.assessment_id
      where attempt.id=new.attempt_id and attempt.student_id=auth.uid()
        and session.status='active' and run.status='live' and assessment.is_published
    ) then raise exception 'Assessment access is not active'; end if;
  return new;
end;
$$;
drop trigger if exists require_live_assessment_answer on public.student_answers;
create trigger require_live_assessment_answer before insert or update on public.student_answers
for each row execute function public.enforce_live_assessment_answer();

-- Existing question policies still decide which records a user owns or may
-- access. This restrictive policy additionally withholds student questions
-- until both the run and the individual session are active.
alter table public.questions enable row level security;
drop policy if exists "students require live assessment access" on public.questions;
create policy "students require live assessment access" on public.questions as restrictive for select
using (
  exists (select 1 from public.profiles where id=auth.uid() and role='teacher')
  or exists (
    select 1 from public.assessment_sessions session
    join public.assessment_runs run on run.assessment_id=session.assessment_id
    join public.assessments assessment on assessment.id=session.assessment_id
    where session.assessment_id=questions.assessment_id and session.student_id=auth.uid()
      and session.status='active' and run.status='live' and assessment.is_published
  )
);

revoke all on function public.create_assessment_run() from public, anon, authenticated;
revoke all on function public.sync_assessment_publication() from public, anon, authenticated;
revoke all on function public.enforce_teacher_assessment_author() from public, anon, authenticated;
revoke all on function public.start_assessment_session(uuid) from public, anon;
revoke all on function public.assessment_entry_state(uuid) from public, anon;
revoke all on function public.start_assessment_run(uuid) from public, anon;
revoke all on function public.end_assessment_run(uuid) from public, anon;
revoke all on function public.grant_assessment_reentry(uuid,uuid) from public, anon;
revoke all on function public.record_assessment_kick(uuid,integer) from public, anon;
revoke all on function public.complete_assessment_session(uuid) from public, anon;
revoke all on function public.enforce_live_assessment_attempt() from public, anon, authenticated;
revoke all on function public.enforce_live_assessment_answer() from public, anon, authenticated;
grant execute on function public.start_assessment_session(uuid) to authenticated;
grant execute on function public.assessment_entry_state(uuid) to authenticated;
grant execute on function public.start_assessment_run(uuid) to authenticated;
grant execute on function public.end_assessment_run(uuid) to authenticated;
grant execute on function public.grant_assessment_reentry(uuid,uuid) to authenticated;
grant execute on function public.record_assessment_kick(uuid,integer) to authenticated;
grant execute on function public.complete_assessment_session(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
