export type InlineScriptKind = "subscript" | "superscript";

const CARET_MARKER = "\uE000";

function adjacentTextPosition(editor: HTMLElement, math: Element, direction: "before" | "after") {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const candidates: Array<{ node: Text; index: number; character: string }> = [];
  let current = walker.nextNode();
  while (current) {
    if (!math.contains(current)) {
      const relation = current.compareDocumentPosition(math);
      const belongs = direction === "before"
        ? Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING)
        : Boolean(relation & Node.DOCUMENT_POSITION_PRECEDING);
      if (belongs) {
        const value = current.textContent || "";
        const indexes = direction === "before"
          ? Array.from({ length: value.length }, (_, index) => value.length - index - 1)
          : Array.from({ length: value.length }, (_, index) => index);
        const index = indexes.find((candidate) => !/[\s\u00A0\u200B\uE000]/.test(value[candidate]));
        if (index !== undefined) candidates.push({ node: current as Text, index, character: value[index] });
      }
    }
    current = walker.nextNode();
  }
  return direction === "before" ? candidates.at(-1) : candidates[0];
}

function stretchAdjacentFractionBrackets(editor: HTMLElement) {
  let changed = false;
  editor.querySelectorAll('math[data-math-expression="fraction"]').forEach((math) => {
    if (math.querySelector("mo")) return;
    const fraction = math.querySelector("mfrac");
    const before = adjacentTextPosition(editor, math, "before");
    const after = adjacentTextPosition(editor, math, "after");
    if (!fraction || !before || !after) return;
    const matching = (before.character === "(" && after.character === ")")
      || (before.character === "[" && after.character === "]")
      || (before.character === "{" && after.character === "}");
    if (!matching) return;

    before.node.deleteData(before.index, 1);
    after.node.deleteData(after.index, 1);
    const fence = (value: string) => `<mo fence="true" stretchy="true" symmetric="true" minsize="2em">${value}</mo>`;
    const template = document.createElement("template");
    template.innerHTML = `<math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true"><mrow>${fence(before.character)}${fraction.outerHTML}${fence(after.character)}</mrow></mstyle></math>`;
    math.replaceWith(template.content);
    changed = true;
  });
  return changed;
}

function placeCaretAtMarker(editor: HTMLElement) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const index = node.textContent?.indexOf(CARET_MARKER) ?? -1;
    if (index >= 0) {
      const textNode = node as Text;
      textNode.deleteData(index, CARET_MARKER.length);
      const range = document.createRange();
      range.setStart(textNode, index);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

export function normalizeFractionBracketsAtCaret(editor: HTMLElement) {
  const context = getEditorRange(editor);
  if (!context?.range.collapsed) return false;

  const marker = document.createTextNode(CARET_MARKER);
  context.range.insertNode(marker);
  const changed = stretchAdjacentFractionBrackets(editor);
  if (!changed) {
    const parent = marker.parentNode;
    const previous = marker.previousSibling;
    const next = marker.nextSibling;
    marker.remove();
    const range = document.createRange();
    if (next?.nodeType === Node.TEXT_NODE) range.setStart(next, 0);
    else if (previous?.nodeType === Node.TEXT_NODE) range.setStart(previous, previous.textContent?.length || 0);
    else if (parent) range.setStart(parent, Math.min(context.range.startOffset, parent.childNodes.length));
    else return false;
    range.collapse(true);
    context.selection.removeAllRanges();
    context.selection.addRange(range);
    return false;
  }

  placeCaretAtMarker(editor);
  editor.focus({ preventScroll: true });
  return true;
}

export function getEditorRange(editor: HTMLElement) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  return selection && range && editor.contains(range.commonAncestorContainer)
    ? { selection, range }
    : null;
}

