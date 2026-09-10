"use client";

import { useState } from "react";
import { createDefaultDragDropData, getSequenceTargetCount, makeDragDropId, type DragDropData, type DragDropPreset } from "@/lib/dragDrop";
import LocationCanvasEditor from "./LocationCanvasEditor";

const presets: { id: DragDropPreset; name: string; description: string }[] = [
  { id: "categories", name: "Sort into groups", description: "Place items into labelled categories." },
  { id: "sequence", name: "Put in order", description: "Arrange items into a correct sequence." },
  { id: "locations", name: "Match locations", description: "Place labels on an image or diagram." },
  { id: "inline", name: "Complete blanks", description: "Drop choices into blanks in a sentence." },
  { id: "freeform", name: "Free placement", description: "Arrange items on an open canvas." },
];

type UploadedImage = { id?: string; url: string; path: string; label: string };

export function DragDropPresetPicker({ value, onChange }: { value: DragDropData; onChange: (value: DragDropData) => void }) {
  const setPreset = (preset: DragDropPreset) => {
    let zones = value.zones;
    if (preset === "sequence") {
      const targetCount = getSequenceTargetCount(value);
      zones = [{ id: zones[0]?.id || makeDragDropId(), label: "Correct order", correctItemIds: value.items.slice(0, targetCount).map((item) => item.id), capacity: targetCount, orderMatters: true }];
    } else if (preset === "locations") {
      zones = (zones.length ? zones : createDefaultDragDropData().zones).map((zone, index) => ({
        ...zone,
        label: zone.label || `Target ${index + 1}`,
        correctItemIds: zone.correctItemIds.slice(0, 1),
        capacity: 1,
        x: zone.x ?? 10 + (index % 4) * 18,
        y: zone.y ?? 12 + (index % 3) * 20,
        width: zone.width ?? 16,
        height: zone.height ?? 14,
      }));
    } else if (zones.length < 2) {
      zones = [zones[0] || createDefaultDragDropData().zones[0], { id: makeDragDropId(), label: "Target 2", correctItemIds: [], capacity: null }];
    }
    onChange({ ...value, preset, zones });
  };

  return (
    <section className="text-slate-800">
      <h3 className="font-semibold text-slate-900">Choose a starting layout</h3>
      <p className="mt-1 text-sm text-slate-400">You can change the layout without creating a different question type.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {presets.map((preset) => <button key={preset.id} type="button" onClick={() => setPreset(preset.id)} className={`rounded-xl border p-3 text-left transition ${value.preset === preset.id ? "border-blue-400 bg-blue-500/20" : "border-slate-700 bg-slate-950 hover:border-blue-500"}`}>
          <span className="block text-sm font-semibold text-slate-900">{preset.name}</span><span className="mt-1 block text-xs text-slate-500">{preset.description}</span>
        </button>)}
      </div>
    </section>
  );
}

