"use client";

import { assessmentPreviewHref } from "@/lib/assessmentPreview";

import DragDropQuestion from "@/app/student/[id]/DragDropQuestion";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import LocationCanvasElementContent from "@/app/components/LocationCanvasElementContent";
import { supabase } from "@/lib/supabaseClient";
import { requireAccountRole } from "@/lib/roleGuard";
import RichTextEditor from "./RichTextEditor";
import { useQuestionDrafts } from "./useQuestionDrafts";
import type { QuestionDraft } from "@/lib/questionDrafts";
import { DropdownQuestionPreview } from "./DropdownQuestionEditor";
import FillBlankQuestion from "@/app/components/FillBlankQuestion";
import CanvasFillBlankField from "@/app/components/CanvasFillBlankField";
import FillBlankCanvasPanel from "./FillBlankCanvasPanel";
import QuestionCanvas from "@/app/components/QuestionCanvas";
import CanvasDropdownField from "@/app/components/CanvasDropdownField";
import LocationCanvasEditor from "./LocationCanvasEditor";
import { createDefaultDropdownData, dropdownHasCompleteAnswerKey, getDropdownEntryOptions, makeDropdownId, normalizeDropdownData, type DropdownEntry, type DropdownQuestionData } from "@/lib/dropdownQuestion";
import { createDefaultFillBlankData, createFillBlankEntry, getFillBlankBounds, getFillBlankPromptText, normalizeFillBlankData, type FillBlankData, type FillBlankEntry } from "@/lib/fillBlank";
import { createCategoryCanvasData, asLocationDragDropData, createDefaultDragDropData, createLocationDragDropData, getInlineBlankCount, getInlineBlankSegments, getInlineChoiceBoxSize, getDragDropItemHtml, getLocationBoxSize, getSequenceTargetCount, makeDragDropId, normalizeCanvasHeight, normalizeDragDropData, type DragDropData } from "@/lib/dragDrop";
import { getMultipleChoiceCorrectAnswers, getMultipleChoiceSelectionMode, type MultipleChoiceSelectionMode } from "@/lib/multipleChoice";
import { DEFAULT_INTERACTION, createDefaultQuestionCanvas, normalizeQuestionCanvas, questionCanvasToComposition, type QuestionCanvasData } from "@/lib/questionCanvas";
import { createPrivateImageUrl, hydratePrivateImageUrls } from "@/lib/privateImageUrls";

type QuestionType =
  | "multiple-choice"
  | "drag-and-drop"
  | "sort-into-groups"
  | "dropdown"
  | "short-answer"
  | "fill-in-the-blank"
  | "image-question"
  | "sorting-order"
  | "sorting-category";

type OverlayAnswerMode = "text-entry" | "drag-drop-text" | "drag-drop-image";
type SplitEditorTab = "left" | "right";
type QuestionLayout = "standard" | "split";
type LeftPanelTable = {
  enabled: boolean;
  hasBorder: boolean;
  cells: string[][];
};

type AnswerBox = {
  id: string;
  label: string;
  correctAnswer: string;
};

type BlankBox = {
  id: string;
  correctAnswer: string;
};

type OverlayBox = {
  id: string;
  label: string;
  correctAnswer: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DraggableChoice = {
  id: string;
  text: string;
};

type DraggableImageChoice = {
  id: string;
  label: string;
  imageUrl: string;
  imagePath: string;
};

type MultipleChoiceImage = {
  imageUrl: string;
  imagePath: string;
};
type ChoiceTable = {
  enabled: boolean;
  headers: string[];
  rows: string[][];
  hasBorder: boolean;
  cellImages?: MultipleChoiceImage[][];
};

type SortingItem = {
  id: string;
  text: string;
  imageUrl?: string;
  imagePath?: string;
  correctCategoryId?: string;
};

type SortingCategory = {
  id: string;
  name: string;
};

type Assessment = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  formula_sheet?: QuestionCanvasData | null;
};

type ReferenceBuild = {
  id: string;
  owner_id: string;
  name: string;
  title: string;
  top_content: string;
  content: string;
  image_url: string;
  image_path: string;
  table_data: LeftPanelTable;
};

type AccountImage = {
  id: string;
  owner_id: string;
  image_url: string;
  image_path: string;
  label: string;
};

type Question = {
  id: string;
  assessment_id: string;
  question_type: QuestionType;
  prompt: string;
  question_data: {
    choices?: string[];
    promptHtml?: string;
    choiceImages?: MultipleChoiceImage[];
    choiceHtml?: string[];
    choiceIds?: string[];
    choiceTable?: ChoiceTable;
    selectionMode?: MultipleChoiceSelectionMode;
    correctAnswer?: string;
    correctAnswers?: string[];
    answerBoxes?: AnswerBox[];
    template?: string;
    blanks?: BlankBox[];
    imageUrl?: string;
    imagePath?: string;
    overlayBoxes?: OverlayBox[];
    overlayAnswerMode?: OverlayAnswerMode;
    draggableChoices?: DraggableChoice[];
    draggableImageChoices?: DraggableImageChoice[];
    sortingItems?: SortingItem[];
    sortingCategories?: SortingCategory[];
    correctOrder?: string[];
    layout?: QuestionLayout;
    leftPanelTitle?: string;
    leftPanelTopContent?: string;
    leftPanelContent?: string;
    leftPanelImageUrl?: string;
    leftPanelImagePath?: string;
    leftPanelTable?: LeftPanelTable;
    dragDrop?: DragDropData;
    dropdown?: DropdownQuestionData;
    fillBlank?: FillBlankData;
    canvas?: QuestionCanvasData;
    leftCanvas?: QuestionCanvasData;
  };
  question_order: number;
};

type DragMode = "move" | "resize" | null;

type DragState = {
  boxId: string;
  mode: DragMode;
  startMouseX: number;
  startMouseY: number;
  startBox: OverlayBox;
};

function createAnswerBox(): AnswerBox {
  return {
    id: crypto.randomUUID(),
    label: "",
    correctAnswer: "",
  };
}

function createOverlayBox(): OverlayBox {
  return {
    id: crypto.randomUUID(),
    label: "",
    correctAnswer: "",
    x: 10,
    y: 10,
    width: 20,
    height: 10,
  };
}

function createDraggableChoice(text = ""): DraggableChoice {
  return {
    id: crypto.randomUUID(),
    text,
  };
}

function createDraggableImageChoice(): DraggableImageChoice {
  return {
    id: crypto.randomUUID(),
    label: "",
    imageUrl: "",
    imagePath: "",
  };
}

function createSortingItem(text = ""): SortingItem {
  return {
    id: crypto.randomUUID(),
    text,
    imageUrl: "",
    imagePath: "",
  };
}

function sortingItemHasContent(item: SortingItem) {
  return Boolean(item.text.trim() || item.imageUrl || item.imagePath);
}

function getSortingItemDisplayLabel(item: SortingItem, fallback: string) {
  if (item.text.trim()) {
    return item.text.trim();
  }

  return fallback;
}

function createSortingCategory(name = ""): SortingCategory {
  return {
    id: crypto.randomUUID(),
    name,
  };
}

function getImageChoiceValue(index: number) {
  return `__image_choice_${index + 1}__`;
}

function getTableChoiceValue(index: number) {
  return `__table_choice_${index + 1}__`;
}

function plainTextToHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

function richHtmlToPlainText(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.innerText.replace(/\u200B/g, "").trim();
}

function clearImageReference<T>(value: T, imageUrl: string, imagePath: string): T {
  if (Array.isArray(value)) {
    return value.map((item) => clearImageReference(item, imageUrl, imagePath)) as T;
  }
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const matches =
    source.imageUrl === imageUrl ||
    source.imagePath === imagePath ||
    source.image_url === imageUrl ||
    source.image_path === imagePath ||
    source.backgroundImageUrl === imageUrl ||
    source.backgroundImagePath === imagePath;
  const result: Record<string, unknown> = {};
  Object.entries(source).forEach(([key, child]) => {
    result[key] = matches && ["imageUrl", "imagePath", "image_url", "image_path", "backgroundImageUrl", "backgroundImagePath"].includes(key)
      ? ""
      : clearImageReference(child, imageUrl, imagePath);
  });
  return result as T;
}

function cleanFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAnswer(answer: string | undefined) {
  return (answer || "").trim().toLowerCase();
}

function leftPanelTableHasContent(table: LeftPanelTable | undefined) {
  return Boolean(
    table?.enabled &&
      table.cells.some((row) => row.some((cell) => cell.trim().length > 0))
  );
}

function ChoiceTablePreview({ table, selectionMode = "single" }: { table: ChoiceTable; selectionMode?: MultipleChoiceSelectionMode }) {
  return <div className="mt-6 overflow-x-auto"><table className={`w-full border-collapse text-left ${table.hasBorder ? "border border-slate-300" : ""}`}><thead><tr><th className={`w-16 px-3 py-3 text-center ${table.hasBorder ? "border border-slate-300" : ""}`}>Row</th>{table.headers.map((header, index) => <th key={index} className={`px-4 py-3 font-semibold ${table.hasBorder ? "border border-slate-300" : ""}`}>{header}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} className="hover:bg-blue-50/50"><td className={`px-3 py-3 text-center ${table.hasBorder ? "border border-slate-300" : ""}`}><span className={`inline-block h-6 w-6 border-2 border-slate-500 ${selectionMode === "multiple" ? "rounded" : "rounded-full"}`} /></td>{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-4 py-3 ${table.hasBorder ? "border border-slate-300" : ""}`}>{table.cellImages?.[rowIndex]?.[cellIndex]?.imageUrl && <img src={table.cellImages[rowIndex][cellIndex].imageUrl} alt="" className="mx-auto mb-2 max-h-40 max-w-full object-contain" />}<div className="rich-text-content" dangerouslySetInnerHTML={{ __html: cell }} /></td>)}</tr>)}</tbody></table></div>;
}

function dropdownEntryBounds(entry: DropdownEntry, index: number) {
  const x = entry.x ?? 8 + (index % 3) * 24;
  const y = entry.y ?? Math.min(84, 35 + Math.floor(index / 3) * 14);
  return { x, y, width: Math.min(entry.width ?? 20, 100 - x), height: Math.min(entry.height ?? 8, 100 - y) };
}

function DropdownCanvasFields({ data }: { data: DropdownQuestionData }) {
  return <>{data.entries.map((entry, index) => {
    const bounds = dropdownEntryBounds(entry, index);
    return <div key={entry.id} className="absolute z-20" style={{ left: `${bounds.x}%`, top: `${bounds.y}%`, width: `${bounds.width}%`, height: `${bounds.height}%` }}>
      <CanvasDropdownField disabled ariaLabel={`Dropdown ${index + 1}`} options={getDropdownEntryOptions(entry)} />
    </div>;
  })}</>;
}

function FillBlankCanvasFields({ data }: { data: FillBlankData }) {
  return <>{data.blanks.map((blank, index) => {
    const bounds = getFillBlankBounds(blank, index);
    return <div key={blank.id} className="absolute z-20" style={{ left: `${bounds.x}%`, top: `${bounds.y}%`, width: `${bounds.width}%`, height: `${bounds.height}%` }}><CanvasFillBlankField blank={blank} preview /></div>;
  })}</>;
}

function SequencePreview({ data, itemPreviewUrls = {} }: { data: DragDropData; itemPreviewUrls?: Record<string, string> }) {
  const targetCount = getSequenceTargetCount(data);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max gap-3">
        {data.items.map((item) => (
          <div key={item.id} className="box-border flex min-h-16 w-32 shrink-0 flex-col items-center justify-center rounded-none border border-slate-300 bg-white/50 px-3 py-2 text-center text-sm font-medium text-black shadow-sm">
            {(itemPreviewUrls[item.id] || item.imageUrl) && <img src={itemPreviewUrls[item.id] || item.imageUrl} alt="" className="mb-2 max-h-24 max-w-32 object-contain" />}
            {item.content || "Untitled item"}
          </div>
        ))}
      </div>
      <div className="mt-6 inline-block">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${targetCount}, 8rem)` }}>
          {Array.from({ length: targetCount }, (_, position) => <div key={position} className="box-border min-h-14 border-2 border-dashed border-slate-400 bg-white" />)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-8 text-base font-bold text-slate-900">
          <p className="max-w-xs whitespace-pre-line text-left">{data.sequenceStartLabel}</p>
          <p className="ml-auto max-w-xs whitespace-pre-line text-right">{data.sequenceEndLabel}</p>
        </div>
      </div>
    </div>
  );
}

