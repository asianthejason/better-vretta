import assert from "node:assert/strict";
import test from "node:test";
import {
  FILL_BLANK_TOKEN,
  fillBlankIsAnswered,
  getFillBlankCount,
  getFillBlankBounds,
  getFillBlankPromptText,
  getFillBlankSegments,
  gradeFillBlank,
  normalizeFillBlankData,
} from "../lib/fillBlank";

test("canvas fill fields keep independent bounded positions and sizes", () => {
  const data = normalizeFillBlankData({
    layout: "inline",
    template: "",
    blanks: [{ id: "answer", correctAnswer: "x²", inputMode: "math", x: 92, y: 94, width: 30, height: 20 }],
  });
  assert.deepEqual(getFillBlankBounds(data.blanks[0]), { x: 92, y: 94, width: 8, height: 6 });
});

test("inline fill blanks preserve text, line breaks, and multiple answer positions", () => {
  const template = `Answer: (${FILL_BLANK_TOKEN}, ${FILL_BLANK_TOKEN})\nUnits: ${FILL_BLANK_TOKEN}`;
  assert.equal(getFillBlankCount(template), 3);
  const segments = getFillBlankSegments(template);
  assert.equal(segments.filter((segment) => segment.type === "blank").length, 3);
  assert.ok(segments.some((segment) => segment.type === "text" && segment.content.includes("\nUnits:")));
});

test("saved question prompt is derived from the single fill-blank prompt", () => {
  const data = normalizeFillBlankData({
    layout: "inline",
    template: `The coordinates are (${FILL_BLANK_TOKEN}, ${FILL_BLANK_TOKEN}).`,
    blanks: [
      { id: "x", correctAnswer: "2", inputMode: "number" },
      { id: "y", correctAnswer: "3", inputMode: "number" },
    ],
  });
  assert.equal(getFillBlankPromptText(data), "The coordinates are (___, ___).");
});

test("legacy embedded answers are migrated into blank records", () => {
  const data = normalizeFillBlankData(undefined, "The result is [[42]]%.", [{ id: "answer-1", correctAnswer: "42" }]);
  assert.equal(data.template, `The result is ${FILL_BLANK_TOKEN}%.`);
  assert.deepEqual(data.blanks[0], { id: "answer-1", correctAnswer: "42", inputMode: "text" });
});

test("fraction blanks grade numerator and denominator independently", () => {
  const data = normalizeFillBlankData({
    layout: "fraction",
    template: "",
    blanks: [
      { id: "numerator", correctAnswer: "3", inputMode: "number" },
      { id: "denominator", correctAnswer: "4", inputMode: "number" },
    ],
    prefix: "x =",
  });
  assert.equal(fillBlankIsAnswered(data, { numerator: "3", denominator: "4" }), true);
  assert.deepEqual(gradeFillBlank(data, { numerator: "3", denominator: "5" }), {
    blankResults: { numerator: true, denominator: false },
    isCorrect: false,
  });
});

test("math answers normalize spacing and common operator glyphs", () => {
  const data = normalizeFillBlankData({
    layout: "math",
    template: FILL_BLANK_TOKEN,
    blanks: [{ id: "expression", correctAnswer: "3x^2 - 2", inputMode: "math" }],
  });
  assert.equal(gradeFillBlank(data, { expression: " 3 × x² − 2 " }).isCorrect, true);
});

test("algebra-tile models preserve polynomial rows and bound tile counts", () => {
  const data = normalizeFillBlankData({
    layout: "math",
    template: FILL_BLANK_TOKEN,
    blanks: [{ id: "expression", correctAnswer: "x²+2x+1", inputMode: "math" }],
    algebraTiles: {
      showLegend: true,
      rows: [{
        id: "polynomial-1",
        label: "Polynomial 1",
        positiveX2: 1,
        negativeX2: 0,
        positiveX: 2,
        negativeX: 0,
        positiveUnit: 99,
        negativeUnit: -4,
      }],
    },
  });
  assert.equal(data.algebraTiles?.rows[0].positiveX2, 1);
  assert.equal(data.algebraTiles?.rows[0].positiveUnit, 30);
  assert.equal(data.algebraTiles?.rows[0].negativeUnit, 0);
});
