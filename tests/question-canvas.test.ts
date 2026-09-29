import assert from "node:assert/strict";
import test from "node:test";
import { getChoiceContentSizes } from "../lib/dragDrop";
import { createDefaultQuestionCanvas, normalizeQuestionCanvas } from "../lib/questionCanvas";

test("question canvas starts as one unrestricted composition surface", () => {
  const canvas = createDefaultQuestionCanvas();
  assert.equal(canvas.version, 2);
  assert.equal(canvas.interaction, undefined);
  assert.equal(canvas.legacyPrompt, undefined);
});

test("question canvas normalization keeps interaction regions within the canvas", () => {
  const canvas = normalizeQuestionCanvas({ version: 2, interaction: { x: 94, y: -5, width: 80, height: 120 } });
  for (const region of [canvas.interaction!]) {
    assert.ok(region.x >= 0 && region.y >= 0);
    assert.ok(region.x + region.width <= 100);
    assert.ok(region.y + region.height <= 100);
  }
});

test("version one prompt and response regions remain available for migration", () => {
  const canvas = normalizeQuestionCanvas({ version: 1, prompt: { x: 6, y: 7, width: 88, height: 19 }, response: { x: 6, y: 31, width: 88, height: 62 } });
  assert.deepEqual(canvas.legacyPrompt, { x: 6, y: 7, width: 88, height: 19 });
  assert.deepEqual(canvas.interaction, { x: 6, y: 31, width: 88, height: 62 });
});

test("legacy questions receive an empty default composition", () => {
  const canvas = normalizeQuestionCanvas(undefined);
  assert.deepEqual(canvas.elements, []);
  assert.equal(canvas.backgroundImageUrl, "");
  assert.equal(canvas.canvasHeight, 56.25);
});

test("question canvas height persists and stays within supported bounds", () => {
  assert.equal(normalizeQuestionCanvas({ version: 2, canvasHeight: 95 }).canvasHeight, 95);
  assert.equal(normalizeQuestionCanvas({ version: 2, canvasHeight: 500 }).canvasHeight, 160);
  assert.equal(normalizeQuestionCanvas({ version: 2, canvasHeight: 5 }).canvasHeight, 40);
});

test("multiple choice layout preserves grouping and bounds independent positions", () => {
  const canvas = normalizeQuestionCanvas({
    version: 2,
    choiceLayout: {
      grouped: false,
      direction: "horizontal",
      x: -20,
      y: 120,
      positions: [{ x: 22, y: 31 }, { x: 140, y: -8 }],
    },
  });
  assert.deepEqual(canvas.choiceLayout, {
    grouped: false,
    direction: "horizontal",
    presentation: "content",
    x: 0,
    y: 95,
    positions: [{ x: 22, y: 31 }, { x: 95, y: 0 }],
  });
});

test("selection box layouts retain independently scalable marker sizes", () => {
  const canvas = normalizeQuestionCanvas({
    version: 2,
    choiceLayout: {
      grouped: false,
      direction: "vertical",
      presentation: "box",
      x: 8,
      y: 35,
      positions: [{ x: 20, y: 30, width: 1, height: 80 }],
    },
  });
  assert.deepEqual(canvas.choiceLayout?.positions[0], { x: 20, y: 30, width: 2, height: 50 });
  assert.equal(canvas.choiceLayout?.presentation, "box");
});

test("multiple choice text vertical alignment persists per option", () => {
  const canvas = normalizeQuestionCanvas({
    version: 2,
    choiceLayout: {
      grouped: false,
      direction: "vertical",
      presentation: "content",
      x: 8,
      y: 35,
      positions: [
        { x: 10, y: 20, textVerticalAlign: "top" },
        { x: 10, y: 40, textVerticalAlign: "bottom" },
        { x: 10, y: 60, textVerticalAlign: "invalid" },
      ],
    },
  });
  assert.equal(canvas.choiceLayout?.positions[0]?.textVerticalAlign, "top");
  assert.equal(canvas.choiceLayout?.positions[1]?.textVerticalAlign, "bottom");
  assert.equal(canvas.choiceLayout?.positions[2]?.textVerticalAlign, undefined);
});


test("empty choice sizing mode survives saving and reopening", () => {
  const layout = { grouped: false, direction: "vertical", presentation: "content", x: 8, y: 35, sameSize: true, positions: [{ x: 8, y: 35, width: 12, height: 8 }, { x: 8, y: 50, width: 12, height: 8 }] };
  const saved = normalizeQuestionCanvas({ choiceLayout: layout });
  assert.equal(saved.choiceLayout?.sameSize, true);
  assert.deepEqual(saved.choiceLayout?.positions, layout.positions);
  const custom = normalizeQuestionCanvas({ choiceLayout: { ...layout, sameSize: false, positions: [layout.positions[0], { ...layout.positions[1], width: 20 }] } });
  assert.ok(!custom.choiceLayout?.sameSize);
  assert.equal(custom.choiceLayout?.positions[1].width, 20);
});


test("typing into resized empty choices readjusts every shared box", () => {
  const items = [{ id: "a", content: "", width: 30, height: 25 }, { id: "b", content: "", width: 30, height: 25 }];
  const empty = getChoiceContentSizes(items, { sameSize: true });
  const typed = getChoiceContentSizes([{ ...items[0], content: "Short" }, items[1]], { sameSize: true });
  assert.deepEqual(typed[0], typed[1]);
  assert.notDeepEqual(typed[0], empty[0]);
  const longer = getChoiceContentSizes([{ ...items[0], content: "A much longer answer that needs more space" }, items[1]], { sameSize: true });
  assert.deepEqual(longer[0], longer[1]);
  assert.ok(longer[0].width > typed[0].width);
});

test("custom sizing fits each filled choice while preserving empty box dimensions", () => {
  const items = [{ id: "a", content: "Short", width: 30, height: 25 }, { id: "b", content: "A much longer answer", width: 30, height: 25 }, { id: "c", content: "", width: 20, height: 10 }];
  const sizes = getChoiceContentSizes(items, { sameSize: false, canvasHeight: 80 });
  assert.ok(sizes[0].width < sizes[1].width);
  assert.notEqual(sizes[0].width, 30);
  assert.deepEqual(sizes[2], { width: 20, height: 8 });
  const shared = getChoiceContentSizes(items, { sameSize: true });
  assert.deepEqual(shared[0], shared[1]);
  assert.deepEqual(shared[1], shared[2]);
});