export default function DragDropEditor({ value, onChange, uploadedImages, itemPreviewUrls, onItemImageFileChange, onChooseItemImage, onRemoveItemImage, onUploadBackground, onDeleteUploadedImage }: { value: DragDropData; onChange: (value: DragDropData) => void; uploadedImages: UploadedImage[]; itemPreviewUrls: Record<string, string>; onItemImageFileChange: (itemId: string, file: File | null) => void; onChooseItemImage: (itemId: string, image: UploadedImage) => void; onRemoveItemImage: (itemId: string) => void; onUploadBackground: (file: File) => Promise<{ url: string; path: string }>; onDeleteUploadedImage: (image: UploadedImage & { id: string }) => void }) {
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const update = (patch: Partial<DragDropData>) => onChange({ ...value, ...patch });
  const sequenceTargetCount = getSequenceTargetCount(value);
  const fillSequenceOrder = (items: DragDropData["items"], currentOrder: string[], count: number) => {
    const validIds = new Set(items.map((item) => item.id));
    const order = currentOrder.filter((id, index) => validIds.has(id) && currentOrder.indexOf(id) === index).slice(0, count);
    for (const item of items) {
      if (order.length >= count) break;
      if (!order.includes(item.id)) order.push(item.id);
    }
    return order;
  };
  const setItems = (items: DragDropData["items"]) => update({
    items,
    zones: value.preset === "sequence"
      ? value.zones.map((zone, index) => index ? zone : { ...zone, correctItemIds: fillSequenceOrder(items, zone.correctItemIds, sequenceTargetCount), capacity: sequenceTargetCount })
      : value.zones,
  });
  const setSequenceTargetCount = (count: number) => {
    const nextCount = Math.max(1, Math.min(12, count));
    update({
      sequenceTargetCount: nextCount,
      zones: value.zones.map((zone, index) => index ? zone : { ...zone, correctItemIds: fillSequenceOrder(value.items, zone.correctItemIds, nextCount), capacity: nextCount }),
    });
  };
  const setSequenceItemPosition = (itemId: string, nextPosition: number | null) => {
    const zone = value.zones[0];
    if (!zone) return;
    const order = Array.from({ length: sequenceTargetCount }, (_, index) => zone.correctItemIds[index] || "");
    const currentPosition = order.indexOf(itemId);
    if (nextPosition === null) {
      if (currentPosition >= 0) order[currentPosition] = "";
    } else {
      const displacedItem = order[nextPosition];
      if (currentPosition >= 0) order[currentPosition] = displacedItem;
      order[nextPosition] = itemId;
    }
    update({ zones: value.zones.map((current, index) => index ? current : { ...current, correctItemIds: order, capacity: sequenceTargetCount, orderMatters: true }) });
  };

  return <div className="space-y-6 text-slate-800">
    {value.preset === "freeform" && <label className="block text-sm text-slate-300">Background image URL
      <input value={value.backgroundImageUrl || ""} onChange={(e) => update({ backgroundImageUrl: e.target.value })} placeholder="Paste an uploaded image URL" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
    </label>}
    {value.preset === "inline" && <label className="block text-sm text-slate-300">Sentence or passage
      <textarea value={value.inlineText || ""} onChange={(e) => update({ inlineText: e.target.value })} placeholder="Use the target labels to mark the blanks students will complete." className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
    </label>}

    {value.preset === "sequence" && (
      <section>
        <h3 className="font-semibold text-slate-900">Sequence setup</h3>
        <p className="mt-1 text-sm text-slate-500">Choose the number of answer positions and label the two ends.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            Drop targets
            <span className="mt-1.5 flex items-center rounded-lg border border-slate-300 bg-white">
              <button type="button" onClick={() => setSequenceTargetCount(sequenceTargetCount - 1)} disabled={sequenceTargetCount <= 1} className="px-4 py-2.5 text-lg font-bold text-slate-700 disabled:opacity-30" aria-label="Remove a drop target">−</button>
              <input type="number" min="1" max="12" value={sequenceTargetCount} onChange={(event) => setSequenceTargetCount(Number(event.target.value) || 1)} className="min-w-0 flex-1 border-x border-slate-200 py-2.5 text-center font-bold text-slate-950 outline-none" aria-label="Number of drop targets" />
              <button type="button" onClick={() => setSequenceTargetCount(sequenceTargetCount + 1)} disabled={sequenceTargetCount >= 12} className="px-4 py-2.5 text-lg font-bold text-slate-700 disabled:opacity-30" aria-label="Add a drop target">+</button>
            </span>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Leftmost label
            <input value={value.sequenceStartLabel || ""} onChange={(event) => update({ sequenceStartLabel: event.target.value })} placeholder="Example: Smallest" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Rightmost label
            <input value={value.sequenceEndLabel || ""} onChange={(event) => update({ sequenceEndLabel: event.target.value })} placeholder="Example: Largest" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950" />
          </label>
        </div>
      </section>
    )}

    <div className={`grid gap-6 ${value.preset === "sequence" || value.preset === "locations" ? "grid-cols-1" : "lg:grid-cols-2"}`}>
      {value.preset !== "locations" && <section className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
        <div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">{value.preset === "sequence" ? "Draggable choices" : "Draggable items"}</h3>{value.preset === "sequence" && <p className="mt-1 text-xs text-slate-500">Add the choices students can place. Extra choices become distractors.</p>}</div><button type="button" onClick={() => setItems([...value.items, { id: makeDragDropId(), content: `Item ${value.items.length + 1}` }])} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add choice</button></div>
        <div className="mt-3 space-y-3">{value.items.map((item, index) => <div key={item.id} className="rounded-lg border border-slate-700 p-3">
          <div className={`grid gap-2 ${value.preset === "sequence" ? "grid-cols-[minmax(0,1fr)_11rem_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}>
            <input value={item.content} onChange={(e) => setItems(value.items.map((current) => current.id === item.id ? { ...current, content: e.target.value } : current))} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
            {value.preset === "sequence" && <select value={Math.max(0, (value.zones[0]?.correctItemIds.indexOf(item.id) ?? -1) + 1)} onChange={(event) => { const position = Number(event.target.value); setSequenceItemPosition(item.id, position ? position - 1 : null); }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-900" aria-label={`Correct position for ${item.content || `choice ${index + 1}`}`}><option value={0}>Distractor</option>{Array.from({ length: sequenceTargetCount }, (_, position) => <option key={position} value={position + 1}>Position {position + 1}</option>)}</select>}
            <button type="button" onClick={() => setItems(value.items.filter((current) => current.id !== item.id))} className="rounded-lg border border-red-800 px-3 text-red-300">Remove</button>
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-600">Optional image</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">
                Upload image
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => onItemImageFileChange(item.id, event.target.files?.[0] || null)} />
              </label>
              <button type="button" onClick={() => setPickerItemId((current) => current === item.id ? null : item.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Choose existing</button>
              {(itemPreviewUrls[item.id] || item.imageUrl) && <button type="button" onClick={() => onRemoveItemImage(item.id)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700">Remove image</button>}
            </div>
            {(itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt={item.content || `Item ${index + 1}`} className="mt-3 h-24 w-32 border border-slate-300 bg-white object-contain p-1" />}
            {pickerItemId === item.id && (
              <div className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
                <p className="text-xs font-semibold text-slate-700">Existing uploads</p>
                {uploadedImages.length ? <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(10rem,14rem))] gap-2">{uploadedImages.map((image) => <div key={`${image.url}-${image.label}`} className="group relative"><button type="button" onClick={() => { onChooseItemImage(item.id, image); setPickerItemId(null); }} className="w-full rounded-lg border border-slate-200 p-2 text-left hover:border-blue-500"><img src={image.url} alt={image.label} className="h-24 w-full object-contain" /><span className="mt-1 block truncate text-xs text-slate-600">{image.label}</span></button>{image.id && <button type="button" onClick={() => onDeleteUploadedImage(image as UploadedImage & { id: string })} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-red-600 text-sm font-bold text-white opacity-0 shadow-md transition hover:bg-red-700 focus:opacity-100 group-hover:opacity-100" aria-label={`Delete ${image.label} from existing uploads`}>×</button>}</div>)}</div> : <p className="mt-2 text-xs text-slate-500">No uploaded images are available yet.</p>}
              </div>
            )}
          </div>
        </div>)}</div>
      </section>}

      {value.preset !== "sequence" && value.preset !== "locations" && <section className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">Drop targets</h3><button type="button" onClick={() => update({ zones: [...value.zones, { id: makeDragDropId(), label: `Target ${value.zones.length + 1}`, correctItemIds: [], capacity: null, x: 10, y: 10, width: 25, height: 18 }] })} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add target</button></div>
        <div className="mt-3 space-y-3">{value.zones.map((zone) => <div key={zone.id} className="rounded-lg border border-slate-700 p-3">
          <div className="flex gap-2"><input value={zone.label} onChange={(e) => update({ zones: value.zones.map((z) => z.id === zone.id ? { ...z, label: e.target.value } : z) })} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" /><button type="button" onClick={() => update({ zones: value.zones.filter((z) => z.id !== zone.id) })} className="rounded-lg border border-red-800 px-3 text-red-300">Remove</button></div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{value.items.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={zone.correctItemIds.includes(item.id)} onChange={(e) => update({ zones: value.zones.map((z) => z.id === zone.id ? { ...z, correctItemIds: e.target.checked ? [...z.correctItemIds, item.id] : z.correctItemIds.filter((id) => id !== item.id) } : z) })} />{item.content || "Untitled item"}</label>)}</div>
          {(value.preset === "locations" || value.preset === "freeform") && <div className="mt-3 grid grid-cols-4 gap-2">{(["x","y","width","height"] as const).map((key) => <label key={key} className="text-xs uppercase text-slate-400">{key}<input type="number" min="0" max="100" value={zone[key] ?? (key === "width" ? 25 : key === "height" ? 18 : 10)} onChange={(e) => update({ zones: value.zones.map((z) => z.id === zone.id ? { ...z, [key]: Number(e.target.value) } : z) })} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>)}</div>}
        </div>)}</div>
      </section>}
    </div>
    {value.preset === "locations" && <LocationCanvasEditor data={value} onChange={onChange} uploadedImages={uploadedImages} itemPreviewUrls={itemPreviewUrls} onItemImageFileChange={onItemImageFileChange} onChooseItemImage={onChooseItemImage} onRemoveItemImage={onRemoveItemImage} onUploadBackground={onUploadBackground} onDeleteUploadedImage={onDeleteUploadedImage} />}
    <section className="rounded-xl border border-blue-900 bg-blue-950/20 p-4">
      <h3 className="font-semibold text-slate-900">Behaviour</h3>
      <div className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={value.settings.shuffleItems} onChange={(e) => update({ settings: { ...value.settings, shuffleItems: e.target.checked } })} className="mt-1" />
          <span><strong className="block text-slate-900">Shuffle items</strong><span className="text-xs text-slate-500">Give each student the choices in a random order.</span></span>
        </label>
        {value.preset !== "categories" && (
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={value.settings.showZoneOutlines} onChange={(e) => update({ settings: { ...value.settings, showZoneOutlines: e.target.checked } })} className="mt-1" />
            <span><strong className="block text-slate-900">Show target outlines</strong><span className="text-xs text-slate-500">Display the boundaries of each drop target.</span></span>
          </label>
        )}
      </div>
    </section>
  </div>;
}
