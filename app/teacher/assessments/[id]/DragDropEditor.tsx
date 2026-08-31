"use client";

import { createDefaultDragDropData, makeDragDropId, type DragDropData, type DragDropPreset } from "@/lib/dragDrop";

const presets: { id: DragDropPreset; name: string; description: string }[] = [
  { id: "categories", name: "Sort into groups", description: "Place items into labelled categories." },
  { id: "sequence", name: "Put in order", description: "Arrange items into a correct sequence." },
  { id: "locations", name: "Match locations", description: "Place labels on an image or diagram." },
  { id: "inline", name: "Complete blanks", description: "Drop choices into blanks in a sentence." },
  { id: "freeform", name: "Free placement", description: "Arrange items on an open canvas." },
];

export default function DragDropEditor({ value, onChange }: { value: DragDropData; onChange: (value: DragDropData) => void }) {
  const update = (patch: Partial<DragDropData>) => onChange({ ...value, ...patch });
  const setPreset = (preset: DragDropPreset) => {
    let zones = value.zones;
    if (preset === "sequence") {
      zones = [{ id: zones[0]?.id || makeDragDropId(), label: "Correct order", correctItemIds: value.items.map((item) => item.id), capacity: null, orderMatters: true }];
    } else if (zones.length < 2) {
      zones = [zones[0] || createDefaultDragDropData().zones[0], { id: makeDragDropId(), label: "Target 2", correctItemIds: [], capacity: null }];
    }
    update({ preset, zones });
  };
  const setItems = (items: DragDropData["items"]) => update({ items, zones: value.preset === "sequence" ? value.zones.map((z, i) => i ? z : { ...z, correctItemIds: items.map((item) => item.id) }) : value.zones });

  return <div className="space-y-6">
    <section>
      <h3 className="font-semibold text-white">Choose a starting layout</h3>
      <p className="mt-1 text-sm text-slate-400">You can change the layout without creating a different question type.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {presets.map((preset) => <button key={preset.id} type="button" onClick={() => setPreset(preset.id)} className={`rounded-xl border p-3 text-left transition ${value.preset === preset.id ? "border-blue-400 bg-blue-500/20" : "border-slate-700 bg-slate-950 hover:border-blue-500"}`}>
          <span className="block text-sm font-semibold text-white">{preset.name}</span><span className="mt-1 block text-xs text-slate-400">{preset.description}</span>
        </button>)}
      </div>
    </section>

    {(value.preset === "locations" || value.preset === "freeform") && <label className="block text-sm text-slate-300">Background image URL
      <input value={value.backgroundImageUrl || ""} onChange={(e) => update({ backgroundImageUrl: e.target.value })} placeholder="Paste an uploaded image URL" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
    </label>}
    {value.preset === "inline" && <label className="block text-sm text-slate-300">Sentence or passage
      <textarea value={value.inlineText || ""} onChange={(e) => update({ inlineText: e.target.value })} placeholder="Use the target labels to mark the blanks students will complete." className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
    </label>}

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-white">Draggable items</h3><button type="button" onClick={() => setItems([...value.items, { id: makeDragDropId(), content: `Item ${value.items.length + 1}` }])} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add item</button></div>
        <div className="mt-3 space-y-3">{value.items.map((item, index) => <div key={item.id} className="rounded-lg border border-slate-700 p-3">
          <div className="flex gap-2"><input value={item.content} onChange={(e) => setItems(value.items.map((current) => current.id === item.id ? { ...current, content: e.target.value } : current))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" /><button type="button" onClick={() => setItems(value.items.filter((current) => current.id !== item.id))} className="rounded-lg border border-red-800 px-3 text-red-300">Remove</button></div>
          <input value={item.imageUrl || ""} onChange={(e) => setItems(value.items.map((current) => current.id === item.id ? { ...current, imageUrl: e.target.value } : current))} placeholder="Optional image URL" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          {value.preset === "sequence" && <div className="mt-2 flex gap-2"><button type="button" disabled={!index} onClick={() => { const next=[...value.items]; [next[index-1],next[index]]=[next[index],next[index-1]]; setItems(next); }} className="rounded border border-slate-600 px-2 disabled:opacity-30">↑</button><button type="button" disabled={index === value.items.length-1} onClick={() => { const next=[...value.items]; [next[index+1],next[index]]=[next[index],next[index+1]]; setItems(next); }} className="rounded border border-slate-600 px-2 disabled:opacity-30">↓</button><span className="text-xs text-slate-400">Correct position {index + 1}</span></div>}
        </div>)}</div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-white">Drop targets</h3>{value.preset !== "sequence" && <button type="button" onClick={() => update({ zones: [...value.zones, { id: makeDragDropId(), label: `Target ${value.zones.length + 1}`, correctItemIds: [], capacity: null, x: 10, y: 10, width: 25, height: 18 }] })} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add target</button>}</div>
        <div className="mt-3 space-y-3">{value.zones.map((zone) => <div key={zone.id} className="rounded-lg border border-slate-700 p-3">
          <div className="flex gap-2"><input value={zone.label} onChange={(e) => update({ zones: value.zones.map((z) => z.id === zone.id ? { ...z, label: e.target.value } : z) })} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />{value.preset !== "sequence" && <button type="button" onClick={() => update({ zones: value.zones.filter((z) => z.id !== zone.id) })} className="rounded-lg border border-red-800 px-3 text-red-300">Remove</button>}</div>
          {value.preset !== "sequence" && <div className="mt-2 grid gap-2 sm:grid-cols-2">{value.items.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={zone.correctItemIds.includes(item.id)} onChange={(e) => update({ zones: value.zones.map((z) => z.id === zone.id ? { ...z, correctItemIds: e.target.checked ? [...z.correctItemIds, item.id] : z.correctItemIds.filter((id) => id !== item.id) } : z) })} />{item.content || "Untitled item"}</label>)}</div>}
          {(value.preset === "locations" || value.preset === "freeform") && <div className="mt-3 grid grid-cols-4 gap-2">{(["x","y","width","height"] as const).map((key) => <label key={key} className="text-xs uppercase text-slate-400">{key}<input type="number" min="0" max="100" value={zone[key] ?? (key === "width" ? 25 : key === "height" ? 18 : 10)} onChange={(e) => update({ zones: value.zones.map((z) => z.id === zone.id ? { ...z, [key]: Number(e.target.value) } : z) })} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>)}</div>}
        </div>)}</div>
      </section>
    </div>
    <section className="rounded-xl border border-blue-900 bg-blue-950/20 p-4"><h3 className="font-semibold text-white">Behaviour and scoring</h3><div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300"><label><input type="checkbox" checked={value.settings.shuffleItems} onChange={(e) => update({ settings: { ...value.settings, shuffleItems: e.target.checked } })} className="mr-2" />Shuffle items</label><label><input type="checkbox" checked={value.settings.allowUnusedItems} onChange={(e) => update({ settings: { ...value.settings, allowUnusedItems: e.target.checked } })} className="mr-2" />Allow distractors</label><label><input type="checkbox" checked={value.settings.showZoneOutlines} onChange={(e) => update({ settings: { ...value.settings, showZoneOutlines: e.target.checked } })} className="mr-2" />Show target outlines</label></div></section>
  </div>;
}