export function focusEditorRange(editor: HTMLElement, range?: Range | null) {
  editor.focus({ preventScroll: true });
  if (!range || !editor.contains(range.commonAncestorContainer)) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function placeCaretAfterMath(editor: HTMLElement, target: EventTarget | null) {
  const math = target instanceof Element ? target.closest("math[data-math-expression]") : null;
  if (!math || !editor.contains(math)) return false;

  let typingPoint = math.nextSibling;
  if (typingPoint?.nodeType !== Node.TEXT_NODE || !typingPoint.textContent?.startsWith("\u200B")) {
    typingPoint = document.createTextNode("\u200B");
    math.after(typingPoint);
  }
  const range = document.createRange();
  range.setStart(typingPoint, 1);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.focus({ preventScroll: true });
  return true;
}

export function activateInlineScript(editor: HTMLElement, kind: InlineScriptKind) {
  const context = getEditorRange(editor);
  if (!context) return false;
  const { selection, range } = context;
  editor.focus({ preventScroll: true });

  if (!range.collapsed) {
    document.execCommand(kind);
    editor.focus({ preventScroll: true });
    return true;
  }

  const startElement = range.startContainer instanceof HTMLElement
    ? range.startContainer
    : range.startContainer.parentElement;
  const currentScript = startElement?.closest("sub, sup");
  const expectedTag = kind === "subscript" ? "SUB" : "SUP";
  if (currentScript?.tagName === expectedTag) {
    exitInlineScript(editor);
    return true;
  }
  if (currentScript) {
    exitInlineScript(editor);
    return activateInlineScript(editor, kind);
  }

  range.deleteContents();
  const script = document.createElement(kind === "subscript" ? "sub" : "sup");
  const typingPoint = document.createTextNode("\u200B");
  script.appendChild(typingPoint);
  range.insertNode(script);
  const nextRange = document.createRange();
  nextRange.setStart(typingPoint, typingPoint.length);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  editor.focus({ preventScroll: true });
  return true;
}

export function exitInlineScript(editor: HTMLElement) {
  const context = getEditorRange(editor);
  if (!context) return false;
  const { selection, range } = context;
  editor.focus({ preventScroll: true });

  if (!range.collapsed) {
    if (document.queryCommandState("subscript")) document.execCommand("subscript");
    if (document.queryCommandState("superscript")) document.execCommand("superscript");
    editor.focus({ preventScroll: true });
    return true;
  }

  const startElement = range.startContainer instanceof HTMLElement
    ? range.startContainer
    : range.startContainer.parentElement;
  const script = startElement?.closest("sub, sup");
  if (script && script !== editor && script.parentNode) {
    const typingPoint = document.createTextNode("\u200B");
    script.parentNode.insertBefore(typingPoint, script.nextSibling);
    const nextRange = document.createRange();
    nextRange.setStart(typingPoint, typingPoint.length);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
  } else {
    if (document.queryCommandState("subscript")) document.execCommand("subscript");
    if (document.queryCommandState("superscript")) document.execCommand("superscript");
  }
  editor.focus({ preventScroll: true });
  return true;
}

function getTextBoxContext(editor: HTMLElement) {
  const context = getEditorRange(editor);
  if (!context) return null;
  const node = context.range.startContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const box = element?.closest('[data-text-box="true"]');
  if (!box || box === editor || !editor.contains(box) || !box.contains(context.range.endContainer)) return null;
  return { ...context, box };
}

export function insertLineInTextBox(editor: HTMLElement) {
  const context = getTextBoxContext(editor);
  if (!context) return false;
  const { range } = context;
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  const typingPoint = document.createTextNode("\u200B");
  fragment.append(document.createElement("br"), typingPoint);
  range.insertNode(fragment);
  const next = document.createRange();
  next.setStart(typingPoint, typingPoint.length);
  next.collapse(true);
  focusEditorRange(editor, next);
  return true;
}

export function removeTextBoxAtCaret(editor: HTMLElement) {
  const context = getTextBoxContext(editor);
  if (!context) return false;
  context.box.removeAttribute("data-text-box");
  focusEditorRange(editor, context.range);
  return true;
}

export function exitTextBoxAtCaret(editor: HTMLElement) {
  const context = getTextBoxContext(editor);
  if (!context) return false;
  const row = document.createElement("div");
  row.appendChild(document.createElement("br"));
  context.box.after(row);
  const next = document.createRange();
  next.selectNodeContents(row);
  next.collapse(true);
  focusEditorRange(editor, next);
  return true;
}

export function toggleTextBoxAtCaret(editor: HTMLElement) {
  const context = getEditorRange(editor);
  if (!context) return false;
  const { selection, range } = context;
  const startElement = range.startContainer instanceof HTMLElement
    ? range.startContainer
    : range.startContainer.parentElement;
  const existingBox = startElement?.closest('[data-text-box="true"]');
  if (existingBox && existingBox !== editor) {
    existingBox.removeAttribute("data-text-box");
    editor.focus({ preventScroll: true });
    return true;
  }

  editor.focus({ preventScroll: true });
  document.execCommand("formatBlock", false, "div");
  const updated = getEditorRange(editor);
  const updatedElement = updated?.range.startContainer instanceof HTMLElement
    ? updated.range.startContainer
    : updated?.range.startContainer.parentElement;
  const row = updatedElement?.closest("div");
  if (row && row !== editor) {
    row.setAttribute("data-text-box", "true");
  } else {
    const box = document.createElement("div");
    box.setAttribute("data-text-box", "true");
    const contents = range.extractContents();
    box.appendChild(contents.hasChildNodes() ? contents : document.createElement("br"));
    range.insertNode(box);
    const boxRange = document.createRange();
    boxRange.selectNodeContents(box);
    boxRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(boxRange);
  }
  editor.focus({ preventScroll: true });
  return true;
}
