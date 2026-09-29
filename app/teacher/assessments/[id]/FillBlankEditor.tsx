"use client";

import { useRef, useState } from "react";
import {
  FILL_BLANK_MATH_KEYS,
  FILL_BLANK_TOKEN,
  createAlgebraTileRow,
  createFillBlankEntry,
  getFillBlankCount,
  type FillBlankData,
  type FillBlankInputMode,
  type FillBlankLayout,
  type AlgebraTileCounts,
} from "@/lib/fillBlank";

const algebraTileFields: Array<{ key: keyof AlgebraTileCounts; label: string }> = [
  { key: "positiveX2", label: "+x²" },
  { key: "negativeX2", label: "−x²" },
  { key: "positiveX", label: "+x" },
  { key: "negativeX", label: "−x" },
  { key: "positiveUnit", label: "+1" },
  { key: "negativeUnit", label: "−1" },
];

export default function FillBlankEditor({ value, onChange }: { value: FillBlankData; onChange: (value: FillBlankData) => void }) {
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const answerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [keyboardBlankId, setKeyboardBlankId] = useState<string | null>(null);
  const update = (patch: Partial<FillBlankData>) => onChange({ ...value, ...patch });
  const updateBlank = (index: number, patch: { correctAnswer?: string; inputMode?: FillBlankInputMode }) => update({ blanks: value.blanks.map((blank, blankIndex) => blankIndex === index ? { ...blank, ...patch } : blank) });

  const setLayout = (layout: FillBlankLayout) => {
    setKeyboardBlankId(null);
    if (layout === "fraction") {
      update({ layout, blanks: [value.blanks[0] || createFillBlankEntry("number"), value.blanks[1] || createFillBlankEntry("number")] });
    } else if (layout === "math") {
      update({ layout, template: getFillBlankCount(value.template) ? value.template : `Answer: ${FILL_BLANK_TOKEN}`, blanks: (value.blanks.length ? value.blanks : [createFillBlankEntry("math")]).map((blank) => ({ ...blank, inputMode: "math" })) });
    } else {
      update({ layout });
    }
  };

  const syncTemplate = (template: string) => {
    const count = getFillBlankCount(template);
    const blanks = value.blanks.slice(0, count);
    while (blanks.length < count) blanks.push(createFillBlankEntry(value.layout === "math" ? "math" : "text"));
    update({ template, blanks });
  };

  const addBlank = () => {
    const text = value.template;
    const start = templateRef.current?.selectionStart ?? text.length;
    const end = templateRef.current?.selectionEnd ?? start;
    syncTemplate(text.slice(0, start) + FILL_BLANK_TOKEN + text.slice(end));
  };

  const insertCorrectAnswerSymbol = (index: number, symbol: string) => {
    const blank = value.blanks[index];
    if (!blank) return;
    const input = answerRefs.current[blank.id];
    const start = input?.selectionStart ?? blank.correctAnswer.length;
    const end = input?.selectionEnd ?? start;
    updateBlank(index, { correctAnswer: blank.correctAnswer.slice(0, start) + symbol + blank.correctAnswer.slice(end) });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + symbol.length, start + symbol.length);
    });
  };

  const updateAlgebraTileRow = (rowId: string, patch: Partial<ReturnType<typeof createAlgebraTileRow>>) => {
    if (!value.algebraTiles) return;
    update({ algebraTiles: { ...value.algebraTiles, rows: value.algebraTiles.rows.map((row) => row.id === rowId ? { ...row, ...patch } : row) } });
  };

  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">Answer layout</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {([['inline', 'Inline or multiple blanks'], ['fraction', 'Stacked fraction'], ['math', 'Math expression']] as Array<[FillBlankLayout, string]>).map(([layout, label]) => <button key={layout} type="button" onClick={() => setLayout(layout)} className={`rounded-lg border px-4 py-3 text-left font-semibold ${value.layout === layout ? "border-blue-500 bg-blue-100 text-blue-900 ring-2 ring-blue-200" : "border-slate-300 text-slate-800 hover:bg-slate-50"}`}>{label}</button>)}
      </div>
    </section>

    {!value.algebraTiles ? <button type="button" onClick={() => update({ algebraTiles: { showLegend: true, rows: [createAlgebraTileRow()] } })} className="w-full rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-left font-semibold text-blue-800 hover:bg-blue-100">+ Insert algebra-tile model<span className="mt-1 block text-xs font-normal text-blue-700">Build polynomial diagrams from positive and negative 1, x, and x² tiles.</span></button> : <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold text-blue-950">Algebra-tile model</h3><p className="text-sm text-blue-700">Set how many of each tile appears in every polynomial row.</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => update({ algebraTiles: { ...value.algebraTiles!, rows: [...value.algebraTiles!.rows, createAlgebraTileRow(`Polynomial ${value.algebraTiles!.rows.length + 1}`)] } })} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Row</button><button type="button" onClick={() => update({ algebraTiles: undefined })} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remove model</button></div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={value.algebraTiles.showLegend} onChange={(event) => update({ algebraTiles: { ...value.algebraTiles!, showLegend: event.target.checked } })} className="h-4 w-4 accent-blue-600" />Show algebra-tile legend</label>
      <div className="mt-3 space-y-3">{value.algebraTiles.rows.map((row, rowIndex) => <div key={row.id} className="rounded-lg border border-blue-200 bg-white p-3">
        <div className="flex items-center gap-2"><input value={row.label} onChange={(event) => updateAlgebraTileRow(row.id, { label: event.target.value })} aria-label={`Algebra tile row ${rowIndex + 1} label`} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-900" /><button type="button" onClick={() => update({ algebraTiles: { ...value.algebraTiles!, rows: value.algebraTiles!.rows.filter((candidate) => candidate.id !== row.id) } })} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remove</button></div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{algebraTileFields.map((field) => <label key={field.key} className="text-center text-xs font-bold text-slate-600">{field.label}<input type="number" min="0" max="30" defaultValue={row[field.key]} onChange={(event) => { if (event.target.value.trim()) updateAlgebraTileRow(row.id, { [field.key]: Math.max(0, Math.min(30, Math.trunc(Number(event.target.value) || 0))) }); }} onBlur={(event) => { event.currentTarget.value = String(row[field.key]); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-2 text-center text-slate-900" /></label>)}</div>
      </div>)}</div>
    </section>}

    {value.layout === "fraction" ? <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Question text before fraction<input value={value.prefix || ""} onChange={(event) => update({ prefix: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-semibold text-slate-700">Question text after fraction<input value={value.suffix || ""} onChange={(event) => update({ suffix: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      </div>
    </section> : <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Question prompt</h3><p className="text-sm text-slate-500">Write the complete question here and insert blanks wherever students should answer. Use line breaks for coordinate sets or several answer rows.</p></div><button type="button" onClick={addBlank} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">+ Add blank</button></div>
      <textarea ref={templateRef} value={value.template} onChange={(event) => syncTemplate(event.target.value)} rows={5} className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-slate-900" />
    </section>}

    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">Correct answers</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {value.blanks.map((blank, index) => {
          const usesMathKeyboard = blank.inputMode === "math";
          const keyboardIsOpen = keyboardBlankId === blank.id;
          return <div key={blank.id} className={`rounded-lg border border-slate-200 p-3 ${keyboardIsOpen ? "sm:col-span-2" : ""}`}>
            <label className="text-sm font-semibold text-slate-700">Blank {index + 1}
              <span className="relative mt-1 block">
                <input ref={(node) => { answerRefs.current[blank.id] = node; }} value={blank.correctAnswer} onChange={(event) => updateBlank(index, { correctAnswer: event.target.value })} className={`block w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-slate-900 ${usesMathKeyboard ? "pr-12" : ""}`} />
                {usesMathKeyboard && <button type="button" onClick={() => setKeyboardBlankId((current) => current === blank.id ? null : blank.id)} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-lg text-blue-700 hover:bg-blue-100" aria-label={`Open math keyboard for blank ${index + 1}`}>⌨</button>}
              </span>
            </label>
            {value.layout !== "math" && <label className="mt-2 block text-xs font-semibold text-slate-600">Student input<select value={blank.inputMode} onChange={(event) => { const inputMode = event.target.value as FillBlankInputMode; updateBlank(index, { inputMode }); if (inputMode !== "math") setKeyboardBlankId(null); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"><option value="text">Text</option><option value="number">Number</option><option value="math">Math keyboard</option></select></label>}
            {keyboardIsOpen && <div className="mt-3 rounded-xl border border-slate-300 bg-slate-900 p-3 shadow-xl" role="group" aria-label={`Correct answer math keyboard for blank ${index + 1}`}>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">{FILL_BLANK_MATH_KEYS.map((symbol) => <button key={symbol} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertCorrectAnswerSymbol(index, symbol)} className="rounded-lg bg-slate-800 px-3 py-2 text-lg font-semibold text-white hover:bg-blue-700">{symbol}</button>)}</div>
              <div className="mt-2 flex justify-end"><button type="button" onClick={() => updateBlank(index, { correctAnswer: "" })} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600">Clear</button></div>
            </div>}
          </div>;
        })}
      </div>
    </section>
  </div>;
}
