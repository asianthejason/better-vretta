"use client";

import { useRef, useState, type PointerEvent } from "react";
import LocationCanvasElementContent from "@/app/components/LocationCanvasElementContent";
import { getLocationBoxSize, makeDragDropId, type DragDropCanvasElement, type DragDropData, type DragDropZone } from "@/lib/dragDrop";

export type LocationLibraryImage = { id?: string; url: string; path: string; label: string };

type Gesture = {
  kind: "target" | "choices" | "element-move" | "element-resize";
  zoneId?: string;
  elementId?: string;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth?: number;
  startHeight?: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export default function LocationCanvasEditor({ data, onChange, uploadedImages, itemPreviewUrls, onItemImageFileChange, onChooseItemImage, onRemoveItemImage, onUploadBackground, onDeleteUploadedImage }: {
  data: DragDropData;
  onChange: (value: DragDropData) => void;
  uploadedImages: LocationLibraryImage[];
  itemPreviewUrls: Record<string, string>;
  onItemImageFileChange: (itemId: string, file: File | null) => void;
  onChooseItemImage: (itemId: string, image: LocationLibraryImage) => void;
  onRemoveItemImage: (itemId: string) => void;
  onUploadBackground: (file: File) => Promise<{ url: string; path: string }>;
  onDeleteUploadedImage: (image: LocationLibraryImage & { id: string }) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [selectedLibraryImages, setSelectedLibraryImages] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [showChoiceImages, setShowChoiceImages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const gestureMovedRef = useRef(false);
  const editingItem = data.items.find((item) => item.id === editingItemId);
  const editingElement = (data.canvasElements || []).find((element) => element.id === editingElementId);
  const boxSize = getLocationBoxSize(data.items.map((item) => ({ ...item, imageUrl: itemPreviewUrls[item.id] || item.imageUrl })));
  const choicesAreVertical = data.choiceBankDirection === "vertical";

  const updateZones = (zones: DragDropZone[]) => onChange({ ...data, zones });
  const updateZone = (zoneId: string, patch: Partial<DragDropZone>) => updateZones(data.zones.map((zone) => zone.id === zoneId ? { ...zone, ...patch } : zone));
  const updateElements = (canvasElements: DragDropCanvasElement[]) => onChange({ ...data, canvasElements });
  const updateElement = (elementId: string, patch: Partial<DragDropCanvasElement>) => updateElements((data.canvasElements || []).map((element) => element.id === elementId ? { ...element, ...patch } : element));
  const addChoice = () => {
    const item = { id: makeDragDropId(), content: `Item ${data.items.length + 1}` };
    onChange({ ...data, items: [...data.items, item] });
    setEditingItemId(item.id);
    setShowChoiceImages(false);
  };
  const addTarget = () => {
    const index = data.zones.length;
    const zone: DragDropZone = { id: makeDragDropId(), label: `Target ${index + 1}`, correctItemIds: [], capacity: 1, x: 10 + (index % 4) * 18, y: 12 + (index % 3) * 20, width: 16, height: 14 };
    updateZones([...data.zones, zone]);
    setEditingZoneId(zone.id);
  };

  const beginGesture = (event: PointerEvent<HTMLElement>, zone: DragDropZone) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setGesture({ kind: "target", zoneId: zone.id, startX: event.clientX, startY: event.clientY, startLeft: zone.x ?? 10, startTop: zone.y ?? 10 });
  };
  const beginChoiceGesture = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ kind: "choices", startX: event.clientX, startY: event.clientY, startLeft: data.choiceBankX ?? 8, startTop: data.choiceBankY ?? 6 });
  };
  const beginElementGesture = (event: PointerEvent<HTMLElement>, element: DragDropCanvasElement, kind: "element-move" | "element-resize") => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setGesture({ kind, elementId: element.id, startX: event.clientX, startY: event.clientY, startLeft: element.x, startTop: element.y, startWidth: element.width, startHeight: element.height });
  };
  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const deltaX = ((event.clientX - gesture.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - gesture.startY) / bounds.height) * 100;
    if (Math.abs(event.clientX - gesture.startX) > 3 || Math.abs(event.clientY - gesture.startY) > 3) {
      gestureMovedRef.current = true;
      if (gesture.kind === "target") setEditingZoneId(null);
      if (gesture.kind.startsWith("element")) setEditingElementId(null);
    }
    if (gesture.kind === "choices") {
      const bankWidth = choicesAreVertical ? boxSize.width : Math.min(bounds.width, data.items.length * boxSize.width + Math.max(0, data.items.length - 1) * 8);
      const bankHeight = choicesAreVertical ? Math.min(bounds.height, data.items.length * boxSize.height + Math.max(0, data.items.length - 1) * 8) : boxSize.height;
      onChange({
        ...data,
        choiceBankX: clamp(gesture.startLeft + deltaX, 0, Math.max(0, 100 - (bankWidth / bounds.width) * 100)),
        choiceBankY: clamp(gesture.startTop + deltaY, 0, Math.max(0, 100 - (bankHeight / bounds.height) * 100)),
      });
      return;
    }
    if ((gesture.kind === "element-move" || gesture.kind === "element-resize") && gesture.elementId) {
      if (gesture.kind === "element-move") {
        updateElement(gesture.elementId, {
          x: clamp(gesture.startLeft + deltaX, 0, Math.max(0, 100 - (gesture.startWidth || 20))),
          y: clamp(gesture.startTop + deltaY, 0, Math.max(0, 100 - (gesture.startHeight || 20))),
        });
      } else {
        updateElement(gesture.elementId, {
          width: clamp((gesture.startWidth || 20) + deltaX, 5, 100 - gesture.startLeft),
          height: clamp((gesture.startHeight || 20) + deltaY, 5, 100 - gesture.startTop),
        });
      }
      return;
    }
    if (!gesture.zoneId) return;
    updateZone(gesture.zoneId, {
      x: clamp(gesture.startLeft + deltaX, 0, Math.max(0, 100 - (boxSize.width / bounds.width) * 100)),
      y: clamp(gesture.startTop + deltaY, 0, Math.max(0, 100 - (boxSize.height / bounds.height) * 100)),
    });
  };
  const addTextBox = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "text", text: "Enter text", fontSize: 18, x: 8, y: 35, width: 28, height: 16 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const addTable = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "table", rows: 2, columns: 2, cells: [["", ""], ["", ""]], showBorders: true, x: 25, y: 35, width: 42, height: 28 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const addImageElements = (images: Array<{ url: string; path: string }>) => {
    const existingCount = (data.canvasElements || []).filter((element) => element.type === "image").length;
    updateElements([...(data.canvasElements || []), ...images.map((image, index): DragDropCanvasElement => ({
      id: makeDragDropId(),
      type: "image",
      imageUrl: image.url,
      imagePath: image.path,
      x: 5 + ((existingCount + index) % 5) * 5,
      y: 18 + ((existingCount + index) % 5) * 5,
      width: 30,
      height: 30,
    }))]);
  };
  const resizeTable = (element: DragDropCanvasElement, rows: number, columns: number) => updateElement(element.id, {
    rows,
    columns,
    cells: Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => element.cells?.[rowIndex]?.[columnIndex] || "")),
  });

  return (
    <section className="space-y-4 rounded-xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold text-slate-950">Location canvas</h3><p className="mt-1 text-sm text-slate-500">Drag and resize targets on a blank canvas, or add a diagram as the background.</p></div>
        <button type="button" onClick={addTarget} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add target</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setShowImages((current) => !current); setSelectedLibraryImages([]); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add images</button>
        {data.backgroundImageUrl && <button type="button" onClick={() => onChange({ ...data, backgroundImageUrl: "", backgroundImagePath: "" })} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove original background</button>}
        <button type="button" onClick={addTextBox} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Text box</button>
        <button type="button" onClick={addTable} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Table</button>
      </div>

      {showImages && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">Add images to the canvas</p><p className="text-xs text-slate-500">Upload several files or select several existing images.</p></div><label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">{uploading ? "Uploading..." : "Upload images"}<input type="file" accept="image/*" multiple disabled={uploading} className="sr-only" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; if (!files.length) return; setUploading(true); void Promise.all(files.map(onUploadBackground)).then((images) => { addImageElements(images); setShowImages(false); }).catch((error) => alert(error instanceof Error ? error.message : "Could not upload the images.")).finally(() => setUploading(false)); }} /></label></div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9rem,12rem))] gap-2">{uploadedImages.map((image) => { const selected = selectedLibraryImages.includes(image.url); return <div key={image.url} className="group relative"><button type="button" onClick={() => setSelectedLibraryImages((current) => selected ? current.filter((url) => url !== image.url) : [...current, image.url])} className={`w-full rounded-lg border bg-white p-2 text-left ${selected ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-200 hover:border-blue-500"}`}><img src={image.url} alt={image.label} className="h-24 w-full object-contain" /><span className="mt-1 flex items-center gap-1 truncate text-xs text-slate-600"><span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{selected ? "✓" : ""}</span>{image.label}</span></button>{image.id && <button type="button" onClick={() => onDeleteUploadedImage(image as LocationLibraryImage & { id: string })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white opacity-0 shadow group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${image.label}`}>×</button>}</div>; })}
          {!uploadedImages.length && <p className="text-sm text-slate-500">No uploaded images yet.</p>}
        </div>
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setShowImages(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={!selectedLibraryImages.length} onClick={() => { addImageElements(uploadedImages.filter((image) => selectedLibraryImages.includes(image.url))); setSelectedLibraryImages([]); setShowImages(false); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add selected ({selectedLibraryImages.length})</button></div>
      </div>}

      <div ref={canvasRef} onPointerMove={moveGesture} onPointerUp={() => setGesture(null)} onPointerCancel={() => setGesture(null)} className={`relative overflow-hidden border border-slate-300 bg-slate-100 ${data.backgroundImageUrl ? "" : "aspect-video"}`}>
        {data.backgroundImageUrl ? <img src={data.backgroundImageUrl} alt="Location question background" className="block h-auto w-full select-none object-contain" draggable={false} /> : <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-500">Blank canvas · add targets or upload a background</div>}
        <div className="absolute inset-0">
          {(data.canvasElements || []).map((element) => <div key={element.id} onPointerDown={(event) => beginElementGesture(event, element, "element-move")} onClick={(event) => { event.stopPropagation(); if (!gestureMovedRef.current) setEditingElementId(element.id); }} className={`absolute z-0 box-border cursor-move touch-none bg-white/20 ${editingElementId === element.id ? "ring-2 ring-violet-500" : "hover:ring-2 hover:ring-violet-300"}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}>
            <LocationCanvasElementContent element={element} />
            <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize")} className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize touch-none border-l border-t border-violet-700 bg-white" aria-label="Resize canvas element" />
          </div>)}
          <div className="absolute z-30" style={{ left: `${data.choiceBankX ?? 8}%`, top: `${data.choiceBankY ?? 6}%` }}>
            <div className="absolute bottom-full left-0 z-10 mb-1 flex w-max items-center gap-1">
              <button type="button" onPointerDown={beginChoiceGesture} className="cursor-move touch-none whitespace-nowrap rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white shadow">Move group</button>
              <button type="button" onClick={() => onChange({ ...data, choiceBankDirection: choicesAreVertical ? "horizontal" : "vertical" })} className="grid h-6 w-7 place-items-center rounded bg-white text-sm font-bold text-blue-800 shadow ring-1 ring-blue-300" title={choicesAreVertical ? "Arrange choices horizontally" : "Arrange choices vertically"} aria-label={choicesAreVertical ? "Arrange choices horizontally" : "Arrange choices vertically"}>{choicesAreVertical ? "↔" : "↕"}</button>
              <button type="button" onClick={addChoice} className="grid h-6 w-7 place-items-center rounded bg-white text-base font-bold text-blue-800 shadow ring-1 ring-blue-300" title="Add choice" aria-label="Add choice">+</button>
            </div>
            <div className={`flex w-max gap-2 ${choicesAreVertical ? "flex-col" : "flex-row"}`}>{data.items.map((item) => <button type="button" key={item.id} onClick={() => { setEditingItemId(item.id); setShowChoiceImages(false); }} style={boxSize} className="box-border flex shrink-0 flex-col items-center justify-center rounded border border-slate-400 bg-white px-3 py-2 text-center text-sm font-medium text-black shadow-sm transition hover:border-blue-600 hover:ring-2 hover:ring-blue-200">
              {(itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="" className="mb-1 min-h-0 max-h-20 max-w-28 flex-1 object-contain" />}
              <span>{item.content || "Untitled choice"}</span>
            </button>)}</div>
          </div>
          {data.zones.map((zone, index) => <div key={zone.id} onPointerDown={(event) => beginGesture(event, zone)} onClick={(event) => { event.stopPropagation(); if (!gestureMovedRef.current) setEditingZoneId((current) => current === zone.id ? null : zone.id); }} className={`absolute z-20 box-border cursor-move touch-none border-2 border-dashed bg-blue-100/45 ${editingZoneId === zone.id ? "border-blue-700 ring-2 ring-blue-300" : "border-blue-500"}`} style={{ left: `${zone.x ?? 10}%`, top: `${zone.y ?? 10}%`, ...boxSize }}>
            <span className="absolute left-1 top-1 grid h-6 min-w-6 place-items-center rounded bg-blue-700 px-1 text-xs font-bold text-white">{index + 1}</span>
          </div>)}
          {data.zones.map((zone) => editingZoneId === zone.id && <div key={`editor-${zone.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="absolute z-40 w-64 rounded-xl border border-blue-300 bg-white p-3 text-left shadow-xl" style={{ left: `min(${zone.x ?? 10}%, calc(100% - 16rem))`, ...((zone.y ?? 10) > 55 ? { bottom: `calc(${100 - (zone.y ?? 10)}% + 8px)` } : { top: `calc(${zone.y ?? 10}% + ${boxSize.height + 8}px)` }) }}>
            <label className="block text-xs font-semibold text-slate-700">Target label<input value={zone.label} onChange={(event) => updateZone(zone.id, { label: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
            <label className="mt-2 block text-xs font-semibold text-slate-700">Correct choice<select value={zone.correctItemIds[0] || ""} onChange={(event) => updateZone(zone.id, { correctItemIds: event.target.value ? [event.target.value] : [], capacity: 1 })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"><option value="">Select a choice</option>{data.items.map((item) => <option key={item.id} value={item.id} disabled={data.zones.some((currentZone) => currentZone.id !== zone.id && currentZone.correctItemIds[0] === item.id)}>{item.content || "Untitled choice"}</option>)}</select></label>
            <div className="mt-3 flex justify-between gap-2"><button type="button" onClick={() => setEditingZoneId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Done</button><button type="button" onClick={() => { updateZones(data.zones.filter((currentZone) => currentZone.id !== zone.id)); setEditingZoneId(null); }} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700">Remove target</button></div>
          </div>)}
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" checked={data.settings.showTargetLabels ?? false} onChange={(event) => onChange({ ...data, settings: { ...data.settings, showTargetLabels: event.target.checked } })} className="mt-1" />
        <span><strong className="block text-slate-900">Show labels above targets</strong><span className="text-xs text-slate-500">Useful for matching to named columns or steps. Leave off for points on diagrams and number lines.</span></span>
      </label>

      {editingItem && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4" onMouseDown={() => setEditingItemId(null)}>
        <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-slate-950">Edit choice</h3><button type="button" onClick={() => setEditingItemId(null)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 font-bold text-slate-700" aria-label="Close choice editor">×</button></div>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Choice text<input autoFocus value={editingItem.content} onChange={(event) => onChange({ ...data, items: data.items.map((item) => item.id === editingItem.id ? { ...item, content: event.target.value } : item) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950" /></label>
          <div className="mt-4"><p className="text-sm font-semibold text-slate-700">Choice image</p><div className="mt-2 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Upload image<input type="file" accept="image/*" className="sr-only" onChange={(event) => { onItemImageFileChange(editingItem.id, event.target.files?.[0] || null); event.target.value = ""; }} /></label>
            <button type="button" onClick={() => setShowChoiceImages((current) => !current)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Choose existing</button>
            {(itemPreviewUrls[editingItem.id] || editingItem.imageUrl) && <button type="button" onClick={() => onRemoveItemImage(editingItem.id)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove image</button>}
          </div></div>
          {(itemPreviewUrls[editingItem.id] || editingItem.imageUrl) && <img src={itemPreviewUrls[editingItem.id] || editingItem.imageUrl} alt="Choice preview" className="mt-3 h-36 w-full rounded-lg border border-slate-200 object-contain p-2" />}
          {showChoiceImages && <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">{uploadedImages.map((image) => <div key={image.url} className="group relative"><button type="button" onClick={() => { onChooseItemImage(editingItem.id, image); setShowChoiceImages(false); }} className="w-full rounded-lg border border-slate-200 bg-white p-2"><img src={image.url} alt={image.label} className="h-20 w-full object-contain" /><span className="mt-1 block truncate text-xs text-slate-600">{image.label}</span></button>{image.id && <button type="button" onClick={() => onDeleteUploadedImage(image as LocationLibraryImage & { id: string })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white opacity-0 shadow group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${image.label}`}>×</button>}</div>)}{!uploadedImages.length && <p className="col-span-full text-sm text-slate-500">No uploaded images yet.</p>}</div>}
          <div className="mt-5 flex gap-2"><button type="button" onClick={() => setEditingItemId(null)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">Done</button><button type="button" onClick={() => { onRemoveItemImage(editingItem.id); onChange({ ...data, items: data.items.filter((item) => item.id !== editingItem.id), zones: data.zones.map((zone) => ({ ...zone, correctItemIds: zone.correctItemIds.filter((itemId) => itemId !== editingItem.id) })) }); setEditingItemId(null); }} className="rounded-lg border border-red-300 px-4 py-2.5 font-semibold text-red-700">Remove choice</button></div>
        </section>
      </div>}

      {editingElement && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4" onMouseDown={() => setEditingElementId(null)}>
        <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold capitalize text-slate-950">Edit {editingElement.type}</h3><button type="button" onClick={() => setEditingElementId(null)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 font-bold text-slate-700" aria-label="Close canvas element editor">×</button></div>
          {editingElement.type === "image" && editingElement.imageUrl && <img src={editingElement.imageUrl} alt="Canvas image preview" className="mt-4 h-56 w-full rounded-xl border border-slate-200 object-contain p-2" />}
          {editingElement.type === "text" && <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]"><label className="text-sm font-semibold text-slate-700">Text<textarea autoFocus value={editingElement.text || ""} onChange={(event) => updateElement(editingElement.id, { text: event.target.value })} className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 p-3 text-slate-950" /></label><label className="text-sm font-semibold text-slate-700">Font size<input type="number" min="10" max="72" value={editingElement.fontSize || 18} onChange={(event) => updateElement(editingElement.id, { fontSize: clamp(Number(event.target.value) || 18, 10, 72) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950" /></label></div>}
          {editingElement.type === "table" && <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold text-slate-700">Rows<input type="number" min="1" max="12" value={editingElement.rows || 2} onChange={(event) => resizeTable(editingElement, clamp(Number(event.target.value) || 1, 1, 12), editingElement.columns || 2)} className="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2 text-slate-950" /></label><label className="text-sm font-semibold text-slate-700">Columns<input type="number" min="1" max="8" value={editingElement.columns || 2} onChange={(event) => resizeTable(editingElement, editingElement.rows || 2, clamp(Number(event.target.value) || 1, 1, 8))} className="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2 text-slate-950" /></label><label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={editingElement.showBorders !== false} onChange={(event) => updateElement(editingElement.id, { showBorders: event.target.checked })} />Show borders</label></div>
            <div className="overflow-x-auto"><table className="w-full table-fixed border-collapse"><tbody>{Array.from({ length: editingElement.rows || 2 }, (_, rowIndex) => <tr key={rowIndex}>{Array.from({ length: editingElement.columns || 2 }, (_, columnIndex) => <td key={columnIndex} className="border border-slate-300 p-1"><input value={editingElement.cells?.[rowIndex]?.[columnIndex] || ""} onChange={(event) => updateElement(editingElement.id, { cells: Array.from({ length: editingElement.rows || 2 }, (_, currentRow) => Array.from({ length: editingElement.columns || 2 }, (_, currentColumn) => currentRow === rowIndex && currentColumn === columnIndex ? event.target.value : editingElement.cells?.[currentRow]?.[currentColumn] || "")) })} className="w-full min-w-24 rounded border border-slate-200 px-2 py-2 text-slate-950" aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} /></td>)}</tr>)}</tbody></table></div>
          </div>}
          <div className="mt-5 flex gap-2"><button type="button" onClick={() => setEditingElementId(null)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">Done</button><button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((element) => element.id !== editingElement.id)); setEditingElementId(null); }} className="rounded-lg border border-red-300 px-4 py-2.5 font-semibold text-red-700">Delete</button></div>
        </section>
      </div>}
    </section>
  );
}
