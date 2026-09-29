import { normalizeFractionParentheses } from "./mathExpressions";
import { decodeMathExpressionTree, type MathExpressionNode } from "./mathExpressionTree";

export type DragDropPreset = "category-canvas" | "categories" | "sequence" | "locations" | "inline" | "freeform";

export type DragDropItem = {
  id: string;
  content: string;
  contentHtml?: string;
  imageUrl?: string;
  imagePath?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  textVerticalAlign?: "top" | "middle" | "bottom";
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
  type: "image" | "text" | "table" | "number-line" | "shape" | "algebra-tile";
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
  verticalAlign?: "top" | "middle" | "bottom";
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
    increment?: number;
    labelEvery: number;
    labelOffset?: number;
    ray?: { value: number; direction: "left" | "right"; closed: boolean };
    rays?: Array<{ value: number; direction: "left" | "right"; closed: boolean }>;
    labelMode?: "interval" | "specific";
    labelValues?: number[];
    showLabels?: boolean;
    showArrows: boolean;
    extendArrowsPastTicks?: boolean;
    /** Extension at each end as a percentage of the number line width. */
    arrowExtensionPercent?: number;
    points: number[];
  };
  shape?: {
    kind: "line" | "arrow" | "circle" | "rectangle" | "triangle";
    thickness: number;
    lineAxis?: "horizontal" | "vertical" | "diagonal";
    lineDirection?: "ascending" | "descending";
    arrowDirection?: "forward" | "reverse";
  };
  algebraTile?: {
    kind: "unit" | "x" | "x2" | "legend" | "group";
    sign: "positive" | "negative";
    counts?: CanvasAlgebraTileCounts;
  };
};

