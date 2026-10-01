import { parseChoiceNumberLine, type ChoiceNumberLine } from "./choiceNumberLine";

const KEY = "jretta:number-line-clipboard:v1";
export type NumberLineCopy = { config: ChoiceNumberLine; width?: number; height?: number };

export function copyNumberLine(copy: NumberLineCopy) {
  localStorage.setItem(KEY, JSON.stringify(copy));
}

export function readCopiedNumberLine(): NumberLineCopy | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!saved || typeof saved !== "object") return null;
    const config = parseChoiceNumberLine(JSON.stringify(saved.config));
    if (!config) return null;
    const dimension = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(100, value)) : undefined;
    return { config, width: dimension(saved.width), height: dimension(saved.height) };
  } catch { return null; }
}
