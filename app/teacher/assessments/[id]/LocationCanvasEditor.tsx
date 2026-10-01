"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import LocationCanvasElementContent from "@/app/components/LocationCanvasElementContent";
import NumberLineSettings from "./NumberLineSettings";
import { ALGEBRA_TILE_OPTIONS, EMPTY_CANVAS_ALGEBRA_TILE_COUNTS, MAX_CANVAS_HEIGHT, MIN_CANVAS_HEIGHT, getCanvasAlgebraTile, getCanvasNumberLine, getCanvasShape, getCanvasTrackSizes, getDragDropItemHtml, getLocationBoxSize, getSingleLineChoiceBoxSize, getChoiceContentSizes, isEmptyChoice, makeDragDropId, normalizeCanvasHeight, type CanvasAlgebraTileCounts, type DragDropCanvasElement, type DragDropData, type DragDropZone } from "@/lib/dragDrop";
import { buildMathExpressionHtml, createEmptyMathExpression, readMathExpressionTree, type MathExpressionNode } from "@/lib/mathExpressionTree";
import CanvasInlineTextEditor from "./CanvasInlineTextEditor";
import MathExpressionComposer from "./MathExpressionComposer";
import RichTextEditor from "./RichTextEditor";
import TargetChoicePicker from "./TargetChoicePicker";
import TextScriptIcon from "./TextScriptIcon";
import { ACTIVE_TEXT_TOOLBAR_BUTTON } from "./textEditorToolbarStyles";
import { activateInlineScript, toggleTextBoxAtCaret } from "./richTextEditing";
import { expandCanvasUploadFiles } from "@/lib/pdfToImages";

export type LocationLibraryImage = { id?: string; url: string; path: string; label: string };

