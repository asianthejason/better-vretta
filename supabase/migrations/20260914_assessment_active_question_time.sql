begin;

-- Count time only while the teacher's run is live and the student has access
-- to the assessment questions. Waiting-room time must never be billable as
-- assessment activity, even if an older client sends an activity heartbeat.
create or replace function public.record_assessment_activity(
  target_assessment uuid,
  seconds_to_add integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_sessions session
  set active_seconds = session.active_seconds + greatest(0, least(seconds_to_add, 60)),
      last_activity_at = now()
  from public.assessment_runs run
  where session.assessment_id = target_assessment
    and session.student_id = auth.uid()
    and session.status = 'active'
    and run.assessment_id = session.assessment_id
    and run.status = 'live';

  if not found then
    raise exception 'Assessment access is not active';
  end if;
end;
$$;

-- Lockdown begins in the waiting room, so a waiting student can still be
-- blocked. Only seconds collected while already active are added to the timer.
create or replace function public.record_assessment_kick(
  target_assessment uuid,
  seconds_to_add integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_sessions
  set active_seconds = active_seconds + case
        when status = 'active' then greatest(0, least(seconds_to_add, 60))
        else 0
      end,
      kick_count = kick_count + 1,
      status = 'blocked',
      blocked_at = now(),
      block_reason = 'Tried to leave lockdown browser',
      last_activity_at = now()
  where assessment_id = target_assessment
    and student_id = auth.uid()
    and status in ('waiting', 'active');

  if not found then
    raise exception 'Assessment session is not active';
  end if;
end;
$$;

revoke all on function public.record_assessment_activity(uuid,integer) from public, anon;
revoke all on function public.record_assessment_kick(uuid,integer) from public, anon;
grant execute on function public.record_assessment_activity(uuid,integer) to authenticated;
grant execute on function public.record_assessment_kick(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
