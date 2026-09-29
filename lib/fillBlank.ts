export type FillBlankLayout = "inline" | "fraction" | "math";
export type FillBlankInputMode = "text" | "number" | "math";

export type FillBlankEntry = {
  id: string;
  correctAnswer: string;
  inputMode: FillBlankInputMode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type AlgebraTileCounts = {
  positiveUnit: number;
  negativeUnit: number;
  positiveX: number;
  negativeX: number;
  positiveX2: number;
  negativeX2: number;
};

export type AlgebraTileRow = AlgebraTileCounts & {
  id: string;
  label: string;
};

export type AlgebraTileModel = {
  showLegend: boolean;
  rows: AlgebraTileRow[];
};

export type FillBlankData = {
  layout: FillBlankLayout;
  template: string;
  blanks: FillBlankEntry[];
  prefix?: string;
  suffix?: string;
  algebraTiles?: AlgebraTileModel;
};

export const FILL_BLANK_TOKEN = "[[blank]]";
export const FILL_BLANK_MATH_KEYS = [
  "x", "y", "²", "³", "^", "+", "−", "×", "÷", "=", "(", ")",
  "[", "]", "/", "√", "π", "≤", "≥", "≠", "∞",
] as const;
const blankTokenPattern = /\[\[\s*blank\s*\]\]/gi;
const legacyAnswerPattern = /\[\[(.*?)\]\]/g;

export function makeFillBlankId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getDefaultFillBlankBounds(index = 0) {
  return {
    x: 8 + (index % 4) * 20,
    y: 34 + Math.floor(index / 4) * 12,
    width: 16,
    height: 8,
  };
}

export function getFillBlankBounds(blank: FillBlankEntry, index = 0) {
  const fallback = getDefaultFillBlankBounds(index);
  return {
    x: blank.x ?? fallback.x,
    y: blank.y ?? fallback.y,
    width: blank.width ?? fallback.width,
    height: blank.height ?? fallback.height,
  };
}

export function createFillBlankEntry(inputMode: FillBlankInputMode = "text", index = 0): FillBlankEntry {
  return { id: makeFillBlankId(), correctAnswer: "", inputMode, ...getDefaultFillBlankBounds(index) };
}

export function createDefaultFillBlankData(): FillBlankData {
  return {
    layout: "inline",
    template: `The answer is ${FILL_BLANK_TOKEN}.`,
    blanks: [createFillBlankEntry("text")],
  };
}

export function createAlgebraTileRow(label = "Polynomial 1"): AlgebraTileRow {
  return {
    id: makeFillBlankId(),
    label,
    positiveUnit: 0,
    negativeUnit: 0,
    positiveX: 0,
    negativeX: 0,
    positiveX2: 0,
    negativeX2: 0,
  };
}

const normalizeTileCount = (value: unknown) => {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.min(30, Math.trunc(count))) : 0;
};

export function normalizeAlgebraTileModel(value?: Partial<AlgebraTileModel>): AlgebraTileModel | undefined {
  if (!value) return undefined;
  return {
    showLegend: value.showLegend ?? true,
    rows: (value.rows || []).map((row, index) => ({
      id: row.id || makeFillBlankId(),
      label: row.label || `Polynomial ${index + 1}`,
      positiveUnit: normalizeTileCount(row.positiveUnit),
      negativeUnit: normalizeTileCount(row.negativeUnit),
      positiveX: normalizeTileCount(row.positiveX),
      negativeX: normalizeTileCount(row.negativeX),
      positiveX2: normalizeTileCount(row.positiveX2),
      negativeX2: normalizeTileCount(row.negativeX2),
    })),
  };
}

export function getFillBlankSegments(template: string) {
  const segments: Array<{ type: "text"; content: string } | { type: "blank"; index: number }> = [];
  let previousEnd = 0;
  let index = 0;
  for (const match of template.matchAll(blankTokenPattern)) {
    const start = match.index ?? 0;
    if (start > previousEnd) segments.push({ type: "text", content: template.slice(previousEnd, start) });
    segments.push({ type: "blank", index });
    index += 1;
    previousEnd = start + match[0].length;
  }
  if (previousEnd < template.length) segments.push({ type: "text", content: template.slice(previousEnd) });
  return segments;
}

export function getFillBlankCount(template: string) {
  return getFillBlankSegments(template).filter((segment) => segment.type === "blank").length;
}

export function getFillBlankPromptText(data: FillBlankData) {
  if (data.layout === "fraction") {
    return `${data.prefix || ""} [fraction] ${data.suffix || ""}`.replace(/\s+/g, " ").trim() || "Complete the fraction.";
  }
  return data.template.replace(blankTokenPattern, "___").replace(/\s+/g, " ").trim() || "Fill in the blank.";
}

export function normalizeFillBlankData(value?: Partial<FillBlankData>, legacyTemplate = "", legacyBlanks: Array<{ id: string; correctAnswer: string }> = []): FillBlankData {
  if (value?.layout && value.template !== undefined && value.blanks) {
    return {
      layout: ["inline", "fraction", "math"].includes(value.layout) ? value.layout : "inline",
      template: value.template,
      blanks: value.blanks.map((blank, index) => {
        const fallback = getDefaultFillBlankBounds(index);
        const x = Math.max(0, Math.min(95, Number.isFinite(blank.x) ? Number(blank.x) : fallback.x));
        const y = Math.max(0, Math.min(95, Number.isFinite(blank.y) ? Number(blank.y) : fallback.y));
        return {
          id: blank.id || makeFillBlankId(),
          correctAnswer: blank.correctAnswer || "",
          inputMode: blank.inputMode || (value.layout === "math" ? "math" : "text"),
          x,
          y,
          width: Math.max(5, Math.min(100 - x, Number.isFinite(blank.width) ? Number(blank.width) : fallback.width)),
          height: Math.max(5, Math.min(100 - y, Number.isFinite(blank.height) ? Number(blank.height) : fallback.height)),
        };
      }),
      prefix: value.prefix || "",
      suffix: value.suffix || "",
      algebraTiles: normalizeAlgebraTileModel(value.algebraTiles),
    };
  }

  if (legacyTemplate) {
    const answers = [...legacyTemplate.matchAll(legacyAnswerPattern)].map((match) => match[1].trim());
    return {
      layout: "inline",
      template: legacyTemplate.replace(legacyAnswerPattern, FILL_BLANK_TOKEN),
      blanks: answers.map((correctAnswer, index) => ({ id: legacyBlanks[index]?.id || makeFillBlankId(), correctAnswer: legacyBlanks[index]?.correctAnswer || correctAnswer, inputMode: "text" })),
    };
  }

  return createDefaultFillBlankData();
}

export function fillBlankIsAnswered(data: FillBlankData, answers: Record<string, string>) {
  return data.blanks.length > 0 && data.blanks.every((blank) => Boolean(answers[blank.id]?.trim()));
}

export function normalizeFillBlankAnswer(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("²", "^2")
    .replaceAll("³", "^3")
    .replace(/\s+/g, "")
    .replaceAll("*", "");
}

export function gradeFillBlank(data: FillBlankData, answers: Record<string, string>) {
  const blankResults = Object.fromEntries(data.blanks.map((blank) => [blank.id, normalizeFillBlankAnswer(answers[blank.id]) === normalizeFillBlankAnswer(blank.correctAnswer)]));
  return { blankResults, isCorrect: data.blanks.length > 0 && Object.values(blankResults).every(Boolean) };
}
