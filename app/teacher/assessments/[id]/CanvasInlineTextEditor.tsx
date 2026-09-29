"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getCanvasTextHtml, type DragDropCanvasElement } from "@/lib/dragDrop";
import { normalizeFractionParentheses } from "@/lib/mathExpressions";
import { buildMathExpressionHtml, createEmptyMathExpression, readMathExpressionTree, type MathExpressionNode } from "@/lib/mathExpressionTree";
import MathExpressionComposer from "./MathExpressionComposer";
import TextScriptIcon from "./TextScriptIcon";
import { ACTIVE_TEXT_TOOLBAR_BUTTON } from "./textEditorToolbarStyles";
import { exitTextBoxAtCaret, insertLineInTextBox, removeTextBoxAtCaret, activateInlineScript, normalizeFractionBracketsAtCaret, placeCaretAfterMath, toggleTextBoxAtCaret } from "./richTextEditing";

export default function CanvasInlineTextEditor({ element, selected, editing, toolbarPlacement = "above", onChange, onMovePointerDown, onStartEditing, onDelete }: {
  element: DragDropCanvasElement;
  selected: boolean;
  editing: boolean;
  toolbarPlacement?: "above" | "below";
  onChange: (patch: Partial<DragDropCanvasElement>) => void;
  onMovePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onStartEditing: () => void;
  onDelete: () => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const focusedOnOpenRef = useRef(false);
  const requestedCaretPointRef = useRef<{ x: number; y: number } | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const editingMathRef = useRef<Element | null>(null);
  const [editingExistingMath, setEditingExistingMath] = useState(false);
  const [mathPanel, setMathPanel] = useState<"editable" | null>(null);
  const [mathTree, setMathTree] = useState<MathExpressionNode>(() => createEmptyMathExpression());
  const [horizontalAlign, setHorizontalAlign] = useState<"left" | "center" | "right">("left");
  const [inlineFormat, setInlineFormat] = useState({ subscript: false, superscript: false, textBox: false });

  useEffect(() => {
    function refreshHorizontalAlign() {
      const editor = editorRef.current;
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return;
      const selectedNode = range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement;
      const computedAlignment = selectedNode ? getComputedStyle(selectedNode).textAlign : "left";
      setHorizontalAlign(
        document.queryCommandState("justifyCenter") || computedAlignment === "center"
          ? "center"
          : document.queryCommandState("justifyRight") || computedAlignment === "right" || computedAlignment === "end"
            ? "right"
            : "left",
      );
      const selectedElement = selectedNode?.closest("sub, sup, [data-text-box=\"true\"]");
      setInlineFormat({
        subscript: selectedElement?.tagName === "SUB" || document.queryCommandState("subscript"),
        superscript: selectedElement?.tagName === "SUP" || document.queryCommandState("superscript"),
        textBox: Boolean(selectedNode?.closest('[data-text-box="true"]')),
      });
    }

    document.addEventListener("selectionchange", refreshHorizontalAlign);
    return () => document.removeEventListener("selectionchange", refreshHorizontalAlign);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const html = getCanvasTextHtml(element);
    if (!editor) return;
    if (document.activeElement !== editor && editor.innerHTML !== html) editor.innerHTML = html;
    if (editing && !focusedOnOpenRef.current) {
      editor.focus();
      focusedOnOpenRef.current = true;
      const caretPoint = requestedCaretPointRef.current;
      requestedCaretPointRef.current = null;
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || !editor.isConnected) return;
        const caretDocument = document as Document & {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        let range: Range | null = null;
        if (caretPoint) {
          const position = caretDocument.caretPositionFromPoint?.(caretPoint.x, caretPoint.y);
          if (position && editor.contains(position.offsetNode)) {
            range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
          } else {
            const legacyRange = caretDocument.caretRangeFromPoint?.(caretPoint.x, caretPoint.y);
            if (legacyRange && editor.contains(legacyRange.startContainer)) range = legacyRange;
          }
        }
        if (!range) {
          range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      });
    }
    if (!editing) focusedOnOpenRef.current = false;
  }, [editing, element]);

  function getSafeContent() {
    const editor = editorRef.current;
    if (!editor) return { textHtml: "", text: "" };
    const copy = editor.cloneNode(true) as HTMLDivElement;
    const allowedTags = new Set(["DIV", "P", "BR", "B", "STRONG", "I", "EM", "U", "SUB", "SUP", "MATH", "MSTYLE", "MROW", "MO", "MI", "MN", "MTEXT", "MUNDER", "MOVER", "MUNDEROVER", "MSUB", "MSUP", "MSUBSUP", "MFRAC", "MSQRT", "MROOT", "MPADDED", "MENCLOSE"]);
    Array.from(copy.querySelectorAll("*")).forEach((child) => {
      if (!allowedTags.has(child.tagName.toUpperCase())) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      const textAlign = child instanceof HTMLElement ? child.style.textAlign : "";
      Array.from(child.attributes).forEach((attribute) => {
        const tagName = child.tagName.toUpperCase();
        const keepMathType = tagName === "MATH" && attribute.name === "data-math-expression";
        const keepMathTree = tagName === "MATH" && attribute.name === "data-math-tree" && attribute.value.length <= 30000;
        const keepMathEditing = tagName === "MATH" && attribute.name === "contenteditable" && attribute.value === "false";
        const keepDisplayStyle = tagName === "MSTYLE" && attribute.name === "displaystyle" && attribute.value === "true";
        const keepMathPadding = tagName === "MPADDED" &&
          ((attribute.name === "height" && attribute.value === "+0.24em") ||
            (attribute.name === "voffset" && ["0.18em", "-0.22em"].includes(attribute.value)));
        const keepMathStretchy = tagName === "MO" &&
          ((["stretchy", "fence", "symmetric"].includes(attribute.name) && attribute.value === "true") ||
            (attribute.name === "minsize" && attribute.value === "2em"));
        const keepTextBox = tagName === "DIV" && attribute.name === "data-text-box" && attribute.value === "true";
        const keepMathEnclosure = tagName === "MENCLOSE" && attribute.name === "notation" && attribute.value === "top";
        const keepRadicalOverline = tagName === "MROW" && attribute.name === "data-radical-overline" && attribute.value === "true";
        if (!keepMathType && !keepMathTree && !keepMathEditing && !keepDisplayStyle && !keepMathPadding && !keepMathStretchy && !keepTextBox && !keepMathEnclosure && !keepRadicalOverline) child.removeAttribute(attribute.name);
      });
      if (child instanceof HTMLElement && ["left", "center", "right"].includes(textAlign)) child.style.textAlign = textAlign;
    });
    return { textHtml: normalizeFractionParentheses(copy.innerHTML.replaceAll("\u200B", "")), text: editor.innerText.replaceAll("\u200B", "") };
  }

  function emitChange() {
    onChange({ ...getSafeContent(), textAlign: undefined, bold: undefined, italic: undefined, underline: undefined });
  }

  function runCommand(command: string, commandValue?: string) {
    if (!editing) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    if (command === "justifyLeft") setHorizontalAlign("left");
    if (command === "justifyCenter") setHorizontalAlign("center");
    if (command === "justifyRight") setHorizontalAlign("right");
    emitChange();
  }

  function applyInlineScript(kind: "subscript" | "superscript") {
    const editor = editorRef.current;
    if (!editing || !editor || !activateInlineScript(editor, kind)) return;
    const turningOff = kind === "subscript" ? inlineFormat.subscript : inlineFormat.superscript;
    setInlineFormat({
      subscript: !turningOff && kind === "subscript",
      superscript: !turningOff && kind === "superscript",
      textBox: inlineFormat.textBox,
    });
    emitChange();
  }

  function toggleTextBox() {
    const editor = editorRef.current;
    if (!editing || !editor || !toggleTextBoxAtCaret(editor)) return;
    setInlineFormat((current) => ({ ...current, textBox: !current.textBox }));
    emitChange();
  }

  function removeTextBox() {
    const editor = editorRef.current;
    if (!editing || !editor || !removeTextBoxAtCaret(editor)) return;
    setInlineFormat((current) => ({ ...current, textBox: false }));
    emitChange();
  }

  function exitTextBox() {
    const editor = editorRef.current;
    if (!editing || !editor || !exitTextBoxAtCaret(editor)) return;
    setInlineFormat((current) => ({ ...current, textBox: false }));
    emitChange();
  }

  function toggleMathPanel() {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    savedRangeRef.current = range && editorRef.current?.contains(range.commonAncestorContainer) ? range.cloneRange() : savedRangeRef.current;
    editingMathRef.current = null;
    setEditingExistingMath(false);
    setMathTree(createEmptyMathExpression());
    setMathPanel((current) => current === "editable" ? null : "editable");
  }

  function insertMathHtml(html: string) {
    if (!editing || !editorRef.current) return;
    const editor = editorRef.current;
    const template = document.createElement("template");
    template.innerHTML = html;
    const typingPoint = document.createTextNode("\u200B");
    const editingMath = editingMathRef.current;
    const replacingExistingMath = Boolean(editingMath?.isConnected);
    if (replacingExistingMath && editingMath) {
      const replacement = template.content.firstElementChild;
      if (!replacement) return;
      editingMath.replaceWith(replacement);
      replacement.after(typingPoint);
    } else {
      template.content.appendChild(typingPoint);
    }
    const range = savedRangeRef.current;
    if (!replacingExistingMath && range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(template.content);
    } else if (!replacingExistingMath) {
      editor.appendChild(template.content);
    }
    const nextRange = document.createRange();
    nextRange.setStart(typingPoint, typingPoint.length);
    nextRange.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(nextRange);
    savedRangeRef.current = null;
    editingMathRef.current = null;
    setEditingExistingMath(false);
    setMathPanel(null);
    editor.focus();
    emitChange();
  }

  function editRenderedMath(target: EventTarget | null) {
    const math = target instanceof Element
      ? target.closest("math[data-math-expression]")
      : null;
    if (!math || !editorRef.current?.contains(math)) return false;
    const tree = readMathExpressionTree(math);
    if (!tree) return false;
    editingMathRef.current = math;
    setEditingExistingMath(true);
    setMathTree(tree);
    setMathPanel("editable");
    return true;
  }

  function removeEditedMath() {
    const editor = editorRef.current;
    const editingMath = editingMathRef.current;
    if (!editing || !editor || !editingMath?.isConnected || !editor.contains(editingMath)) return;

    const typingPoint = document.createTextNode("\u200B");
    editingMath.replaceWith(typingPoint);
    const range = document.createRange();
    range.setStart(typingPoint, typingPoint.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = null;
    editingMathRef.current = null;
    setEditingExistingMath(false);
    setMathPanel(null);
    editor.focus();
    emitChange();
  }

  const toolbarButton = "grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-blue-50";

  return <>
    {selected && <div data-canvas-object className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] flex-col items-start gap-1 ${toolbarPlacement === "below" ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <div className="flex w-max max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1.5 shadow-lg">
        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">Size<input type="number" min="10" max="72" value={element.fontSize || 18} onChange={(event) => onChange({ fontSize: Math.max(10, Math.min(72, Number(event.target.value) || 18)) })} className="h-7 w-14 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
        {editing ? <>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} className={`${toolbarButton} font-bold`} aria-label="Bold selected text">B</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} className={`${toolbarButton} italic`} aria-label="Italicize selected text">I</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")} className={`${toolbarButton} underline`} aria-label="Underline selected text">U</button>
          {(["Left", "Center", "Right"] as const).map((alignment) => { const selectedAlignment = horizontalAlign === alignment.toLowerCase(); return <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(`justify${alignment}`)} aria-pressed={selectedAlignment} className={`${toolbarButton} ${selectedAlignment ? ACTIVE_TEXT_TOOLBAR_BUTTON : ""}`} aria-label={`Align selected paragraph ${alignment.toLowerCase()}`} title={`Align ${alignment.toLowerCase()}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">{alignment === "Left" ? <path d="M3 4h14M3 8h9M3 12h14M3 16h9" /> : alignment === "Center" ? <path d="M3 4h14M5.5 8h9M3 12h14M5.5 16h9" /> : <path d="M3 4h14M8 8h9M3 12h14M8 16h9" />}</svg></button>; })}
          {(["top", "middle", "bottom"] as const).map((alignment) => <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange({ verticalAlign: alignment })} aria-pressed={(element.verticalAlign || "top") === alignment} className={`${toolbarButton} ${(element.verticalAlign || "top") === alignment ? ACTIVE_TEXT_TOOLBAR_BUTTON : ""}`} aria-label={`Align text to the ${alignment}`} title={`Align ${alignment}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M3 3h14M3 17h14" />{alignment === "top" ? <path d="M6 6h8M8 9h4" /> : alignment === "middle" ? <path d="M6 8h8M8 11h4" /> : <path d="M8 11h4M6 14h8" />}</svg></button>)}
          <button type="button" title="Math expression builder" aria-label="Math expression builder" onMouseDown={(event) => event.preventDefault()} onClick={toggleMathPanel} aria-pressed={mathPanel === "editable"} className={`${toolbarButton} ${mathPanel === "editable" ? ACTIVE_TEXT_TOOLBAR_BUTTON : ""}`}><span className="text-sm" aria-hidden="true">∑</span></button>
          <button type="button" title="Subscript" aria-label="Subscript" aria-pressed={inlineFormat.subscript} onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineScript("subscript")} className={`${toolbarButton} ${inlineFormat.subscript ? ACTIVE_TEXT_TOOLBAR_BUTTON : ""}`}><TextScriptIcon kind="subscript" /></button>
          <button type="button" title="Superscript" aria-label="Superscript" aria-pressed={inlineFormat.superscript} onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineScript("superscript")} className={`${toolbarButton} ${inlineFormat.superscript ? ACTIVE_TEXT_TOOLBAR_BUTTON : ""}`}><TextScriptIcon kind="superscript" /></button>
          <button type="button" title="Toggle box around text" aria-label="Toggle box around text" aria-pressed={inlineFormat.textBox} onMouseDown={(event) => event.preventDefault()} onClick={toggleTextBox} className={`${toolbarButton} ${inlineFormat.textBox ? ACTIVE_TEXT_TOOLBAR_BUTTON : ""}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-5" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="M6 9h12M6 13h9M6 17h11" /></svg></button>
          <button type="button" title="Remove box but keep text" aria-label="Remove box but keep text" disabled={!inlineFormat.textBox} onMouseDown={(event) => event.preventDefault()} onClick={removeTextBox} className={`${toolbarButton} disabled:opacity-35`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 3" /><path d="M6 9h12M6 13h9M5 21 19 3" /></svg></button>
          <button type="button" title="Exit box and continue on the next line" aria-label="Exit box and continue on the next line" disabled={!inlineFormat.textBox} onMouseDown={(event) => event.preventDefault()} onClick={exitTextBox} className={`${toolbarButton} disabled:opacity-35`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-5" aria-hidden="true"><rect x="3" y="3" width="13" height="12" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M10 9h9v10m0 0-4-4m4 4 4-4" /></svg></button>
        </> : null}
        <button type="button" onClick={onDelete} className={`${toolbarButton} border-red-300 text-red-700`}>Delete</button>
      </div>
      {editing && mathPanel === "editable" && <div className="w-[48rem] max-w-full">
        <MathExpressionComposer
          value={mathTree}
          onChange={setMathTree}
          onCommit={() => insertMathHtml(buildMathExpressionHtml(mathTree))}
          onCancel={() => { editingMathRef.current = null; setEditingExistingMath(false); setMathPanel(null); }}
          onDelete={removeEditedMath}
          editingExisting={editingExistingMath}
          compact
        />
      </div>}
    </div>}
    <div className={`flex h-full w-full flex-col overflow-auto ${element.verticalAlign === "middle" ? "justify-center" : element.verticalAlign === "bottom" ? "justify-end" : "justify-start"} ${editing ? "cursor-text bg-white/80 ring-2 ring-inset ring-blue-400" : "cursor-move"}`} onPointerDown={(event) => { if (editing) event.stopPropagation(); else onMovePointerDown(event); }}>
      <div
        ref={editorRef}
        contentEditable={editing}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Canvas text"
        aria-multiline="true"
        onPointerDown={(event) => {
          const clickedMath = event.target instanceof Element && event.target.closest("math[data-math-expression]");
          if (clickedMath) {
            event.preventDefault();
            event.stopPropagation();
            if (editing) placeCaretAfterMath(event.currentTarget, event.target);
            return;
          }
          if (editing) event.stopPropagation();
        }}
        onClick={(event) => { if (editing) event.stopPropagation(); }}
        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (editRenderedMath(event.target)) { onStartEditing(); return; } requestedCaretPointRef.current = { x: event.clientX, y: event.clientY }; setMathPanel(null); onStartEditing(); }}
        onKeyDown={(event) => {
          if (editing && event.key === "Enter" && !event.nativeEvent.isComposing && insertLineInTextBox(event.currentTarget)) {
            event.preventDefault();
            event.stopPropagation();
            emitChange();
          }
        }}
        onInput={() => {
          if (editorRef.current) normalizeFractionBracketsAtCaret(editorRef.current);
          emitChange();
        }}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          emitChange();
        }}
        className="rich-text-content min-h-[1lh] w-full text-slate-950 outline-none"
        style={{ fontSize: `${(element.fontSize || 18) / 10}cqw`, padding: "0.8cqw" }}
      />
    </div>
  </>;
}
