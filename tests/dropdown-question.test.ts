import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultDropdownData, dropdownHasCompleteAnswerKey, dropdownIsAnswered, getDropdownSegments, gradeDropdown, normalizeDropdownData } from "../lib/dropdownQuestion";

test("new dropdown questions start with an empty canvas interaction set", () => {
  assert.deepEqual(createDefaultDropdownData(), {
    layout: "inline",
    template: "",
    entries: [],
  });
});

test("inline dropdown tokens map to independent option sets", () => {
  const data = normalizeDropdownData({ layout: "inline", template: "Jupiter is [[dropdown]] and spins [[dropdown]].", entries: [{ id: "orbit", label: "", options: ["larger", "smaller"], correctAnswer: "larger" }, { id: "spin", label: "", options: ["faster", "slower"], correctAnswer: "faster" }] });
  assert.equal(getDropdownSegments(data.template).filter((segment) => segment.type === "dropdown").length, 2);
  assert.equal(dropdownIsAnswered(data, { orbit: "larger", spin: "faster" }), true);
  assert.equal(gradeDropdown(data, { orbit: "larger", spin: "slower" }).isCorrect, false);
  assert.deepEqual(gradeDropdown(data, { orbit: "larger", spin: "faster" }).entryResults, { orbit: true, spin: true });
  assert.deepEqual(data.entries[0].options, ["larger", "smaller"]);
  assert.deepEqual(data.entries[1].options, ["faster", "slower"]);
});

test("legacy shared dropdown choices are copied into every entry", () => {
  const data = normalizeDropdownData({ options: ["yes", "no"], entries: [{ id: "first", label: "", correctAnswer: "yes" }, { id: "second", label: "", correctAnswer: "no" }] });
  assert.deepEqual(data.entries.map((entry) => entry.options), [["yes", "no"], ["yes", "no"]]);
});

test("canvas bounds and independent answers survive normalization", () => {
  const data = normalizeDropdownData({
    entries: [
      { id: "first", label: "", options: ["Mercury", "Venus"], correctAnswer: "Venus", x: 12, y: 18, width: 24, height: 9 },
      { id: "second", label: "", options: ["Earth", "Mars", "Jupiter"], correctAnswer: "Mars", x: 48, y: 62, width: 30, height: 11 },
    ],
  });

  assert.deepEqual(data.entries.map(({ options, correctAnswer, x, y, width, height }) => ({ options, correctAnswer, x, y, width, height })), [
    { options: ["Mercury", "Venus"], correctAnswer: "Venus", x: 12, y: 18, width: 24, height: 9 },
    { options: ["Earth", "Mars", "Jupiter"], correctAnswer: "Mars", x: 48, y: 62, width: 30, height: 11 },
  ]);
  assert.equal(gradeDropdown(data, { first: "Venus", second: "Mars" }).isCorrect, true);
  assert.equal(gradeDropdown(data, { first: "Venus", second: "Earth" }).isCorrect, false);
});

test("every dropdown requires an explicitly assigned valid answer before saving", () => {
  const missingAnswer = normalizeDropdownData({
    entries: [{ id: "first", label: "", options: ["Yes", "No"], correctAnswer: "" }],
  });
  const removedAnswer = normalizeDropdownData({
    entries: [{ id: "first", label: "", options: ["Yes", "No"], correctAnswer: "Maybe" }],
  });
  const completeAnswerKey = normalizeDropdownData({
    entries: [{ id: "first", label: "", options: ["Yes", "No"], correctAnswer: "Yes" }],
  });

  assert.equal(dropdownHasCompleteAnswerKey(missingAnswer), false);
  assert.equal(dropdownHasCompleteAnswerKey(removedAnswer), false);
  assert.equal(dropdownHasCompleteAnswerKey(completeAnswerKey), true);
});
