begin;

alter table public.questions
drop constraint if exists questions_multiple_choice_only;

alter table public.questions
drop constraint if exists questions_question_type_check;

alter table public.questions
add constraint questions_question_type_check
check (question_type in ('multiple-choice', 'drag-and-drop', 'dropdown', 'fill-in-the-blank', 'sort-into-groups'));

notify pgrst, 'reload schema';

commit;
