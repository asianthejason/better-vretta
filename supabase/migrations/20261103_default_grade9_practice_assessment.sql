begin;

-- A durable snapshot of the canonical example. Copies belong to each class,
-- so teachers can edit or delete them without affecting anybody else.
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

alter table public.assessments add column if not exists template_key text;
create unique index if not exists assessments_one_template_per_class
on public.assessments(classroom_id, template_key)
where template_key is not null;

insert into public.default_assessment_templates(template_key, title, description, formula_sheet)
select
  'grade-9-math-practice-b',
  assessment.title,
  coalesce(assessment.description, 'An editable example assessment. You can change or delete it.'),
  coalesce(assessment.formula_sheet, '{}'::jsonb)
from public.assessments assessment
where assessment.id = '9172cd6c-e319-40a3-821e-84a6c365508b'
on conflict (template_key) do update set
  title = excluded.title,
  description = excluded.description,
  formula_sheet = excluded.formula_sheet;

insert into public.default_assessment_template_questions(
  template_key, question_order, question_type, prompt, question_data
)
select
  'grade-9-math-practice-b',
  question.question_order,
  question.question_type,
  coalesce(question.prompt, ''),
  question.question_data
from public.questions question
where question.assessment_id = '9172cd6c-e319-40a3-821e-84a6c365508b'
on conflict (template_key, question_order) do update set
  question_type = excluded.question_type,
  prompt = excluded.prompt,
  question_data = excluded.question_data;

-- Treat the original as the example for its existing classroom rather than
-- creating a duplicate there.
update public.assessments
set template_key = 'grade-9-math-practice-b'
where id = '9172cd6c-e319-40a3-821e-84a6c365508b'
  and template_key is null;

-- Copies created by the server fallback before this migration was installed
-- use the canonical title. Adopt one per class so backfill stays duplicate-free.
with candidates as (
  select assessment.id,
    row_number() over (partition by assessment.classroom_id order by assessment.created_at) as position
  from public.assessments assessment
  join public.default_assessment_templates template
    on template.template_key = 'grade-9-math-practice-b'
    and assessment.title = template.title
  where assessment.template_key is null
)
update public.assessments assessment
set template_key = 'grade-9-math-practice-b'
from candidates
where assessment.id = candidates.id and candidates.position = 1;

create or replace function public.add_default_assessments(target_classroom uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  template record;
  example_assessment_id uuid;
  classroom_owner uuid;
begin
  select teacher_id into classroom_owner
  from public.classrooms where id = target_classroom;
  if classroom_owner is null then return; end if;

  for template in select * from public.default_assessment_templates loop
    if exists (
      select 1 from public.assessments
      where classroom_id = target_classroom and template_key = template.template_key
    ) then continue; end if;

    insert into public.assessments(
      teacher_id, classroom_id, title, description, formula_sheet,
      assessment_code, is_published, template_key
    ) values (
      classroom_owner, target_classroom, template.title, template.description, template.formula_sheet,
      substr(upper(md5(gen_random_uuid()::text)), 1, 6), false, template.template_key
    ) returning id into example_assessment_id;

    insert into public.questions(
      assessment_id, question_order, question_type, prompt, question_data
    )
    select
      example_assessment_id, question_order, question_type, prompt, question_data
    from public.default_assessment_template_questions
    where template_key = template.template_key
    order by question_order;
  end loop;
end;
$$;

create or replace function public.add_default_assessments_to_classroom()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_default_assessments(new.id);
  return new;
end;
$$;

drop trigger if exists classrooms_add_default_assessments on public.classrooms;
create trigger classrooms_add_default_assessments
after insert on public.classrooms
for each row execute function public.add_default_assessments_to_classroom();

-- Backfill every existing class. The function is idempotent and the unique
-- index prevents duplicates if this migration is retried.
do $$
declare classroom record;
begin
  for classroom in select * from public.classrooms loop
    perform public.add_default_assessments(classroom.id);
  end loop;
end;
$$;

revoke all on public.default_assessment_templates from public, anon, authenticated;
revoke all on public.default_assessment_template_questions from public, anon, authenticated;
revoke all on function public.add_default_assessments(uuid) from public, anon, authenticated;
revoke all on function public.add_default_assessments_to_classroom() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
