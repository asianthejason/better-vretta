"use client";

import { useMemo, useState, type DragEvent } from "react";
import type { DragDropData, DragDropPlacements } from "@/lib/dragDrop";

export default function DragDropQuestion({ data, placements, onChange }: { data: DragDropData; placements: DragDropPlacements; onChange: (value: DragDropPlacements) => void }) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const placedIds = Object.values(placements).flat();
  const bank = useMemo(() => data.items.filter((item) => data.settings.allowReuse || !placedIds.includes(item.id)), [data, placedIds]);
  const place = (itemId: string, zoneId: string) => {
    const zone = data.zones.find((candidate) => candidate.id === zoneId);
    if (!zone) return;
    const next: DragDropPlacements = Object.fromEntries(Object.entries(placements).map(([id, ids]) => [id, ids.filter((candidate) => candidate !== itemId)]));
    const current = next[zoneId] || [];
    next[zoneId] = zone.capacity && current.length >= zone.capacity ? [...current.slice(1), itemId] : [...current, itemId];
    onChange(next); setSelectedItemId(null);
  };
  const drop = (event: DragEvent, zoneId: string) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) place(id, zoneId); };
  const itemCard = (itemId: string) => {
    const item = data.items.find((candidate) => candidate.id === itemId); if (!item) return null;
    return <button type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)} onClick={() => setSelectedItemId(item.id)} className={`rounded-lg border bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-500 ${selectedItemId === item.id ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-300"}`}>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="mb-2 max-h-28 max-w-full object-contain" />}<span>{item.content}</span>
    </button>;
  };
  const zoneCard = (zone: DragDropData["zones"][number]) => <div key={zone.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, zone.id)} onClick={() => selectedItemId && place(selectedItemId, zone.id)} className={`min-h-28 rounded-xl bg-white/90 p-3 ${data.settings.showZoneOutlines ? "border-2 border-dashed border-slate-400" : "border border-transparent"}`}>
    <h4 className="mb-3 text-center font-semibold text-slate-800">{zone.label}</h4><div className={`flex flex-wrap gap-2 ${data.preset === "sequence" && data.direction === "vertical" ? "flex-col" : ""}`}>{(placements[zone.id] || []).map((id) => <span key={id} className="relative">{itemCard(id)}<button type="button" onClick={(e) => { e.stopPropagation(); onChange({ ...placements, [zone.id]: (placements[zone.id] || []).filter((candidate) => candidate !== id) }); }} className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-slate-800 text-xs text-white">×</button></span>)}</div>
  </div>;

  return <div className="space-y-6">
    <div><p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Choices</p><div className="flex flex-wrap gap-3">{bank.map((item) => <span key={item.id}>{itemCard(item.id)}</span>)}</div><p className="mt-2 text-sm text-slate-500">Drag a choice, or select it and then select a target.</p></div>
    {data.inlineText && <p className="rounded-xl border border-slate-200 bg-white p-4 text-lg">{data.inlineText}</p>}
    {(data.preset === "locations" || data.preset === "freeform") ? <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 bg-contain bg-center bg-no-repeat" style={data.backgroundImageUrl ? { backgroundImage: `url(${data.backgroundImageUrl})` } : undefined}>{data.zones.map((zone) => <div key={zone.id} className="absolute" style={{ left: `${zone.x ?? 10}%`, top: `${zone.y ?? 10}%`, width: `${zone.width ?? 25}%`, minHeight: `${zone.height ?? 18}%` }}>{zoneCard(zone)}</div>)}</div> : <div className={`grid gap-4 ${data.preset === "sequence" ? "grid-cols-1" : "md:grid-cols-2"}`}>{data.zones.map(zoneCard)}</div>}
  </div>;
}
