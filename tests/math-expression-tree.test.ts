import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMathExpressionHtml,
  canRemoveMathNode,
  createMathNodeId,
  createMathText,
  createMathSlot,
  findMathNode,
  decodeMathExpressionTree,
  encodeMathExpressionTree,
  mathExpressionHasEmptySlots,
  renderMathExpressionMathMl,
  replaceMathNode,
  removeMathNode,
  type MathExpressionNode,
} from "../lib/mathExpressionTree";

const text = (value: string) => createMathText(value);

test("math expressions support a fraction nested inside a square root", () => {
  const tree: MathExpressionNode = {
    type: "root",
    id: "root",
    index: text("2"),
    radicand: {
      type: "fraction",
      id: "fraction",
      numerator: text("p + q"),
      denominator: text("2"),
    },
  };
  const html = buildMathExpressionHtml(tree);
  assert.match(html, /<mrow><mo stretchy="true" symmetric="true">√<\/mo><mrow data-radical-overline="true"><mfrac><mtext>p \+ q<\/mtext><mtext>2<\/mtext><\/mfrac><\/mrow><\/mrow>/);
  assert.match(html, /data-math-tree=/);
  assert.equal(mathExpressionHasEmptySlots(tree), false);
});

test("removing sequence terms preserves neighbors and allows clearing the final block", () => {
  const first = text("a");
  const second = text("b");
  const sequence: MathExpressionNode = { type: "sequence", id: createMathNodeId(), children: [first, second] };
  const removed = removeMathNode(sequence, first.id);
  assert.equal(removed.root, second);
  assert.equal(removed.selectedId, second.id);
  assert.equal(canRemoveMathNode(second, second.id), true);
  const cleared = removeMathNode(second, second.id);
  assert.equal(cleared.root.type, "slot");
  assert.equal(cleared.selectedId, cleared.root.id);
  assert.equal(canRemoveMathNode(cleared.root, cleared.root.id), false);
  const slot = createMathSlot();
  assert.equal(removeMathNode({ ...sequence, children: [slot, second] }, slot.id).root, second);
});

test("removing the summation inside a limit preserves the limit and its body", () => {
  const sum: MathExpressionNode = { type: "summation", id: "sum", lower: text("i = 1"), upper: text("n"), body: createMathSlot() };
  const root: MathExpressionNode = { type: "limit", id: "limit", variable: text("x"), approach: sum, body: { type: "root", id: "radical", index: text("2"), radicand: createMathSlot() } };
  assert.equal(canRemoveMathNode(root, sum.id), true);
  const result = removeMathNode(root, sum.id);
  assert.equal(result.root.type, "limit");
  if (result.root.type !== "limit") return;
  assert.equal(result.root.variable, root.variable);
  assert.deepEqual(result.root.body, root.body);
  assert.equal(result.root.approach.type, "slot");
  assert.equal(result.selectedId, result.root.approach.id);
  assert.equal(findMathNode(result.root, sum.id), null);
  assert.equal(mathExpressionHasEmptySlots(result.root), true);
});

test("removing any required child preserves its parent and other expression content", () => {
  const parents: MathExpressionNode[] = [
    { type: "fraction", id: "fraction", numerator: text("a"), denominator: text("b") },
    { type: "root", id: "root", index: text("3"), radicand: text("x") },
    { type: "brackets", id: "brackets", style: "parentheses", body: text("x") },
    { type: "superscript", id: "power", base: text("x"), exponent: text("2") },
    { type: "subscript", id: "sub", base: text("x"), subscript: text("n") },
    ...(["summation", "product"] as const).map((type) => ({ type, id: type, lower: text("1"), upper: text("n"), body: text("x") })),
    { type: "integral", id: "integral", lower: text("0"), upper: text("1"), body: text("x"), variable: text("x") },
    { type: "limit", id: "limit", variable: text("x"), approach: text("0"), body: text("x") },
  ];
  for (const parent of parents) {
    for (const [field, child] of Object.entries(parent)) {
      if (!child || typeof child !== "object" || !("id" in child)) continue;
      const tail = text("keep me");
      const root: MathExpressionNode = { type: "sequence", id: "outer", children: [parent, tail] };
      assert.equal(canRemoveMathNode(root, child.id), true);
      const result = removeMathNode(root, child.id);
      const replacement = findMathNode(result.root, result.selectedId);
      assert.equal(replacement?.type, "slot");
      assert.deepEqual(findMathNode(result.root, parent.id), { ...parent, [field]: replacement });
      assert.equal(findMathNode(result.root, tail.id), tail);
      assert.equal(findMathNode(result.root, child.id), null);
      assert.deepEqual(decodeMathExpressionTree(encodeMathExpressionTree(result.root)), result.root);
    }
  }
});

