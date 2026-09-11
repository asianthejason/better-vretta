"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { getCanvasNumberLine, getCanvasShape, getCanvasTableCellHtml, getCanvasTextHtml, getCanvasTrackSizes, type DragDropCanvasElement } from "@/lib/dragDrop";

function formatNumberLineValue(value: number) {
  return Number(value.toFixed(6)).toString();
}

function EditableTableCell({ html, active, verticalAlign, label, onChange, onFocus, onPointerDown }: { html: string; active: boolean; verticalAlign: "top" | "middle" | "bottom"; label: string; onChange: (html: string, text: string) => void; onFocus: () => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void }) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor && editor.innerHTML !== html) editor.innerHTML = html;
  }, [html]);
  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const copy = editor.cloneNode(true) as HTMLDivElement;
    const allowedTags = new Set(["DIV", "P", "BR", "B", "STRONG", "I", "EM", "U"]);
    Array.from(copy.querySelectorAll("*")).forEach((child) => {
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      const textAlign = child instanceof HTMLElement ? child.style.textAlign : "";
      Array.from(child.attributes).forEach((attribute) => child.removeAttribute(attribute.name));
      if (child instanceof HTMLElement && ["left", "center", "right"].includes(textAlign)) child.style.textAlign = textAlign;
    });
    onChange(copy.innerHTML, editor.innerText);
  };
  return <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true" onFocus={onFocus} onPointerDown={(event) => { if (active) event.stopPropagation(); else onPointerDown(event); }} onClick={(event) => event.stopPropagation()} onInput={emitChange} onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); emitChange(); }} className={`flex h-full w-full min-w-0 flex-col px-[0.4cqw] text-center text-[inherit] text-slate-950 outline-none ${verticalAlign === "top" ? "justify-start" : verticalAlign === "bottom" ? "justify-end" : "justify-center"} ${active ? "cursor-text bg-blue-50 ring-2 ring-inset ring-blue-400" : "cursor-move bg-white"}`} />;
}

export default function LocationCanvasElementContent({ element, editableTable = false, activeTableCell = null, selectedTableCells = [], onTableCellChange, onTableCellFocus, onTableCellSelect, onTableCellPointerDown }: { element: DragDropCanvasElement; editableTable?: boolean; activeTableCell?: { row: number; column: number } | null; selectedTableCells?: string[]; onTableCellChange?: (row: number, column: number, html: string, text: string) => void; onTableCellFocus?: (row: number, column: number) => void; onTableCellSelect?: (row: number, column: number, extend: boolean) => void; onTableCellPointerDown?: (event: PointerEvent<HTMLDivElement>) => void }) {
  if (element.type === "image") {
    return element.imageUrl ? <img src={element.imageUrl} alt="" draggable={false} className="h-full w-full select-none object-contain" /> : null;
  }

  if (element.type === "text") {
    return <div className="rich-text-content h-full w-full text-slate-950" style={{ fontSize: `${(element.fontSize || 18) / 10}cqw`, padding: "0.8cqw" }} dangerouslySetInnerHTML={{ __html: getCanvasTextHtml(element) }} />;
  }

  if (element.type === "number-line") {
    const numberLine = getCanvasNumberLine(element);
    const startX = 60;
    const endX = 940;
    const lineY = 92;
    const xForValue = (value: number) => startX + ((value - numberLine.min) / (numberLine.max - numberLine.min)) * (endX - startX);
    return (
      <svg viewBox="0 0 1000 210" preserveAspectRatio="none" className="h-full w-full overflow-visible text-slate-950" role="img" aria-label={`Number line from ${numberLine.min} to ${numberLine.max}`}>
        <line x1={startX} y1={lineY} x2={endX} y2={lineY} stroke="currentColor" strokeWidth="5" />
        {numberLine.showArrows && <><path d={`M ${startX} ${lineY} L ${startX + 24} ${lineY - 14} L ${startX + 24} ${lineY + 14} Z`} fill="currentColor" /><path d={`M ${endX} ${lineY} L ${endX - 24} ${lineY - 14} L ${endX - 24} ${lineY + 14} Z`} fill="currentColor" /></>}
        {Array.from({ length: numberLine.divisions + 1 }, (_, index) => {
          const x = startX + (index / numberLine.divisions) * (endX - startX);
          const labelled = index % numberLine.labelEvery === 0 || index === numberLine.divisions;
          const value = numberLine.min + (index / numberLine.divisions) * (numberLine.max - numberLine.min);
          return <g key={index}><line x1={x} y1={labelled ? 68 : 76} x2={x} y2={labelled ? 116 : 108} stroke="currentColor" strokeWidth={labelled ? 4 : 2} />{labelled && <text x={x} y="158" textAnchor="middle" fill="currentColor" fontSize="34" fontFamily="ui-sans-serif, system-ui, sans-serif">{formatNumberLineValue(value)}</text>}</g>;
        })}
        {numberLine.points.map((point, index) => <circle key={`${point}-${index}`} cx={xForValue(point)} cy={lineY} r="9" fill="currentColor" />)}
      </svg>
    );
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
        return <td key={columnIndex} rowSpan={merge?.rowSpan} colSpan={merge?.columnSpan} style={{ padding: editableTable ? 0 : "0.4cqw", verticalAlign }} className={`cursor-move text-center ${element.showBorders === false ? "" : "border border-slate-500"} ${selected ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""}`}>{editableTable ? <EditableTableCell html={getCanvasTableCellHtml(element, rowIndex, columnIndex)} active={active} verticalAlign={verticalAlign} label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} onChange={(html, text) => onTableCellChange?.(rowIndex, columnIndex, html, text)} onFocus={() => { onTableCellFocus?.(rowIndex, columnIndex); onTableCellSelect?.(rowIndex, columnIndex, false); }} onPointerDown={(event) => { if (event.shiftKey) { event.preventDefault(); event.stopPropagation(); onTableCellSelect?.(rowIndex, columnIndex, true); } else { onTableCellPointerDown?.(event); } }} /> : <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: getCanvasTableCellHtml(element, rowIndex, columnIndex) }} />}</td>;
      })}</tr>)}</tbody>
    </table>
  );
}
