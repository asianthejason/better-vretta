begin;

-- Store the Sort into Groups template outside teacher-owned assessments so it
-- survives deletion of every user-visible assessment and question.
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

insert into public.default_assessment_templates(template_key, title, description, formula_sheet)
values (
  'variation-sort-into-groups',
  'Variation Within and Between Species',
  'Built-in Sort into Groups question template.',
  '{}'::jsonb
)
on conflict (template_key) do update set
  title = excluded.title,
  description = excluded.description;

insert into public.default_assessment_template_questions(
  template_key, question_order, question_type, prompt, question_data
)
select
  'variation-sort-into-groups', 1, question.question_type,
  coalesce(question.prompt, ''), question.question_data
from public.questions question
where question.id = 'f33a8b0e-c4cf-4b98-b6df-d860ec7b37d2'
  and question.question_type = 'sort-into-groups'
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
  if not exists (
    select 1 from public.default_assessment_template_questions
    where template_key = 'variation-sort-into-groups'
      and question_type = 'sort-into-groups'
  ) then
    raise exception 'Could not snapshot the built-in Sort into Groups template';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
