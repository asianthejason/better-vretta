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
  type: "image" | "text" | "table";
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl?: string;
  imagePath?: string;
  text?: string;
  fontSize?: number;
  rows?: number;
  columns?: number;
  cells?: string[][];
  showBorders?: boolean;
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

export function getLocationBoxSize(items: DragDropItem[]): DragDropBoxSize {
  const widths = items.map((item) => Math.max(0, item.content.trim().length * 8.5));
  const width = Math.round(Math.max(96, items.some((item) => item.imageUrl) ? 144 : 0, Math.min(240, Math.max(0, ...widths) + 32)));
  const contentWidth = Math.max(64, width - 24);
  const heights = items.map((item) => {
    const textLines = Math.max(1, Math.ceil((item.content.trim().length * 8.5) / contentWidth));
    return 20 + textLines * 20 + (item.imageUrl ? 88 : 0);
  });
  return { width, height: Math.round(Math.max(52, Math.min(176, Math.max(0, ...heights)))) };
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
