begin;

-- The multiple-choice-only constraint from 20260817 remained active after
-- drag-and-drop questions were reintroduced. Remove it and keep one canonical
-- constraint for the two question types currently supported by the app.
alter table public.questions
drop constraint if exists questions_multiple_choice_only;

alter table public.questions
drop constraint if exists questions_question_type_check;

alter table public.questions
add constraint questions_question_type_check
check (question_type in ('multiple-choice', 'drag-and-drop'));

notify pgrst, 'reload schema';

commit;
