begin;

-- Built-in templates live outside teacher-owned assessments so classroom or
-- assessment deletion can never remove the template library.
create table if not exists public.default_assessment_templates (
  template_key text primary key,
  title text not null,
  description text,
  formula_sheet jsonb not null default '{}'::jsonb
);

create table if not exists public.default_assessment_template_questions (
  template_key text not null references public.default_assessment_templates(template_key) on delete cascade,
  question_order integer not null,
  question_type text not null,
  prompt text not null default '',
  question_data jsonb not null default '{}'::jsonb,
  primary key (template_key, question_order)
);

-- The original source assessment was deleted after copies had already been
-- created. Snapshot the oldest complete surviving copy. These rows remain
-- independent if every user-visible copy is later edited or deleted.
with source as (
  select assessment.id, assessment.title, assessment.description, assessment.formula_sheet
  from public.assessments assessment
  where assessment.title = 'Grade 9 Practice Test - Mathematics - Part B'
    and (
      select count(*) from public.questions question
      where question.assessment_id = assessment.id
        and question.question_order in (1, 2, 3, 4, 5, 7, 8, 11, 12, 13, 16, 18, 19, 21, 22)
    ) = 15
  order by assessment.created_at, assessment.id
  limit 1
)
insert into public.default_assessment_templates(template_key, title, description, formula_sheet)
select
  'grade-9-math-practice-b', title, description, coalesce(formula_sheet, '{}'::jsonb)
from source
on conflict (template_key) do update set
  title = excluded.title,
  description = excluded.description,
  formula_sheet = excluded.formula_sheet;

with source as (
  select assessment.id
  from public.assessments assessment
  where assessment.title = 'Grade 9 Practice Test - Mathematics - Part B'
    and (
      select count(*) from public.questions question
      where question.assessment_id = assessment.id
        and question.question_order in (1, 2, 3, 4, 5, 7, 8, 11, 12, 13, 16, 18, 19, 21, 22)
    ) = 15
  order by assessment.created_at, assessment.id
  limit 1
)
insert into public.default_assessment_template_questions(
  template_key, question_order, question_type, prompt, question_data
)
select
  'grade-9-math-practice-b', question.question_order, question.question_type,
  coalesce(question.prompt, ''), question.question_data
from public.questions question
join source on source.id = question.assessment_id
where question.question_order in (1, 2, 3, 4, 5, 7, 8, 11, 12, 13, 16, 18, 19, 21, 22)
on conflict (template_key, question_order) do update set
  question_type = excluded.question_type,
  prompt = excluded.prompt,
  question_data = excluded.question_data;

alter table public.default_assessment_templates enable row level security;
alter table public.default_assessment_template_questions enable row level security;
revoke all on public.default_assessment_templates from public, anon, authenticated;
revoke all on public.default_assessment_template_questions from public, anon, authenticated;

do $$
begin
  if (select count(*) from public.default_assessment_template_questions where template_key = 'grade-9-math-practice-b') <> 15 then
    raise exception 'Could not snapshot all 15 built-in question templates';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
