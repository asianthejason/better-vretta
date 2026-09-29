"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type MathKey = { label: string; value?: string; action?: "shift" | "backspace" | "left" | "right" | "enter" };

const normalKeys: MathKey[][] = [
  [{ label: "x", value: "x" }, { label: "n", value: "n" }, { label: "7" }, { label: "8" }, { label: "9" }, { label: "÷" }, { label: "e" }, { label: "i" }, { label: "π" }],
  [{ label: "<" }, { label: ">" }, { label: "4" }, { label: "5" }, { label: "6" }, { label: "×" }, { label: "x²", value: "²" }, { label: "x□", value: "^" }, { label: "√□", value: "√" }],
  [{ label: "(" }, { label: ")" }, { label: "1" }, { label: "2" }, { label: "3" }, { label: "−" }, { label: "∫" }, { label: "∀" }, { label: "⌫", action: "backspace" }],
  [{ label: "⇧", action: "shift" }, { label: "0" }, { label: "." }, { label: "=" }, { label: "+" }, { label: "‹", action: "left" }, { label: "›", action: "right" }, { label: "↵", action: "enter" }],
];

const shiftedKeys: MathKey[][] = [
  [{ label: "y" }, { label: "a" }, { label: "x⁷", value: "⁷" }, { label: "x⁸", value: "⁸" }, { label: "x⁹", value: "⁹" }, { label: "¹⁄□", value: "/" }, { label: "ln" }, { label: "i̇", value: "i" }, { label: "sin" }],
  [{ label: "≤" }, { label: "≥" }, { label: "x⁴", value: "⁴" }, { label: "x⁵", value: "⁵" }, { label: "x⁶", value: "⁶" }, { label: "×" }, { label: "x′", value: "′" }, { label: "x□", value: "^" }, { label: "ⁿ√□", value: "√" }],
  [{ label: "[" }, { label: "]" }, { label: "x⁻¹", value: "⁻¹" }, { label: "x²", value: "²" }, { label: "x³", value: "³" }, { label: "±" }, { label: "∫" }, { label: "∃" }, { label: "⌫", action: "backspace" }],
  [{ label: "⇧", action: "shift" }, { label: "∞" }, { label: "," }, { label: "≠" }, { label: "Σ" }, { label: "«", action: "left" }, { label: "»", action: "right" }, { label: "⊕", action: "enter" }],
];

export default function OnScreenMathKeyboard({ onInsert, onBackspace, onMoveCursor, onEnter, onClose }: {
  onInsert: (value: string) => void;
  onBackspace: () => void;
  onMoveCursor: (direction: -1 | 1) => void;
  onEnter?: () => void;
  onClose: () => void;
}) {
  const [shiftLocked, setShiftLocked] = useState(false);
  const [physicalShift, setPhysicalShift] = useState(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Shift") setPhysicalShift(true);
      if (event.key === "Escape") onClose();
    };
    const up = (event: KeyboardEvent) => { if (event.key === "Shift") setPhysicalShift(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const shifted = shiftLocked || physicalShift;
  const rows = shifted ? shiftedKeys : normalKeys;
  const activate = (key: MathKey) => {
    if (key.action === "shift") return setShiftLocked((current) => !current);
    if (key.action === "backspace") return onBackspace();
    if (key.action === "left" || key.action === "right") return onMoveCursor(key.action === "left" ? -1 : 1);
    if (key.action === "enter") return onEnter?.();
    onInsert(key.value ?? key.label);
  };

  return createPortal(<div className="fixed inset-x-0 bottom-0 z-[200] border-t border-slate-700 bg-[#111214] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_rgba(0,0,0,0.35)]" role="dialog" aria-label="On-screen math keyboard">
    <div className="mx-auto mb-2 flex max-w-6xl justify-end"><button type="button" onClick={onClose} className="rounded-md px-4 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-700">Close keyboard</button></div>
    <div className="mx-auto grid max-w-6xl gap-2">
      {rows.map((row, rowIndex) => <div key={rowIndex} className="grid grid-cols-9 gap-2">
        {row.map((key, keyIndex) => <button key={`${key.label}-${keyIndex}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => activate(key)} className={`${key.action === "shift" && shifted ? "bg-blue-700 ring-2 ring-blue-400" : key.action ? "bg-[#45494d]" : "bg-[#202224]"} min-h-14 rounded-md px-2 text-xl font-medium text-white shadow hover:bg-blue-700 sm:min-h-16 sm:text-2xl ${rowIndex === 3 && key.action === "shift" ? "col-span-2" : ""}`}>{key.label}</button>)}
      </div>)}
    </div>
  </div>, document.body);
}
