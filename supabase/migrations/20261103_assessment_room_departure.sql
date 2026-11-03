begin;

-- Let a student explicitly leave the room instead of waiting for heartbeat
-- expiry. The old timestamp keeps existing teacher clients compatible.
create or replace function public.leave_assessment_room(target_assessment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_sessions
  set last_activity_at = now() - interval '1 day'
  where assessment_id = target_assessment
    and student_id = auth.uid()
    and status <> 'submitted';
end;
$$;

revoke all on function public.leave_assessment_room(uuid) from public, anon;
grant execute on function public.leave_assessment_room(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