function LocationPreview({ data, itemPreviewUrls = {} }: { data: DragDropData; itemPreviewUrls?: Record<string, string> }) {
  const previewItems = data.items.map((item) => ({ ...item, imageUrl: itemPreviewUrls[item.id] || item.imageUrl }));
  if (data.preset === "category-canvas") return <DragDropQuestion data={{ ...data, items: previewItems }} placements={{}} onChange={() => {}} />;
  const boxSize = getLocationBoxSize(previewItems, data.choiceSize);
  const boxCanvasStyle = { width: `${boxSize.width / 10}cqw`, height: `${boxSize.height / 10}cqw` };
  const canvasHeight = normalizeCanvasHeight(data.canvasHeight);
  return (
    <div style={{ containerType: "inline-size", aspectRatio: `100 / ${canvasHeight}` }} className="relative w-full overflow-hidden bg-white">
      {data.backgroundImageUrl ? <img src={data.backgroundImageUrl} alt="Match locations background" className="absolute inset-0 h-full w-full object-contain" /> : <div className="absolute inset-0" />}
      <div className="absolute inset-0">
        {(data.canvasElements || []).map((element) => <div key={element.id} className="absolute" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}><LocationCanvasElementContent element={element} /></div>)}
        <div className={data.choiceBankGrouped === false ? "contents" : `absolute z-30 flex w-max ${data.choiceBankDirection === "vertical" ? "flex-col" : "flex-row"}`} style={data.choiceBankGrouped === false ? undefined : { left: `${data.choiceBankX ?? 8}%`, top: `${data.choiceBankY ?? 6}%`, gap: "0.8cqw" }}>
          {previewItems.map((item) => <div key={item.id} style={{ ...boxCanvasStyle, ...(data.choiceBankGrouped === false ? { position: "absolute", zIndex: 30, left: `${item.x ?? 8}%`, top: `${item.y ?? 35}%` } as const : {}), padding: "0.6cqw 0.8cqw", fontSize: "1.7cqw" }} className={`box-border flex shrink-0 flex-col items-center ${item.textVerticalAlign === "top" ? "justify-start" : item.textVerticalAlign === "bottom" ? "justify-end" : "justify-center"} rounded-none border border-slate-400 bg-white text-center font-medium text-black shadow-none`}>
            {item.imageUrl && <img src={item.imageUrl} alt="" style={{ maxHeight: "10cqw", maxWidth: "14cqw", marginBottom: "0.5cqw" }} className="min-h-0 flex-1 object-contain" />}
            <span className="rich-text-content min-w-0 max-w-full" dangerouslySetInnerHTML={{ __html: getDragDropItemHtml(item) }} />
          </div>)}
        </div>
        {data.zones.map((zone, index) => (
          <div key={zone.id} className={`absolute z-20 box-border flex items-center justify-center bg-white/75 text-center font-semibold text-slate-800 ${data.settings.showZoneOutlines ? "border-2 border-dashed border-slate-500" : "border border-transparent"}`} style={{ left: `${zone.x ?? 10}%`, top: `${zone.y ?? 10}%`, ...boxCanvasStyle, fontSize: "1.5cqw" }}>
            {data.settings.showTargetLabels ? <span style={{ marginBottom: "0.5cqw", fontSize: "1.6cqw" }} className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap font-bold text-slate-900">{zone.label || `Target ${index + 1}`}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineBlankPreview({ data, itemPreviewUrls = {} }: { data: DragDropData; itemPreviewUrls?: Record<string, string> }) {
  const previewItems = data.items.map((item) => ({ ...item, imageUrl: itemPreviewUrls[item.id] || item.imageUrl }));
  const boxSize = getLocationBoxSize(previewItems, data.choiceSize);
  const boxStyle = { width: `${boxSize.width}px`, height: `${boxSize.height}px` };
  return <div className="space-y-5">
    <div className="rounded-xl border border-slate-200 bg-white p-5 text-lg leading-[3.5rem] text-slate-950">{getInlineBlankSegments(data.inlineText || "").length ? getInlineBlankSegments(data.inlineText || "").map((segment, segmentIndex) => segment.type === "text" ? <span key={segmentIndex} className="whitespace-pre-wrap">{segment.content}</span> : <span key={segmentIndex} aria-label={`Answer target ${segment.index + 1}`} style={boxStyle} className="mx-1 inline-flex box-border border-2 border-dashed border-slate-400 bg-white align-middle" />) : <span className="text-slate-400">Add a sentence or passage to see its blanks here.</span>}</div>
    <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Choices</p><div className="flex flex-wrap gap-3">{previewItems.map((item) => <div key={item.id} style={boxStyle} className="box-border flex shrink-0 flex-col items-center justify-center rounded-none border border-slate-300 bg-white/50 px-4 py-3 text-center text-sm font-medium text-slate-900 shadow-sm">{item.imageUrl && <img src={item.imageUrl} alt="" className="mb-2 min-h-0 max-h-24 max-w-32 flex-1 object-contain" />}<span className="rich-text-content min-w-0 max-w-full" dangerouslySetInnerHTML={{ __html: getDragDropItemHtml(item) }} /></div>)}</div></div>
  </div>;
}

function SavedQuestionStudentPreview({
  question,
  index,
  embedded = false,
}: {
  question: Question;
  index: number;
  embedded?: boolean;
}) {
  const isSplit = question.question_data.layout === "split";
  const hasChoiceImages = Boolean(
    question.question_data.choiceImages?.some((image) => image.imageUrl)
  );
  if ((question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")) {
    const data = asLocationDragDropData(question.question_data.dragDrop, question.question_data.canvas);
    const rightCanvas = <LocationPreview data={data} />;
    if (!isSplit) return rightCanvas;
    return <div className={`grid grid-cols-2 overflow-hidden bg-white text-slate-900 ${embedded ? "" : "rounded-2xl border border-slate-200"}`}>
      {question.question_data.leftCanvas
        ? <div className="flex min-w-0 items-start border-r border-slate-200"><QuestionCanvas canvas={normalizeQuestionCanvas(question.question_data.leftCanvas)} className="w-full border-0" /></div>
        : <div className="border-r border-slate-200 bg-slate-50/70" />}
      <div className="flex min-w-0 items-start bg-white">{rightCanvas}</div>
    </div>;
  }
  if (question.question_data.canvas) {
    const canvas = normalizeQuestionCanvas(question.question_data.canvas);
    const promptNode = question.question_data.promptHtml
        ? <div className="rich-text-content text-[2cqw] leading-snug" dangerouslySetInnerHTML={{ __html: question.question_data.promptHtml }} />
        : <div className="text-[2cqw] font-semibold leading-snug">{question.prompt}</div>;
    const responseNode = question.question_type === "multiple-choice"
      ? <div className="grid gap-[0.8cqw] text-[1.5cqw]">{question.question_data.choices?.map((choice, choiceIndex) => { const choiceImage = question.question_data.choiceImages?.[choiceIndex]?.imageUrl; const choiceMarkup = question.question_data.choiceHtml?.[choiceIndex]; return (choice || choiceImage) ? <div key={choiceIndex} className="rounded border border-slate-300 bg-white/50 px-[1.2cqw] py-[0.7cqw]">{getMultipleChoiceSelectionMode(question.question_data) === "multiple" && <span className="mr-[0.8cqw] inline-block h-[1.5cqw] w-[1.5cqw] rounded-sm border border-slate-500 align-middle" />}{choiceImage && <img src={choiceImage} alt="" className="mx-auto mb-[0.6cqw] max-h-[8cqw] max-w-full object-contain" />}{choiceMarkup ? <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: choiceMarkup }} /> : choice}</div> : null; })}</div>
      : null;
    const canvasPreview = <QuestionCanvas canvas={canvas} selectionMode={getMultipleChoiceSelectionMode(question.question_data)} legacyPrompt={promptNode} interaction={responseNode} overlays={question.question_type === "dropdown" ? <DropdownCanvasFields data={normalizeDropdownData(question.question_data.dropdown)} /> : question.question_type === "fill-in-the-blank" ? <FillBlankCanvasFields data={normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks)} /> : undefined} choices={question.question_type === "multiple-choice" ? (question.question_data.choices || []).map((text, choiceIndex) => ({ text, html: question.question_data.choiceHtml?.[choiceIndex], imageUrl: question.question_data.choiceImages?.[choiceIndex]?.imageUrl })) : undefined} className={`w-full ${embedded ? "border-0" : "rounded-2xl"}`} />;
    if (!isSplit) return canvasPreview;
    return <div className={`grid grid-cols-2 overflow-hidden bg-white text-slate-900 ${embedded ? "" : "rounded-2xl border border-slate-200"}`}>
      {question.question_data.leftCanvas ? <div className="flex min-w-0 items-start border-r border-slate-200"><QuestionCanvas canvas={normalizeQuestionCanvas(question.question_data.leftCanvas)} className="w-full border-0" /></div> : <div className="border-r border-slate-200 bg-slate-50/70 p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reference material</p>
        {question.question_data.leftPanelTitle && <h3 className="mt-3 text-2xl font-bold">{question.question_data.leftPanelTitle}</h3>}
        {question.question_data.leftPanelTopContent && <div className="rich-text-content mt-4 text-slate-700" dangerouslySetInnerHTML={{ __html: question.question_data.leftPanelTopContent }} />}
        {question.question_data.leftPanelImageUrl && <img src={question.question_data.leftPanelImageUrl} alt={question.question_data.leftPanelTitle || "Question reference"} className="mt-5 max-h-72 w-full rounded-xl border border-slate-200 bg-white object-contain p-2" />}
        {question.question_data.leftPanelContent && <div className="rich-text-content mt-4 text-slate-700" dangerouslySetInnerHTML={{ __html: question.question_data.leftPanelContent }} />}
        {leftPanelTableHasContent(question.question_data.leftPanelTable) && <div className="mt-5 overflow-x-auto"><table className={`w-full border-collapse text-left text-sm ${question.question_data.leftPanelTable?.hasBorder ? "border border-slate-300" : ""}`}><tbody>{question.question_data.leftPanelTable?.cells.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => { const Cell = rowIndex === 0 ? "th" : "td"; return <Cell key={columnIndex} className={`px-3 py-2 ${rowIndex === 0 ? "font-semibold" : ""} ${question.question_data.leftPanelTable?.hasBorder ? "border border-slate-300" : ""}`}>{cell}</Cell>; })}</tr>)}</tbody></table></div>}
      </div>}
      <div className="flex items-start bg-white">{canvasPreview}</div>
    </div>;
  }

  return (
    <div className={`grid overflow-hidden bg-white text-slate-900 ${embedded ? "" : "rounded-2xl border border-slate-200"} ${isSplit ? "lg:grid-cols-2" : ""}`}>
      {isSplit && (
        <div className="border-b border-slate-200 bg-slate-50/70 p-6 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reference material</p>
          {question.question_data.leftPanelTitle && (
            <h3 className="mt-3 text-2xl font-bold">{question.question_data.leftPanelTitle}</h3>
          )}
          {question.question_data.leftPanelTopContent && (
            <div className="rich-text-content mt-4 text-slate-700" dangerouslySetInnerHTML={{ __html: question.question_data.leftPanelTopContent }} />
          )}
          {question.question_data.leftPanelImageUrl && (
            <img src={question.question_data.leftPanelImageUrl} alt={question.question_data.leftPanelTitle || "Question reference"} className="mt-5 max-h-72 w-full rounded-xl border border-slate-200 bg-white object-contain p-2" />
          )}
          {question.question_data.leftPanelContent && (
            <div className="rich-text-content mt-4 text-slate-700" dangerouslySetInnerHTML={{ __html: question.question_data.leftPanelContent }} />
          )}
          {leftPanelTableHasContent(question.question_data.leftPanelTable) && (
            <div className="mt-5 overflow-x-auto">
              <table className={`w-full border-collapse text-left text-sm ${question.question_data.leftPanelTable?.hasBorder ? "border border-slate-300" : ""}`}>
                <tbody>
                  {question.question_data.leftPanelTable?.cells.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, columnIndex) => {
                        const Cell = rowIndex === 0 ? "th" : "td";
                        return <Cell key={columnIndex} className={`px-3 py-2 ${rowIndex === 0 ? "font-semibold" : ""} ${question.question_data.leftPanelTable?.hasBorder ? "border border-slate-300" : ""}`}>{cell}</Cell>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="p-6">
        {!embedded && (
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Question {index + 1}</p>
        )}
        {question.question_type !== "fill-in-the-blank" && (question.question_data.promptHtml ? (
          <div className="rich-text-content mt-3 text-xl leading-8" dangerouslySetInnerHTML={{ __html: question.question_data.promptHtml }} />
        ) : (
          <h3 className="mt-3 text-xl font-semibold leading-8">{question.prompt}</h3>
        ))}

        {question.question_type === "multiple-choice" && question.question_data.choiceTable?.enabled ? (
          <ChoiceTablePreview table={question.question_data.choiceTable} selectionMode={getMultipleChoiceSelectionMode(question.question_data)} />
        ) : question.question_type === "multiple-choice" && (
          <div className={`mt-6 grid w-fit max-w-full ${hasChoiceImages ? "grid-cols-1 gap-4 sm:grid-cols-2" : "grid-cols-[fit-content(32rem)] gap-3"}`}>
            {question.question_data.choices?.map((choice, choiceIndex) => (
              <div key={choiceIndex} className={`w-full rounded-xl border-2 border-slate-200 text-slate-700 ${hasChoiceImages ? "max-w-[22rem] p-4" : "max-w-full px-5 py-3"}`}>
                {getMultipleChoiceSelectionMode(question.question_data) === "multiple" && <span className="mr-3 inline-block h-5 w-5 rounded border-2 border-slate-500 align-middle" />}
                {question.question_data.choiceImages?.[choiceIndex]?.imageUrl && (
                  <img
                    src={question.question_data.choiceImages[choiceIndex].imageUrl}
                    alt={choice}
                    className="mx-auto mb-3 h-auto max-h-72 w-auto max-w-full rounded-lg object-contain"
                  />
                )}
                {question.question_data.choiceHtml?.[choiceIndex] ? <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: question.question_data.choiceHtml[choiceIndex] }} /> : choice}
              </div>
            ))}
          </div>
        )}
        {question.question_type === "dropdown" && (
          <div className="mt-6"><DropdownQuestionPreview data={normalizeDropdownData(question.question_data.dropdown)} /></div>
        )}
        {question.question_type === "short-answer" && (
          <div className="mt-6 space-y-4">
            {question.question_data.answerBoxes?.map((box, boxIndex) => (
              <label key={box.id} className="block text-sm font-medium text-slate-600">
                {box.label || `Answer ${boxIndex + 1}`}
                <span className="mt-2 block h-12 rounded-xl border border-slate-300 bg-white" />
              </label>
            ))}
          </div>
        )}
        {question.question_type === "fill-in-the-blank" && (
          <div className="mt-6">
            <FillBlankQuestion
              preview
              data={normalizeFillBlankData(
                question.question_data.fillBlank,
                question.question_data.template,
                question.question_data.blanks,
              )}
            />
          </div>
        )}
        {question.question_type === "sorting-order" && (
          <div className="mt-6 space-y-2">
            {(question.question_data.sortingItems || []).map((item, itemIndex) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-700">{itemIndex + 1}</span>
                {item.imageUrl && <img src={item.imageUrl} alt="" className="h-12 w-12 rounded object-cover" />}
                <span className="font-medium">{getSortingItemDisplayLabel(item, `Item ${itemIndex + 1}`)}</span>
              </div>
            ))}
          </div>
        )}
        {question.question_type === "sorting-category" && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {question.question_data.sortingCategories?.map((category) => (
              <div key={category.id} className="min-h-24 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-3 font-semibold text-blue-800">{category.name}</div>
            ))}
          </div>
        )}
        {question.question_type === "image-question" && (
          <div className="mt-6">
            {question.question_data.imageUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={question.question_data.imageUrl} alt="Question" className="w-full object-contain" />
                {question.question_data.overlayBoxes?.map((box) => (
                  <span key={box.id} className="absolute flex items-center justify-center rounded border-2 border-blue-500 bg-white/90 px-1 text-[10px] font-semibold text-blue-700" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}>{box.label || "Answer"}</span>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssessmentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [draftOwnerId, setDraftOwnerId] = useState("");
  const [closingQuestion, setClosingQuestion] = useState(false);
  const [publishingQuestion, setPublishingQuestion] = useState(false);
  const [assessmentId, setAssessmentId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [formulaSheetOpen, setFormulaSheetOpen] = useState(false);
  const [formulaSheetDraft, setFormulaSheetDraft] = useState<QuestionCanvasData>(createDefaultQuestionCanvas);
  const [savingFormulaSheet, setSavingFormulaSheet] = useState(false);
  const [formulaSheetError, setFormulaSheetError] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);

  const [questionType, setQuestionType] =
    useState<QuestionType>("multiple-choice");
  const [questionBuilderStep, setQuestionBuilderStep] = useState(1);
  const [questionSetupCollapsed, setQuestionSetupCollapsed] = useState(false);
  const [dragDropData, setDragDropData] = useState<DragDropData>(() => createDefaultDragDropData());
  const [dropdownData, setDropdownData] = useState<DropdownQuestionData>(() => createDefaultDropdownData());
  const [fillBlankData, setFillBlankData] = useState<FillBlankData>(() => createDefaultFillBlankData());
  const [questionCanvas, setQuestionCanvas] = useState<QuestionCanvasData>(() => createDefaultQuestionCanvas());
  const [leftQuestionCanvas, setLeftQuestionCanvas] = useState<QuestionCanvasData>(() => createDefaultQuestionCanvas());
  const [selectedDragDropItemFiles, setSelectedDragDropItemFiles] = useState<Record<string, File>>({});
  const [dragDropItemPreviewUrls, setDragDropItemPreviewUrls] = useState<Record<string, string>>({});
  const selectedDragDropItemFilesRef = useRef<Record<string, File>>({});
  const uploadedDragDropFilesRef = useRef(new WeakMap<File, { imageUrl: string; imagePath: string }>());

  const [questionLayout, setQuestionLayout] =
    useState<QuestionLayout>("standard");
  const [layoutSelectionMade, setLayoutSelectionMade] = useState(false);
  const [splitEditorTab, setSplitEditorTab] = useState<SplitEditorTab>("left");
  const [leftPanelTitle, setLeftPanelTitle] = useState("");
  const [leftPanelTopContent, setLeftPanelTopContent] = useState("");
  const [leftPanelContent, setLeftPanelContent] = useState("");
  const [selectedLeftPanelImageFile, setSelectedLeftPanelImageFile] =
    useState<File | null>(null);
  const [existingLeftPanelImageUrl, setExistingLeftPanelImageUrl] = useState("");
  const [existingLeftPanelImagePath, setExistingLeftPanelImagePath] = useState("");
  const [leftPanelImagePreviewUrl, setLeftPanelImagePreviewUrl] = useState("");
  const [showUploadedImagePicker, setShowUploadedImagePicker] = useState(false);
  const [selectedReferenceQuestionId, setSelectedReferenceQuestionId] = useState("");
  const [referenceBuilds, setReferenceBuilds] = useState<ReferenceBuild[]>([]);
  const [referenceBuildName, setReferenceBuildName] = useState("");
  const [savingReferenceBuild, setSavingReferenceBuild] = useState(false);
  const [deletingReferenceBuild, setDeletingReferenceBuild] = useState(false);
  const [accountImages, setAccountImages] = useState<AccountImage[]>([]);
  const [leftPanelTableEnabled, setLeftPanelTableEnabled] = useState(false);
  const [leftPanelTableHasBorder, setLeftPanelTableHasBorder] = useState(true);
  const [leftPanelTableCells, setLeftPanelTableCells] = useState<string[][]>([
    ["", ""],
    ["", ""],
  ]);

  const [choiceTexts, setChoiceTexts] = useState<string[]>([]);
  const [choiceHtml, setChoiceHtml] = useState<string[]>([]);
  const [choiceIds, setChoiceIds] = useState<string[]>([]);
  const [correctChoiceIndex, setCorrectChoiceIndex] = useState(-1);
  const [correctChoiceIndexes, setCorrectChoiceIndexes] = useState<number[]>([]);
  const [multipleChoiceSelectionMode, setMultipleChoiceSelectionMode] = useState<MultipleChoiceSelectionMode | null>(null);
  const [choiceTableEnabled, setChoiceTableEnabled] = useState(false);
  const [choiceTableHeaders, setChoiceTableHeaders] = useState(["Column 1", "Column 2"]);
  const [choiceTableRows, setChoiceTableRows] = useState<string[][]>(
    Array.from({ length: 4 }, () => ["", ""])
  );
  const [choiceTableHasBorder, setChoiceTableHasBorder] = useState(true);
  const [choiceTableCellImages, setChoiceTableCellImages] = useState<MultipleChoiceImage[][]>(
    Array.from({ length: 4 }, () => Array.from({ length: 2 }, () => ({ imageUrl: "", imagePath: "" })))
  );
  const [selectedChoiceTableCellFiles, setSelectedChoiceTableCellFiles] = useState<Record<string, File>>({});
  const [choiceTableCellPreviewUrls, setChoiceTableCellPreviewUrls] = useState<Record<string, string>>({});
  const [choiceTableUploadedPickerCell, setChoiceTableUploadedPickerCell] = useState<string | null>(null);
  const [multipleChoiceImages, setMultipleChoiceImages] = useState<MultipleChoiceImage[]>([]);
  const [selectedMultipleChoiceImageFiles, setSelectedMultipleChoiceImageFiles] =
    useState<Record<number, File>>({});
  const [multipleChoiceImagePreviewUrls, setMultipleChoiceImagePreviewUrls] =
    useState<Record<number, string>>({});
  const [multipleChoiceUploadedPickerIndex, setMultipleChoiceUploadedPickerIndex] =
    useState<number | null>(null);

  const [answerBoxes, setAnswerBoxes] = useState<AnswerBox[]>([
    createAnswerBox(),
  ]);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [existingImagePath, setExistingImagePath] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  const [overlayBoxes, setOverlayBoxes] = useState<OverlayBox[]>([]);
  const [selectedOverlayBoxId, setSelectedOverlayBoxId] = useState<
    string | null
  >(null);
  const [overlayAnswerMode, setOverlayAnswerMode] =
    useState<OverlayAnswerMode>("text-entry");
  const [draggableChoices, setDraggableChoices] = useState<DraggableChoice[]>([
    createDraggableChoice(),
  ]);
  const [draggableImageChoices, setDraggableImageChoices] = useState<
    DraggableImageChoice[]
  >([]);
  const [selectedImageChoiceFiles, setSelectedImageChoiceFiles] = useState<
    Record<string, File>
  >({});
  const [imageChoicePreviewUrls, setImageChoicePreviewUrls] = useState<
    Record<string, string>
  >({});
  const [selectedSortingItemFiles, setSelectedSortingItemFiles] = useState<
    Record<string, File>
  >({});
  const [sortingItemPreviewUrls, setSortingItemPreviewUrls] = useState<
    Record<string, string>
  >({});

  const [sortingItems, setSortingItems] = useState<SortingItem[]>([
    createSortingItem(),
    createSortingItem(),
  ]);
  const [sortingCategories, setSortingCategories] = useState<SortingCategory[]>([
    createSortingCategory("Category 1"),
    createSortingCategory("Category 2"),
  ]);

  const imageAreaRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<string[]>([]);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const [reorderingQuestions, setReorderingQuestions] = useState(false);

  // Only editor input changes create snapshots; save status/list updates cannot reset the form.
  const editorSnapshot = useMemo(() => ({
    questionType,
    questionBuilderStep,
    questionSetupCollapsed,
    dragDropData,
    dropdownData,
    fillBlankData,
    questionCanvas,
    leftQuestionCanvas,
    selectedDragDropItemFiles,
    dragDropItemPreviewUrls,
    questionLayout,
    layoutSelectionMade,
    splitEditorTab,
    leftPanelTitle,
    leftPanelTopContent,
    leftPanelContent,
    selectedLeftPanelImageFile,
    existingLeftPanelImageUrl,
    existingLeftPanelImagePath,
    leftPanelImagePreviewUrl,
    selectedReferenceQuestionId,
    referenceBuildName,
    leftPanelTableEnabled,
    leftPanelTableHasBorder,
    leftPanelTableCells,
    choiceTexts,
    choiceHtml,
    choiceIds,
    correctChoiceIndex,
    correctChoiceIndexes,
    multipleChoiceSelectionMode,
    choiceTableEnabled,
    choiceTableHeaders,
    choiceTableRows,
    choiceTableHasBorder,
    choiceTableCellImages,
    selectedChoiceTableCellFiles,
    choiceTableCellPreviewUrls,
    multipleChoiceImages,
    selectedMultipleChoiceImageFiles,
    multipleChoiceImagePreviewUrls,
    answerBoxes,
    selectedImageFile,
    existingImageUrl,
    existingImagePath,
    imagePreviewUrl,
    overlayBoxes,
    overlayAnswerMode,
    draggableChoices,
    draggableImageChoices,
    selectedImageChoiceFiles,
    imageChoicePreviewUrls,
    selectedSortingItemFiles,
    sortingItemPreviewUrls,
    sortingItems,
    sortingCategories,
    editingQuestionId,
  }), [
    questionType,
    questionBuilderStep,
    questionSetupCollapsed,
    dragDropData,
    dropdownData,
    fillBlankData,
    questionCanvas,
    leftQuestionCanvas,
    selectedDragDropItemFiles,
    dragDropItemPreviewUrls,
    questionLayout,
    layoutSelectionMade,
    splitEditorTab,
    leftPanelTitle,
    leftPanelTopContent,
    leftPanelContent,
    selectedLeftPanelImageFile,
    existingLeftPanelImageUrl,
    existingLeftPanelImagePath,
    leftPanelImagePreviewUrl,
    selectedReferenceQuestionId,
    referenceBuildName,
    leftPanelTableEnabled,
    leftPanelTableHasBorder,
    leftPanelTableCells,
    choiceTexts,
    choiceHtml,
    choiceIds,
    correctChoiceIndex,
    correctChoiceIndexes,
    multipleChoiceSelectionMode,
    choiceTableEnabled,
    choiceTableHeaders,
    choiceTableRows,
    choiceTableHasBorder,
    choiceTableCellImages,
    selectedChoiceTableCellFiles,
    choiceTableCellPreviewUrls,
    multipleChoiceImages,
    selectedMultipleChoiceImageFiles,
    multipleChoiceImagePreviewUrls,
    answerBoxes,
    selectedImageFile,
    existingImageUrl,
    existingImagePath,
    imagePreviewUrl,
    overlayBoxes,
    overlayAnswerMode,
    draggableChoices,
    draggableImageChoices,
    selectedImageChoiceFiles,
    imageChoicePreviewUrls,
    selectedSortingItemFiles,
    sortingItemPreviewUrls,
    sortingItems,
    sortingCategories,
    editingQuestionId,
  ]);
  const questionDrafts = useQuestionDrafts({
    ownerId: draftOwnerId, assessmentId, snapshot: editorSnapshot,
    enabled: questionModalOpen && !publishingQuestion,
  });

  async function deleteQuestionDraft(record: QuestionDraft) {
    try {
      await questionDrafts.remove(record);
      if (questionDrafts.activeId === record.id) resetQuestionForm();
    } catch {
      alert("This draft could not be deleted. Please try again.");
    }
  }

  async function resumeQuestionDraft(record: QuestionDraft) {
    try {
      const snapshot = await questionDrafts.restore(record);
      if (snapshot.existingImagePath) {
        snapshot.existingImageUrl = await createPrivateImageUrl(supabase, snapshot.existingImagePath).catch(() => snapshot.existingImageUrl);
        if (!snapshot.selectedImageFile) snapshot.imagePreviewUrl = snapshot.existingImageUrl;
      }
      if (snapshot.existingLeftPanelImagePath) {
        snapshot.existingLeftPanelImageUrl = await createPrivateImageUrl(supabase, snapshot.existingLeftPanelImagePath).catch(() => snapshot.existingLeftPanelImageUrl);
        if (!snapshot.selectedLeftPanelImageFile) snapshot.leftPanelImagePreviewUrl = snapshot.existingLeftPanelImageUrl;
      }
      snapshot.multipleChoiceImages.forEach((image, index) => {
        if (!snapshot.selectedMultipleChoiceImageFiles[index]) snapshot.multipleChoiceImagePreviewUrls[index] = image.imageUrl;
      });
      snapshot.dragDropData.items.forEach(item => {
        if (!snapshot.selectedDragDropItemFiles[item.id]) snapshot.dragDropItemPreviewUrls[item.id] = item.imageUrl || "";
      });
      snapshot.choiceTableCellImages.forEach((row, rowIndex) => row.forEach((image, columnIndex) => {
        const key = `${rowIndex}-${columnIndex}`;
        if (!snapshot.selectedChoiceTableCellFiles[key]) snapshot.choiceTableCellPreviewUrls[key] = image.imageUrl;
      }));

      setQuestionType(snapshot.questionType);
      setQuestionBuilderStep(snapshot.questionBuilderStep);
      setQuestionSetupCollapsed(snapshot.questionSetupCollapsed);
      setDragDropData((snapshot.questionType === "drag-and-drop" || snapshot.questionType === "sort-into-groups") ? asLocationDragDropData(snapshot.dragDropData) : snapshot.dragDropData);
      setDropdownData(snapshot.dropdownData);
      setFillBlankData(snapshot.fillBlankData);
      setQuestionCanvas(snapshot.questionCanvas);
      setLeftQuestionCanvas(snapshot.leftQuestionCanvas);
      setSelectedDragDropItemFiles(snapshot.selectedDragDropItemFiles);
      setDragDropItemPreviewUrls(snapshot.dragDropItemPreviewUrls);
      setQuestionLayout(snapshot.questionLayout);
      setLayoutSelectionMade(snapshot.layoutSelectionMade);
      setSplitEditorTab(snapshot.splitEditorTab);
      setLeftPanelTitle(snapshot.leftPanelTitle);
      setLeftPanelTopContent(snapshot.leftPanelTopContent);
      setLeftPanelContent(snapshot.leftPanelContent);
      setSelectedLeftPanelImageFile(snapshot.selectedLeftPanelImageFile);
      setExistingLeftPanelImageUrl(snapshot.existingLeftPanelImageUrl);
      setExistingLeftPanelImagePath(snapshot.existingLeftPanelImagePath);
      setLeftPanelImagePreviewUrl(snapshot.leftPanelImagePreviewUrl);
      setSelectedReferenceQuestionId(snapshot.selectedReferenceQuestionId);
      setReferenceBuildName(snapshot.referenceBuildName);
      setLeftPanelTableEnabled(snapshot.leftPanelTableEnabled);
      setLeftPanelTableHasBorder(snapshot.leftPanelTableHasBorder);
      setLeftPanelTableCells(snapshot.leftPanelTableCells);
      setChoiceTexts(snapshot.choiceTexts);
      setChoiceHtml(snapshot.choiceHtml);
      setChoiceIds(snapshot.choiceIds);
      setCorrectChoiceIndex(snapshot.correctChoiceIndex);
      setCorrectChoiceIndexes(snapshot.correctChoiceIndexes);
      setMultipleChoiceSelectionMode(snapshot.multipleChoiceSelectionMode);
      setChoiceTableEnabled(snapshot.choiceTableEnabled);
      setChoiceTableHeaders(snapshot.choiceTableHeaders);
      setChoiceTableRows(snapshot.choiceTableRows);
      setChoiceTableHasBorder(snapshot.choiceTableHasBorder);
      setChoiceTableCellImages(snapshot.choiceTableCellImages);
      setSelectedChoiceTableCellFiles(snapshot.selectedChoiceTableCellFiles);
      setChoiceTableCellPreviewUrls(snapshot.choiceTableCellPreviewUrls);
      setMultipleChoiceImages(snapshot.multipleChoiceImages);
      setSelectedMultipleChoiceImageFiles(snapshot.selectedMultipleChoiceImageFiles);
      setMultipleChoiceImagePreviewUrls(snapshot.multipleChoiceImagePreviewUrls);
      setAnswerBoxes(snapshot.answerBoxes);
      setSelectedImageFile(snapshot.selectedImageFile);
      setExistingImageUrl(snapshot.existingImageUrl);
      setExistingImagePath(snapshot.existingImagePath);
      setImagePreviewUrl(snapshot.imagePreviewUrl);
      setOverlayBoxes(snapshot.overlayBoxes);
      setOverlayAnswerMode(snapshot.overlayAnswerMode);
      setDraggableChoices(snapshot.draggableChoices);
      setDraggableImageChoices(snapshot.draggableImageChoices);
      setSelectedImageChoiceFiles(snapshot.selectedImageChoiceFiles);
      setImageChoicePreviewUrls(snapshot.imageChoicePreviewUrls);
      setSelectedSortingItemFiles(snapshot.selectedSortingItemFiles);
      setSortingItemPreviewUrls(snapshot.sortingItemPreviewUrls);
      setSortingItems(snapshot.sortingItems);
      setSortingCategories(snapshot.sortingCategories);
      setEditingQuestionId(snapshot.editingQuestionId);
      selectedDragDropItemFilesRef.current = { ...snapshot.selectedDragDropItemFiles };
      setQuestionModalOpen(true);
    } catch {
      alert("This draft could not be opened. Please try again.");
    }
  }

  async function closeQuestionEditor() {
    setClosingQuestion(true);
    try {
      await questionDrafts.save(false);
      resetQuestionForm();
    } catch {
      alert("Your draft could not be saved. Keep the editor open and try again.");
    } finally { setClosingQuestion(false); }
  }

  async function saveQuestionDraft() {
    try { await questionDrafts.save(); }
    catch { alert("Your draft could not be saved. Keep the editor open and try again."); }
  }

  async function publishQuestion() {
    if (publishingQuestion || !validateQuestionForm()) return;
    setPublishingQuestion(true);
    try {
      await questionDrafts.save();
      if (editingQuestionId) await updateQuestion();
      else await addQuestion();
    } catch {
      alert("Your draft could not be saved. Please try again.");
    } finally {
      setPublishingQuestion(false);
    }
  }

  const imageQuestionIsScored = useMemo(() => {
    return overlayBoxes.length > 0;
  }, [overlayBoxes]);

  const uploadedImages = useMemo(() => {
    const images = new Map<
      string,
      { id?: string; url: string; path: string; label: string }
    >();

    function addImage(url: string | undefined, path: string | undefined, label: string, id?: string) {
      if (url && !images.has(url)) {
        images.set(url, { id, url, path: path || "", label });
      }
    }

    accountImages.forEach((image) => addImage(image.image_url, image.image_path, image.label, image.id));

    questions.forEach((question, questionIndex) => {
      const label = `Question ${questionIndex + 1}`;
      addImage(
        question.question_data.leftPanelImageUrl,
        question.question_data.leftPanelImagePath,
        `${label} · Left panel`
      );
      addImage(
        question.question_data.imageUrl,
        question.question_data.imagePath,
        `${label} · Question image`
      );
      question.question_data.sortingItems?.forEach((item, itemIndex) =>
        addImage(item.imageUrl, item.imagePath, `${label} · Sorting item ${itemIndex + 1}`)
      );
      question.question_data.dragDrop?.items?.forEach((item, itemIndex) =>
        addImage(item.imageUrl, item.imagePath, `${label} · Drag item ${itemIndex + 1}`)
      );
      question.question_data.dragDrop?.canvasElements?.forEach((element, elementIndex) => {
        if (element.type === "image") addImage(element.imageUrl, element.imagePath, `${label} · Canvas image ${elementIndex + 1}`);
      });
      addImage(
        question.question_data.dragDrop?.backgroundImageUrl,
        question.question_data.dragDrop?.backgroundImagePath,
        `${label} · Location background`
      );
      question.question_data.canvas?.elements.forEach((element, elementIndex) => {
        if (element.type === "image") addImage(element.imageUrl, element.imagePath, `${label} · Question canvas image ${elementIndex + 1}`);
      });
      addImage(question.question_data.canvas?.backgroundImageUrl, question.question_data.canvas?.backgroundImagePath, `${label} · Question canvas background`);
      question.question_data.leftCanvas?.elements.forEach((element, elementIndex) => {
        if (element.type === "image") addImage(element.imageUrl, element.imagePath, `${label} · Left canvas image ${elementIndex + 1}`);
      });
      addImage(question.question_data.leftCanvas?.backgroundImageUrl, question.question_data.leftCanvas?.backgroundImagePath, `${label} · Left canvas background`);
      question.question_data.draggableImageChoices?.forEach((choice) =>
        addImage(choice.imageUrl, choice.imagePath, `${label} · ${choice.label}`)
      );
      question.question_data.choiceImages?.forEach((choice, choiceIndex) =>
        addImage(
          choice.imageUrl,
          choice.imagePath,
          `${label} · Choice ${String.fromCharCode(65 + choiceIndex)}`
        )
      );
    });

    Object.entries(selectedDragDropItemFiles).forEach(([itemId, file]) => {
      const previewUrl = dragDropItemPreviewUrls[itemId];
      const itemIndex = dragDropData.items.findIndex((item) => item.id === itemId);
      if (previewUrl) {
        addImage(
          previewUrl,
          "",
          `Current question · ${dragDropData.items[itemIndex]?.content || file.name || `Item ${itemIndex + 1}`}`
        );
      }
    });

    return Array.from(images.values());
  }, [accountImages, dragDropData.items, dragDropItemPreviewUrls, questions, selectedDragDropItemFiles]);

  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      setAssessmentId(resolvedParams.id);
      loadAssessment(resolvedParams.id);
    }

    getParams();
  }, [params]);

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!dragState || !imageAreaRef.current) {
        return;
      }

      const imageRect = imageAreaRef.current.getBoundingClientRect();

      const deltaXPercent =
        ((event.clientX - dragState.startMouseX) / imageRect.width) * 100;
      const deltaYPercent =
        ((event.clientY - dragState.startMouseY) / imageRect.height) * 100;

      setOverlayBoxes((currentBoxes) =>
        currentBoxes.map((box) => {
          if (box.id !== dragState.boxId) {
            return box;
          }

          if (dragState.mode === "move") {
            const newX = clampNumber(
              dragState.startBox.x + deltaXPercent,
              0,
              100 - dragState.startBox.width
            );

            const newY = clampNumber(
              dragState.startBox.y + deltaYPercent,
              0,
              100 - dragState.startBox.height
            );

            return {
              ...box,
              x: Number(newX.toFixed(2)),
              y: Number(newY.toFixed(2)),
            };
          }

          if (dragState.mode === "resize") {
            const newWidth = clampNumber(
              dragState.startBox.width + deltaXPercent,
              3,
              100 - dragState.startBox.x
            );

            const newHeight = clampNumber(
              dragState.startBox.height + deltaYPercent,
              3,
              100 - dragState.startBox.y
            );

            return {
              ...box,
              width: Number(newWidth.toFixed(2)),
              height: Number(newHeight.toFixed(2)),
            };
          }

          return box;
        })
      );
    }

    function handlePointerUp() {
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState]);

  async function loadAssessment(id: string) {
    const user = await requireAccountRole("teacher");
    if (!user) return;
    setDraftOwnerId(user.id);

    const { data: assessmentData, error: assessmentError } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", id)
      .single();

    if (assessmentError) {
      alert(assessmentError.message);
      setLoading(false);
      return;
    }

    const { data: questionData, error: questionError } = await supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", id)
      .in("question_type", ["multiple-choice", "drag-and-drop", "sort-into-groups", "dropdown", "fill-in-the-blank"])
      .order("question_order", { ascending: true })
      .order("id", { ascending: true });

    if (questionError) {
      alert(questionError.message);
      setLoading(false);
      return;
    }

    const { data: referenceData, error: referenceError } = await supabase
      .from("reference_builds")
      .select("*")
      .order("name", { ascending: true });

    if (referenceError) {
      console.error("Could not load reference library:", referenceError.message);
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.access_token) {
        const response = await fetch("/api/account-images/recover", { method: "POST", headers: { Authorization: `Bearer ${sessionData.session.access_token}` } });
        if (!response.ok) console.error("Could not recover past image uploads.");
      }
    } catch (error) { console.error("Could not recover past image uploads:", error); }
    const imageData: AccountImage[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("account_images").select("*")
        .order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
      if (error) { console.error("Could not load account image library:", error.message); break; }
      imageData.push(...(data || []) as AccountImage[]);
      if (!data || data.length < 500) break;
    }

    let hydrated = {
      assessment: assessmentData as Assessment,
      questions: (questionData || []) as Question[],
      references: (referenceData || []) as ReferenceBuild[],
      images: (imageData || []) as AccountImage[],
    };
    try {
      hydrated = await hydratePrivateImageUrls(supabase, hydrated);
    } catch (error) {
      console.error("Could not authorize assessment images:", error);
    }

    setAssessment(hydrated.assessment);
    setTitleDraft(assessmentData.title);
    setQuestions(hydrated.questions);
    setReferenceBuilds(hydrated.references);
    setAccountImages(hydrated.images);
    setLoading(false);
  }

  async function saveFormulaSheet(value: QuestionCanvasData | null) {
    if (!assessment) return;
    setSavingFormulaSheet(true);
    setFormulaSheetError("");
    try {
      const { data, error } = await supabase.from("assessments")
        .update({ formula_sheet: value }).eq("id", assessment.id).select("id").single();
      if (error || !data) throw new Error(error?.message || "Could not save the formula sheet.");
      setAssessment((current) => current ? { ...current, formula_sheet: value } : current);
      setFormulaSheetOpen(false);
    } catch (error) {
      setFormulaSheetError(error instanceof Error ? error.message : "Could not save the formula sheet.");
    } finally {
      setSavingFormulaSheet(false);
    }
  }

  async function saveAssessmentTitle() {
    const nextTitle = titleDraft.trim();

    if (!assessmentId || !nextTitle || !assessment) {
      return;
    }

    if (nextTitle === assessment.title) {
      setEditingTitle(false);
      return;
    }

    setSavingTitle(true);

    const { error } = await supabase
      .from("assessments")
      .update({ title: nextTitle })
      .eq("id", assessmentId);

    if (error) {
      alert(error.message);
      setSavingTitle(false);
      return;
    }

    setAssessment({ ...assessment, title: nextTitle });
    setTitleDraft(nextTitle);
    setEditingTitle(false);
    setSavingTitle(false);
  }

  function getCanvasPromptHtml() {
    const elements = (questionType === "drag-and-drop" || questionType === "sort-into-groups")
      ? dragDropData.canvasElements || []
      : questionCanvas.elements;
    return elements
      .filter((element) => element.type === "text")
      .map((element) => element.textHtml || plainTextToHtml(element.text || ""))
      .filter((value) => richHtmlToPlainText(value))
      .join("<br>");
  }

  function getCanvasPromptText() {
    return richHtmlToPlainText(getCanvasPromptHtml());
  }

  function getDropdownBounds(entry: DropdownEntry, index: number) {
    return dropdownEntryBounds(entry, index);
  }

  function updateDropdownEntry(entryId: string, patch: Partial<DropdownEntry>) {
    setDropdownData((current) => ({
      ...current,
      layout: "inline",
      template: "",
      entries: current.entries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry),
    }));
  }

  function updateDropdownOptions(entry: DropdownEntry, options: string[]) {
    updateDropdownEntry(entry.id, {
      options,
      correctAnswer: options.includes(entry.correctAnswer)
        ? entry.correctAnswer
        : "",
    });
  }

  function updateDropdownOption(entry: DropdownEntry, optionIndex: number, value: string) {
    const options = entry.options || [];
    const previousValue = options[optionIndex] || "";
    const nextOptions = options.map((option, index) => index === optionIndex ? value : option);
    updateDropdownEntry(entry.id, {
      options: nextOptions,
      correctAnswer: entry.correctAnswer === previousValue ? value : entry.correctAnswer,
    });
  }

  function addDropdownToCanvas() {
    setDropdownData((current) => {
      const index = current.entries.length;
      const x = 8 + (index % 3) * 24;
      const y = Math.min(84, 35 + Math.floor(index / 3) * 14);
      return {
        layout: "inline",
        template: "",
        entries: [...current.entries, {
          id: makeDropdownId(),
          label: "",
          options: ["Option 1", "Option 2"],
          correctAnswer: "",
          x,
          y,
          width: Math.min(20, 100 - x),
          height: Math.min(8, 100 - y),
        }],
      };
    });
  }

  function updateFillBlank(blankId: string, patch: Partial<FillBlankEntry>) {
    setFillBlankData((current) => ({
      ...current,
      layout: "inline",
      template: "",
      blanks: current.blanks.map((blank) => blank.id === blankId ? { ...blank, ...patch } : blank),
    }));
  }

  function addFillBlankToCanvas() {
    setFillBlankData((current) => ({
      ...current,
      layout: "inline",
      template: "",
      blanks: [...current.blanks, createFillBlankEntry("text", current.blanks.length)],
    }));
    setQuestionCanvas((current) => ({ ...current, interaction: undefined }));
  }

  function removeFillBlank(blankId: string) {
    setFillBlankData((current) => ({ ...current, template: "", blanks: current.blanks.filter((blank) => blank.id !== blankId) }));
  }

  function dropdownEditor(entry: DropdownEntry, index: number) {
    const options = entry.options || [];
    return <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">Dropdown {index + 1}</p>
        <button type="button" onClick={() => setDropdownData((current) => ({ ...current, entries: current.entries.filter((item) => item.id !== entry.id) }))} className="text-xs font-semibold text-red-600 hover:text-red-700">Remove dropdown</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Select the circle beside the correct answer.</p>
      <div className="mt-3 space-y-2">
        {options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-2">
          <input type="radio" name={`correct-${entry.id}`} checked={entry.correctAnswer === option && Boolean(option.trim())} onChange={() => updateDropdownEntry(entry.id, { correctAnswer: option })} disabled={!option.trim()} aria-label={`Mark answer ${optionIndex + 1} correct`} className="h-4 w-4 shrink-0 accent-emerald-600" />
          <input value={option} onChange={(event) => updateDropdownOption(entry, optionIndex, event.target.value)} placeholder={`Answer ${optionIndex + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950" />
          <button type="button" onClick={() => updateDropdownOptions(entry, options.filter((_, itemIndex) => itemIndex !== optionIndex))} aria-label={`Remove answer ${optionIndex + 1}`} className="grid h-8 w-8 shrink-0 place-items-center rounded text-lg text-red-600 hover:bg-red-50">×</button>
        </div>)}
      </div>
      <button type="button" onClick={() => updateDropdownOptions(entry, [...options, ""])} className="mt-3 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">+ Add answer</button>
    </div>;
  }


  function resetQuestionForm() {
    setQuestionType("multiple-choice");
    setQuestionBuilderStep(1);
    setQuestionSetupCollapsed(false);
    setDragDropData(createDefaultDragDropData());
    setDropdownData(createDefaultDropdownData());
    setFillBlankData(createDefaultFillBlankData());
    setQuestionCanvas(createDefaultQuestionCanvas());
    setLeftQuestionCanvas(createDefaultQuestionCanvas());
    selectedDragDropItemFilesRef.current = {};
    setSelectedDragDropItemFiles({});
    setDragDropItemPreviewUrls({});
    setQuestionLayout("standard");
    setLayoutSelectionMade(false);
    setSplitEditorTab("right");
    setLeftPanelTitle("");
    setLeftPanelTopContent("");
    setLeftPanelContent("");
    setSelectedLeftPanelImageFile(null);
    setExistingLeftPanelImageUrl("");
    setExistingLeftPanelImagePath("");
    setLeftPanelImagePreviewUrl("");
    setShowUploadedImagePicker(false);
    setSelectedReferenceQuestionId("");
    setReferenceBuildName("");
    setLeftPanelTableEnabled(false);
    setLeftPanelTableHasBorder(true);
    setLeftPanelTableCells([["", ""], ["", ""]]);

    setChoiceTexts([]);
    setChoiceHtml([]);
    setChoiceIds([]);
    setCorrectChoiceIndex(-1);
    setCorrectChoiceIndexes([]);
    setMultipleChoiceSelectionMode(null);
    setChoiceTableEnabled(false);
    setChoiceTableHeaders(["Column 1", "Column 2"]);
    setChoiceTableRows(Array.from({ length: 4 }, () => ["", ""]));
    setChoiceTableHasBorder(true);
    setChoiceTableCellImages(Array.from({ length: 4 }, () => Array.from({ length: 2 }, () => ({ imageUrl: "", imagePath: "" }))));
    setSelectedChoiceTableCellFiles({});
    setChoiceTableCellPreviewUrls({});
    setChoiceTableUploadedPickerCell(null);
    setMultipleChoiceImages([]);
    setSelectedMultipleChoiceImageFiles({});
    setMultipleChoiceImagePreviewUrls({});
    setMultipleChoiceUploadedPickerIndex(null);

    setAnswerBoxes([createAnswerBox()]);

    setSelectedImageFile(null);
    setExistingImageUrl("");
    setExistingImagePath("");
    setImagePreviewUrl("");

    setOverlayBoxes([]);
    setSelectedOverlayBoxId(null);
    setOverlayAnswerMode("text-entry");
    setDraggableChoices([createDraggableChoice()]);
    setDraggableImageChoices([]);
    setSelectedImageChoiceFiles({});
    setImageChoicePreviewUrls({});
    setSelectedSortingItemFiles({});
    setSortingItemPreviewUrls({});
    setSortingItems([createSortingItem(), createSortingItem()]);
    setSortingCategories([createSortingCategory("Category 1"), createSortingCategory("Category 2")]);
    setDragState(null);

    setEditingQuestionId(null);
    setQuestionModalOpen(false);
  }

  function getChoicesFromForm() {
    if (choiceTableEnabled) {
      return choiceTableRows.map((_, index) => getTableChoiceValue(index));
    }
    return choiceTexts.map((choice) => choice.trim());
  }

  function getNextQuestionOrder() {
    return Math.max(0, ...questions.map((question) => question.question_order)) + 1;
  }

  function addMultipleChoiceOption() {
    setQuestionCanvas((current) => {
      const layout = current.choiceLayout;
      if (!layout?.sameSize) return current;
      const first = layout.positions[0];
      return { ...current, choiceLayout: { ...layout, positions: [...Array.from({ length: choiceIds.length }, (_, index) => layout.positions[index] || { x: 8, y: 35 + index * 12 }), { x: 8, y: 35 + choiceIds.length * 12, width: first?.width, height: first?.height }] } };
    });
    setChoiceIds((current) => [...current, makeDragDropId()]);
    setChoiceTexts((current) => [...current, ""]);
    setChoiceHtml((current) => [...current, ""]);
    setChoiceTableRows((current) => [
      ...current,
      Array.from({ length: choiceTableHeaders.length }, () => ""),
    ]);
    setChoiceTableCellImages((current) => [...current, Array.from({ length: choiceTableHeaders.length }, () => ({ imageUrl: "", imagePath: "" }))]);
    setMultipleChoiceImages((current) => [
      ...current,
      { imageUrl: "", imagePath: "" },
    ]);
  }

  function removeMultipleChoiceOption(index: number) {
    setChoiceTexts((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setChoiceHtml((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setChoiceIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setQuestionCanvas((current) => current.choiceLayout ? { ...current, choiceLayout: { ...current.choiceLayout, positions: current.choiceLayout.positions.filter((_, itemIndex) => itemIndex !== index) } } : current);
    setChoiceTableRows((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
    setChoiceTableCellImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setMultipleChoiceImages((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
    setSelectedMultipleChoiceImageFiles((current) =>
      Object.fromEntries(
        Object.entries(current)
          .filter(([key]) => Number(key) !== index)
          .map(([key, file]) => [Number(key) > index ? Number(key) - 1 : Number(key), file])
      )
    );
    setMultipleChoiceImagePreviewUrls((current) =>
      Object.fromEntries(
        Object.entries(current)
          .filter(([key]) => Number(key) !== index)
          .map(([key, url]) => [Number(key) > index ? Number(key) - 1 : Number(key), url])
      )
    );
    setCorrectChoiceIndex((current) => {
      if (current === index) return -1;
      return current > index ? current - 1 : current;
    });
    setCorrectChoiceIndexes((current) => {
      const adjusted = current
        .filter((choiceIndex) => choiceIndex !== index)
        .map((choiceIndex) => choiceIndex > index ? choiceIndex - 1 : choiceIndex);
      return adjusted;
    });
    setMultipleChoiceUploadedPickerIndex(null);
  }

  function renderMultipleChoiceImageControl(index: number, label: string) {
    const previewUrl =
      multipleChoiceImagePreviewUrls[index] ||
      multipleChoiceImages[index]?.imageUrl;

    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Optional image for {label}
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(event) =>
            handleMultipleChoiceImageChange(
              index,
              event.target.files?.[0] || null
            )
          }
          className="mt-2 block w-full text-xs text-slate-400 file:mr-2 file:rounded-md file:border-0 file:bg-blue-600 file:px-2 file:py-1.5 file:font-semibold file:text-white"
        />
        <button
          type="button"
          onClick={() =>
            setMultipleChoiceUploadedPickerIndex((current) =>
              current === index ? null : index
            )
          }
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-blue-600 hover:text-blue-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 20" />
          </svg>
          {multipleChoiceUploadedPickerIndex === index
            ? "Close uploaded images"
            : "Select from uploaded"}
        </button>

        {multipleChoiceUploadedPickerIndex === index && (
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-2">
            {uploadedImages.length === 0 ? (
              <p className="p-2 text-xs text-slate-500">
                No previously uploaded images are available yet.
              </p>
            ) : (
              <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                {uploadedImages.map((image) => (
                  <div key={image.url} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                      setMultipleChoiceImages((current) =>
                        current.map((currentImage, imageIndex) =>
                          imageIndex === index
                            ? { imageUrl: image.url, imagePath: image.path }
                            : currentImage
                        )
                      );
                      setSelectedMultipleChoiceImageFiles((current) => {
                        const next = { ...current };
                        delete next[index];
                        return next;
                      });
                      setMultipleChoiceImagePreviewUrls((current) => ({
                        ...current,
                        [index]: image.url,
                      }));
                      setMultipleChoiceUploadedPickerIndex(null);
                      }}
                      className="w-full overflow-hidden rounded-md border border-slate-700 bg-slate-900 p-1.5 text-left hover:border-blue-500"
                    >
                      <img src={image.url} alt={image.label} className="h-20 w-full rounded bg-white object-contain" />
                      <span className="mt-1 block truncate text-[10px] text-slate-400">{image.label}</span>
                    </button>
                    {image.id && <button type="button" onClick={() => void deleteAccountImage({ id: image.id!, image_url: image.url, image_path: image.path, label: image.label })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white opacity-0 shadow transition hover:bg-red-700 focus:opacity-100 group-hover:opacity-100" aria-label={`Delete ${image.label} from existing uploads`}>×</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {previewUrl && (
          <div className="mt-3">
            <img
              src={previewUrl}
              alt={`${label} preview`}
              className="h-36 w-full rounded-lg bg-white object-contain"
            />
            <button
              type="button"
              onClick={() => {
                setMultipleChoiceImages((current) =>
                  current.map((image, imageIndex) =>
                    imageIndex === index
                      ? { imageUrl: "", imagePath: "" }
                      : image
                  )
                );
                setSelectedMultipleChoiceImageFiles((current) => {
                  const next = { ...current };
                  delete next[index];
                  return next;
                });
                setMultipleChoiceImagePreviewUrls((current) => {
                  const next = { ...current };
                  delete next[index];
                  return next;
                });
              }}
              className="mt-2 text-xs font-semibold text-red-300 hover:text-red-200"
            >
              Remove image
            </button>
          </div>
        )}
      </div>
    );
  }

  function getCorrectChoice(choices: string[]) {
    return choices[correctChoiceIndex] || getImageChoiceValue(correctChoiceIndex);
  }

  function getCorrectChoices(choices: string[]) {
    const indexes = (multipleChoiceSelectionMode === "multiple" ? correctChoiceIndexes : [correctChoiceIndex])
      .filter((index) => index >= 0 && index < choices.length);
    return [...new Set(indexes.map((index) => choices[index] || getImageChoiceValue(index)))];
  }

  function validateQuestionForm(
    reportError: (message: string) => void = (message) => window.alert(message),
  ) {
    if (questionType === "multiple-choice") {
      if (!multipleChoiceSelectionMode) {
        reportError("Choose whether this question has one answer or multiple answers.");
        return false;
      }
      const choices = getChoicesFromForm();
      if (choices.length < 2) {
        reportError("Add at least two choices to the canvas.");
        return false;
      }
      if (getCorrectChoices(choices).length === 0) {
        reportError("Select at least one correct answer.");
        return false;
      }
      if (choiceTableEnabled) {
        if (choiceTableHeaders.some((header) => !header.trim())) {
          reportError("Enter a heading for every table column.");
          return false;
        }
        if (
          choiceTableRows.length < 2 ||
          choiceTableRows.some((row) => row.length !== choiceTableHeaders.length)
        ) {
          reportError("Add at least 2 table rows with matching columns.");
          return false;
        }
        return true;
      }

    }

    if ((questionType === "drag-and-drop" || questionType === "sort-into-groups")) {
      if (dragDropData.items.length < 1 || (dragDropData.preset !== "locations" && dragDropData.items.some((item) => !item.content.trim() && !item.imageUrl && !selectedDragDropItemFiles[item.id]))) {
        reportError("Add at least one complete draggable item.");
        return false;
      }
      if (dragDropData.preset === "sequence") {
        const targetCount = getSequenceTargetCount(dragDropData);
        const correctOrder = dragDropData.zones[0]?.correctItemIds.slice(0, targetCount) || [];
        const itemIds = new Set(dragDropData.items.map((item) => item.id));
        if (dragDropData.items.length < targetCount) {
          reportError(`Add at least ${targetCount} draggable choices for ${targetCount} drop targets.`);
          return false;
        }
        if (correctOrder.length !== targetCount || correctOrder.some((itemId) => !itemId || !itemIds.has(itemId)) || new Set(correctOrder).size !== targetCount) {
          reportError("Assign one different draggable choice to every correct position.");
          return false;
        }
      } else if (dragDropData.preset === "inline") {
        const blankCount = getInlineBlankCount(dragDropData.inlineText || "");
        const itemIds = new Set(dragDropData.items.map((item) => item.id));
        if (!dragDropData.inlineText?.trim() || blankCount < 1) {
          reportError("Write a sentence or passage and add at least one blank.");
          return false;
        }
        if (dragDropData.zones.length !== blankCount) {
          reportError("Each blank in the passage must have one matching answer-key row.");
          return false;
        }
        if (dragDropData.zones.some((zone) => !zone.correctItemIds[0] || !itemIds.has(zone.correctItemIds[0]))) {
          reportError("Choose the correct draggable answer for every blank.");
          return false;
        }
      } else if (dragDropData.preset === "locations") {
        const itemIds = new Set(dragDropData.items.map((item) => item.id));
        const correctItemIds = dragDropData.zones.flatMap((zone) => zone.correctItemIds);
        if (dragDropData.zones.length < 1) {
          reportError("Add at least one location target.");
          return false;
        }
        if (correctItemIds.some((itemId) => !itemId || !itemIds.has(itemId))) {
          reportError("Assigned answers must reference an existing draggable choice.");
          return false;
        }
        if (new Set(correctItemIds).size !== correctItemIds.length) {
          reportError("Each location target needs a different correct choice.");
          return false;
        }
      } else {
        if (dragDropData.zones.length < 1 || dragDropData.zones.some((zone) => !zone.label.trim())) {
          reportError("Add and name at least one drop target.");
          return false;
        }
        const itemIds = new Set(dragDropData.items.map((item) => item.id));
        const assignedItemIds = dragDropData.zones.flatMap((zone) => zone.correctItemIds);
        if (new Set(assignedItemIds).size !== assignedItemIds.length || assignedItemIds.some((itemId) => !itemIds.has(itemId)) || dragDropData.items.some((item) => !assignedItemIds.includes(item.id))) {
          reportError("Assign every draggable item to its correct target.");
          return false;
        }
      }
    }

    if (questionType === "dropdown") {
      const data = normalizeDropdownData(dropdownData);
      if (data.entries.length < 1 || data.entries.some((entry) => (entry.options || []).length < 2 || (entry.options || []).some((option) => !option.trim()))) {
        reportError("Add at least 2 complete choices to every dropdown.");
        return false;
      }
      if (!dropdownHasCompleteAnswerKey(data)) {
        reportError("Choose a correct answer from each dropdown's own choices.");
        return false;
      }
    }

    if (questionType === "short-answer") {
      if (answerBoxes.length === 0) {
        reportError("Please add at least one answer box.");
        return false;
      }

      if (
        answerBoxes.some((answerBox) => answerBox.correctAnswer.trim() === "")
      ) {
        reportError("Please enter a correct answer for every answer box.");
        return false;
      }
    }

    if (questionType === "fill-in-the-blank") {
      const data = normalizeFillBlankData(fillBlankData);
      if (data.blanks.length === 0) {
        reportError("Add at least one answer area to the canvas.");
        return false;
      }
      if (data.blanks.some((blank) => !blank.correctAnswer.trim())) {
        reportError("Enter a correct answer for every blank.");
        return false;
      }
    }

    if (questionType === "sorting-order") {
      const cleanedItems = getCleanedSortingItems();

      if (cleanedItems.length < 2) {
        reportError("Please add at least two sorting items.");
        return false;
      }
    }

    if (questionType === "sorting-category") {
      const cleanedItems = getCleanedSortingItems();
      const cleanedCategories = getCleanedSortingCategories();

      if (cleanedCategories.length < 2) {
        reportError("Please add at least two categories.");
        return false;
      }

      if (cleanedItems.length < 2) {
        reportError("Please add at least two sorting items.");
        return false;
      }

      const categoryIds = cleanedCategories.map((category) => category.id);
      const missingCategory = cleanedItems.find(
        (item) => !item.correctCategoryId || !categoryIds.includes(item.correctCategoryId)
      );

      if (missingCategory) {
        reportError("Please choose the correct category for every item.");
        return false;
      }
    }

    if (questionType === "image-question") {
      if (!selectedImageFile && !existingImageUrl) {
        reportError("Please upload an image for this question.");
        return false;
      }

      if (overlayBoxes.length === 0) {
        reportError("Add at least one answer area and assign its correct answer.");
        return false;
      }

      for (const box of overlayBoxes) {
        if (!box.correctAnswer.trim()) {
          reportError("Please enter a correct answer for every overlay box.");
          return false;
        }

        if (box.width <= 0 || box.height <= 0) {
          reportError("Overlay box width and height must be greater than 0.");
          return false;
        }
      }

      if (overlayAnswerMode === "drag-drop-text" && overlayBoxes.length > 0) {
        const cleanedChoices = draggableChoices
          .map((choice) => choice.text.trim())
          .filter(Boolean);

        if (cleanedChoices.length === 0) {
          reportError("Please add at least one draggable choice.");
          return false;
        }

        const missingChoice = overlayBoxes.find(
          (box) =>
            !cleanedChoices.some(
              (choice) =>
                normalizeAnswer(choice) === normalizeAnswer(box.correctAnswer)
            )
        );

        if (missingChoice) {
          reportError(
            "Every overlay box correct answer must also appear as a draggable choice."
          );
          return false;
        }
      }

      if (overlayAnswerMode === "drag-drop-image" && overlayBoxes.length > 0) {
        const usableImageChoices = draggableImageChoices.filter(
          (choice) =>
            choice.label.trim() &&
            (choice.imageUrl || selectedImageChoiceFiles[choice.id])
        );

        if (usableImageChoices.length === 0) {
          reportError("Please add at least one draggable image choice.");
          return false;
        }

        const usableImageChoiceIds = usableImageChoices.map((choice) => choice.id);

        const missingImageChoice = overlayBoxes.find(
          (box) => !usableImageChoiceIds.includes(box.correctAnswer)
        );

        if (missingImageChoice) {
          reportError(
            "Every overlay box correct answer must be selected from the draggable image choices."
          );
          return false;
        }
      }
    }

    return true;
  }

  function getQuestionValidationError() {
    let validationError = "";
    validateQuestionForm((message) => {
      validationError ||= message;
    });
    return validationError;
  }

  function updateAnswerBox(
    answerBoxId: string,
    field: "label" | "correctAnswer",
    value: string
  ) {
    setAnswerBoxes((currentBoxes) =>
      currentBoxes.map((box) =>
        box.id === answerBoxId ? { ...box, [field]: value } : box
      )
    );
  }

  function addAnswerBox() {
    setAnswerBoxes((currentBoxes) => [...currentBoxes, createAnswerBox()]);
  }

  function removeAnswerBox(answerBoxId: string) {
    if (answerBoxes.length === 1) {
      alert("A short answer question must have at least one answer box.");
      return;
    }

    setAnswerBoxes((currentBoxes) =>
      currentBoxes.filter((box) => box.id !== answerBoxId)
    );
  }

  function handleImageFileChange(file: File | null) {
    setSelectedImageFile(file);

    if (!file) {
      setImagePreviewUrl(existingImageUrl);
      return;
    }

    setImagePreviewUrl(URL.createObjectURL(file));
  }

  function handleLeftPanelImageChange(file: File | null) {
    setSelectedReferenceQuestionId("");
    setSelectedLeftPanelImageFile(file);

    if (!file) {
      setLeftPanelImagePreviewUrl(existingLeftPanelImageUrl);
      return;
    }

    setLeftPanelImagePreviewUrl(URL.createObjectURL(file));
  }

  function reuseSavedReference(referenceId: string) {
    setSelectedReferenceQuestionId(referenceId);
    const source = referenceBuilds.find((reference) => reference.id === referenceId);
    if (!source) return;
    setLeftPanelTitle(source.title || "");
    setLeftPanelTopContent(source.top_content || "");
    setLeftPanelContent(source.content || "");
    setSelectedLeftPanelImageFile(null);
    setExistingLeftPanelImageUrl(source.image_url || "");
    setExistingLeftPanelImagePath(source.image_path || "");
    setLeftPanelImagePreviewUrl(source.image_url || "");
    setLeftPanelTableEnabled(source.table_data?.enabled || false);
    setLeftPanelTableHasBorder(source.table_data?.hasBorder ?? true);
    setLeftPanelTableCells(source.table_data?.cells?.length ? source.table_data.cells.map((row) => [...row]) : [["", ""], ["", ""]]);
  }

  async function deleteSelectedReferenceBuild() {
    const referenceId = selectedReferenceQuestionId;
    const reference = referenceBuilds.find((item) => item.id === referenceId);
    if (!reference || !window.confirm(`Delete the saved reference “${reference.name}”?`)) return;

    setDeletingReferenceBuild(true);
    try {
      const { error } = await supabase.from("reference_builds").delete().eq("id", referenceId);
      if (error) throw new Error(error.message);
      setReferenceBuilds((current) => current.filter((item) => item.id !== referenceId));
      setSelectedReferenceQuestionId("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not delete the saved reference.");
    } finally {
      setDeletingReferenceBuild(false);
    }
  }

  async function saveReferenceBuild() {
    const name = referenceBuildName.trim();
    if (!name) {
      alert("Enter a name for this reference.");
      return;
    }
    setSavingReferenceBuild(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("You must be signed in to save a reference.");
      const image = await uploadLeftPanelImage();
      const { data, error } = await supabase.from("reference_builds").insert({
        owner_id: authData.user.id,
        name,
        title: leftPanelTitle.trim(),
        top_content: leftPanelTopContent.trim(),
        content: leftPanelContent.trim(),
        image_url: image.imageUrl,
        image_path: image.imagePath,
        table_data: {
          enabled: leftPanelTableEnabled,
          hasBorder: leftPanelTableHasBorder,
          cells: leftPanelTableCells.map((row) => row.map((cell) => cell.trim())),
        },
      }).select("*").single();
      if (error) throw new Error(error.message);
      setReferenceBuilds((current) => [...current, data as ReferenceBuild].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedReferenceQuestionId(data.id);
      setReferenceBuildName("");
      setSelectedLeftPanelImageFile(null);
      setExistingLeftPanelImageUrl(image.imageUrl);
      setExistingLeftPanelImagePath(image.imagePath);
      setLeftPanelImagePreviewUrl(image.imageUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save the reference.");
    } finally {
      setSavingReferenceBuild(false);
      setUploadingImage(false);
    }
  }

  function handleMultipleChoiceImageChange(index: number, file: File | null) {
    setSelectedMultipleChoiceImageFiles((current) => {
      const next = { ...current };
      if (file) next[index] = file;
      else delete next[index];
      return next;
    });
    setMultipleChoiceImagePreviewUrls((current) => {
      const next = { ...current };
      if (file) next[index] = URL.createObjectURL(file);
      else delete next[index];
      return next;
    });
  }

  function handleDragDropItemImageChange(itemId: string, file: File | null) {
    if (file) selectedDragDropItemFilesRef.current[itemId] = file;
    else delete selectedDragDropItemFilesRef.current[itemId];
    setSelectedDragDropItemFiles((current) => {
      const next = { ...current };
      if (file) next[itemId] = file;
      else delete next[itemId];
      return next;
    });
    setDragDropItemPreviewUrls((current) => {
      const next = { ...current };
      if (file) next[itemId] = URL.createObjectURL(file);
      else delete next[itemId];
      return next;
    });
    if (!file) return;

    void (async () => {
      setUploadingImage(true);
      try {
        const filePath = `${assessmentId}/drag-drop-library-${Date.now()}-${itemId}-${cleanFileName(file.name)}`;
        const { error } = await supabase.storage.from("question-images").upload(filePath, file, { upsert: false });
        if (error) throw new Error(error.message);
        const imageUrl = await createPrivateImageUrl(supabase, filePath);
        const uploadedImage = { imageUrl, imagePath: filePath };
        await rememberAccountImage(uploadedImage.imageUrl, uploadedImage.imagePath, file.name);
        uploadedDragDropFilesRef.current.set(file, uploadedImage);

        // The image stays in the account library even when the user removed or
        // replaced it while this upload was finishing.
        if (selectedDragDropItemFilesRef.current[itemId] !== file) return;
        delete selectedDragDropItemFilesRef.current[itemId];
        setSelectedDragDropItemFiles((current) => {
          if (current[itemId] !== file) return current;
          const next = { ...current };
          delete next[itemId];
          return next;
        });
        setDragDropItemPreviewUrls((current) => ({ ...current, [itemId]: uploadedImage.imageUrl }));
        setDragDropData((current) => ({
          ...current,
          items: current.items.map((item) => item.id === itemId ? { ...item, ...uploadedImage } : item),
        }));
      } catch (error) {
        alert(error instanceof Error ? error.message : "Could not upload the image.");
      } finally {
        setUploadingImage(false);
      }
    })();
  }

  function chooseDragDropItemImage(itemId: string, image: { url: string; path: string }) {
    const pendingSourceItemId = Object.entries(dragDropItemPreviewUrls).find(
      ([sourceItemId, previewUrl]) => previewUrl === image.url && selectedDragDropItemFiles[sourceItemId]
    )?.[0];
    const pendingFile = pendingSourceItemId ? selectedDragDropItemFiles[pendingSourceItemId] : undefined;

    setSelectedDragDropItemFiles((current) => {
      const next = { ...current };
      if (pendingFile) next[itemId] = pendingFile;
      else delete next[itemId];
      return next;
    });
    if (pendingFile) selectedDragDropItemFilesRef.current[itemId] = pendingFile;
    else delete selectedDragDropItemFilesRef.current[itemId];
    setDragDropItemPreviewUrls((current) => ({ ...current, [itemId]: image.url }));
    setDragDropData((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, imageUrl: pendingFile ? "" : image.url, imagePath: pendingFile ? "" : image.path } : item),
    }));
  }

  function removeDragDropItemImage(itemId: string) {
    handleDragDropItemImageChange(itemId, null);
    setDragDropData((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, imageUrl: "", imagePath: "" } : item),
    }));
  }

  async function rememberAccountImage(imageUrl: string, imagePath: string, label: string) {
    if (!imageUrl || !imagePath) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new Error("You must be signed in to save an image.");
    const { data, error } = await supabase.from("account_images").upsert({
      owner_id: authData.user.id,
      image_url: imageUrl,
      image_path: imagePath,
      label: label.trim() || "Uploaded image",
    }, { onConflict: "owner_id,image_path" }).select("*").single();
    if (error) throw new Error(error.message);
    setAccountImages((current) => [data as AccountImage, ...current.filter((image) => image.id !== data.id)]);
  }

  async function uploadDragDropBackgroundImage(file: File) {
    setUploadingImage(true);
    try {
      const filePath = `${assessmentId}/location-background-${Date.now()}-${cleanFileName(file.name)}`;
      const { error } = await supabase.storage.from("question-images").upload(filePath, file, { upsert: false });
      if (error) throw new Error(error.message);
      const imageUrl = await createPrivateImageUrl(supabase, filePath);
      await rememberAccountImage(imageUrl, filePath, file.name);
      return { url: imageUrl, path: filePath };
    } finally {
      setUploadingImage(false);
    }
  }

  async function deleteAccountImage(image: Pick<AccountImage, "id" | "image_url" | "image_path" | "label">) {
    if (!window.confirm("Delete this image from your account? It will also be removed from every question and saved reference that uses it.")) return;

    const { data: removedPath, error } = await supabase.rpc("delete_account_image", { target_image: image.id });
    if (error) {
      alert(error.message);
      return;
    }

    setAccountImages((current) => current.filter((item) => item.id !== image.id));
    setQuestions((current) => current.map((question) => ({
      ...question,
      question_data: clearImageReference(question.question_data, image.image_url, image.image_path),
    })));
    setReferenceBuilds((current) => current.map((reference) => clearImageReference(reference, image.image_url, image.image_path)));
    setDragDropData((current) => clearImageReference(current, image.image_url, image.image_path));
    setQuestionCanvas((current) => clearImageReference(current, image.image_url, image.image_path));
    setLeftQuestionCanvas((current) => clearImageReference(current, image.image_url, image.image_path));
    setFormulaSheetDraft((current) => clearImageReference(current, image.image_url, image.image_path));
    setAssessment((current) => current ? { ...current, formula_sheet: clearImageReference(current.formula_sheet, image.image_url, image.image_path) } : current);
    setMultipleChoiceImages((current) => clearImageReference(current, image.image_url, image.image_path));
    setChoiceTableCellImages((current) => clearImageReference(current, image.image_url, image.image_path));
    setDragDropItemPreviewUrls((current) => Object.fromEntries(Object.entries(current).filter(([, url]) => url !== image.image_url)));
    setMultipleChoiceImagePreviewUrls((current) => Object.fromEntries(Object.entries(current).filter(([, url]) => url !== image.image_url)));
    setChoiceTableCellPreviewUrls((current) => Object.fromEntries(Object.entries(current).filter(([, url]) => url !== image.image_url)));
    if (leftPanelImagePreviewUrl === image.image_url || existingLeftPanelImagePath === image.image_path) {
      setSelectedReferenceQuestionId("");
      setSelectedLeftPanelImageFile(null);
      setExistingLeftPanelImageUrl("");
      setExistingLeftPanelImagePath("");
      setLeftPanelImagePreviewUrl("");
    }

    const storagePath = typeof removedPath === "string" && removedPath ? removedPath : image.image_path;
    if (storagePath) {
      const { error: storageError } = await supabase.storage.from("question-images").remove([storagePath]);
      if (storageError) alert(`The image references were deleted, but the stored file could not be removed: ${storageError.message}`);
    }
  }

  async function uploadDragDropItemImages(data: DragDropData) {
    const items: DragDropData["items"] = [];
    const uploadedFiles = new Map<File, { imageUrl: string; imagePath: string }>();
    for (const item of data.items) {
      const file = selectedDragDropItemFiles[item.id];
      if (!file) {
        items.push(item);
        continue;
      }
      const existingUpload = uploadedFiles.get(file) || uploadedDragDropFilesRef.current.get(file);
      if (existingUpload) {
        items.push({ ...item, ...existingUpload });
        continue;
      }
      setUploadingImage(true);
      const filePath = `${assessmentId}/drag-drop-${Date.now()}-${item.id}-${cleanFileName(file.name)}`;
      const { error } = await supabase.storage.from("question-images").upload(filePath, file, { upsert: false });
      if (error) {
        setUploadingImage(false);
        throw new Error(error.message);
      }
      const imageUrl = await createPrivateImageUrl(supabase, filePath);
      const uploadedImage = { imageUrl, imagePath: filePath };
      await rememberAccountImage(uploadedImage.imageUrl, uploadedImage.imagePath, item.content || file.name);
      uploadedFiles.set(file, uploadedImage);
      items.push({ ...item, ...uploadedImage });
    }
    setUploadingImage(false);
    return { ...data, items };
  }

  async function uploadMultipleChoiceImages() {
    const uploadedImages: MultipleChoiceImage[] = [];

    for (let index = 0; index < choiceTexts.length; index += 1) {
      const file = selectedMultipleChoiceImageFiles[index];
      if (!file) {
        uploadedImages.push(
          multipleChoiceImages[index] || { imageUrl: "", imagePath: "" }
        );
        continue;
      }

      setUploadingImage(true);
      const safeFileName = cleanFileName(file.name);
      const filePath = `${assessmentId}/multiple-choice-${Date.now()}-${index}-${safeFileName}`;
      const { error } = await supabase.storage
        .from("question-images")
        .upload(filePath, file, { upsert: false });
      if (error) {
        setUploadingImage(false);
        throw new Error(error.message);
      }
      const imageUrl = await createPrivateImageUrl(supabase, filePath);
      await rememberAccountImage(imageUrl, filePath, choiceTexts[index] || file.name);
      uploadedImages.push({ imageUrl, imagePath: filePath });
    }

    setUploadingImage(false);
    return uploadedImages;
  }

  async function uploadChoiceTableCellImages() {
    if (!choiceTableEnabled) return choiceTableCellImages;
    const nextImages = choiceTableRows.map((row, rowIndex) =>
      row.map((_, columnIndex) => choiceTableCellImages[rowIndex]?.[columnIndex] || { imageUrl: "", imagePath: "" })
    );
    for (let rowIndex = 0; rowIndex < choiceTableRows.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < choiceTableHeaders.length; columnIndex += 1) {
        const key = `${rowIndex}-${columnIndex}`;
        const file = selectedChoiceTableCellFiles[key];
        if (!file) continue;
        setUploadingImage(true);
        const filePath = `${assessmentId}/choice-table-${Date.now()}-${rowIndex}-${columnIndex}-${cleanFileName(file.name)}`;
        const { error } = await supabase.storage.from("question-images").upload(filePath, file, { upsert: false });
        if (error) { setUploadingImage(false); throw new Error(error.message); }
        const imageUrl = await createPrivateImageUrl(supabase, filePath);
        await rememberAccountImage(imageUrl, filePath, `${choiceTableHeaders[columnIndex] || `Column ${columnIndex + 1}`} · ${file.name}`);
        nextImages[rowIndex][columnIndex] = { imageUrl, imagePath: filePath };
      }
    }
    setUploadingImage(false);
    return nextImages;
  }

  function addOverlayBox() {
    const newBox = createOverlayBox();
    setOverlayBoxes((current) => [...current, newBox]);
    setSelectedOverlayBoxId(newBox.id);
  }

  function removeOverlayBox(overlayBoxId: string) {
    setOverlayBoxes((current) =>
      current.filter((box) => box.id !== overlayBoxId)
    );

    if (selectedOverlayBoxId === overlayBoxId) {
      setSelectedOverlayBoxId(null);
    }
  }

  function updateOverlayBox(
    overlayBoxId: string,
    field: keyof OverlayBox,
    value: string | number
  ) {
    setOverlayBoxes((current) =>
      current.map((box) => {
        if (box.id !== overlayBoxId) {
          return box;
        }

        if (
          field === "x" ||
          field === "y" ||
          field === "width" ||
          field === "height"
        ) {
          const numericValue =
            typeof value === "number" ? value : Number(value || 0);

          const updatedBox = {
            ...box,
            [field]:
              field === "x" || field === "y"
                ? clampNumber(numericValue, 0, 100)
                : clampNumber(numericValue, 1, 100),
          };

          return {
            ...updatedBox,
            x: clampNumber(updatedBox.x, 0, 100 - updatedBox.width),
            y: clampNumber(updatedBox.y, 0, 100 - updatedBox.height),
            width: clampNumber(updatedBox.width, 1, 100 - updatedBox.x),
            height: clampNumber(updatedBox.height, 1, 100 - updatedBox.y),
          };
        }

        return {
          ...box,
          [field]: value,
        };
      })
    );
  }

  function startOverlayDrag(
    event: PointerEvent<HTMLDivElement>,
    box: OverlayBox,
    mode: DragMode
  ) {
    event.preventDefault();
    event.stopPropagation();

    setSelectedOverlayBoxId(box.id);

    setDragState({
      boxId: box.id,
      mode,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startBox: box,
    });
  }

  function addDraggableChoice() {
    setDraggableChoices((current) => [...current, createDraggableChoice()]);
  }

  function addCorrectAnswersAsChoices() {
    const existingChoiceTexts = draggableChoices.map((choice) =>
      normalizeAnswer(choice.text)
    );

    const newChoices = overlayBoxes
      .map((box) => box.correctAnswer.trim())
      .filter(Boolean)
      .filter((answer) => !existingChoiceTexts.includes(normalizeAnswer(answer)))
      .map((answer) => createDraggableChoice(answer));

    if (newChoices.length === 0) {
      alert("There are no new correct answers to add.");
      return;
    }

    setDraggableChoices((current) => [
      ...current.filter((choice) => choice.text.trim()),
      ...newChoices,
    ]);
  }

  function updateDraggableChoice(choiceId: string, value: string) {
    setDraggableChoices((current) =>
      current.map((choice) =>
        choice.id === choiceId ? { ...choice, text: value } : choice
      )
    );
  }

  function removeDraggableChoice(choiceId: string) {
    if (draggableChoices.length === 1) {
      setDraggableChoices([createDraggableChoice()]);
      return;
    }

    setDraggableChoices((current) =>
      current.filter((choice) => choice.id !== choiceId)
    );
  }

  function addDraggableImageChoice() {
    setDraggableImageChoices((current) => [
      ...current,
      createDraggableImageChoice(),
    ]);
  }

  function updateDraggableImageChoiceLabel(choiceId: string, value: string) {
    setDraggableImageChoices((current) =>
      current.map((choice) =>
        choice.id === choiceId ? { ...choice, label: value } : choice
      )
    );
  }

  function handleDraggableImageChoiceFile(
    choiceId: string,
    file: File | null
  ) {
    if (!file) {
      setSelectedImageChoiceFiles((current) => {
        const copy = { ...current };
        delete copy[choiceId];
        return copy;
      });

      setImageChoicePreviewUrls((current) => {
        const copy = { ...current };
        delete copy[choiceId];
        return copy;
      });

      return;
    }

    setSelectedImageChoiceFiles((current) => ({
      ...current,
      [choiceId]: file,
    }));

    setImageChoicePreviewUrls((current) => ({
      ...current,
      [choiceId]: URL.createObjectURL(file),
    }));
  }

  function removeDraggableImageChoice(choiceId: string) {
    setDraggableImageChoices((current) =>
      current.filter((choice) => choice.id !== choiceId)
    );

    setSelectedImageChoiceFiles((current) => {
      const copy = { ...current };
      delete copy[choiceId];
      return copy;
    });

    setImageChoicePreviewUrls((current) => {
      const copy = { ...current };
      delete copy[choiceId];
      return copy;
    });

    setOverlayBoxes((current) =>
      current.map((box) =>
        box.correctAnswer === choiceId ? { ...box, correctAnswer: "" } : box
      )
    );
  }

  function updateSortingItem(
    itemId: string,
    field: "text" | "correctCategoryId" | "imageUrl" | "imagePath",
    value: string
  ) {
    setSortingItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function updateSortingItemFile(itemId: string, file: File | null) {
    if (!file) {
      setSelectedSortingItemFiles((current) => {
        const copy = { ...current };
        delete copy[itemId];
        return copy;
      });

      setSortingItemPreviewUrls((current) => ({
        ...current,
        [itemId]: sortingItems.find((item) => item.id === itemId)?.imageUrl || "",
      }));
      return;
    }

    setSelectedSortingItemFiles((current) => ({
      ...current,
      [itemId]: file,
    }));

    const reader = new FileReader();
    reader.onload = () => {
      setSortingItemPreviewUrls((current) => ({
        ...current,
        [itemId]: typeof reader.result === "string" ? reader.result : "",
      }));
    };
    reader.readAsDataURL(file);
  }

  function addSortingItem() {
    setSortingItems((current) => [...current, createSortingItem()]);
  }

  function removeSortingItem(itemId: string) {
    if (sortingItems.length <= 1) {
      alert("A sorting question must have at least one item.");
      return;
    }

    setSortingItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedSortingItemFiles((current) => {
      const copy = { ...current };
      delete copy[itemId];
      return copy;
    });
    setSortingItemPreviewUrls((current) => {
      const copy = { ...current };
      delete copy[itemId];
      return copy;
    });
  }

  function moveSortingItem(itemId: string, direction: "up" | "down") {
    setSortingItems((current) => {
      const currentIndex = current.findIndex((item) => item.id === itemId);

      if (currentIndex === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const updated = [...current];
      const [item] = updated.splice(currentIndex, 1);
      updated.splice(targetIndex, 0, item);
      return updated;
    });
  }

  function updateSortingCategory(categoryId: string, value: string) {
    setSortingCategories((current) =>
      current.map((category) =>
        category.id === categoryId ? { ...category, name: value } : category
      )
    );
  }

  function addSortingCategory() {
    setSortingCategories((current) => [
      ...current,
      createSortingCategory(`Category ${current.length + 1}`),
    ]);
  }

  function removeSortingCategory(categoryId: string) {
    if (sortingCategories.length <= 1) {
      alert("A category sorting question must have at least one category.");
      return;
    }

    setSortingCategories((current) =>
      current.filter((category) => category.id !== categoryId)
    );

    setSortingItems((current) =>
      current.map((item) =>
        item.correctCategoryId === categoryId
          ? { ...item, correctCategoryId: "" }
          : item
      )
    );
  }

  function getCleanedSortingItems() {
    return sortingItems
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        text: item.text.trim(),
        imageUrl: item.imageUrl || "",
        imagePath: item.imagePath || "",
        correctCategoryId: item.correctCategoryId || "",
      }))
      .filter(
        (item) =>
          sortingItemHasContent(item) || Boolean(selectedSortingItemFiles[item.id])
      );
  }

  function getCleanedSortingCategories() {
    return sortingCategories
      .map((category) => ({
        id: category.id || crypto.randomUUID(),
        name: category.name.trim(),
      }))
      .filter((category) => category.name.length > 0);
  }

  async function uploadSortingItemImages(items: SortingItem[]) {
    const uploadedItems: SortingItem[] = [];

    for (const item of items) {
      const selectedFile = selectedSortingItemFiles[item.id];

      if (!selectedFile) {
        uploadedItems.push(item);
        continue;
      }

      const safeFileName = cleanFileName(selectedFile.name);
      const filePath = `${assessmentId}/sorting-${Date.now()}-${item.id}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("question-images")
        .upload(filePath, selectedFile, {
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const imageUrl = await createPrivateImageUrl(supabase, filePath);
      await rememberAccountImage(imageUrl, filePath, item.text || selectedFile.name);

      uploadedItems.push({
        ...item,
        imageUrl,
        imagePath: filePath,
      });
    }

    return uploadedItems;
  }

  async function uploadQuestionImage() {
    if (!selectedImageFile) {
      return {
        imageUrl: existingImageUrl,
        imagePath: existingImagePath,
      };
    }

    setUploadingImage(true);

    const safeFileName = cleanFileName(selectedImageFile.name);
    const filePath = `${assessmentId}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("question-images")
      .upload(filePath, selectedImageFile, {
        upsert: false,
      });

    if (uploadError) {
      setUploadingImage(false);
      throw new Error(uploadError.message);
    }

    const imageUrl = await createPrivateImageUrl(supabase, filePath);

    await rememberAccountImage(imageUrl, filePath, selectedImageFile.name);

    setUploadingImage(false);

    return {
      imageUrl,
      imagePath: filePath,
    };
  }

  function getCleanedOverlayBoxes() {
    return overlayBoxes.map((box, index) => ({
      id: box.id || crypto.randomUUID(),
      label: box.label.trim() || `Box ${index + 1}`,
      correctAnswer: box.correctAnswer.trim(),
      x: clampNumber(Number(box.x), 0, 100),
      y: clampNumber(Number(box.y), 0, 100),
      width: clampNumber(Number(box.width), 1, 100),
      height: clampNumber(Number(box.height), 1, 100),
    }));
  }

  function getCleanedDraggableChoices() {
    return draggableChoices
      .map((choice) => ({
        id: choice.id || crypto.randomUUID(),
        text: choice.text.trim(),
      }))
      .filter((choice) => choice.text.length > 0);
  }

  async function uploadDraggableImageChoices() {
    const uploadedChoices: DraggableImageChoice[] = [];

    for (const choice of draggableImageChoices) {
      const label = choice.label.trim();

      if (!label && !choice.imageUrl && !selectedImageChoiceFiles[choice.id]) {
        continue;
      }

      if (!label) {
        throw new Error("Every draggable image choice needs a label.");
      }

      const selectedFile = selectedImageChoiceFiles[choice.id];

      if (selectedFile) {
        const safeFileName = cleanFileName(selectedFile.name);
        const filePath = `${assessmentId}/choices/${Date.now()}-${
          choice.id
        }-${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("question-images")
          .upload(filePath, selectedFile, {
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const imageUrl = await createPrivateImageUrl(supabase, filePath);
        await rememberAccountImage(imageUrl, filePath, label || selectedFile.name);

        uploadedChoices.push({
          id: choice.id,
          label,
          imageUrl,
          imagePath: filePath,
        });
      } else if (choice.imageUrl) {
        uploadedChoices.push({
          id: choice.id,
          label,
          imageUrl: choice.imageUrl,
          imagePath: choice.imagePath,
        });
      } else {
        throw new Error("Every draggable image choice needs an image.");
      }
    }

    return uploadedChoices;
  }

  async function uploadLeftPanelImage() {
    if (!selectedLeftPanelImageFile) {
      return {
        imageUrl: existingLeftPanelImageUrl,
        imagePath: existingLeftPanelImagePath,
      };
    }

    setUploadingImage(true);
    const safeFileName = cleanFileName(selectedLeftPanelImageFile.name);
    const filePath = `${assessmentId}/left-panel-${Date.now()}-${safeFileName}`;
    const { error } = await supabase.storage
      .from("question-images")
      .upload(filePath, selectedLeftPanelImageFile, { upsert: false });

    if (error) {
      setUploadingImage(false);
      throw new Error(error.message);
    }

    const imageUrl = await createPrivateImageUrl(supabase, filePath);

    await rememberAccountImage(imageUrl, filePath, leftPanelTitle || selectedLeftPanelImageFile.name);

    setUploadingImage(false);
    return { imageUrl, imagePath: filePath };
  }

  async function getQuestionLayoutData() {
    const leftPanelImage =
      questionLayout === "split"
        ? await uploadLeftPanelImage()
        : { imageUrl: "", imagePath: "" };

    const normalizedCanvas = normalizeQuestionCanvas(questionCanvas);
    const normalizedLeftCanvas = normalizeQuestionCanvas(leftQuestionCanvas);
    const hasLeftCanvasContent = Boolean(normalizedLeftCanvas.backgroundImageUrl || normalizedLeftCanvas.elements.length > 0);
    const savedCanvas = (questionType === "drag-and-drop" || questionType === "sort-into-groups")
      ? { ...createDefaultQuestionCanvas(), interaction: { x: 0, y: 0, width: 100, height: 100 } }
      : questionType === "dropdown" || questionType === "fill-in-the-blank"
        ? { ...normalizedCanvas, interaction: undefined }
      : questionType === "multiple-choice" && multipleChoiceSelectionMode === "multiple" && normalizedCanvas.choiceLayout
      ? { ...normalizedCanvas, choiceLayout: { ...normalizedCanvas.choiceLayout, presentation: "content" as const } }
      : normalizedCanvas;

    return {
      layout: questionLayout,
      promptHtml: getCanvasPromptHtml(),
      leftPanelTitle:
        questionLayout === "split" ? leftPanelTitle.trim() : "",
      leftPanelTopContent:
        questionLayout === "split" ? leftPanelTopContent.trim() : "",
      leftPanelContent:
        questionLayout === "split" ? leftPanelContent.trim() : "",
      leftPanelImageUrl: leftPanelImage.imageUrl,
      leftPanelImagePath: leftPanelImage.imagePath,
      leftPanelTable: {
        enabled:
          questionLayout === "split" &&
          leftPanelTableEnabled &&
          leftPanelTableCells.some((row) =>
            row.some((cell) => cell.trim().length > 0)
          ),
        hasBorder: leftPanelTableHasBorder,
        cells: leftPanelTableCells.map((row) =>
          row.map((cell) => cell.trim())
        ),
      },
      canvas: savedCanvas,
      leftCanvas: questionLayout === "split" && hasLeftCanvasContent ? normalizedLeftCanvas : undefined,
    };
  }

  async function addQuestion() {
    if (!assessmentId) {
      alert("Assessment not loaded yet.");
      return;
    }

    if (!validateQuestionForm()) {
      return;
    }

    try {
      if (questionType === "multiple-choice") {
        const choices = getChoicesFromForm();
        const correctAnswers = getCorrectChoices(choices);
        const correctChoice = correctAnswers[0] || getCorrectChoice(choices);
        const choiceImages = await uploadMultipleChoiceImages();
        const tableCellImages = await uploadChoiceTableCellImages();

        const { error } = await supabase.from("questions").upsert({ id: questionDrafts.activeId,
          assessment_id: assessmentId,
          question_type: "multiple-choice",
          prompt: getCanvasPromptText(),
          question_data: {
            ...(await getQuestionLayoutData()),
            choices,
            choiceImages,
            choiceHtml,
            choiceIds,
            choiceTable: {
              enabled: choiceTableEnabled,
              headers: choiceTableHeaders.map((header) => header.trim()),
              rows: choiceTableRows.map((row) => row.map((cell) => cell.trim())),
              hasBorder: choiceTableHasBorder,
              cellImages: tableCellImages,
            },
            selectionMode: multipleChoiceSelectionMode || "single",
            correctAnswer: correctChoice,
            correctAnswers,
          },
          question_order: getNextQuestionOrder(),
        });

        if (error) {
          alert(error.message);
          return;
        }
      }
      if ((questionType === "drag-and-drop" || questionType === "sort-into-groups")) {
        const uploadedDragDropData = await uploadDragDropItemImages(dragDropData);
        const { error } = await supabase.from("questions").upsert({ id: questionDrafts.activeId, assessment_id: assessmentId, question_type: questionType, prompt: getCanvasPromptText(), question_data: { ...(await getQuestionLayoutData()), dragDrop: uploadedDragDropData }, question_order: getNextQuestionOrder() });
        if (error) { alert(error.message); return; }
      }
      if (questionType === "dropdown") {
        const { error } = await supabase.from("questions").upsert({ id: questionDrafts.activeId, assessment_id: assessmentId, question_type: "dropdown", prompt: getCanvasPromptText(), question_data: { ...(await getQuestionLayoutData()), dropdown: normalizeDropdownData(dropdownData) }, question_order: getNextQuestionOrder() });
        if (error) { alert(error.message); return; }
      }
      if (questionType === "fill-in-the-blank") {
        const data = normalizeFillBlankData(fillBlankData);
        const { error } = await supabase.from("questions").upsert({ id: questionDrafts.activeId, assessment_id: assessmentId, question_type: "fill-in-the-blank", prompt: getCanvasPromptText() || getFillBlankPromptText(data), question_data: { ...(await getQuestionLayoutData()), fillBlank: data, template: data.template, blanks: data.blanks }, question_order: getNextQuestionOrder() });
        if (error) { alert(error.message); return; }
      }

      await questionDrafts.complete();
      resetQuestionForm();
      loadAssessment(assessmentId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
      setUploadingImage(false);
    }
  }

  function startEditingQuestion(question: Question) {
    const draft = questionDrafts.records.find(record => record.question_id === question.id);
    if (draft) { void resumeQuestionDraft(draft); return; }
    questionDrafts.begin(question.id);

    setQuestionModalOpen(true);
    setQuestionBuilderStep(4);
    setChoiceHtml(["", "", "", ""]);
    setChoiceTableEnabled(false);
    setChoiceTableHeaders(["Column 1", "Column 2"]);
    setChoiceTableRows(Array.from({ length: 4 }, () => ["", ""]));
    setChoiceTableHasBorder(true);
    setChoiceTableCellImages(Array.from({ length: 4 }, () => Array.from({ length: 2 }, () => ({ imageUrl: "", imagePath: "" }))));
    setSelectedChoiceTableCellFiles({});
    setChoiceTableCellPreviewUrls({});
    setChoiceTableUploadedPickerCell(null);
    setEditingQuestionId(question.id);
    setQuestionType(question.question_type);
    const savedDragDropData = normalizeDragDropData(question.question_data.dragDrop);
    setDropdownData(normalizeDropdownData(question.question_data.dropdown));
    setFillBlankData(normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template || (question.question_type === "fill-in-the-blank" ? question.prompt : ""), question.question_data.blanks));
    const savedCanvas = normalizeQuestionCanvas(question.question_data.canvas);
    setDragDropData((question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")
      ? asLocationDragDropData(savedDragDropData, savedCanvas)
      : savedDragDropData);
    setLeftQuestionCanvas(normalizeQuestionCanvas(question.question_data.leftCanvas));
    const savedSelectionMode = question.question_type === "multiple-choice" ? getMultipleChoiceSelectionMode(question.question_data) : null;
    const hasCanvasText = savedCanvas.elements.some((element) => element.type === "text");
    const legacyPromptBounds = savedCanvas.legacyPrompt || { x: 6, y: 7, width: 88, height: 19 };
    setQuestionCanvas({
      ...savedCanvas,
      legacyPrompt: undefined,
      interaction: question.question_type === "multiple-choice" || question.question_type === "dropdown" || question.question_type === "fill-in-the-blank" ? undefined : savedCanvas.interaction || { ...DEFAULT_INTERACTION },
      choiceLayout: question.question_type === "multiple-choice"
        ? { ...(savedCanvas.choiceLayout || { grouped: true, direction: "vertical", presentation: "content", x: 8, y: 35, positions: [] }), ...(savedSelectionMode === "multiple" ? { presentation: "content" as const } : {}) }
        : savedCanvas.choiceLayout,
      elements: hasCanvasText || !question.prompt
        ? savedCanvas.elements
        : [...savedCanvas.elements, {
            id: makeDragDropId(),
            type: "text",
            text: question.prompt,
            textHtml: question.question_data.promptHtml || plainTextToHtml(question.prompt),
            fontSize: 22,
            ...legacyPromptBounds,
          }],
    });
    selectedDragDropItemFilesRef.current = {};
    setSelectedDragDropItemFiles({});
    setDragDropItemPreviewUrls(Object.fromEntries(savedDragDropData.items.filter((item) => item.imageUrl).map((item) => [item.id, item.imageUrl || ""])));
    setQuestionLayout(question.question_data.layout || "standard");
    setLayoutSelectionMade(true);
    setSplitEditorTab("right");
    setSelectedReferenceQuestionId("");
    setLeftPanelTitle(question.question_data.leftPanelTitle || "");
    setLeftPanelTopContent(question.question_data.leftPanelTopContent || "");
    setLeftPanelContent(question.question_data.leftPanelContent || "");
    setSelectedLeftPanelImageFile(null);
    setExistingLeftPanelImageUrl(question.question_data.leftPanelImageUrl || "");
    setExistingLeftPanelImagePath(question.question_data.leftPanelImagePath || "");
    setLeftPanelImagePreviewUrl(question.question_data.leftPanelImageUrl || "");
    setMultipleChoiceImages(Array.from({ length: Math.max(2, question.question_data.choices?.length || 4) }, (_, index) =>
      question.question_data.choiceImages?.[index] || { imageUrl: "", imagePath: "" }
    ));
    setSelectedMultipleChoiceImageFiles({});
    setMultipleChoiceUploadedPickerIndex(null);
    setMultipleChoiceImagePreviewUrls(
      Object.fromEntries(
        Array.from({ length: Math.max(2, question.question_data.choices?.length || 4) }, (_, index) => [
          index,
          question.question_data.choiceImages?.[index]?.imageUrl || "",
        ])
      )
    );
    setLeftPanelTableEnabled(
      question.question_data.leftPanelTable?.enabled || false
    );
    setLeftPanelTableHasBorder(
      question.question_data.leftPanelTable?.hasBorder ?? true
    );
    setLeftPanelTableCells(
      question.question_data.leftPanelTable?.cells?.length
        ? question.question_data.leftPanelTable.cells
        : [["", ""], ["", ""]]
    );

    if (question.question_type === "multiple-choice") {
      const choices = question.question_data.choices || ["", "", "", ""];
      const selectionMode = savedSelectionMode || "single";
      const correctAnswers = getMultipleChoiceCorrectAnswers(question.question_data);
      const correctChoice = correctAnswers[0] || choices[0];
      const savedChoiceTable = question.question_data.choiceTable;
      const choiceCount = savedChoiceTable?.enabled
        ? Math.max(2, savedChoiceTable.rows.length)
        : Math.max(2, choices.length);
      setChoiceTexts(
        savedChoiceTable?.enabled
          ? Array.from({ length: choiceCount }, () => "")
          : choices.length >= 2 ? choices : ["", ""]
      );
      setChoiceIds(Array.from({ length: choiceCount }, (_, index) => question.question_data.choiceIds?.[index] || makeDragDropId()));
      setChoiceHtml(
        savedChoiceTable?.enabled
          ? Array.from({ length: choiceCount }, () => "")
          : Array.from({ length: choiceCount }, (_, index) =>
              question.question_data.choiceHtml?.[index] ||
              plainTextToHtml(choices[index] || "")
            )
      );
      setChoiceTableEnabled(savedChoiceTable?.enabled || false);
      setChoiceTableHeaders(
        savedChoiceTable?.headers?.length
          ? savedChoiceTable.headers
          : ["Column 1", "Column 2"]
      );
      setChoiceTableRows(
        savedChoiceTable?.rows?.length
          ? savedChoiceTable.rows
          : Array.from({ length: choiceCount }, () => ["", ""])
      );
      setChoiceTableHasBorder(savedChoiceTable?.hasBorder ?? true);
      const savedCellImages = savedChoiceTable?.cellImages || [];
      setChoiceTableCellImages(
        Array.from({ length: choiceCount }, (_, rowIndex) =>
          Array.from({ length: savedChoiceTable?.headers?.length || 2 }, (_, columnIndex) =>
            savedCellImages[rowIndex]?.[columnIndex] || { imageUrl: "", imagePath: "" }
          )
        )
      );
      setChoiceTableCellPreviewUrls(Object.fromEntries(savedCellImages.flatMap((row, rowIndex) => row.map((image, columnIndex) => [`${rowIndex}-${columnIndex}`, image.imageUrl || ""]))));
      const specialChoiceMatch = correctChoice.match(/^__(?:image|table)_choice_(\d+)__$/);
      const correctIndex = specialChoiceMatch
        ? Number(specialChoiceMatch[1]) - 1
        : choices.indexOf(correctChoice);
      setCorrectChoiceIndex(correctIndex >= 0 ? correctIndex : 0);
      setMultipleChoiceSelectionMode(selectionMode);
      const savedCorrectIndexes = correctAnswers.map((answer) => {
        const specialMatch = answer.match(/^__(?:image|table)_choice_(\d+)__$/);
        return specialMatch ? Number(specialMatch[1]) - 1 : choices.indexOf(answer);
      }).filter((index) => index >= 0);
      setCorrectChoiceIndexes(savedCorrectIndexes.length > 0 ? savedCorrectIndexes : [correctIndex >= 0 ? correctIndex : 0]);

      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    if (question.question_type === "short-answer") {
      setChoiceTexts(["", "", "", ""]);
      setCorrectChoiceIndex(0);

      setAnswerBoxes(
        question.question_data.answerBoxes &&
          question.question_data.answerBoxes.length > 0
          ? question.question_data.answerBoxes
          : [createAnswerBox()]
      );

      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    if (question.question_type === "fill-in-the-blank") {
      setChoiceTexts(["", "", "", ""]);
      setCorrectChoiceIndex(0);
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    if (question.question_type === "sorting-order") {
      setChoiceTexts(["", "", "", ""]);
      setCorrectChoiceIndex(0);
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
      setSelectedSortingItemFiles({});
      const savedItems = question.question_data.sortingItems || [];
      setSortingItemPreviewUrls(
        Object.fromEntries(savedItems.map((item) => [item.id, item.imageUrl || ""]))
      );
      const correctOrder = question.question_data.correctOrder || savedItems.map((item) => item.id);
      const orderedItems = correctOrder
        .map((itemId) => savedItems.find((item) => item.id === itemId))
        .filter(Boolean) as SortingItem[];
      const remainingItems = savedItems.filter(
        (item) => !correctOrder.includes(item.id)
      );
      setSortingItems(
        [...orderedItems, ...remainingItems].length > 0
          ? [...orderedItems, ...remainingItems]
          : [createSortingItem(), createSortingItem()]
      );
      setSortingCategories([createSortingCategory("Category 1"), createSortingCategory("Category 2")]);
    }

    if (question.question_type === "sorting-category") {
      setChoiceTexts(["", "", "", ""]);
      setCorrectChoiceIndex(0);
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
      setSelectedSortingItemFiles({});
      setSortingItemPreviewUrls(
        Object.fromEntries(
          (question.question_data.sortingItems || []).map((item) => [item.id, item.imageUrl || ""])
        )
      );
      setSortingItems(
        (question.question_data.sortingItems || []).length > 0
          ? question.question_data.sortingItems || []
          : [createSortingItem(), createSortingItem()]
      );
      setSortingCategories(
        (question.question_data.sortingCategories || []).length > 0
          ? question.question_data.sortingCategories || []
          : [createSortingCategory("Category 1"), createSortingCategory("Category 2")]
      );
    }

    if (question.question_type === "image-question") {
      setChoiceTexts(["", "", "", ""]);
      setCorrectChoiceIndex(0);
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl(question.question_data.imageUrl || "");
      setExistingImagePath(question.question_data.imagePath || "");
      setImagePreviewUrl(question.question_data.imageUrl || "");
      setOverlayBoxes(question.question_data.overlayBoxes || []);
      setSelectedOverlayBoxId(
        question.question_data.overlayBoxes?.[0]?.id || null
      );
      setOverlayAnswerMode(question.question_data.overlayAnswerMode || "text-entry");
      setDraggableChoices(
        question.question_data.draggableChoices &&
          question.question_data.draggableChoices.length > 0
          ? question.question_data.draggableChoices
          : [createDraggableChoice()]
      );
      setDraggableImageChoices(question.question_data.draggableImageChoices || []);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function updateQuestion() {
    if (!assessmentId || !editingQuestionId) {
      return;
    }

    if (!validateQuestionForm()) {
      return;
    }

    try {
      if (questionType === "multiple-choice") {
        const choices = getChoicesFromForm();
        const correctAnswers = getCorrectChoices(choices);
        const correctChoice = correctAnswers[0] || getCorrectChoice(choices);
        const choiceImages = await uploadMultipleChoiceImages();
        const tableCellImages = await uploadChoiceTableCellImages();

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "multiple-choice",
            prompt: getCanvasPromptText(),
            question_data: {
              ...(await getQuestionLayoutData()),
              choices,
              choiceImages,
              choiceHtml,
              choiceIds,
              choiceTable: {
                enabled: choiceTableEnabled,
                headers: choiceTableHeaders.map((header) => header.trim()),
                rows: choiceTableRows.map((row) => row.map((cell) => cell.trim())),
                hasBorder: choiceTableHasBorder,
                cellImages: tableCellImages,
              },
              selectionMode: multipleChoiceSelectionMode || "single",
              correctAnswer: correctChoice,
              correctAnswers,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }
      if ((questionType === "drag-and-drop" || questionType === "sort-into-groups")) {
        const uploadedDragDropData = await uploadDragDropItemImages(dragDropData);
        const { error } = await supabase.from("questions").update({ question_type: questionType, prompt: getCanvasPromptText(), question_data: { ...(await getQuestionLayoutData()), dragDrop: uploadedDragDropData } }).eq("id", editingQuestionId);
        if (error) { alert(error.message); return; }
      }
      if (questionType === "dropdown") {
        const { error } = await supabase.from("questions").update({ question_type: "dropdown", prompt: getCanvasPromptText(), question_data: { ...(await getQuestionLayoutData()), dropdown: normalizeDropdownData(dropdownData) } }).eq("id", editingQuestionId);
        if (error) { alert(error.message); return; }
      }
      if (questionType === "fill-in-the-blank") {
        const data = normalizeFillBlankData(fillBlankData);
        const { error } = await supabase.from("questions").update({ question_type: "fill-in-the-blank", prompt: getCanvasPromptText() || getFillBlankPromptText(data), question_data: { ...(await getQuestionLayoutData()), fillBlank: data, template: data.template, blanks: data.blanks } }).eq("id", editingQuestionId);
        if (error) { alert(error.message); return; }
      }

      await questionDrafts.complete();
      resetQuestionForm();
      loadAssessment(assessmentId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
      setUploadingImage(false);
    }
  }

  async function publishAssessment() {
    if (!assessmentId) {
      return;
    }

    if (questions.length === 0) {
      alert("Add at least one question before publishing.");
      return;
    }

    const { error } = await supabase
      .from("assessments")
      .update({ is_published: true })
      .eq("id", assessmentId);

    if (error) {
      alert(error.message);
      return;
    }

    loadAssessment(assessmentId);
  }

  async function unpublishAssessment() {
    if (!assessmentId) {
      return;
    }

    const { error } = await supabase
      .from("assessments")
      .update({ is_published: false })
      .eq("id", assessmentId);

    if (error) {
      alert(error.message);
      return;
    }

    loadAssessment(assessmentId);
  }

  async function moveQuestion(draggedId: string, targetId: string) {
    if (!assessmentId || draggedId === targetId || reorderingQuestions) return;

    const fromIndex = questions.findIndex((question) => question.id === draggedId);
    const toIndex = questions.findIndex((question) => question.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...questions];
    const [movedQuestion] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, movedQuestion);
    const normalized = reordered.map((question, index) => ({
      ...question,
      question_order: index + 1,
    }));

    setQuestions(normalized);
    setReorderingQuestions(true);
    setDraggedQuestionId(null);
    setDragOverQuestionId(null);

    const results = await Promise.all(
      normalized.map((question) =>
        supabase
          .from("questions")
          .update({ question_order: question.question_order })
          .eq("id", question.id)
          .eq("assessment_id", assessmentId)
      )
    );
    const failedUpdate = results.find((result) => result.error);

    setReorderingQuestions(false);
    if (failedUpdate?.error) {
      alert(`Could not save the new question order: ${failedUpdate.error.message}`);
      loadAssessment(assessmentId);
    }
  }

  function handleQuestionDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    const sourceId =
      draggedQuestionId || event.dataTransfer.getData("text/question-id");
    if (sourceId) {
      moveQuestion(sourceId, targetId);
    }
  }

  async function duplicateQuestion(question: Question) {
    if (!assessmentId) return;

    const { data, error } = await supabase
      .from("questions")
      .insert({
        assessment_id: assessmentId,
        question_type: question.question_type,
        prompt: question.prompt,
        question_data: question.question_data,
        question_order: getNextQuestionOrder(),
      })
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setExpandedQuestionIds((current) => [...current, data.id]);
    loadAssessment(assessmentId);
  }

  async function deleteQuestion(questionId: string) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this question?"
    );

    if (!confirmDelete) {
      return;
    }

    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", questionId);

    if (error) {
      alert(error.message);
      return;
    }

    if (editingQuestionId === questionId) {
      resetQuestionForm();
    }

    loadAssessment(assessmentId);
  }

  const canvasResponsePreview = questionType === "multiple-choice"
    ? <div className="grid gap-[0.8cqw] text-[1.5cqw]">{choiceTexts.map((choice, index) => { const choiceImage = multipleChoiceImagePreviewUrls[index] || multipleChoiceImages[index]?.imageUrl; return (choice.trim() || choiceImage) ? <div key={index} className="rounded border border-slate-300 bg-white/50 px-[1.2cqw] py-[0.7cqw]">{multipleChoiceSelectionMode === "multiple" && <span className="mr-[0.8cqw] inline-block h-[1.5cqw] w-[1.5cqw] rounded-sm border border-slate-500 align-middle" />}{choiceImage && <img src={choiceImage} alt="" className="mx-auto mb-[0.6cqw] max-h-[8cqw] max-w-full object-contain" />}{choiceHtml[index] ? <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: choiceHtml[index] }} /> : choice}</div> : null; })}</div>
    : questionType === "dropdown"
      ? <DropdownQuestionPreview data={normalizeDropdownData(dropdownData)} />
      : questionType === "fill-in-the-blank"
        ? null
        : dragDropData.preset === "locations"
          ? <LocationPreview data={dragDropData} itemPreviewUrls={dragDropItemPreviewUrls} />
          : dragDropData.preset === "sequence"
            ? <SequencePreview data={dragDropData} itemPreviewUrls={dragDropItemPreviewUrls} />
            : dragDropData.preset === "inline"
              ? <InlineBlankPreview data={dragDropData} itemPreviewUrls={dragDropItemPreviewUrls} />
              : <div className="grid gap-[0.8cqw] text-[1.5cqw]">{dragDropData.zones.map((zone, index) => <div key={zone.id} className="min-h-[5cqw] border-2 border-dashed border-blue-300 bg-blue-50/50 p-[1cqw]">{zone.label || `Target ${index + 1}`}</div>)}</div>;
  const multipleChoiceCanvasLayout = questionCanvas.choiceLayout || { grouped: true, direction: "vertical" as const, presentation: "content" as const, x: 8, y: 35, positions: [] };
  const questionValidationError = questionBuilderStep === 4 ? getQuestionValidationError() : "Finish the question setup first.";
  const saveDisabledReason = uploadingImage ? "Wait for the image upload to finish." : questionValidationError;
  const editingLeftCanvas = questionLayout === "split" && splitEditorTab === "left";
  const multipleChoiceCanvasData: DragDropData = {
    ...questionCanvasToComposition(questionCanvas),
    items: choiceIds.map((id, index) => ({
      id,
      content: choiceTexts[index] || "",
      imageUrl: multipleChoiceImages[index]?.imageUrl,
      imagePath: multipleChoiceImages[index]?.imagePath,
      x: multipleChoiceCanvasLayout.positions[index]?.x,
      y: multipleChoiceCanvasLayout.positions[index]?.y,
      width: multipleChoiceCanvasLayout.positions[index]?.width,
      height: multipleChoiceCanvasLayout.positions[index]?.height,
      textVerticalAlign: multipleChoiceCanvasLayout.positions[index]?.textVerticalAlign || "middle",
    })),
    choiceBankGrouped: multipleChoiceCanvasLayout.grouped,
    choiceSameSize: multipleChoiceCanvasLayout.sameSize,
    choiceBankDirection: multipleChoiceCanvasLayout.direction,
    choicePresentation: multipleChoiceCanvasLayout.presentation,
    choiceBankX: multipleChoiceCanvasLayout.x,
    choiceBankY: multipleChoiceCanvasLayout.y,
  };
  const rightCanvasPreview = (questionType === "drag-and-drop" || questionType === "sort-into-groups")
    ? <LocationPreview data={asLocationDragDropData(dragDropData)} itemPreviewUrls={dragDropItemPreviewUrls} />
    : <QuestionCanvas canvas={questionCanvas} selectionMode={multipleChoiceSelectionMode || "single"} interaction={questionType === "dropdown" || questionType === "fill-in-the-blank" ? undefined : canvasResponsePreview} overlays={questionType === "dropdown" ? <DropdownCanvasFields data={normalizeDropdownData(dropdownData)} /> : questionType === "fill-in-the-blank" ? <FillBlankCanvasFields data={normalizeFillBlankData(fillBlankData)} /> : undefined} choices={questionType === "multiple-choice" ? choiceTexts.map((text, index) => ({ text, html: choiceHtml[index], imageUrl: multipleChoiceImagePreviewUrls[index] || multipleChoiceImages[index]?.imageUrl })) : undefined} className="w-full" />;

  function updateMultipleChoiceCanvas(composition: DragDropData) {
    setChoiceTexts(composition.items.map((item) => item.content));
    setChoiceHtml((current) => composition.items.map((item, index) => item.content === choiceTexts[index] ? current[index] || plainTextToHtml(item.content) : plainTextToHtml(item.content)));
    setQuestionCanvas((current) => ({
      ...current,
      backgroundImageUrl: composition.backgroundImageUrl,
      backgroundImagePath: composition.backgroundImagePath,
      canvasHeight: normalizeCanvasHeight(composition.canvasHeight),
      elements: composition.canvasElements || [],
      interaction: undefined,
      choiceLayout: {
        grouped: composition.choiceBankGrouped !== false,
        sameSize: composition.choiceSameSize === true,
        direction: composition.choiceBankDirection === "horizontal" ? "horizontal" : "vertical",
        presentation: multipleChoiceSelectionMode === "multiple"
          ? "content"
          : composition.choicePresentation === "radio" || composition.choicePresentation === "box" ? composition.choicePresentation : "content",
        x: composition.choiceBankX ?? 8,
        y: composition.choiceBankY ?? 35,
        positions: composition.items.map((item, index) => ({ x: item.x ?? multipleChoiceCanvasLayout.positions[index]?.x ?? 8, y: item.y ?? multipleChoiceCanvasLayout.positions[index]?.y ?? 35 + index * 12, width: item.width ?? multipleChoiceCanvasLayout.positions[index]?.width, height: item.height ?? multipleChoiceCanvasLayout.positions[index]?.height, textVerticalAlign: item.textVerticalAlign || multipleChoiceCanvasLayout.positions[index]?.textVerticalAlign || "middle" })),
      },
    }));
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        Loading assessment...
      </main>
    );
  }

  if (!assessment) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        Assessment not found.
      </main>
    );
  }

  return (
    <>
      <nav className="border-b border-slate-200 bg-white text-slate-900" aria-label="Global navigation">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-slate-950">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">J</span>
            Jretta
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/teacher" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Teacher Dashboard</Link>
            <Link href="/teacher/classrooms" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Classrooms</Link>
            <Link href="/teacher/billing" className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">Manage plan</Link>
            <Link href="/profile" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Profile</Link>
            <button type="button" onClick={() => void signOut()} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Sign Out</button>
          </div>
        </div>
      </nav>
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveAssessmentTitle();
                  }}
                  className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setTitleDraft(assessment.title);
                        setEditingTitle(false);
                      }
                    }}
                    aria-label="Assessment title"
                    className="min-w-0 flex-1 rounded-xl border border-blue-500 bg-slate-950 px-4 py-2.5 text-2xl font-bold text-white outline-none ring-4 ring-blue-500/10 sm:text-3xl"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!titleDraft.trim() || savingTitle}
                      className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingTitle ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTitleDraft(assessment.title);
                        setEditingTitle(false);
                      }}
                      className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <h1 className="min-w-0 truncate text-4xl font-bold">
                    {assessment.title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setEditingTitle(true)}
                    aria-label="Edit assessment title"
                    className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 3.487 3.651 3.651M5.5 18.5l-1 4 4-1L20.513 9.487a2.582 2.582 0 0 0-3.652-3.652L5.5 17.196V18.5Z" />
                    </svg>
                  </button>
                </div>
              )}

              {assessment.description && (
                <p className="mt-3 text-slate-300">
                  {assessment.description}
                </p>
              )}

              <p className="mt-1 text-sm text-slate-400">
                Status:{" "}
                <span
                  className={
                    assessment.is_published
                      ? "text-green-300"
                      : "text-yellow-300"
                  }
                >
                  {assessment.is_published ? "Published" : "Draft"}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  resetQuestionForm();
                  questionDrafts.begin();
                  setQuestionModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                <span className="text-lg leading-none">+</span> Add Question
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormulaSheetDraft(normalizeQuestionCanvas(assessment.formula_sheet));
                  setFormulaSheetError("");
                  setFormulaSheetOpen(true);
                }}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                {assessment.formula_sheet ? "Edit Formula Sheet" : "Add Formula Sheet"}
              </button>
              </div>
              <div className="flex items-center gap-2">
              {assessment.is_published ? (
                <button
                  onClick={unpublishAssessment}
                  className="rounded-xl border border-yellow-700 px-4 py-2 text-sm font-semibold text-yellow-200 hover:bg-yellow-950"
                >
                  Unpublish
                </button>
              ) : (
                <button
                  onClick={publishAssessment}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
                >
                  Publish
                </button>
              )}
                <Link
                  href={`/teacher/assessments/${assessment.id}/results`}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Run
                </Link>
                <Link
                  href={assessmentPreviewHref(assessment.id, "editor")}
                  className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                >
                  Preview
                </Link>
              </div>
            </div>
          </div>
        </div>

        {formulaSheetOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8">
            <section role="dialog" aria-modal="true" aria-labelledby="formula-sheet-title" className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 id="formula-sheet-title" className="text-2xl font-bold text-slate-900">Formula Sheet</h2>
                <button type="button" disabled={savingFormulaSheet} onClick={() => setFormulaSheetOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              </div>
              <fieldset disabled={savingFormulaSheet}>
                <LocationCanvasEditor
                  compositionOnly
                  title="Formula sheet canvas"
                  description="Add text, formulas, tables, and images. Students can open this sheet from Resources during the assessment."
                  data={questionCanvasToComposition(formulaSheetDraft)}
                  onChange={(composition) => setFormulaSheetDraft({ version: 2, backgroundImageUrl: composition.backgroundImageUrl, backgroundImagePath: composition.backgroundImagePath, canvasHeight: normalizeCanvasHeight(composition.canvasHeight), elements: composition.canvasElements || [] })}
                  uploadedImages={uploadedImages}
                  itemPreviewUrls={{}}
                  onItemImageFileChange={() => {}}
                  onChooseItemImage={() => {}}
                  onRemoveItemImage={() => {}}
                  onUploadBackground={uploadDragDropBackgroundImage}
                  onDeleteUploadedImage={(image) => void deleteAccountImage({ id: image.id, image_url: image.url, image_path: image.path, label: image.label })}
                />
              </fieldset>
              <section aria-labelledby="formula-sheet-preview-title" className="mt-6">
                <h3 id="formula-sheet-preview-title" className="text-lg font-semibold text-slate-900">Student preview</h3>
                <p className="mt-1 text-sm text-slate-600">When students open Resources, the formula sheet appears beside their question.</p>
                <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="min-w-0 border-r border-slate-200">
                    <QuestionCanvas canvas={formulaSheetDraft} className="pointer-events-none border-0" />
                  </div>
                  <div className="flex min-w-0 flex-col items-center justify-center bg-slate-50 p-4 text-center sm:p-8">
                    <p className="text-base font-semibold text-slate-600">Question area</p>
                    <p className="mt-2 max-w-xs text-sm text-slate-500">The current question and answer controls appear here.</p>
                  </div>
                </div>
              </section>
              {formulaSheetError && <p role="alert" className="mt-4 text-sm text-red-600">{formulaSheetError}</p>}
              <div className="mt-5 flex justify-end gap-3">
                {assessment.formula_sheet && <button type="button" disabled={savingFormulaSheet} onClick={() => void saveFormulaSheet(null)} className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50">Remove Formula Sheet</button>}
                <button type="button" disabled={savingFormulaSheet} onClick={() => void saveFormulaSheet(formulaSheetDraft)} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{savingFormulaSheet ? "Saving…" : "Save Formula Sheet"}</button>
              </div>
            </section>
          </div>
        )}

        {questionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <button
            type="button"
            disabled={publishingQuestion || closingQuestion} aria-label="Close question editor"
            onClick={() => void closeQuestionEditor()}
            className="fixed inset-0 bg-black/35 backdrop-blur-sm"
          />
          <section inert={publishingQuestion || closingQuestion} className="relative z-10 w-full max-w-7xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
          <button
            type="button"
            onClick={() => void closeQuestionEditor()}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          >
            ×
          </button>
          <h2 className="text-2xl font-semibold">
            {editingQuestionId ? "Edit Question" : "Add Question"}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Draft</span>
            <button type="button" onClick={() => void saveQuestionDraft()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Save draft</button>
            <span role="status" className="text-sm text-slate-600">{publishingQuestion ? "Publishing…" : questionDrafts.message}</span>
          </div>

          {editingQuestionId && (
            <p className="mt-2 text-sm text-yellow-300">
              Your edits remain a private draft until you publish them. The published version stays available to students.
            </p>
          )}

          <div className="mt-6 space-y-4">
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none ${questionSetupCollapsed && questionBuilderStep === 4 ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
              aria-hidden={questionSetupCollapsed && questionBuilderStep === 4}
              inert={questionSetupCollapsed && questionBuilderStep === 4 ? true : undefined}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-4">
            {questionBuilderStep >= 1 && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Step 1 · Question type</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">What kind of question are you making?</h3>
              <div className="mt-2 grid grid-cols-5 gap-2">
                <button type="button" onClick={() => { setQuestionType("multiple-choice"); setQuestionLayout("standard"); setLayoutSelectionMade(false); setMultipleChoiceSelectionMode(null); setCorrectChoiceIndex(-1); setCorrectChoiceIndexes([]); setQuestionBuilderStep(2); }} aria-pressed={questionBuilderStep >= 2 && questionType === "multiple-choice"} className={`rounded-xl border px-4 py-4 text-left font-semibold text-black transition ${questionBuilderStep >= 2 && questionType === "multiple-choice" ? "border-blue-500 bg-blue-100 ring-2 ring-blue-200" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50"}`}>Multiple Choice<span className="mt-1 block text-xs font-normal text-slate-500">Students select one answer or check all that apply.</span></button>
                <button type="button" onClick={() => { setQuestionType("drag-and-drop"); setQuestionLayout("standard"); setLayoutSelectionMade(false); setDragDropData(createLocationDragDropData()); setQuestionBuilderStep(2); }} aria-pressed={questionBuilderStep >= 2 && questionType === "drag-and-drop"} className={`rounded-xl border px-4 py-4 text-left font-semibold text-black transition ${questionBuilderStep >= 2 && questionType === "drag-and-drop" ? "border-blue-500 bg-blue-100 ring-2 ring-blue-200" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50"}`}>Drag &amp; Drop<span className="mt-1 block text-xs font-normal text-slate-500">Students move choices into targets on the canvas.</span></button>
                <button type="button" onClick={() => { setQuestionType("sort-into-groups"); setQuestionLayout("standard"); setLayoutSelectionMade(false); setDragDropData(createCategoryCanvasData()); setQuestionBuilderStep(2); }} aria-pressed={questionBuilderStep >= 2 && questionType === "sort-into-groups"} className={`rounded-xl border px-4 py-4 text-left font-semibold text-black transition ${questionBuilderStep >= 2 && questionType === "sort-into-groups" ? "border-blue-500 bg-blue-100 ring-2 ring-blue-200" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50"}`}>Sort into groups<span className="mt-1 block text-xs font-normal text-slate-500">Students sort choices into labelled category boxes.</span></button>
                <button type="button" onClick={() => { setQuestionType("dropdown"); setQuestionLayout("standard"); setLayoutSelectionMade(false); setQuestionBuilderStep(2); }} aria-pressed={questionBuilderStep >= 2 && questionType === "dropdown"} className={`rounded-xl border px-4 py-4 text-left font-semibold text-black transition ${questionBuilderStep >= 2 && questionType === "dropdown" ? "border-blue-500 bg-blue-100 ring-2 ring-blue-200" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50"}`}>Dropdown<span className="mt-1 block text-xs font-normal text-slate-500">Place independent answer menus anywhere on the canvas.</span></button>
                <button type="button" onClick={() => { setQuestionType("fill-in-the-blank"); setQuestionLayout("standard"); setLayoutSelectionMade(false); setFillBlankData({ ...createDefaultFillBlankData(), template: "", blanks: [] }); setQuestionCanvas((current) => ({ ...current, interaction: undefined })); setQuestionBuilderStep(2); }} aria-pressed={questionBuilderStep >= 2 && questionType === "fill-in-the-blank"} className={`rounded-xl border px-4 py-4 text-left font-semibold text-black transition ${questionBuilderStep >= 2 && questionType === "fill-in-the-blank" ? "border-blue-500 bg-blue-100 ring-2 ring-blue-200" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50"}`}>Fill in the Blank<span className="mt-1 block text-xs font-normal text-slate-500">Text, numbers, fractions, coordinates, or math expressions.</span></button>
              </div>
            </div>}

            {questionBuilderStep >= 2 && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Step 2 · Student layout</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">How should the question be displayed?</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-1 ring-1 ring-violet-200">
                <button type="button" aria-pressed={layoutSelectionMade && questionLayout === "standard"} onClick={() => { setQuestionLayout("standard"); setLayoutSelectionMade(true); setQuestionBuilderStep(questionType === "multiple-choice" ? multipleChoiceSelectionMode ? 4 : 3 : 4); }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${layoutSelectionMade && questionLayout === "standard" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-violet-50"}`}>One canvas</button>
                <button type="button" aria-pressed={layoutSelectionMade && questionLayout === "split"} onClick={() => { setQuestionLayout("split"); setSplitEditorTab("right"); setLayoutSelectionMade(true); setQuestionBuilderStep(questionType === "multiple-choice" ? multipleChoiceSelectionMode ? 4 : 3 : 4); }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${layoutSelectionMade && questionLayout === "split" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-violet-50"}`}>Left and right split</button>
              </div>
            </div>}

            {questionBuilderStep >= 3 && questionType === "multiple-choice" && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Step 3 · Answer selection</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">How many answers can be correct?</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-1 ring-1 ring-emerald-200">
                <button type="button" aria-pressed={multipleChoiceSelectionMode === "single"} onClick={() => { setMultipleChoiceSelectionMode("single"); const index = correctChoiceIndexes[0] ?? correctChoiceIndex; setCorrectChoiceIndex(index >= 0 ? index : -1); setCorrectChoiceIndexes(index >= 0 ? [index] : []); setQuestionBuilderStep(4); }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${multipleChoiceSelectionMode === "single" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-emerald-50"}`}>One answer</button>
                <button type="button" aria-pressed={multipleChoiceSelectionMode === "multiple"} onClick={() => { setMultipleChoiceSelectionMode("multiple"); setCorrectChoiceIndexes((current) => current.length > 0 ? current : correctChoiceIndex >= 0 ? [correctChoiceIndex] : []); setQuestionCanvas((current) => ({ ...current, choiceLayout: current.choiceLayout ? { ...current.choiceLayout, presentation: "content" } : { grouped: true, direction: "vertical", presentation: "content", x: 8, y: 35, positions: [] } })); setQuestionBuilderStep(4); }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${multipleChoiceSelectionMode === "multiple" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-emerald-50"}`}>Multiple answers</button>
              </div>
            </div>}

                </div>
              </div>
            </div>

            {questionBuilderStep === 4 && <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-slate-300" />
              <button
                type="button"
                onClick={() => setQuestionSetupCollapsed((current) => !current)}
                aria-expanded={!questionSetupCollapsed}
                aria-label={questionSetupCollapsed ? "Expand question setup" : "Collapse question setup"}
                title={questionSetupCollapsed ? "Expand question setup" : "Collapse question setup"}
                className="grid h-9 w-9 place-items-center rounded-full border border-blue-300 bg-white text-blue-700 shadow-sm transition-colors hover:border-blue-500 hover:bg-blue-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${questionSetupCollapsed ? "rotate-180" : "rotate-0"}`} aria-hidden="true">
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </button>
              <span className="h-px flex-1 bg-slate-300" />
            </div>}

            {questionBuilderStep === 4 && <>
            {questionLayout === "split" && (
              <div className="grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-950 p-1" role="tablist" aria-label="Split question canvas editor">
                <button type="button" role="tab" aria-selected={splitEditorTab === "left"} onClick={() => setSplitEditorTab("left")} className={`rounded-lg px-4 py-3 text-sm font-bold transition ${splitEditorTab === "left" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>Left-side canvas</button>
                <button type="button" role="tab" aria-selected={splitEditorTab === "right"} onClick={() => setSplitEditorTab("right")} className={`rounded-lg px-4 py-3 text-sm font-bold transition ${splitEditorTab === "right" ? "bg-violet-600 text-white shadow-sm" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>Right-side canvas</button>
              </div>
            )}
            <LocationCanvasEditor
              compositionOnly={editingLeftCanvas || (questionType !== "multiple-choice" && questionType !== "drag-and-drop" && questionType !== "sort-into-groups")}
              choiceOnly={!editingLeftCanvas && questionType === "multiple-choice"}
              allowChoiceMarkers={!editingLeftCanvas && multipleChoiceSelectionMode === "single"}
              choiceSelectionMode={!editingLeftCanvas && questionType === "multiple-choice" ? multipleChoiceSelectionMode || undefined : undefined}
              isChoiceCorrect={!editingLeftCanvas && questionType === "multiple-choice" ? (_, index) => multipleChoiceSelectionMode === "multiple" ? correctChoiceIndexes.includes(index) : correctChoiceIndex === index : undefined}
              choicePlaceholder={(questionType === "drag-and-drop" || questionType === "sort-into-groups") ? "Item" : "Choice"}
              title={editingLeftCanvas ? "Left-side canvas" : questionLayout === "split" ? "Right-side canvas" : "Question canvas"}
              description={editingLeftCanvas ? "Build the reference side of the student layout." : (questionType === "drag-and-drop" || questionType === "sort-into-groups") ? "Build the complete question, draggable-item group, and targets on this canvas." : "Build the complete question and place its student interaction on the canvas."}
              data={editingLeftCanvas ? questionCanvasToComposition(leftQuestionCanvas) : questionType === "multiple-choice" ? multipleChoiceCanvasData : (questionType === "drag-and-drop" || questionType === "sort-into-groups") ? dragDropData : questionCanvasToComposition(questionCanvas)}
              onChange={(composition) => editingLeftCanvas ? setLeftQuestionCanvas((current) => ({ ...current, backgroundImageUrl: composition.backgroundImageUrl, backgroundImagePath: composition.backgroundImagePath, canvasHeight: normalizeCanvasHeight(composition.canvasHeight), elements: composition.canvasElements || [] })) : questionType === "multiple-choice" ? updateMultipleChoiceCanvas(composition) : (questionType === "drag-and-drop" || questionType === "sort-into-groups") ? setDragDropData(asLocationDragDropData(composition)) : setQuestionCanvas((current) => ({ ...current, backgroundImageUrl: composition.backgroundImageUrl, backgroundImagePath: composition.backgroundImagePath, canvasHeight: normalizeCanvasHeight(composition.canvasHeight), elements: composition.canvasElements || [] }))}
              uploadedImages={uploadedImages}
              itemPreviewUrls={questionType === "multiple-choice" ? Object.fromEntries(choiceIds.map((id, index) => [id, multipleChoiceImagePreviewUrls[index] || multipleChoiceImages[index]?.imageUrl || ""])) : (questionType === "drag-and-drop" || questionType === "sort-into-groups") ? dragDropItemPreviewUrls : {}}
              choiceHtmlById={questionType === "multiple-choice" ? Object.fromEntries(choiceIds.map((id, index) => [id, choiceHtml[index] || ""])) : {}}
              onChoiceHtmlChange={questionType === "multiple-choice" ? (itemId, html) => { const index = choiceIds.indexOf(itemId); if (index < 0) return; const text = richHtmlToPlainText(html); setChoiceHtml((current) => current.map((value, currentIndex) => currentIndex === index ? html : value)); setChoiceTexts((current) => current.map((value, currentIndex) => currentIndex === index ? text : value)); } : undefined}
              onItemImageFileChange={(itemId, file) => { if ((questionType === "drag-and-drop" || questionType === "sort-into-groups")) { handleDragDropItemImageChange(itemId, file); return; } const index = choiceIds.indexOf(itemId); if (index >= 0) handleMultipleChoiceImageChange(index, file); }}
              onChooseItemImage={(itemId, image) => { if ((questionType === "drag-and-drop" || questionType === "sort-into-groups")) { chooseDragDropItemImage(itemId, image); return; } const index = choiceIds.indexOf(itemId); if (index < 0) return; setMultipleChoiceImages((current) => current.map((value, currentIndex) => currentIndex === index ? { imageUrl: image.url, imagePath: image.path } : value)); setSelectedMultipleChoiceImageFiles((current) => { const next = { ...current }; delete next[index]; return next; }); setMultipleChoiceImagePreviewUrls((current) => ({ ...current, [index]: image.url })); }}
              onRemoveItemImage={(itemId) => { if ((questionType === "drag-and-drop" || questionType === "sort-into-groups")) { removeDragDropItemImage(itemId); return; } const index = choiceIds.indexOf(itemId); if (index < 0) return; setMultipleChoiceImages((current) => current.map((value, currentIndex) => currentIndex === index ? { imageUrl: "", imagePath: "" } : value)); setSelectedMultipleChoiceImageFiles((current) => { const next = { ...current }; delete next[index]; return next; }); setMultipleChoiceImagePreviewUrls((current) => { const next = { ...current }; delete next[index]; return next; }); }}
              onAddChoice={questionType === "multiple-choice" ? addMultipleChoiceOption : undefined}
              onRemoveChoice={questionType === "multiple-choice" ? (_, index) => removeMultipleChoiceOption(index) : undefined}
              renderChoiceEditorExtra={questionType === "multiple-choice" ? (_, index) => <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900"><input type="checkbox" checked={multipleChoiceSelectionMode === "multiple" ? correctChoiceIndexes.includes(index) : correctChoiceIndex === index} onChange={() => { if (multipleChoiceSelectionMode === "single") { setCorrectChoiceIndex(index); setCorrectChoiceIndexes([index]); } else setCorrectChoiceIndexes((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index]); }} className="h-4 w-4 accent-emerald-600" />Correct answer</label> : undefined}
              onUploadBackground={uploadDragDropBackgroundImage}
              onDeleteUploadedImage={(image) => void deleteAccountImage({ id: image.id, image_url: image.url, image_path: image.path, label: image.label })}
              toolbarActions={editingLeftCanvas || questionType === "multiple-choice" || (questionType === "drag-and-drop" || questionType === "sort-into-groups") ? undefined : questionType === "dropdown" ? <button type="button" onClick={addDropdownToCanvas} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">+ Add dropdown</button> : questionType === "fill-in-the-blank" ? <button type="button" onClick={addFillBlankToCanvas} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">+ Add answer area</button> : questionCanvas.interaction ? <button type="button" onClick={() => setQuestionCanvas((current) => ({ ...current, interaction: undefined }))} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">Remove answer area</button> : <button type="button" onClick={() => setQuestionCanvas((current) => ({ ...current, interaction: { ...DEFAULT_INTERACTION } }))} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">+ Add answer area</button>}
              overlayBlocks={editingLeftCanvas ? [] : questionType === "dropdown" ? dropdownData.entries.map((entry, index) => ({
                id: entry.id,
                label: `Dropdown ${index + 1}`,
                bounds: getDropdownBounds(entry, index),
                autoWidth: true,
                hideLabel: true,
                content: <CanvasDropdownField disabled ariaLabel={`Dropdown ${index + 1}`} options={getDropdownEntryOptions(entry)} />,
                editor: dropdownEditor(entry, index),
              })) : questionType === "fill-in-the-blank" ? normalizeFillBlankData(fillBlankData).blanks.map((blank, index) => ({
                id: blank.id,
                label: `Answer area ${index + 1}`,
                bounds: getFillBlankBounds(blank, index),
                hideLabel: true,
                content: <CanvasFillBlankField blank={blank} preview />,
                editor: <FillBlankCanvasPanel blank={blank} onChange={(next) => updateFillBlank(blank.id, next)} onRemove={() => removeFillBlank(blank.id)} />,
              })) : questionType !== "multiple-choice" && questionType !== "drag-and-drop" && questionType !== "sort-into-groups" && questionCanvas.interaction ? [
                { id: "interaction", label: "Answer", bounds: questionCanvas.interaction, content: canvasResponsePreview },
              ] : []}
              onRemoveOverlay={(id) => questionType === "dropdown" ? setDropdownData((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== id) })) : questionType === "fill-in-the-blank" ? removeFillBlank(id) : setQuestionCanvas((current) => ({ ...current, interaction: undefined }))}
              onOverlayBoundsChange={(id, bounds) => questionType === "dropdown" ? updateDropdownEntry(id, bounds) : questionType === "fill-in-the-blank" ? updateFillBlank(id, bounds) : setQuestionCanvas((current) => ({ ...current, interaction: bounds }))}
            />

            <div className="grid grid-cols-1 items-start gap-4 lg:gap-6">
              <section className={`min-w-0 ${questionLayout === "split" && splitEditorTab !== "right" ? "hidden" : ""}`}>

            {questionType === "multiple-choice" && choiceTableEnabled && (
              <>
                <div className="my-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={choiceTableEnabled} onChange={(event) => setChoiceTableEnabled(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" />
                    <span><span className="block text-sm font-semibold text-slate-800">Display choices as selectable table rows</span><span className="mt-1 block text-xs text-slate-500">Best for matching several values across shared columns.</span></span>
                  </label>
                </div>
                {choiceTableEnabled ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">Table columns and answer rows</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setChoiceTableHeaders((current) => [...current, `Column ${current.length + 1}`]); setChoiceTableRows((current) => current.map((row) => [...row, ""])); setChoiceTableCellImages((current) => current.map((row) => [...row, { imageUrl: "", imagePath: "" }])); }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">+ Column</button>
                        <button type="button" disabled={choiceTableHeaders.length <= 1} onClick={() => { setChoiceTableHeaders((current) => current.slice(0, -1)); setChoiceTableRows((current) => current.map((row) => row.slice(0, -1))); setChoiceTableCellImages((current) => current.map((row) => row.slice(0, -1))); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40">− Column</button>
                      </div>
                    </div>
                    <table className="w-full min-w-[34rem] border-collapse text-sm">
                      <thead><tr><th className="w-20 border border-slate-300 bg-slate-50 p-2 text-center">Choice</th>{choiceTableHeaders.map((header, columnIndex) => <th key={columnIndex} className="border border-slate-300 bg-slate-50 p-2"><input value={header} onChange={(event) => setChoiceTableHeaders((current) => current.map((item, itemIndex) => itemIndex === columnIndex ? event.target.value : item))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900" aria-label={`Column ${columnIndex + 1} heading`} /></th>)}</tr></thead>
                      <tbody>{choiceTableRows.map((row, rowIndex) => <tr key={rowIndex}><td className="border border-slate-300 p-2 text-center font-semibold text-slate-600">{String.fromCharCode(65 + rowIndex)}</td>{row.map((cell, columnIndex) => {
                        const cellKey = `${rowIndex}-${columnIndex}`;
                        const previewUrl = choiceTableCellPreviewUrls[cellKey] || choiceTableCellImages[rowIndex]?.[columnIndex]?.imageUrl;
                        return <td key={columnIndex} className="min-w-72 border border-slate-300 p-2 align-top">
                          <RichTextEditor value={cell} onChange={(html) => setChoiceTableRows((current) => current.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex ? currentRow.map((item, itemIndex) => itemIndex === columnIndex ? html : item) : currentRow))} placeholder={`Choice ${String.fromCharCode(65 + rowIndex)}, ${choiceTableHeaders[columnIndex]}`} minHeight="4.5rem" />
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Optional cell image</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500">
                                <span aria-hidden="true">↑</span>
                                Upload image
                                <input type="file" accept="image/*" className="sr-only" onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return;
                                  setSelectedChoiceTableCellFiles((current) => ({ ...current, [cellKey]: file }));
                                  setChoiceTableCellPreviewUrls((current) => ({ ...current, [cellKey]: URL.createObjectURL(file) }));
                                  setChoiceTableUploadedPickerCell(null);
                                }} />
                              </label>
                              <button type="button" onClick={() => setChoiceTableUploadedPickerCell((current) => current === cellKey ? null : cellKey)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-400 hover:bg-blue-50">
                                Select from uploaded
                              </button>
                            </div>
                            {choiceTableUploadedPickerCell === cellKey && <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                              {uploadedImages.length === 0 ? <p className="p-2 text-xs text-slate-500">No previously uploaded images are available yet.</p> : <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto">
                                {uploadedImages.map((image) => <div key={`${cellKey}-${image.url}`} className="group relative"><button type="button" onClick={() => {
                                  setChoiceTableCellImages((current) => current.map((imageRow, currentRowIndex) => currentRowIndex === rowIndex ? imageRow.map((currentImage, currentColumnIndex) => currentColumnIndex === columnIndex ? { imageUrl: image.url, imagePath: image.path } : currentImage) : imageRow));
                                  setSelectedChoiceTableCellFiles((current) => { const next = { ...current }; delete next[cellKey]; return next; });
                                  setChoiceTableCellPreviewUrls((current) => ({ ...current, [cellKey]: image.url }));
                                  setChoiceTableUploadedPickerCell(null);
                                }} className="w-full overflow-hidden rounded-md border border-slate-200 bg-white p-1.5 text-left transition hover:border-blue-500">
                                  <img src={image.url} alt={image.label} className="h-20 w-full rounded object-contain" />
                                  <span className="mt-1 block truncate text-[11px] font-medium text-slate-600">{image.label}</span>
                                </button>{image.id && <button type="button" onClick={() => void deleteAccountImage({ id: image.id!, image_url: image.url, image_path: image.path, label: image.label })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white opacity-0 shadow transition hover:bg-red-700 focus:opacity-100 group-hover:opacity-100" aria-label={`Delete ${image.label} from existing uploads`}>×</button>}</div>)}
                              </div>}
                            </div>}
                          </div>
                          {previewUrl && <div className="mt-2 rounded-lg border border-slate-200 p-2"><img src={previewUrl} alt="Cell preview" className="mx-auto max-h-32 max-w-full object-contain" /><button type="button" onClick={() => { setChoiceTableCellImages((current) => current.map((imageRow, currentRowIndex) => currentRowIndex === rowIndex ? imageRow.map((image, currentColumnIndex) => currentColumnIndex === columnIndex ? { imageUrl: "", imagePath: "" } : image) : imageRow)); setSelectedChoiceTableCellFiles((current) => { const next = { ...current }; delete next[cellKey]; return next; }); setChoiceTableCellPreviewUrls((current) => { const next = { ...current }; delete next[cellKey]; return next; }); setChoiceTableUploadedPickerCell((current) => current === cellKey ? null : current); }} className="mt-1 text-xs font-semibold text-red-600">Remove image</button></div>}
                        </td>;
                      })}</tr>)}</tbody>
                    </table>
                    <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={choiceTableHasBorder} onChange={(event) => setChoiceTableHasBorder(event.target.checked)} className="accent-blue-600" /> Show table borders to students</label>
                  </div>
                ) : (
                <div className={`grid gap-3 ${questionLayout === "split" ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
                  {choiceTexts.map((choice, index) => {
                    const label = `Choice ${String.fromCharCode(65 + index)}`;
                    return (
                      <div key={index} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-semibold text-slate-700">{label}</label>
                          <button
                            type="button"
                            onClick={() => removeMultipleChoiceOption(index)}
                            disabled={choiceTexts.length <= 2}
                            className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Remove
                          </button>
                        </div>
                        <div className={`mt-2 grid min-w-0 gap-3 ${questionLayout === "split" ? "lg:grid-cols-2" : "grid-cols-1"}`}>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Choice text</p>
                            <RichTextEditor
                              allowNumberLines
                              value={choiceHtml[index] || ""}
                              onChange={(html) => {
                                setChoiceHtml((current) => current.map((item, itemIndex) => itemIndex === index ? html : item));
                                setChoiceTexts((current) => current.map((item, itemIndex) => itemIndex === index ? richHtmlToPlainText(html) : item));
                              }}
                              placeholder="Enter choice text"
                              minHeight="5rem"
                            />
                          </div>
                          <div className="min-w-0">{renderMultipleChoiceImageControl(index, label)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}

                <button
                  type="button"
                  onClick={addMultipleChoiceOption}
                  className="mt-5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  + Add Choice
                </button>

                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
                  <label className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
                    Answer selection
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-1 ring-1 ring-emerald-200">
                    <button type="button" onClick={() => { setMultipleChoiceSelectionMode("single"); const index = correctChoiceIndexes[0] ?? correctChoiceIndex; setCorrectChoiceIndex(index); setCorrectChoiceIndexes([index]); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${multipleChoiceSelectionMode === "single" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-emerald-50"}`}>One answer</button>
                    <button type="button" onClick={() => { setMultipleChoiceSelectionMode("multiple"); setCorrectChoiceIndexes((current) => current.length > 0 ? current : correctChoiceIndex >= 0 ? [correctChoiceIndex] : []); setQuestionCanvas((current) => ({ ...current, choiceLayout: current.choiceLayout ? { ...current.choiceLayout, presentation: "content" } : { grouped: true, direction: "vertical", presentation: "content", x: 8, y: 35, positions: [] } })); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${multipleChoiceSelectionMode === "multiple" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-emerald-50"}`}>Multiple answers</button>
                  </div>
                  <p className="mt-2 text-xs text-emerald-700">{multipleChoiceSelectionMode === "multiple" ? "Check every answer students must select. Students receive the mark only for the exact set." : "Choose the one answer students must select."}</p>
                  {multipleChoiceSelectionMode === "single" ? (
                    <select className="mt-3 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3 font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200" value={correctChoiceIndex} onChange={(event) => { const index = Number(event.target.value); setCorrectChoiceIndex(index); setCorrectChoiceIndexes([index]); }}>
                      {choiceTexts.map((choice, index) => <option key={index} value={index}>Choice {String.fromCharCode(65 + index)}{choice.trim() ? ` — ${choice.trim()}` : ""}</option>)}
                    </select>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {choiceTexts.map((choice, index) => (
                        <label key={index} className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm text-slate-900 hover:bg-emerald-50">
                          <input type="checkbox" checked={correctChoiceIndexes.includes(index)} onChange={() => setCorrectChoiceIndexes((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} className="mt-0.5 h-5 w-5 accent-emerald-600" />
                          <span><span className="font-semibold">Choice {String.fromCharCode(65 + index)}</span>{choice.trim() && <span className="ml-1 text-slate-600">— {choice.trim()}</span>}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <hr className="my-5 border-slate-700" />
              </>
            )}

            {questionType === "short-answer" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Answer Boxes</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Add as many answer boxes as this question needs.
                    </p>
                  </div>

                  <button
                    onClick={addAnswerBox}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Answer Box
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  {answerBoxes.map((answerBox, index) => (
                    <div
                      key={answerBox.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-semibold">
                          Answer Box {index + 1}
                        </h4>

                        <button
                          onClick={() => removeAnswerBox(answerBox.id)}
                          className="rounded-lg border border-red-800 px-3 py-1 text-sm text-red-300 hover:bg-red-950"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-sm text-slate-300">
                            Label / Instruction
                          </label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={answerBox.label}
                            onChange={(event) =>
                              updateAnswerBox(
                                answerBox.id,
                                "label",
                                event.target.value
                              )
                            }
                            placeholder={`Example: Answer ${index + 1}`}
                          />
                        </div>

                        <div>
                          <label className="text-sm text-slate-300">
                            Correct Answer
                          </label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={answerBox.correctAnswer}
                            onChange={(event) =>
                              updateAnswerBox(
                                answerBox.id,
                                "correctAnswer",
                                event.target.value
                              )
                            }
                            placeholder="Example: 56"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questionType === "sorting-order" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Correct Order</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Enter the items in the correct order. Students will see them mixed up and drag them into this order.
                    </p>
                  </div>

                  <button
                    onClick={addSortingItem}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Item
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {sortingItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                        <div className="text-sm font-semibold text-slate-400 lg:w-16">
                          #{index + 1}
                        </div>

                        <div className="grid flex-1 gap-4 md:grid-cols-[1fr_240px]">
                          <div>
                            <label className="text-sm text-slate-300">Item text</label>
                            <input
                              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                              value={item.text}
                              onChange={(event) =>
                                updateSortingItem(item.id, "text", event.target.value)
                              }
                              placeholder={`Item ${index + 1}`}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                              You can use text, an image, or both.
                            </p>
                          </div>

                          <div>
                            <label className="text-sm text-slate-300">Item image</label>
                            <input
                              type="file"
                              accept="image/*"
                              className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white"
                              onChange={(event) =>
                                updateSortingItemFile(item.id, event.target.files?.[0] || null)
                              }
                            />
                            {sortingItemPreviewUrls[item.id] && (
                              <div className="mt-3 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-2">
                                <img
                                  src={sortingItemPreviewUrls[item.id]}
                                  alt={item.text || `Item ${index + 1}`}
                                  className="h-24 w-24 rounded-lg object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 lg:self-center">
                          <button
                            onClick={() => moveSortingItem(item.id, "up")}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveSortingItem(item.id, "down")}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeSortingItem(item.id)}
                            className="rounded-lg border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questionType === "sorting-category" && (
              <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Categories</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Order does not matter. Students just need to place each item in the correct category.
                    </p>
                  </div>

                  <button
                    onClick={addSortingCategory}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Category
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {sortingCategories.map((category, index) => (
                    <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <label className="text-sm text-slate-300">Category {index + 1}</label>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                          value={category.name}
                          onChange={(event) => updateSortingCategory(category.id, event.target.value)}
                          placeholder={`Category ${index + 1}`}
                        />
                        <button
                          onClick={() => removeSortingCategory(category.id)}
                          className="rounded-lg border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Items</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      For each item, choose the category it belongs in.
                    </p>
                  </div>

                  <button
                    onClick={addSortingItem}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {sortingItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <div className="grid gap-4 xl:grid-cols-[1.1fr_260px_260px_auto] xl:items-end">
                        <div>
                          <label className="text-sm text-slate-300">Item {index + 1} text</label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={item.text}
                            onChange={(event) => updateSortingItem(item.id, "text", event.target.value)}
                            placeholder={`Item ${index + 1}`}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Optional if you are using an image.
                          </p>
                        </div>

                        <div>
                          <label className="text-sm text-slate-300">Item image</label>
                          <input
                            type="file"
                            accept="image/*"
                            className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white"
                            onChange={(event) =>
                              updateSortingItemFile(item.id, event.target.files?.[0] || null)
                            }
                          />
                          {sortingItemPreviewUrls[item.id] && (
                            <img
                              src={sortingItemPreviewUrls[item.id]}
                              alt={item.text || `Item ${index + 1}`}
                              className="mt-3 h-20 w-20 rounded-lg border border-slate-700 object-cover"
                            />
                          )}
                        </div>

                        <div>
                          <label className="text-sm text-slate-300">Correct Category</label>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={item.correctCategoryId || ""}
                            onChange={(event) => updateSortingItem(item.id, "correctCategoryId", event.target.value)}
                          >
                            <option value="">Choose category</option>
                            {sortingCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name || "Untitled category"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={() => removeSortingItem(item.id)}
                          className="rounded-lg border border-red-800 px-3 py-3 text-sm text-red-300 hover:bg-red-950"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questionType === "image-question" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <h3 className="text-lg font-semibold">
                  Image Overlay Question
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Upload an image, place answer zones, then choose whether
                  students type answers or drag choices into the zones.
                </p>

                <div className="mt-5">
                  <label className="text-sm text-slate-300">
                    Student Answer Format
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                    value={overlayAnswerMode}
                    onChange={(event) =>
                      setOverlayAnswerMode(
                        event.target.value as OverlayAnswerMode
                      )
                    }
                  >
                    <option value="text-entry">Text Entry</option>
                    <option value="drag-drop-text">
                      Drag and Drop Text Choices
                    </option>
                    <option value="drag-drop-image">
                      Drag and Drop Image Choices
                    </option>
                  </select>
                </div>

                <input
                  className="mt-5 block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleImageFileChange(event.target.files?.[0] || null)
                  }
                />

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-300">
                      Overlay boxes: {overlayBoxes.length}
                    </p>
                    <p className="text-xs text-slate-500">
                      Drag boxes to move them. Use the bottom-right corner to
                      resize.
                    </p>
                  </div>

                  <button
                    onClick={addOverlayBox}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Overlay Box
                  </button>
                </div>

                {imagePreviewUrl && (
                  <div className="mt-5 space-y-5">
                    <div>
                      <p className="mb-2 text-sm text-slate-300">
                        Image Preview
                      </p>

                      <div
                        ref={imageAreaRef}
                        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
                      >
                        <img
                          src={imagePreviewUrl}
                          alt="Question image preview"
                          className="pointer-events-none block w-full"
                        />

                        {overlayBoxes.map((box, index) => {
                          const isSelected = selectedOverlayBoxId === box.id;

                          return (
                            <div
                              key={box.id}
                              onPointerDown={(event) =>
                                startOverlayDrag(event, box, "move")
                              }
                              className={
                                isSelected
                                  ? "absolute cursor-move border-2 border-yellow-300 bg-yellow-400/10"
                                  : "absolute cursor-move border-2 border-blue-400 bg-blue-500/10"
                              }
                              style={{
                                left: `${box.x}%`,
                                top: `${box.y}%`,
                                width: `${box.width}%`,
                                height: `${box.height}%`,
                              }}
                            >
                              <div
                                className={
                                  isSelected
                                    ? "absolute left-0 top-0 rounded-br bg-yellow-400 px-1 py-0.5 text-[10px] font-semibold text-slate-950"
                                    : "absolute left-0 top-0 rounded-br bg-blue-500 px-1 py-0.5 text-[10px] font-semibold text-white"
                                }
                              >
                                {box.label.trim() || `Box ${index + 1}`}
                              </div>

                              <div
                                onPointerDown={(event) =>
                                  startOverlayDrag(event, box, "resize")
                                }
                                className={
                                  isSelected
                                    ? "absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-tl bg-yellow-400"
                                    : "absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-tl bg-blue-500"
                                }
                                title="Drag to resize"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {overlayBoxes.length > 0 && (
                      <div className="space-y-4">
                        {overlayBoxes.map((box, index) => {
                          const isSelected = selectedOverlayBoxId === box.id;

                          return (
                            <div
                              key={box.id}
                              className={
                                isSelected
                                  ? "rounded-xl border border-yellow-500 bg-yellow-950/20 p-4"
                                  : "rounded-xl border border-slate-800 bg-slate-900 p-4"
                              }
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <button
                                  onClick={() =>
                                    setSelectedOverlayBoxId(box.id)
                                  }
                                  className={
                                    isSelected
                                      ? "font-semibold text-yellow-300"
                                      : "font-semibold text-white"
                                  }
                                >
                                  Overlay Box {index + 1}
                                </button>

                                <button
                                  onClick={() => removeOverlayBox(box.id)}
                                  className="rounded-lg border border-red-800 px-3 py-1 text-sm text-red-300 hover:bg-red-950"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                  <label className="text-sm text-slate-300">
                                    Label / Instruction
                                  </label>
                                  <input
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.label}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "label",
                                        event.target.value
                                      )
                                    }
                                    placeholder={`Example: Box ${index + 1}`}
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Correct Answer
                                  </label>

                                  {overlayAnswerMode === "drag-drop-image" ? (
                                    <select
                                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                      value={box.correctAnswer}
                                      onChange={(event) =>
                                        updateOverlayBox(
                                          box.id,
                                          "correctAnswer",
                                          event.target.value
                                        )
                                      }
                                    >
                                      <option value="">
                                        Choose the correct image choice
                                      </option>
                                      {draggableImageChoices.map((choice, choiceIndex) => (
                                        <option key={choice.id} value={choice.id}>
                                          {choice.label.trim() ||
                                            `Image Choice ${choiceIndex + 1}`}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                      value={box.correctAnswer}
                                      onChange={(event) =>
                                        updateOverlayBox(
                                          box.id,
                                          "correctAnswer",
                                          event.target.value
                                        )
                                      }
                                      placeholder="Example: leaf"
                                    />
                                  )}

                                  {overlayAnswerMode === "drag-drop-image" &&
                                    draggableImageChoices.length === 0 && (
                                      <p className="mt-2 text-xs text-yellow-300">
                                        Add image choices below before choosing
                                        the correct answer.
                                      </p>
                                    )}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                  <label className="text-sm text-slate-300">
                                    X (% from left)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.x}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "x",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Y (% from top)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.y}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "y",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Width (%)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.width}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "width",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Height (%)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.height}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "height",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {overlayAnswerMode === "drag-drop-text" && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">
                              Draggable Choices
                            </h3>
                            <p className="mt-1 text-sm text-slate-400">
                              Students will drag these choices into the overlay
                              boxes.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={addCorrectAnswersAsChoices}
                              className="rounded-xl border border-green-700 px-4 py-2 text-sm font-semibold text-green-300 hover:bg-green-950"
                            >
                              Add Correct Answers as Choices
                            </button>

                            <button
                              onClick={addDraggableChoice}
                              className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                            >
                              Add Choice
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 space-y-3">
                          {draggableChoices.map((choice, index) => (
                            <div
                              key={choice.id}
                              className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 sm:flex-row"
                            >
                              <input
                                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                                value={choice.text}
                                onChange={(event) =>
                                  updateDraggableChoice(
                                    choice.id,
                                    event.target.value
                                  )
                                }
                                placeholder={`Choice ${index + 1}`}
                              />

                              <button
                                onClick={() =>
                                  removeDraggableChoice(choice.id)
                                }
                                className="rounded-xl border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {overlayAnswerMode === "drag-drop-image" && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">
                              Draggable Image Choices
                            </h3>
                            <p className="mt-1 text-sm text-slate-400">
                              Students will drag these images into the overlay
                              boxes.
                            </p>
                          </div>

                          <button
                            onClick={addDraggableImageChoice}
                            className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                          >
                            Add Image Choice
                          </button>
                        </div>

                        {draggableImageChoices.length === 0 ? (
                          <p className="mt-5 text-sm text-slate-400">
                            Add at least one image choice.
                          </p>
                        ) : (
                          <div className="mt-5 space-y-4">
                            {draggableImageChoices.map((choice, index) => {
                              const previewUrl =
                                imageChoicePreviewUrls[choice.id] ||
                                choice.imageUrl;

                              return (
                                <div
                                  key={choice.id}
                                  className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="flex-1 space-y-3">
                                      <div>
                                        <label className="text-sm text-slate-300">
                                          Choice Label
                                        </label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                                          value={choice.label}
                                          onChange={(event) =>
                                            updateDraggableImageChoiceLabel(
                                              choice.id,
                                              event.target.value
                                            )
                                          }
                                          placeholder={`Image Choice ${
                                            index + 1
                                          }`}
                                        />
                                      </div>

                                      <div>
                                        <label className="text-sm text-slate-300">
                                          Choice Image
                                        </label>
                                        <input
                                          className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                                          type="file"
                                          accept="image/*"
                                          onChange={(event) =>
                                            handleDraggableImageChoiceFile(
                                              choice.id,
                                              event.target.files?.[0] || null
                                            )
                                          }
                                        />
                                      </div>
                                    </div>

                                    {previewUrl && (
                                      <img
                                        src={previewUrl}
                                        alt={choice.label || "Choice preview"}
                                        className="h-24 w-24 rounded-xl border border-slate-700 object-contain"
                                      />
                                    )}

                                    <button
                                      onClick={() =>
                                        removeDraggableImageChoice(choice.id)
                                      }
                                      className="rounded-xl border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
                      <p className="font-semibold text-slate-200">
                        Current grading mode:
                      </p>
                      <p className="mt-1 text-slate-400">
                        {imageQuestionIsScored
                          ? overlayAnswerMode === "drag-drop-text"
                            ? "This image question is scored by text drag-and-drop choices."
                            : overlayAnswerMode === "drag-drop-image"
                            ? "This image question is scored by image drag-and-drop choices."
                            : "This image question is scored by typed answers."
                          : "This image question is currently unscored because it has no overlay boxes."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
              </section>
            </div>
            </>}

            <div className="relative isolate z-0 mt-10 overflow-hidden rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-3 text-slate-900 shadow-xl ring-4 ring-indigo-100/60">
                <div className="mb-3 flex items-center gap-3 rounded-xl bg-indigo-950 px-5 py-4 text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 shrink-0 text-indigo-200" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                  <div>
                    <h3 className="text-base font-bold">Student layout preview</h3>
                    <p className="mt-1 text-sm text-indigo-200">See how your question will appear to students. Make changes in the canvas above.</p>
                  </div>
                  <span className="ml-auto rounded-full border border-indigo-400/50 bg-indigo-800 px-3 py-1 text-xs font-bold uppercase tracking-wider">Preview</span>
                </div>

                <div className="overflow-hidden rounded-lg border border-indigo-200 bg-white">
                {questionLayout === "split" ? <div className="grid grid-cols-2">
                  <div className="flex min-w-0 items-start border-r border-slate-200"><QuestionCanvas canvas={leftQuestionCanvas} className="w-full" /></div>
                  <div className="flex min-w-0 items-start">{rightCanvasPreview}</div>
                </div> : rightCanvasPreview}
                </div>
              </div>

            {questionBuilderStep === 4 && <div className="flex flex-wrap gap-3">
              {editingQuestionId ? (
                <>
                  <span className="group relative inline-flex" title={saveDisabledReason || "Update question"}>
                    <button
                      type="button"
                      onClick={() => void publishQuestion()}
                      disabled={Boolean(saveDisabledReason)}
                      aria-describedby={saveDisabledReason ? "question-save-disabled-reason" : undefined}
                      className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploadingImage ? "Uploading..." : "Publish changes"}
                    </button>
                    {saveDisabledReason && <span id="question-save-disabled-reason" role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-max max-w-xs rounded-lg bg-slate-950 px-3 py-2 text-left text-xs font-medium text-white shadow-xl group-hover:block group-focus-within:block">{saveDisabledReason}</span>}
                  </span>

                  <button
                    onClick={() => void closeQuestionEditor()}
                    className="rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Close editor
                  </button>
                </>
              ) : (
                <span className="group relative inline-flex" title={saveDisabledReason || "Save question"}>
                  <button
                    type="button"
                    onClick={() => void publishQuestion()}
                    disabled={Boolean(saveDisabledReason)}
                    aria-describedby={saveDisabledReason ? "question-save-disabled-reason" : undefined}
                    className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingImage ? "Uploading..." : "Publish question"}
                  </button>
                  {saveDisabledReason && <span id="question-save-disabled-reason" role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-max max-w-xs rounded-lg bg-slate-950 px-3 py-2 text-left text-xs font-medium text-white shadow-xl group-hover:block group-focus-within:block">{saveDisabledReason}</span>}
                </span>
              )}
            </div>}
          </div>
          </section>
        </div>
        )}

        {questionDrafts.records.length > 0 && <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-slate-900">Draft questions</h2>
          <p className="mt-1 text-sm text-slate-600">Drafts are private and are not shown to students.</p>
          <div className="mt-3 space-y-2">{questionDrafts.records.map((draft, index) => <div key={draft.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
            <div><span className="mr-2 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Draft</span><span className="text-sm text-slate-800">{draft.question_id ? "Unpublished question edits" : `Question draft ${index + 1}`} · {String(draft.snapshot.questionType || "Question")}</span><p className="mt-1 text-xs text-slate-500">Saved {new Date(draft.updated_at).toLocaleString()}</p></div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button type="button" onClick={() => void resumeQuestionDraft(draft)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Resume draft</button>
              <button type="button" onClick={() => void deleteQuestionDraft(draft)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Delete draft</button>
            </div>
          </div>)}</div>
        </section>}

        <section className="mt-8">
          {questions.length === 0 ? (
            <p className="mt-4 text-slate-400">
              This assessment does not have any questions yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {reorderingQuestions && <p className="text-right text-xs font-semibold text-blue-400">Saving order…</p>}
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverQuestionId(question.id);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setDragOverQuestionId((current) => current === question.id ? null : current);
                    }
                  }}
                  onDrop={(event) => handleQuestionDrop(event, question.id)}
                  className={`${expandedQuestionIds.includes(question.id) ? "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" : ""} ${dragOverQuestionId === question.id && draggedQuestionId !== question.id ? "rounded-2xl ring-2 ring-blue-400 ring-offset-2" : ""}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandedQuestionIds.includes(question.id)}
                    onClick={() =>
                      setExpandedQuestionIds((current) =>
                        current.includes(question.id)
                          ? current.filter((id) => id !== question.id)
                          : [...current, question.id]
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedQuestionIds((current) =>
                          current.includes(question.id)
                            ? current.filter((id) => id !== question.id)
                            : [...current, question.id]
                        );
                      }
                    }}
                    className={`flex cursor-pointer flex-wrap items-center justify-between gap-3 bg-white px-5 py-4 transition hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 ${expandedQuestionIds.includes(question.id) ? "" : "rounded-xl border border-slate-200 shadow-sm hover:border-blue-300"}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <button
                        type="button"
                        draggable={!reorderingQuestions}
                        title="Drag to reorder question"
                        aria-label={`Drag Question ${index + 1} to reorder`}
                        onClick={(event) => event.stopPropagation()}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          setDraggedQuestionId(question.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/question-id", question.id);
                        }}
                        onDragEnd={() => {
                          setDraggedQuestionId(null);
                          setDragOverQuestionId(null);
                        }}
                        className="grid h-9 w-7 shrink-0 cursor-grab grid-cols-2 place-content-center gap-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
                      >
                        {Array.from({ length: 6 }).map((_, dotIndex) => (
                          <span key={dotIndex} className="h-1 w-1 rounded-full bg-current" />
                        ))}
                      </button>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-transform ${expandedQuestionIds.includes(question.id) ? "rotate-90" : ""}`}>›</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Question {index + 1} <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Published</span></span>
                        <span className="mt-0.5 block truncate text-sm text-slate-500">{question.prompt}</span>
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          duplicateQuestion(question);
                        }}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditingQuestion(question);
                        }}
                        className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteQuestion(question.id);
                        }}
                        className="rounded-lg border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {expandedQuestionIds.includes(question.id) && (
                    <>
                      <hr className="m-0 border-0 border-t border-slate-200" />
                      <SavedQuestionStudentPreview question={question} index={index} embedded />
                    </>
                  )}

                  <div className="hidden flex-col justify-between gap-4 sm:flex-row">
                    <div className="w-full">
                      <p className="text-sm text-slate-500">
                        Question {index + 1} ·{" "}
                        {question.question_type === "multiple-choice"
                          ? "Multiple Choice"
                          : (question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")
                          ? (question.question_type === "sort-into-groups" ? "Sort into groups" : "Drag & Drop")
                          : question.question_type === "dropdown"
                          ? "Dropdown"
                          : question.question_type === "short-answer"
                          ? "Short Answer"
                          : question.question_type === "fill-in-the-blank"
                          ? "Fill in the Blank"
                          : question.question_data.overlayAnswerMode ===
                            "drag-drop-text"
                          ? "Image Text Drag and Drop"
                          : question.question_data.overlayAnswerMode ===
                            "drag-drop-image"
                          ? "Image Drag and Drop"
                          : "Image Text Entry"}
                      </p>

                      <h3 className="mt-2 text-xl font-semibold">
                        {question.prompt}
                      </h3>

                      {question.question_type === "multiple-choice" && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {question.question_data.choices?.map(
                            (choice, choiceIndex) => (
                              <div
                                key={`${question.id}-${choiceIndex}`}
                                className={
                                  choice ===
                                  question.question_data.correctAnswer
                                    ? "rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                                    : "rounded-xl border border-slate-700 p-3 text-slate-300"
                                }
                              >
                                {choice}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {question.question_type === "short-answer" && (
                        <div className="mt-4 space-y-2">
                          {question.question_data.answerBoxes?.map(
                            (answerBox, answerBoxIndex) => (
                              <div
                                key={answerBox.id}
                                className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                              >
                                <span className="font-semibold">
                                  {answerBox.label ||
                                    `Answer ${answerBoxIndex + 1}`}
                                  :
                                </span>{" "}
                                {answerBox.correctAnswer}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {question.question_type === "fill-in-the-blank" && (
                        <div className="mt-4 space-y-2">
                          <div className="rounded-xl border border-slate-300 bg-white p-3 text-slate-950">
                            <FillBlankQuestion
                              preview
                              data={normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks)}
                            />
                          </div>

                          <div className="mt-3 space-y-2">
                            {normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks).blanks.map(
                              (blank, blankIndex) => (
                                <div
                                  key={blank.id}
                                  className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                                >
                                  <span className="font-semibold">
                                    Blank {blankIndex + 1}:
                                  </span>{" "}
                                  {blank.correctAnswer}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {question.question_type === "sorting-order" && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm text-slate-400">Correct order:</p>
                          {(question.question_data.correctOrder || []).map((itemId, orderIndex) => {
                            const item = question.question_data.sortingItems?.find((savedItem) => savedItem.id === itemId);
                            return (
                              <div
                                key={itemId}
                                className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                              >
                                <div className="flex items-center gap-3">
                                  {item?.imageUrl && (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.text || `Item ${orderIndex + 1}`}
                                      className="h-14 w-14 rounded-lg border border-green-700 object-cover"
                                    />
                                  )}
                                  <div>
                                    <span className="font-semibold">#{orderIndex + 1}:</span>{" "}
                                    {item ? getSortingItemDisplayLabel(item, `Item ${orderIndex + 1}`) : "Missing item"}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {question.question_type === "sorting-category" && (
                        <div className="mt-4 space-y-4">
                          {question.question_data.sortingCategories?.map((category) => (
                            <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                              <p className="font-semibold text-blue-200">{category.name}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {question.question_data.sortingItems
                                  ?.filter((item) => item.correctCategoryId === category.id)
                                  .map((item, itemIndex) => (
                                    <div key={item.id} className="flex items-center gap-2 rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-sm text-green-200">
                                      {item.imageUrl && (
                                        <img
                                          src={item.imageUrl}
                                          alt={item.text || `Item ${itemIndex + 1}`}
                                          className="h-10 w-10 rounded-md border border-green-700 object-cover"
                                        />
                                      )}
                                      <span>{getSortingItemDisplayLabel(item, `Item ${itemIndex + 1}`)}</span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {question.question_type === "image-question" &&
                        question.question_data.imageUrl && (
                          <div className="mt-4 space-y-4">
                            <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                              <img
                                src={question.question_data.imageUrl}
                                alt="Question image"
                                className="block w-full"
                              />

                              {question.question_data.overlayBoxes?.map(
                                (box, overlayIndex) => (
                                  <div
                                    key={box.id}
                                    className="absolute border-2 border-green-400 bg-green-500/10"
                                    style={{
                                      left: `${box.x}%`,
                                      top: `${box.y}%`,
                                      width: `${box.width}%`,
                                      height: `${box.height}%`,
                                    }}
                                  >
                                    <div className="absolute left-0 top-0 rounded-br bg-green-600 px-1 py-0.5 text-[10px] font-semibold text-white">
                                      {box.label.trim() ||
                                        `Box ${overlayIndex + 1}`}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>

                            {(question.question_data.overlayBoxes || []).length >
                            0 ? (
                              <div className="space-y-2">
                                {question.question_data.overlayBoxes?.map(
                                  (box, overlayIndex) => (
                                    <div
                                      key={box.id}
                                      className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                                    >
                                      <span className="font-semibold">
                                        {box.label || `Box ${overlayIndex + 1}`}:
                                      </span>{" "}
                                      {question.question_data.overlayAnswerMode ===
                                      "drag-drop-image"
                                        ? question.question_data.draggableImageChoices?.find(
                                            (choice) =>
                                              choice.id === box.correctAnswer
                                          )?.label || "No correct image selected"
                                        : box.correctAnswer}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                This image question currently has no overlay
                                answer boxes.
                              </p>
                            )}

                            {question.question_data.overlayAnswerMode ===
                              "drag-drop-text" && (
                              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                                <p className="text-sm font-semibold text-slate-300">
                                  Draggable choices:
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {question.question_data.draggableChoices?.map(
                                    (choice) => (
                                      <span
                                        key={choice.id}
                                        className="rounded-lg border border-blue-700 bg-blue-950 px-3 py-2 text-sm text-blue-100"
                                      >
                                        {choice.text}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                            {question.question_data.overlayAnswerMode ===
                              "drag-drop-image" && (
                              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                                <p className="text-sm font-semibold text-slate-300">
                                  Draggable image choices:
                                </p>
                                <div className="mt-3 flex flex-wrap gap-3">
                                  {question.question_data.draggableImageChoices?.map(
                                    (choice) => (
                                      <div
                                        key={choice.id}
                                        className="rounded-xl border border-blue-700 bg-blue-950 p-2 text-center text-sm text-blue-100"
                                      >
                                        <img
                                          src={choice.imageUrl}
                                          alt={choice.label}
                                          className="h-20 w-20 rounded-lg object-contain"
                                        />
                                        <p className="mt-1">{choice.label}</p>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </div>

                    <div className="flex h-fit flex-wrap gap-3">
                      <button
                        onClick={() => startEditingQuestion(question)}
                        className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteQuestion(question.id)}
                        className="rounded-xl border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </main>
    </>
  );
}