export type CanvasAlgebraTileCounts = {
  positiveUnit: number;
  positiveX: number;
  positiveX2: number;
  negativeUnit: number;
  negativeX: number;
  negativeX2: number;
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
  choiceBankGrouped?: boolean;
  choiceSameSize?: boolean;
  /** Shared option and target dimensions, in a 1000-unit canvas width. */
  choiceSize?: DragDropBoxSize;
  choicePresentation?: "content" | "radio" | "box";
  canvasElements?: DragDropCanvasElement[];
  /** Canvas height as a percentage of its responsive width. */
  canvasHeight?: number;
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
export type InlineBlankSegment = { type: "text"; content: string } | { type: "blank"; index: number };

export const ALGEBRA_TILE_OPTIONS = (["positive", "negative"] as const).flatMap((sign) =>
  (["unit", "x", "x2"] as const).map((kind) => ({ kind, sign })),
);

export const EMPTY_CANVAS_ALGEBRA_TILE_COUNTS: CanvasAlgebraTileCounts = {
  positiveUnit: 0,
  positiveX: 0,
  positiveX2: 0,
  negativeUnit: 0,
  negativeX: 0,
  negativeX2: 0,
};

export const DEFAULT_CANVAS_HEIGHT = 56.25;
export const MIN_CANVAS_HEIGHT = 40;
export const MAX_CANVAS_HEIGHT = 160;

export function normalizeCanvasHeight(value: unknown) {
  const requested = typeof value === "number" ? value : Number(value);
  return Number.isFinite(requested)
    ? Math.max(MIN_CANVAS_HEIGHT, Math.min(MAX_CANVAS_HEIGHT, requested))
    : DEFAULT_CANVAS_HEIGHT;
}

export const INLINE_BLANK_TOKEN = "[[blank]]";
const inlineBlankPattern = /\[\[\s*blank\s*\]\]/gi;

export function getInlineBlankSegments(value: string): InlineBlankSegment[] {
  const segments: InlineBlankSegment[] = [];
  let blankIndex = 0;
  let previousEnd = 0;
  for (const match of value.matchAll(inlineBlankPattern)) {
    const start = match.index ?? 0;
    if (start > previousEnd) segments.push({ type: "text", content: value.slice(previousEnd, start) });
    segments.push({ type: "blank", index: blankIndex });
    blankIndex += 1;
    previousEnd = start + match[0].length;
  }
  if (previousEnd < value.length) segments.push({ type: "text", content: value.slice(previousEnd) });
  return segments;
}

export function getInlineBlankCount(value: string) {
  return getInlineBlankSegments(value).filter((segment) => segment.type === "blank").length;
}

export function removeInlineBlank(value: string, targetIndex: number) {
  let blankIndex = 0;
  return value.replace(inlineBlankPattern, (token) => blankIndex++ === targetIndex ? "" : token);
}

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

export function getCanvasAlgebraTile(element: Pick<DragDropCanvasElement, "algebraTile">) {
  const kind = ["unit", "x", "x2", "legend", "group"].includes(element.algebraTile?.kind || "")
    ? element.algebraTile!.kind
    : "unit" as const;
  const savedCounts = element.algebraTile?.counts;
  const counts = Object.fromEntries(Object.keys(EMPTY_CANVAS_ALGEBRA_TILE_COUNTS).map((key) => {
    const countKey = key as keyof CanvasAlgebraTileCounts;
    const requested = Number(savedCounts?.[countKey]);
    return [countKey, Number.isFinite(requested) ? Math.max(0, Math.min(30, Math.trunc(requested))) : 0];
  })) as unknown as CanvasAlgebraTileCounts;
  return {
    kind,
    sign: element.algebraTile?.sign === "negative" ? "negative" as const : "positive" as const,
    counts,
  };
}

export function getCanvasNumberLine(element: Pick<DragDropCanvasElement, "numberLine">) {
  const saved = element.numberLine;
  const min = Number.isFinite(saved?.min) ? saved!.min : -2;
  const requestedMax = Number.isFinite(saved?.max) ? saved!.max : 2;
  const max = requestedMax > min ? requestedMax : min + 1;
  const range = max - min;
  const legacyDivisions = Math.max(1, Math.min(40, Math.trunc(saved?.divisions || 16)));
  const requestedIncrement = Number(saved?.increment);
  const increment = Math.min(range, Math.max(Number.isFinite(requestedIncrement) && requestedIncrement > 0 ? requestedIncrement : range / legacyDivisions, range / 200));
  const divisions = Math.max(1, Math.floor((range + increment * 1e-9) / increment));
  const labelEvery = Math.max(1, Math.min(divisions, Math.trunc(saved?.labelEvery || 4)));
  const points = (saved?.points || []).filter((point) => Number.isFinite(point) && point >= min && point <= max);
  const arrowExtensionPercent = Number.isFinite(saved?.arrowExtensionPercent) ? Math.max(0, Math.min(25, saved!.arrowExtensionPercent!)) : 4;
  const labelOffset = Math.max(0, Math.min(labelEvery - 1, Math.trunc(saved?.labelOffset || 0)));
  const ray = saved?.ray && Number.isFinite(saved.ray.value) && saved.ray.value >= min && saved.ray.value <= max
    && (saved.ray.direction === "left" || saved.ray.direction === "right")
    ? { value: saved.ray.value, direction: saved.ray.direction, closed: saved.ray.closed === true } : undefined;
  const rays = (Array.isArray(saved?.rays) ? saved.rays : ray ? [ray] : []).slice(0, 200).filter(item => item && Number.isFinite(item.value) && item.value >= min && item.value <= max && (item.direction === "left" || item.direction === "right")).map(item => ({ value: item.value, direction: item.direction, closed: item.closed === true }));
  const labelMode = saved?.labelMode === "specific" ? "specific" as const : "interval" as const;
  const labelValues = [...new Set((Array.isArray(saved?.labelValues) ? saved.labelValues : []).filter(value => Number.isFinite(value) && value >= min && value <= max))].slice(0, 200);
  return { min, max, divisions, increment, labelEvery, labelOffset, ray, rays, labelMode, labelValues, arrowExtensionPercent, showLabels: saved?.showLabels ?? true, showArrows: saved?.showArrows ?? true, extendArrowsPastTicks: saved?.extendArrowsPastTicks ?? false, points };
}

export function getCanvasNumberLineTicks(element: Pick<DragDropCanvasElement, "numberLine">) {
  const numberLine = getCanvasNumberLine(element);
  return Array.from({ length: numberLine.divisions + 1 }, (_, index) => Number((numberLine.min + index * numberLine.increment).toPrecision(12)));
}

export function getCanvasTextHtml(element: Pick<DragDropCanvasElement, "text" | "textHtml" | "textAlign" | "bold" | "italic" | "underline">) {
  if (element.textHtml) return normalizeFractionParentheses(element.textHtml);

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
  const result = element.textAlign && element.textAlign !== "left"
    ? `<div style="text-align: ${element.textAlign}">${html}</div>`
    : html;
  return normalizeFractionParentheses(result);
}

export function getCanvasTableCellHtml(element: Pick<DragDropCanvasElement, "cells" | "cellHtml">, row: number, column: number) {
  const savedHtml = element.cellHtml?.[row]?.[column];
  if (savedHtml) return normalizeFractionParentheses(savedHtml);
  const result = (element.cells?.[row]?.[column] || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>");
  return normalizeFractionParentheses(result);
}

export function getCanvasTrackSizes(count: number, saved?: number[]) {
  const safeCount = Math.max(1, Math.trunc(count) || 1);
  if (!saved || saved.length !== safeCount || saved.some((size) => !Number.isFinite(size) || size <= 0)) {
    return Array.from({ length: safeCount }, () => 100 / safeCount);
  }
  const total = saved.reduce((sum, size) => sum + size, 0);
  return saved.map((size) => (size / total) * 100);
}

export function getDragDropItemHtml(item: Pick<DragDropItem, "content" | "contentHtml">) {
  if (item.contentHtml) return normalizeFractionParentheses(item.contentHtml);
  return item.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("\n", "<br>");
}

export function getLocationBoxSize(items: DragDropItem[], customSize?: DragDropBoxSize): DragDropBoxSize {
  if (customSize && Number.isFinite(customSize.width) && Number.isFinite(customSize.height)) {
    return { width: Math.max(20, Math.min(1000, customSize.width)), height: Math.max(20, Math.min(1000, customSize.height)) };
  }
  const widths = items.map((item) => singleLineChoiceContentWidth(item.content.trim(), item.contentHtml));
  const width = Math.round(Math.max(items.some((item) => item.contentHtml?.includes("data-choice-number-line=")) ? 380 : 72, items.some((item) => item.imageUrl) ? 160 : 0, Math.min(300, Math.max(0, ...widths) + 20)));
  const contentWidth = Math.max(52, width - 20);
  const heights = items.map((item, index) => {
    const textLines = Math.max(1, item.content.split("\n").length, Math.ceil(widths[index] / contentWidth));
    const richContentHeight = item.contentHtml?.includes("data-choice-number-line=") ? 80 : item.contentHtml?.includes("<math") ? 24 : 0;
    return 14 + textLines * 22 + richContentHeight + (item.imageUrl ? 108 : 0);
  });
  return { width, height: Math.round(Math.max(48, Math.min(220, Math.max(0, ...heights)))) };
}

function mathChoiceWidth(node: MathExpressionNode): number {
  switch (node.type) {
    case "text": return Math.max(9.5, node.value.length * 9.5);
    case "slot": return 17;
    case "sequence": return node.children.reduce((width, child) => width + mathChoiceWidth(child), 0);
    case "fraction": return Math.max(mathChoiceWidth(node.numerator), mathChoiceWidth(node.denominator)) + 8;
    case "root": return mathChoiceWidth(node.radicand) + 20 + mathChoiceWidth(node.index) * 0.5;
    case "brackets": return mathChoiceWidth(node.body) + 16;
    case "superscript": return mathChoiceWidth(node.base) + mathChoiceWidth(node.exponent) * 0.7;
    case "subscript": return mathChoiceWidth(node.base) + mathChoiceWidth(node.subscript) * 0.7;
    case "summation": case "product": return Math.max(24, mathChoiceWidth(node.lower) * 0.7, mathChoiceWidth(node.upper) * 0.7) + mathChoiceWidth(node.body);
    case "integral": return 24 + Math.max(mathChoiceWidth(node.lower), mathChoiceWidth(node.upper)) * 0.7 + mathChoiceWidth(node.body) + 10 + mathChoiceWidth(node.variable);
    case "limit": return Math.max(24, (mathChoiceWidth(node.variable) + mathChoiceWidth(node.approach) + 17) * 0.7) + mathChoiceWidth(node.body);
  }
}

function singleLineChoiceContentWidth(content: string, html?: string) {
  const hasNumberLine = html?.includes("data-choice-number-line=");
  if (!html || (!html.includes("data-math-tree=") && !hasNumberLine)) return content.length * 9.5;
  // SVG titles and tick labels are not adjacent text; the graphic has its own width.
  const visibleHtml = hasNumberLine ? html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "") : html;
  // Fractions stack their numerator and denominator; plain text counts both as one long line.
  const measured = visibleHtml.replace(/<math\b[^>]*data-math-tree="([^"]+)"[^>]*>[\s\S]*?<\/math>/gi, (markup, encoded: string) => {
    const tree = decodeMathExpressionTree(encoded);
    return tree ? "M".repeat(Math.ceil(mathChoiceWidth(tree) / 9.5)) : markup;
  }).replace(/<br\s*\/?>|<\/(?:div|p)>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, "M");
  return Math.max(0, ...measured.split("\n").map((line) => line.length * 9.5));
}

