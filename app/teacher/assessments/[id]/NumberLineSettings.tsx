"use client";

import { copyNumberLine, readCopiedNumberLine } from "@/lib/numberLineClipboard";
import { useId, useState } from "react";
import { buildChoiceNumberLineHtml, parseChoiceNumberLine, type ChoiceNumberLine } from "@/lib/choiceNumberLine";

function draftFrom(value: ChoiceNumberLine) {
  return {
    min: String(value.min), max: String(value.max), increment: String(value.increment),
    labelEvery: String(value.labelEvery), labelOffset: String(value.labelOffset ?? 0),
    points: value.points.join(", "), showLabels: value.showLabels, showArrows: value.showArrows,
    extendArrowsPastTicks: value.extendArrowsPastTicks ?? true,
    arrowExtensionPercent: String(value.arrowExtensionPercent ?? 4),
    labelMode: value.labelMode ?? "interval" as "interval" | "specific",
    labelValues: (value.labelValues || []).join(", "),
    rays: (value.rays ?? (value.ray ? [value.ray] : [])).map(ray => ({ endpoint: String(ray.value), direction: ray.direction, closed: ray.closed })),
  };
}
type Draft = ReturnType<typeof draftFrom>;
function validate(draft: Draft): { config: ChoiceNumberLine | null; error: string } {
  const number = (value: string) => value.trim() ? Number(value) : NaN;
  const min = number(draft.min), max = number(draft.max), increment = number(draft.increment);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return { config: null, error: "Enter a maximum greater than the minimum." };
  if (!Number.isFinite(increment) || increment <= 0 || increment > max - min || (max - min) / increment > 200) return { config: null, error: "Use a positive tick spacing within the range, with no more than 200 intervals." };
  const labelEvery = number(draft.labelEvery), labelOffset = number(draft.labelOffset);
  if (draft.labelMode === "interval" && (!Number.isInteger(labelEvery) || labelEvery < 1 || !Number.isInteger(labelOffset) || labelOffset < 0 || labelOffset >= labelEvery)) return { config: null, error: "Label every 1 or more ticks. The starting offset must be smaller than that interval." };
  const points = draft.points.trim() ? draft.points.split(",").map(number) : [];
  if (points.some(point => !Number.isFinite(point) || point < min || point > max)) return { config: null, error: "Enter points within the range, separated by commas." };
  const labelValues = draft.labelValues.trim() ? draft.labelValues.split(",").map(number) : [];
  if (draft.labelMode === "specific" && (labelValues.length > 200 || labelValues.some(value => !Number.isFinite(value) || value < min || value > max))) return { config: null, error: "Enter up to 200 label values within the range, separated by commas." };
  const rays = draft.rays.map(ray => ({ value: number(ray.endpoint), direction: ray.direction, closed: ray.closed }));
  const invalidRay = rays.findIndex(ray => !Number.isFinite(ray.value) || ray.value < min || ray.value > max);
  if (invalidRay !== -1) return { config: null, error: `Place ray ${invalidRay + 1}’s endpoint within the number line’s range.` };
  const config = parseChoiceNumberLine(JSON.stringify({
    min, max, increment, labelEvery: draft.labelMode === "interval" ? labelEvery : 1, labelOffset: draft.labelMode === "interval" ? labelOffset : 0, points,
    labelMode: draft.labelMode, labelValues: draft.labelMode === "specific" ? labelValues : [], rays,
    showLabels: draft.showLabels, showArrows: draft.showArrows,
    extendArrowsPastTicks: draft.extendArrowsPastTicks, arrowExtensionPercent: number(draft.arrowExtensionPercent),
  }));
  return { config, error: config ? "" : "Use an arrow extension between 0% and 25% and no more than 200 points." };
}

const fieldClass = "mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40";

