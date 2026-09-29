import { getCanvasNumberLine, getCanvasNumberLineTicks, type DragDropCanvasElement } from "./dragDrop";

// Both canvas elements and inline choices use this markup. All interpolated
// values come from normalized numeric settings, never author-supplied HTML.
export function buildNumberLineSvg(element: Pick<DragDropCanvasElement, "numberLine">) {
  const line = getCanvasNumberLine(element);
  const ticks = getCanvasNumberLineTicks(element);
  const extension = line.showArrows && line.extendArrowsPastTicks ? line.arrowExtensionPercent * 10 : 0;
  const x = (value: number) => 60 + extension + (value - line.min) / (line.max - line.min) * (880 - 2 * extension);
  const label = (value: number) => String(Number(value.toPrecision(10)));
  const arrow = (tip: number, direction: "left" | "right", size: number) => `<path d="M ${tip} 92 L ${tip + (direction === "left" ? size : -size)} ${92 - size / 2} L ${tip + (direction === "left" ? size : -size)} ${92 + size / 2} Z" fill="currentColor"/>`;
  const labelledValues = line.labelMode === "specific" ? line.labelValues : ticks.filter((_, index) => index % line.labelEvery === line.labelOffset);
  const sameValue = (a: number, b: number) => Math.abs(a - b) <= line.increment * 1e-8;
  const allTicks = [...ticks, ...labelledValues.filter(value => !ticks.some(tick => sameValue(tick, value)))];
  const tickMarkup = allTicks.map(value => {
    const major = labelledValues.some(labelled => sameValue(labelled, value));
    return `<g><line x1="${x(value)}" x2="${x(value)}" y1="${major ? 68 : 76}" y2="${major ? 116 : 108}" stroke="currentColor" stroke-width="${major ? 4 : 2}"/>${line.showLabels && major ? `<text x="${x(value)}" y="158" text-anchor="middle" fill="currentColor" font-size="34" font-family="ui-sans-serif, system-ui, sans-serif">${label(value)}</text>` : ""}</g>`;
  }).join("");
  const points = line.points.map(value => `<circle cx="${x(value)}" cy="92" r="9" fill="currentColor"/>`).join("");
  const rayMarkup = line.rays.map(ray => {
    const tip = ray.direction === "left" ? 60 : 940;
    const shaftEnd = tip + (ray.direction === "left" ? 24 : -24);
    return `<g data-number-line-ray="${ray.direction}"><line x1="${x(ray.value)}" x2="${shaftEnd}" y1="92" y2="92" stroke="currentColor" stroke-width="12"/>${arrow(tip, ray.direction, 32)}</g>`;
  }).join("");
  // Paint all endpoints last so a later ray cannot cover an earlier endpoint.
  const endpoints = line.rays.map(ray => `<g><circle data-ray-endpoint="${ray.closed ? "closed" : "open"}" cx="${x(ray.value)}" cy="92" r="10" stroke="currentColor" stroke-width="4" fill="${ray.closed ? "currentColor" : "white"}"/></g>`).join("");
  const description = `Number line from ${label(line.min)} to ${label(line.max)}${line.points.length ? `; points at ${line.points.map(label).join(", ")}` : ""}${line.rays.map(ray => `; ray for values ${ray.direction === "left" ? "less" : "greater"} than${ray.closed ? " or equal to" : ""} ${label(ray.value)}`).join("")}`;
  const markup = `<title>${description}</title><line x1="60" x2="940" y1="92" y2="92" stroke="currentColor" stroke-width="5"/>${line.showArrows ? arrow(60, "left", 24) + arrow(940, "right", 24) : ""}${tickMarkup}${points}${rayMarkup}${endpoints}`;
  return { description, markup };
}