export function isEmptyChoice(item: { content: string; html?: string; contentHtml?: string; imageUrl?: string }) {
  const html = item.html ?? item.contentHtml ?? "";
  return !item.imageUrl && !item.content.trim() && !/<(?:img|svg|math|video|audio|iframe)\b|data-choice-number-line=/i.test(html)
    && !html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;|&#xA0;/gi, " ").replace(/[\s\u200b]/g, "");
}

export function getSingleLineChoiceBoxSize(items: (DragDropItem & { html?: string })[], { placeholder = "Choice", selectionMode = "single" }: { placeholder?: string; selectionMode?: "single" | "multiple" } = {}): DragDropBoxSize {
  // Size the visible fallback label too, even before an answer has been entered.
  const widestText = Math.max(0, ...items.map((item, index) => singleLineChoiceContentWidth(item.content.trim() || (placeholder ? `${placeholder} ${index + 1}` : ""), item.html)));
  const hasNumberLine = items.some((item) => item.html?.includes("data-choice-number-line="));
  const markerWidth = selectionMode === "multiple" ? 28 : 0;
  const width = Math.round(Math.min(900, Math.max(hasNumberLine ? 364 : 48, items.some((item) => item.imageUrl) ? 152 : 0, widestText + 24)) + markerWidth);
  return { width, height: items.some((item) => item.imageUrl) ? 154 + (hasNumberLine ? 60 : 0) : hasNumberLine ? 80 : 64 };
}

