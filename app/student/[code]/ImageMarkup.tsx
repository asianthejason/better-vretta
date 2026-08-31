"use client";

import { PointerEvent, useRef, useState } from "react";

type Tool = "cursor" | "measure" | "shape" | "color";
type MeasureTool = "ruler" | "protractor" | "counter";
type ShapeTool = "line" | "polygon" | "circle" | "rectangle";
type Point = { x: number; y: number };
type Drawing = {
  id: string;
  type: ShapeTool;
  color: string;
  start?: Point;
  end?: Point;
  points?: Point[];
};

const colors = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed", "#ffffff"];

function CursorIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M5 2.8v16.7l4.4-4.2 2.8 6 3-1.4-2.8-5.8h6L5 2.8Z" /></svg>;
}

function MeasureIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 17a8 8 0 0 1 16 0H4Z" /><path d="M12 9v3M7.7 10.3l1.5 2.6M16.3 10.3l-1.5 2.6" /></svg>;
}

function ShapeIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="17" r="2" /><rect x="12" y="5" width="7" height="7" rx="1" /><path d="m8 16 5-5" /></svg>;
}

function SubtoolIcon({ type }: { type: MeasureTool | ShapeTool }) {
  if (type === "ruler") return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 16 12-12 4 4L8 20l-4-4Z" /><path d="m13 7 2 2M10 10l2 2M7 13l2 2" /></svg>;
  if (type === "protractor") return <MeasureIcon />;
  if (type === "counter") return <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-current text-[10px] font-bold">1</span>;
  if (type === "line") return <svg viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" strokeWidth="2"><path d="M5 19 19 5" /></svg>;
  if (type === "polygon") return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 8 7-4 7 5-2 10H7L5 8Z" /></svg>;
  if (type === "circle") return <span className="block h-6 w-6 rounded-full border-2 border-current" />;
  return <span className="block h-5 w-7 border-2 border-current" />;
}

