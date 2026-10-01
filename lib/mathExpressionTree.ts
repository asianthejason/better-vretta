export type MathBracketStyle = "parentheses" | "brackets" | "braces";

export type MathExpressionNode =
  | { type: "slot"; id: string; label?: string }
  | { type: "text"; id: string; value: string }
  | { type: "sequence"; id: string; children: MathExpressionNode[] }
  | { type: "fraction"; id: string; whole?: MathExpressionNode; numerator: MathExpressionNode; denominator: MathExpressionNode }
  | { type: "root"; id: string; index: MathExpressionNode; radicand: MathExpressionNode }
  | { type: "brackets"; id: string; style: MathBracketStyle; body: MathExpressionNode }
  | { type: "superscript"; id: string; base: MathExpressionNode; exponent: MathExpressionNode }
  | { type: "subscript"; id: string; base: MathExpressionNode; subscript: MathExpressionNode }
  | { type: "summation" | "product"; id: string; lower: MathExpressionNode; upper: MathExpressionNode; body: MathExpressionNode }
  | { type: "integral"; id: string; lower: MathExpressionNode; upper: MathExpressionNode; body: MathExpressionNode; variable: MathExpressionNode }
  | { type: "limit"; id: string; variable: MathExpressionNode; approach: MathExpressionNode; body: MathExpressionNode };

let nextNodeNumber = 0;
export const createMathNodeId = () => `math-node-${Date.now().toString(36)}-${(nextNodeNumber += 1).toString(36)}`;
export const createMathSlot = (label = "expression"): MathExpressionNode => ({ type: "slot", id: createMathNodeId(), label });
export const createMathText = (value: string): MathExpressionNode => ({ type: "text", id: createMathNodeId(), value });
export const createEmptyMathExpression = () => createMathSlot();

const childNodes = (node: MathExpressionNode): MathExpressionNode[] => {
  switch (node.type) {
    case "sequence": return node.children;
    case "fraction": return [...(node.whole ? [node.whole] : []), node.numerator, node.denominator];
    case "root": return [node.index, node.radicand];
    case "brackets": return [node.body];
    case "superscript": return [node.base, node.exponent];
    case "subscript": return [node.base, node.subscript];
    case "summation": case "product": return [node.lower, node.upper, node.body];
    case "integral": return [node.lower, node.upper, node.body, node.variable];
    case "limit": return [node.variable, node.approach, node.body];
    default: return [];
  }
};

