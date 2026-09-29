"use client";

import { useCallback, useRef, useState } from "react";
import type { FillBlankEntry } from "@/lib/fillBlank";
import OnScreenMathKeyboard from "./OnScreenMathKeyboard";

export default function CanvasFillBlankField({ blank, value = "", onChange, preview = false, className = "" }: {
  blank: FillBlankEntry;
  value?: string;
  onChange?: (value: string) => void;
  preview?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const replaceSelection = useCallback((insert: string, backspace = false) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const from = backspace && start === end ? Math.max(0, start - 1) : start;
    const next = `${value.slice(0, from)}${insert}${value.slice(end)}`;
    onChange?.(next);
    requestAnimationFrame(() => {
      const cursor = from + insert.length;
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    });
  }, [onChange, value]);

  const moveCursor = (direction: -1 | 1) => {
    const input = inputRef.current;
    const cursor = Math.max(0, Math.min(value.length, (input?.selectionStart ?? value.length) + direction));
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  };

  return <div className={`relative h-full w-full ${className}`}>
    <input ref={inputRef} value={preview ? "" : value} readOnly={preview} inputMode={blank.inputMode === "number" ? "decimal" : "text"} onChange={(event) => onChange?.(event.target.value)} aria-label="Fill in the blank" className={`h-full w-full rounded-[0.8cqw] border-[0.18cqw] border-slate-300 bg-white/50 px-[1.2cqw] text-[1.7cqw] font-medium text-slate-950 outline-none focus:border-blue-500 focus:ring-[0.22cqw] focus:ring-blue-100 ${blank.inputMode === "math" ? "pr-[4.2cqw]" : ""}`} />
    {blank.inputMode === "math" && <button type="button" disabled={preview} onClick={() => setKeyboardOpen(true)} className="absolute right-[0.45cqw] top-1/2 grid h-[3.2cqw] w-[3.2cqw] -translate-y-1/2 place-items-center rounded-[0.5cqw] text-[2cqw] text-blue-700 hover:bg-blue-50 disabled:opacity-100" aria-label="Open math keyboard">⌨</button>}
    {keyboardOpen && !preview && <OnScreenMathKeyboard onInsert={(symbol) => replaceSelection(symbol)} onBackspace={() => replaceSelection("", true)} onMoveCursor={moveCursor} onEnter={() => setKeyboardOpen(false)} onClose={() => setKeyboardOpen(false)} />}
  </div>;
}
