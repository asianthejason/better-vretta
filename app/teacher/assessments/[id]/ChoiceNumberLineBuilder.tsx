"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type ChoiceNumberLine } from "@/lib/choiceNumberLine";
import NumberLineSettings from "./NumberLineSettings";

export default function ChoiceNumberLineBuilder({ initial, editing, onSave, onCancel, onDelete }: {
  initial: ChoiceNumberLine;
  editing: boolean;
  onSave: (value: ChoiceNumberLine) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState(() => ({
    left: typeof window === "undefined" ? 12 : window.scrollX + Math.max(12, (window.innerWidth - 440) / 2),
    top: typeof window === "undefined" ? 24 : window.scrollY + 24,
  }));

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !windowRef.current?.contains(event.target)) onCancel();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [onCancel]);

  if (typeof document === "undefined") return null;
  return createPortal(<div ref={windowRef} role="dialog" aria-labelledby={titleId} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} className="absolute z-[10000] w-[27.5rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-blue-200 bg-white shadow-2xl" style={position}>
    <div data-number-line-drag-handle onPointerDown={event => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { x: event.pageX, y: event.pageY, ...position };
    }} onPointerMove={event => {
      const drag = dragRef.current;
      if (!drag) return;
      const width = windowRef.current?.offsetWidth || 440;
      setPosition({
        left: Math.max(window.scrollX + 8, Math.min(window.scrollX + window.innerWidth - width - 8, drag.left + event.pageX - drag.x)),
        top: Math.max(8, drag.top + event.pageY - drag.y),
      });
    }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onLostPointerCapture={() => { dragRef.current = null; }} className="flex touch-none cursor-move select-none items-center justify-between gap-3 rounded-t-xl border-b border-blue-200 bg-blue-50 px-3 py-2">
      <div><p id={titleId} className="text-sm font-semibold text-slate-900">Number line editor</p><p className="text-xs text-slate-500">Drag to move · Click outside to close</p></div>
      <button type="button" onClick={onCancel} aria-label="Close number line editor" className="rounded-lg px-2 py-1 text-lg text-slate-600 hover:bg-blue-100">×</button>
    </div>
    <NumberLineSettings initial={initial} onSave={onSave} onCancel={onCancel} onDelete={editing ? onDelete : undefined} saveLabel={editing ? "Update number line" : "Insert number line"} />
  </div>, document.body);
}