type Gesture = {
  kind: "target-resize" | "target" | "choices" | "choice-item" | "choice-item-resize" | "overlay-move" | "overlay-resize" | "element-move" | "element-resize" | "table-column" | "table-row" | "shape-draw";
  zoneId?: string;
  itemId?: string;
  elementId?: string;
  overlayId?: string;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth?: number;
  startHeight?: number;
  trackIndex?: number;
  startTracks?: number[];
  resizeEdge?: "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

type TableSelection = {
  elementId: string;
  anchorRow: number;
  anchorColumn: number;
  endRow: number;
  endColumn: number;
};

type EditingTableCell = { elementId: string; row: number; column: number };
type SnapGuides = { x: number | null; y: number | null };
type CanvasRect = { x: number; y: number; width: number; height: number };

const ALGEBRA_TILE_COUNT_FIELDS: Array<{ key: keyof CanvasAlgebraTileCounts; label: string }> = [
  { key: "positiveUnit", label: "+1" }, { key: "positiveX", label: "+x" }, { key: "positiveX2", label: "+x²" },
  { key: "negativeUnit", label: "−1" }, { key: "negativeX", label: "−x" }, { key: "negativeX2", label: "−x²" },
];
const EMPTY_ALGEBRA_TILE_COUNT_DRAFT = Object.fromEntries(Object.keys(EMPTY_CANVAS_ALGEBRA_TILE_COUNTS).map((key) => [key, "0"])) as Record<keyof CanvasAlgebraTileCounts, string>;
const CHOICE_GROUP_TOOLBAR_CLEARANCE_PX = 32;
const SAFE_ZONE_INSET_PERCENT = 5;
const SAFE_ZONE_END_PERCENT = 100 - SAFE_ZONE_INSET_PERCENT;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

const snapPosition = (start: number, size: number, lines: number[], threshold: number) => {
  let best: { start: number; guide: number; distance: number } | null = null;
  for (const offset of [0, size / 2, size]) {
    const position = start + offset;
    for (const line of lines) {
      const distance = Math.abs(position - line);
      if (distance <= threshold && (!best || distance < best.distance)) best = { start: line - offset, guide: line, distance };
    }
  }
  return best;
};

const snapLine = (position: number, lines: number[], threshold: number) => {
  let best: { position: number; distance: number } | null = null;
  for (const line of lines) {
    const distance = Math.abs(position - line);
    if (distance <= threshold && (!best || distance < best.distance)) best = { position: line, distance };
  }
  return best?.position ?? null;
};

export default function LocationCanvasEditor({ data, onChange, uploadedImages, itemPreviewUrls, onItemImageFileChange, onChooseItemImage, onRemoveItemImage, onUploadBackground, onDeleteUploadedImage, compositionOnly = false, choiceOnly = false, allowChoiceMarkers = true, choiceSelectionMode, isChoiceCorrect, choicePlaceholder = "Choice", choiceHtmlById = {}, onChoiceHtmlChange, onAddChoice, onRemoveChoice, renderChoiceEditorExtra, title = "Location canvas", description = "Drag and resize targets on a blank canvas, or add a diagram as the background.", overlayBlocks = [], onOverlayBoundsChange, onRemoveOverlay, toolbarActions }: {
  data: DragDropData;
  onChange: (value: DragDropData) => void;
  uploadedImages: LocationLibraryImage[];
  itemPreviewUrls: Record<string, string>;
  onItemImageFileChange: (itemId: string, file: File | null) => void;
  onChooseItemImage: (itemId: string, image: LocationLibraryImage) => void;
  onRemoveItemImage: (itemId: string) => void;
  onUploadBackground: (file: File) => Promise<{ url: string; path: string }>;
  onDeleteUploadedImage: (image: LocationLibraryImage & { id: string }) => void;
  compositionOnly?: boolean;
  choiceOnly?: boolean;
  allowChoiceMarkers?: boolean;
  choiceSelectionMode?: "single" | "multiple";
  isChoiceCorrect?: (itemId: string, index: number) => boolean;
  choicePlaceholder?: string;
  choiceHtmlById?: Record<string, string>;
  onChoiceHtmlChange?: (itemId: string, html: string) => void;
  onAddChoice?: () => void;
  onRemoveChoice?: (itemId: string, index: number) => void;
  renderChoiceEditorExtra?: (itemId: string, index: number) => ReactNode;
  title?: string;
  description?: string;
  overlayBlocks?: Array<{ id: string; label: string; bounds: CanvasRect; content: ReactNode; editor?: ReactNode; hideLabel?: boolean }>;
  onRemoveOverlay?: (id: string) => void;
  onOverlayBoundsChange?: (id: string, bounds: CanvasRect) => void;
  toolbarActions?: ReactNode;
}) {
  const canvasHeight = normalizeCanvasHeight(data.canvasHeight);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selectedChoiceRef = useRef<string | null>(null);
  const nudgeTargetRef = useRef<HTMLElement | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [selectedLibraryImages, setSelectedLibraryImages] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [showChoiceImages, setShowChoiceImages] = useState(false);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showAlgebraTileMenu, setShowAlgebraTileMenu] = useState(false);
  const [algebraTileSetCounts, setAlgebraTileSetCounts] = useState<Record<keyof CanvasAlgebraTileCounts, string>>({ ...EMPTY_ALGEBRA_TILE_COUNT_DRAFT });
  const [drawingShapeKind, setDrawingShapeKind] = useState<"line" | "arrow" | "circle" | "rectangle" | "triangle" | null>(null);
  const [drawingShapeThickness, setDrawingShapeThickness] = useState(3);
  const [tableSelection, setTableSelection] = useState<TableSelection | null>(null);
  const [editingTableCell, setEditingTableCell] = useState<EditingTableCell | null>(null);
  const [tableHorizontalAlign, setTableHorizontalAlign] = useState<"left" | "center" | "right">("center");
  const [tableInlineFormat, setTableInlineFormat] = useState({ subscript: false, superscript: false, textBox: false });
  const [tableMathPanel, setTableMathPanel] = useState<"editable" | null>(null);
  const [tableMathTree, setTableMathTree] = useState<MathExpressionNode>(() => createEmptyMathExpression());
  const [editingExistingTableMath, setEditingExistingTableMath] = useState(false);
  const tableTextRangeRef = useRef<Range | null>(null);
  const tableTextEditorRef = useRef<HTMLElement | null>(null);
  const tableEditingMathRef = useRef<Element | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({ x: null, y: null });
  const [uploading, setUploading] = useState(false);
  const gestureMovedRef = useRef(false);
  const measuredItems = data.items.map((item) => ({ ...item, html: choiceHtmlById[item.id] ?? item.contentHtml, imageUrl: itemPreviewUrls[item.id] || item.imageUrl }));
  const boxSize = choiceOnly ? getSingleLineChoiceBoxSize(measuredItems, { placeholder: choicePlaceholder, selectionMode: choiceSelectionMode }) : getLocationBoxSize(measuredItems, data.choiceSize);
  const boxCanvasStyle = { width: `${boxSize.width / 10}cqw`, height: `${boxSize.height / 10}cqw` };
  const choicesAreVertical = data.choiceBankDirection === "vertical";
  const choicesAreGrouped = data.choiceBankGrouped !== false;
  const choicePresentation = !choiceOnly || !allowChoiceMarkers ? "content" : data.choicePresentation || "content";
  const emptyChoice = (item: (typeof data.items)[number]) => isEmptyChoice({ ...item, html: choiceHtmlById[item.id] ?? item.contentHtml, imageUrl: itemPreviewUrls[item.id] || item.imageUrl });
  const allChoicesEmpty = choiceOnly && data.items.length > 0 && data.items.every(emptyChoice);
  const contentSizes = getChoiceContentSizes(measuredItems, { sameSize: data.choiceSameSize, canvasHeight, selectionMode: choiceSelectionMode });
  const contentSize = (item: (typeof data.items)[number]) => contentSizes[data.items.findIndex((current) => current.id === item.id)];
  const contentBoxStyle = (item: (typeof data.items)[number]) => choiceOnly
    ? { width: `${contentSize(item).width}cqw`, height: `${contentSize(item).height}cqw` }
    : boxCanvasStyle;
  const itemPercentSize = (item: (typeof data.items)[number]) => choicePresentation === "radio"
    ? { width: 3.2, height: 3.2 * 100 / canvasHeight }
    : choicePresentation === "box"
      ? { width: item.width ?? 6, height: item.height ?? 10.5 }
      : choiceOnly ? { width: contentSize(item).width, height: contentSize(item).height * 100 / canvasHeight }
      : { width: boxSize.width / 10, height: boxSize.height * 10 / canvasHeight };
  const sameSizeControl = choiceOnly && choicePresentation !== "radio" ? <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap rounded bg-white px-2 py-1 text-xs font-semibold text-blue-900 shadow" onPointerDown={(event) => event.stopPropagation()}>
    <input type="checkbox" checked={data.choiceSameSize === true} onChange={(event) => {
      const choiceSameSize = event.target.checked;
      const source = data.items.find((item) => item.id === editingItemId) || data.items[0];
      const size = itemPercentSize(source);
      onChange({ ...data, choiceSameSize, items: choiceSameSize ? data.items.map((item) => ({ ...item, width: size.width, height: size.height })) : data.items });
    }} />All boxes the same size
  </label> : null;
  const choiceText = (item: (typeof data.items)[number], index: number) => <span className={`pointer-events-none inline ${choiceOnly ? "w-full" : ""}`}>
    {choiceSelectionMode === "multiple" && <span aria-hidden="true" className={`absolute left-[0.8cqw] top-1/2 inline-flex h-[1.5cqw] w-[1.5cqw] -translate-y-1/2 items-center justify-center rounded-sm border text-[1.1cqw] font-bold leading-none ${isChoiceCorrect?.(item.id, index) ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-500 bg-white"}`}>{isChoiceCorrect?.(item.id, index) ? "✓" : ""}</span>}
    {(choiceHtmlById[item.id] || item.contentHtml)
      ? <span className="rich-text-content inline" dangerouslySetInnerHTML={{ __html: choiceHtmlById[item.id] || getDragDropItemHtml(item) }} />
      : item.content}
  </span>;
  const choiceVerticalClass = (item: (typeof data.items)[number]) => item.textVerticalAlign === "top" ? "justify-start" : item.textVerticalAlign === "bottom" ? "justify-end" : "justify-center";

  const updateZones = (zones: DragDropZone[]) => onChange({ ...data, zones });
  const updateZone = (zoneId: string, patch: Partial<DragDropZone>) => updateZones(data.zones.map((zone) => zone.id === zoneId ? { ...zone, ...patch } : zone));
  const updateElements = (canvasElements: DragDropCanvasElement[]) => onChange({ ...data, canvasElements });
  const updateElement = (elementId: string, patch: Partial<DragDropCanvasElement>) => updateElements((data.canvasElements || []).map((element) => element.id === elementId ? { ...element, ...patch } : element));
  const nudgeAsset = (event: KeyboardEvent<HTMLDivElement>) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if ((!direction && event.key !== "Delete" && event.key !== "Backspace") || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"]'))) return;
    const asset = nudgeTargetRef.current;
    const canvas = canvasRef.current;
    if (!asset || !canvas || !canvas.contains(asset)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      const kind = asset.dataset.nudgeKind;
      const id = asset.dataset.nudgeId;
      if (kind === "element") {
        updateElements((data.canvasElements || []).filter(element => element.id !== id));
      } else if (kind === "zone") {
        updateZones(data.zones.filter(zone => zone.id !== id));
      } else if (kind === "overlay") {
        if (!id || !onRemoveOverlay) return;
        onRemoveOverlay(id);
      } else if (kind === "item" || kind === "choices") {
        const selectedId = kind === "item" ? id : selectedChoiceRef.current;
        const removed = data.items.map((item, index) => ({ item, index })).filter(({ item }) => !selectedId || item.id === selectedId);
        if (onRemoveChoice) {
          // Reverse indices keep answer keys and image arrays aligned when deleting a group.
          removed.reverse().forEach(({ item, index }) => onRemoveChoice(item.id, index));
        } else {
          const ids = new Set(removed.map(({ item }) => item.id));
          onChange({ ...data, items: data.items.filter(item => !ids.has(item.id)), zones: data.zones.map(zone => ({ ...zone, correctItemIds: zone.correctItemIds.filter(itemId => !ids.has(itemId)) })) });
        }
      } else return;
      event.preventDefault();
      event.stopPropagation();
      nudgeTargetRef.current = null;
      selectedChoiceRef.current = null;
      setEditingElementId(null);
      setEditingItemId(null);
      setEditingZoneId(null);
      setEditingOverlayId(null);
      setEditingTextId(null);
      setTableSelection(null);
      setEditingTableCell(null);
      canvas.focus({ preventScroll: true });
      return;
    }
    if (!direction) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const assetBounds = asset.getBoundingClientRect();
    const width = assetBounds.width / bounds.width * 100;
    const height = assetBounds.height / bounds.height * 100;
    const move = (x: number, y: number) => ({
      x: clamp(x + direction[0] * 100 / bounds.width, 0, Math.max(0, 100 - width)),
      y: clamp(y + direction[1] * 100 / bounds.height, 0, Math.max(0, 100 - height)),
    });
    const id = asset.dataset.nudgeId;
    const kind = asset.dataset.nudgeKind;
    if (kind === "element") {
      const element = data.canvasElements?.find((entry) => entry.id === id);
      if (!element) return;
      updateElement(element.id, move(element.x, element.y));
    } else if (kind === "overlay") {
      const overlay = overlayBlocks.find((entry) => entry.id === id);
      if (!overlay || !onOverlayBoundsChange) return;
      onOverlayBoundsChange(overlay.id, { ...overlay.bounds, ...move(overlay.bounds.x, overlay.bounds.y) });
    } else if (kind === "zone") {
      const zone = data.zones.find((entry) => entry.id === id);
      if (!zone) return;
      updateZone(zone.id, move(zone.x ?? 10, zone.y ?? 10));
    } else if (kind === "item") {
      onChange({ ...data, items: data.items.map((item) => item.id === id ? { ...item, ...move(item.x ?? 8, item.y ?? 35) } : item) });
    } else if (kind === "choices") {
      const next = move(data.choiceBankX ?? 8, Math.max(data.choiceBankY ?? 6, CHOICE_GROUP_TOOLBAR_CLEARANCE_PX / bounds.height * 100));
      onChange({ ...data, choiceBankX: next.x, choiceBankY: next.y });
    } else return;
    event.preventDefault();
    event.stopPropagation();
    setSnapGuides({ x: null, y: null });
  };
  const addChoice = () => {
    const item = { id: makeDragDropId(), content: "", x: 8, y: 35 + data.items.length * 12 };
    onChange({ ...data, items: [...data.items, item] });
    setEditingItemId(item.id);
    setShowChoiceImages(false);
  };
  const ungroupChoices = () => {
    let offset = 0;
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const renderedChoices = canvasRef.current?.querySelectorAll<HTMLElement>("[data-choice-bank] [data-choice-item-id]");
    const items = data.items.map((item, index) => {
      const size = itemPercentSize(item);
      const bounds = renderedChoices?.[index]?.getBoundingClientRect();
      const positioned = bounds && canvasBounds?.width && canvasBounds.height
        ? { ...item, x: (bounds.left - canvasBounds.left) / canvasBounds.width * 100, y: (bounds.top - canvasBounds.top) / canvasBounds.height * 100 }
        : { ...item, x: (data.choiceBankX ?? 8) + (choicesAreVertical ? 0 : offset), y: (data.choiceBankY ?? 6) + (choicesAreVertical ? offset : 0) };
      offset += (choicesAreVertical ? size.height : size.width) + 0.8;
      return positioned;
    });
    onChange({ ...data, choiceBankGrouped: false, items });
  };
  const beginChoiceItemGesture = (event: PointerEvent<HTMLElement>, item: (typeof data.items)[number]) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setEditingItemId(null);
    setEditingElementId(null);
    setEditingZoneId(null);
    setSnapGuides({ x: null, y: null });
    setGesture({ kind: "choice-item", itemId: item.id, startX: event.clientX, startY: event.clientY, startLeft: item.x ?? 8, startTop: item.y ?? 35 });
  };
  const beginChoiceItemResize = (event: PointerEvent<HTMLElement>, item: (typeof data.items)[number], resizeEdge: NonNullable<Gesture["resizeEdge"]>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const size = itemPercentSize(item);
    gestureMovedRef.current = true;
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const itemBounds = event.currentTarget.parentElement?.getBoundingClientRect();
    const startLeft = choicesAreGrouped && itemBounds && canvasBounds?.width ? (itemBounds.left - canvasBounds.left) / canvasBounds.width * 100 : item.x ?? 8;
    const startTop = choicesAreGrouped && itemBounds && canvasBounds?.height ? (itemBounds.top - canvasBounds.top) / canvasBounds.height * 100 : item.y ?? 35;
    setGesture({ kind: "choice-item-resize", itemId: item.id, resizeEdge, startX: event.clientX, startY: event.clientY, startLeft, startTop, startWidth: size.width, startHeight: size.height });
  };
  const addTarget = () => {
    const index = data.zones.length;
    const zone: DragDropZone = data.preset === "category-canvas" ? { id: makeDragDropId(), label: `Category ${index + 1}`, correctItemIds: [], capacity: null, x: 5, y: 45, width: 43, height: 40 } : { id: makeDragDropId(), label: `Target ${index + 1}`, correctItemIds: [], capacity: 1, x: 10 + (index % 4) * 18, y: 12 + (index % 3) * 20, width: 16, height: 14 };
    updateZones([...data.zones, zone]);
    setEditingZoneId(zone.id);
  };

  const getChoiceBankRect = (): CanvasRect => {
    const sizes = data.items.map(itemPercentSize);
    const bankWidth = choicesAreVertical ? Math.max(0, ...sizes.map((size) => size.width)) : sizes.reduce((sum, size) => sum + size.width, 0) + Math.max(0, sizes.length - 1) * 0.8;
    const bankHeight = choicesAreVertical ? sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, sizes.length - 1) * 0.8 : Math.max(0, ...sizes.map((size) => size.height));
    return {
      x: data.choiceBankX ?? 8,
      y: data.choiceBankY ?? 6,
      width: Math.min(100, bankWidth),
      height: Math.min(100, bankHeight),
    };
  };

  const getSnapLines = (bounds: DOMRect, excluded: { elementId?: string; zoneId?: string; itemId?: string; choices?: boolean } = {}) => {
    const targetWidth = boxSize.width / 10;
    const targetHeight = ((boxSize.height / 1000) * bounds.width / bounds.height) * 100;
    const rects: CanvasRect[] = [
      ...(data.canvasElements || []).filter((element) => element.id !== excluded.elementId).map(({ x, y, width, height }) => ({ x, y, width, height })),
      ...data.zones.filter((zone) => zone.id !== excluded.zoneId).map((zone) => ({ x: zone.x ?? 10, y: zone.y ?? 10, width: data.preset === "category-canvas" ? zone.width ?? 43 : targetWidth, height: data.preset === "category-canvas" ? zone.height ?? 40 : targetHeight })),
      ...(!excluded.choices && data.items.length
        ? choicesAreGrouped
          ? [getChoiceBankRect()]
          : data.items.filter(item => item.id !== excluded.itemId).map(item => ({ x: item.x ?? 8, y: item.y ?? 35, ...itemPercentSize(item) }))
        : []),
      ...overlayBlocks.filter((overlay) => overlay.id !== editingOverlayId).map((overlay) => overlay.bounds),
    ];
    return {
      x: [0, SAFE_ZONE_INSET_PERCENT, 50, SAFE_ZONE_END_PERCENT, 100, ...rects.flatMap((rect) => [rect.x, rect.x + rect.width / 2, rect.x + rect.width])],
      y: [0, SAFE_ZONE_INSET_PERCENT, 50, SAFE_ZONE_END_PERCENT, 100, ...rects.flatMap((rect) => [rect.y, rect.y + rect.height / 2, rect.y + rect.height])],
    };
  };

  const beginGesture = (event: PointerEvent<HTMLElement>, zone: DragDropZone) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setEditingItemId(null);
    setEditingElementId(null);
    setTableSelection(null);
    setEditingTableCell(null);
    setSnapGuides({ x: null, y: null });
    setGesture({ kind: "target", zoneId: zone.id, startX: event.clientX, startY: event.clientY, startLeft: zone.x ?? 10, startTop: zone.y ?? 10 });
  };
  const beginChoiceGesture = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setEditingItemId(null);
    setEditingElementId(null);
    setEditingZoneId(null);
    setTableSelection(null);
    setEditingTableCell(null);
    setSnapGuides({ x: null, y: null });
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const groupBounds = event.currentTarget.closest<HTMLElement>("[data-choice-bank]")?.getBoundingClientRect();
    const renderedTop = canvasBounds && groupBounds
      ? ((groupBounds.top - canvasBounds.top) / canvasBounds.height) * 100
      : data.choiceBankY ?? 6;
    setGesture({ kind: "choices", startX: event.clientX, startY: event.clientY, startLeft: data.choiceBankX ?? 8, startTop: renderedTop });
  };
  const beginElementGesture = (event: PointerEvent<HTMLElement>, element: DragDropCanvasElement, kind: "element-move" | "element-resize", resizeEdge?: Gesture["resizeEdge"], preserveDefault = false) => {
    if (!preserveDefault) event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setEditingItemId(null);
    setEditingZoneId(null);
    setEditingTableCell(null);
    setSnapGuides({ x: null, y: null });
    if (editingElementId && editingElementId !== element.id) {
      setEditingElementId(null);
      setTableSelection(null);
    }
    setGesture({ kind, elementId: element.id, startX: event.clientX, startY: event.clientY, startLeft: element.x, startTop: element.y, startWidth: element.width, startHeight: element.height, resizeEdge });
  };
  const beginOverlayGesture = (event: PointerEvent<HTMLElement>, overlay: (typeof overlayBlocks)[number], kind: "overlay-move" | "overlay-resize", resizeEdge?: Gesture["resizeEdge"]) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    setEditingOverlayId(overlay.id);
    setEditingElementId(null);
    setEditingItemId(null);
    setEditingZoneId(null);
    setSnapGuides({ x: null, y: null });
    setGesture({ kind, overlayId: overlay.id, startX: event.clientX, startY: event.clientY, startLeft: overlay.bounds.x, startTop: overlay.bounds.y, startWidth: overlay.bounds.width, startHeight: overlay.bounds.height, resizeEdge });
  };
  const beginTableTrackGesture = (event: PointerEvent<HTMLElement>, element: DragDropCanvasElement, kind: "table-column" | "table-row", trackIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureMovedRef.current = false;
    const count = kind === "table-column" ? element.columns || 2 : element.rows || 2;
    const tracks = getCanvasTrackSizes(count, kind === "table-column" ? element.columnWidths : element.rowHeights);
    setGesture({ kind, elementId: element.id, trackIndex, startTracks: tracks, startX: event.clientX, startY: event.clientY, startLeft: element.x, startTop: element.y, startWidth: element.width, startHeight: element.height });
  };
  const beginShapeDraw = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawingShapeKind || !canvasRef.current || (event.target instanceof Element && event.target.closest("[data-canvas-object]"))) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = canvasRef.current.getBoundingClientRect();
    const rawX = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const rawY = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);
    const lines = getSnapLines(bounds);
    const snappedX = snapLine(rawX, lines.x, (7 / bounds.width) * 100);
    const snappedY = snapLine(rawY, lines.y, (7 / bounds.height) * 100);
    const x = snappedX ?? rawX;
    const y = snappedY ?? rawY;
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "shape", shape: { kind: drawingShapeKind, thickness: drawingShapeThickness, lineAxis: "horizontal", lineDirection: "descending" }, x, y, width: 1, height: 1 };
    updateElements([...(data.canvasElements || []), element]);
    gestureMovedRef.current = false;
    setEditingElementId(null);
    setEditingItemId(null);
    setEditingZoneId(null);
    setTableSelection(null);
    setEditingTableCell(null);
    setSnapGuides({ x: snappedX, y: snappedY });
    setGesture({ kind: "shape-draw", elementId: element.id, startX: event.clientX, startY: event.clientY, startLeft: x, startTop: y, startWidth: 1, startHeight: 1 });
  };
  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const deltaX = ((event.clientX - gesture.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - gesture.startY) / bounds.height) * 100;
    if (Math.abs(event.clientX - gesture.startX) > 3 || Math.abs(event.clientY - gesture.startY) > 3) {
      gestureMovedRef.current = true;
      if (gesture.kind === "target") setEditingZoneId(null);
    }
    if (gesture.kind === "shape-draw" && gesture.elementId) {
      const rawCurrentX = clamp(gesture.startLeft + deltaX, 0, 100);
      const rawCurrentY = clamp(gesture.startTop + deltaY, 0, 100);
      const lines = getSnapLines(bounds, { elementId: gesture.elementId });
      const snappedCurrentX = snapLine(rawCurrentX, lines.x, (7 / bounds.width) * 100);
      const snappedCurrentY = snapLine(rawCurrentY, lines.y, (7 / bounds.height) * 100);
      const currentX = snappedCurrentX ?? rawCurrentX;
      const currentY = snappedCurrentY ?? rawCurrentY;
      setSnapGuides({ x: snappedCurrentX, y: snappedCurrentY });
      const currentElement = (data.canvasElements || []).find((element) => element.id === gesture.elementId);
      const pixelDeltaX = event.clientX - gesture.startX;
      const pixelDeltaY = event.clientY - gesture.startY;
      const lineAxis = Math.abs(pixelDeltaX) <= 5 ? "vertical" : Math.abs(pixelDeltaY) <= 5 ? "horizontal" : "diagonal";
      const lineWidth = lineAxis === "vertical" ? Math.max(0.5, (8 / bounds.width) * 100) : Math.max(0.5, Math.abs(currentX - gesture.startLeft));
      const lineHeight = lineAxis === "horizontal" ? Math.max(0.5, (8 / bounds.height) * 100) : Math.max(0.5, Math.abs(currentY - gesture.startTop));
      const isLinear = currentElement?.shape?.kind === "line" || currentElement?.shape?.kind === "arrow";
      updateElement(gesture.elementId, {
        x: isLinear && lineAxis === "vertical" ? clamp(gesture.startLeft - lineWidth / 2, 0, 100 - lineWidth) : Math.min(gesture.startLeft, currentX),
        y: isLinear && lineAxis === "horizontal" ? clamp(gesture.startTop - lineHeight / 2, 0, 100 - lineHeight) : Math.min(gesture.startTop, currentY),
        width: isLinear ? lineWidth : Math.max(0.5, Math.abs(currentX - gesture.startLeft)),
        height: isLinear ? lineHeight : Math.max(0.5, Math.abs(currentY - gesture.startTop)),
        shape: isLinear ? { ...getCanvasShape(currentElement), lineAxis, lineDirection: deltaX * deltaY >= 0 ? "descending" : "ascending", arrowDirection: (lineAxis === "vertical" ? deltaY : deltaX) < 0 ? "reverse" : "forward" } : currentElement?.shape,
      });
      return;
    }
    if ((gesture.kind === "overlay-move" || gesture.kind === "overlay-resize") && gesture.overlayId) {
      const width = gesture.startWidth || 20;
      const height = gesture.startHeight || 20;
      let next: CanvasRect = { x: gesture.startLeft, y: gesture.startTop, width, height };
      if (gesture.kind === "overlay-move") {
        const lines = getSnapLines(bounds);
        const snapX = snapPosition(gesture.startLeft + deltaX, width, lines.x, (7 / bounds.width) * 100);
        const snapY = snapPosition(gesture.startTop + deltaY, height, lines.y, (7 / bounds.height) * 100);
        setSnapGuides({ x: snapX?.guide ?? null, y: snapY?.guide ?? null });
        next = { ...next, x: clamp(snapX?.start ?? gesture.startLeft + deltaX, 0, 100 - width), y: clamp(snapY?.start ?? gesture.startTop + deltaY, 0, 100 - height) };
      } else {
        const left = gesture.resizeEdge?.includes("left");
        const right = gesture.resizeEdge?.includes("right");
        const top = gesture.resizeEdge?.includes("top");
        const bottom = gesture.resizeEdge?.includes("bottom");
        const lines = getSnapLines(bounds);
        const xThreshold = (7 / bounds.width) * 100;
        const yThreshold = (7 / bounds.height) * 100;
        let guideX: number | null = null;
        let guideY: number | null = null;
        if (left) {
          const proposedLeft = clamp(gesture.startLeft + deltaX, 0, gesture.startLeft + width - 5);
          const snappedLeft = snapLine(proposedLeft, lines.x, xThreshold);
          next.x = snappedLeft !== null && snappedLeft <= gesture.startLeft + width - 5 ? snappedLeft : proposedLeft;
          next.width = width + gesture.startLeft - next.x;
          guideX = next.x === snappedLeft ? snappedLeft : null;
        }
        if (right) {
          const proposedRight = gesture.startLeft + clamp(width + deltaX, 5, 100 - gesture.startLeft);
          const snappedRight = snapLine(proposedRight, lines.x, xThreshold);
          const nextRight = snappedRight !== null && snappedRight >= gesture.startLeft + 5 ? snappedRight : proposedRight;
          next.width = nextRight - gesture.startLeft;
          guideX = nextRight === snappedRight ? snappedRight : null;
        }
        if (top) {
          const proposedTop = clamp(gesture.startTop + deltaY, 0, gesture.startTop + height - 5);
          const snappedTop = snapLine(proposedTop, lines.y, yThreshold);
          next.y = snappedTop !== null && snappedTop <= gesture.startTop + height - 5 ? snappedTop : proposedTop;
          next.height = height + gesture.startTop - next.y;
          guideY = next.y === snappedTop ? snappedTop : null;
        }
        if (bottom) {
          const proposedBottom = gesture.startTop + clamp(height + deltaY, 5, 100 - gesture.startTop);
          const snappedBottom = snapLine(proposedBottom, lines.y, yThreshold);
          const nextBottom = snappedBottom !== null && snappedBottom >= gesture.startTop + 5 ? snappedBottom : proposedBottom;
          next.height = nextBottom - gesture.startTop;
          guideY = nextBottom === snappedBottom ? snappedBottom : null;
        }
        setSnapGuides({ x: guideX, y: guideY });
      }
      onOverlayBoundsChange?.(gesture.overlayId, next);
      return;
    }
    if (gesture.kind === "choices") {
      const bank = getChoiceBankRect();
      const minimumTop = (CHOICE_GROUP_TOOLBAR_CLEARANCE_PX / bounds.height) * 100;
      const maximumTop = Math.max(minimumTop, 100 - bank.height);
      const lines = getSnapLines(bounds, { choices: true });
      const snapX = snapPosition(gesture.startLeft + deltaX, bank.width, lines.x, (7 / bounds.width) * 100);
      const snapY = snapPosition(gesture.startTop + deltaY, bank.height, lines.y, (7 / bounds.height) * 100);
      setSnapGuides({ x: snapX?.guide ?? null, y: snapY?.guide ?? null });
      onChange({
        ...data,
        choiceBankX: clamp(snapX?.start ?? gesture.startLeft + deltaX, 0, Math.max(0, 100 - bank.width)),
        choiceBankY: clamp(snapY?.start ?? gesture.startTop + deltaY, minimumTop, maximumTop),
      });
      return;
    }
    if (gesture.kind === "choice-item" && gesture.itemId) {
      const currentItem = data.items.find((item) => item.id === gesture.itemId);
      if (!currentItem) return;
      const size = itemPercentSize(currentItem);
      const width = size.width;
      const height = size.height;
      const lines = getSnapLines(bounds, { itemId: gesture.itemId });
      const snapX = snapPosition(gesture.startLeft + deltaX, width, lines.x, (7 / bounds.width) * 100);
      const snapY = snapPosition(gesture.startTop + deltaY, height, lines.y, (7 / bounds.height) * 100);
      setSnapGuides({ x: snapX?.guide ?? null, y: snapY?.guide ?? null });
      onChange({ ...data, items: data.items.map((item) => item.id === gesture.itemId ? {
        ...item,
        x: clamp(snapX?.start ?? gesture.startLeft + deltaX, 0, Math.max(0, 100 - width)),
        y: clamp(snapY?.start ?? gesture.startTop + deltaY, 0, Math.max(0, 100 - height)),
      } : item) });
      return;
    }
    if (gesture.kind === "choice-item-resize" && gesture.itemId) {
      const width = gesture.startWidth || 6;
      const height = gesture.startHeight || 10.5;
      const left = gesture.resizeEdge?.includes("left");
      const right = gesture.resizeEdge?.includes("right");
      const top = gesture.resizeEdge?.includes("top");
      const bottom = gesture.resizeEdge?.includes("bottom");
      let x = gesture.startLeft;
      let y = gesture.startTop;
      let nextWidth = width;
      let nextHeight = height;
      const lines = getSnapLines(bounds, { itemId: gesture.itemId });
      const xThreshold = (7 / bounds.width) * 100;
      const yThreshold = (7 / bounds.height) * 100;
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (left) {
        const proposedLeft = clamp(gesture.startLeft + deltaX, 0, gesture.startLeft + width - 2);
        const snappedLeft = snapLine(proposedLeft, lines.x, xThreshold);
        x = snappedLeft !== null && snappedLeft <= gesture.startLeft + width - 2 ? snappedLeft : proposedLeft;
        nextWidth = width + gesture.startLeft - x;
        guideX = x === snappedLeft ? snappedLeft : null;
      }
      if (right) {
        const proposedRight = gesture.startLeft + clamp(width + deltaX, 2, 100 - gesture.startLeft);
        const snappedRight = snapLine(proposedRight, lines.x, xThreshold);
        const nextRight = snappedRight !== null && snappedRight >= gesture.startLeft + 2 ? snappedRight : proposedRight;
        nextWidth = nextRight - gesture.startLeft;
        guideX = nextRight === snappedRight ? snappedRight : null;
      }
      if (top) {
        const proposedTop = clamp(gesture.startTop + deltaY, 0, gesture.startTop + height - 3);
        const snappedTop = snapLine(proposedTop, lines.y, yThreshold);
        y = snappedTop !== null && snappedTop <= gesture.startTop + height - 3 ? snappedTop : proposedTop;
        nextHeight = height + gesture.startTop - y;
        guideY = y === snappedTop ? snappedTop : null;
      }
      if (bottom) {
        const proposedBottom = gesture.startTop + clamp(height + deltaY, 3, 100 - gesture.startTop);
        const snappedBottom = snapLine(proposedBottom, lines.y, yThreshold);
        const nextBottom = snappedBottom !== null && snappedBottom >= gesture.startTop + 3 ? snappedBottom : proposedBottom;
        nextHeight = nextBottom - gesture.startTop;
        guideY = nextBottom === snappedBottom ? snappedBottom : null;
      }
      setSnapGuides({ x: guideX, y: guideY });
      onChange({ ...data, ...(!choiceOnly ? { choiceSize: { width: nextWidth * 10, height: nextHeight * canvasHeight / 10 } } : {}), items: data.items.map((item) => item.id === gesture.itemId ? { ...item, x, y, width: nextWidth, height: nextHeight } : allChoicesEmpty && data.choiceSameSize ? { ...item, width: nextWidth, height: nextHeight } : item) });
      return;
    }
    if ((gesture.kind === "element-move" || gesture.kind === "element-resize") && gesture.elementId) {
      if (gesture.kind === "element-move") {
        const width = gesture.startWidth || 20;
        const height = gesture.startHeight || 20;
        const lines = getSnapLines(bounds, { elementId: gesture.elementId });
        const snapX = snapPosition(gesture.startLeft + deltaX, width, lines.x, (7 / bounds.width) * 100);
        const snapY = snapPosition(gesture.startTop + deltaY, height, lines.y, (7 / bounds.height) * 100);
        setSnapGuides({ x: snapX?.guide ?? null, y: snapY?.guide ?? null });
        updateElement(gesture.elementId, {
          x: clamp(snapX?.start ?? gesture.startLeft + deltaX, 0, Math.max(0, 100 - width)),
          y: clamp(snapY?.start ?? gesture.startTop + deltaY, 0, Math.max(0, 100 - height)),
        });
      } else {
        const startWidth = gesture.startWidth || 20;
        const startHeight = gesture.startHeight || 20;
        const resizingElement = (data.canvasElements || []).find((element) => element.id === gesture.elementId);
        const resizingTile = resizingElement?.type === "algebra-tile" ? getCanvasAlgebraTile(resizingElement) : null;
        const compactAlgebraTile = resizingTile && resizingTile.kind !== "group" && resizingTile.kind !== "legend";
        const minimumWidth = compactAlgebraTile ? 0.8 : 5;
        const minimumHeight = compactAlgebraTile ? 1.4 : 5;
        const resizeFromLeft = gesture.resizeEdge?.includes("left");
        const resizeFromRight = gesture.resizeEdge?.includes("right");
        const resizeFromTop = gesture.resizeEdge?.includes("top");
        const resizeFromBottom = gesture.resizeEdge?.includes("bottom");
        const patch: Partial<DragDropCanvasElement> = {};
        const lines = getSnapLines(bounds, { elementId: gesture.elementId });
        let guideX: number | null = null;
        let guideY: number | null = null;
        if (resizeFromLeft) {
          const proposedX = clamp(gesture.startLeft + deltaX, 0, gesture.startLeft + startWidth - minimumWidth);
          const snappedX = snapLine(proposedX, lines.x, (7 / bounds.width) * 100);
          const x = snappedX !== null && snappedX <= gesture.startLeft + startWidth - minimumWidth ? snappedX : proposedX;
          guideX = x === snappedX ? snappedX : null;
          patch.x = x;
          patch.width = startWidth + gesture.startLeft - x;
        } else if (resizeFromRight) {
          const proposedRight = gesture.startLeft + clamp(startWidth + deltaX, minimumWidth, 100 - gesture.startLeft);
          const snappedRight = snapLine(proposedRight, lines.x, (7 / bounds.width) * 100);
          const right = snappedRight !== null && snappedRight >= gesture.startLeft + minimumWidth ? snappedRight : proposedRight;
          guideX = right === snappedRight ? snappedRight : null;
          patch.width = right - gesture.startLeft;
        }
        if (resizeFromTop) {
          const proposedY = clamp(gesture.startTop + deltaY, 0, gesture.startTop + startHeight - minimumHeight);
          const snappedY = snapLine(proposedY, lines.y, (7 / bounds.height) * 100);
          const y = snappedY !== null && snappedY <= gesture.startTop + startHeight - minimumHeight ? snappedY : proposedY;
          guideY = y === snappedY ? snappedY : null;
          patch.y = y;
          patch.height = startHeight + gesture.startTop - y;
        } else if (resizeFromBottom) {
          const proposedBottom = gesture.startTop + clamp(startHeight + deltaY, minimumHeight, 100 - gesture.startTop);
          const snappedBottom = snapLine(proposedBottom, lines.y, (7 / bounds.height) * 100);
          const bottom = snappedBottom !== null && snappedBottom >= gesture.startTop + minimumHeight ? snappedBottom : proposedBottom;
          guideY = bottom === snappedBottom ? snappedBottom : null;
          patch.height = bottom - gesture.startTop;
        }
        if (gesture.resizeEdge) {
          setSnapGuides({ x: guideX, y: guideY });
          updateElement(gesture.elementId, patch);
        } else {
          const proposedRight = gesture.startLeft + clamp(startWidth + deltaX, 5, 100 - gesture.startLeft);
          const proposedBottom = gesture.startTop + clamp(startHeight + deltaY, 5, 100 - gesture.startTop);
          const snappedRight = snapLine(proposedRight, lines.x, (7 / bounds.width) * 100);
          const snappedBottom = snapLine(proposedBottom, lines.y, (7 / bounds.height) * 100);
          const right = snappedRight !== null && snappedRight >= gesture.startLeft + 5 ? snappedRight : proposedRight;
          const bottom = snappedBottom !== null && snappedBottom >= gesture.startTop + 5 ? snappedBottom : proposedBottom;
          setSnapGuides({ x: right === snappedRight ? snappedRight : null, y: bottom === snappedBottom ? snappedBottom : null });
          updateElement(gesture.elementId, { width: right - gesture.startLeft, height: bottom - gesture.startTop });
        }
      }
      return;
    }
    if ((gesture.kind === "table-column" || gesture.kind === "table-row") && gesture.elementId && gesture.trackIndex !== undefined && gesture.startTracks) {
      const tracks = [...gesture.startTracks];
      const first = gesture.trackIndex;
      const pairTotal = tracks[first] + tracks[first + 1];
      const elementPixelSize = gesture.kind === "table-column"
        ? bounds.width * (gesture.startWidth || 1) / 100
        : bounds.height * (gesture.startHeight || 1) / 100;
      const pixelDelta = gesture.kind === "table-column" ? event.clientX - gesture.startX : event.clientY - gesture.startY;
      tracks[first] = clamp(tracks[first] + (pixelDelta / elementPixelSize) * 100, 5, pairTotal - 5);
      tracks[first + 1] = pairTotal - tracks[first];
      updateElement(gesture.elementId, gesture.kind === "table-column" ? { columnWidths: tracks } : { rowHeights: tracks });
      return;
    }
    if (!gesture.zoneId) return;
    const movingZone = data.zones.find(zone => zone.id === gesture.zoneId);
    const targetHeightPercent = data.preset === "category-canvas" ? movingZone?.height ?? 40 : ((boxSize.height / 1000) * bounds.width / bounds.height) * 100;
    const targetWidthPercent = data.preset === "category-canvas" ? movingZone?.width ?? 43 : boxSize.width / 10;
    if (gesture.kind === "target-resize") {
      updateZone(gesture.zoneId, { width: clamp((gesture.startWidth ?? 43) + deltaX, 10, 100 - gesture.startLeft), height: clamp((gesture.startHeight ?? 40) + deltaY, 10, 100 - gesture.startTop) });
      return;
    }
    const lines = getSnapLines(bounds, { zoneId: gesture.zoneId });
    const snapX = snapPosition(gesture.startLeft + deltaX, targetWidthPercent, lines.x, (7 / bounds.width) * 100);
    const snapY = snapPosition(gesture.startTop + deltaY, targetHeightPercent, lines.y, (7 / bounds.height) * 100);
    setSnapGuides({ x: snapX?.guide ?? null, y: snapY?.guide ?? null });
    updateZone(gesture.zoneId, {
      x: clamp(snapX?.start ?? gesture.startLeft + deltaX, 0, Math.max(0, 100 - targetWidthPercent)),
      y: clamp(snapY?.start ?? gesture.startTop + deltaY, 0, Math.max(0, 100 - targetHeightPercent)),
    });
  };
  const addTextBox = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "text", text: "Enter text", textHtml: "Enter text", fontSize: 22, verticalAlign: "top", x: 8, y: 35, width: 36, height: 20 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const addTable = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "table", rows: 2, columns: 2, cells: [["", ""], ["", ""]], cellHtml: [["", ""], ["", ""]], cellVerticalAlign: [["middle", "middle"], ["middle", "middle"]], fontSize: 16, columnWidths: [50, 50], rowHeights: [50, 50], showBorders: true, x: 22, y: 32, width: 52, height: 34 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const addNumberLine = () => {
    const element: DragDropCanvasElement = { id: makeDragDropId(), type: "number-line", numberLine: { min: -2, max: 2, divisions: 16, increment: 0.25, labelEvery: 4, showLabels: true, showArrows: true, extendArrowsPastTicks: false, points: [] }, x: 9, y: 35, width: 82, height: 24 };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
  };
  const addAlgebraTile = (kind: "unit" | "x" | "x2" | "legend", sign: "positive" | "negative" = "positive") => {
    const existingCount = (data.canvasElements || []).filter((element) => element.type === "algebra-tile").length;
    const dimensions = kind === "unit"
      ? { width: 1.3, height: 2.32 }
      : kind === "x"
        ? { width: 1.3, height: 7.12 }
        : kind === "x2"
          ? { width: 4, height: 7.12 }
          : { width: 34, height: 27 };
    const element: DragDropCanvasElement = {
      id: makeDragDropId(),
      type: "algebra-tile",
      algebraTile: { kind, sign },
      x: 10 + (existingCount % 6) * 6,
      y: 22 + (existingCount % 5) * 5,
      ...dimensions,
    };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
    setShowAlgebraTileMenu(false);
    setShowShapeMenu(false);
    setDrawingShapeKind(null);
  };
  const addAlgebraTileSet = () => {
    const counts = Object.fromEntries(ALGEBRA_TILE_COUNT_FIELDS.map(({ key }) => [key, Math.max(0, Math.min(30, Math.trunc(Number(algebraTileSetCounts[key]) || 0))) ])) as unknown as CanvasAlgebraTileCounts;
    if (!Object.values(counts).some((count) => count > 0)) return;
    const existingCount = (data.canvasElements || []).filter((element) => element.type === "algebra-tile").length;
    const element: DragDropCanvasElement = {
      id: makeDragDropId(),
      type: "algebra-tile",
      algebraTile: { kind: "group", sign: "positive", counts },
      x: 10 + (existingCount % 4) * 5,
      y: 24 + (existingCount % 4) * 5,
      width: 42,
      height: 28,
    };
    updateElements([...(data.canvasElements || []), element]);
    setEditingElementId(element.id);
    setShowAlgebraTileMenu(false);
    setAlgebraTileSetCounts({ ...EMPTY_ALGEBRA_TILE_COUNT_DRAFT });
  };
  const finishGesture = () => {
    // Pointer capture can retarget clicks originating inside an SVG. Open the
    // number-line controls on pointer release as well, without treating drags as clicks.
    if (gesture?.kind === "element-move" && !gestureMovedRef.current && data.canvasElements?.some(element => element.id === gesture.elementId && element.type === "number-line")) {
      setEditingElementId(gesture.elementId || null);
    }
    if (gesture?.kind === "shape-draw") {
      if (!gestureMovedRef.current && gesture.elementId) {
        updateElements((data.canvasElements || []).filter((element) => element.id !== gesture.elementId));
        setEditingElementId(null);
      } else {
        setEditingElementId(gesture.elementId || null);
        setDrawingShapeKind(null);
        setShowShapeMenu(false);
      }
    }
    setGesture(null);
    setSnapGuides({ x: null, y: null });
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
      width: 38,
      height: 38,
    }))]);
  };
  const uploadCanvasFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const uploadFiles = await expandCanvasUploadFiles(files);
      const images = await Promise.all(uploadFiles.map(onUploadBackground));
      addImageElements(images);
      setShowImages(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not add the selected images or PDF.");
    } finally {
      setUploading(false);
    }
  };
  const resizeTable = (element: DragDropCanvasElement, rows: number, columns: number) => updateElement(element.id, {
    rows,
    columns,
    cells: Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => element.cells?.[rowIndex]?.[columnIndex] || "")),
    cellHtml: Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => element.cellHtml?.[rowIndex]?.[columnIndex] || "")),
    cellVerticalAlign: Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => element.cellVerticalAlign?.[rowIndex]?.[columnIndex] || "middle")),
    rowHeights: getCanvasTrackSizes(rows, element.rowHeights),
    columnWidths: getCanvasTrackSizes(columns, element.columnWidths),
    mergedCells: (element.mergedCells || []).flatMap((merge) => {
      if (merge.row >= rows || merge.column >= columns) return [];
      const rowSpan = Math.min(merge.rowSpan, rows - merge.row);
      const columnSpan = Math.min(merge.columnSpan, columns - merge.column);
      return rowSpan > 1 || columnSpan > 1 ? [{ ...merge, rowSpan, columnSpan }] : [];
    }),
  });

  const selectTableCell = (elementId: string, row: number, column: number, extend: boolean) => setTableSelection((current) => extend && current?.elementId === elementId
    ? { ...current, endRow: row, endColumn: column }
    : { elementId, anchorRow: row, anchorColumn: column, endRow: row, endColumn: column });
  const getSelectedTableCells = (elementId: string) => {
    if (!tableSelection || tableSelection.elementId !== elementId) return [];
    const firstRow = Math.min(tableSelection.anchorRow, tableSelection.endRow);
    const lastRow = Math.max(tableSelection.anchorRow, tableSelection.endRow);
    const firstColumn = Math.min(tableSelection.anchorColumn, tableSelection.endColumn);
    const lastColumn = Math.max(tableSelection.anchorColumn, tableSelection.endColumn);
    return Array.from({ length: lastRow - firstRow + 1 }, (_, rowOffset) => Array.from({ length: lastColumn - firstColumn + 1 }, (_, columnOffset) => `${firstRow + rowOffset}:${firstColumn + columnOffset}`)).flat();
  };
  const mergeSelectedTableCells = (element: DragDropCanvasElement) => {
    const selected = getSelectedTableCells(element.id);
    if (selected.length < 2) return;
    const coordinates = selected.map((cell) => cell.split(":").map(Number));
    const rows = coordinates.map(([row]) => row);
    const columns = coordinates.map(([, column]) => column);
    const row = Math.min(...rows);
    const column = Math.min(...columns);
    const rowSpan = Math.max(...rows) - row + 1;
    const columnSpan = Math.max(...columns) - column + 1;
    const overlaps = (merge: NonNullable<DragDropCanvasElement["mergedCells"]>[number]) => merge.row < row + rowSpan && merge.row + merge.rowSpan > row && merge.column < column + columnSpan && merge.column + merge.columnSpan > column;
    updateElement(element.id, {
      mergedCells: [...(element.mergedCells || []).filter((merge) => !overlaps(merge)), { row, column, rowSpan, columnSpan }],
      cells: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow >= row && currentRow < row + rowSpan && currentColumn >= column && currentColumn < column + columnSpan && (currentRow !== row || currentColumn !== column) ? "" : element.cells?.[currentRow]?.[currentColumn] || "")),
      cellHtml: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow >= row && currentRow < row + rowSpan && currentColumn >= column && currentColumn < column + columnSpan && (currentRow !== row || currentColumn !== column) ? "" : element.cellHtml?.[currentRow]?.[currentColumn] || "")),
      cellVerticalAlign: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow >= row && currentRow < row + rowSpan && currentColumn >= column && currentColumn < column + columnSpan && (currentRow !== row || currentColumn !== column) ? "middle" : element.cellVerticalAlign?.[currentRow]?.[currentColumn] || "middle")),
    });
    selectTableCell(element.id, row, column, false);
  };
  const unmergeSelectedTableCells = (element: DragDropCanvasElement) => {
    const selected = new Set(getSelectedTableCells(element.id));
    updateElement(element.id, { mergedCells: (element.mergedCells || []).filter((merge) => !Array.from({ length: merge.rowSpan }, (_, rowOffset) => Array.from({ length: merge.columnSpan }, (_, columnOffset) => `${merge.row + rowOffset}:${merge.column + columnOffset}`)).flat().some((cell) => selected.has(cell))) });
  };
  const saveTableTextSelection = () => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const activeEditor = document.activeElement;
    if (range && activeEditor instanceof HTMLElement && activeEditor.isContentEditable && activeEditor.contains(range.commonAncestorContainer)) {
      tableTextRangeRef.current = range.cloneRange();
      tableTextEditorRef.current = activeEditor;
    }
  };
  const refreshTableHorizontalAlign = () => {
    requestAnimationFrame(() => {
      const activeEditor = document.activeElement;
      const computedAlignment = activeEditor instanceof HTMLElement ? getComputedStyle(activeEditor).textAlign : "left";
      setTableHorizontalAlign(document.queryCommandState("justifyCenter") || computedAlignment === "center" ? "center" : document.queryCommandState("justifyRight") || computedAlignment === "right" || computedAlignment === "end" ? "right" : "left");
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const selectedNode = range?.startContainer instanceof HTMLElement ? range.startContainer : range?.startContainer.parentElement;
      setTableInlineFormat({
        subscript: Boolean(selectedNode?.closest("sub")) || document.queryCommandState("subscript"),
        superscript: Boolean(selectedNode?.closest("sup")) || document.queryCommandState("superscript"),
        textBox: Boolean(selectedNode?.closest('[data-text-box="true"]')),
      });
    });
  };
  const restoreTableTextEditor = () => {
    if (!editingTableCell) return;
    const activeEditor = document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable ? document.activeElement : tableTextEditorRef.current;
    if (activeEditor && tableTextRangeRef.current && activeEditor.contains(tableTextRangeRef.current.commonAncestorContainer)) {
      activeEditor.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(tableTextRangeRef.current);
    }
    return activeEditor;
  };
  const runTableTextCommand = (command: string, commandValue?: string) => {
    const activeEditor = restoreTableTextEditor();
    if (!activeEditor) return;
    document.execCommand(command, false, commandValue);
    if (command === "justifyLeft") setTableHorizontalAlign("left");
    if (command === "justifyCenter") setTableHorizontalAlign("center");
    if (command === "justifyRight") setTableHorizontalAlign("right");
    if (activeEditor instanceof HTMLElement && activeEditor.isContentEditable) activeEditor.dispatchEvent(new Event("input", { bubbles: true }));
    tableTextRangeRef.current = null;
    tableTextEditorRef.current = activeEditor;
    refreshTableHorizontalAlign();
  };
  const applyTableInlineScript = (kind: "subscript" | "superscript") => {
    const editor = restoreTableTextEditor();
    if (!editor || !activateInlineScript(editor, kind)) return;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    tableTextRangeRef.current = null;
    tableTextEditorRef.current = editor;
    refreshTableHorizontalAlign();
  };
  const toggleTableTextBox = () => {
    const editor = restoreTableTextEditor();
    if (!editor || !toggleTextBoxAtCaret(editor)) return;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    tableTextRangeRef.current = null;
    tableTextEditorRef.current = editor;
    refreshTableHorizontalAlign();
  };
  const insertTableMath = (html: string) => {
    const editingMath = tableEditingMathRef.current;
    const editor = tableTextEditorRef.current;
    if (editingMath?.isConnected && editor?.contains(editingMath)) {
      const template = document.createElement("template");
      template.innerHTML = html;
      const replacement = template.content.firstElementChild;
      if (!replacement) return;
      editingMath.replaceWith(replacement);
      const typingPoint = document.createTextNode("\u200B");
      replacement.after(typingPoint);
      const range = document.createRange();
      range.setStart(typingPoint, typingPoint.length);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      tableEditingMathRef.current = null;
      setEditingExistingTableMath(false);
      setTableMathPanel(null);
      return;
    }
    runTableTextCommand("insertHTML", html);
    setEditingExistingTableMath(false);
    setTableMathPanel(null);
  };
  const editTableMath = (math: Element, editor: HTMLElement) => {
    const tree = readMathExpressionTree(math);
    if (!tree) return;
    tableEditingMathRef.current = math;
    tableTextEditorRef.current = editor;
    setEditingExistingTableMath(true);
    setTableMathTree(tree);
    setTableMathPanel("editable");
  };
  const removeEditedTableMath = () => {
    const math = tableEditingMathRef.current;
    const editor = tableTextEditorRef.current;
    if (!math?.isConnected || !editor?.contains(math)) return;

    const typingPoint = document.createTextNode("\u200B");
    math.replaceWith(typingPoint);
    const range = document.createRange();
    range.setStart(typingPoint, typingPoint.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    tableTextRangeRef.current = null;
    tableEditingMathRef.current = null;
    setEditingExistingTableMath(false);
    setTableMathPanel(null);
  };
  const boxResizeHandles = (element: DragDropCanvasElement, revealOnHover = false) => <>
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "top")} className="absolute left-3 right-3 top-0 z-30 h-2 -translate-y-1/2 cursor-ns-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from top edge" />
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "right")} className="absolute bottom-3 right-0 top-3 z-30 w-2 translate-x-1/2 cursor-ew-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from right edge" />
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "bottom")} className="absolute bottom-0 left-3 right-3 z-30 h-2 translate-y-1/2 cursor-ns-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from bottom edge" />
    <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize", "left")} className="absolute bottom-3 left-0 top-3 z-30 w-2 -translate-x-1/2 cursor-ew-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" aria-label="Resize from left edge" />
    {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((edge) => <span key={edge} onPointerDown={(event) => beginElementGesture(event, element, "element-resize", edge)} className={`absolute z-40 h-3 w-3 touch-none rounded-sm border border-violet-700 bg-white transition-opacity ${revealOnHover ? "opacity-0 hover:opacity-100 focus:opacity-100" : ""} ${edge.includes("top") ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"} ${edge.includes("left") ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} ${edge === "top-left" || edge === "bottom-right" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} aria-label={`Resize from ${edge.replace("-", " ")} corner`} />)}
  </>;
  const choiceResizeHandles = (item: (typeof data.items)[number]) => <>
    {(["top", "right", "bottom", "left"] as const).map((edge) => <span key={edge} aria-label={`Resize choice from ${edge.replace("-", " ")}`} onPointerDown={(event) => beginChoiceItemResize(event, item, edge)} className={`absolute z-40 bg-blue-500/0 hover:bg-blue-500/50 ${edge === "top" ? "left-2 right-2 top-0 h-2 -translate-y-1/2 cursor-ns-resize" : edge === "right" ? "bottom-2 right-0 top-2 w-2 translate-x-1/2 cursor-ew-resize" : edge === "bottom" ? "bottom-0 left-2 right-2 h-2 translate-y-1/2 cursor-ns-resize" : "bottom-2 left-0 top-2 w-2 -translate-x-1/2 cursor-ew-resize"}`} />)}
    {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((edge) => <span key={edge} aria-label={`Resize choice from ${edge.replace("-", " ")}`} onPointerDown={(event) => beginChoiceItemResize(event, item, edge)} className={`absolute z-50 h-3 w-3 rounded-sm border border-blue-700 bg-white ${edge.includes("top") ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"} ${edge.includes("left") ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} ${edge === "top-left" || edge === "bottom-right" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} />)}
  </>;
  const choiceEditor = (item: (typeof data.items)[number], itemCanvasX: number, itemCanvasY: number) => {
    const itemIndex = data.items.findIndex((current) => current.id === item.id);
    const markerOnly = choiceOnly && choicePresentation !== "content";
    const itemCanvasHeight = itemPercentSize(item).height;
    return <div
    data-canvas-object
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    className={`absolute z-[70] rounded-xl border border-blue-300 bg-white p-3 text-left shadow-xl ${markerOnly ? "w-72 max-w-[calc(100cqw-1rem)]" : "w-max min-w-[56rem]"}`}
    style={{
      left: markerOnly ? `clamp(0.5rem, ${itemCanvasX}%, calc(100% - 18.5rem))` : `clamp(0.5rem, ${itemCanvasX}%, calc(100% - 56.5rem))`,
      top: `calc(${itemCanvasY + itemCanvasHeight}% + 0.5rem)`,
    }}
  >
    <div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-950">Edit choice</strong><button type="button" onClick={() => setEditingItemId(null)} className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700" aria-label="Close choice editor">×</button></div>
    {!choiceOnly && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="text-xs font-semibold text-blue-900">Shared option & target size</p>
      <div className="mt-2 flex items-end gap-3">{(["width", "height"] as const).map(dimension => <label key={dimension} className="text-xs text-slate-700">{dimension === "width" ? "Option width" : "Option height"} (% of canvas width)<input type="number" min="2" max="100" step="0.5" value={Number((boxSize[dimension] / 10).toFixed(2))} onChange={event => { if (event.target.value && Number.isFinite(event.target.valueAsNumber)) onChange({ ...data, choiceSize: { ...boxSize, [dimension]: clamp(event.target.valueAsNumber, 2, 100) * 10 } }); }} className="mt-1 block w-28 rounded border border-slate-300 bg-white px-2 py-1 text-slate-950" /></label>)}<button type="button" onClick={() => onChange({ ...data, choiceSize: undefined })} className="rounded border border-blue-300 bg-white px-2 py-1 text-xs text-blue-800">Auto size</button></div>
      <p className="mt-2 text-xs text-slate-600">All options and targets always use this size. Drag a blank option’s resize handles to adjust them together.</p>
    </div>}
    {!markerOnly && <><div className="mt-2 text-xs font-semibold text-slate-700">
      <span className="mb-1 block">Choice text</span>
      <RichTextEditor allowNumberLines value={onChoiceHtmlChange ? choiceHtmlById[item.id] || "" : getDragDropItemHtml(item)} onChange={(html) => {
        if (onChoiceHtmlChange) { onChoiceHtmlChange(item.id, html); return; }
        const container = document.createElement("div");
        container.innerHTML = html.replace(/<br\s*\/?>(?!$)/gi, "\n").replace(/<\/(?:div|p|tr)>/gi, "\n");
        const content = (container.textContent || "").replaceAll("\u200B", "").trim();
        onChange({ ...data, items: data.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, content, contentHtml: html } : currentItem) });
      }} placeholder="" minHeight="5.5rem" verticalAlign={item.textVerticalAlign || "middle"} onVerticalAlignChange={(textVerticalAlign) => onChange({ ...data, items: data.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, textVerticalAlign } : currentItem) })} />
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      <label className="cursor-pointer rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white">Upload image<input type="file" accept="image/*" className="sr-only" onChange={(event) => { onItemImageFileChange(item.id, event.target.files?.[0] || null); event.target.value = ""; }} /></label>
      <button type="button" onClick={() => setShowChoiceImages((current) => !current)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700">Choose existing</button>
      {(itemPreviewUrls[item.id] || item.imageUrl) && <button type="button" onClick={() => onRemoveItemImage(item.id)} className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700">Remove image</button>}
    </div>
    {(itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="Choice preview" className="mt-2 h-24 w-full rounded-lg border border-slate-200 object-contain p-1" />}
    {showChoiceImages && <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="grid grid-cols-2 gap-1.5">{uploadedImages.map((image) => <div key={image.url} className="group relative"><button type="button" onClick={() => { onChooseItemImage(item.id, image); setShowChoiceImages(false); }} className="w-full rounded-md border border-slate-200 bg-white p-1"><img src={image.url} alt={image.label} className="h-14 w-full object-contain" /><span className="mt-0.5 block truncate text-[10px] text-slate-600">{image.label}</span></button>{image.id && <button type="button" onClick={() => onDeleteUploadedImage(image as LocationLibraryImage & { id: string })} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] font-bold text-white opacity-0 shadow group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${image.label}`}>×</button>}</div>)}</div>
      {!uploadedImages.length && <p className="text-xs text-slate-500">No uploaded images yet.</p>}
    </div>}
    </>}
    {renderChoiceEditorExtra?.(item.id, itemIndex)}
    <div className={`mt-3 flex gap-2 ${markerOnly ? "justify-end" : "justify-between"}`}>{!markerOnly && <button type="button" onClick={() => setEditingItemId(null)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Done</button>}<button type="button" onClick={() => { onRemoveItemImage(item.id); if (onRemoveChoice) onRemoveChoice(item.id, itemIndex); else onChange({ ...data, items: data.items.filter((currentItem) => currentItem.id !== item.id), zones: data.zones.map((zone) => ({ ...zone, correctItemIds: zone.correctItemIds.filter((itemId) => itemId !== item.id) })) }); setEditingItemId(null); }} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">Remove choice</button></div>
  </div>;
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div><h3 className="font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>button]:px-2 [&>button]:text-xs [&>button]:h-9 [&>div.relative]:shrink-0 [&>div.relative>button]:h-9 [&>div.relative>button]:whitespace-nowrap [&>div.relative>button]:px-2 [&>div.relative>button]:text-xs">
        {toolbarActions}
        {!compositionOnly && !choiceOnly && <button type="button" onClick={addTarget} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">{data.preset === "category-canvas" ? "+ Add category" : "+ Add target"}</button>}
        {(choiceOnly || (!compositionOnly && !choicesAreGrouped)) && <button type="button" onClick={onAddChoice || addChoice} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">+ Add choice</button>}
        <button type="button" onClick={() => { setShowImages((current) => !current); setSelectedLibraryImages([]); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ Add images</button>
        {data.backgroundImageUrl && <button type="button" onClick={() => onChange({ ...data, backgroundImageUrl: "", backgroundImagePath: "" })} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove original background</button>}
        <button type="button" onClick={addTextBox} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Text box</button>
        <button type="button" onClick={addTable} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Table</button>
        <button type="button" onClick={() => { addNumberLine(); setShowShapeMenu(false); setDrawingShapeKind(null); }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">+ Number line</button>
        <div className="relative">
          <button type="button" onClick={() => { setShowAlgebraTileMenu((current) => !current); setShowShapeMenu(false); setDrawingShapeKind(null); }} aria-expanded={showAlgebraTileMenu} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${showAlgebraTileMenu ? "border-blue-500 bg-blue-100 text-blue-900" : "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>+ Algebra tiles</button>
          {showAlgebraTileMenu && <div className="absolute left-0 top-full z-50 mt-2 w-96 rounded-xl border border-slate-300 bg-white p-3 shadow-xl">
            <p className="text-sm font-semibold text-slate-900">Add individual tiles</p>
            <p className="mt-1 text-xs text-slate-500">Filled tiles are positive. Outlined tiles are negative.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {ALGEBRA_TILE_OPTIONS.map(({ kind, sign }) => <button key={`${sign}-${kind}`} type="button" onClick={() => addAlgebraTile(kind, sign)} className="flex h-16 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-800 hover:border-blue-500 hover:bg-blue-50" title={`Insert ${sign} ${kind === "x2" ? "x squared" : kind} tile`}><span style={{ backgroundColor: sign === "positive" ? "#020617" : "#ffffff" }} className={`inline-block shrink-0 border-2 border-slate-950 ${kind === "unit" ? "h-4 w-4" : kind === "x" ? "h-9 w-3" : "h-9 w-9"}`} /><span>{sign === "negative" ? "−" : "+"}{kind === "unit" ? "1" : kind === "x" ? "x" : "x²"}</span></button>)}
            </div>
            <div className="my-3 h-px bg-slate-200" />
            <p className="text-sm font-semibold text-slate-900">Add a grouped set</p>
            <p className="mt-1 text-xs text-slate-500">Enter each quantity, then add the complete set as one movable and scalable asset.</p>
            <div className="mt-2 grid grid-cols-6 gap-1.5">{ALGEBRA_TILE_COUNT_FIELDS.map((field) => <label key={field.key} className="text-center text-[11px] font-bold text-slate-600">{field.label}<input inputMode="numeric" value={algebraTileSetCounts[field.key]} onChange={(event) => { if (/^\d*$/.test(event.target.value)) setAlgebraTileSetCounts((current) => ({ ...current, [field.key]: event.target.value })); }} onBlur={(event) => { const value = Math.max(0, Math.min(30, Math.trunc(Number(event.target.value) || 0))); setAlgebraTileSetCounts((current) => ({ ...current, [field.key]: String(value) })); }} className="mt-1 block h-8 w-full rounded border border-slate-300 bg-white px-1 text-center text-sm text-slate-950" /></label>)}</div>
            <button type="button" disabled={!Object.values(algebraTileSetCounts).some((count) => Number(count) > 0)} onClick={addAlgebraTileSet} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">Add grouped set</button>
            <button type="button" onClick={() => addAlgebraTile("legend")} className="mt-2 w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Insert complete algebra-tile legend</button>
          </div>}
        </div>
        <div className="relative">
          <button type="button" onClick={() => { setShowShapeMenu((current) => !current); setShowAlgebraTileMenu(false); }} aria-expanded={showShapeMenu} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${showShapeMenu || drawingShapeKind ? "border-blue-500 bg-blue-100 text-blue-900" : "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>+ Shape</button>
          {showShapeMenu && <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-300 bg-white p-3 shadow-xl">
            <p className="text-sm font-semibold text-slate-900">Choose a shape, then drag on the canvas</p>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Thickness <span className="font-bold text-slate-900">{drawingShapeThickness}</span><input type="range" min="1" max="12" value={drawingShapeThickness} onChange={(event) => setDrawingShapeThickness(Number(event.target.value))} className="mt-1 block w-full accent-blue-600" /></label>
            <div className="mt-3 grid grid-cols-5 gap-2">{(["line", "arrow", "circle", "rectangle", "triangle"] as const).map((kind) => <button key={kind} type="button" onClick={() => { setDrawingShapeKind(kind); setShowShapeMenu(false); setEditingElementId(null); }} className="grid h-12 place-items-center rounded-lg border border-slate-300 bg-slate-50 text-slate-900 hover:border-blue-500 hover:bg-blue-50" title={`Draw ${kind}`} aria-label={`Draw ${kind}`}>{kind === "line" ? <span className="block h-0.5 w-7 rotate-[-25deg] bg-current" /> : kind === "arrow" ? <span className="text-2xl leading-none">↗</span> : kind === "circle" ? <span className="block h-7 w-7 rounded-full border-2 border-current" /> : kind === "rectangle" ? <span className="block h-6 w-8 border-2 border-current" /> : <span className="text-3xl leading-none">△</span>}</button>)}</div>
          </div>}
        </div>
        <div className="ml-auto flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-semibold text-slate-700" title="Extend or shorten the canvas vertically">
          <span className="mr-1 whitespace-nowrap">Canvas height</span>
          <button type="button" aria-label="Shorten canvas" disabled={canvasHeight <= MIN_CANVAS_HEIGHT} onClick={() => onChange({ ...data, canvasHeight: normalizeCanvasHeight(canvasHeight - 10) })} className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white text-base hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-35">−</button>
          <input type="range" min={MIN_CANVAS_HEIGHT} max={MAX_CANVAS_HEIGHT} step="5" value={canvasHeight} onChange={(event) => onChange({ ...data, canvasHeight: normalizeCanvasHeight(event.target.value) })} className="w-16 accent-blue-600" aria-label="Canvas height" />
          <button type="button" aria-label="Extend canvas" disabled={canvasHeight >= MAX_CANVAS_HEIGHT} onClick={() => onChange({ ...data, canvasHeight: normalizeCanvasHeight(canvasHeight + 10) })} className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white text-base hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-35">+</button>
          <span className="w-9 text-right tabular-nums">{Math.round(canvasHeight)}%</span>
        </div>
      </div>

      {showImages && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">Add images to the canvas</p><p className="text-xs text-slate-500">Upload images or PDFs. Every PDF page is converted into a separate canvas image.</p></div><label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">{uploading ? "Converting and uploading..." : "Upload images or PDFs"}<input type="file" accept="image/*,application/pdf,.pdf" multiple disabled={uploading} className="sr-only" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void uploadCanvasFiles(files); }} /></label></div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9rem,12rem))] gap-2">{uploadedImages.map((image) => { const selected = selectedLibraryImages.includes(image.url); return <div key={image.url} className="group relative"><button type="button" onClick={() => setSelectedLibraryImages((current) => selected ? current.filter((url) => url !== image.url) : [...current, image.url])} className={`w-full rounded-lg border bg-white p-2 text-left ${selected ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-200 hover:border-blue-500"}`}><img src={image.url} alt={image.label} className="h-24 w-full object-contain" /><span className="mt-1 flex items-center gap-1 truncate text-xs text-slate-600"><span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{selected ? "✓" : ""}</span>{image.label}</span></button>{image.id && <button type="button" onClick={() => onDeleteUploadedImage(image as LocationLibraryImage & { id: string })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white opacity-0 shadow group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${image.label}`}>×</button>}</div>; })}
          {!uploadedImages.length && <p className="text-sm text-slate-500">No uploaded images yet.</p>}
        </div>
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setShowImages(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={!selectedLibraryImages.length} onClick={() => { addImageElements(uploadedImages.filter((image) => selectedLibraryImages.includes(image.url))); setSelectedLibraryImages([]); setShowImages(false); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add selected ({selectedLibraryImages.length})</button></div>
      </div>}

      <div ref={canvasRef} tabIndex={0} aria-label="Canvas editor — select an asset and use arrow keys to move it or Delete to remove it" onKeyDown={nudgeAsset} onPointerDownCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        const asset = event.target.closest<HTMLElement>("[data-nudge-kind]");
        nudgeTargetRef.current = asset;
        selectedChoiceRef.current = event.target.closest<HTMLElement>("[data-choice-item-id]")?.dataset.choiceItemId || null;
        if (asset && !event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) event.currentTarget.focus({ preventScroll: true });
      }} style={{ containerType: "inline-size", aspectRatio: `100 / ${canvasHeight}` }} onPointerDown={(event) => { if (!(event.target instanceof Element) || !event.target.closest("[data-canvas-object]")) { setEditingItemId(null); setEditingElementId(null); setEditingOverlayId(null); setEditingTextId(null); setEditingZoneId(null); setTableSelection(null); setEditingTableCell(null); } beginShapeDraw(event); }} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={finishGesture} className={`relative z-10 w-full overflow-visible border border-slate-300 bg-slate-100 ${drawingShapeKind ? "cursor-crosshair touch-none ring-2 ring-blue-400" : ""}`}>
        {data.backgroundImageUrl
          ? <img src={data.backgroundImageUrl} alt="Location question background" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
          : !(data.canvasElements || []).length && !data.zones.length && !data.items.length && !overlayBlocks.length
            ? <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-500">{compositionOnly ? "Blank canvas · add content with the toolbar" : "Blank canvas · add targets or upload a background"}</div>
            : null}
        <div className="pointer-events-none absolute z-[55] border border-dashed border-amber-500/80 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" style={{ inset: `${SAFE_ZONE_INSET_PERCENT}%` }} aria-hidden="true">
          <span className="absolute left-1 top-1 rounded bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 shadow-sm">Safe area</span>
        </div>
        {snapGuides.x !== null && <div className="pointer-events-none absolute bottom-0 top-0 z-[60] w-px bg-fuchsia-500 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]" style={{ left: `${snapGuides.x}%` }} aria-hidden="true" />}
        {snapGuides.y !== null && <div className="pointer-events-none absolute left-0 right-0 z-[60] h-px bg-fuchsia-500 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]" style={{ top: `${snapGuides.y}%` }} aria-hidden="true" />}
        <div className={`absolute inset-0 ${drawingShapeKind ? "pointer-events-none" : ""}`}>
          {(data.canvasElements || []).map((element) => { const isInlineEditing = editingElementId === element.id && (element.type === "text" || element.type === "table" || element.type === "image" || element.type === "number-line" || element.type === "shape" || element.type === "algebra-tile"); const selectedTableCells = element.type === "table" ? getSelectedTableCells(element.id) : []; const selectedCellSet = new Set(selectedTableCells); const selectedMerge = element.type === "table" ? (element.mergedCells || []).find((merge) => Array.from({ length: merge.rowSpan }, (_, rowOffset) => Array.from({ length: merge.columnSpan }, (_, columnOffset) => `${merge.row + rowOffset}:${merge.column + columnOffset}`)).flat().some((cell) => selectedCellSet.has(cell))) : undefined; const activeTableCell = editingTableCell?.elementId === element.id ? editingTableCell : null; return <div key={element.id} data-nudge-kind="element" data-nudge-id={element.id} data-canvas-object onPointerDown={(event) => { if (element.type !== "text") beginElementGesture(event, element, "element-move"); }} onClick={(event) => { event.stopPropagation(); if (!gestureMovedRef.current) { setEditingZoneId(null); setEditingElementId(element.id); setEditingTextId(element.type === "text" && event.detail >= 2 ? element.id : null); if (element.type !== "table") { setTableSelection(null); setEditingTableCell(null); } } }} onDoubleClick={(event) => { if (element.type === "text") { event.preventDefault(); event.stopPropagation(); setEditingElementId(element.id); setEditingTextId(element.id); } }} className={`absolute box-border cursor-move touch-none ${isInlineEditing ? "z-[80]" : "z-0"} ${element.type === "shape" ? "" : `bg-white/20 ${editingElementId === element.id ? "ring-2 ring-violet-500" : "hover:ring-2 hover:ring-violet-300"}`}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}>
            {element.type === "text"
              ? <CanvasInlineTextEditor element={element} selected={editingElementId === element.id} editing={editingElementId === element.id && editingTextId === element.id} toolbarPlacement={element.y < 35 ? "below" : "above"} onChange={(patch) => updateElement(element.id, patch)} onMovePointerDown={(event) => beginElementGesture(event, element, "element-move")} onStartEditing={() => { setEditingElementId(element.id); setEditingTextId(element.id); }} onDelete={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingTextId(null); setEditingElementId(null); }} />
              : <LocationCanvasElementContent element={element} editableTable={element.type === "table" && editingElementId === element.id} activeTableCell={activeTableCell} selectedTableCells={selectedTableCells} onTableCellFocus={(rowIndex, columnIndex) => { setEditingTableCell({ elementId: element.id, row: rowIndex, column: columnIndex }); setTableMathPanel(null); refreshTableHorizontalAlign(); }} onTableCellSelect={(rowIndex, columnIndex, extend) => selectTableCell(element.id, rowIndex, columnIndex, extend)} onTableCellPointerDown={(event) => beginElementGesture(event, element, "element-move", undefined, true)} onTableMathEdit={editTableMath} onTableCellChange={(rowIndex, columnIndex, html, text) => updateElement(element.id, { cells: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow === rowIndex && currentColumn === columnIndex ? text : element.cells?.[currentRow]?.[currentColumn] || "")), cellHtml: Array.from({ length: element.rows || 2 }, (_, currentRow) => Array.from({ length: element.columns || 2 }, (_, currentColumn) => currentRow === rowIndex && currentColumn === columnIndex ? html : element.cellHtml?.[currentRow]?.[currentColumn] || "")) })} />}
            {element.type === "image" && editingElementId === element.id && <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1.5 text-xs shadow-lg ${element.y < 12 ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}><span className="px-1 font-semibold text-slate-700">Image</span><button type="button" onClick={() => setEditingElementId(null)} className="h-7 rounded border border-slate-300 bg-white px-2 font-semibold text-blue-800 shadow-sm hover:bg-blue-50">Done</button><button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingElementId(null); }} className="h-7 rounded border border-red-300 bg-white px-2 font-semibold text-red-700 shadow-sm hover:bg-red-50">Delete</button></div>}
            {element.type === "number-line" && editingElementId === element.id && <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 w-[26rem] max-w-[calc(100cqw-1rem)] rounded-xl border border-blue-200 shadow-xl top-full mt-2`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}>
              <NumberLineSettings key={element.id} copySize={{ width: element.width, height: element.height }} initial={getCanvasNumberLine(element)} onChange={(value) => updateElement(element.id, { numberLine: { ...value, divisions: getCanvasNumberLine(element).divisions } })} onSave={() => setEditingElementId(null)} onDelete={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingElementId(null); }} />
            </div>}
            {element.type === "shape" && editingElementId === element.id && (() => { const shape = getCanvasShape(element); return <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] flex-wrap items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 p-1.5 text-xs shadow-lg ${element.y < 12 ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}>
              {(["line", "arrow", "circle", "rectangle", "triangle"] as const).map((kind) => <button key={kind} type="button" onClick={() => updateElement(element.id, { shape: { ...shape, kind } })} aria-pressed={shape.kind === kind} className={`h-7 rounded border px-2 font-semibold capitalize ${shape.kind === kind ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-blue-50"}`}>{kind}</button>)}
              <label className="flex h-7 min-w-40 items-center gap-1 rounded border border-slate-300 bg-white px-2 font-semibold text-slate-700">Thickness<input type="range" min="1" max="12" value={shape.thickness} onChange={(event) => updateElement(element.id, { shape: { ...shape, thickness: Number(event.target.value) } })} className="min-w-20 flex-1 accent-blue-600" /><span className="w-4 text-center">{shape.thickness}</span></label>
              <button type="button" onClick={() => setEditingElementId(null)} className="h-7 rounded border border-blue-300 bg-white px-2 font-semibold text-blue-800 hover:bg-blue-50">Done</button><button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingElementId(null); }} className="h-7 rounded border border-red-300 bg-white px-2 font-semibold text-red-700 hover:bg-red-50">Delete</button>
            </div>; })()}
            {element.type === "algebra-tile" && editingElementId === element.id && (() => { const tile = getCanvasAlgebraTile(element); return <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] flex-wrap items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 p-1.5 text-xs shadow-lg ${element.y < 12 ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}>
              <span className="px-1 font-semibold text-blue-950">{tile.kind === "group" ? "Algebra tile set" : "Algebra tile"}</span>
              {tile.kind === "group" && <div className="flex flex-wrap items-center gap-1">{ALGEBRA_TILE_COUNT_FIELDS.map((field) => <label key={field.key} className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-1.5 font-semibold text-slate-600">{field.label}<input type="number" min="0" max="30" defaultValue={tile.counts[field.key]} onChange={(event) => { if (event.target.value.trim()) updateElement(element.id, { algebraTile: { ...tile, counts: { ...tile.counts, [field.key]: Math.max(0, Math.min(30, Math.trunc(Number(event.target.value) || 0))) } } }); }} onBlur={(event) => { event.currentTarget.value = String(getCanvasAlgebraTile(element).counts[field.key]); }} className="h-5 w-9 bg-transparent text-center text-slate-950 outline-none" /></label>)}</div>}
              {tile.kind !== "legend" && tile.kind !== "group" && <>
                {(["unit", "x", "x2"] as const).map((kind) => <button key={kind} type="button" onClick={() => updateElement(element.id, { algebraTile: { ...tile, kind } })} aria-pressed={tile.kind === kind} className={`h-7 rounded border px-2 font-semibold ${tile.kind === kind ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-blue-50"}`}>{kind === "unit" ? "1" : kind === "x" ? "x" : <>x<sup>2</sup></>}</button>)}
                {(["positive", "negative"] as const).map((sign) => <button key={sign} type="button" onClick={() => updateElement(element.id, { algebraTile: { ...tile, sign } })} aria-pressed={tile.sign === sign} className={`h-7 rounded border px-2 font-semibold capitalize ${tile.sign === sign ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-blue-50"}`}>{sign}</button>)}
              </>}
              <button type="button" onClick={() => { const copy = { ...element, id: makeDragDropId(), x: clamp(element.x + 3, 0, Math.max(0, 100 - element.width)), y: clamp(element.y + 3, 0, Math.max(0, 100 - element.height)) }; updateElements([...(data.canvasElements || []), copy]); setEditingElementId(copy.id); }} className="h-7 rounded border border-blue-300 bg-white px-2 font-semibold text-blue-800 hover:bg-blue-100">Duplicate</button>
              <button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingElementId(null); }} className="h-7 rounded border border-red-300 bg-white px-2 font-semibold text-red-700 hover:bg-red-50">Delete</button>
            </div>; })()}
            {element.type === "table" && editingElementId === element.id && <div data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] flex-col items-start gap-1 text-xs ${element.y < 12 ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }}>
              <div className="flex w-max max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1.5 shadow-lg">
                <label className="flex items-center gap-1 font-semibold text-slate-600">Rows<input type="number" min="1" max="12" defaultValue={element.rows || 2} onChange={(event) => { if (event.target.value.trim()) resizeTable(element, clamp(Number(event.target.value) || 1, 1, 12), element.columns || 2); }} onBlur={(event) => { event.currentTarget.value = String(element.rows || 2); }} className="h-7 w-12 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
                <label className="flex items-center gap-1 font-semibold text-slate-600">Columns<input type="number" min="1" max="8" defaultValue={element.columns || 2} onChange={(event) => { if (event.target.value.trim()) resizeTable(element, element.rows || 2, clamp(Number(event.target.value) || 1, 1, 8)); }} onBlur={(event) => { event.currentTarget.value = String(element.columns || 2); }} className="h-7 w-12 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
                <label className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 font-semibold text-slate-700"><input type="checkbox" checked={element.showBorders !== false} onChange={(event) => updateElement(element.id, { showBorders: event.target.checked })} />Borders</label>
                {selectedTableCells.length > 1 && <button type="button" onClick={() => mergeSelectedTableCells(element)} className="h-7 rounded border border-blue-400 bg-blue-600 px-2 font-semibold text-white shadow-sm hover:bg-blue-500">Merge cells</button>}
                {selectedMerge && <button type="button" onClick={() => unmergeSelectedTableCells(element)} className="h-7 rounded border border-blue-300 bg-white px-2 font-semibold text-blue-800 shadow-sm hover:bg-blue-50">Unmerge</button>}
                {selectedTableCells.length === 1 && !selectedMerge && <span className="px-1 text-slate-500">Shift-click another cell to merge</span>}
                <button type="button" onClick={() => { setEditingTableCell(null); setEditingElementId(null); }} className="h-7 rounded border border-slate-300 bg-white px-2 font-semibold text-blue-800 shadow-sm hover:bg-blue-50">Done</button>
                <button type="button" onClick={() => { updateElements((data.canvasElements || []).filter((currentElement) => currentElement.id !== element.id)); setEditingTableCell(null); setEditingElementId(null); }} className="h-7 rounded border border-red-300 bg-white px-2 font-semibold text-red-700 shadow-sm hover:bg-red-50">Delete</button>
              </div>
              {activeTableCell && <>
                <div className="flex w-max max-w-full flex-wrap items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 p-1.5 shadow-lg">
                  <span className="px-1 font-semibold text-blue-900">Cell text</span>
                  <label className="flex items-center gap-1 font-semibold text-slate-600">Size<input type="number" min="10" max="72" value={element.fontSize || 16} onChange={(event) => updateElement(element.id, { fontSize: clamp(Number(event.target.value) || 16, 10, 72) })} className="h-7 w-12 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand("bold")} className="grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs font-bold text-slate-800 hover:bg-blue-100" aria-label="Bold selected cell text">B</button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand("italic")} className="grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs italic text-slate-800 hover:bg-blue-100" aria-label="Italicize selected cell text">I</button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand("underline")} className="grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs underline text-slate-800 hover:bg-blue-100" aria-label="Underline selected cell text">U</button>
                  {(["Left", "Center", "Right"] as const).map((alignment) => { const selectedAlignment = tableHorizontalAlign === alignment.toLowerCase(); return <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runTableTextCommand(`justify${alignment}`)} aria-pressed={selectedAlignment} className={`grid h-7 min-w-7 place-items-center rounded border px-1.5 ${selectedAlignment ? ACTIVE_TEXT_TOOLBAR_BUTTON : "border-slate-300 bg-white text-slate-800 hover:bg-blue-100"}`} aria-label={`Align selected cell text ${alignment.toLowerCase()}`} title={`Align ${alignment.toLowerCase()}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">{alignment === "Left" ? <path d="M3 4h14M3 8h9M3 12h14M3 16h9" /> : alignment === "Center" ? <path d="M3 4h14M5.5 8h9M3 12h14M5.5 16h9" /> : <path d="M3 4h14M8 8h9M3 12h14M8 16h9" />}</svg></button>; })}
                  {(["top", "middle", "bottom"] as const).map((alignment) => {
                    const selectedAlignment = (element.cellVerticalAlign?.[activeTableCell.row]?.[activeTableCell.column] || "middle") === alignment;
                    return <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => updateElement(element.id, { cellVerticalAlign: Array.from({ length: element.rows || 2 }, (_, rowIndex) => Array.from({ length: element.columns || 2 }, (_, columnIndex) => rowIndex === activeTableCell.row && columnIndex === activeTableCell.column ? alignment : element.cellVerticalAlign?.[rowIndex]?.[columnIndex] || "middle")) })} className={`grid h-7 min-w-7 place-items-center rounded border px-1.5 ${selectedAlignment ? ACTIVE_TEXT_TOOLBAR_BUTTON : "border-slate-300 bg-white text-slate-800 hover:bg-blue-100"}`} aria-label={`Align cell text to the ${alignment}`} title={`Align ${alignment}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M3 3h14M3 17h14" />{alignment === "top" ? <path d="M6 6h8M8 9h4" /> : alignment === "middle" ? <path d="M6 8h8M8 11h4" /> : <path d="M8 11h4M6 14h8" />}</svg></button>;
                  })}
                  <button type="button" title="Math expression builder" aria-label="Math expression builder" aria-pressed={tableMathPanel === "editable"} onMouseDown={(event) => { event.preventDefault(); saveTableTextSelection(); }} onClick={() => setTableMathPanel((current) => { if (current !== "editable") { tableEditingMathRef.current = null; setEditingExistingTableMath(false); setTableMathTree(createEmptyMathExpression()); } return current === "editable" ? null : "editable"; })} className={`grid h-7 min-w-7 place-items-center rounded border px-1.5 font-semibold ${tableMathPanel === "editable" ? ACTIVE_TEXT_TOOLBAR_BUTTON : "border-slate-300 bg-white text-slate-800 hover:bg-blue-100"}`}>∑</button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyTableInlineScript("subscript")} className={`grid h-7 min-w-7 place-items-center rounded border px-1.5 ${tableInlineFormat.subscript ? ACTIVE_TEXT_TOOLBAR_BUTTON : "border-slate-300 bg-white text-slate-800 hover:bg-blue-100"}`} aria-pressed={tableInlineFormat.subscript} aria-label="Subscript selected cell text"><TextScriptIcon kind="subscript" /></button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyTableInlineScript("superscript")} className={`grid h-7 min-w-7 place-items-center rounded border px-1.5 ${tableInlineFormat.superscript ? ACTIVE_TEXT_TOOLBAR_BUTTON : "border-slate-300 bg-white text-slate-800 hover:bg-blue-100"}`} aria-pressed={tableInlineFormat.superscript} aria-label="Superscript selected cell text"><TextScriptIcon kind="superscript" /></button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={toggleTableTextBox} className={`grid h-7 min-w-7 place-items-center rounded border px-1.5 ${tableInlineFormat.textBox ? ACTIVE_TEXT_TOOLBAR_BUTTON : "border-slate-300 bg-white text-slate-800 hover:bg-blue-100"}`} aria-pressed={tableInlineFormat.textBox} aria-label="Toggle box around cell text" title="Toggle box around text"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-5" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="M6 9h12M6 13h9M6 17h11" /></svg></button>
                </div>
                {tableMathPanel === "editable" && <div className="w-[48rem] max-w-full">
                  <MathExpressionComposer
                    value={tableMathTree}
                    onChange={setTableMathTree}
                    onCommit={() => insertTableMath(buildMathExpressionHtml(tableMathTree))}
                    onCancel={() => { tableEditingMathRef.current = null; setEditingExistingTableMath(false); setTableMathPanel(null); }}
                    onDelete={removeEditedTableMath}
                    editingExisting={editingExistingTableMath}
                    compact
                  />
                </div>}
              </>}
            </div>}
            {element.type === "table" && <>
              {getCanvasTrackSizes(element.columns || 2, element.columnWidths).slice(0, -1).map((_, index, tracks) => <span key={`column-${index}`} onPointerDown={(event) => beginTableTrackGesture(event, element, "table-column", index)} title={`Resize columns ${index + 1} and ${index + 2}`} className="absolute bottom-0 top-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" style={{ left: `${tracks.slice(0, index + 1).reduce((sum, size) => sum + size, 0)}%` }} />)}
              {getCanvasTrackSizes(element.rows || 2, element.rowHeights).slice(0, -1).map((_, index, tracks) => <span key={`row-${index}`} onPointerDown={(event) => beginTableTrackGesture(event, element, "table-row", index)} title={`Resize rows ${index + 1} and ${index + 2}`} className="absolute left-0 right-0 z-20 h-2 -translate-y-1/2 cursor-row-resize touch-none bg-violet-500/0 hover:bg-violet-500/50" style={{ top: `${tracks.slice(0, index + 1).reduce((sum, size) => sum + size, 0)}%` }} />)}
            </>}
            {element.type === "table" ? boxResizeHandles(element, true) : (element.type === "text" || element.type === "image" || element.type === "number-line" || element.type === "algebra-tile") ? editingElementId === element.id ? boxResizeHandles(element) : null : element.type !== "shape" && <span onPointerDown={(event) => beginElementGesture(event, element, "element-resize")} className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize touch-none border-l border-t border-violet-700 bg-white" aria-label="Resize canvas element" />}
          </div>; })}
          {overlayBlocks.map((overlay) => <div key={overlay.id} data-nudge-kind="overlay" data-nudge-id={overlay.id} data-canvas-object onPointerDown={(event) => beginOverlayGesture(event, overlay, "overlay-move")} onClick={(event) => { event.stopPropagation(); setEditingOverlayId(overlay.id); setEditingElementId(null); }} className={`absolute z-20 box-border cursor-move touch-none overflow-hidden ${overlay.hideLabel ? "bg-transparent" : "bg-white/80"} ${editingOverlayId === overlay.id ? "ring-2 ring-emerald-500" : "ring-1 ring-emerald-300 hover:ring-2"}`} style={{ left: `${overlay.bounds.x}%`, top: `${overlay.bounds.y}%`, width: `${overlay.bounds.width}%`, height: `${overlay.bounds.height}%` }}>
            {!overlay.hideLabel && <span className="pointer-events-none absolute left-1 top-1 z-20 rounded bg-emerald-700 px-1.5 py-0.5 text-[1.1cqw] font-bold text-white">{overlay.label}</span>}
            <div className={`pointer-events-none h-full w-full overflow-hidden ${overlay.hideLabel ? "" : "p-[1cqw] pt-[3cqw]"}`}>{overlay.content}</div>
            {editingOverlayId === overlay.id && <>
              <span onPointerDown={(event) => beginOverlayGesture(event, overlay, "overlay-resize", "top")} className="absolute left-3 right-3 top-0 z-30 h-2 -translate-y-1/2 cursor-ns-resize bg-emerald-500/40" />
              <span onPointerDown={(event) => beginOverlayGesture(event, overlay, "overlay-resize", "right")} className="absolute bottom-3 right-0 top-3 z-30 w-2 translate-x-1/2 cursor-ew-resize bg-emerald-500/40" />
              <span onPointerDown={(event) => beginOverlayGesture(event, overlay, "overlay-resize", "bottom")} className="absolute bottom-0 left-3 right-3 z-30 h-2 translate-y-1/2 cursor-ns-resize bg-emerald-500/40" />
              <span onPointerDown={(event) => beginOverlayGesture(event, overlay, "overlay-resize", "left")} className="absolute bottom-3 left-0 top-3 z-30 w-2 -translate-x-1/2 cursor-ew-resize bg-emerald-500/40" />
              {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((edge) => <span key={edge} onPointerDown={(event) => beginOverlayGesture(event, overlay, "overlay-resize", edge)} className={`absolute z-40 h-3 w-3 rounded-sm border border-emerald-700 bg-white ${edge.includes("top") ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"} ${edge.includes("left") ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} ${edge === "top-left" || edge === "bottom-right" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} />)}
            </>}
          </div>)}
          {overlayBlocks.map((overlay) => editingOverlayId === overlay.id && overlay.editor ? <div key={`overlay-editor-${overlay.id}`} data-canvas-object onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="absolute z-50 w-80 max-w-[calc(100%-1rem)] rounded-xl border border-emerald-300 bg-white p-3 text-left shadow-xl" style={{ left: `min(${overlay.bounds.x}%, calc(100% - 20rem))`, ...(overlay.bounds.y > 52 ? { bottom: `calc(${100 - overlay.bounds.y}% + 0.8cqw)` } : { top: `calc(${overlay.bounds.y + overlay.bounds.height}% + 0.8cqw)` }) }}>{overlay.editor}</div> : null)}
          {!compositionOnly && choicesAreGrouped && <div data-nudge-kind="choices" data-canvas-object data-choice-bank onPointerDown={() => { setEditingElementId(null); setEditingZoneId(null); setTableSelection(null); setEditingTableCell(null); }} className="absolute z-30" style={{ left: `${data.choiceBankX ?? 8}%`, top: `max(${data.choiceBankY ?? 6}%, ${CHOICE_GROUP_TOOLBAR_CLEARANCE_PX}px)` }}>
            <div className="absolute bottom-full left-0 z-10 mb-1 flex w-max items-center gap-1">
              <button type="button" onPointerDown={beginChoiceGesture} className="cursor-move touch-none whitespace-nowrap rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white shadow">Move group</button>
              {choiceOnly && allowChoiceMarkers && <select value={choicePresentation === "box" ? "content" : choicePresentation} onChange={(event) => onChange({ ...data, choicePresentation: event.target.value as "content" | "radio" | "box" })} className="h-6 rounded border border-blue-300 bg-white px-1.5 text-xs font-semibold text-blue-900 shadow" aria-label="Choice appearance" title="Choice appearance"><option value="content">Word / image</option><option value="radio">Radio buttons</option></select>}
              <button type="button" onClick={() => onChange({ ...data, choiceBankDirection: choicesAreVertical ? "horizontal" : "vertical" })} className="grid h-6 w-7 place-items-center rounded bg-white text-sm font-bold text-blue-800 shadow ring-1 ring-blue-300" title={choicesAreVertical ? "Arrange choices horizontally" : "Arrange choices vertically"} aria-label={choicesAreVertical ? "Arrange choices horizontally" : "Arrange choices vertically"}>{choicesAreVertical ? "↔" : "↕"}</button>
              {!choiceOnly && <button type="button" onClick={addChoice} className="grid h-6 w-7 place-items-center rounded bg-white text-base font-bold text-blue-800 shadow ring-1 ring-blue-300" title="Add choice" aria-label="Add choice">+</button>}
              {sameSizeControl}
              {<button type="button" onClick={ungroupChoices} className="whitespace-nowrap rounded bg-white px-2 py-1 text-xs font-bold text-blue-800 shadow ring-1 ring-blue-300">Ungroup</button>}
            </div>
            <div className={`flex w-max ${choicesAreVertical ? "flex-col" : "flex-row"}`} style={{ gap: "0.8cqw" }}>{data.items.map((item, index) => <div key={item.id} className="relative shrink-0" style={choicePresentation === "content" ? { ...contentBoxStyle(item) } : choicePresentation === "radio" ? { width: "3.2cqw", height: "3.2cqw" } : { width: `${item.width ?? 6}cqw`, height: `${(item.height ?? 10.5) * 9 / 16}cqw` }}><button type="button" data-choice-item-id={item.id} aria-label={item.content || `${choicePlaceholder} ${index + 1}`} onClick={() => { setEditingElementId(null); setEditingZoneId(null); setTableSelection(null); setEditingItemId(item.id); setShowChoiceImages(false); }} style={{ paddingTop: choicePresentation === "content" ? (choiceOnly ? "1cqw" : "0.6cqw") : 0, paddingBottom: choicePresentation === "content" ? (choiceOnly ? "1cqw" : "0.6cqw") : 0, paddingRight: choicePresentation === "content" ? (choiceOnly ? "1.2cqw" : "0.8cqw") : 0, paddingLeft: choicePresentation === "content" ? (choiceSelectionMode === "multiple" ? "4cqw" : choiceOnly ? "1.2cqw" : "0.8cqw") : 0, fontSize: "1.7cqw" }} className={`relative box-border flex h-full w-full flex-col ${choiceOnly && choicePresentation === "content" ? "items-start text-left" : "items-center text-center"} ${choiceVerticalClass(item)} border bg-white/50 font-medium text-black shadow-sm transition hover:ring-2 ${choiceOnly && choicePresentation === "content" ? "whitespace-nowrap" : ""} ${choicePresentation === "radio" ? "rounded-full border-2" : choiceOnly ? "rounded" : "rounded-none"} ${isChoiceCorrect?.(item.id, index) ? "border-emerald-600 ring-2 ring-emerald-300 hover:border-emerald-700 hover:ring-emerald-300" : editingItemId === item.id ? "border-blue-700 ring-2 ring-blue-300 hover:border-blue-700 hover:ring-blue-300" : "border-slate-400 hover:border-blue-600 hover:ring-blue-200"}`}>
                {choicePresentation === "content" && (itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="" style={{ maxHeight: "10cqw", maxWidth: "14cqw", marginBottom: "0.5cqw" }} className="min-h-0 flex-1 object-contain" />}
                {choicePresentation === "content" && choiceText(item, index)}
              </button>{emptyChoice(item) && editingItemId === item.id && choiceResizeHandles(item)}</div>)}</div>
          </div>}
          {!compositionOnly && !choicesAreGrouped && data.items.length > 0 && <div data-canvas-object className="absolute left-2 top-2 z-40 flex items-center gap-1"><button type="button" onClick={() => onChange({ ...data, choiceBankGrouped: true, choiceBankX: Math.min(...data.items.map((item) => item.x ?? 8)), choiceBankY: Math.min(...data.items.map((item) => item.y ?? 35)) })} className="rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white shadow">Group choices</button>{choiceOnly && allowChoiceMarkers && <select value={choicePresentation === "box" ? "content" : choicePresentation} onChange={(event) => onChange({ ...data, choicePresentation: event.target.value as "content" | "radio" | "box" })} className="h-6 rounded border border-blue-300 bg-white px-1.5 text-xs font-semibold text-blue-900 shadow" aria-label="Choice appearance"><option value="content">Word / image</option><option value="radio">Radio buttons</option></select>}{sameSizeControl}</div>}
          {!compositionOnly && !choicesAreGrouped && data.items.map((item, index) => <div key={item.id} data-nudge-kind="item" data-nudge-id={item.id} data-canvas-object role="button" aria-label={item.content || `${choicePlaceholder} ${index + 1}`} onPointerDown={(event) => beginChoiceItemGesture(event, item)} onClick={(event) => { event.stopPropagation(); if (!gestureMovedRef.current) { setEditingItemId(item.id); setShowChoiceImages(false); } }} className={`absolute z-30 box-border flex cursor-move touch-none flex-col ${choiceOnly && choicePresentation === "content" ? "items-start text-left" : "items-center text-center"} ${choiceVerticalClass(item)} border bg-white/50 font-medium text-black shadow-sm transition hover:ring-2 ${choiceOnly && choicePresentation === "content" ? "whitespace-nowrap" : ""} ${choicePresentation === "radio" ? "rounded-full border-2" : choiceOnly ? "rounded" : "rounded-none"} ${isChoiceCorrect?.(item.id, index) ? "border-emerald-600 ring-2 ring-emerald-300 hover:border-emerald-700 hover:ring-emerald-300" : editingItemId === item.id ? "border-blue-700 ring-2 ring-blue-300 hover:border-blue-700 hover:ring-blue-300" : "border-slate-400 hover:border-blue-600 hover:ring-blue-200"}`} style={{ left: `${item.x ?? 8}%`, top: `${item.y ?? 35}%`, ...(choicePresentation === "content" ? contentBoxStyle(item) : choicePresentation === "radio" ? { width: "3.2cqw", height: "3.2cqw" } : { width: `${item.width ?? 6}%`, height: `${item.height ?? 10.5}%` }), paddingTop: choicePresentation === "content" ? (choiceOnly ? "1cqw" : "0.6cqw") : 0, paddingBottom: choicePresentation === "content" ? (choiceOnly ? "1cqw" : "0.6cqw") : 0, paddingRight: choicePresentation === "content" ? (choiceOnly ? "1.2cqw" : "0.8cqw") : 0, paddingLeft: choicePresentation === "content" ? (choiceSelectionMode === "multiple" ? "4cqw" : choiceOnly ? "1.2cqw" : "0.8cqw") : 0, fontSize: "1.7cqw" }}>
            {choicePresentation === "content" && (itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="" draggable={false} style={{ maxHeight: "10cqw", maxWidth: "14cqw", margin: "0 auto 0.5cqw" }} className="pointer-events-none min-h-0 object-contain" />}
            {choicePresentation === "content" && choiceText(item, index)}
            {(choicePresentation === "box" || emptyChoice(item)) && editingItemId === item.id && choiceResizeHandles(item)}
          </div>)}
          {editingItemId && (() => { const index = data.items.findIndex((item) => item.id === editingItemId); const item = data.items[index]; if (!item) return null; const precedingOffset = data.items.slice(0, index).reduce((sum, current) => sum + (choicesAreVertical ? itemPercentSize(current).height : itemPercentSize(current).width) + 0.8, 0); const itemCanvasX = choicesAreGrouped ? (data.choiceBankX ?? 8) + (choicesAreVertical ? 0 : precedingOffset) : item.x ?? 8; const itemCanvasY = choicesAreGrouped ? (data.choiceBankY ?? 6) + (choicesAreVertical ? precedingOffset : 0) : item.y ?? 35; return choiceEditor(item, itemCanvasX, itemCanvasY); })()}
          {data.zones.map((zone, index) => <div key={zone.id} data-nudge-kind="zone" data-nudge-id={zone.id} data-canvas-object onPointerDown={(event) => beginGesture(event, zone)} onClick={(event) => { event.stopPropagation(); if (!gestureMovedRef.current) { setEditingElementId(null); setTableSelection(null); setEditingZoneId(zone.id); } }} className={`absolute z-20 box-border cursor-move touch-none border-2 border-dashed bg-blue-100/45 ${editingZoneId === zone.id ? "border-blue-700 ring-2 ring-blue-300" : "border-blue-500"}`} style={{ left: `${zone.x ?? 10}%`, top: `${zone.y ?? 10}%`, ...(data.preset === "category-canvas" ? { width: `${zone.width ?? 43}%`, height: `${zone.height ?? 40}%` } : boxCanvasStyle) }}>
            {data.preset === "category-canvas" && <div className="border-b border-blue-400 p-2 text-center text-sm font-semibold">{zone.label}<p className="text-xs font-normal">{zone.correctItemIds.length} assigned choices</p></div>}
            <span className="absolute left-1 top-1 grid h-6 min-w-6 place-items-center rounded bg-blue-700 px-1 text-xs font-bold text-white">{index + 1}</span>{data.preset === "category-canvas" && <button type="button" aria-label={`Resize ${zone.label}`} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setGesture({ kind: "target-resize", zoneId: zone.id, startX: event.clientX, startY: event.clientY, startLeft: zone.x ?? 5, startTop: zone.y ?? 45, startWidth: zone.width ?? 43, startHeight: zone.height ?? 40 }); }} className="absolute -bottom-1 -right-1 h-4 w-4 cursor-se-resize border border-blue-700 bg-white" />}
          </div>)}
          {data.zones.map((zone) => editingZoneId === zone.id && <div key={`editor-${zone.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="absolute z-40 w-64 rounded-xl border border-blue-300 bg-white p-3 text-left shadow-xl" style={{ left: `min(${zone.x ?? 10}%, calc(100% - 16rem))`, ...((zone.y ?? 10) > 55 ? { bottom: `calc(${100 - (zone.y ?? 10)}% + 0.8cqw)` } : { top: `calc(${zone.y ?? 10}% + ${boxSize.height / 10 + 0.8}cqw)` }) }}>
            <label className="block text-xs font-semibold text-slate-700">{data.preset === "category-canvas" ? "Category label" : "Target label"}<input value={zone.label} onChange={(event) => updateZone(zone.id, { label: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950" /></label>
            {data.preset === "category-canvas" ? <>
              <div className="my-2 flex gap-2">{(["width", "height"] as const).map(dimension => <label key={dimension} className="text-xs">{dimension}<input aria-label={`Category ${dimension}`} type="number" min={10} max={100 - (dimension === "width" ? zone.x ?? 5 : zone.y ?? 45)} value={zone[dimension] ?? 40} onChange={event => updateZone(zone.id, { [dimension]: Math.max(10, Math.min(100 - (dimension === "width" ? zone.x ?? 5 : zone.y ?? 45), Number(event.target.value))) })} className="w-20 rounded border p-1" /></label>)}</div>
              <fieldset className="max-h-48 overflow-auto"><legend className="text-xs font-semibold">Correct choices</legend>{data.items.map((item, index) => <label key={item.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={zone.correctItemIds.includes(item.id)} onChange={event => updateZones(data.zones.map(current => ({ ...current, correctItemIds: current.id === zone.id ? (event.target.checked ? [...current.correctItemIds, item.id] : current.correctItemIds.filter(id => id !== item.id)) : current.correctItemIds.filter(id => id !== item.id) })))} />{itemPreviewUrls[item.id] || item.imageUrl ? <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="" className="h-8 w-8 object-contain" /> : null}{item.content || `Choice ${index + 1}`}</label>)}</fieldset>
            </> : <TargetChoicePicker items={data.items} value={zone.correctItemIds[0] || ""} imageUrls={itemPreviewUrls} disabledIds={data.zones.filter(currentZone => currentZone.id !== zone.id).flatMap(currentZone => currentZone.correctItemIds)} onChange={(id) => updateZone(zone.id, { correctItemIds: id ? [id] : [], capacity: 1 })} />}
            <div className="mt-3 flex justify-between gap-2"><button type="button" onClick={() => setEditingZoneId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Done</button><button type="button" onClick={() => { updateZones(data.zones.filter((currentZone) => currentZone.id !== zone.id)); setEditingZoneId(null); }} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700">{data.preset === "category-canvas" ? "Remove category" : "Remove target"}</button></div>
          </div>)}
        </div>
      </div>



    </section>
  );
}
