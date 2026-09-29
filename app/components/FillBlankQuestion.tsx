"use client";

import { useRef, useState } from "react";
import { getFillBlankSegments, type FillBlankData, type FillBlankEntry } from "@/lib/fillBlank";
import AlgebraTileModel from "./AlgebraTileModel";
import OnScreenMathKeyboard from "./OnScreenMathKeyboard";

export default function FillBlankQuestion({ data, answers = {}, onAnswer, preview = false }: { data: FillBlankData; answers?: Record<string, string>; onAnswer?: (id: string, value: string) => void; preview?: boolean }) {
  const [keyboardBlankId, setKeyboardBlankId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const insertSymbol = (blank: FillBlankEntry, symbol: string) => {
    const input = inputRefs.current[blank.id];
    const current = answers[blank.id] || "";
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? start;
    const next = `${current.slice(0, start)}${symbol}${current.slice(end)}`;
    onAnswer?.(blank.id, next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + symbol.length, start + symbol.length);
    });
  };

  const backspace = (blank: FillBlankEntry) => {
    const input = inputRefs.current[blank.id];
    const current = answers[blank.id] || "";
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? start;
    const from = start === end ? Math.max(0, start - 1) : start;
    onAnswer?.(blank.id, `${current.slice(0, from)}${current.slice(end)}`);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(from, from); });
  };

  const moveCursor = (blank: FillBlankEntry, direction: -1 | 1) => {
    const input = inputRefs.current[blank.id];
    const current = answers[blank.id] || "";
    const cursor = Math.max(0, Math.min(current.length, (input?.selectionStart ?? current.length) + direction));
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  };

  const answerInput = (blank: FillBlankEntry, index: number, compact = false) => <span key={blank.id} className="relative mx-1 inline-flex items-center align-middle">
    <input
      ref={(node) => { inputRefs.current[blank.id] = node; }}
      value={preview ? "" : answers[blank.id] || ""}
      readOnly={preview}
      inputMode={blank.inputMode === "number" ? "decimal" : "text"}
      aria-label={`Blank ${index + 1}`}
      onFocus={() => blank.inputMode !== "math" && setKeyboardBlankId(null)}
      onChange={(event) => onAnswer?.(blank.id, event.target.value)}
      className={`${compact ? "h-11 w-20" : blank.inputMode === "math" ? "h-12 w-56 pr-11" : "h-11 w-28"} rounded-lg border border-slate-300 bg-white/50 px-3 text-base font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100`}
    />
    {!preview && blank.inputMode === "math" && <button type="button" onClick={() => setKeyboardBlankId((current) => current === blank.id ? null : blank.id)} className="absolute right-1.5 grid h-8 w-8 place-items-center rounded-md text-lg text-blue-700 hover:bg-blue-50" aria-label="Open math keyboard">⌨</button>}
  </span>;

  const keyboard = keyboardBlankId && data.blanks.find((blank) => blank.id === keyboardBlankId);
  return <div className="space-y-3">
    {data.algebraTiles && data.algebraTiles.rows.length > 0 && <AlgebraTileModel model={data.algebraTiles} />}
    {data.layout === "fraction" ? <div className="flex items-center gap-3 text-xl font-semibold text-slate-950"><span>{data.prefix}</span><span className="inline-grid grid-rows-2 divide-y-2 divide-slate-800">{data.blanks[0] && answerInput(data.blanks[0], 0, true)}{data.blanks[1] && answerInput(data.blanks[1], 1, true)}</span><span>{data.suffix}</span></div> : <div className="whitespace-pre-wrap text-xl font-semibold leading-[3.5rem] text-slate-950">{getFillBlankSegments(data.template).map((segment, index) => segment.type === "text" ? <span key={index}>{segment.content}</span> : data.blanks[segment.index] ? answerInput(data.blanks[segment.index], segment.index) : null)}</div>}
    {keyboard && <OnScreenMathKeyboard onInsert={(symbol) => insertSymbol(keyboard, symbol)} onBackspace={() => backspace(keyboard)} onMoveCursor={(direction) => moveCursor(keyboard, direction)} onEnter={() => setKeyboardBlankId(null)} onClose={() => setKeyboardBlankId(null)} />}
  </div>;
}
