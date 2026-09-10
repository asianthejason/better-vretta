import type { DragDropCanvasElement } from "@/lib/dragDrop";

export default function LocationCanvasElementContent({ element }: { element: DragDropCanvasElement }) {
  if (element.type === "image") {
    return element.imageUrl ? <img src={element.imageUrl} alt="" draggable={false} className="h-full w-full select-none object-contain" /> : null;
  }

  if (element.type === "text") {
    return <div className="h-full w-full whitespace-pre-wrap p-2 text-slate-950" style={{ fontSize: `${element.fontSize || 18}px` }}>{element.text || "Text"}</div>;
  }

  const rows = Math.max(1, element.rows || 2);
  const columns = Math.max(1, element.columns || 2);
  return (
    <table className="h-full w-full table-fixed border-collapse bg-white text-sm text-slate-950">
      <tbody>{Array.from({ length: rows }, (_, rowIndex) => <tr key={rowIndex}>{Array.from({ length: columns }, (_, columnIndex) => <td key={columnIndex} className={`p-1 text-center align-middle ${element.showBorders === false ? "" : "border border-slate-500"}`}>{element.cells?.[rowIndex]?.[columnIndex] || ""}</td>)}</tr>)}</tbody>
    </table>
  );
}
