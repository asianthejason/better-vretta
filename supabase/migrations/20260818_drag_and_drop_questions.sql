-- Reintroduce one intentionally unified interactive question type.
-- Its presets are stored in question_data and are not separate database types.
alter table public.questions
drop constraint if exists questions_question_type_check;

alter table public.questions
add constraint questions_question_type_check
check (question_type in ('multiple-choice', 'drag-and-drop'));

notify pgrst, 'reload schema';
