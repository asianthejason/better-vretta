import assert from "node:assert/strict";
import test from "node:test";
import { buildMathExpressionHtml, createMathText, type MathExpressionNode } from "../lib/mathExpressionTree";
import { asLocationDragDropData, createLocationDragDropData, getCanvasAlgebraTile, getCanvasNumberLine, getCanvasNumberLineTicks, getCanvasShape, getCanvasTableCellHtml, getCanvasTextHtml, getCanvasTrackSizes, getInlineBlankCount, getInlineBlankSegments, getInlineChoiceBoxSize, getDragDropItemHtml, getLocationBoxSize, getSingleLineChoiceBoxSize, gradeDragDrop, getSequenceTargetCount, isDragDropAnswered, normalizeDragDropData, removeInlineBlank, type DragDropData } from "../lib/dragDrop";

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

test("new drag-and-drop questions start as one location canvas", () => {
  const data = createLocationDragDropData();
  assert.equal(data.preset, "locations");
  assert.equal(data.choiceBankGrouped, true);
  assert.ok(data.items.length > 0);
  assert.ok(data.zones.every((zone) => zone.capacity === 1 && zone.x !== undefined && zone.y !== undefined));
});

test("legacy question-canvas assets migrate into the unified drag-and-drop canvas", () => {
  const data = asLocationDragDropData(sequence, {
    backgroundImageUrl: "https://example.test/background.png",
    elements: [{ id: "prompt", type: "text", x: 4, y: 5, width: 40, height: 10, text: "Prompt" }],
  });
  assert.equal(data.preset, "locations");
  assert.equal(data.backgroundImageUrl, "https://example.test/background.png");
  assert.equal(data.canvasElements?.[0].id, "prompt");
});

