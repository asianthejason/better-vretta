"use client";

import { useRef, useState, type PointerEvent } from "react";
import LocationCanvasElementContent from "@/app/components/LocationCanvasElementContent";
import { getCanvasNumberLine, getCanvasShape, getCanvasTrackSizes, getLocationBoxSize, makeDragDropId, type DragDropCanvasElement, type DragDropData, type DragDropZone } from "@/lib/dragDrop";
import CanvasInlineTextEditor from "./CanvasInlineTextEditor";

export type LocationLibraryImage = { id?: string; url: string; path: string; label: string };

type Gesture = {
  kind: "target" | "choices" | "element-move" | "element-resize" | "table-column" | "table-row" | "shape-draw";
  zoneId?: string;
  elementId?: string;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth?: number;
  startHeight?: number;
  trackIndex?: number;
  startTracks?: number[];
  resizeEdge?: "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

type TableSelection = {
  elementId: string;
  anchorRow: number;
  anchorColumn: number;
  endRow: number;
  endColumn: number;
};

type EditingTableCell = { elementId: string; row: number; column: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export default function LocationCanvasEditor({ data, onChange, uploadedImages, itemPreviewUrls, onItemImageFileChange, onChooseItemImage, onRemoveItemImage, onUploadBackground, onDeleteUploadedImage }: {
  data: DragDropData;
  onChange: (value: DragDropData) => void;
  uploadedImages: LocationLibraryImage[];
  itemPreviewUrls: Record<string, string>;
  onItemImageFileChange: (itemId: string, file: File | null) => void;
  onChooseItemImage: (itemId: string, image: LocationLibraryImage) => void;
  onRemoveItemImage: (itemId: string) => void;
  onUploadBackground: (file: File) => Promise<{ url: string; path: string }>;
  onDeleteUploadedImage: (image: LocationLibraryImage & { id: string }) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [selectedLibraryImages, setSelectedLibraryImages] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [showChoiceImages, setShowChoiceImages] = useState(false);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [drawingShapeKind, setDrawingShapeKind] = useState<"line" | "arrow" | "circle" | "rectangle" | "triangle" | null>(null);
  const [drawingShapeThickness, setDrawingShapeThickness] = useState(3);
  const [tableSelection, setTableSelection] = useState<TableSelection | null>(null);
  const [editingTableCell, setEditingTableCell] = useState<EditingTableCell | null>(null);
  const [uploading, setUploading] = useState(false);
  const gestureMovedRef = useRef(false);
  const editingElement = (data.canvasElements || []).find((element) => element.id === editingElementId);
  const boxSize = getLocationBoxSize(data.items.map((item) => ({ ...item, imageUrl: itemPreviewUrls[item.id] || item.imageUrl })));
  const boxCanvasStyle = { width: `${boxSize.width / 10}cqw`, height: `${boxSize.height / 10}cqw` };
  const choicesAreVertical = data.choiceBankDirection === "vertical";

  const updateZones = (zones: DragDropZone[]) => onChange({ ...data, zones });
  const updateZone = (zoneId: string, patch: Partial<DragDropZone>) => updateZones(data.zones.map((zone) => zone.id === zoneId ? { ...zone, ...patch } : zone));
  const updateElements = (canvasElements: DragDropCanvasElement[]) => onChange({ ...data, canvasElements });
  const updateElement = (elementId: string, patch: Partial<DragDropCanvasElement>) => updateElements((data.canvasElements || []).map((element) => element.id === elementId ? { ...element, ...patch } : element));
  const addChoice = () => {
    const item = { id: makeDragDropId(), content: `Item ${data.items.length + 1}` };
    onChange({ ...data, items: [...data.items, item] });
    setEditingItemId(item.id);
    setShowChoiceImages(false);
  };
  const addTarget = () => {
    const index = data.zones.length;
    const zone: DragDropZone = { id: makeDragDropId(), label: `Target ${index + 1}`, correctItemIds: [], capacity: 1, x: 10 + (index % 4) * 18, y: 12 + (index % 3) * 20, width: 16, height: 14 };
    updateZones([...data.zones, zone]);
    setEditingZoneId(zone.id);
  };

  const beginGesture = (event: PointerEvent<HTMLElement>, zone: DragDropZone) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setEditingItemId(null);
    setEditingElementId(null);
    setTableSelection(null);
    setEditingTableCell(null);
    setGesture({ kind: "target", zoneId: zone.id, startX: event.clientX, startY: event.clientY, startLeft: zone.x ?? 10, startTop: zone.y ?? 10 });
  };
  const beginChoiceGesture = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setEditingItemId(null);
    setEditingElementId(null);
    setEditingZoneId(null);
    setTableSelection(null);
    setEditingTableCell(null);
    setGesture({ kind: "choices", startX: event.clientX, startY: event.clientY, startLeft: data.choiceBankX ?? 8, startTop: data.choiceBankY ?? 6 });
  };
  const beginElementGesture = (event: PointerEvent<HTMLElement>, element: DragDropCanvasElement, kind: "element-move" | "element-resize", resizeEdge?: Gesture["resizeEdge"], preserveDefault = false) => {
    if (!preserveDefault) event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setEditingItemId(null);
    setEditingZoneId(null);
    setEditingTableCell(null);
    if (editingElementId && editingElementId !== element.id) {
      setEditingElementId(null);
      setTableSelection(null);
    }
    setGesture({ kind, elementId: element.id, startX: event.clientX, startY: event.clientY, startLeft: element.x, startTop: element.y, startWidth: element.width, startHeight: element.height, resizeEdge });
  };
  const beginTableTrackGesture = (event: PointerEvent<HTMLElement>, element: DragDropCanvasElement, kind: "table-column" | "table-row", trackIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    const count = kind === "table-column" ? element.columns || 2 : element.rows || 2;
    const tracks = getCanvasTrackSizes(count, kind === "table-column" ? element.columnWidths : element.rowHeights);
    setGesture({ kind, elementId: element.id, trackIndex, startTracks: tracks, startX: event.clientX, startY: event.clientY, startLeft: element.x, startTop: element.y, startWidth: element.width, startHeight: element.height });
  };
  const beginShapeDraw = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawingShapeKind || !canvasRef.current || (event.target instanceof Element && event.target.closest("[data-canvas-object]"))) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "shape", shape: { kind: drawingShapeKind, thickness: drawingShapeThickness, lineAxis: "horizontal", lineDirection: "descending" }, x, y, width: 1, height: 1 };
    updateElements([...(data.canvasElements || []), element]);
    gestureMovedRef.current = false;
    setEditingElementId(null);
    setEditingItemId(null);
    setEditingZoneId(null);
    setTableSelection(null);
    setEditingTableCell(null);
    setGesture({ kind: "shape-draw", elementId: element.id, startX: event.clientX, startY: event.clientY, startLeft: x, startTop: y, startWidth: 1, startHeight: 1 });
  };
  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const deltaX = ((event.clientX - gesture.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - gesture.startY) / bounds.height) * 100;
    if (Math.abs(event.clientX - gesture.startX) > 3 || Math.abs(event.clientY - gesture.startY) > 3) {
      gestureMovedRef.current = true;
      if (gesture.kind === "target") setEditingZoneId(null);
    }
    if (gesture.kind === "shape-draw" && gesture.elementId) {
      const currentX = clamp(gesture.startLeft + deltaX, 0, 100);
      const currentY = clamp(gesture.startTop + deltaY, 0, 100);
      const currentElement = (data.canvasElements || []).find((element) => element.id === gesture.elementId);
      const pixelDeltaX = event.clientX - gesture.startX;
      const pixelDeltaY = event.clientY - gesture.startY;
      const lineAxis = Math.abs(pixelDeltaX) <= 5 ? "vertical" : Math.abs(pixelDeltaY) <= 5 ? "horizontal" : "diagonal";
      const lineWidth = lineAxis === "vertical" ? Math.max(0.5, (8 / bounds.width) * 100) : Math.max(0.5, Math.abs(currentX - gesture.startLeft));
      const lineHeight = lineAxis === "horizontal" ? Math.max(0.5, (8 / bounds.height) * 100) : Math.max(0.5, Math.abs(currentY - gesture.startTop));
      const isLinear = currentElement?.shape?.kind === "line" || currentElement?.shape?.kind === "arrow";
      updateElement(gesture.elementId, {
        x: isLinear && lineAxis === "vertical" ? clamp(gesture.startLeft - lineWidth / 2, 0, 100 - lineWidth) : Math.min(gesture.startLeft, currentX),
        y: isLinear && lineAxis === "horizontal" ? clamp(gesture.startTop - lineHeight / 2, 0, 100 - lineHeight) : Math.min(gesture.startTop, currentY),
        width: isLinear ? lineWidth : Math.max(0.5, Math.abs(currentX - gesture.startLeft)),
        height: isLinear ? lineHeight : Math.max(0.5, Math.abs(currentY - gesture.startTop)),
        shape: isLinear ? { ...getCanvasShape(currentElement), lineAxis, lineDirection: deltaX * deltaY >= 0 ? "descending" : "ascending", arrowDirection: (lineAxis === "vertical" ? deltaY : deltaX) < 0 ? "reverse" : "forward" } : currentElement?.shape,
      });
      return;
    }
    if (gesture.kind === "choices") {
      const bankLogicalWidth = choicesAreVertical ? boxSize.width : data.items.length * boxSize.width + Math.max(0, data.items.length - 1) * 8;
      const bankLogicalHeight = choicesAreVertical ? data.items.length * boxSize.height + Math.max(0, data.items.length - 1) * 8 : boxSize.height;
      const bankWidthPercent = Math.min(100, bankLogicalWidth / 10);
      const bankHeightPercent = Math.min(100, ((bankLogicalHeight / 1000) * bounds.width / bounds.height) * 100);
      onChange({
        ...data,
        choiceBankX: clamp(gesture.startLeft + deltaX, 0, Math.max(0, 100 - bankWidthPercent)),
        choiceBankY: clamp(gesture.startTop + deltaY, 0, Math.max(0, 100 - bankHeightPercent)),
      });
      return;
    }
    if ((gesture.kind === "element-move" || gesture.kind === "element-resize") && gesture.elementId) {
      if (gesture.kind === "element-move") {
        updateElement(gesture.elementId, {
          x: clamp(gesture.startLeft + deltaX, 0, Math.max(0, 100 - (gesture.startWidth || 20))),
          y: clamp(gesture.startTop + deltaY, 0, Math.max(0, 100 - (gesture.startHeight || 20))),
        });
      } else {
        const startWidth = gesture.startWidth || 20;
        const startHeight = gesture.startHeight || 20;
        const resizeFromLeft = gesture.resizeEdge?.includes("left");
        const resizeFromRight = gesture.resizeEdge?.includes("right");
        const resizeFromTop = gesture.resizeEdge?.includes("top");
        const resizeFromBottom = gesture.resizeEdge?.includes("bottom");
        const patch: Partial<DragDropCanvasElement> = {};
        if (resizeFromLeft) {
          const x = clamp(gesture.startLeft + deltaX, 0, gesture.startLeft + startWidth - 5);
          patch.x = x;
          patch.width = startWidth + gesture.startLeft - x;
        } else if (resizeFromRight) {
          patch.width = clamp(startWidth + deltaX, 5, 100 - gesture.startLeft);
        }
        if (resizeFromTop) {
          const y = clamp(gesture.startTop + deltaY, 0, gesture.startTop + startHeight - 5);
          patch.y = y;
          patch.height = startHeight + gesture.startTop - y;
        } else if (resizeFromBottom) {
          patch.height = clamp(startHeight + deltaY, 5, 100 - gesture.startTop);
        }
        if (gesture.resizeEdge) {
          updateElement(gesture.elementId, patch);
        } else {
          updateElement(gesture.elementId, { width: clamp(startWidth + deltaX, 5, 100 - gesture.startLeft), height: clamp(startHeight + deltaY, 5, 100 - gesture.startTop) });
        }
      }
      return;
    }
    if ((gesture.kind === "table-column" || gesture.kind === "table-row") && gesture.elementId && gesture.trackIndex !== undefined && gesture.startTracks) {
      const tracks = [...gesture.startTracks];
      const first = gesture.trackIndex;
      const pairTotal = tracks[first] + tracks[first + 1];
      const elementPixelSize = gesture.kind === "table-column"
        ? bounds.width * (gesture.startWidth || 1) / 100
        : bounds.height * (gesture.startHeight || 1) / 100;
      const pixelDelta = gesture.kind === "table-column" ? event.clientX - gesture.startX : event.clientY - gesture.startY;
      tracks[first] = clamp(tracks[first] + (pixelDelta / elementPixelSize) * 100, 5, pairTotal - 5);
      tracks[first + 1] = pairTotal - tracks[first];
      updateElement(gesture.elementId, gesture.kind === "table-column" ? { columnWidths: tracks } : { rowHeights: tracks });
      return;
    }
    if (!gesture.zoneId) return;
    const targetHeightPercent = ((boxSize.height / 1000) * bounds.width / bounds.height) * 100;
    updateZone(gesture.zoneId, {
      x: clamp(gesture.startLeft + deltaX, 0, Math.max(0, 100 - boxSize.width / 10)),
      y: clamp(gesture.startTop + deltaY, 0, Math.max(0, 100 - targetHeightPercent)),
    });
  };
  const addTextBox = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "text", text: "Enter text", textHtml: "Enter text", fontSize: 22, x: 8, y: 35, width: 36, height: 20 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const addTable = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "table", rows: 2, columns: 2, cells: [["", ""], ["", ""]], cellHtml: [["", ""], ["", ""]], cellVerticalAlign: [["middle", "middle"], ["middle", "middle"]], fontSize: 16, columnWidths: [50, 50], rowHeights: [50, 50], showBorders: true, x: 22, y: 32, width: 52, height: 34 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const addNumberLine = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "number-line", numberLine: { min: -2, max: 2, divisions: 16, labelEvery: 4, showArrows: true, points: [] }, x: 9, y: 35, width: 82, height: 24 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const finishGesture = () => {
    if (gesture?.kind === "shape-draw") {
      if (!gestureMovedRef.current && gesture.elementId) {
        updateElements((data.canvasElements || []).filter((element) => element.id !== gesture.elementId));
        setEditingElementId(null);
      } else {
        setEditingElementId(gesture.elementId || null);
        setDrawingShapeKind(null);
        setShowShapeMenu(false);
      }
    }
    setGesture(null);
  };
  const addImageElements = (images: Array<{ url: string; path: string }>) => {
    const existingCount = (data.canvasElements || []).filter((element) => element.type === "image").length;
    updateElements([...(data.canvasElements || []), ...images.map((image, index): DragDropCanvasElement => ({
      id: makeDragDropId(),
      type: "image",
      imageUrl: image.url,
      imagePath: image.path,
      x: 5 + ((existingCount + index) % 5) * 5,
      y: 18 + ((existingCount + index) % 5) * 5,
      width: 38,
      height: 38,
    }))]);
  };
  const resizeTable = (element: DragDropCanvasElement, rows: number, columns: number) => updateElement(element.id, {
    rows,
    columns,
    cells: Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => element.cells?.[rowIndex]?.[columnIndex] || "")),
    cellHtml: Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => element.cellHtml?.[rowIndex]?.[columnIndex] || "")),
    cellVerticalAlign: Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => element.cellVerticalAlign?.[rowIndex]?.[columnIndex] || "middle")),
    rowHeights: getCanvasTrackSizes(rows, element.rowHeights),
    columnWidths: getCanvasTrackSizes(columns, element.columnWidths),
    mergedCells: (element.mergedCells || []).flatMap((merge) => {
      if (merge.row >= rows || merge.column >= columns) return [];
      const rowSpan = Math.min(merge.rowSpan, rows - merge.row);
      const columnSpan = Math.min(merge.columnSpan, columns - merge.column);
      return rowSpan > 1 || columnSpan > 1 ? [{ ...merge, rowSpan, columnSpan }] : [];
    }),
  });

  const selectTableCell = (elementId: string, row: number, column: number, extend: boolean) => setTableSelection((current) => extend && current?.elementId === elementId
    ? { ...current, endRow: row, endColumn: column }
    : { elementId, anchorRow: row, anchorColumn: column, endRow: row, endColumn: column });
  const getSelectedTableCells = (elementId: string) => {
    if (!tableSelection || tableSelection.elementId !== elementId) return [];
    const firstRow = Math.min(tableSelection.anchorRow, tableSelection.endRow);
    const lastRow = Math.max(tableSelection.anchorRow, tableSelection.endRow);
    const firstColumn = Math.min(tableSelection.anchorColumn, tableSelection.endColumn);
    const lastColumn = Math.max(tableSelection.anchorColumn, tableSelection.endColumn);
    return Array.from({ length: lastRow - firstRow + 1 }, (_, rowOffset) => Array.from({ length: lastColumn - firstColumn + 1 }, (_, columnOffset) => `${firstRow + rowOffset}:${firstColumn + columnOffset}`)).flat();
  };
  const mergeSelectedTableCells = (element: DragDropCanvasElement) => {
    const selected = getSelectedTableCells(element.id);
    if (selected.length < 2) return;
    const coordinates = selected.map((cell) => cell.split(":").map(Number));
    const rows = coordinates.map(([row]) => row);
    const columns = coordinates.map(([, column]) => column);
    const row = Math.min(...rows);
    const column = Math.min(...columns);
    const rowSpan = Math.max(...rows) - row + 1;
    const columnSpan = Math.max(...columns) - column + 1;
    const overlaps = (merge: NonNullable<DragDropCanvasElement["mergedCells"]>[number]) => merge.row < row + rowSpan && merge.row + merge.rowSpan > row && merge.column < column + columnSpan && merge.column + merge.columnSpan > column;
    updateElement(element.id, {
      mergedCells: [...(element.mergedCells || []).filter((merge) => !overlaps(merge)), { row, column, rowSpan, columnSpan }],
      cells: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow >= row && currentRow < row + rowSpan && currentColumn >= column && currentColumn < column + columnSpan && (currentRow !== row || currentColumn !== column) ? "" : element.cells?.[currentRow]?.[currentColumn] || "")),
      cellHtml: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow >= row && currentRow < row + rowSpan && currentColumn >= column && currentColumn < column + columnSpan && (currentRow !== row || currentColumn !== column) ? "" : element.cellHtml?.[currentRow]?.[currentColumn] || "")),
      cellVerticalAlign: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow >= row && currentRow < row + rowSpan && currentColumn >= column && currentColumn < column + columnSpan && (currentRow !== row || currentColumn !== column) ? "middle" : element.cellVerticalAlign?.[currentRow]?.[currentColumn] || "middle")),
    });
    selectTableCell(element.id, row, column, false);
  };
  const unmergeSelectedTableCells = (element: DragDropCanvasElement) => {
    const selected = new Set(getSelectedTableCells(element.id));
    updateElement(element.id, { mergedCells: (element.mergedCells || []).filter((merge) => !Array.from({ length: merge.rowSpan }, (_, rowOffset) => Array.from({ length: merge.columnSpan }, (_, columnOffset) => `${merge.row + rowOffset}:${merge.column + columnOffset}`)).flat().some((cell) => selected.has(cell))) });
  };
  const runTableTextCommand = (command: string) => {
    if (!editingTableCell) return;
    const activeEditor = document.activeElement;
    document.execCommand(command, false);
    if (activeEditor instanceof HTMLElement && activeEditor.isContentEditable) activeEditor.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const boxResizeHandles = (element: DragDropCanvasElement, revealOnHover = false) => <>
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "top")} className="absolute left-3 right-3 top-0 z-30 h-2 -translate-y-1/2 cursor-ns-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from top edge" />
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "right")} className="absolute bottom-3 right-0 top-3 z-30 w-2 translate-x-1/2 cursor-ew-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from right edge" />
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "bottom")} className="absolute bottom-0 left-3 right-3 z-30 h-2 translate-y-1/2 cursor-ns-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from bottom edge" />
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "left")} className="absolute bottom-3 left-0 top-3 z-30 w-2 -translate-x-1/2 cursor-ew-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from left edge" />
    {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((edge) => <span key={edge} onPointerDown={(event) => beginElementGesture(event, element, "element-resize", edge)} className={`absolute z-40 h-3 w-3 touch-none rounded-sm border border-violet-700 bg-white transition-opacity ${revealOnHover ? "opacity-0 hover:opacity-100 focus:opacity-100" : ""} ${edge.includes("top") ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"} ${edge.includes("left") ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} ${edge === "top-left" || edge === "bottom-right" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} aria-label={`Resize from ${edge.replace("-", " ")} corner`} />)}
  </>;
  const choiceEditor = (item: (typeof data.items)[number], itemCanvasX: number, itemCanvasY: number) => {
    const placeAbove = itemCanvasY > 50;
    return <div
    data-canvas-object
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    className="absolute z-50 w-72 max-w-[calc(100cqw-1rem)] overflow-y-auto rounded-xl border border-blue-300 bg-white p-3 text-left shadow-xl"
    style={{
      left: `clamp(0.5rem, ${itemCanvasX}%, calc(100% - 18.5rem))`,
      ...(placeAbove
        ? { bottom: `calc(${100 - itemCanvasY}% + 0.5rem)`, maxHeight: `calc(${itemCanvasY}% - 1rem)` }
        : { top: `calc(${itemCanvasY}% + ${boxSize.height / 10}cqw + 0.5rem)`, maxHeight: `calc(${100 - itemCanvasY}% - ${boxSize.height / 10}cqw - 1rem)` }),
    }}
  >
    <div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-950">Edit choice</strong><button type="button" onClick={() => setEditingItemId(null)} className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700" aria-label="Close choice editor">×</button></div>
    <label className="mt-2 block text-xs font-semibold text-slate-700">Choice text<input autoFocus value={item.content} onChange={(event) => onChange({ ...data, items: data.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, content: event.target.value } : currentItem) })} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950" /></label>
    <div className="mt-2 flex flex-wrap gap-1.5">
      <label className="cursor-pointer rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white">Upload image<input type="file" accept="image/*" className="sr-only" onChange={(event) => { onItemImageFileChange(item.id, event.target.files?.[0] || null); event.target.value = ""; }} /></label>
      <button type="button" onClick={() => setShowChoiceImages((current) => !current)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700">Choose existing</button>
      {(itemPreviewUrls[item.id] || item.imageUrl) && <button type="button" onClick={() => onRemoveItemImage(item.id)} className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700">Remove image</button>}
    </div>
    {(itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="Choice preview" className="mt-2 h-24 w-full rounded-lg border border-slate-200 object-contain p-1" />}
    {showChoiceImages && <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="grid grid-cols-2 gap-1.5">{uploadedImages.map((image) => <div key={image.url} className="group relative"><button type="button" onClick={() => { onChooseItemImage(item.id, image); setShowChoiceImages(false); }} className="w-full rounded-md border border-slate-200 bg-white p-1"><img src={image.url} alt={image.label} className="h-14 w-full object-contain" /><span className="mt-0.5 block truncate text-[10px] text-slate-600">{image.label}</span></button>{image.id && <button type="button" onClick={() => onDeleteUploadedImage(image as LocationLibraryImage & { id: string })} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] font-bold text-white opacity-0 shadow group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${image.label}`}>×</button>}</div>)}</div>
      {!uploadedImages.length && <p className="text-xs text-slate-500">No uploaded images yet.</p>}
    </div>}
    <div className="mt-3 flex justify-between gap-2"><button type="button" onClick={() => setEditingItemId(null)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Done</button><button type="button" onClick={() => { onRemoveItemImage(item.id); onChange({ ...data, items: data.items.filter((currentItem) => currentItem.id !== item.id), zones: data.zones.map((zone) => ({ ...zone, correctItemIds: zone.correctItemIds.filter((itemId) => itemId !== item.id) })) }); setEditingItemId(null); }} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">Remove choice</button></div>
  </div>;
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold text-slate-950">Location canvas</h3><p className="mt-1 text-sm text-slate-500">Drag and resize targets on a blank canvas, or add a diagram as the background.</p></div>
        <button type="button" onClick={addTarget} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add target</button>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <button type="button" onClick={() => { setShowImages((current) => !current); setSelectedLibraryImages([]); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add images</button>
        {data.backgroundImageUrl && <button type="button" onClick={() => onChange({ ...data, backgroundImageUrl: "", backgroundImagePath: "" })} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove original background</button>}
        <button type="button" onClick={addTextBox} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Text box</button>
        <button type="button" onClick={addTable} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Table</button>
        <button type="button" onClick={() => { addNumberLine(); setShowShapeMenu(false); setDrawingShapeKind(null); }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Number line</button>
        <div className="relative">
          <button type="button" onClick={() => setShowShapeMenu((current) => !current)} aria-expanded={showShapeMenu} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${showShapeMenu || drawingShapeKind ? "border-blue-500 bg-blue-100 text-blue-900" : "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>+ Shape</button>
          {showShapeMenu && <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-300 bg-white p-3 shadow-xl">
            <p className="text-sm font-semibold text-slate-900">Choose a shape, then drag on the canvas</p>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Thickness <span className="font-bold text-slate-900">{drawingShapeThickness}</span><input type="range" min="1" max="12" value={drawingShapeThickness} onChange={(event) => setDrawingShapeThickness(Number(event.target.value))} className="mt-1 block w-full accent-blue-600" /></label>
            <div className="mt-3 grid grid-cols-5 gap-2">{(["line", "arrow", "circle", "rectangle", "triangle"] as const).map((kind) => <button key={kind} type="button" onClick={() => { setDrawingShapeKind(kind); setShowShapeMenu(false); setEditingElementId(null); }} className="grid h-12 place-items-center rounded-lg border border-slate-300 bg-slate-50 text-slate-900 hover:border-blue-500 hover:bg-blue-50" title={`Draw ${kind}`} aria-label={`Draw ${kind}`}>{kind === "line" ? <span className="block h-0.5 w-7 rotate-[-25deg] bg-current" /> : kind === "arrow" ? <span className="text-2xl leading-none">↗</span> : kind === "circle" ? <span className="block h-7 w-7 rounded-full border-2 border-current" /> : kind === "rectangle" ? <span className="block h-6 w-8 border-2 border-current" /> : <span className="text-3xl leading-none">△</span>}</button>)}</div>
          </div>}
        </div>
      </div>

      {drawingShapeKind && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900"><p><strong className="capitalize">Draw {drawingShapeKind}</strong> · Click and drag anywhere on the canvas.</p><button type="button" onClick={() => setDrawingShapeKind(null)} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-semibold hover:bg-blue-100">Cancel drawing</button></div>}

      {editingElement?.type === "number-line" && (() => { const numberLine = getCanvasNumberLine(editingElement); return <div key={editingElement.id} className="rounded-xl border border-blue-300 bg-blue-50 p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-blue-950">Number line settings</p><div className="flex gap-2"><button type="button" onClick={() => setEditingElementId(null)} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800">Done</button><button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((element) => element.id !== editingElement.id)); setEditingElementId(null); }} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700">Delete</button></div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold text-slate-700">Minimum<input type="number" step="any" defaultValue={numberLine.min} onChange={(event) => { const value = Number(event.target.value); if (event.target.value.trim() && Number.isFinite(value)) updateElement(editingElement.id, { numberLine: { ...numberLine, min: value } }); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
          <label className="text-xs font-semibold text-slate-700">Maximum<input type="number" step="any" defaultValue={numberLine.max} onChange={(event) => { const value = Number(event.target.value); if (event.target.value.trim() && Number.isFinite(value)) updateElement(editingElement.id, { numberLine: { ...numberLine, max: value } }); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
          <label className="text-xs font-semibold text-slate-700">Intervals<input type="number" min="1" max="40" defaultValue={numberLine.divisions} onChange={(event) => { if (event.target.value.trim()) updateElement(editingElement.id, { numberLine: { ...numberLine, divisions: clamp(Number(event.target.value) || 1, 1, 40) } }); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
          <label className="text-xs font-semibold text-slate-700">Label every<input type="number" min="1" max={numberLine.divisions} defaultValue={numberLine.labelEvery} onChange={(event) => { if (event.target.value.trim()) updateElement(editingElement.id, { numberLine: { ...numberLine, labelEvery: clamp(Number(event.target.value) || 1, 1, numberLine.divisions) } }); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
          <label className="text-xs font-semibold text-slate-700">Marked points<input key={editingElement.id} defaultValue={numberLine.points.join(", ")} onChange={(event) => updateElement(editingElement.id, { numberLine: { ...numberLine, points: event.target.value.split(",").map((value) => value.trim()).filter(Boolean).map(Number).filter((value) => Number.isFinite(value)) } })} placeholder="-1.5, 0, 1.25" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={numberLine.showArrows} onChange={(event) => updateElement(editingElement.id, { numberLine: { ...numberLine, showArrows: event.target.checked } })} />Show arrows at both ends</label>
      </div>; })()}

      {showImages && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">Add images to the canvas</p><p className="text-xs text-slate-500">Upload several files or select several existing images.</p></div><label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">{uploading ? "Uploading..." : "Upload images"}<input type="file" accept="image/*" multiple disabled={uploading} className="sr-only" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; if (!files.length) return; setUploading(true); void Promise.all(files.map(onUploadBackground)).then((images) => { addImageElements(images); setShowImages(false); }).catch((error) => alert(error instanceof Error ? error.message : "Could not upload the images.")).finally(() => setUploading(false)); }} /></label></div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9rem,12rem))] gap-2">{uploadedImages.map((image) => { const selected = selectedLibraryImages.includes(image.url); return <div key={image.url} className="group relative"><button type="button" onClick={() => setSelectedLibraryImages((current) => selected ? current.filter((url) => url !== image.url) : [...current, image.url])} className={`w-full rounded-lg border bg-white p-2 text-left ${selected ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-200 hover:border-blue-500"}`}><img src={image.url} alt={image.label} className="h-24 w-full object-contain" /><span className="mt-1 flex items-center gap-1 truncate text-xs text-slate-600"><span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{selected ? "✓" : ""}</span>{image.label}</span></button>{image.id && <button type="button" onClick={() => onDeleteUploadedImage(image as LocationLibraryImage & { id: string })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white opacity-0 shadow group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${image.label}`}>×</button>}</div>; })}
          {!uploadedImages.length && <p className="text-sm text-slate-500">No uploaded images yet.</p>}
        </div>
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setShowImages(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={!selectedLibraryImages.length} onClick={() => { addImageElements(uploadedImages.filter((image) => selectedLibraryImages.includes(image.url))); setSelectedLibraryImages([]); setShowImages(false); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add selected ({selectedLibraryImages.length})</button></div>
      </div>}

      <div ref={canvasRef} style={{ containerType: "inline-size" }} onPointerDown={(event) => { if (!(event.target instanceof Element) || !event.target.closest("[data-canvas-object]")) { setEditingItemId(null); setEditingElementId(null); setEditingTextId(null); setEditingZoneId(null); setTableSelection(null); setEditingTableCell(null); } beginShapeDraw(event); }} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={finishGesture} className={`relative overflow-hidden border border-slate-300 bg-slate-100 ${drawingShapeKind ? "cursor-crosshair touch-none ring-2 ring-blue-400" : ""} ${data.backgroundImageUrl ? "" : "aspect-video"}`}>
        {data.backgroundImageUrl
          ? <img src={data.backgroundImageUrl} alt="Location question background" className="block h-auto w-full select-none object-contain" draggable={false} />
          : !(data.canvasElements || []).length && !data.zones.length && !data.items.length
            ? <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-500">Blank canvas · add targets or upload a background</div>
            : null}
        <div className={`absolute inset-0 ${drawingShapeKind ? "pointer-events-none" : ""}`}>
          {(data.canvasElements || []).map((element) => { const isInlineEditing = editingElementId === element.id && (element.type === "text" || element.type === "table" || element.type === "image" || element.type === "shape"); const selectedTableCells = element.type === "table" ? getSelectedTableCells(element.id) : []; const selectedCellSet = new Set(selectedTableCells); const selectedMerge = element.type === "table" ? (element.mergedCells || []).find((merge) => Array.from({ length: merge.rowSpan }, (_, rowOffset) => Array.from({ length: merge.columnSpan }, (_, columnOffset) => `${merge.row + rowOffset}:${merge.column + columnOffset}`)).flat().some((cell) => selectedCellSet.has(cell))) : undefined; const activeTableCell = editingTableCell?.elementId === element.id ? editingTableCell : null; return <div key={element.id} data-canvas-object onPointerDown={(event) => { if (element.type !== "text") beginElementGesture(event, element, "element-move"); }} onClick={(event) => { event.stopPropagation(); if (!gestureMovedRef.current) { setEditingZoneId(null); setEditingElementId(element.id); setEditingTextId(element.type === "text" && event.detail >= 2 ? element.id : null); if (element.type !== "table") { setTableSelection(null); setEditingTableCell(null); } } }} onDoubleClick={(event) => { if (element.type === "text") { event.preventDefault(); event.stopPropagation(); setEditingElementId(element.id); setEditingTextId(element.id); } }} className={`absolute box-border cursor-move touch-none ${isInlineEditing ? "z-40" : "z-0"} ${element.type === "shape" ? "" : `bg-white/20 ${editingElementId === element.id ? "ring-2 ring-violet-500" : "hover:ring-2 hover:ring-violet-300"}`}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}>
            {element.type === "text"
              ? <CanvasInlineTextEditor element={element} selected={editingElementId === element.id} editing={editingElementId === element.id && editingTextId === element.id} toolbarPlacement={element.y < 12 ? "below" : "above"} onChange={(patch) => updateElement(element.id, patch)} onMovePointerDown={(event) => beginElementGesture(event, element, "element-move")} onStartEditing={() => { setEditingElementId(element.id); setEditingTextId(element.id); }} onDelete={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingTextId(null); setEditingElementId(null); }} />
              : <LocationCanvasElementContent element={element} editableTable={element.type === "table" && editingElementId === element.id} activeTableCell={activeTableCell} selectedTableCells={selectedTableCells} onTableCellFocus={(rowIndex, columnIndex) => setEditingTableCell({ elementId: element.id, row: rowIndex, column: columnIndex })} onTableCellSelect={(rowIndex, columnIndex, extend) => selectTableCell(element.id, rowIndex, columnIndex, extend)} onTableCellPointerDown={(event) => beginElementGesture(event, element, "element-move", undefined, true)} onTableCellChange={(rowIndex, columnIndex, html, text) => updateElement(element.id, { cells: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow === rowIndex && currentColumn === columnIndex ? text : element.cells?.[currentRow]?.[currentColumn] || "")), cellHtml: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow === rowIndex && currentColumn === columnIndex ? html : element.cellHtml?.[currentRow]?.[currentColumn] || "")) })} />}
            {element.type === "image" && editingElementId === element.id && <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1.5 text-xs shadow-lg ${element.y < 12 ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}><span className="px-1 font-semibold text-slate-700">Image</span><button type="button" onClick={() => setEditingElementId(null)} className="h-7 rounded border border-slate-300 bg-white px-2 font-semibold text-blue-800 shadow-sm hover:bg-blue-50">Done</button><button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingElementId(null); }} className="h-7 rounded border border-red-300 bg-white px-2 font-semibold text-red-700 shadow-sm hover:bg-red-50">Delete</button></div>}
            {element.type === "shape" && editingElementId === element.id && (() => { const shape = getCanvasShape(element); return <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] flex-wrap items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 p-1.5 text-xs shadow-lg ${element.y < 12 ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}>
              {(["line", "arrow", "circle", "rectangle", "triangle"] as const).map((kind) => <button key={kind} type="button" onClick={() => updateElement(element.id, { shape: { ...shape, kind } })} aria-pressed={shape.kind === kind} className={`h-7 rounded border px-2 font-semibold capitalize ${shape.kind === kind ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-blue-50"}`}>{kind}</button>)}
              <label className="flex h-7 min-w-40 items-center gap-1 rounded border border-slate-300 bg-white px-2 font-semibold text-slate-700">Thickness<input type="range" min="1" max="12" value={shape.thickness} onChange={(event) => updateElement(element.id, { shape: { ...shape, thickness: Number(event.target.value) } })} className="min-w-20 flex-1 accent-blue-600" /><span className="w-4 text-center">{shape.thickness}</span></label>
              <button type="button" onClick={() => setEditingElementId(null)} className="h-7 rounded border border-blue-300 bg-white px-2 font-semibold text-blue-800 hover:bg-blue-50">Done</button><button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingElementId(null); }} className="h-7 rounded border border-red-300 bg-white px-2 font-semibold text-red-700 hover:bg-red-50">Delete</button>
            </div>; })()}
            {element.type === "table" && editingElementId === element.id && <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] flex-col items-start gap-1 text-xs ${element.y < 12 ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}>
              <div className="flex w-max max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1.5 shadow-lg">
                <label className="flex items-center gap-1 font-semibold text-slate-600">Rows<input type="number" min="1" max="12" defaultValue={element.rows || 2} onChange={(event) => { if (event.target.value.trim()) resizeTable(element, clamp(Number(event.target.value) || 1, 1, 12), element.columns || 2); }} onBlur={(event) => { event.currentTarget.value = String(element.rows || 2); }} className="h-7 w-12 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
                <label className="flex items-center gap-1 font-semibold text-slate-600">Columns<input type="number" min="1" max="8" defaultValue={element.columns || 2} onChange={(event) => { if (event.target.value.trim()) resizeTable(element, element.rows || 2, clamp(Number(event.target.value) || 1, 1, 8)); }} onBlur={(event) => { event.currentTarget.value = String(element.columns || 2); }} className="h-7 w-12 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
                <label className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 font-semibold text-slate-700"><input type="checkbox" checked={element.showBorders !== false} onChange={(event) => updateElement(element.id, { showBorders: event.target.checked })} />Borders</label>
                {selectedTableCells.length > 1 && <button type="button" onClick={() => mergeSelectedTableCells(element)} className="h-7 rounded border border-blue-400 bg-blue-600 px-2 font-semibold text-white shadow-sm hover:bg-blue-500">Merge cells</button>}
                {selectedMerge && <button type="button" onClick={() => unmergeSelectedTableCells(element)} className="h-7 rounded border border-blue-300 bg-white px-2 font-semibold text-blue-800 shadow-sm hover:bg-blue-50">Unmerge</button>}
                {selectedTableCells.length === 1 && !selectedMerge && <span className="px-1 text-slate-500">Shift-click another cell to merge</span>}
                <button type="button" onClick={() => { setEditingTableCell(null); setEditingElementId(null); }} className="h-7 rounded border border-slate-300 bg-white px-2 font-semibold text-blue-800 shadow-sm hover:bg-blue-50">Done</button>
                <button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingTableCell(null); setEditingElementId(null); }} className="h-7 rounded border border-red-300 bg-white px-2 font-semibold text-red-700 shadow-sm hover:bg-red-50">Delete</button>
              </div>
              {activeTableCell && <div className="flex w-max max-w-full flex-wrap items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 p-1.5 shadow-lg">
                <span className="px-1 font-semibold text-blue-900">Cell text</span>
                <label className="flex items-center gap-1 font-semibold text-slate-600">Size<input type="number" min="10" max="72" value={element.fontSize || 16} onChange={(event) => updateElement(element.id, { fontSize: clamp(Number(event.target.value) || 16, 10, 72) })} className="h-7 w-12 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand("bold")} className="grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs font-bold text-slate-800 hover:bg-blue-100" aria-label="Bold selected cell text">B</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand("italic")} className="grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs italic text-slate-800 hover:bg-blue-100" aria-label="Italicize selected cell text">I</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand("underline")} className="grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs underline text-slate-800 hover:bg-blue-100" aria-label="Underline selected cell text">U</button>
                {(["Left", "Center", "Right"] as const).map((alignment) => <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand(`justify${alignment}`)} className="grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-slate-800 hover:bg-blue-100" aria-label={`Align selected cell text ${alignment.toLowerCase()}`} title={`Align ${alignment.toLowerCase()}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">{alignment === "Left" ? <path d="M3 4h14M3 8h9M3 12h14M3 16h9" /> : alignment === "Center" ? <path d="M3 4h14M5.5 8h9M3 12h14M5.5 16h9" /> : <path d="M3 4h14M8 8h9M3 12h14M8 16h9" />}</svg></button>)}
                <span className="mx-0.5 h-5 w-px bg-blue-200" aria-hidden="true" />
                {(["top", "middle", "bottom"] as const).map((alignment) => {
                  const selectedAlignment = (element.cellVerticalAlign?.[activeTableCell.row]?.[activeTableCell.column] || "middle") === alignment;
                  return <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => updateElement(element.id, { cellVerticalAlign: Array.from({ length: element.rows || 2 }, (_, rowIndex) => Array.from({ length: element.columns || 2 }, (_, columnIndex) => rowIndex === activeTableCell.row && columnIndex === activeTableCell.column ? alignment : element.cellVerticalAlign?.[rowIndex]?.[columnIndex] || "middle")) })} className={`grid h-7 min-w-7 place-items-center rounded border px-1.5 ${selectedAlignment ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-blue-100"}`} aria-label={`Align cell text to the ${alignment}`} title={`Align ${alignment}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M3 3h14M3 17h14" />{alignment === "top" ? <path d="M6 6h8M8 9h4" /> : alignment === "middle" ? <path d="M6 8h8M8 11h4" /> : <path d="M8 11h4M6 14h8" />}</svg></button>;
                })}
              </div>}
            </div>}
            {element.type === "table" && <>
              {getCanvasTrackSizes(element.columns || 2, element.columnWidths).slice(0, -1).map((_, index, tracks) => <span key={`column-${index}`} onPointerDown={(event) => beginTableTrackGesture(event, element, "table-column", index)} title={`Resize columns ${index + 1} and ${index + 2}`} className="absolute bottom-0 top-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" style={{ left: `${tracks.slice(0, index + 1).reduce((sum, size) => sum + size, 0)}%` }} />)}
              {getCanvasTrackSizes(element.rows || 2, element.rowHeights).slice(0, -1).map((_, index, tracks) => <span key={`row-${index}`} onPointerDown={(event) => beginTableTrackGesture(event, element, "table-row", index)} title={`Resize rows ${index + 1} and ${index + 2}`} className="absolute left-0 right-0 z-20 h-2 -translate-y-1/2 cursor-row-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" style={{ top: `${tracks.slice(0, index + 1).reduce((sum, size) => sum + size, 0)}%` }} />)}
            </>}
            {element.type === "table" ? boxResizeHandles(element, true) : (element.type === "text" || element.type === "image") ? editingElementId === element.id ? boxResizeHandles(element) : null : element.type !== "shape" && <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize")} className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize touch-none border-l border-t border-violet-700 bg-white" aria-label="Resize canvas element" />}
          </div>; })}
          <div data-canvas-object onPointerDown={() => { setEditingElementId(null); setEditingZoneId(null); setTableSelection(null); setEditingTableCell(null); }} className="absolute z-30" style={{ left: `${data.choiceBankX ?? 8}%`, top: `${data.choiceBankY ?? 6}%` }}>
            <div className="absolute bottom-full left-0 z-10 mb-1 flex w-max items-center gap-1">
              <button type="button" onPointerDown={beginChoiceGesture} className="cursor-move touch-none whitespace-nowrap rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white shadow">Move group</button>
              <button type="button" onClick={() => onChange({ ...data, choiceBankDirection: choicesAreVertical ? "horizontal" : "vertical" })} className="grid h-6 w-7 place-items-center rounded bg-white text-sm font-bold text-blue-800 shadow ring-1 ring-blue-300" title={choicesAreVertical ? "Arrange choices horizontally" : "Arrange choices vertically"} aria-label={choicesAreVertical ? "Arrange choices horizontally" : "Arrange choices vertically"}>{choicesAreVertical ? "↔" : "↕"}</button>
              <button type="button" onClick={addChoice} className="grid h-6 w-7 place-items-center rounded bg-white text-base font-bold text-blue-800 shadow ring-1 ring-blue-300" title="Add choice" aria-label="Add choice">+</button>
            </div>
            <div className={`flex w-max ${choicesAreVertical ? "flex-col" : "flex-row"}`} style={{ gap: "0.8cqw" }}>{data.items.map((item) => <div key={item.id} className="relative shrink-0" style={boxCanvasStyle}><button type="button" onClick={() => { setEditingElementId(null); setEditingZoneId(null); setTableSelection(null); setEditingItemId(item.id); setShowChoiceImages(false); }} style={{ padding: "1cqw 1.4cqw", fontSize: "1.7cqw" }} className={`box-border flex h-full w-full flex-col items-center justify-center rounded border bg-white text-center font-medium text-black shadow-sm transition hover:border-blue-600 hover:ring-2 hover:ring-blue-200 ${editingItemId === item.id ? "border-blue-700 ring-2 ring-blue-300" : "border-slate-400"}`}>
                {(itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="" style={{ maxHeight: "10cqw", maxWidth: "14cqw", marginBottom: "0.5cqw" }} className="min-h-0 flex-1 object-contain" />}
                <span>{item.content || "Untitled choice"}</span>
              </button></div>)}</div>
          </div>
          {editingItemId && (() => { const index = data.items.findIndex((item) => item.id === editingItemId); const item = data.items[index]; if (!item) return null; const itemCanvasX = (data.choiceBankX ?? 8) + (choicesAreVertical ? 0 : index * (boxSize.width / 10 + 0.8)); const itemCanvasY = (data.choiceBankY ?? 6) + (choicesAreVertical ? index * (boxSize.height / 10 + 0.8) : 0); return choiceEditor(item, itemCanvasX, itemCanvasY); })()}
          {data.zones.map((zone, index) => <div key={zone.id} data-canvas-object onPointerDown={(event) => beginGesture(event, zone)} onClick={(event) => { event.stopPropagation(); if (!gestureMovedRef.current) { setEditingElementId(null); setTableSelection(null); setEditingZoneId(zone.id); } }} className={`absolute z-20 box-border cursor-move touch-none border-2 border-dashed bg-blue-100/45 ${editingZoneId === zone.id ? "border-blue-700 ring-2 ring-blue-300" : "border-blue-500"}`} style={{ left: `${zone.x ?? 10}%`, top: `${zone.y ?? 10}%`, ...boxCanvasStyle }}>
            <span className="absolute left-1 top-1 grid h-6 min-w-6 place-items-center rounded bg-blue-700 px-1 text-xs font-bold text-white">{index + 1}</span>
          </div>)}
          {data.zones.map((zone) => editingZoneId === zone.id && <div key={`editor-${zone.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="absolute z-40 w-64 rounded-xl border border-blue-300 bg-white p-3 text-left shadow-xl" style={{ left: `min(${zone.x ?? 10}%, calc(100% - 16rem))`, ...((zone.y ?? 10) > 55 ? { bottom: `calc(${100 - (zone.y ?? 10)}% + 0.8cqw)` } : { top: `calc(${zone.y ?? 10}% + ${boxSize.height / 10 + 0.8}cqw)` }) }}>
            <label className="block text-xs font-semibold text-slate-700">Target label<input value={zone.label} onChange={(event) => updateZone(zone.id, { label: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
            <label className="mt-2 block text-xs font-semibold text-slate-700">Correct choice<select value={zone.correctItemIds[0] || ""} onChange={(event) => updateZone(zone.id, { correctItemIds: event.target.value ? [event.target.value] : [], capacity: 1 })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"><option value="">Select a choice</option>{data.items.map((item) => <option key={item.id} value={item.id} disabled={data.zones.some((currentZone) => currentZone.id !== zone.id && currentZone.correctItemIds[0] === item.id)}>{item.content || "Untitled choice"}</option>)}</select></label>
            <div className="mt-3 flex justify-between gap-2"><button type="button" onClick={() => setEditingZoneId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Done</button><button type="button" onClick={() => { updateZones(data.zones.filter((currentZone) => currentZone.id !== zone.id)); setEditingZoneId(null); }} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700">Remove target</button></div>
          </div>)}
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" checked={data.settings.showTargetLabels ?? false} onChange={(event) => onChange({ ...data, settings: { ...data.settings, showTargetLabels: event.target.checked } })} className="mt-1" />
        <span><strong className="block text-slate-900">Show labels above targets</strong><span className="text-xs text-slate-500">Useful for matching to named columns or steps. Leave off for points on diagrams and number lines.</span></span>
      </label>

    </section>
  );
}