/** Content sizes are in canvas-width units; saved heights are canvas-height percentages. */
export function getChoiceContentSizes(items: (DragDropItem & { html?: string })[], { sameSize = false, canvasHeight = DEFAULT_CANVAS_HEIGHT, selectionMode = "single" }: { sameSize?: boolean; canvasHeight?: number; selectionMode?: "single" | "multiple" } = {}) {
  const hasContent = items.some((item) => !isEmptyChoice(item));
  const shared = getSingleLineChoiceBoxSize(items, { placeholder: "", selectionMode });
  const heightScale = normalizeCanvasHeight(canvasHeight) / 100;
  const sizes = items.map((item) => {
    const natural = getSingleLineChoiceBoxSize([item], { placeholder: "", selectionMode });
    if (sameSize && hasContent) return { width: shared.width / 10, height: shared.height / 10 };
    if (!isEmptyChoice(item)) return { width: natural.width / 10, height: natural.height / 10 };
    return { width: item.width ?? natural.width / 10, height: item.height === undefined ? natural.height / 10 : item.height * heightScale };
  });
  return sameSize && !hasContent && sizes.length ? sizes.map(() => sizes[0]) : sizes;
}

export function getInlineChoiceBoxSize(items: DragDropItem[]): DragDropBoxSize {
  const widths = items.map((item) => Math.max(0, item.content.trim().length * 9.5));
  const width = Math.round(Math.max(items.some((item) => item.contentHtml?.includes("data-choice-number-line=")) ? 380 : 120, items.some((item) => item.imageUrl) ? 176 : 0, Math.min(300, Math.max(0, ...widths) + 32)));
  const contentWidth = Math.max(88, width - 24);
  const heights = items.map((item) => {
    const textLines = Math.max(1, item.content.split("\n").length, Math.ceil((item.content.trim().length * 9.5) / contentWidth));
    const richContentHeight = item.contentHtml?.includes("data-choice-number-line=") ? 80 : item.contentHtml?.includes("<math") ? 40 : 0;
    return 10 + textLines * 20 + richContentHeight + (item.imageUrl ? 100 : 0);
  });
  return { width, height: Math.round(Math.max(44, Math.min(190, Math.max(0, ...heights)))) };
}