test("location canvas height survives drag-and-drop normalization", () => {
  assert.equal(normalizeDragDropData({ ...sequence, preset: "locations", canvasHeight: 110 }).canvasHeight, 110);
  assert.equal(normalizeDragDropData({ ...sequence, preset: "locations", canvasHeight: 999 }).canvasHeight, 160);
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

test("complete blank choices use compact equal box dimensions", () => {
  const compact = getInlineChoiceBoxSize([{ id: "1", content: "Short" }, { id: "2", content: "A longer answer" }]);
  const location = getLocationBoxSize([{ id: "1", content: "Short" }, { id: "2", content: "A longer answer" }]);
  assert.ok(compact.height < location.height);
  assert.ok(compact.height >= 44);
});

test("multiple-choice boxes stretch for long single-line answers", () => {
  const wrappingSize = getLocationBoxSize([{ id: "1", content: "A choice with enough words to exceed the normal draggable item width limit" }]);
  const singleLineSize = getSingleLineChoiceBoxSize([{ id: "1", content: "A choice with enough words to exceed the normal draggable item width limit" }]);

  assert.ok(singleLineSize.width > wrappingSize.width);
  assert.equal(singleLineSize.height, 64);
});

test("location canvas content survives normalization", () => {
  const normalized = normalizeDragDropData({
    ...sequence,
    preset: "locations",
    canvasElements: [
      { id: "image", type: "image", x: 5, y: 6, width: 30, height: 25, imageUrl: "https://example.test/diagram.png" },
      { id: "text", type: "text", x: 10, y: 40, width: 25, height: 12, text: "Label", textHtml: "<div><strong>Lab</strong><em>el</em></div>" },
      { id: "table", type: "table", x: 40, y: 40, width: 35, height: 25, rows: 2, columns: 2, cells: [["A", "B"], ["C", "D"]], cellHtml: [["<strong>A</strong>", "B"], ["C", "<u>D</u>"]], cellVerticalAlign: [["top", "middle"], ["middle", "bottom"]] },
    ],
  });

  assert.equal(normalized.canvasElements?.length, 3);
  assert.equal(normalized.canvasElements?.[1].textHtml, "<div><strong>Lab</strong><em>el</em></div>");
  assert.equal(normalized.canvasElements?.[2].cells?.[1][1], "D");
  assert.equal(normalized.canvasElements?.[2].cellHtml?.[1][1], "<u>D</u>");
  assert.equal(normalized.canvasElements?.[2].cellVerticalAlign?.[1][1], "bottom");
});

test("table cells render saved formatting and escape legacy plain text", () => {
  assert.equal(getCanvasTableCellHtml({ cells: [["A < B"]] }, 0, 0), "A &lt; B");
  assert.equal(getCanvasTableCellHtml({ cells: [["A"]], cellHtml: [["<strong>A</strong>"]] }, 0, 0), "<strong>A</strong>");
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
    { min: -2, max: 2, divisions: 40, increment: 0.1, labelEvery: 4, labelOffset: 0, ray: undefined, rays: [], labelMode: "interval", labelValues: [], arrowExtensionPercent: 4, showLabels: true, showArrows: false, extendArrowsPastTicks: false, points: [-1.5, 0, 2] },
  );
});

test("number line increments generate exact tick positions", () => {
  const element = { numberLine: { min: -1, max: 1, divisions: 4, increment: 0.25, labelEvery: 2, showArrows: true, points: [] } };
  assert.deepEqual(getCanvasNumberLineTicks(element), [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
  assert.equal(getCanvasNumberLine(element).divisions, 8);
  assert.equal(getCanvasNumberLine({ numberLine: { ...element.numberLine, showLabels: false } }).showLabels, false);
  assert.equal(getCanvasNumberLine({ numberLine: { ...element.numberLine, extendArrowsPastTicks: true } }).extendArrowsPastTicks, true);
});

test("shape settings preserve valid shapes and bound line thickness", () => {
  assert.deepEqual(getCanvasShape({ shape: { kind: "triangle", thickness: 30 } }), { kind: "triangle", thickness: 12, lineAxis: "horizontal", lineDirection: "descending", arrowDirection: "forward" });
  assert.deepEqual(getCanvasShape({ shape: { kind: "circle", thickness: 0 } }), { kind: "circle", thickness: 1, lineAxis: "horizontal", lineDirection: "descending", arrowDirection: "forward" });
  assert.deepEqual(getCanvasShape({ shape: { kind: "arrow", thickness: 4, lineAxis: "vertical", arrowDirection: "reverse" } }), { kind: "arrow", thickness: 4, lineAxis: "vertical", lineDirection: "descending", arrowDirection: "reverse" });
});

test("algebra tile settings preserve tile type and sign", () => {
  const emptyCounts = { positiveUnit: 0, positiveX: 0, positiveX2: 0, negativeUnit: 0, negativeX: 0, negativeX2: 0 };
  assert.deepEqual(getCanvasAlgebraTile({ algebraTile: { kind: "x2", sign: "negative" } }), { kind: "x2", sign: "negative", counts: emptyCounts });
  assert.deepEqual(getCanvasAlgebraTile({}), { kind: "unit", sign: "positive", counts: emptyCounts });
  assert.deepEqual(getCanvasAlgebraTile({ algebraTile: { kind: "group", sign: "positive", counts: { ...emptyCounts, positiveX: 4, negativeUnit: 99 } } }), { kind: "group", sign: "positive", counts: { ...emptyCounts, positiveX: 4, negativeUnit: 30 } });
});

test("inline blank passages preserve text and identify blanks by occurrence", () => {
  const passage = "Space junk [[blank]] because it [[ BLANK ]].";
  assert.equal(getInlineBlankCount(passage), 2);
  assert.deepEqual(getInlineBlankSegments(passage), [
    { type: "text", content: "Space junk " },
    { type: "blank", index: 0 },
    { type: "text", content: " because it " },
    { type: "blank", index: 1 },
    { type: "text", content: "." },
  ]);
  assert.equal(removeInlineBlank(passage, 0), "Space junk  because it [[ BLANK ]].");
});

test("empty multiple-choice boxes fit their visible fallback labels", () => {
  const empty = [{ id: "1", content: "" }, { id: "2", content: "" }];
  const labeled = [{ id: "1", content: "Choice 1" }, { id: "2", content: "Choice 2" }];
  assert.deepEqual(getSingleLineChoiceBoxSize(empty), getSingleLineChoiceBoxSize(labeled));
  assert.deepEqual(
    getSingleLineChoiceBoxSize(empty, { placeholder: "Answer" }),
    getSingleLineChoiceBoxSize([{ id: "1", content: "Answer 1" }, { id: "2", content: "Answer 2" }]),
  );
  assert.ok(getSingleLineChoiceBoxSize(empty, { selectionMode: "multiple" }).width > getSingleLineChoiceBoxSize(empty).width);
});

test("drag-and-drop rich option content survives normalization and placement grading", () => {
  const contentHtml = '<div data-text-box="true"><b>First</b><br><i>Second</i></div>';
  const data = normalizeDragDropData({ ...sequence, items: [{ id: "small", content: "First\nSecond", contentHtml }], zones: [{ id: "target", label: "", correctItemIds: ["small"], capacity: 1 }] });
  const saved = normalizeDragDropData(JSON.parse(JSON.stringify(data)));
  assert.equal(getDragDropItemHtml(saved.items[0]), contentHtml);
  assert.equal(gradeDragDrop(saved, { target: ["small"] }).isCorrect, true);
});

test("legacy drag-and-drop text remains literal when loaded into the rich editor", () => {
  assert.equal(getDragDropItemHtml({ content: '<b>Literal</b> & "text"\nNext' }), '&lt;b&gt;Literal&lt;/b&gt; &amp; &quot;text&quot;<br>Next');
});

test("drag-and-drop cards reserve height for explicit line breaks and number lines", () => {
  const plain = getLocationBoxSize([{ id: "a", content: "One" }]);
  const multiline = getLocationBoxSize([{ id: "a", content: "One\nTwo\nThree", contentHtml: "One<br>Two<br>Three" }]);
  const numberLine = getLocationBoxSize([{ id: "a", content: "Number line", contentHtml: '<span data-choice-number-line="{}"></span>' }]);
  assert.ok(multiline.height > plain.height);
  assert.ok(numberLine.width >= 380);
  assert.ok(numberLine.height > plain.height);
});

test("fraction choice widths use the wider row instead of concatenating both rows", () => {
  const tree: MathExpressionNode = { type: "fraction", id: "fraction", numerator: createMathText("2 + 2 + 2 + 2"), denominator: createMathText("3 + 3 + 3 + 3") };
  const content = "2 + 2 + 2 + 23 + 3 + 3 + 3";
  const fraction = getSingleLineChoiceBoxSize([{ id: "a", content, html: buildMathExpressionHtml(tree) }]);
  const flattened = getSingleLineChoiceBoxSize([{ id: "a", content }]);
  assert.ok(fraction.width < flattened.width * 0.7);
  assert.ok(fraction.width >= "2 + 2 + 2 + 2".length * 9.5 + 24);
});

test("invalid stored math uses its visible content for choice sizing", () => {
  const result = getSingleLineChoiceBoxSize([{ id: "a", content: "12345", html: '<math data-math-tree="invalid"><mn>12345</mn></math>' }]);
  assert.ok(result.width >= 5 * 9.5 + 24);
});


test("unassigned location targets may stay empty but reject misplaced choices", () => {
  const data = createLocationDragDropData();
  data.items = [{ id: "item", content: "Option" }];
  data.zones = [
    { id: "answer", label: "", correctItemIds: ["item"], capacity: 1 },
    { id: "extra", label: "", correctItemIds: [], capacity: 1 },
    { id: "extra-2", label: "", correctItemIds: [], capacity: 1 },
  ];
  assert.equal(isDragDropAnswered(data, { answer: ["item"] }), true);
  assert.equal(gradeDragDrop(data, { answer: ["item"] }).isCorrect, true);
  assert.equal(gradeDragDrop(data, { extra: ["item"] }).isCorrect, false);
});

test("starter labels are placeholders and legacy untouched labels clear in the editor", () => {
  const fresh = createLocationDragDropData();
  assert.deepEqual(fresh.items.map(item => item.content), ["", ""]);
  const legacy = asLocationDragDropData({
    ...fresh,
    items: [
      { id: "a", content: "Item 1", imageUrl: "diagram.png" },
      { id: "b", content: "Item 2", contentHtml: "<p>Item 2</p>" },
    ],
  });
  assert.equal(legacy.items[0].content, "");
  assert.equal(legacy.items[0].imageUrl, "diagram.png");
  assert.equal(legacy.items[1].content, "Item 2"); // Explicitly authored rich content is preserved.
});


test("number line extension preserves custom distances and bounds invalid settings", () => {
  const numberLine = { min: -2, max: 2, divisions: 16, labelEvery: 4, showArrows: true, extendArrowsPastTicks: true, points: [] };
  assert.equal(getCanvasNumberLine({ numberLine }).arrowExtensionPercent, 4);
  for (const [value, expected] of [[12.5, 12.5], [0, 0], [-5, 0], [100, 25], [NaN, 4]]) {
    assert.equal(getCanvasNumberLine({ numberLine: { ...numberLine, arrowExtensionPercent: value } }).arrowExtensionPercent, expected);
  }
});

test("shared location option size overrides content sizing and bounds invalid dimensions", () => {
  const items = [{ id: "a", content: "" }, { id: "b", content: "A long option" }];
  assert.deepEqual(getLocationBoxSize(items, { width: 150, height: 80 }), { width: 150, height: 80 });
  assert.deepEqual(getLocationBoxSize(items, { width: -1, height: 3000 }), { width: 20, height: 1000 });
  assert.deepEqual(getLocationBoxSize(items, { width: NaN, height: 80 }), getLocationBoxSize(items));
});
