export type DropdownLayout = "inline" | "table";

export type DropdownEntry = {
  id: string;
  label: string;
  options?: string[];
  correctAnswer: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type DropdownQuestionData = {
  layout: DropdownLayout;
  template: string;
  /** Legacy shared options. New questions store options on each entry. */
  options?: string[];
  entries: DropdownEntry[];
};

export type DropdownResponses = Record<string, string>;
export const DROPDOWN_TOKEN = "[[dropdown]]";

const tokenPattern = /\[\[\s*dropdown\s*\]\]/gi;

export function makeDropdownId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultDropdownData(): DropdownQuestionData {
  return {
    layout: "inline",
    template: "",
    entries: [],
  };
}

export function getDropdownSegments(template: string) {
  const segments: Array<{ type: "text"; content: string } | { type: "dropdown"; index: number }> = [];
  let previousEnd = 0;
  let index = 0;
  for (const match of template.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    if (start > previousEnd) segments.push({ type: "text", content: template.slice(previousEnd, start) });
    segments.push({ type: "dropdown", index });
    index += 1;
    previousEnd = start + match[0].length;
  }
  if (previousEnd < template.length) segments.push({ type: "text", content: template.slice(previousEnd) });
  return segments;
}

export function getDropdownCount(template: string) {
  return getDropdownSegments(template).filter((segment) => segment.type === "dropdown").length;
}

export function normalizeDropdownData(value?: Partial<DropdownQuestionData>): DropdownQuestionData {
  const fallback = createDefaultDropdownData();
  const layout = value?.layout === "table" ? "table" : "inline";
  const legacyOptions = (value?.options || ["Option 1", "Option 2"]).map(String);
  const entries = (value?.entries || fallback.entries).map((entry) => ({
    id: entry.id || makeDropdownId(),
    label: entry.label || "",
    options: (entry.options?.length ? entry.options : legacyOptions).map(String),
    correctAnswer: entry.correctAnswer || "",
    x: typeof entry.x === "number" ? Math.max(0, Math.min(95, entry.x)) : undefined,
    y: typeof entry.y === "number" ? Math.max(0, Math.min(95, entry.y)) : undefined,
    width: typeof entry.width === "number" ? Math.max(8, Math.min(100, entry.width)) : undefined,
    height: typeof entry.height === "number" ? Math.max(6, Math.min(100, entry.height)) : undefined,
  }));
  return { layout, template: value?.template ?? fallback.template, entries };
}

export function getDropdownEntryOptions(entry: DropdownEntry) {
  return (entry.options || []).filter((option) => option.trim());
}

export function dropdownHasCompleteAnswerKey(data: DropdownQuestionData) {
  return data.entries.length > 0 && data.entries.every((entry) => {
    const options = entry.options || [];
    return options.length >= 2 &&
      options.every((option) => Boolean(option.trim())) &&
      Boolean(entry.correctAnswer.trim()) &&
      options.includes(entry.correctAnswer);
  });
}

export function dropdownIsAnswered(data: DropdownQuestionData, answers: DropdownResponses) {
  return data.entries.length > 0 && data.entries.every((entry) => Boolean(answers[entry.id]));
}

export function gradeDropdown(data: DropdownQuestionData, answers: DropdownResponses) {
  const entryResults = Object.fromEntries(data.entries.map((entry) => [entry.id, answers[entry.id] === entry.correctAnswer]));
  return { entryResults, isCorrect: data.entries.length > 0 && Object.values(entryResults).every(Boolean) };
}