export default function ImageMarkup({ src, alt }: { src: string; alt: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("cursor");
  const [measureTool, setMeasureTool] = useState<MeasureTool>("counter");
  const [shapeTool, setShapeTool] = useState<ShapeTool>("line");
  const [color, setColor] = useState(colors[1]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [markers, setMarkers] = useState<Point[]>([]);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [rulerVisible, setRulerVisible] = useState(false);
  const [protractorVisible, setProtractorVisible] = useState(false);
  const [rulerLength, setRulerLength] = useState(5);
  const [rulerRotation, setRulerRotation] = useState(0);
  const [protractorRotation, setProtractorRotation] = useState(0);
  const [protractorScale, setProtractorScale] = useState(1);
  const [reverseProtractor, setReverseProtractor] = useState(false);
  const [rulerPosition, setRulerPosition] = useState<Point>({ x: 50, y: 70 });
  const [protractorPosition, setProtractorPosition] = useState<Point>({ x: 50, y: 55 });
  const [draggingMeasure, setDraggingMeasure] = useState<"ruler" | "ruler-transform" | "protractor" | "protractor-transform" | null>(null);
  const [openMenu, setOpenMenu] = useState<Tool | null>(null);

  function pointFromEvent(event: PointerEvent): Point {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function selectTool(nextTool: Tool) {
    setTool(nextTool);
    setOpenMenu((current) => current === nextTool ? null : nextTool === "cursor" ? null : nextTool);
    if (nextTool !== "shape") setPolygonPoints([]);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (draggingMeasure || tool === "cursor") return;
    const point = pointFromEvent(event);
    if (tool === "measure" && measureTool === "counter") {
      setMarkers((current) => [...current, point]);
      return;
    }
    if (tool !== "shape") return;
    if (shapeTool === "polygon") {
      const firstPoint = polygonPoints[0];
      const distanceFromStart = firstPoint
        ? Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y)
        : Number.POSITIVE_INFINITY;
      if (polygonPoints.length >= 3 && distanceFromStart <= 3) {
        setDrawings((current) => [...current, { id: crypto.randomUUID(), type: "polygon", color, points: [...polygonPoints, firstPoint] }]);
        setPolygonPoints([]);
        return;
      }
      setPolygonPoints((current) => [...current, point]);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({ id: crypto.randomUUID(), type: shapeTool, color, start: point, end: point });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(event);
    if (draggingMeasure === "ruler") {
      setRulerPosition(point);
      return;
    }
    if (draggingMeasure === "ruler-transform") {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + (rulerPosition.x / 100) * rect.width;
      const centerY = rect.top + (rulerPosition.y / 100) * rect.height;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      setRulerRotation(Math.round(Math.atan2(deltaY, deltaX) * 180 / Math.PI));
      setRulerLength(Math.max(1, Math.min(10, Math.round((Math.hypot(deltaX, deltaY) * 2) / 37.795))));
      return;
    }
    if (draggingMeasure === "protractor") {
      setProtractorPosition(point);
      return;
    }
    if (draggingMeasure === "protractor-transform") {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + (protractorPosition.x / 100) * rect.width;
      const centerY = rect.top + (protractorPosition.y / 100) * rect.height;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      setProtractorRotation(Math.round(Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90));
      setProtractorScale(Math.max(0.55, Math.min(1.8, Math.hypot(deltaX, deltaY) / 64)));
      return;
    }
    if (draft) setDraft((current) => current ? { ...current, end: point } : null);
  }

  function handlePointerUp() {
    if (draggingMeasure) {
      setDraggingMeasure(null);
      return;
    }
    if (draft) {
      setDrawings((current) => [...current, draft]);
      setDraft(null);
    }
  }

  function finishPolygon() {
    if (polygonPoints.length >= 2) {
      setDrawings((current) => [...current, { id: crypto.randomUUID(), type: "polygon", color, points: polygonPoints }]);
    }
    setPolygonPoints([]);
  }

  function renderDrawing(drawing: Drawing) {
    if (drawing.type === "polygon") {
      return <polyline key={drawing.id} points={drawing.points?.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={drawing.color} strokeWidth="0.8" strokeLinejoin="round" />;
    }
    if (!drawing.start || !drawing.end) return null;
    const x = Math.min(drawing.start.x, drawing.end.x);
    const y = Math.min(drawing.start.y, drawing.end.y);
    const width = Math.abs(drawing.end.x - drawing.start.x);
    const height = Math.abs(drawing.end.y - drawing.start.y);
    if (drawing.type === "line") return <line key={drawing.id} x1={drawing.start.x} y1={drawing.start.y} x2={drawing.end.x} y2={drawing.end.y} stroke={drawing.color} strokeWidth="0.8" strokeLinecap="round" />;
    if (drawing.type === "circle") return <ellipse key={drawing.id} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="none" stroke={drawing.color} strokeWidth="0.8" />;
    return <rect key={drawing.id} x={x} y={y} width={width} height={height} fill="none" stroke={drawing.color} strokeWidth="0.8" />;
  }

  const toolButton = (name: Tool, icon: React.ReactNode, label: string) => (
    <button type="button" onClick={() => selectTool(name)} aria-label={label} title={label} className={`flex h-11 w-11 items-center justify-center rounded-lg text-slate-950 transition ${tool === name ? "bg-blue-200 ring-1 ring-blue-400" : "hover:bg-slate-100"}`}>{icon}</button>
  );

  return (
    <div className="flex items-stretch gap-2">
      <div
        ref={stageRef}
        className={`relative min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm ${tool === "cursor" ? "cursor-default" : "cursor-crosshair"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={tool === "shape" && shapeTool === "polygon" ? finishPolygon : undefined}
      >
        <img src={src} alt={alt} draggable={false} className="block max-h-[28rem] w-full select-none rounded-lg object-contain" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]">
          {drawings.map(renderDrawing)}
          {draft && renderDrawing(draft)}
          {polygonPoints.length > 0 && <><polyline points={polygonPoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="2 1" /><circle cx={polygonPoints[0].x} cy={polygonPoints[0].y} r="1.8" fill="white" stroke={color} strokeWidth="0.7" /></>}
        </svg>
        {markers.map((marker, index) => <span key={`${marker.x}-${marker.y}-${index}`} className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-blue-600/65 text-[11px] font-bold text-white shadow" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}>{index + 1}</span>)}

        {rulerVisible && <div onPointerDown={(event) => { event.stopPropagation(); setDraggingMeasure("ruler"); }} className="absolute h-[1.4cm] origin-center cursor-move touch-none border border-amber-800 bg-amber-200/75 shadow-lg backdrop-blur-[1px]" style={{ left: `${rulerPosition.x}%`, top: `${rulerPosition.y}%`, width: `${rulerLength}cm`, transform: `translate(-50%, -50%) rotate(${rulerRotation}deg)` }} role="button" aria-label={`Move ${rulerLength} centimetre ruler`}><span className="absolute inset-0 flex overflow-hidden">{Array.from({ length: rulerLength }, (_, index) => <span key={index} className="relative h-full w-[1cm] shrink-0 border-l border-amber-950 text-left text-[9px] font-semibold text-amber-950"><i className="not-italic">{index}</i>{Array.from({ length: 9 }, (_, tick) => <b key={tick} className={`absolute top-0 w-px bg-amber-900 ${tick === 4 ? "h-3" : "h-2"}`} style={{ left: `${(tick + 1) * 10}%` }} />)}</span>)}</span><button type="button" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingMeasure("ruler-transform"); }} className="absolute right-0 top-1/2 flex h-7 w-7 translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xs font-bold text-white shadow-lg" aria-label="Rotate and crop ruler" title="Drag to rotate and crop">↔</button></div>}
        {protractorVisible && <div onPointerDown={(event) => { event.stopPropagation(); setDraggingMeasure("protractor"); }} className="absolute h-32 w-64 origin-center cursor-move touch-none" style={{ left: `${protractorPosition.x}%`, top: `${protractorPosition.y}%`, transform: `translate(-50%, -50%) rotate(${protractorRotation}deg) scale(${protractorScale})` }} role="button" aria-label="Move 180 degree protractor"><svg viewBox="0 0 240 125" className="h-full w-full overflow-visible drop-shadow-lg"><path d="M8 116 A112 112 0 0 1 232 116 L120 116 Z" fill="rgba(165,243,252,.55)" stroke="#155e75" strokeWidth="2" />{Array.from({ length: 19 }, (_, index) => { const angle = index * 10; const radians = (Math.PI * angle) / 180; const x1 = 120 - Math.cos(radians) * 109; const y1 = 116 - Math.sin(radians) * 109; const length = angle % 30 === 0 ? 14 : 8; const x2 = 120 - Math.cos(radians) * (109 - length); const y2 = 116 - Math.sin(radians) * (109 - length); return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#164e63" strokeWidth={angle % 30 === 0 ? 2 : 1} />; })}{[0, 30, 60, 90, 120, 150, 180].map((angle) => { const radians = (Math.PI * angle) / 180; const label = reverseProtractor ? 180 - angle : angle; return <text key={angle} x={120 - Math.cos(radians) * 88} y={119 - Math.sin(radians) * 88} textAnchor="middle" fontSize="9" fontWeight="700" fill="#164e63">{label}°</text>; })}<circle cx="120" cy="116" r="4" fill="none" stroke="#164e63" strokeWidth="2" /><line x1="8" y1="116" x2="232" y2="116" stroke="#155e75" strokeWidth="2" /></svg><button type="button" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingMeasure("protractor-transform"); }} className="absolute left-1/2 top-0 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xs font-bold text-white shadow-lg" aria-label="Rotate and resize protractor" title="Drag to rotate and resize">↗</button></div>}
      </div>

      <aside className="relative z-20 flex shrink-0 items-center" aria-label="Image markup tools">
      {openMenu && openMenu !== "cursor" && <div className="absolute left-[calc(100%+0.5rem)] top-1/2 w-36 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-2 text-slate-950 shadow-xl">
        {openMenu === "measure" && <>
          <div className="flex justify-center gap-1">
            {(["protractor", "ruler", "counter"] as MeasureTool[]).map((measure) => <button key={measure} type="button" title={measure === "counter" ? "Click counter" : measure} aria-label={measure} onClick={() => { setMeasureTool(measure); if (measure === "protractor") setProtractorVisible((current) => !current); if (measure === "ruler") setRulerVisible((current) => !current); }} className={`flex h-9 w-9 items-center justify-center rounded-lg ${measureTool === measure ? "bg-blue-200 ring-1 ring-blue-400" : "hover:bg-slate-100"}`}><SubtoolIcon type={measure} /></button>)}
          </div>
          {measureTool === "ruler" && <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
            <p className="text-[10px] font-semibold leading-4 text-slate-500">Drag the blue handle on the ruler to rotate it and crop its length in centimetres.</p>
          </div>}
          {measureTool === "protractor" && <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
            <p className="text-[10px] font-semibold leading-4 text-slate-500">Drag the blue handle on the protractor to rotate and resize it.</p>
            <button type="button" onClick={() => setReverseProtractor((current) => !current)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50">{reverseProtractor ? "0° on right" : "0° on left"}</button>
          </div>}
        </>}
        {openMenu === "shape" && <div className="grid grid-cols-2 gap-2">
          {(["line", "polygon", "circle", "rectangle"] as ShapeTool[]).map((shape) => <button key={shape} type="button" title={shape} aria-label={shape} onClick={() => { if (shapeTool === "polygon") finishPolygon(); setShapeTool(shape); }} className={`flex h-11 w-11 items-center justify-center justify-self-center rounded-lg ${shapeTool === shape ? "bg-blue-200 ring-1 ring-blue-400" : "hover:bg-slate-100"}`}><SubtoolIcon type={shape} /></button>)}
        </div>}
        {openMenu === "color" && <div className="grid grid-cols-3 gap-2">
          {colors.map((nextColor) => <button key={nextColor} type="button" onClick={() => setColor(nextColor)} aria-label={`Use ${nextColor}`} className={`h-7 w-7 justify-self-center rounded-full border-2 ${color === nextColor ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-300"}`} style={{ backgroundColor: nextColor }} />)}
        </div>}
      </div>}

      <div className="flex shrink-0 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
        {toolButton("cursor", <CursorIcon />, "Cursor")}
        {toolButton("measure", <MeasureIcon />, "Measurement tools")}
        {toolButton("shape", <ShapeIcon />, "Shape tools")}
        {toolButton("color", <span className="h-5 w-5 rounded-full border-2 border-white" style={{ backgroundColor: color }} />, "Drawing color")}

        {(drawings.length > 0 || markers.length > 0) && <button type="button" onClick={() => { setDrawings((current) => current.slice(0, -1)); if (drawings.length === 0) setMarkers((current) => current.slice(0, -1)); }} className="mt-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100" title="Undo last markup">Undo</button>}
      </div>
      </aside>
    </div>
  );
}
