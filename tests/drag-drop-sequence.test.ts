import assert from "node:assert/strict";
import test from "node:test";
import { getCanvasNumberLine, getCanvasShape, getCanvasTextHtml, getCanvasTrackSizes, getLocationBoxSize, gradeDragDrop, getSequenceTargetCount, isDragDropAnswered, normalizeDragDropData, type DragDropData } from "../lib/dragDrop";

const sequence: DragDropData = {
  preset: "sequence",
  items: [
    { id: "small", content: "Small" },
    { id: "medium", content: "Medium" },
    { id: "large", content: "Large" },
    { id: "distractor", content: "Distractor" },
  ],
  zones: [{ id: "order", label: "Correct order", correctItemIds: ["small", "medium", "large"], capacity: 3, orderMatters: true }],
  sequenceStartLabel: "Smallest",
  sequenceEndLabel: "Largest",
  sequenceTargetCount: 3,
  direction: "horizontal",
  settings: { shuffleItems: true, allowReuse: false, showZoneOutlines: true, scoring: "all-or-nothing" },
};

test("sequence target count is independent from draggable choice count", () => {
  assert.equal(getSequenceTargetCount(sequence), 3);
  assert.equal(sequence.items.length, 4);
});

test("a complete sequence can be answered incorrectly with a distractor", () => {
  const incorrect = { order: ["small", "distractor", "large"] };
  assert.equal(isDragDropAnswered(sequence, incorrect), true);
  assert.equal(gradeDragDrop(sequence, incorrect).isCorrect, false);
  assert.equal(gradeDragDrop(sequence, { order: ["small", "medium", "large"] }).isCorrect, true);
});

test("legacy sequence questions use one target per saved choice", () => {
  const legacy = normalizeDragDropData({ ...sequence, sequenceTargetCount: undefined });
  assert.equal(getSequenceTargetCount(legacy), sequence.items.length);
});

test("location matching supports unused distractors and requires every target", () => {
  const locations: DragDropData = {
    ...sequence,
    preset: "locations",
    zones: [
      { id: "left-point", label: "Left point", correctItemIds: ["small"], capacity: 1, x: 10, y: 40, width: 15, height: 12 },
      { id: "right-point", label: "Right point", correctItemIds: ["large"], capacity: 1, x: 70, y: 40, width: 15, height: 12 },
    ],
  };

  assert.equal(isDragDropAnswered(locations, { "left-point": ["small"] }), false);
  assert.equal(isDragDropAnswered(locations, { "left-point": ["small"], "right-point": ["large"] }), true);
  assert.equal(gradeDragDrop(locations, { "left-point": ["small"], "right-point": ["large"] }).isCorrect, true);
});

test("location boxes grow to the largest choice within reasonable limits", () => {
  const short = getLocationBoxSize([{ id: "1", content: "A" }]);
  const mixed = getLocationBoxSize([
    { id: "1", content: "A" },
    { id: "2", content: "A substantially longer draggable choice" },
  ]);
  const withImage = getLocationBoxSize([{ id: "1", content: "A", imageUrl: "https://example.test/a.png" }]);

  assert.ok(mixed.width > short.width);
  assert.ok(withImage.width >= 144);
  assert.ok(withImage.height > short.height);
});

test("location canvas content survives normalization", () => {
  const normalized = normalizeDragDropData({
    ...sequence,
    preset: "locations",
    canvasElements: [
      { id: "image", type: "image", x: 5, y: 6, width: 30, height: 25, imageUrl: "https://example.test/diagram.png" },
      { id: "text", type: "text", x: 10, y: 40, width: 25, height: 12, text: "Label", textHtml: "<div><strong>Lab</strong><em>el</em></div>" },
      { id: "table", type: "table", x: 40, y: 40, width: 35, height: 25, rows: 2, columns: 2, cells: [["A", "B"], ["C", "D"]] },
    ],
  });

  assert.equal(normalized.canvasElements?.length, 3);
  assert.equal(normalized.canvasElements?.[1].textHtml, "<div><strong>Lab</strong><em>el</em></div>");
  assert.equal(normalized.canvasElements?.[2].cells?.[1][1], "D");
});

test("table track sizes normalize while preserving custom proportions", () => {
  assert.deepEqual(getCanvasTrackSizes(2), [50, 50]);
  assert.deepEqual(getCanvasTrackSizes(2, [25, 75]), [25, 75]);
  assert.deepEqual(getCanvasTrackSizes(3, [25, 75]), [100 / 3, 100 / 3, 100 / 3]);
});

test("legacy whole-text formatting converts to rich text safely", () => {
  assert.equal(
    getCanvasTextHtml({ text: "A < B\nsecond", textAlign: "center", bold: true, italic: true, underline: true }),
    '<div style="text-align: center"><strong><em><u>A &lt; B<br>second</u></em></strong></div>',
  );
});

test("number line settings are bounded and discard points outside its range", () => {
  assert.deepEqual(
    getCanvasNumberLine({ numberLine: { min: -2, max: 2, divisions: 100, labelEvery: 0, showArrows: false, points: [-3, -1.5, 0, 2, 3] } }),
    { min: -2, max: 2, divisions: 40, labelEvery: 4, showArrows: false, points: [-1.5, 0, 2] },
  );
});

test("shape settings preserve valid shapes and bound line thickness", () => {
  assert.deepEqual(getCanvasShape({ shape: { kind: "triangle", thickness: 30 } }), { kind: "triangle", thickness: 12, lineAxis: "horizontal", lineDirection: "descending" });
  assert.deepEqual(getCanvasShape({ shape: { kind: "circle", thickness: 0 } }), { kind: "circle", thickness: 1, lineAxis: "horizontal", lineDirection: "descending" });
});
