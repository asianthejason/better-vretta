"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import LocationCanvasElementContent from "@/app/components/LocationCanvasElementContent";
import { getDragDropItemHtml, getInlineBlankSegments, getInlineChoiceBoxSize, getLocationBoxSize, getSequenceTargetCount, normalizeCanvasHeight, type DragDropData, type DragDropPlacements } from "@/lib/dragDrop";

export default function DragDropQuestion({ data, placements, onChange }: { data: DragDropData; placements: DragDropPlacements; onChange: (value: DragDropPlacements) => void }) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const itemIdsKey = data.items.map((item) => item.id).join("|");
  const [itemOrder, setItemOrder] = useState(() => data.items.map((item) => item.id));
  const locationBoxSize = getLocationBoxSize(data.items, data.choiceSize);
  const inlineChoiceBoxSize = getInlineChoiceBoxSize(data.items);
  const locationCanvasBoxStyle = { width: `${locationBoxSize.width / 10}cqw`, height: `${locationBoxSize.height / 10}cqw` };
  const inlineBoxStyle = { width: `${inlineChoiceBoxSize.width}px`, height: `${inlineChoiceBoxSize.height}px` };
  const canvasHeight = normalizeCanvasHeight(data.canvasHeight);

  useEffect(() => {
    const nextOrder = data.items.map((item) => item.id);
    if (data.settings.shuffleItems) {
      for (let index = nextOrder.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [nextOrder[index], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[index]];
      }
    }
    // The saved item list is external question data; refresh its stable display order when it changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemOrder(nextOrder);
  }, [itemIdsKey, data.items, data.settings.shuffleItems]);

  const placedIds = Object.values(placements).flat();
  const orderedItems = useMemo(
    () => itemOrder.map((itemId) => data.items.find((item) => item.id === itemId)).filter((item): item is DragDropData["items"][number] => Boolean(item)),
    [data.items, itemOrder]
  );
  const bank = orderedItems.filter((item) => data.settings.allowReuse || !placedIds.includes(item.id));
  const place = (itemId: string, zoneId: string) => {
    const zone = data.zones.find((candidate) => candidate.id === zoneId);
    if (!zone || !data.items.some(item => item.id === itemId)) return;
    const next: DragDropPlacements = data.settings.allowReuse
      ? Object.fromEntries(Object.entries(placements).map(([id, ids]) => [id, [...ids]]))
      : Object.fromEntries(Object.entries(placements).map(([id, ids]) => [id, ids.filter((candidate) => candidate !== itemId)]));
    const current = next[zoneId] || [];
    next[zoneId] = zone.capacity && current.length >= zone.capacity ? [...current.slice(1), itemId] : [...current, itemId];
    onChange(next); setSelectedItemId(null);
  };
  const placeInSequence = (itemId: string, zoneId: string, position: number) => {
    const current = Array.from({ length: getSequenceTargetCount(data) }, (_, index) => (placements[zoneId] || [])[index] || "");
    const nextOrder = current.map((id) => id === itemId ? "" : id);
    nextOrder[position] = itemId;
    onChange({ ...placements, [zoneId]: nextOrder });
    setSelectedItemId(null);
  };
  const drop = (event: DragEvent, zoneId: string) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) place(id, zoneId); };
  const itemCard = (itemId: string, fitTarget = false) => {
    const item = data.items.find((candidate) => candidate.id === itemId); if (!item) return null;
    return <button type="button" aria-label={item.content || `Option ${data.items.findIndex(candidate => candidate.id === item.id) + 1}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)} onClick={(event) => { event.stopPropagation(); setSelectedItemId(item.id); }} style={(data.preset === "locations" || data.preset === "category-canvas") ? { ...(fitTarget ? { width: "100%", height: "100%" } : locationCanvasBoxStyle), padding: "0.6cqw 0.8cqw", fontSize: "1.7cqw" } : data.preset === "inline" ? (fitTarget ? { width: "100%", height: "100%" } : inlineBoxStyle) : undefined} className={`${data.preset === "categories" ? "min-w-32 rounded-none border-slate-500 px-4 py-2.5 text-center font-serif font-semibold shadow-none" : data.preset === "sequence" ? "flex h-full w-full flex-col items-center justify-center rounded-none border-slate-300 px-3 py-2 text-center font-medium shadow-sm" : (data.preset === "locations" || data.preset === "category-canvas") ? `flex shrink-0 flex-col items-center ${item.textVerticalAlign === "top" ? "justify-start" : item.textVerticalAlign === "bottom" ? "justify-end" : "justify-center"} rounded-none border-slate-400 text-center font-medium shadow-sm` : data.preset === "inline" ? "flex shrink-0 flex-col items-center justify-center rounded-none border-slate-300 px-4 py-3 text-center font-medium leading-tight shadow-sm" : "rounded-none border-slate-300 px-4 py-3 text-left font-medium shadow-sm"} box-border border bg-white/50 text-black transition hover:border-blue-600 ${selectedItemId === item.id ? "border-blue-600 ring-2 ring-blue-200" : ""}`}>
      {item.imageUrl && <img src={item.imageUrl} alt="" style={(data.preset === "locations" || data.preset === "category-canvas") ? { maxHeight: "10cqw", maxWidth: "14cqw", marginBottom: "0.5cqw" } : undefined} className={`${(data.preset === "locations" || data.preset === "category-canvas") ? "min-h-0 flex-1" : "mb-2 max-h-28 max-w-full"} object-contain`} />}<span className="rich-text-content min-w-0 max-w-full" dangerouslySetInnerHTML={{ __html: getDragDropItemHtml(item) }} />
    </button>;
  };
  const zoneCard = (zone: DragDropData["zones"][number]) => {
    const categoryStyle = data.preset === "categories";
    return <div key={zone.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, zone.id)} onClick={() => selectedItemId && place(selectedItemId, zone.id)} className={`${categoryStyle ? "min-h-52 rounded-none border border-slate-500 bg-white" : `min-h-28 rounded-xl bg-white/90 p-3 ${data.settings.showZoneOutlines ? "border-2 border-dashed border-slate-400" : "border border-transparent"}`}`}>
      <h4 className={`${categoryStyle ? "border-b border-slate-500 px-4 py-2 text-center font-serif font-semibold text-slate-900" : "mb-3 text-center font-semibold text-slate-800"}`}>{zone.label}</h4>
      <div className={`flex flex-wrap gap-2 ${categoryStyle ? "p-3" : ""} ${data.preset === "sequence" && data.direction === "vertical" ? "flex-col" : ""}`}>{(placements[zone.id] || []).map((id) => <span key={id} className="relative">{itemCard(id)}<button type="button" onClick={(e) => { e.stopPropagation(); onChange({ ...placements, [zone.id]: (placements[zone.id] || []).filter((candidate) => candidate !== id) }); }} className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-slate-800 text-xs text-white">×</button></span>)}</div>
    </div>;
  };

  if (data.preset === "category-canvas") return <div>
    <p className="sr-only">Select a choice, then select a category. Use the remove button to return a choice to the bank.</p>
    <div style={{ containerType: "inline-size", aspectRatio: `100 / ${canvasHeight}` }} className="relative w-full overflow-hidden border border-slate-300 bg-slate-100">
      {data.backgroundImageUrl && <img src={data.backgroundImageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />}
      {(data.canvasElements || []).map(element => <div key={element.id} className="absolute" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}><LocationCanvasElementContent element={element} /></div>)}
      <div className={data.choiceBankGrouped === false ? "contents" : `absolute z-30 flex ${data.choiceBankDirection === "vertical" ? "flex-col" : "flex-row"}`} style={data.choiceBankGrouped === false ? undefined : { left: `${data.choiceBankX ?? 8}%`, top: `${data.choiceBankY ?? 25}%`, gap: "0.8cqw" }}>
        {bank.map(item => <div key={item.id} style={{ ...(data.choiceBankGrouped === false ? { position: "absolute", left: `${item.x ?? 8}%`, top: `${item.y ?? 25}%` } as const : {}), fontSize: "1.7cqw" }}>{itemCard(item.id)}</div>)}
      </div>
      {data.zones.map(zone => <div key={zone.id} onDragOver={event => event.preventDefault()} onDrop={event => drop(event, zone.id)} className="absolute z-20 flex flex-col border border-slate-500 bg-white/90" style={{ left: `${zone.x ?? 5}%`, top: `${zone.y ?? 45}%`, width: `${zone.width ?? 43}%`, height: `${zone.height ?? 40}%`, fontSize: "1.7cqw" }}>
        <button type="button" aria-label={`Place selected choice in ${zone.label}`} onClick={() => selectedItemId && place(selectedItemId, zone.id)} className="shrink-0 border-b border-slate-500 p-2 font-semibold focus:ring-2 focus:ring-blue-500">{zone.label}</button>
        <div onClick={() => selectedItemId && place(selectedItemId, zone.id)} className="flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-auto p-3">
          {(placements[zone.id] || []).map(id => <span key={id} className="relative max-w-full">{itemCard(id)}<button type="button" aria-label={`Return ${data.items.find(item => item.id === id)?.content || "choice"} to choices`} onClick={event => { event.stopPropagation(); onChange({ ...placements, [zone.id]: (placements[zone.id] || []).filter(value => value !== id) }); setSelectedItemId(null); }} className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-slate-800 text-xs text-white">×</button></span>)}
        </div>
      </div>)}
    </div>
  </div>;

  return <div className="w-full space-y-6">
    {data.preset !== "sequence" && data.preset !== "locations" && data.preset !== "inline" && <div><p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Choices</p><div className={`flex flex-wrap gap-3 ${data.preset === "categories" ? "justify-center" : ""}`}>{bank.map((item) => <span key={item.id}>{itemCard(item.id)}</span>)}</div><p className="mt-2 text-sm text-slate-500">Drag a choice, or select it and then select a target.</p></div>}
    {data.preset === "sequence" && data.zones[0] ? (
      <div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Choices</p>
        <p className="mb-4 text-sm text-slate-500">Drag a choice, or select it and then select a target.</p>
        <div className="overflow-x-auto pb-2">
          <div className="flex w-max gap-3">
            {orderedItems.map((item) => (
              <div key={item.id} className="min-h-16 w-32 shrink-0">
                {bank.some((availableItem) => availableItem.id === item.id) ? itemCard(item.id) : null}
              </div>
            ))}
          </div>
          <div className="mt-6 inline-block">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${getSequenceTargetCount(data)}, 8rem)` }}>
            {Array.from({ length: getSequenceTargetCount(data) }, (_, position) => {
              const itemId = (placements[data.zones[0].id] || [])[position];
              return (
                <div key={position} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const item = event.dataTransfer.getData("text/plain"); if (item) placeInSequence(item, data.zones[0].id, position); }} onClick={() => selectedItemId && placeInSequence(selectedItemId, data.zones[0].id, position)} className={`box-border flex min-h-14 items-center justify-center border-2 border-dashed bg-white p-1 ${itemId ? "border-blue-400" : "border-slate-400"}`}>
                  {itemId && <span className="relative h-full w-full">{itemCard(itemId)}<button type="button" onClick={(event) => { event.stopPropagation(); const next = [...(placements[data.zones[0].id] || [])]; next[position] = ""; onChange({ ...placements, [data.zones[0].id]: next }); }} className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-slate-800 text-xs text-white">×</button></span>}
                </div>
              );
            })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-8 px-1 text-base font-bold text-slate-900">
              <p className="max-w-xs whitespace-pre-line text-left">{data.sequenceStartLabel}</p>
              <p className="ml-auto max-w-xs whitespace-pre-line text-right">{data.sequenceEndLabel}</p>
            </div>
          </div>
        </div>
      </div>
    ) : data.preset === "locations" ? <div style={{ containerType: "inline-size", aspectRatio: `100 / ${canvasHeight}` }} className="relative w-full overflow-hidden border border-slate-300 bg-slate-100">
      {data.backgroundImageUrl ? <img src={data.backgroundImageUrl} alt="Match locations diagram" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} /> : <div className="absolute inset-0" />}
      <div className="absolute inset-0">
        {(data.canvasElements || []).map((element) => <div key={element.id} className="pointer-events-none absolute" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}><LocationCanvasElementContent element={element} /></div>)}
        {data.choiceBankGrouped !== false
          ? <div className={`absolute z-30 flex w-max ${data.choiceBankDirection === "vertical" ? "flex-col" : "flex-row"}`} style={{ left: `${data.choiceBankX ?? 8}%`, top: `${data.choiceBankY ?? 6}%`, gap: "0.8cqw" }}>{bank.map((item) => <span key={item.id}>{itemCard(item.id)}</span>)}</div>
          : orderedItems.map((item, index) => {
            // Shuffle into the authored slots, then keep those slots stable as answers move.
            const slot = data.settings.shuffleItems ? data.items[index] : item;
            return bank.some(available => available.id === item.id) ? <div key={item.id} data-choice-slot={item.id} className="absolute z-30" style={{ left: `${slot.x ?? 8}%`, top: `${slot.y ?? 35}%` }}>{itemCard(item.id)}</div> : null;
          })}
        {data.zones.map((zone, zoneIndex) => {
        const placedItemId = (placements[zone.id] || [])[0];
        return <div key={zone.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, zone.id)} onClick={() => selectedItemId && place(selectedItemId, zone.id)} className={`absolute z-20 box-border flex items-center justify-center bg-white/80 text-center font-semibold text-slate-800 ${data.settings.showZoneOutlines ? "border-2 border-dashed border-slate-500" : "border border-transparent"}`} style={{ left: `${zone.x ?? 10}%`, top: `${zone.y ?? 10}%`, ...locationCanvasBoxStyle, fontSize: "1.5cqw" }}>
          {data.settings.showTargetLabels && <span style={{ marginBottom: "0.5cqw", fontSize: "1.6cqw" }} className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap font-bold text-slate-900">{zone.label || `Target ${zoneIndex + 1}`}</span>}
          {placedItemId ? <span className="relative h-full w-full">{itemCard(placedItemId, true)}<button type="button" onClick={(event) => { event.stopPropagation(); onChange({ ...placements, [zone.id]: [] }); }} className="absolute -right-2 -top-2 z-10 h-6 w-6 rounded-full bg-slate-800 text-xs text-white">×</button></span> : null}
        </div>;
      })}</div>
    </div> : data.preset === "inline" ? <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-lg leading-[3.5rem] text-slate-950">{getInlineBlankSegments(data.inlineText || "").map((segment, index) => {
        if (segment.type === "text") return <span key={index} className="whitespace-pre-wrap">{segment.content}</span>;
        const zone = data.zones[segment.index];
        if (!zone) return <span key={index} style={inlineBoxStyle} className="mx-1 inline-flex box-border border-2 border-dashed border-red-300 bg-red-50 align-middle" />;
        const placedItemId = (placements[zone.id] || [])[0];
        return <span key={index} style={inlineBoxStyle} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, zone.id)} onClick={() => selectedItemId && place(selectedItemId, zone.id)} aria-label={`Answer target ${segment.index + 1}`} className={`relative mx-1 inline-flex box-border items-stretch justify-center border-2 border-dashed bg-white align-middle ${placedItemId ? "border-blue-400" : "border-slate-400"}`}>{placedItemId ? <>{itemCard(placedItemId, true)}<button type="button" onClick={(event) => { event.stopPropagation(); onChange({ ...placements, [zone.id]: [] }); }} className="absolute -right-2 -top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-xs leading-none text-white" aria-label={`Clear answer target ${segment.index + 1}`}>×</button></> : null}</span>;
      })}</div>
      <div><p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Choices</p><div className="flex flex-wrap gap-3">{bank.map((item) => <span key={item.id}>{itemCard(item.id)}</span>)}</div><p className="mt-2 text-sm text-slate-500">Drag a choice into a blank, or select it and then select a blank.</p></div>
    </div> : data.preset === "freeform" ? <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 bg-contain bg-center bg-no-repeat" style={data.backgroundImageUrl ? { backgroundImage: `url(${data.backgroundImageUrl})` } : undefined}>{data.zones.map((zone) => <div key={zone.id} className="absolute" style={{ left: `${zone.x ?? 10}%`, top: `${zone.y ?? 10}%`, width: `${zone.width ?? 25}%`, minHeight: `${zone.height ?? 18}%` }}>{zoneCard(zone)}</div>)}</div> : <div className={`grid ${data.preset === "categories" ? "gap-2 md:grid-cols-2" : "gap-4 md:grid-cols-2"}`}>{data.zones.map(zoneCard)}</div>}
  </div>;
}