export function findMathNode(root: MathExpressionNode, id: string): MathExpressionNode | null {
  if (root.id === id) return root;
  for (const child of childNodes(root)) {
    const found = findMathNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findMathParent(root: MathExpressionNode, id: string): MathExpressionNode | null {
  if (childNodes(root).some((child) => child.id === id)) return root;
  for (const child of childNodes(root)) {
    const found = findMathParent(child, id);
    if (found) return found;
  }
  return null;
}

export function replaceMathNode(root: MathExpressionNode, id: string, replacement: MathExpressionNode): MathExpressionNode {
  if (root.id === id) return replacement;
  const replace = (node: MathExpressionNode) => replaceMathNode(node, id, replacement);
  switch (root.type) {
    case "sequence": return { ...root, children: root.children.map(replace) };
    case "fraction": return { ...root, ...(root.whole ? { whole: replace(root.whole) } : {}), numerator: replace(root.numerator), denominator: replace(root.denominator) };
    case "root": return { ...root, index: replace(root.index), radicand: replace(root.radicand) };
    case "brackets": return { ...root, body: replace(root.body) };
    case "superscript": return { ...root, base: replace(root.base), exponent: replace(root.exponent) };
    case "subscript": return { ...root, base: replace(root.base), subscript: replace(root.subscript) };
    case "summation": case "product": return { ...root, lower: replace(root.lower), upper: replace(root.upper), body: replace(root.body) };
    case "integral": return { ...root, lower: replace(root.lower), upper: replace(root.upper), body: replace(root.body), variable: replace(root.variable) };
    case "limit": return { ...root, variable: replace(root.variable), approach: replace(root.approach), body: replace(root.body) };
    default: return root;
  }
}

export function insertMathSibling(root: MathExpressionNode, id: string, side: "before" | "after"): { root: MathExpressionNode; selectedId: string } {
  const slot = createMathSlot("new term");
  const current = findMathNode(root, id);
  if (!current) return { root, selectedId: id };
  const parent = findMathParent(root, id);
  if (parent?.type === "sequence") {
    const index = parent.children.findIndex((child) => child.id === id);
    const children = [...parent.children];
    children.splice(side === "before" ? index : index + 1, 0, slot);
    return { root: replaceMathNode(root, parent.id, { ...parent, children }), selectedId: slot.id };
  }
  const children = side === "before" ? [slot, current] : [current, slot];
  return { root: replaceMathNode(root, id, { type: "sequence", id: createMathNodeId(), children }), selectedId: slot.id };
}

export function canRemoveMathNode(root: MathExpressionNode, id: string): boolean {
  const selected = findMathNode(root, id);
  if (!selected) return false;
  // Empty required slots must remain available for replacement. A slot in a
  // sequence can still be removed just like any other term.
  return selected.type !== "slot" || findMathParent(root, id)?.type === "sequence";
}

export function removeMathNode(root: MathExpressionNode, id: string): { root: MathExpressionNode; selectedId: string } {
  if (!canRemoveMathNode(root, id)) return { root, selectedId: id };
  const parent = findMathParent(root, id);
  if (parent?.type === "sequence") {
    const index = parent.children.findIndex((child) => child.id === id);
    const children = parent.children.filter((child) => child.id !== id);
    const replacement: MathExpressionNode = children.length === 0
      ? createMathSlot()
      : children.length === 1 ? children[0] : { ...parent, children };
    return {
      root: replaceMathNode(root, parent.id, replacement),
      selectedId: children[Math.min(index, children.length - 1)]?.id || replacement.id,
    };
  }
  const replacement = createMathSlot();
  return { root: replaceMathNode(root, id, replacement), selectedId: replacement.id };
}

export function mathExpressionHasEmptySlots(node: MathExpressionNode): boolean {
  return node.type === "slot" || childNodes(node).some(mathExpressionHasEmptySlots);
}

const escapeMathText = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const mtext = (value: string) => `<mtext>${escapeMathText(value)}</mtext>`;
const fence = (value: string) => `<mo fence="true" stretchy="true" symmetric="true" minsize="2em">${value}</mo>`;

export function renderMathExpressionMathMl(node: MathExpressionNode): string {
  const render = renderMathExpressionMathMl;
  switch (node.type) {
    case "slot": return "<mtext>□</mtext>";
    case "text": return mtext(node.value);
    case "sequence": return `<mrow>${node.children.map(render).join("")}</mrow>`;
    case "fraction": {
      const fraction = `<mfrac>${render(node.numerator)}${render(node.denominator)}</mfrac>`;
      return node.whole ? `<mrow>${render(node.whole)}<mspace width="0.15em"/>${fraction}</mrow>` : fraction;
    }
    case "root": {
      const indexText = node.index.type === "text" ? node.index.value.trim() : "";
      return indexText === "" || indexText === "2"
        ? `<msqrt>${render(node.radicand)}</msqrt>`
        : `<mroot>${render(node.radicand)}${render(node.index)}</mroot>`;
    }
    case "brackets": {
      const [open, close] = node.style === "brackets" ? ["[", "]"] : node.style === "braces" ? ["{", "}"] : ["(", ")"];
      return `<mrow>${fence(open)}${render(node.body)}${fence(close)}</mrow>`;
    }
    case "superscript": return `<msup>${render(node.base)}${render(node.exponent)}</msup>`;
    case "subscript": return `<msub>${render(node.base)}${render(node.subscript)}</msub>`;
    case "summation": case "product": return `<mrow><munderover><mo>${node.type === "summation" ? "∑" : "∏"}</mo>${render(node.lower)}${render(node.upper)}</munderover>${render(node.body)}</mrow>`;
    case "integral": return `<mrow><munderover><mo>∫</mo>${render(node.lower)}${render(node.upper)}</munderover>${render(node.body)}<mi>d</mi>${render(node.variable)}</mrow>`;
    case "limit": return `<mrow><munder><mo>lim</mo><mrow>${render(node.variable)}<mo>→</mo>${render(node.approach)}</mrow></munder>${render(node.body)}</mrow>`;
  }
}

export function encodeMathExpressionTree(node: MathExpressionNode): string {
  return encodeURIComponent(JSON.stringify(node));
}

const VALID_TYPES = new Set(["slot", "text", "sequence", "fraction", "root", "brackets", "superscript", "subscript", "summation", "product", "integral", "limit"]);
function validateMathNode(value: unknown, depth = 0, count = { value: 0 }): value is MathExpressionNode {
  if (!value || typeof value !== "object" || depth > 20 || (count.value += 1) > 250) return false;
  const node = value as Record<string, unknown>;
  if (typeof node.id !== "string" || node.id.length > 100 || typeof node.type !== "string" || !VALID_TYPES.has(node.type)) return false;
  if (node.type === "slot") return node.label === undefined || (typeof node.label === "string" && node.label.length <= 80);
  if (node.type === "text") return typeof node.value === "string" && node.value.length <= 1000;
  if (node.type === "sequence") return Array.isArray(node.children) && node.children.length <= 50 && node.children.every((child) => validateMathNode(child, depth + 1, count));
  if (node.type === "fraction") return (node.whole === undefined || validateMathNode(node.whole, depth + 1, count)) && validateMathNode(node.numerator, depth + 1, count) && validateMathNode(node.denominator, depth + 1, count);
  if (node.type === "root") return validateMathNode(node.index, depth + 1, count) && validateMathNode(node.radicand, depth + 1, count);
  if (node.type === "brackets") return ["parentheses", "brackets", "braces"].includes(String(node.style)) && validateMathNode(node.body, depth + 1, count);
  if (node.type === "superscript") return validateMathNode(node.base, depth + 1, count) && validateMathNode(node.exponent, depth + 1, count);
  if (node.type === "subscript") return validateMathNode(node.base, depth + 1, count) && validateMathNode(node.subscript, depth + 1, count);
  if (node.type === "summation" || node.type === "product") return validateMathNode(node.lower, depth + 1, count) && validateMathNode(node.upper, depth + 1, count) && validateMathNode(node.body, depth + 1, count);
  if (node.type === "integral") return validateMathNode(node.lower, depth + 1, count) && validateMathNode(node.upper, depth + 1, count) && validateMathNode(node.body, depth + 1, count) && validateMathNode(node.variable, depth + 1, count);
  return validateMathNode(node.variable, depth + 1, count) && validateMathNode(node.approach, depth + 1, count) && validateMathNode(node.body, depth + 1, count);
}

export function decodeMathExpressionTree(encoded: string | null | undefined): MathExpressionNode | null {
  if (!encoded || encoded.length > 30000) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    return validateMathNode(parsed) ? parsed : null;
  } catch { return null; }
}

export function buildMathExpressionHtml(node: MathExpressionNode): string {
  return `<math data-math-expression="tree" data-math-tree="${encodeMathExpressionTree(node)}" contenteditable="false"><mstyle displaystyle="true">${renderMathExpressionMathMl(node)}</mstyle></math>`;
}

const legacyText = (value: string | null | undefined, fallback: string) => createMathText(value?.trim() || fallback);
export function readMathExpressionTree(math: Element): MathExpressionNode | null {
  const stored = decodeMathExpressionTree(math.getAttribute("data-math-tree"));
  if (stored) return stored;
  const type = math.getAttribute("data-math-expression");
  if (type === "root") {
    const root = math.querySelector("mroot, msqrt");
    if (!root) return null;
    return { type: "root", id: createMathNodeId(), index: legacyText(root.tagName.toLowerCase() === "msqrt" ? "2" : root.children[1]?.textContent, "2"), radicand: legacyText(root.children[0]?.textContent || root.textContent, "value") };
  }
  if (type === "fraction") {
    const fraction = math.querySelector("mfrac");
    if (!fraction) return null;
    let result: MathExpressionNode = { type: "fraction", id: createMathNodeId(), numerator: legacyText(fraction.children[0]?.textContent, "numerator"), denominator: legacyText(fraction.children[1]?.textContent, "denominator") };
    const opening = Array.from(math.querySelectorAll("mo")).find((item) => ["(", "[", "{"].includes(item.textContent?.trim() || ""))?.textContent?.trim();
    if (opening) result = { type: "brackets", id: createMathNodeId(), style: opening === "[" ? "brackets" : opening === "{" ? "braces" : "parentheses", body: result };
    const exponent = math.querySelector("msup")?.lastElementChild?.textContent?.trim();
    if (exponent) result = { type: "superscript", id: createMathNodeId(), base: result, exponent: createMathText(exponent) };
    return result;
  }
  if (type === "summation" || type === "product" || type === "integral") {
    const limits = math.querySelector("munderover");
    const texts = Array.from(math.querySelectorAll("mtext"));
    const body = texts.find((item) => !limits?.contains(item))?.textContent;
    if (type === "integral") return { type, id: createMathNodeId(), lower: legacyText(limits?.children[1]?.textContent, "a"), upper: legacyText(limits?.children[2]?.textContent, "b"), body: legacyText(body, "f(x)"), variable: legacyText(math.querySelector("mi")?.nextElementSibling?.textContent, "x") };
    return { type, id: createMathNodeId(), lower: legacyText(limits?.children[1]?.textContent, "i = 1"), upper: legacyText(limits?.children[2]?.textContent, "n"), body: legacyText(body, "expression") };
  }
  if (type === "limit") {
    const under = math.querySelector("munder");
    const underText = under?.textContent || "x→0";
    const [variable, approach] = underText.replace(/^lim/, "").split("→");
    const body = Array.from(math.querySelectorAll("mtext")).find((item) => !under?.contains(item))?.textContent;
    return { type: "limit", id: createMathNodeId(), variable: legacyText(variable, "x"), approach: legacyText(approach, "0"), body: legacyText(body, "f(x)") };
  }
  return null;
}
