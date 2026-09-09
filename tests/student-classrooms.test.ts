import assert from "node:assert/strict";
import { test } from "node:test";
import { type StudentAssignment, visibleStudentAssignments } from "../lib/studentClassrooms";

function assignment(id: string, options: { classroom?: string; allowAll?: boolean; published?: boolean } = {}): StudentAssignment {
  return {
    assessment_id: id,
    classroom_id: options.classroom || "classroom-1",
    allow_all_students: options.allowAll ?? true,
    assessments: { title: id, description: null, assessment_code: id.toUpperCase(), is_published: options.published ?? true },
  };
}

test("students only see published assessments available to them", () => {
  const assignments = [
    assignment("open"),
    assignment("mine", { allowAll: false }),
    assignment("someone-else", { allowAll: false }),
    assignment("draft", { published: false }),
  ];
  const visible = visibleStudentAssignments(assignments, [
    { classroom_id: "classroom-1", assessment_id: "mine", allowed: true },
    { classroom_id: "classroom-1", assessment_id: "someone-else", allowed: false },
  ]);
  assert.deepEqual(visible.map((item) => item.assessment_id), ["open", "mine"]);
});

test("explicit access is scoped to the classroom assignment", () => {
  const assignments = [assignment("shared-id", { classroom: "classroom-2", allowAll: false })];
  const visible = visibleStudentAssignments(assignments, [
    { classroom_id: "classroom-1", assessment_id: "shared-id", allowed: true },
  ]);
  assert.equal(visible.length, 0);
});
