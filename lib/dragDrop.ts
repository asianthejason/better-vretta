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

export type DragDropData = {
  preset: DragDropPreset;
  items: DragDropItem[];
  zones: DragDropZone[];
  backgroundImageUrl?: string;
  backgroundImagePath?: string;
  inlineText?: string;
  direction: "horizontal" | "vertical";
  settings: {
    shuffleItems: boolean;
    allowReuse: boolean;
    showZoneOutlines: boolean;
    scoring: "per-placement" | "all-or-nothing";
  };
};

export type DragDropPlacements = Record<string, string[]>;

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
    direction: "horizontal",
    settings: {
      shuffleItems: true,
      allowReuse: false,
      showZoneOutlines: true,
      scoring: "per-placement",
    },
  };
}

export function normalizeDragDropData(value: unknown): DragDropData {
  const fallback = createDefaultDragDropData();
  if (!value || typeof value !== "object") return fallback;
  const data = value as Partial<DragDropData>;
  return {
    ...fallback,
    ...data,
    items: Array.isArray(data.items) ? data.items : fallback.items,
    zones: Array.isArray(data.zones) ? data.zones : fallback.zones,
    settings: { ...fallback.settings, ...(data.settings || {}) },
  };
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
  const placed = Object.values(placements).flat();
  const requiredItemIds = new Set(data.zones.flatMap((zone) => zone.correctItemIds));
  const requiredZonesFilled = data.zones
    .filter((zone) => zone.correctItemIds.length > 0)
    .every((zone) => (placements[zone.id] || []).length > 0);
  return requiredZonesFilled && [...requiredItemIds].every((itemId) => placed.includes(itemId));
}