export default function NumberLineSettings({ initial, onChange, onSave, onCancel, onDelete, copySize, saveLabel = "Done" }: {
  initial: ChoiceNumberLine;
  onChange?: (value: ChoiceNumberLine) => void;
  onSave: (value: ChoiceNumberLine) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  saveLabel?: string;
  copySize?: { width: number; height: number };
}) {
  const [draft, setDraft] = useState(() => draftFrom(initial));
  const id = useId();
  const [copyMessage, setCopyMessage] = useState("");
  const [tab, setTab] = useState<"Scale" | "Markings" | "Appearance">("Scale");
  const { config, error } = validate(draft);
  function change(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    const result = validate(next);
    if (result.config) onChange?.(result.config);
  }
  function preset(kind: "plain" | "decimal") {
    const next = draftFrom(kind === "decimal"
      ? { min: 2, max: 2.6, increment: 0.05, labelEvery: 2, labelOffset: 1, points: [], showLabels: true, showArrows: true, extendArrowsPastTicks: true, arrowExtensionPercent: 6, ray: { value: 2.15, direction: "left", closed: false } }
      : { min: -5, max: 5, increment: 1, labelEvery: 1, points: [], showLabels: true, showArrows: true, extendArrowsPastTicks: true, arrowExtensionPercent: 4 });
    change(next);
    if (kind === "decimal") setTab("Markings");
  }
  function numeric(key: "min" | "max" | "increment" | "labelEvery" | "labelOffset" | "arrowExtensionPercent", label: string, step = "any") {
    return <label className="min-w-0 text-xs font-semibold text-slate-700">{label}<input type="number" step={step} value={draft[key]} onChange={event => change({ [key]: event.target.value })} className={fieldClass} /></label>;
  }
  function updateRay(index: number, patch: Partial<Draft["rays"][number]>) {
    change({ rays: draft.rays.map((ray, itemIndex) => itemIndex === index ? { ...ray, ...patch } : ray) });
  }
  return <div data-number-line-settings className="w-full cursor-auto rounded-xl bg-white p-3 text-left text-sm text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-semibold">Number line</span>
      <select aria-label="Number line preset" value="" onChange={event => preset(event.target.value as "plain" | "decimal")} className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
        <option value="" disabled>Start from a preset…</option><option value="plain">Whole numbers</option><option value="decimal">Decimal inequality</option>
      </select>
    </div>
    <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 px-2 text-center text-base" aria-label="Number line preview">
      {config ? <div dangerouslySetInnerHTML={{ __html: buildChoiceNumberLineHtml(config) }} /> : <p role="alert" className="p-3 text-xs text-red-700">{error}</p>}
    </div>
    <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Number line settings">
      {(["Scale", "Markings", "Appearance"] as const).map(name => <button key={name} id={`${id}-${name}`} type="button" role="tab" aria-controls={`${id}-panel`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onKeyDown={event => {
        const tabs = ["Scale", "Markings", "Appearance"] as const;
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = event.key === "Home" ? 0 : event.key === "End" ? 2 : (tabs.indexOf(name) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
        setTab(tabs[index]);
        document.getElementById(`${id}-${tabs[index]}`)?.focus();
      }} onClick={() => setTab(name)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${tab === name ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:bg-white/60"}`}>{name}</button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="space-y-3">
      {tab === "Scale" && <>
        <div className="grid grid-cols-2 gap-3">{numeric("min", "Minimum")}{numeric("max", "Maximum")}{numeric("increment", "Tick spacing", "0.05")}</div>
        <label className="block text-xs font-semibold text-slate-700">Label placement<select value={draft.labelMode} onChange={event => change({ labelMode: event.target.value as Draft["labelMode"] })} className={fieldClass}><option value="interval">Every N tick increments</option><option value="specific">Only specific values</option></select></label>
        {draft.labelMode === "interval" ? <>
          <div className="grid grid-cols-2 gap-3">{numeric("labelEvery", "Label every N ticks", "1")}{numeric("labelOffset", "Skip ticks before first label", "1")}</div>
          <p className="text-xs leading-relaxed text-slate-500">For decimals like 2.05, 2.15, 2.25: use tick spacing 0.05 and label every 2 ticks.</p>
        </> : <label className="block text-xs font-semibold text-slate-700">Values to label<input value={draft.labelValues} onChange={event => change({ labelValues: event.target.value })} placeholder="e.g. 2.05, 2.15, 2.55" className={fieldClass} /><span className="mt-1 block font-normal text-slate-500">Separate values with commas. Only these values will be labelled.</span></label>}
      </>}
      {tab === "Markings" && <>
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-700">Inequality rays</span><button type="button" disabled={draft.rays.length >= 200} onClick={() => change({ rays: [...draft.rays, { endpoint: draft.min, direction: "right", closed: false }] })} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-40">+ Add ray</button></div>
        {draft.rays.length === 0 && <p className="text-xs text-slate-500">No rays yet. Add one or more to show inequalities on this number line.</p>}
        {draft.rays.map((ray, index) => <details key={index} className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500">Ray {index + 1} · x {ray.direction === "left" ? (ray.closed ? "≤" : "<") : (ray.closed ? "≥" : ">")} {ray.endpoint} · {ray.closed ? "Closed" : "Open"}</summary>
          <div className="space-y-2 border-t border-slate-200 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-xs font-semibold text-slate-700">Direction<select aria-label={`Ray ${index + 1} direction`} value={ray.direction} onChange={event => updateRay(index, { direction: event.target.value as "left" | "right" })} className={fieldClass}><option value="left">← Less than</option><option value="right">Greater than →</option></select></label>
            <label className="min-w-0 text-xs font-semibold text-slate-700">Endpoint value<input aria-label={`Ray ${index + 1} endpoint value`} type="number" step="any" value={ray.endpoint} onChange={event => updateRay(index, { endpoint: event.target.value })} className={fieldClass} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">{[false, true].map(closed => <button key={String(closed)} type="button" aria-label={`Ray ${index + 1} ${closed ? "closed" : "open"} endpoint`} aria-pressed={ray.closed === closed} onClick={() => updateRay(index, { closed })} className={`rounded-lg border p-2 text-xs ${ray.closed === closed ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-300"}`}>{closed ? "● Closed · included" : "○ Open · excluded"}</button>)}</div>
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-blue-800">x {ray.direction === "left" ? (ray.closed ? "≤" : "<") : (ray.closed ? "≥" : ">")} {ray.endpoint}</span><button type="button" onClick={() => change({ rays: draft.rays.filter((_, itemIndex) => itemIndex !== index) })} className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50" aria-label={`Remove ray ${index + 1}`}>Remove ray</button></div>
          </div>
        </details>)}
        <label className="block text-xs font-semibold text-slate-700">Extra plotted points<input value={draft.points} onChange={event => change({ points: event.target.value })} placeholder="e.g. -1, 0, 1.5" className={fieldClass} /><span className="mt-1 block font-normal text-slate-500">Optional filled dots, separated by commas.</span></label>
      </>}
      {tab === "Appearance" && <>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.showLabels} onChange={event => change({ showLabels: event.target.checked })} />Show number labels</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.showArrows} onChange={event => change({ showArrows: event.target.checked })} />Show arrows at both ends</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.extendArrowsPastTicks} disabled={!draft.showArrows} onChange={event => change({ extendArrowsPastTicks: event.target.checked })} />Extend arrows beyond end ticks</label>
        {draft.showArrows && draft.extendArrowsPastTicks && <div className="grid grid-cols-[1fr_6rem] items-end gap-3"><label className="text-xs font-semibold text-slate-700">Arrow extension<input aria-label="Arrow extension" type="range" min="0" max="25" step="0.5" value={Number(draft.arrowExtensionPercent) || 0} onChange={event => change({ arrowExtensionPercent: event.target.value })} className="mt-3 block w-full accent-blue-600" /></label>{numeric("arrowExtensionPercent", "Percent", "0.5")}</div>}
      </>}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" disabled={!config} onClick={() => {
        if (!config) return;
        try { copyNumberLine({ config, ...copySize }); setCopyMessage("Copied. Open another number line editor, including in an option box, and choose Paste."); }
        catch { setCopyMessage("Unable to copy. Browser storage is unavailable."); }
      }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-40">Copy number line</button>
      <button type="button" onClick={() => {
        const copy = readCopiedNumberLine();
        if (!copy) { setCopyMessage("Copy a number line first, then paste it here."); return; }
        change(draftFrom(copy.config));
        setCopyMessage("Pasted into this number line. You can edit its settings before saving.");
      }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Paste</button>
      <p role="status" className="text-xs text-slate-600">{copyMessage}</p>
    </div>
    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-3">
      {onDelete && <button type="button" onClick={onDelete} className="mr-auto rounded-lg px-2 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Remove number line</button>}
      {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Cancel</button>}
      <button type="button" disabled={!config} onClick={() => { if (config) onSave(config); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40">{saveLabel}</button>
    </div>
  </div>;
}
