export type DragDropPreset = "categories" | "sequence" | "locations" | "inline" | "freeform";

export type DragDropItem = {
  id: string;
  content: string;
  imageUrl?: string;
  imagePath?: string;
};

export type DragDropZone = {
  id: string;
  label: string;
  correctItemIds: string[];
  capacity: number | null;
  orderMatters?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type DragDropCanvasElement = {
  id: string;
  type: "image" | "text" | "table" | "number-line" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl?: string;
  imagePath?: string;
  text?: string;
  textHtml?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  rows?: number;
  columns?: number;
  cells?: string[][];
  cellHtml?: string[][];
  cellVerticalAlign?: Array<Array<"top" | "middle" | "bottom">>;
  showBorders?: boolean;
  columnWidths?: number[];
  rowHeights?: number[];
  mergedCells?: Array<{
    row: number;
    column: number;
    rowSpan: number;
    columnSpan: number;
  }>;
  numberLine?: {
    min: number;
    max: number;
    divisions: number;
    labelEvery: number;
    showArrows: boolean;
    points: number[];
  };
  shape?: {
    kind: "line" | "arrow" | "circle" | "rectangle" | "triangle";
    thickness: number;
    lineAxis?: "horizontal" | "vertical" | "diagonal";
    lineDirection?: "ascending" | "descending";
    arrowDirection?: "forward" | "reverse";
  };
};

export type DragDropData = {
  preset: DragDropPreset;
  items: DragDropItem[];
  zones: DragDropZone[];
  backgroundImageUrl?: string;
  backgroundImagePath?: string;
  choiceBankX?: number;
  choiceBankY?: number;
  choiceBankDirection?: "horizontal" | "vertical";
  canvasElements?: DragDropCanvasElement[];
  inlineText?: string;
  sequenceStartLabel?: string;
  sequenceEndLabel?: string;
  sequenceTargetCount?: number;
  direction: "horizontal" | "vertical";
  settings: {
    shuffleItems: boolean;
    allowReuse: boolean;
    showZoneOutlines: boolean;
    showTargetLabels?: boolean;
    scoring: "per-placement" | "all-or-nothing";
  };
};

export type DragDropPlacements = Record<string, string[]>;

export type DragDropBoxSize = { width: number; height: number };

export function getCanvasShape(element: Pick<DragDropCanvasElement, "shape">) {
  const kind = ["line", "arrow", "circle", "rectangle", "triangle"].includes(element.shape?.kind || "")
    ? element.shape!.kind
    : "line";
  const requestedThickness = Number(element.shape?.thickness);
  const thickness = Number.isFinite(requestedThickness)
    ? Math.max(1, Math.min(12, requestedThickness))
    : 3;
  const lineAxis = ["horizontal", "vertical", "diagonal"].includes(element.shape?.lineAxis || "")
    ? element.shape!.lineAxis!
    : "horizontal" as const;
  return {
    kind,
    thickness,
    lineAxis,
    lineDirection: element.shape?.lineDirection === "ascending" ? "ascending" as const : "descending" as const,
    arrowDirection: element.shape?.arrowDirection === "reverse" ? "reverse" as const : "forward" as const,
  };
}

export function getCanvasNumberLine(element: Pick<DragDropCanvasElement, "numberLine">) {
  const saved = element.numberLine;
  const min = Number.isFinite(saved?.min) ? saved!.min : -2;
  const requestedMax = Number.isFinite(saved?.max) ? saved!.max : 2;
  const max = requestedMax > min ? requestedMax : min + 1;
  const divisions = Math.max(1, Math.min(40, Math.trunc(saved?.divisions || 16)));
  const labelEvery = Math.max(1, Math.min(divisions, Math.trunc(saved?.labelEvery || 4)));
  const points = (saved?.points || []).filter((point) => Number.isFinite(point) && point >= min && point <= max);
  return { min, max, divisions, labelEvery, showArrows: saved?.showArrows ?? true, points };
}

export function getCanvasTextHtml(element: Pick<DragDropCanvasElement, "text" | "textHtml" | "textAlign" | "bold" | "italic" | "underline">) {
  if (element.textHtml) return element.textHtml;

  let html = (element.text || "Text")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>");
  if (element.underline) html = `<u>${html}</u>`;
  if (element.italic) html = `<em>${html}</em>`;
  if (element.bold) html = `<strong>${html}</strong>`;
  return element.textAlign && element.textAlign !== "left"
    ? `<div style="text-align: ${element.textAlign}">${html}</div>`
    : html;
}

export function getCanvasTableCellHtml(element: Pick<DragDropCanvasElement, "cells" | "cellHtml">, row: number, column: number) {
  const savedHtml = element.cellHtml?.[row]?.[column];
  if (savedHtml) return savedHtml;
  return (element.cells?.[row]?.[column] || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>");
}

export function getCanvasTrackSizes(count: number, saved?: number[]) {
  const safeCount = Math.max(1, Math.trunc(count) || 1);
  if (!saved || saved.length !== safeCount || saved.some((size) => !Number.isFinite(size) || size <= 0)) {
    return Array.from({ length: safeCount }, () => 100 / safeCount);
  }
  const total = saved.reduce((sum, size) => sum + size, 0);
  return saved.map((size) => (size / total) * 100);
}

export function getLocationBoxSize(items: DragDropItem[]): DragDropBoxSize {
  const widths = items.map((item) => Math.max(0, item.content.trim().length * 9.5));
  const width = Math.round(Math.max(120, items.some((item) => item.imageUrl) ? 176 : 0, Math.min(300, Math.max(0, ...widths) + 40)));
  const contentWidth = Math.max(80, width - 32);
  const heights = items.map((item) => {
    const textLines = Math.max(1, Math.ceil((item.content.trim().length * 9.5) / contentWidth));
    return 24 + textLines * 22 + (item.imageUrl ? 108 : 0);
  });
  return { width, height: Math.round(Math.max(64, Math.min(220, Math.max(0, ...heights)))) };
}

export const makeDragDropId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createDefaultDragDropData(): DragDropData {
  const item1 = { id: makeDragDropId(), content: "Item 1" };
  const item2 = { id: makeDragDropId(), content: "Item 2" };
  return {
    preset: "categories",
    items: [item1, item2],
    zones: [
      { id: makeDragDropId(), label: "Category 1", correctItemIds: [item1.id], capacity: null },
      { id: makeDragDropId(), label: "Category 2", correctItemIds: [item2.id], capacity: null },
    ],
    sequenceStartLabel: "First",
    sequenceEndLabel: "Last",
    sequenceTargetCount: 2,
    choiceBankX: 8,
    choiceBankY: 6,
    choiceBankDirection: "horizontal",
    canvasElements: [],
    direction: "horizontal",
    settings: {
      shuffleItems: true,
      allowReuse: false,
      showZoneOutlines: true,
      showTargetLabels: false,
      scoring: "per-placement",
    },
  };
}

export function normalizeDragDropData(value: unknown): DragDropData {
  const fallback = createDefaultDragDropData();
  if (!value || typeof value !== "object") return fallback;
  const data = value as Partial<DragDropData>;
  const items = Array.isArray(data.items) ? data.items : fallback.items;
  return {
    ...fallback,
    ...data,
    items,
    zones: Array.isArray(data.zones) ? data.zones : fallback.zones,
    canvasElements: Array.isArray(data.canvasElements) ? data.canvasElements : fallback.canvasElements,
    sequenceTargetCount: getSequenceTargetCount({
      items,
      sequenceTargetCount: typeof data.sequenceTargetCount === "number"
        ? data.sequenceTargetCount
        : data.preset === "sequence"
          ? items.length
          : fallback.sequenceTargetCount,
    }),
    settings: { ...fallback.settings, ...(data.settings || {}) },
  };
}

export function getSequenceTargetCount(data: Pick<DragDropData, "items" | "sequenceTargetCount">) {
  const requested = data.sequenceTargetCount ?? data.items.length;
  return Math.max(1, Math.min(12, Math.trunc(requested) || 1));
}

export function dragDropZoneIsCorrect(zone: DragDropZone, actual: string[]) {
  if (zone.orderMatters) {
    return zone.correctItemIds.length === actual.length && zone.correctItemIds.every((id, i) => id === actual[i]);
  }
  return zone.correctItemIds.length === actual.length && zone.correctItemIds.every((id) => actual.includes(id));
}

export function gradeDragDrop(data: DragDropData, placements: DragDropPlacements) {
  const results = data.zones.map((zone) => dragDropZoneIsCorrect(zone, placements[zone.id] || []));
  return {
    isCorrect: results.every(Boolean),
    correctPlacements: results.filter(Boolean).length,
    totalPlacements: results.length,
  };
}

export function isDragDropAnswered(data: DragDropData, placements: DragDropPlacements) {
  if (data.preset === "sequence") {
    const sequenceZone = data.zones[0];
    if (!sequenceZone) return false;
    const answers = placements[sequenceZone.id] || [];
    return Array.from({ length: getSequenceTargetCount(data) }, (_, index) => answers[index]).every(Boolean);
  }
  const placed = Object.values(placements).flat();
  const requiredItemIds = new Set(data.zones.flatMap((zone) => zone.correctItemIds));
  const requiredZonesFilled = data.zones
    .filter((zone) => zone.correctItemIds.length > 0)
    .every((zone) => (placements[zone.id] || []).length > 0);
  return requiredZonesFilled && [...requiredItemIds].every((itemId) => placed.includes(itemId));
}
