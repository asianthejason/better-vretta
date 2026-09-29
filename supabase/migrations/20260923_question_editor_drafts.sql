begin;

-- Unpublished work is separate from the student-readable questions table.
-- Publishing retains a tombstone so an offline copy cannot resurrect an old draft.
create table if not exists public.question_drafts (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published')),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists question_drafts_assessment_owner_idx
  on public.question_drafts(assessment_id, owner_id);
alter table public.question_drafts enable row level security;
create policy "teachers manage their question drafts" on public.question_drafts for all
  using (owner_id = auth.uid() and (exists (select 1 from public.assessments a where a.id = assessment_id and (a.teacher_id = auth.uid() or public.is_classroom_teacher(a.classroom_id)))))
  with check (owner_id = auth.uid() and (exists (select 1 from public.assessments a where a.id = assessment_id and (a.teacher_id = auth.uid() or public.is_classroom_teacher(a.classroom_id))))
    and (question_id is null or exists (
      select 1 from public.questions q where q.id = question_id and q.assessment_id = question_drafts.assessment_id
    )));
grant select, insert, update, delete on public.question_drafts to authenticated;

-- Ignore stale retries from another tab or a reconnecting device.
create function public.keep_newest_question_draft() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.updated_at <= old.updated_at then return null; end if;
  return new;
end;
$$;
create trigger question_drafts_keep_newest before update on public.question_drafts
  for each row execute function public.keep_newest_question_draft();

notify pgrst, 'reload schema';
commit;
