"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeFractionParentheses } from "@/lib/mathExpressions";
import { buildMathExpressionHtml, createEmptyMathExpression, readMathExpressionTree, type MathExpressionNode } from "@/lib/mathExpressionTree";
import MathExpressionComposer from "./MathExpressionComposer";
import ChoiceNumberLineBuilder from "./ChoiceNumberLineBuilder";
import { buildChoiceNumberLineHtml, DEFAULT_CHOICE_NUMBER_LINE, parseChoiceNumberLine, type ChoiceNumberLine } from "@/lib/choiceNumberLine";
import TextScriptIcon from "./TextScriptIcon";
import { ACTIVE_TEXT_TOOLBAR_BUTTON } from "./textEditorToolbarStyles";
import { exitTextBoxAtCaret, insertLineInTextBox, removeTextBoxAtCaret, activateInlineScript, normalizeFractionBracketsAtCaret, placeCaretAfterMath, toggleTextBoxAtCaret } from "./richTextEditing";

const FONT_SIZE_STEPS = [10, 13, 16, 18, 24, 32, 48];

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeight?: string;
  allowNumberLines?: boolean;
  verticalAlign?: "top" | "middle" | "bottom";
  onVerticalAlignChange?: (alignment: "top" | "middle" | "bottom") => void;
};

