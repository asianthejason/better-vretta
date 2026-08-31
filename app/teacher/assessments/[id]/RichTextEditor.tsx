"use client";

import { useEffect, useRef, useState } from "react";

const FONT_SIZE_STEPS = [10, 13, 16, 18, 24, 32, 48];

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeight?: string;
};

type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  superscript: boolean;
  subscript: boolean;
  textBox: boolean;
  fontSize: string;
};

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = "9rem",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [showTableControls, setShowTableControls] = useState(false);
  const [showMathSymbols, setShowMathSymbols] = useState(false);
  const [showRootControls, setShowRootControls] = useState(false);
  const [rootIndex, setRootIndex] = useState("3");
  const [rootValue, setRootValue] = useState("");
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>({
    bold: false,
    italic: false,
    superscript: false,
    subscript: false,
    textBox: false,
    fontSize: "3",
  });
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableHasBorder, setTableHasBorder] = useState(true);

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
      superscript:
        Boolean(nearestSuperscript) || document.queryCommandState("superscript"),
      subscript:
        Boolean(nearestSubscript) || document.queryCommandState("subscript"),
      textBox: Boolean(nearestTextBox),
      fontSize,
    });
  }

  function getSafeHtml() {
    if (!editorRef.current) return "";

    const copy = editorRef.current.cloneNode(true) as HTMLDivElement;
    const allowedTags = new Set([
      "DIV", "P", "BR", "B", "STRONG", "I", "EM", "FONT", "SUB", "SUP",
      "TABLE", "TBODY", "THEAD", "TR", "TH", "TD",
    ]);

    Array.from(copy.querySelectorAll("*")).forEach((element) => {
      if (!allowedTags.has(element.tagName)) {
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
        if (!keepFontSize && !keepTableBorder && !keepTextBox) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return copy.innerHTML;
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
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) {
      return;
    }

    const startElement =
      range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement;
    const existingBox = startElement?.closest('[data-text-box="true"]');

    if (existingBox && existingBox !== editor) {
      return;
    } else {
      editor.focus();
      document.execCommand("formatBlock", false, "div");
      const updatedSelection = window.getSelection();
      const updatedRange = updatedSelection?.rangeCount
        ? updatedSelection.getRangeAt(0)
        : null;
      const updatedElement =
        updatedRange?.startContainer instanceof HTMLElement
          ? updatedRange.startContainer
          : updatedRange?.startContainer.parentElement;
      const row = updatedElement?.closest("div");

      if (row && row !== editor) {
        row.setAttribute("data-text-box", "true");
      } else {
        const box = document.createElement("div");
        box.setAttribute("data-text-box", "true");
        const contents = range.extractContents();
        if (contents.hasChildNodes()) {
          box.appendChild(contents);
        } else {
          box.appendChild(document.createElement("br"));
        }
        range.insertNode(box);
        const boxRange = document.createRange();
        boxRange.selectNodeContents(box);
        boxRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(boxRange);
      }
    }

    emitChange();
    updateActiveFormats();
  }

  function removeCurrentTextBox() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return;
    const startElement = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
    const box = startElement?.closest('[data-text-box="true"]');
    if (!box || box === editor) return;
    box.removeAttribute("data-text-box");
    emitChange();
    updateActiveFormats();
  }

  function exitCurrentTextBox() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) return;
    const startElement = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
    const box = startElement?.closest('[data-text-box="true"]');
    if (!box || box === editor) return;

    let nextRow = box.nextElementSibling as HTMLElement | null;
    if (!nextRow?.matches('div:not([data-text-box="true"]), p')) {
      nextRow = document.createElement("div");
      nextRow.appendChild(document.createElement("br"));
      box.parentNode?.insertBefore(nextRow, box.nextSibling);
    }
    const exitRange = document.createRange();
    exitRange.selectNodeContents(nextRow);
    exitRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(exitRange);
    editor.focus();
    emitChange();
    updateActiveFormats();
  }

  function insertLineInsideTextBox() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) {
      return;
    }

    range.deleteContents();
    const lineBreak = document.createElement("br");
    const typingPoint = document.createTextNode("\u200B");
    range.insertNode(typingPoint);
    range.insertNode(lineBreak);

    const nextRange = document.createRange();
    nextRange.setStart(typingPoint, typingPoint.length);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    emitChange();
    updateActiveFormats();
  }

  function returnToNormalText() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (
      !editor ||
      !selection ||
      !range ||
      !editor.contains(range.commonAncestorContainer)
    ) {
      return;
    }

    editor.focus();

    if (range.collapsed) {
      let currentNode: Node | null = range.startContainer;
      let formattingAncestor: HTMLElement | null = null;

      while (currentNode && currentNode !== editor) {
        if (
          currentNode instanceof HTMLElement &&
          ["SUB", "SUP", "FONT"].includes(currentNode.tagName)
        ) {
          formattingAncestor = currentNode;
        }
        currentNode = currentNode.parentNode;
      }

      if (formattingAncestor?.parentNode) {
        const normalFont = document.createElement("font");
        normalFont.setAttribute("size", "3");
        const typingPoint = document.createTextNode("\u200B");
        normalFont.appendChild(typingPoint);
        formattingAncestor.parentNode.insertBefore(
          normalFont,
          formattingAncestor.nextSibling
        );

        const normalRange = document.createRange();
        normalRange.setStart(typingPoint, typingPoint.length);
        normalRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(normalRange);
      } else {
        if (document.queryCommandState("subscript")) {
          document.execCommand("subscript");
        }
        if (document.queryCommandState("superscript")) {
          document.execCommand("superscript");
        }
        document.execCommand("fontSize", false, "3");
      }
    } else {
      if (document.queryCommandState("subscript")) {
        document.execCommand("subscript");
      }
      if (document.queryCommandState("superscript")) {
        document.execCommand("superscript");
      }
      document.execCommand("fontSize", false, "3");
    }

    emitChange();
    setActiveFormats((current) => ({
      ...current,
      superscript: false,
      subscript: false,
      fontSize: "3",
    }));
  }

  function openMathControls() {
    saveEditorSelection();
    setShowMathSymbols((current) => !current);
    setShowRootControls(false);
  }

  function openRootControls() {
    saveEditorSelection();
    setShowRootControls((current) => !current);
    setShowMathSymbols(false);
  }

  function insertCustomRoot() {
    const editor = editorRef.current;
    const index = rootIndex.trim();
    if (!editor || !index) return;

    const root = document.createDocumentFragment();
    const indexElement = document.createElement("sup");
    indexElement.textContent = index;
    const rootSymbol = document.createTextNode("√");
    const rootContent = document.createTextNode(rootValue.trim());
    root.append(indexElement, rootSymbol, rootContent);

    const range = savedRangeRef.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(root);
    } else {
      editor.append(indexElement, rootSymbol, rootContent);
    }

    const nextRange = document.createRange();
    nextRange.setStartAfter(rootContent);
    nextRange.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(nextRange);
    savedRangeRef.current = null;
    setShowRootControls(false);
    setRootValue("");
    editor.focus();
    emitChange();
  }

  function openTableControls() {
    saveEditorSelection();
    setShowTableControls(true);
    setShowRootControls(false);
    setShowMathSymbols(false);
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
  const activeToolbarButton =
    "border-cyan-200 bg-cyan-400 text-slate-950 ring-2 ring-cyan-200/70 shadow-md shadow-cyan-950/30 hover:bg-cyan-300";

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-700 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-700 bg-slate-900 px-2 py-2">
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
          title="Superscript"
          aria-label="Superscript"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("superscript")}
          aria-pressed={activeFormats.superscript}
          className={`${toolbarButton} ${activeFormats.superscript ? activeToolbarButton : ""}`}
        >
          T<sup>2</sup>
        </button>
        <button
          type="button"
          title="Subscript"
          aria-label="Subscript"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("subscript")}
          aria-pressed={activeFormats.subscript}
          className={`${toolbarButton} ${activeFormats.subscript ? activeToolbarButton : ""}`}
        >
          T<sub>2</sub>
        </button>
        <button
          type="button"
          title="Return to normal text"
          aria-label="Return to normal text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={returnToNormalText}
          aria-pressed={!activeFormats.superscript && !activeFormats.subscript && activeFormats.fontSize === "3"}
          className={`${toolbarButton} ${!activeFormats.superscript && !activeFormats.subscript && activeFormats.fontSize === "3" ? activeToolbarButton : ""}`}
        >
          <span className="font-semibold">T</span>
          <span className="ml-1 text-[10px] font-medium">Normal</span>
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
          title="Insert a root"
          aria-label="Insert a root"
          aria-expanded={showRootControls}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openRootControls}
          className={`${toolbarButton} ${showRootControls ? activeToolbarButton : ""}`}
        >
          <span className="relative block h-5 w-9" aria-hidden="true">
            <span className="absolute left-0 top-0 h-2 w-2 rounded-[2px] border border-current" />
            <span className="absolute bottom-0 left-1 text-lg leading-none">√</span>
            <span className="absolute bottom-0 right-0 h-3.5 w-4 rounded-[2px] border border-current" />
          </span>
        </button>
        <button
          type="button"
          title="Insert math symbol"
          aria-label="Insert math symbol"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openMathControls}
          aria-expanded={showMathSymbols}
          className={`${toolbarButton} ${showMathSymbols ? activeToolbarButton : ""}`}
        >
          <span className="text-base font-semibold">π ±</span>
        </button>
      </div>
      {showRootControls && (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative h-16 w-52" aria-label="Root expression">
              <input
                type="text"
                value={rootIndex}
                onChange={(event) => setRootIndex(event.target.value)}
                aria-label="Root index"
                placeholder="n"
                className="absolute left-0 top-0 h-8 w-10 rounded-md border-2 border-blue-300 bg-white px-1 text-center text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
              />
              <span className="absolute bottom-0 left-7 text-5xl leading-none text-slate-700">√</span>
              <input
                type="text"
                value={rootValue}
                onChange={(event) => setRootValue(event.target.value)}
                aria-label="Value inside the root"
                placeholder="value"
                className="absolute bottom-1 left-[4.25rem] h-10 w-32 rounded-md border-2 border-blue-300 border-t-slate-700 bg-white px-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={insertCustomRoot}
              disabled={!rootIndex.trim()}
              className="mb-1 h-10 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Insert root
            </button>
            <p className="mb-3 text-xs text-slate-500">Enter the index and optionally the value inside the radical.</p>
          </div>
        </div>
      )}
      {showMathSymbols && (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Insert a math symbol</p>
          <div className="flex flex-wrap gap-1.5">
            {["√", "∛", "π", "θ", "Δ", "∞", "±", "×", "÷", "≠", "≈", "≤", "≥", "∑", "∫", "°", "→", "←", "∈", "∉", "∠", "⊥", "∥", "%"].map((symbol) => (
              <button
                key={symbol}
                type="button"
                title={`Insert ${symbol}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runCommand("insertText", symbol)}
                className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-base font-medium text-slate-800 hover:border-blue-400 hover:bg-blue-50"
              >
                {symbol}
              </button>
            ))}
          </div>
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
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={() => {
          emitChange();
          updateActiveFormats();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;

          const selection = window.getSelection();
          const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
          const startElement =
            range?.startContainer instanceof HTMLElement
              ? range.startContainer
              : range?.startContainer.parentElement;

          if (startElement?.closest('[data-text-box="true"]')) {
            event.preventDefault();
            insertLineInsideTextBox();
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
        className="rich-text-content rich-text-editor px-4 py-3 text-slate-900 outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}
