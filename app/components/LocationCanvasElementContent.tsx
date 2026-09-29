"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { ALGEBRA_TILE_OPTIONS, getCanvasAlgebraTile, getCanvasShape, getCanvasTableCellHtml, getCanvasTextHtml, getCanvasTrackSizes, type DragDropCanvasElement } from "@/lib/dragDrop";
import { normalizeFractionParentheses } from "@/lib/mathExpressions";
import { normalizeFractionBracketsAtCaret } from "@/app/teacher/assessments/[id]/richTextEditing";

import { buildNumberLineSvg } from "@/lib/numberLineSvg";

function EditableTableCell({ html, active, verticalAlign, label, onChange, onFocus, onPointerDown, onMathEdit }: { html: string; active: boolean; verticalAlign: "top" | "middle" | "bottom"; label: string; onChange: (html: string, text: string) => void; onFocus: () => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onMathEdit?: (math: Element, editor: HTMLElement) => void }) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor && editor.innerHTML !== html) editor.innerHTML = html;
  }, [html]);
  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
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
        const keepMathPadding = tagName === "MPADDED" && ((attribute.name === "height" && attribute.value === "+0.24em") || (attribute.name === "voffset" && ["0.18em", "-0.22em"].includes(attribute.value)));
        const keepMathStretchy = tagName === "MO" && ((["stretchy", "fence", "symmetric"].includes(attribute.name) && attribute.value === "true") || (attribute.name === "minsize" && attribute.value === "2em"));
        const keepTextBox = tagName === "DIV" && attribute.name === "data-text-box" && attribute.value === "true";
        const keepMathEnclosure = tagName === "MENCLOSE" && attribute.name === "notation" && attribute.value === "top";
        const keepRadicalOverline = tagName === "MROW" && attribute.name === "data-radical-overline" && attribute.value === "true";
        if (!keepMathType && !keepMathTree && !keepMathEditing && !keepDisplayStyle && !keepMathPadding && !keepMathStretchy && !keepTextBox && !keepMathEnclosure && !keepRadicalOverline) child.removeAttribute(attribute.name);
      });
      if (child instanceof HTMLElement && ["left", "center", "right"].includes(textAlign)) child.style.textAlign = textAlign;
    });
    onChange(normalizeFractionParentheses(copy.innerHTML.replaceAll("\u200B", "")), editor.innerText.replaceAll("\u200B", ""));
  };
  return <div onPointerDown={(event) => { if (active) event.stopPropagation(); else onPointerDown(event); }} onClick={(event) => event.stopPropagation()} className={`flex h-full w-full min-w-0 flex-col ${verticalAlign === "top" ? "justify-start" : verticalAlign === "bottom" ? "justify-end" : "justify-center"} ${active ? "cursor-text bg-blue-50 ring-2 ring-inset ring-blue-400" : "cursor-move bg-white"}`}>
    <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true" onFocus={onFocus} onPointerDown={(event) => { if (active) event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); onFocus(); }} onDoubleClick={(event) => { const math = event.target instanceof Element ? event.target.closest("math[data-math-expression]") : null; if (math && editorRef.current) { event.preventDefault(); event.stopPropagation(); onMathEdit?.(math, editorRef.current); } }} onInput={() => { if (editorRef.current) normalizeFractionBracketsAtCaret(editorRef.current); emitChange(); }} onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); if (editorRef.current) normalizeFractionBracketsAtCaret(editorRef.current); emitChange(); }} className="min-h-[1lh] w-full min-w-0 px-[0.4cqw] text-center text-[inherit] text-slate-950 outline-none" />
  </div>;
}

