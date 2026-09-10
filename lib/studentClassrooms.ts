export type StudentAssignment = {
  assessment_id: string;
  allow_all_students: boolean;
  classroom_id: string;
  assessments: {
    title: string;
    description: string | null;
    is_published: boolean;
  } | null;
};

export type StudentAssessmentAccess = {
  classroom_id: string;
  assessment_id: string;
  allowed: boolean;
};

export function visibleStudentAssignments(assignments: StudentAssignment[], access: StudentAssessmentAccess[]) {
  const explicitlyAllowed = new Set(
    access.filter((item) => item.allowed).map((item) => `${item.classroom_id}:${item.assessment_id}`),
  );
  return assignments.filter((assignment) =>
    assignment.assessments?.is_published
    && (assignment.allow_all_students || explicitlyAllowed.has(`${assignment.classroom_id}:${assignment.assessment_id}`)),
  );
}
