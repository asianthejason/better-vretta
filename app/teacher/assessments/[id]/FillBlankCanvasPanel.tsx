"use client";

import { useRef, useState } from "react";
import OnScreenMathKeyboard from "@/app/components/OnScreenMathKeyboard";
import type { FillBlankEntry } from "@/lib/fillBlank";

export default function FillBlankCanvasPanel({ blank, onChange, onRemove }: { blank: FillBlankEntry; onChange: (blank: FillBlankEntry) => void; onRemove: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const value = blank.correctAnswer;
  const replaceSelection = (insert: string, backspace = false) => {
    const start = inputRef.current?.selectionStart ?? value.length;
    const end = inputRef.current?.selectionEnd ?? start;
    const from = backspace && start === end ? Math.max(0, start - 1) : start;
    onChange({ ...blank, correctAnswer: `${value.slice(0, from)}${insert}${value.slice(end)}` });
    requestAnimationFrame(() => { const cursor = from + insert.length; inputRef.current?.focus(); inputRef.current?.setSelectionRange(cursor, cursor); });
  };
  const moveCursor = (direction: -1 | 1) => {
    const cursor = Math.max(0, Math.min(value.length, (inputRef.current?.selectionStart ?? value.length) + direction));
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(cursor, cursor);
  };

  return <div className="space-y-3 text-sm text-slate-900">
    <div><label className="font-semibold" htmlFor={`correct-${blank.id}`}>Correct answer</label><div className="relative mt-1"><input id={`correct-${blank.id}`} ref={inputRef} value={value} onChange={(event) => onChange({ ...blank, correctAnswer: event.target.value })} className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-11 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />{blank.inputMode === "math" && <button type="button" onClick={() => setKeyboardOpen(true)} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-lg text-blue-700 hover:bg-blue-50" aria-label="Open math keyboard">⌨</button>}</div></div>
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"><input type="checkbox" checked={blank.inputMode === "math"} onChange={(event) => onChange({ ...blank, inputMode: event.target.checked ? "math" : "text" })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" /><span><span className="block font-semibold">Provide on-screen math keyboard</span><span className="block text-xs leading-5 text-slate-500">Students can enter mathematical symbols with the same keyboard used here.</span></span></label>
    <button type="button" onClick={onRemove} className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-700 hover:bg-red-100">Remove answer area</button>
    {keyboardOpen && <OnScreenMathKeyboard onInsert={(symbol) => replaceSelection(symbol)} onBackspace={() => replaceSelection("", true)} onMoveCursor={moveCursor} onEnter={() => setKeyboardOpen(false)} onClose={() => setKeyboardOpen(false)} />}
  </div>;
}