export default function LocationCanvasElementContent({ element, editableTable = false, activeTableCell = null, selectedTableCells = [], onTableCellChange, onTableCellFocus, onTableCellSelect, onTableCellPointerDown, onTableMathEdit }: { element: DragDropCanvasElement; editableTable?: boolean; activeTableCell?: { row: number; column: number } | null; selectedTableCells?: string[]; onTableCellChange?: (row: number, column: number, html: string, text: string) => void; onTableCellFocus?: (row: number, column: number) => void; onTableCellSelect?: (row: number, column: number, extend: boolean) => void; onTableCellPointerDown?: (event: PointerEvent<HTMLDivElement>) => void; onTableMathEdit?: (math: Element, editor: HTMLElement) => void }) {
  if (element.type === "image") {
    return element.imageUrl ? <img src={element.imageUrl} alt="" draggable={false} className="h-full w-full select-none object-contain" /> : null;
  }

  if (element.type === "text") {
    return <div className={`flex h-full w-full flex-col ${element.verticalAlign === "middle" ? "justify-center" : element.verticalAlign === "bottom" ? "justify-end" : "justify-start"}`}><div className="rich-text-content w-full text-slate-950" style={{ fontSize: `${(element.fontSize || 18) / 10}cqw`, padding: "0.8cqw" }} dangerouslySetInnerHTML={{ __html: getCanvasTextHtml(element) }} /></div>;
  }

  if (element.type === "number-line") {
    const { description, markup } = buildNumberLineSvg(element);
    return <svg viewBox="0 0 1000 210" preserveAspectRatio="none" className="h-full w-full overflow-visible text-slate-950" role="img" aria-label={description} dangerouslySetInnerHTML={{ __html: markup }} />;
  }

  if (element.type === "shape") {
    const shape = getCanvasShape(element);
    const shared = { fill: "none", stroke: "currentColor", strokeWidth: shape.thickness, vectorEffect: "non-scaling-stroke" as const };
    const isLinear = shape.kind === "line" || shape.kind === "arrow";
    const markerId = `arrow-${element.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const arrowHeadSize = Math.max(10, shape.thickness * 3.5);
    const marker = shape.kind === "arrow"
      ? shape.arrowDirection === "reverse" ? { markerStart: `url(#${markerId})` } : { markerEnd: `url(#${markerId})` }
      : {};
    if (isLinear) {
      const coordinates = shape.lineAxis === "vertical"
        ? { x1: "50%", y1: "0%", x2: "50%", y2: "100%" }
        : shape.lineAxis === "diagonal"
          ? { x1: "0%", y1: shape.lineDirection === "ascending" ? "100%" : "0%", x2: "100%", y2: shape.lineDirection === "ascending" ? "0%" : "100%" }
          : { x1: "0%", y1: "50%", x2: "100%", y2: "50%" };
      return <svg width="100%" height="100%" className="h-full w-full overflow-visible text-slate-950" role="img" aria-label={`${shape.kind} shape`}>
        {shape.kind === "arrow" && <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={arrowHeadSize} markerHeight={arrowHeadSize} orient="auto-start-reverse" markerUnits="userSpaceOnUse" preserveAspectRatio="xMidYMid meet"><path d="M 0 0 L 10 5 L 0 10 Z" fill="currentColor" /></marker></defs>}
        <line {...coordinates} strokeLinecap="round" fill="none" stroke="currentColor" strokeWidth={shape.thickness} {...marker} />
      </svg>;
    }
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible text-slate-950" role="img" aria-label={`${shape.kind} shape`}>
        {shape.kind === "circle" && <ellipse cx="50" cy="50" rx="49" ry="49" {...shared} />}
        {shape.kind === "rectangle" && <rect x="0" y="0" width="100" height="100" {...shared} />}
        {shape.kind === "triangle" && <path d="M 50 0 L 100 100 L 0 100 Z" strokeLinejoin="round" {...shared} />}
      </svg>
    );
  }

  if (element.type === "algebra-tile") {
    const tile = getCanvasAlgebraTile(element);
    const algebraTileShape = (kind: "unit" | "x" | "x2", sign: "positive" | "negative", key?: string) => {
      const dimensions = kind === "unit" ? "h-[1.3cqw] w-[1.3cqw]" : kind === "x" ? "h-[4cqw] w-[1.3cqw]" : "h-[4cqw] w-[4cqw]";
      return <span key={key} role="img" aria-label={`${sign} ${kind === "x2" ? "x squared" : kind} tile`} style={{ backgroundColor: sign === "positive" ? "#020617" : "#ffffff" }} className={`${dimensions} inline-block shrink-0 border-[0.15cqw] border-slate-950`} />;
    };
    if (tile.kind === "legend") {
      return <div className="h-full w-full border-[0.18cqw] border-slate-950 bg-white p-[1cqw] text-slate-950">
        <p className="mb-[0.7cqw] font-serif text-[1.7cqw] font-bold leading-none">Legend</p>
        <div className="grid h-[calc(100%-2.4cqw)] grid-cols-3 grid-rows-2 items-center gap-x-[1cqw] gap-y-[0.5cqw] font-serif text-[1.35cqw]">
          {ALGEBRA_TILE_OPTIONS.map(({ kind, sign }) => <div key={`${sign}-${kind}`} className="flex min-w-0 items-center gap-[0.6cqw]">{algebraTileShape(kind, sign)}<span>= {sign === "negative" ? "−" : ""}{kind === "unit" ? "1" : kind === "x" ? "x" : "x²"}</span></div>)}
        </div>
      </div>;
    }
    if (tile.kind === "group") {
      const largeTileGroups = [
        { key: "positiveX2", kind: "x2", sign: "positive" }, { key: "negativeX2", kind: "x2", sign: "negative" },
        { key: "positiveX", kind: "x", sign: "positive" }, { key: "negativeX", kind: "x", sign: "negative" },
      ] as const;
      const unitStacks = (sign: "positive" | "negative") => {
        const count = tile.counts[sign === "positive" ? "positiveUnit" : "negativeUnit"];
        return Array.from({ length: Math.ceil(count / 3) }, (_, stackIndex) => (
          <span key={`${sign}-unit-stack-${stackIndex}`} className="flex flex-col gap-[0.25cqw]">
            {Array.from({ length: Math.min(3, count - stackIndex * 3) }, (_, unitIndex) => algebraTileShape("unit", sign, `${sign}-unit-${stackIndex * 3 + unitIndex}`))}
          </span>
        ));
      };
      return <div role="group" aria-label="Grouped algebra tiles" className="flex h-full w-full flex-wrap content-center items-center justify-center gap-[0.6cqw] overflow-hidden p-[0.7cqw]">
        {largeTileGroups.flatMap((group) => Array.from({ length: tile.counts[group.key] }, (_, index) => algebraTileShape(group.kind, group.sign, `${group.key}-${index}`)))}
        {tile.counts.positiveUnit > 0 && <span role="group" aria-label="Positive unit tiles" className="flex items-start gap-[0.25cqw]">{unitStacks("positive")}</span>}
        {tile.counts.negativeUnit > 0 && <span role="group" aria-label="Negative unit tiles" className="flex items-start gap-[0.25cqw]">{unitStacks("negative")}</span>}
      </div>;
    }
    return <div role="img" aria-label={`${tile.sign} ${tile.kind === "x2" ? "x squared" : tile.kind} algebra tile`} style={{ backgroundColor: tile.sign === "positive" ? "#020617" : "#ffffff" }} className="h-full w-full border-[0.18cqw] border-slate-950" />;
  }

  const rows = Math.max(1, element.rows || 2);
  const columns = Math.max(1, element.columns || 2);
  const columnWidths = getCanvasTrackSizes(columns, element.columnWidths);
  const rowHeights = getCanvasTrackSizes(rows, element.rowHeights);
  const mergedCells = element.mergedCells || [];
  const mergeAt = (row: number, column: number) => mergedCells.find((merge) => row >= merge.row && row < merge.row + merge.rowSpan && column >= merge.column && column < merge.column + merge.columnSpan);
  return (
    <table className="h-full w-full table-fixed border-collapse bg-white text-slate-950" style={{ fontSize: `${(element.fontSize || 16) / 10}cqw` }}>
      <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
      <tbody>{Array.from({ length: rows }, (_, rowIndex) => <tr key={rowIndex} style={{ height: `${rowHeights[rowIndex]}%` }}>{Array.from({ length: columns }, (_, columnIndex) => {
        const merge = mergeAt(rowIndex, columnIndex);
        if (merge && (merge.row !== rowIndex || merge.column !== columnIndex)) return null;
        const selected = selectedTableCells.includes(`${rowIndex}:${columnIndex}`);
        const active = activeTableCell?.row === rowIndex && activeTableCell.column === columnIndex;
        const verticalAlign = element.cellVerticalAlign?.[rowIndex]?.[columnIndex] || "middle";
        return <td key={columnIndex} rowSpan={merge?.rowSpan} colSpan={merge?.columnSpan} style={{ padding: editableTable ? 0 : "0.4cqw", verticalAlign }} className={`cursor-move text-center ${element.showBorders === false ? "" : "border border-slate-500"} ${selected ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""}`}>{editableTable ? <EditableTableCell html={getCanvasTableCellHtml(element, rowIndex, columnIndex)} active={active} verticalAlign={verticalAlign} label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} onChange={(html, text) => onTableCellChange?.(rowIndex, columnIndex, html, text)} onFocus={() => { onTableCellFocus?.(rowIndex, columnIndex); onTableCellSelect?.(rowIndex, columnIndex, false); }} onPointerDown={(event) => { if (event.shiftKey) { event.preventDefault(); event.stopPropagation(); onTableCellSelect?.(rowIndex, columnIndex, true); } else { onTableCellPointerDown?.(event); } }} onMathEdit={onTableMathEdit} /> : <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: getCanvasTableCellHtml(element, rowIndex, columnIndex) }} />}</td>;
      })}</tr>)}</tbody>
    </table>
  );
}
