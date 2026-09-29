import { DEFAULT_CANVAS_HEIGHT, normalizeCanvasHeight, type DragDropCanvasElement } from "@/lib/dragDrop";

export type QuestionCanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuestionCanvasData = {
  version: 2;
  backgroundImageUrl?: string;
  backgroundImagePath?: string;
  elements: DragDropCanvasElement[];
  /** Canvas height as a percentage of its responsive width. */
  canvasHeight?: number;
  interaction?: QuestionCanvasRect;
  legacyPrompt?: QuestionCanvasRect;
  choiceLayout?: {
    grouped: boolean;
    sameSize?: boolean;
    direction: "horizontal" | "vertical";
    presentation: "content" | "radio" | "box";
    x: number;
    y: number;
    positions: Array<{ x: number; y: number; width?: number; height?: number; textVerticalAlign?: "top" | "middle" | "bottom" }>;
  };
};

const DEFAULT_PROMPT: QuestionCanvasRect = { x: 6, y: 7, width: 88, height: 19 };
const DEFAULT_RESPONSE: QuestionCanvasRect = { x: 6, y: 31, width: 88, height: 62 };
export const DEFAULT_INTERACTION: QuestionCanvasRect = { ...DEFAULT_RESPONSE };

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function normalizeQuestionCanvasRect(value: unknown, fallback: QuestionCanvasRect): QuestionCanvasRect {
  const saved = value && typeof value === "object" ? value as Partial<QuestionCanvasRect> : {};
  const x = clamp(finite(saved.x, fallback.x), 0, 95);
  const y = clamp(finite(saved.y, fallback.y), 0, 95);
  return {
    x,
    y,
    width: clamp(finite(saved.width, fallback.width), 5, 100 - x),
    height: clamp(finite(saved.height, fallback.height), 5, 100 - y),
  };
}

export function createDefaultQuestionCanvas(): QuestionCanvasData {
  return {
    version: 2,
    elements: [],
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
  };
}

export function normalizeQuestionCanvas(value: unknown): QuestionCanvasData {
  type SavedQuestionCanvas = Omit<Partial<QuestionCanvasData>, "version"> & {
    version?: number;
    prompt?: QuestionCanvasRect;
    response?: QuestionCanvasRect;
  };
  const saved: SavedQuestionCanvas = value && typeof value === "object" ? value as SavedQuestionCanvas : {};
  const interaction = saved.interaction || saved.response;
  const legacyPrompt = saved.legacyPrompt || (saved.version === 1 ? saved.prompt : undefined);
  return {
    version: 2,
    backgroundImageUrl: typeof saved.backgroundImageUrl === "string" ? saved.backgroundImageUrl : "",
    backgroundImagePath: typeof saved.backgroundImagePath === "string" ? saved.backgroundImagePath : "",
    elements: Array.isArray(saved.elements) ? saved.elements : [],
    canvasHeight: normalizeCanvasHeight(saved.canvasHeight),
    interaction: interaction ? normalizeQuestionCanvasRect(interaction, DEFAULT_RESPONSE) : undefined,
    legacyPrompt: legacyPrompt ? normalizeQuestionCanvasRect(legacyPrompt, DEFAULT_PROMPT) : undefined,
    choiceLayout: saved.choiceLayout && typeof saved.choiceLayout === "object" ? {
      grouped: saved.choiceLayout.grouped !== false,
      ...(saved.choiceLayout.sameSize === true ? { sameSize: true } : {}),
      direction: saved.choiceLayout.direction === "horizontal" ? "horizontal" : "vertical",
      presentation: saved.choiceLayout.presentation === "radio" || saved.choiceLayout.presentation === "box" ? saved.choiceLayout.presentation : "content",
      x: clamp(finite(saved.choiceLayout.x, 8), 0, 95),
      y: clamp(finite(saved.choiceLayout.y, 35), 0, 95),
      positions: Array.isArray(saved.choiceLayout.positions)
        ? saved.choiceLayout.positions.map((position, index) => {
            const width = typeof position?.width === "number" ? clamp(position.width, 2, 40) : undefined;
            const height = typeof position?.height === "number" ? clamp(position.height, 3, 50) : undefined;
            return {
              x: clamp(finite(position?.x, 8), 0, 95),
              y: clamp(finite(position?.y, 35 + index * 12), 0, 95),
              ...(width !== undefined ? { width } : {}),
              ...(height !== undefined ? { height } : {}),
              ...(position?.textVerticalAlign === "top" || position?.textVerticalAlign === "bottom" ? { textVerticalAlign: position.textVerticalAlign } : {}),
            };
          })
        : [],
    } : undefined,
  };
}

export function questionCanvasToComposition(canvas: QuestionCanvasData) {
  return {
    preset: "locations" as const,
    items: [],
    zones: [],
    backgroundImageUrl: canvas.backgroundImageUrl,
    backgroundImagePath: canvas.backgroundImagePath,
    canvasElements: canvas.elements,
    canvasHeight: normalizeCanvasHeight(canvas.canvasHeight),
    direction: "horizontal" as const,
    settings: {
      shuffleItems: false,
      allowReuse: false,
      showZoneOutlines: false,
      showTargetLabels: false,
      scoring: "all-or-nothing" as const,
    },
  };
}
