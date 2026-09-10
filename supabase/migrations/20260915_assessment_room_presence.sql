begin;

-- Presence is intentionally separate from active_seconds. Students send this
-- heartbeat from the waiting room and assessment so teachers can distinguish
-- a current participant from a durable, historical session record.
create or replace function public.record_assessment_presence(target_assessment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_sessions
  set last_activity_at = now()
  where assessment_id = target_assessment
    and student_id = auth.uid()
    and status in ('waiting', 'active', 'blocked');

  if not found then
    raise exception 'Assessment session not found';
  end if;
end;
$$;

revoke all on function public.record_assessment_presence(uuid) from public, anon;
grant execute on function public.record_assessment_presence(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
