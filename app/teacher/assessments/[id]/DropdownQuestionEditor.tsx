"use client";

import { useRef } from "react";
import CanvasDropdownField from "@/app/components/CanvasDropdownField";
import {
  DROPDOWN_TOKEN,
  getDropdownCount,
  getDropdownEntryOptions,
  getDropdownSegments,
  makeDropdownId,
  type DropdownEntry,
  type DropdownQuestionData,
} from "@/lib/dropdownQuestion";

const newEntry = (): DropdownEntry => ({
  id: makeDropdownId(),
  label: "",
  options: ["Option 1", "Option 2"],
  correctAnswer: "Option 1",
});

export function DropdownQuestionPreview({
  data,
  interactive = false,
  answers = {},
  onAnswer,
}: {
  data: DropdownQuestionData;
  interactive?: boolean;
  answers?: Record<string, string>;
  onAnswer?: (id: string, value: string) => void;
}) {
  const selectFor = (entry: DropdownEntry, index: number) => (
    <span key={entry.id} className="mx-1 inline-block h-12 align-middle">
      <CanvasDropdownField canvas={false} ariaLabel={`Dropdown ${index + 1}`} disabled={!interactive} options={getDropdownEntryOptions(entry)} value={interactive ? answers[entry.id] || "" : ""} onChange={(answer) => onAnswer?.(entry.id, answer)} />
    </span>
  );

  if (data.layout === "table") {
    return <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><tbody>
      {data.entries.map((entry, index) => <tr key={entry.id}>
        <td className="border border-slate-300 px-4 py-3 text-slate-900">{entry.label || `Row ${index + 1}`}</td>
        <td className="w-56 border border-slate-300 p-2 text-center">{selectFor(entry, index)}</td>
      </tr>)}
    </tbody></table></div>;
  }

  return <div className="text-lg leading-[3.6rem] text-slate-950">
    {getDropdownSegments(data.template).map((segment, index) => segment.type === "text"
      ? <span key={index} className="whitespace-pre-wrap">{segment.content}</span>
      : data.entries[segment.index] ? selectFor(data.entries[segment.index], segment.index) : null)}
  </div>;
}

export default function DropdownQuestionEditor({ value, onChange }: { value: DropdownQuestionData; onChange: (value: DropdownQuestionData) => void }) {
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const update = (patch: Partial<DropdownQuestionData>) => onChange({ ...value, ...patch });
  const updateEntry = (entryId: string, patch: Partial<DropdownEntry>) => update({
    entries: value.entries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry),
  });
  const updateEntryOptions = (entry: DropdownEntry, options: string[]) => {
    const nextCorrectAnswer = options.includes(entry.correctAnswer)
      ? entry.correctAnswer
      : "";
    updateEntry(entry.id, { options, correctAnswer: nextCorrectAnswer });
  };
  const syncTemplate = (template: string) => {
    const count = getDropdownCount(template);
    const entries = value.entries.slice(0, count);
    while (entries.length < count) entries.push(newEntry());
    update({ template, entries });
  };
  const addToken = () => {
    const text = value.template;
    const start = templateRef.current?.selectionStart ?? text.length;
    const end = templateRef.current?.selectionEnd ?? start;
    const insertion = `${start > 0 && !/\s/.test(text[start - 1]) ? " " : ""}${DROPDOWN_TOKEN}${end < text.length && !/[\s.,;:!?]/.test(text[end]) ? " " : ""}`;
    syncTemplate(text.slice(0, start) + insertion + text.slice(end));
  };
  const optionsEditor = (entry: DropdownEntry, index: number) => {
    const options = entry.options || [];
    return <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-950">Dropdown {index + 1} choices</h4>
        <button type="button" onClick={() => updateEntryOptions(entry, [...options, ""])} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">+ Add choice</button>
      </div>
      <div className="mt-3 space-y-2">
        {options.map((option, optionIndex) => <div key={optionIndex} className="flex gap-2">
          <input value={option} onChange={(event) => updateEntryOptions(entry, options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item))} placeholder={`Choice ${optionIndex + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900" />
          <button type="button" disabled={options.length <= 2} onClick={() => updateEntryOptions(entry, options.filter((_, itemIndex) => itemIndex !== optionIndex))} className="px-2 text-sm font-semibold text-red-600 disabled:opacity-30">Remove</button>
        </div>)}
      </div>
      <label className="mt-3 block text-sm font-semibold text-emerald-900">Correct answer
        <select value={entry.correctAnswer} onChange={(event) => updateEntry(entry.id, { correctAnswer: event.target.value })} className="mt-1 block w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-slate-900">
          <option value="">Select the correct answer…</option>
          {getDropdownEntryOptions(entry).map((option, optionIndex) => <option key={`${option}-${optionIndex}`} value={option}>{option}</option>)}
        </select>
      </label>
    </div>;
  };

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2">
      {(["inline", "table"] as const).map((layout) => <button key={layout} type="button" onClick={() => update({ layout, entries: layout === "table" && value.entries.length === 0 ? [newEntry()] : value.entries })} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${value.layout === layout ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{layout === "inline" ? "In a sentence" : "Table rows"}</button>)}
    </div>

    {value.layout === "inline" ? <>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Sentence or passage</h3><p className="text-sm text-slate-500">Put the cursor where a dropdown belongs.</p></div><button type="button" onClick={addToken} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">+ Add dropdown</button></div>
        <textarea ref={templateRef} value={value.template} onChange={(event) => syncTemplate(event.target.value)} rows={4} className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-slate-900" />
      </section>
      <div className="grid gap-3 lg:grid-cols-2">{value.entries.map(optionsEditor)}</div>
    </> : <section className="space-y-3">
      {value.entries.map((entry, index) => <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3"><textarea value={entry.label} onChange={(event) => updateEntry(entry.id, { label: event.target.value })} placeholder={`Row ${index + 1} prompt`} rows={2} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-3 text-slate-900" /><button type="button" disabled={value.entries.length <= 1} onClick={() => update({ entries: value.entries.filter((item) => item.id !== entry.id) })} className="pt-2 text-sm font-semibold text-red-600 disabled:opacity-30">Remove row</button></div>
        <div className="mt-3">{optionsEditor(entry, index)}</div>
      </div>)}
      <button type="button" onClick={() => update({ entries: [...value.entries, newEntry()] })} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">+ Add row</button>
    </section>}
  </div>;
}
