begin;

-- The protected-template repair can be applied independently of the original
-- default-assessment migration. Ensure classroom copies can still record which
-- protected template they came from.
alter table public.assessments add column if not exists template_key text;

create unique index if not exists assessments_one_template_per_class
on public.assessments(classroom_id, template_key)
where template_key is not null;

notify pgrst, 'reload schema';
commit;