type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
  subscript: boolean;
  textBox: boolean;
  fontSize: string;
  alignment: "left" | "center" | "right";
};

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = "9rem",
  allowNumberLines = false,
  verticalAlign,
  onVerticalAlignChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const editingMathRef = useRef<Element | null>(null);
  const [editingExistingMath, setEditingExistingMath] = useState(false);
  const [showTableControls, setShowTableControls] = useState(false);
  const [numberLineDraft, setNumberLineDraft] = useState<ChoiceNumberLine | null>(null);
  const editingNumberLineRef = useRef<Element | null>(null);
  const [numberLineRevision, setNumberLineRevision] = useState(0);
  const [mathTree, setMathTree] = useState<MathExpressionNode>(() => createEmptyMathExpression());
  const [showRootControls, setShowRootControls] = useState(false);
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>({
    bold: false,
    italic: false,
    underline: false,
    superscript: false,
    subscript: false,
    textBox: false,
    fontSize: "3",
    alignment: "left",
  });
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableHasBorder, setTableHasBorder] = useState(true);
  const [localVerticalAlign, setLocalVerticalAlign] = useState<"top" | "middle" | "bottom">("top");
  const currentVerticalAlign = verticalAlign || localVerticalAlign;

  function changeVerticalAlign(alignment: "top" | "middle" | "bottom") {
    if (onVerticalAlignChange) onVerticalAlignChange(alignment);
    else setLocalVerticalAlign(alignment);
  }

  useEffect(() => {
    if (
      editorRef.current &&
      document.activeElement !== editorRef.current &&
      editorRef.current.innerHTML !== value
    ) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateActiveFormats);
    return () => document.removeEventListener("selectionchange", updateActiveFormats);
  }, []);

  function updateActiveFormats() {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const editor = editorRef.current;
    if (!range || !editor?.contains(range.commonAncestorContainer)) {
      return;
    }

    const startElement =
      range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement;
    const nearestBold = startElement?.closest("b, strong");
    const nearestItalic = startElement?.closest("i, em");
    const nearestSuperscript = startElement?.closest("sup");
    const nearestSubscript = startElement?.closest("sub");
    const nearestFont = startElement?.closest("font");
    const nearestTextBox = startElement?.closest('[data-text-box="true"]');
    const commandFontSize = String(document.queryCommandValue("fontSize") || "3");
    const elementFontSize = nearestFont?.getAttribute("size") || "";
    const fontSize = /^[1-7]$/.test(elementFontSize)
      ? elementFontSize
      : /^[1-7]$/.test(commandFontSize)
      ? commandFontSize
      : "3";

    setActiveFormats({
      bold: Boolean(nearestBold) || document.queryCommandState("bold"),
      italic: Boolean(nearestItalic) || document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      superscript:
        Boolean(nearestSuperscript) || document.queryCommandState("superscript"),
      subscript:
        Boolean(nearestSubscript) || document.queryCommandState("subscript"),
      textBox: Boolean(nearestTextBox),
      fontSize,
      alignment: document.queryCommandState("justifyCenter") ? "center" : document.queryCommandState("justifyRight") ? "right" : "left",
    });
  }

  function getSafeHtml() {
    if (!editorRef.current) return "";

    const copy = editorRef.current.cloneNode(true) as HTMLDivElement;
    const allowedTags = new Set([
      "DIV", "P", "BR", "B", "STRONG", "I", "EM", "U", "FONT", "SUB", "SUP",
      "TABLE", "TBODY", "THEAD", "TR", "TH", "TD",
      "MATH", "MSTYLE", "MROW", "MO", "MI", "MN", "MTEXT", "MUNDER",
      "MOVER", "MUNDEROVER", "MSUB", "MSUP", "MSUBSUP", "MFRAC", "MSQRT", "MROOT", "MPADDED", "MENCLOSE",
    ]);

    Array.from(copy.querySelectorAll("*")).forEach((element) => {
      if (!copy.contains(element)) return;
      if (element.hasAttribute("data-choice-number-line")) {
        const config = parseChoiceNumberLine(element.getAttribute("data-choice-number-line") || "");
        if (config) {
          const template = document.createElement("template");
          template.innerHTML = buildChoiceNumberLineHtml(config);
          element.replaceWith(template.content);
          return;
        }
        element.remove();
        return;
      }
      if (!allowedTags.has(element.tagName.toUpperCase())) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }

      Array.from(element.attributes).forEach((attribute) => {
        const keepFontSize =
          element.tagName === "FONT" && attribute.name === "size";
        const keepTableBorder =
          element.tagName === "TABLE" && attribute.name === "data-border";
        const keepTextBox =
          element.tagName === "DIV" && attribute.name === "data-text-box";
        const keepTextAlignment =
          attribute.name === "style" && /^(?:text-align:\s*(?:left|center|right);?\s*)$/i.test(attribute.value);
        const keepMathType =
          element.tagName.toUpperCase() === "MATH" && attribute.name === "data-math-expression";
        const keepMathTree =
          element.tagName.toUpperCase() === "MATH" && attribute.name === "data-math-tree" && attribute.value.length <= 30000;
        const keepMathEditing =
          element.tagName.toUpperCase() === "MATH" && attribute.name === "contenteditable" && attribute.value === "false";
        const keepDisplayStyle =
          element.tagName.toUpperCase() === "MSTYLE" && attribute.name === "displaystyle" && attribute.value === "true";
        const keepMathPadding =
          element.tagName.toUpperCase() === "MPADDED" &&
          ((attribute.name === "height" && attribute.value === "+0.24em") ||
            (attribute.name === "voffset" && ["0.18em", "-0.22em"].includes(attribute.value)));
        const keepMathStretchy =
          element.tagName.toUpperCase() === "MO" &&
          ((["stretchy", "fence", "symmetric"].includes(attribute.name) && attribute.value === "true") ||
            (attribute.name === "minsize" && attribute.value === "2em"));
        const keepMathEnclosure = element.tagName.toUpperCase() === "MENCLOSE" && attribute.name === "notation" && attribute.value === "top";
        const keepRadicalOverline = element.tagName.toUpperCase() === "MROW" && attribute.name === "data-radical-overline" && attribute.value === "true";
        if (!keepFontSize && !keepTableBorder && !keepTextBox && !keepTextAlignment && !keepMathType && !keepMathTree && !keepMathEditing && !keepDisplayStyle && !keepMathPadding && !keepMathStretchy && !keepMathEnclosure && !keepRadicalOverline) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return normalizeFractionParentheses(copy.innerHTML.replaceAll("\u200B", ""));
  }

  function emitChange() {
    onChange(getSafeHtml());
  }

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
    updateActiveFormats();
  }

  function changeFontSize(direction: -1 | 1) {
    const currentCommandSize = Math.min(
      7,
      Math.max(1, Number(activeFormats.fontSize) || 3)
    );
    const nextCommandSize = Math.min(
      7,
      Math.max(1, currentCommandSize + direction)
    );
    runCommand("fontSize", String(nextCommandSize));
  }

  function saveEditorSelection() {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    savedRangeRef.current =
      range && editorRef.current?.contains(range.commonAncestorContainer)
        ? range.cloneRange()
        : null;
  }

  function toggleTextBox() {
    const editor = editorRef.current;
    if (editor && toggleTextBoxAtCaret(editor)) { emitChange(); updateActiveFormats(); }
  }

  function removeCurrentTextBox() {
    const editor = editorRef.current;
    if (editor && removeTextBoxAtCaret(editor)) { emitChange(); updateActiveFormats(); }
  }

  function exitCurrentTextBox() {
    const editor = editorRef.current;
    if (editor && exitTextBoxAtCaret(editor)) { emitChange(); updateActiveFormats(); }
  }

  function applyInlineScript(kind: "subscript" | "superscript") {
    const editor = editorRef.current;
    if (!editor || !activateInlineScript(editor, kind)) return;
    emitChange();
    updateActiveFormats();
  }

  function openNumberLineControls() {
    saveEditorSelection();
    editingNumberLineRef.current = null;
    setNumberLineDraft({ ...DEFAULT_CHOICE_NUMBER_LINE });
    setNumberLineRevision((revision) => revision + 1);
    setShowRootControls(false);
    setShowTableControls(false);
  }

  function editRenderedNumberLine(target: EventTarget | null) {
    const node = target instanceof Element ? target.closest("[data-choice-number-line]") : null;
    if (!allowNumberLines || !node || !editorRef.current?.contains(node)) return false;
    const config = parseChoiceNumberLine(node.getAttribute("data-choice-number-line") || "");
    if (!config) return false;
    editingNumberLineRef.current = node;
    setNumberLineDraft(config);
    setNumberLineRevision((revision) => revision + 1);
    setShowRootControls(false);
    setShowTableControls(false);
    return true;
  }

  function commitNumberLine(config: ChoiceNumberLine | null) {
    const editor = editorRef.current;
    if (!editor) return;
    const template = document.createElement("template");
    template.innerHTML = config ? buildChoiceNumberLineHtml(config) : "";
    const typingPoint = document.createTextNode("\u200B");
    template.content.appendChild(typingPoint);
    const existing = editingNumberLineRef.current;
    const range = savedRangeRef.current;
    if (existing && editor.contains(existing)) existing.replaceWith(template.content);
    else if (config && range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(template.content);
    } else if (config) editor.appendChild(template.content);
    else return;
    editor.focus();
    const nextRange = document.createRange();
    nextRange.setStartAfter(typingPoint);
    nextRange.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(nextRange);
    savedRangeRef.current = null;
    editingNumberLineRef.current = null;
    setNumberLineDraft(null);
    emitChange();
  }

  function openRootControls() {
    setNumberLineDraft(null);
    saveEditorSelection();
    editingMathRef.current = null;
    setEditingExistingMath(false);
    setMathTree(createEmptyMathExpression());
    setShowRootControls((current) => !current);
  }

  function insertStructuredMath() {
    const editor = editorRef.current;
    if (!editor) return;

    const template = document.createElement("template");
    template.innerHTML = buildMathExpressionHtml(mathTree);
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
    setShowRootControls(false);
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
    setShowRootControls(true);
    setNumberLineDraft(null);
    setShowTableControls(false);
    return true;
  }

  function removeEditedMath() {
    const editor = editorRef.current;
    const editingMath = editingMathRef.current;
    if (!editor || !editingMath?.isConnected || !editor.contains(editingMath)) return;

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
    setShowRootControls(false);
    editor.focus();
    emitChange();
    updateActiveFormats();
  }

  function openTableControls() {
    setNumberLineDraft(null);
    saveEditorSelection();
    setShowTableControls(true);
    setShowRootControls(false);
  }

  function insertTable() {
    const editor = editorRef.current;
    if (!editor) return;

    const table = document.createElement("table");
    table.dataset.border = tableHasBorder ? "true" : "false";
    const body = document.createElement("tbody");

    for (let rowIndex = 0; rowIndex < tableRows; rowIndex += 1) {
      const row = document.createElement("tr");
      for (let columnIndex = 0; columnIndex < tableColumns; columnIndex += 1) {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.textContent =
          rowIndex === 0 ? `Heading ${columnIndex + 1}` : "Cell";
        row.appendChild(cell);
      }
      body.appendChild(row);
    }

    table.appendChild(body);
    const trailingParagraph = document.createElement("p");
    trailingParagraph.appendChild(document.createElement("br"));
    const range = savedRangeRef.current;

    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(trailingParagraph);
      range.insertNode(table);
    } else {
      editor.append(table, trailingParagraph);
    }

    const nextRange = document.createRange();
    nextRange.setStart(trailingParagraph, 0);
    nextRange.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(nextRange);
    savedRangeRef.current = null;
    setShowTableControls(false);
    editor.focus();
    emitChange();
  }

  const toolbarButton =
    "flex h-8 min-w-8 items-center justify-center rounded-md border border-slate-600 bg-slate-800 px-2 text-sm text-slate-100 hover:border-blue-500 hover:bg-slate-700";
  const activeToolbarButton = ACTIVE_TEXT_TOOLBAR_BUTTON;

  return (
    <div className={`relative mt-2 overflow-hidden rounded-xl border border-slate-700 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 ${showRootControls || numberLineDraft ? "z-20" : ""}`}>
      <div className="flex w-max min-w-full flex-nowrap items-center gap-1.5 border-b border-slate-700 bg-slate-900 px-2 py-2 [&>*]:shrink-0">
        <button
          type="button"
          title="Bold"
          aria-label="Bold"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("bold")}
          aria-pressed={activeFormats.bold}
          className={`${toolbarButton} font-bold ${activeFormats.bold ? activeToolbarButton : ""}`}
        >
          B
        </button>
        <button
          type="button"
          title="Italic"
          aria-label="Italic"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("italic")}
          aria-pressed={activeFormats.italic}
          className={`${toolbarButton} italic ${activeFormats.italic ? activeToolbarButton : ""}`}
        >
          I
        </button>
        <button
          type="button"
          title="Underline"
          aria-label="Underline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("underline")}
          aria-pressed={activeFormats.underline}
          className={`${toolbarButton} underline ${activeFormats.underline ? activeToolbarButton : ""}`}
        >
          U
        </button>
        <button
          type="button"
          title="Superscript"
          aria-label="Superscript"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyInlineScript("superscript")}
          aria-pressed={activeFormats.superscript}
          className={`${toolbarButton} ${activeFormats.superscript ? activeToolbarButton : ""}`}
        >
          <TextScriptIcon kind="superscript" />
        </button>
        <button
          type="button"
          title="Subscript"
          aria-label="Subscript"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyInlineScript("subscript")}
          aria-pressed={activeFormats.subscript}
          className={`${toolbarButton} ${activeFormats.subscript ? activeToolbarButton : ""}`}
        >
          <TextScriptIcon kind="subscript" />
        </button>
        <div className="flex h-8 items-stretch overflow-hidden rounded-md border border-slate-600 bg-slate-800" aria-label="Font size">
          <button
            type="button"
            title="Decrease font size"
            aria-label="Decrease font size"
            disabled={activeFormats.fontSize === "1"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeFontSize(-1)}
            className="flex w-8 items-center justify-center border-r border-slate-600 text-base font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
          >
            −
          </button>
          <span
            className="flex min-w-10 items-center justify-center bg-white px-2 text-xs font-semibold tabular-nums text-black"
            title="Current font size"
            aria-live="polite"
          >
            {FONT_SIZE_STEPS[Math.min(7, Math.max(1, Number(activeFormats.fontSize) || 3)) - 1]}
          </span>
          <button
            type="button"
            title="Increase font size"
            aria-label="Increase font size"
            disabled={activeFormats.fontSize === "7"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeFontSize(1)}
            className="flex w-8 items-center justify-center border-l border-slate-600 text-base font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Text alignment">
          {(["left", "center", "right"] as const).map((alignment) => <button key={alignment} type="button" title={`Align ${alignment}`} aria-label={`Align ${alignment}`} aria-pressed={activeFormats.alignment === alignment} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(`justify${alignment[0].toUpperCase()}${alignment.slice(1)}`)} className={`${toolbarButton} ${activeFormats.alignment === alignment ? activeToolbarButton : ""}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">{alignment === "left" ? <path d="M3 4h14M3 8h9M3 12h14M3 16h9" /> : alignment === "center" ? <path d="M3 4h14M5.5 8h9M3 12h14M5.5 16h9" /> : <path d="M3 4h14M8 8h9M3 12h14M8 16h9" />}</svg></button>)}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Vertical text alignment">
          {(["top", "middle", "bottom"] as const).map((alignment) => <button key={alignment} type="button" title={`Align ${alignment}`} aria-label={`Align text to the ${alignment}`} aria-pressed={currentVerticalAlign === alignment} onMouseDown={(event) => event.preventDefault()} onClick={() => changeVerticalAlign(alignment)} className={`${toolbarButton} ${currentVerticalAlign === alignment ? activeToolbarButton : ""}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M3 3h14M3 17h14" />{alignment === "top" ? <path d="M6 6h8M8 9h4" /> : alignment === "middle" ? <path d="M6 8h8M8 11h4" /> : <path d="M8 11h4M6 14h8" />}</svg></button>)}
        </div>
        <span className="mx-1 h-6 w-px bg-slate-700" />
        <button
          type="button"
          title="Toggle full-width text box"
          aria-label="Toggle full-width text box"
          aria-pressed={activeFormats.textBox}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleTextBox}
          className={`${toolbarButton} ${activeFormats.textBox ? activeToolbarButton : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-5" aria-hidden="true">
            <rect x="2.5" y="4" width="19" height="16" rx="2" />
            <path d="M6 9h12M6 13h9M6 17h11" />
          </svg>
        </button>
        <button
          type="button"
          title="Remove box but keep text"
          aria-label="Remove box but keep text"
          disabled={!activeFormats.textBox}
          onMouseDown={(event) => event.preventDefault()}
          onClick={removeCurrentTextBox}
          className={`${toolbarButton} disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-5" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 3" />
            <path d="M6 9h12M6 13h9M5 21 19 3" />
          </svg>
        </button>
        <button
          type="button"
          title="Exit box and continue on the next line"
          aria-label="Exit box and continue on the next line"
          disabled={!activeFormats.textBox}
          onMouseDown={(event) => event.preventDefault()}
          onClick={exitCurrentTextBox}
          className={`${toolbarButton} disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-5" aria-hidden="true">
            <rect x="3" y="3" width="13" height="12" rx="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9h9v10m0 0-4-4m4 4 4-4" />
          </svg>
        </button>
        <button
          type="button"
          title="Insert table"
          aria-label="Insert table"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openTableControls}
          aria-expanded={showTableControls}
          className={`${toolbarButton} ${showTableControls ? activeToolbarButton : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="1" />
            <path d="M3 10h18M9 4v16M15 4v16" />
          </svg>
        </button>
        <button
          type="button"
          title="Math expression builder"
          aria-label="Math expression builder"
          aria-expanded={showRootControls}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openRootControls}
          className={`${toolbarButton} ${showRootControls ? activeToolbarButton : ""}`}
        >
          <span className="text-base" aria-hidden="true">∑</span>
        </button>
        {allowNumberLines && <button type="button" title="Build a number line" aria-label="Build a number line" aria-expanded={Boolean(numberLineDraft)} onMouseDown={(event) => event.preventDefault()} onClick={openNumberLineControls} className={`${toolbarButton} ${numberLineDraft ? activeToolbarButton : ""}`}>↔ Number line</button>}
      </div>
      {allowNumberLines && numberLineDraft && <ChoiceNumberLineBuilder key={numberLineRevision} initial={numberLineDraft} editing={Boolean(editingNumberLineRef.current)} onSave={commitNumberLine} onCancel={() => { setNumberLineDraft(null); editingNumberLineRef.current = null; }} onDelete={() => commitNumberLine(null)} />}
      {showRootControls && (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Build math notation</p>
          <MathExpressionComposer
            value={mathTree}
            onChange={setMathTree}
            onCommit={insertStructuredMath}
            onCancel={() => { editingMathRef.current = null; setEditingExistingMath(false); setShowRootControls(false); }}
            onDelete={removeEditedMath}
            editingExisting={editingExistingMath}
          />
        </div>
      )}
      {showTableControls && (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 text-slate-700">
          <label className="text-xs font-semibold">
            Rows
            <input
              type="number"
              min={1}
              max={12}
              value={tableRows}
              onChange={(event) =>
                setTableRows(
                  Math.min(12, Math.max(1, Number(event.target.value) || 1))
                )
              }
              className="mt-1 block w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold">
            Columns
            <input
              type="number"
              min={1}
              max={8}
              value={tableColumns}
              onChange={(event) =>
                setTableColumns(
                  Math.min(8, Math.max(1, Number(event.target.value) || 1))
                )
              }
              className="mt-1 block w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex h-9 items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={tableHasBorder}
              onChange={(event) => setTableHasBorder(event.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Show borders
          </label>
          <button
            type="button"
            onClick={insertTable}
            className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Insert table
          </button>
          <button
            type="button"
            onClick={() => {
              savedRangeRef.current = null;
              setShowTableControls(false);
            }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}
      <div className={`flex flex-col ${currentVerticalAlign === "middle" ? "justify-center" : currentVerticalAlign === "bottom" ? "justify-end" : "justify-start"}`} style={{ minHeight }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          onPointerDown={(event) => {
            if (event.target instanceof Element && event.target.closest("math[data-math-expression]")) {
              event.preventDefault();
              placeCaretAfterMath(event.currentTarget, event.target);
            }
          }}
          onDoubleClick={(event) => {
            if (!editRenderedNumberLine(event.target) && !editRenderedMath(event.target)) return;
            event.preventDefault();
          }}
          onInput={() => {
            if (editorRef.current) normalizeFractionBracketsAtCaret(editorRef.current);
            emitChange();
            updateActiveFormats();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && insertLineInTextBox(event.currentTarget)) {
              event.preventDefault();
              event.stopPropagation();
              emitChange();
              updateActiveFormats();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            document.execCommand(
              "insertText",
              false,
              event.clipboardData.getData("text/plain")
            );
            emitChange();
            updateActiveFormats();
          }}
          className="rich-text-content rich-text-editor min-h-[1lh] px-4 py-3 text-slate-900 outline-none"
        />
      </div>
    </div>
  );
}
