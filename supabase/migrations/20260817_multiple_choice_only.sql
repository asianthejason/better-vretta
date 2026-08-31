-- Permanently remove every legacy question type and prevent it from returning.
-- This intentionally deletes associated student answers before deleting questions.
begin;

delete from public.student_answers answer
using public.questions question
where answer.question_id = question.id
  and question.question_type <> 'multiple-choice';

delete from public.questions
where question_type <> 'multiple-choice';

alter table public.questions
drop constraint if exists questions_multiple_choice_only;

alter table public.questions
add constraint questions_multiple_choice_only
check (question_type = 'multiple-choice');

commit;

notify pgrst, 'reload schema';
