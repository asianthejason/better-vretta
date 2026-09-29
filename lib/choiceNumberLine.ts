import { buildNumberLineSvg } from "./numberLineSvg";

export type ChoiceNumberLine = {
  min: number;
  max: number;
  increment: number;
  labelEvery: number;
  showLabels: boolean;
  showArrows: boolean;
  points: number[];
  extendArrowsPastTicks?: boolean;
  arrowExtensionPercent?: number;
  labelOffset?: number;
  ray?: { value: number; direction: "left" | "right"; closed: boolean };
  rays?: Array<{ value: number; direction: "left" | "right"; closed: boolean }>;
  labelMode?: "interval" | "specific";
  labelValues?: number[];
};

export const DEFAULT_CHOICE_NUMBER_LINE: ChoiceNumberLine = {
  min: -5, max: 5, increment: 1, labelEvery: 1,
  showLabels: true, showArrows: true, points: [], extendArrowsPastTicks: true, arrowExtensionPercent: 4, labelOffset: 0,
};

export function parseChoiceNumberLine(serialized: string): ChoiceNumberLine | null {
  try {
    const value = JSON.parse(serialized);
    if (!value || ![value.min, value.max, value.increment, value.labelEvery].every(Number.isFinite)
      || value.max <= value.min || !Number.isFinite(value.max - value.min) || value.increment <= 0
      || value.labelEvery < 1 || !Number.isInteger(value.labelEvery)
      || (value.max - value.min) / value.increment > 200
      || typeof value.showLabels !== "boolean" || typeof value.showArrows !== "boolean"
      || !Array.isArray(value.points) || value.points.length > 200
      || !value.points.every((point: unknown) => typeof point === "number" && Number.isFinite(point) && point >= value.min && point <= value.max)) return null;
    if (value.extendArrowsPastTicks !== undefined && typeof value.extendArrowsPastTicks !== "boolean") return null;
    if (value.arrowExtensionPercent !== undefined && (!Number.isFinite(value.arrowExtensionPercent) || value.arrowExtensionPercent < 0 || value.arrowExtensionPercent > 25)) return null;
    if (value.labelOffset !== undefined && (!Number.isInteger(value.labelOffset) || value.labelOffset < 0 || value.labelOffset >= value.labelEvery)) return null;
    if (value.ray !== undefined && (!value.ray || !Number.isFinite(value.ray.value) || value.ray.value < value.min || value.ray.value > value.max || !["left", "right"].includes(value.ray.direction) || typeof value.ray.closed !== "boolean")) return null;
    if (value.labelMode !== undefined && !["interval", "specific"].includes(value.labelMode)) return null;
    if (value.labelValues !== undefined && (!Array.isArray(value.labelValues) || value.labelValues.length > 200 || !value.labelValues.every((point: unknown) => typeof point === "number" && Number.isFinite(point) && point >= value.min && point <= value.max))) return null;
    if (value.rays !== undefined && (!Array.isArray(value.rays) || value.rays.length > 200 || !value.rays.every((ray: ChoiceNumberLine["ray"]) => ray && Number.isFinite(ray.value) && ray.value >= value.min && ray.value <= value.max && ["left", "right"].includes(ray.direction) && typeof ray.closed === "boolean"))) return null;
    return { ...(value.rays !== undefined ? { rays: value.rays.map((ray: NonNullable<ChoiceNumberLine["ray"]>) => ({ value: ray.value, direction: ray.direction, closed: ray.closed })) } : {}), ...(value.labelMode !== undefined ? { labelMode: value.labelMode } : {}), ...(value.labelValues !== undefined ? { labelValues: value.labelValues } : {}), extendArrowsPastTicks: value.extendArrowsPastTicks ?? true, arrowExtensionPercent: value.arrowExtensionPercent ?? 4, labelOffset: value.labelOffset ?? 0, ...(value.ray ? { ray: { value: value.ray.value, direction: value.ray.direction, closed: value.ray.closed } } : {}), min: value.min, max: value.max, increment: value.increment, labelEvery: value.labelEvery, showLabels: value.showLabels, showArrows: value.showArrows, points: value.points };
  } catch { return null; }
}

export function buildChoiceNumberLineHtml(value: ChoiceNumberLine): string {
  const config = parseChoiceNumberLine(JSON.stringify(value));
  if (!config) throw new Error("Invalid number line settings");
  const { description, markup } = buildNumberLineSvg({ numberLine: { ...config, divisions: 10 } });
  return `<span data-choice-number-line="${JSON.stringify(config).replaceAll('"', "&quot;")}" contenteditable="false" style="display:inline-block;width:20em;max-width:100%;vertical-align:middle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 58 1000 112" role="img" aria-label="${description}" style="display:block;width:100%;height:auto">${markup}</svg></span>`;
}