test("clearing a whole structured expression leaves an editable slot", () => {
  const root: MathExpressionNode = { type: "fraction", id: "fraction", numerator: text("1"), denominator: text("2") };
  const result = removeMathNode(root, root.id);
  assert.equal(result.root.type, "slot");
  assert.equal(result.selectedId, result.root.id);
  assert.equal(removeMathNode(root, "missing").root, root);
});

test("an exponent wraps a completed bracketed fraction", () => {
  const fraction: MathExpressionNode = { type: "fraction", id: "fraction", numerator: text("2"), denominator: text("3") };
  const tree: MathExpressionNode = {
    type: "superscript",
    id: "power",
    base: { type: "brackets", id: "brackets", style: "parentheses", body: fraction },
    exponent: text("4"),
  };
  const mathMl = renderMathExpressionMathMl(tree);
  assert.match(mathMl, /^<msup><mrow><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\(<\/mo><mfrac>/);
  assert.match(mathMl, /<\/mfrac><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\)<\/mo><\/mrow><mtext>4<\/mtext><\/msup>$/);
});

test("any slot can be replaced with another structured expression", () => {
  const tree: MathExpressionNode = { type: "fraction", id: "outer", numerator: { type: "slot", id: "numerator" }, denominator: text("5") };
  const nestedRoot: MathExpressionNode = { type: "root", id: "nested-root", index: text("3"), radicand: text("x") };
  const updated = replaceMathNode(tree, "numerator", nestedRoot);
  assert.match(renderMathExpressionMathMl(updated), /<mfrac><mroot><mtext>x<\/mtext><mtext>3<\/mtext><\/mroot><mtext>5<\/mtext><\/mfrac>/);
  assert.equal(mathExpressionHasEmptySlots(updated), false);
});

test("stored expression trees round trip and reject invalid payloads", () => {
  const tree: MathExpressionNode = { type: "subscript", id: "sub", base: text("a"), subscript: text("n") };
  assert.deepEqual(decodeMathExpressionTree(encodeMathExpressionTree(tree)), tree);
  assert.equal(decodeMathExpressionTree(encodeURIComponent(JSON.stringify({ type: "script", id: "bad" }))), null);
  assert.equal(decodeMathExpressionTree("%not-json"), null);
});

test("math text is escaped before it reaches MathML", () => {
  assert.equal(renderMathExpressionMathMl(text("a < b & c")), "<mtext>a &lt; b &amp; c</mtext>");
});

test("mixed fractions retain an editable whole part when saved and reopened", () => {
  const tree: MathExpressionNode = { type: "fraction", id: "mixed", whole: createMathSlot("whole number"), numerator: text("1"), denominator: text("2") };
  assert.equal(mathExpressionHasEmptySlots(tree), true);
  const complete = replaceMathNode(tree, tree.whole!.id, { type: "text", id: tree.whole!.id, value: "3" });
  assert.equal(mathExpressionHasEmptySlots(complete), false);
  assert.deepEqual(decodeMathExpressionTree(encodeMathExpressionTree(complete)), complete);
  assert.equal(findMathNode(complete, tree.whole!.id)?.type, "text");
  assert.equal(renderMathExpressionMathMl(complete), '<mrow><mtext>3</mtext><mspace width="0.15em"/><mfrac><mtext>1</mtext><mtext>2</mtext></mfrac></mrow>');
  assert.equal(mathExpressionHasEmptySlots(removeMathNode(complete, tree.whole!.id).root), true);
});

test("invalid mixed fraction whole parts are rejected", () => {
  assert.equal(decodeMathExpressionTree(encodeURIComponent(JSON.stringify({ type: "fraction", id: "bad", whole: { type: "unknown" }, numerator: text("1"), denominator: text("2") }))), null);
});
