begin;

create table if not exists public.assessment_draft_answers (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (assessment_id, student_id, question_id)
);

alter table public.assessment_draft_answers enable row level security;
revoke all on table public.assessment_draft_answers from public, anon, authenticated;

create or replace function public.save_assessment_draft_answers(target_assessment uuid, answer_batch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  draft_record jsonb;
  target_question uuid;
begin
  if jsonb_typeof(answer_batch) <> 'array' then
    raise exception 'Draft answers must be an array';
  end if;

  if not exists (
    select 1
    from public.assessment_sessions session
    join public.assessment_runs run on run.assessment_id=session.assessment_id
    join public.assessments assessment on assessment.id=session.assessment_id
    where session.assessment_id=target_assessment and session.student_id=auth.uid()
      and session.status='active' and run.status='live' and assessment.is_published
  ) then raise exception 'Assessment access is not active'; end if;

  for draft_record in select value from jsonb_array_elements(answer_batch)
  loop
    target_question := (draft_record->>'question_id')::uuid;
    if not exists (
      select 1 from public.questions question
      where question.id=target_question and question.assessment_id=target_assessment
    ) then raise exception 'Draft answer does not belong to this assessment'; end if;

    insert into public.assessment_draft_answers (assessment_id, student_id, question_id, answer_data, updated_at)
    values (target_assessment, auth.uid(), target_question, coalesce(draft_record->'answer_data', '{}'::jsonb), now())
    on conflict (assessment_id, student_id, question_id) do update
    set answer_data=excluded.answer_data, updated_at=excluded.updated_at;
  end loop;
end;
$$;

create or replace function public.load_assessment_draft_answers(target_assessment uuid)
returns table (question_id uuid, answer_data jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_assessment(target_assessment) then
    raise exception 'You do not have access to this assessment';
  end if;

  return query
  select draft.question_id, draft.answer_data, draft.updated_at
  from public.assessment_draft_answers draft
  where draft.assessment_id=target_assessment and draft.student_id=auth.uid();
end;
$$;

create or replace function public.complete_assessment_session(target_assessment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.assessment_sessions set status='submitted', last_activity_at=now()
  where assessment_id=target_assessment and student_id=auth.uid() and status='active';
  if not found then raise exception 'Assessment access is not active'; end if;

  delete from public.assessment_draft_answers
  where assessment_id=target_assessment and student_id=auth.uid();
end;
$$;

revoke all on function public.save_assessment_draft_answers(uuid,jsonb) from public, anon;
revoke all on function public.load_assessment_draft_answers(uuid) from public, anon;
grant execute on function public.save_assessment_draft_answers(uuid,jsonb) to authenticated;
grant execute on function public.load_assessment_draft_answers(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
