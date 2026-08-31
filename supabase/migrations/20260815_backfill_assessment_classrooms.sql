-- Repairs assessments that were assigned through classroom_assessments before
-- assessments.classroom_id was introduced. This does not delete any data.
with latest_classroom_assignment as (
  select distinct on (assessment_id)
    assessment_id,
    classroom_id
  from public.classroom_assessments
  order by assessment_id, assigned_at desc
)
update public.assessments as assessment
set classroom_id = assignment.classroom_id
from latest_classroom_assignment as assignment
where assessment.id = assignment.assessment_id
  and assessment.classroom_id is null;

notify pgrst, 'reload schema';
