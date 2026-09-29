import assert from "node:assert/strict";
import test from "node:test";
import {
  getMultipleChoiceCorrectAnswers,
  gradeMultipleChoice,
  normalizeMultipleChoiceResponse,
  toggleMultipleChoiceAnswer,
} from "../lib/multipleChoice";

test("legacy single-answer questions remain compatible", () => {
  assert.deepEqual(getMultipleChoiceCorrectAnswers({ correctAnswer: "B" }), ["B"]);
  assert.deepEqual(normalizeMultipleChoiceResponse("B"), ["B"]);
  assert.equal(gradeMultipleChoice({ correctAnswer: "B" }, ["B"]), true);
});

test("multiple-answer questions require the exact checked set", () => {
  const key = { selectionMode: "multiple" as const, correctAnswers: ["A", "C"] };
  assert.equal(gradeMultipleChoice(key, ["C", "A"]), true);
  assert.equal(gradeMultipleChoice(key, ["A"]), false);
  assert.equal(gradeMultipleChoice(key, ["A", "B", "C"]), false);
});

test("checkbox answers toggle while radio answers replace", () => {
  assert.deepEqual(toggleMultipleChoiceAnswer(["A"], "C", "multiple"), ["A", "C"]);
  assert.deepEqual(toggleMultipleChoiceAnswer(["A", "C"], "A", "multiple"), ["C"]);
  assert.deepEqual(toggleMultipleChoiceAnswer(["A"], "C", "single"), ["C"]);
});
