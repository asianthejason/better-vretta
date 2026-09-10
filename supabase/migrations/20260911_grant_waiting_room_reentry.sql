begin;

-- A lockdown violation can happen while a student is still waiting. Restore
-- that student to the state appropriate for the current assessment run.
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
  if run_status is null or run_status = 'ended' then
    raise exception 'Start the assessment again before granting access';
  end if;

  update public.assessment_sessions
  set status = case when run_status = 'live' then 'active' else 'waiting' end,
      admitted_at = case when run_status = 'live' then now() else null end,
      blocked_at = null,
      block_reason = null,
      last_activity_at = now()
  where assessment_id=target_assessment and student_id=target_student and status='blocked';

  if not found then raise exception 'This student is not waiting for re-entry'; end if;
end;
$$;

revoke all on function public.grant_assessment_reentry(uuid,uuid) from public, anon;
grant execute on function public.grant_assessment_reentry(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
