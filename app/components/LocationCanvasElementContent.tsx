import { getCanvasNumberLine, getCanvasShape, getCanvasTextHtml, getCanvasTrackSizes, type DragDropCanvasElement } from "@/lib/dragDrop";

function formatNumberLineValue(value: number) {
  return Number(value.toFixed(6)).toString();
}

export default function LocationCanvasElementContent({ element, editableTable = false, onTableCellChange }: { element: DragDropCanvasElement; editableTable?: boolean; onTableCellChange?: (row: number, column: number, value: string) => void }) {
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
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible text-slate-950" role="img" aria-label={`${shape.kind} shape`}>
        {shape.kind === "line" && shape.lineAxis === "horizontal" && <line x1="0" y1="50" x2="100" y2="50" strokeLinecap="round" {...shared} />}
        {shape.kind === "line" && shape.lineAxis === "vertical" && <line x1="50" y1="0" x2="50" y2="100" strokeLinecap="round" {...shared} />}
        {shape.kind === "line" && shape.lineAxis === "diagonal" && <line x1="0" y1={shape.lineDirection === "ascending" ? 100 : 0} x2="100" y2={shape.lineDirection === "ascending" ? 0 : 100} strokeLinecap="round" {...shared} />}
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
  return (
    <table className="h-full w-full table-fixed border-collapse bg-white text-slate-950" style={{ fontSize: "1.4cqw" }}>
      <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
      <tbody>{Array.from({ length: rows }, (_, rowIndex) => <tr key={rowIndex} style={{ height: `${rowHeights[rowIndex]}%` }}>{Array.from({ length: columns }, (_, columnIndex) => <td key={columnIndex} style={{ padding: editableTable ? 0 : "0.4cqw" }} className={`text-center align-middle ${element.showBorders === false ? "" : "border border-slate-500"}`}>{editableTable ? <input value={element.cells?.[rowIndex]?.[columnIndex] || ""} onChange={(event) => onTableCellChange?.(rowIndex, columnIndex, event.target.value)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} className="h-full w-full min-w-0 bg-white px-[0.4cqw] text-center text-[inherit] text-slate-950 outline-none focus:bg-blue-50" /> : element.cells?.[rowIndex]?.[columnIndex] || ""}</td>)}</tr>)}</tbody>
    </table>
  );
}