export const makeDragDropId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createDefaultDragDropData(): DragDropData {
  const item1 = { id: makeDragDropId(), content: "" };
  const item2 = { id: makeDragDropId(), content: "" };
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
    choiceBankGrouped: true,
    choicePresentation: "content",
    canvasElements: [],
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
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

export function createLocationDragDropData(): DragDropData {
  const data = createDefaultDragDropData();
  return {
    ...data,
    preset: "locations",
    zones: data.zones.map((zone, index) => ({
      ...zone,
      label: `Target ${index + 1}`,
      correctItemIds: zone.correctItemIds.slice(0, 1),
      capacity: 1,
      x: 10 + index * 18,
      y: 35,
      width: 16,
      height: 14,
    })),
  };
}

export function createCategoryCanvasData(): DragDropData {
  const data = createDefaultDragDropData();
  return { ...data, preset: "category-canvas", choiceBankX: 8, choiceBankY: 25,
    zones: data.zones.map((zone, index) => ({ ...zone, x: 5 + index * 47, y: 45, width: 43, height: 40, capacity: null, orderMatters: false })),
    settings: { ...data.settings, allowReuse: false, showZoneOutlines: true, showTargetLabels: true } };
}

export function asLocationDragDropData(value: unknown, canvas?: {
  backgroundImageUrl?: string;
  backgroundImagePath?: string;
  elements?: DragDropCanvasElement[];
  canvasHeight?: number;
}): DragDropData {
  const data = normalizeDragDropData(value);
  if (data.preset === "category-canvas") return { ...data, settings: { ...data.settings, allowReuse: false }, zones: data.zones.map(zone => ({ ...zone, capacity: null, orderMatters: false })) };
  const elementIds = new Set((data.canvasElements || []).map((element) => element.id));
  const migratedElements = (canvas?.elements || []).filter((element) => !elementIds.has(element.id));
  return {
    ...data,
    preset: "locations",
    settings: { ...data.settings, showTargetLabels: false },
    items: data.items.map((item, index) => !item.contentHtml && item.content === `Item ${index + 1}` ? { ...item, content: "" } : item),
    backgroundImageUrl: data.backgroundImageUrl || canvas?.backgroundImageUrl,
    backgroundImagePath: data.backgroundImagePath || canvas?.backgroundImagePath,
    canvasHeight: normalizeCanvasHeight(data.canvasHeight ?? canvas?.canvasHeight),
    canvasElements: [...(data.canvasElements || []), ...migratedElements],
    choiceBankGrouped: data.choiceBankGrouped !== false,
    zones: data.zones.map((zone, index) => ({
      ...zone,
      label: zone.label || `Target ${index + 1}`,
      correctItemIds: zone.correctItemIds.slice(0, 1),
      capacity: 1,
      x: zone.x ?? 10 + (index % 4) * 18,
      y: zone.y ?? 35 + Math.floor(index / 4) * 20,
      width: zone.width ?? 16,
      height: zone.height ?? 14,
    })),
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
    canvasHeight: normalizeCanvasHeight(data.canvasHeight),
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
  if (data.preset === "category-canvas") {
    const placed = data.zones.flatMap(zone => placements[zone.id] || []);
    return data.items.length > 0 && data.items.every(item => placed.includes(item.id));
  }
  const placed = Object.values(placements).flat();
  const requiredItemIds = new Set(data.zones.flatMap((zone) => zone.correctItemIds));
  const requiredZonesFilled = data.zones
    .filter((zone) => zone.correctItemIds.length > 0)
    .every((zone) => (placements[zone.id] || []).length > 0);
  return requiredZonesFilled && [...requiredItemIds].every((itemId) => placed.includes(itemId));
}
