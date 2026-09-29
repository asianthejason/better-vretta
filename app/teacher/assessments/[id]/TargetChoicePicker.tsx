"use client";

import { useEffect, useRef } from "react";
import { getDragDropItemHtml, type DragDropItem } from "@/lib/dragDrop";

export default function TargetChoicePicker({ items, value, disabledIds, imageUrls, onChange }: {
  items: DragDropItem[];
  value: string;
  disabledIds: string[];
  imageUrls: Record<string, string>;
  onChange: (id: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current && !ref.current.contains(event.target)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const selected = items.find(item => item.id === value);
  const content = (item: DragDropItem) => {
    const image = imageUrls[item.id] || item.imageUrl;
    return <span className="flex min-w-0 flex-wrap items-center gap-2">
      {image && <img src={image} alt="" className="max-h-20 max-w-24 object-contain" />}
      {(item.contentHtml || item.content) && <span className="rich-text-content text-base font-normal" dangerouslySetInnerHTML={{ __html: getDragDropItemHtml(item) }} />}
      {!image && !item.contentHtml && !item.content && <span className="text-slate-400">Item {items.indexOf(item) + 1}</span>}
    </span>;
  };
  const select = (id: string) => {
    onChange(id);
    if (ref.current) {
      ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
    }
  };
  return <div className="mt-2 text-xs font-semibold text-slate-700">
    <span>Correct choice</span>
    <details ref={ref} className="relative mt-1" onKeyDown={event => {
      if (event.key === "Escape" && ref.current) {
        event.preventDefault();
        event.stopPropagation();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label="Correct choice" className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950">
        {selected ? content(selected) : <span>No correct answer (leave empty)</span>}
      </summary>
      <div role="group" aria-label="Correct choice options" className="absolute left-0 top-full z-[100] mt-1 max-h-80 min-w-full w-max max-w-[min(32rem,80vw)] overflow-auto rounded-lg border border-slate-300 bg-white p-1 shadow-xl">
        <button type="button" aria-pressed={!value} onClick={() => select("")} className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50">No correct answer (leave empty)</button>
        {items.map((item, index) => <button key={item.id} type="button" aria-label={`Choose item ${index + 1}`} aria-pressed={value === item.id} disabled={disabledIds.includes(item.id)} onClick={() => select(item.id)} className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-slate-950 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 ${value === item.id ? "bg-blue-100" : ""}`}>
          <span className="shrink-0 text-xs text-slate-500">{index + 1}.</span>{content(item)}
        </button>)}
      </div>
    </details>
  </div>;
}
