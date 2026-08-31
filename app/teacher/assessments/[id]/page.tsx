"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { requireAccountRole } from "@/lib/roleGuard";
import RichTextEditor from "./RichTextEditor";
import DragDropEditor from "./DragDropEditor";
import { createDefaultDragDropData, normalizeDragDropData, type DragDropData } from "@/lib/dragDrop";

type QuestionType =
  | "multiple-choice"
  | "drag-and-drop"
  | "short-answer"
  | "fill-in-the-blank"
  | "image-question"
  | "sorting-order"
  | "sorting-category";

type OverlayAnswerMode = "text-entry" | "drag-drop-text" | "drag-drop-image";
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
  assessment_code: string;
  is_published: boolean;
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
    choiceTable?: ChoiceTable;
    correctAnswer?: string;
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

function extractBlanksFromTemplate(template: string): BlankBox[] {
  const matches = [...template.matchAll(/\[\[(.*?)\]\]/g)];

  return matches.map((match, index) => ({
    id: `blank-${index + 1}`,
    correctAnswer: match[1].trim(),
  }));
}

function makeStudentPreview(template: string) {
  return template.replace(/\[\[(.*?)\]\]/g, "[ answer box ]");
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

function ChoiceTablePreview({ table }: { table: ChoiceTable }) {
  return <div className="mt-6 overflow-x-auto"><table className={`w-full border-collapse text-left ${table.hasBorder ? "border border-slate-300" : ""}`}><thead><tr><th className={`w-16 px-3 py-3 text-center ${table.hasBorder ? "border border-slate-300" : ""}`}>Row</th>{table.headers.map((header, index) => <th key={index} className={`px-4 py-3 font-semibold ${table.hasBorder ? "border border-slate-300" : ""}`}>{header}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} className="hover:bg-blue-50/50"><td className={`px-3 py-3 text-center ${table.hasBorder ? "border border-slate-300" : ""}`}><span className="inline-block h-6 w-6 rounded-full border-2 border-slate-500" /></td>{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-4 py-3 ${table.hasBorder ? "border border-slate-300" : ""}`}>{table.cellImages?.[rowIndex]?.[cellIndex]?.imageUrl && <img src={table.cellImages[rowIndex][cellIndex].imageUrl} alt="" className="mx-auto mb-2 max-h-40 max-w-full object-contain" />}<div className="rich-text-content" dangerouslySetInnerHTML={{ __html: cell }} /></td>)}</tr>)}</tbody></table></div>;
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
        {question.question_type === "fill-in-the-blank" ? (
          <h3 className="mt-3 text-xl font-semibold leading-8">
            {makeStudentPreview(question.question_data.template || question.prompt)}
          </h3>
        ) : question.question_data.promptHtml ? (
          <div className="rich-text-content mt-3 text-xl leading-8" dangerouslySetInnerHTML={{ __html: question.question_data.promptHtml }} />
        ) : (
          <h3 className="mt-3 text-xl font-semibold leading-8">{question.prompt}</h3>
        )}

        {question.question_type === "multiple-choice" && question.question_data.choiceTable?.enabled ? (
          <ChoiceTablePreview table={question.question_data.choiceTable} />
        ) : question.question_type === "multiple-choice" && (
          <div className={`mt-6 grid w-fit max-w-full ${hasChoiceImages ? "grid-cols-1 gap-4 sm:grid-cols-2" : "grid-cols-[fit-content(32rem)] gap-3"}`}>
            {question.question_data.choices?.map((choice, choiceIndex) => (
              <div key={choiceIndex} className={`w-full rounded-xl border-2 border-slate-200 text-slate-700 ${hasChoiceImages ? "max-w-[22rem] p-4" : "max-w-full px-5 py-3"}`}>
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
        {question.question_type === "drag-and-drop" && (() => {
          const data = normalizeDragDropData(question.question_data.dragDrop);
          return (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                {data.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm">
                    {item.imageUrl && <img src={item.imageUrl} alt="" className="mb-2 h-16 max-w-28 object-contain" />}
                    {item.content}
                  </div>
                ))}
              </div>
              <div className={`grid gap-3 ${data.preset === "categories" ? "sm:grid-cols-2" : ""}`}>
                {data.zones.map((zone, zoneIndex) => (
                  <div key={zone.id} className="min-h-20 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-3">
                    <span className="text-sm font-semibold text-blue-800">{zone.label || `Position ${zoneIndex + 1}`}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
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
          <div className="mt-5 flex flex-wrap gap-3">
            {question.question_data.blanks?.map((blank, blankIndex) => (
              <span key={blank.id} className="h-11 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-400">Blank {blankIndex + 1}</span>
            ))}
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
  const [assessmentId, setAssessmentId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const [questionType, setQuestionType] =
    useState<QuestionType>("multiple-choice");
  const [dragDropData, setDragDropData] = useState<DragDropData>(() => createDefaultDragDropData());

  const [prompt, setPrompt] = useState("");
  const [promptHtml, setPromptHtml] = useState("");
  const [questionLayout, setQuestionLayout] =
    useState<QuestionLayout>("standard");
  const [leftPanelTitle, setLeftPanelTitle] = useState("");
  const [leftPanelTopContent, setLeftPanelTopContent] = useState("");
  const [leftPanelContent, setLeftPanelContent] = useState("");
  const [selectedLeftPanelImageFile, setSelectedLeftPanelImageFile] =
    useState<File | null>(null);
  const [existingLeftPanelImageUrl, setExistingLeftPanelImageUrl] = useState("");
  const [existingLeftPanelImagePath, setExistingLeftPanelImagePath] = useState("");
  const [leftPanelImagePreviewUrl, setLeftPanelImagePreviewUrl] = useState("");
  const [showUploadedImagePicker, setShowUploadedImagePicker] = useState(false);
  const [leftPanelTableEnabled, setLeftPanelTableEnabled] = useState(false);
  const [leftPanelTableHasBorder, setLeftPanelTableHasBorder] = useState(true);
  const [leftPanelTableCells, setLeftPanelTableCells] = useState<string[][]>([
    ["", ""],
    ["", ""],
  ]);

  const [choiceTexts, setChoiceTexts] = useState(["", "", "", ""]);
  const [choiceHtml, setChoiceHtml] = useState(["", "", "", ""]);
  const [correctChoiceIndex, setCorrectChoiceIndex] = useState(0);
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
  const [multipleChoiceImages, setMultipleChoiceImages] = useState<
    MultipleChoiceImage[]
  >([
    { imageUrl: "", imagePath: "" },
    { imageUrl: "", imagePath: "" },
    { imageUrl: "", imagePath: "" },
    { imageUrl: "", imagePath: "" },
  ]);
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

  const imageQuestionIsScored = useMemo(() => {
    return overlayBoxes.length > 0;
  }, [overlayBoxes]);

  const uploadedImages = useMemo(() => {
    const images = new Map<
      string,
      { url: string; path: string; label: string }
    >();

    function addImage(url: string | undefined, path: string | undefined, label: string) {
      if (url && !images.has(url)) {
        images.set(url, { url, path: path || "", label });
      }
    }

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

    return Array.from(images.values());
  }, [questions]);

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
      .in("question_type", ["multiple-choice", "drag-and-drop"])
      .order("question_order", { ascending: true })
      .order("id", { ascending: true });

    if (questionError) {
      alert(questionError.message);
      setLoading(false);
      return;
    }

    setAssessment(assessmentData);
    setTitleDraft(assessmentData.title);
    setQuestions((questionData || []) as Question[]);
    setLoading(false);
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

  async function copyStudentCode() {
    if (!assessment) {
      return;
    }

    try {
      await navigator.clipboard.writeText(assessment.assessment_code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      alert("Could not copy the code. Please copy it manually.");
    }
  }

  function updateRichPrompt(html: string) {
    setPromptHtml(html);
    const container = document.createElement("div");
    container.innerHTML = html;
    setPrompt(container.innerText);
  }

  function resetQuestionForm() {
    setQuestionType("multiple-choice");
    setDragDropData(createDefaultDragDropData());
    setPrompt("");
    setPromptHtml("");
    setQuestionLayout("standard");
    setLeftPanelTitle("");
    setLeftPanelTopContent("");
    setLeftPanelContent("");
    setSelectedLeftPanelImageFile(null);
    setExistingLeftPanelImageUrl("");
    setExistingLeftPanelImagePath("");
    setLeftPanelImagePreviewUrl("");
    setShowUploadedImagePicker(false);
    setLeftPanelTableEnabled(false);
    setLeftPanelTableHasBorder(true);
    setLeftPanelTableCells([["", ""], ["", ""]]);

    setChoiceTexts(["", "", "", ""]);
    setChoiceHtml(["", "", "", ""]);
    setCorrectChoiceIndex(0);
    setChoiceTableEnabled(false);
    setChoiceTableHeaders(["Column 1", "Column 2"]);
    setChoiceTableRows(Array.from({ length: 4 }, () => ["", ""]));
    setChoiceTableHasBorder(true);
    setChoiceTableCellImages(Array.from({ length: 4 }, () => Array.from({ length: 2 }, () => ({ imageUrl: "", imagePath: "" }))));
    setSelectedChoiceTableCellFiles({});
    setChoiceTableCellPreviewUrls({});
    setChoiceTableUploadedPickerCell(null);
    setMultipleChoiceImages(Array.from({ length: 4 }, () => ({ imageUrl: "", imagePath: "" })));
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
    if (choiceTexts.length <= 2) {
      alert("A multiple choice question needs at least 2 choices.");
      return;
    }

    setChoiceTexts((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setChoiceHtml((current) => current.filter((_, itemIndex) => itemIndex !== index));
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
      if (current === index) return 0;
      return current > index ? current - 1 : current;
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
                  <button
                    key={image.url}
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
                    className="overflow-hidden rounded-md border border-slate-700 bg-slate-900 p-1.5 text-left hover:border-blue-500"
                  >
                    <img
                      src={image.url}
                      alt={image.label}
                      className="h-20 w-full rounded bg-white object-contain"
                    />
                    <span className="mt-1 block truncate text-[10px] text-slate-400">
                      {image.label}
                    </span>
                  </button>
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

  function validateQuestionForm() {
    if (!prompt.trim()) {
      alert("Please enter a question.");
      return false;
    }

    if (questionType === "multiple-choice") {
      const choices = getChoicesFromForm();
      if (choiceTableEnabled) {
        if (choiceTableHeaders.some((header) => !header.trim())) {
          alert("Enter a heading for every table column.");
          return false;
        }
        if (
          choiceTableRows.length < 2 ||
          choiceTableRows.some((row, rowIndex) =>
            row.length !== choiceTableHeaders.length ||
            row.some((cell, columnIndex) =>
              !richHtmlToPlainText(cell) &&
              !selectedChoiceTableCellFiles[`${rowIndex}-${columnIndex}`] &&
              !choiceTableCellImages[rowIndex]?.[columnIndex]?.imageUrl
            )
          )
        ) {
          alert("Add at least 2 complete table rows. Every cell needs text, an image, or both.");
          return false;
        }
        return true;
      }
      const choiceHasContent = choices.map(
        (choice, index) =>
          Boolean(
            choice ||
              selectedMultipleChoiceImageFiles[index] ||
              multipleChoiceImagePreviewUrls[index] ||
              multipleChoiceImages[index]?.imageUrl
          )
      );

      if (choices.length < 2 || choiceHasContent.some((hasContent) => !hasContent)) {
        alert("Add at least 2 choices. Each choice needs text, an image, or both.");
        return false;
      }
    }

    if (questionType === "drag-and-drop") {
      if (dragDropData.items.length < 1 || dragDropData.items.some((item) => !item.content.trim() && !item.imageUrl)) {
        alert("Add at least one complete draggable item.");
        return false;
      }
      if (dragDropData.zones.length < 1 || dragDropData.zones.some((zone) => !zone.label.trim())) {
        alert("Add and name at least one drop target.");
        return false;
      }
      const assigned = dragDropData.zones.flatMap((zone) => zone.correctItemIds);
      if (!dragDropData.settings.allowUnusedItems && dragDropData.items.some((item) => !assigned.includes(item.id))) {
        alert("Assign every item to a correct target, or enable Allow distractors.");
        return false;
      }
    }

    if (questionType === "short-answer") {
      if (answerBoxes.length === 0) {
        alert("Please add at least one answer box.");
        return false;
      }

      if (
        answerBoxes.some((answerBox) => answerBox.correctAnswer.trim() === "")
      ) {
        alert("Please enter a correct answer for every answer box.");
        return false;
      }
    }

    if (questionType === "fill-in-the-blank") {
      const blanks = extractBlanksFromTemplate(prompt);

      if (blanks.length === 0) {
        alert("Please add at least one blank using [[answer]].");
        return false;
      }

      if (blanks.some((blank) => blank.correctAnswer === "")) {
        alert("Every blank must contain a correct answer.");
        return false;
      }
    }

    if (questionType === "sorting-order") {
      const cleanedItems = getCleanedSortingItems();

      if (cleanedItems.length < 2) {
        alert("Please add at least two sorting items.");
        return false;
      }
    }

    if (questionType === "sorting-category") {
      const cleanedItems = getCleanedSortingItems();
      const cleanedCategories = getCleanedSortingCategories();

      if (cleanedCategories.length < 2) {
        alert("Please add at least two categories.");
        return false;
      }

      if (cleanedItems.length < 2) {
        alert("Please add at least two sorting items.");
        return false;
      }

      const categoryIds = cleanedCategories.map((category) => category.id);
      const missingCategory = cleanedItems.find(
        (item) => !item.correctCategoryId || !categoryIds.includes(item.correctCategoryId)
      );

      if (missingCategory) {
        alert("Please choose the correct category for every item.");
        return false;
      }
    }

    if (questionType === "image-question") {
      if (!selectedImageFile && !existingImageUrl) {
        alert("Please upload an image for this question.");
        return false;
      }

      for (const box of overlayBoxes) {
        if (!box.correctAnswer.trim()) {
          alert("Please enter a correct answer for every overlay box.");
          return false;
        }

        if (box.width <= 0 || box.height <= 0) {
          alert("Overlay box width and height must be greater than 0.");
          return false;
        }
      }

      if (overlayAnswerMode === "drag-drop-text" && overlayBoxes.length > 0) {
        const cleanedChoices = draggableChoices
          .map((choice) => choice.text.trim())
          .filter(Boolean);

        if (cleanedChoices.length === 0) {
          alert("Please add at least one draggable choice.");
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
          alert(
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
          alert("Please add at least one draggable image choice.");
          return false;
        }

        const usableImageChoiceIds = usableImageChoices.map((choice) => choice.id);

        const missingImageChoice = overlayBoxes.find(
          (box) => !usableImageChoiceIds.includes(box.correctAnswer)
        );

        if (missingImageChoice) {
          alert(
            "Every overlay box correct answer must be selected from the draggable image choices."
          );
          return false;
        }
      }
    }

    return true;
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
    setSelectedLeftPanelImageFile(file);

    if (!file) {
      setLeftPanelImagePreviewUrl(existingLeftPanelImageUrl);
      return;
    }

    setLeftPanelImagePreviewUrl(URL.createObjectURL(file));
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
      const { data } = supabase.storage
        .from("question-images")
        .getPublicUrl(filePath);
      uploadedImages.push({ imageUrl: data.publicUrl, imagePath: filePath });
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
        const { data } = supabase.storage.from("question-images").getPublicUrl(filePath);
        nextImages[rowIndex][columnIndex] = { imageUrl: data.publicUrl, imagePath: filePath };
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

      const { data } = supabase.storage
        .from("question-images")
        .getPublicUrl(filePath);

      uploadedItems.push({
        ...item,
        imageUrl: data.publicUrl,
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

    const { data } = supabase.storage
      .from("question-images")
      .getPublicUrl(filePath);

    setUploadingImage(false);

    return {
      imageUrl: data.publicUrl,
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

        const { data } = supabase.storage
          .from("question-images")
          .getPublicUrl(filePath);

        uploadedChoices.push({
          id: choice.id,
          label,
          imageUrl: data.publicUrl,
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

    const { data } = supabase.storage
      .from("question-images")
      .getPublicUrl(filePath);

    setUploadingImage(false);
    return { imageUrl: data.publicUrl, imagePath: filePath };
  }

  async function getQuestionLayoutData() {
    const leftPanelImage =
      questionLayout === "split"
        ? await uploadLeftPanelImage()
        : { imageUrl: "", imagePath: "" };

    return {
      layout: questionLayout,
      promptHtml:
        questionType === "fill-in-the-blank" ? "" : promptHtml.trim(),
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
        const correctChoice = getCorrectChoice(choices);
        const choiceImages = await uploadMultipleChoiceImages();
        const tableCellImages = await uploadChoiceTableCellImages();

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "multiple-choice",
          prompt: prompt.trim(),
          question_data: {
            ...(await getQuestionLayoutData()),
            choices,
            choiceImages,
            choiceHtml,
            choiceTable: {
              enabled: choiceTableEnabled,
              headers: choiceTableHeaders.map((header) => header.trim()),
              rows: choiceTableRows.map((row) => row.map((cell) => cell.trim())),
              hasBorder: choiceTableHasBorder,
              cellImages: tableCellImages,
            },
            correctAnswer: correctChoice,
          },
          question_order: getNextQuestionOrder(),
        });

        if (error) {
          alert(error.message);
          return;
        }
      }
      if (questionType === "drag-and-drop") {
        const { error } = await supabase.from("questions").insert({ assessment_id: assessmentId, question_type: "drag-and-drop", prompt: prompt.trim(), question_data: { ...(await getQuestionLayoutData()), dragDrop: dragDropData }, question_order: getNextQuestionOrder() });
        if (error) { alert(error.message); return; }
      }

      resetQuestionForm();
      loadAssessment(assessmentId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
      setUploadingImage(false);
    }
  }

  function startEditingQuestion(question: Question) {
    setQuestionModalOpen(true);
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
    setDragDropData(normalizeDragDropData(question.question_data.dragDrop));
    setQuestionLayout(question.question_data.layout || "standard");
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

    if (question.question_type === "fill-in-the-blank") {
      setPrompt(question.question_data.template || question.prompt);
      setPromptHtml("");
    } else {
      setPrompt(question.prompt);
      setPromptHtml(
        question.question_data.promptHtml || plainTextToHtml(question.prompt)
      );
    }

    if (question.question_type === "multiple-choice") {
      const choices = question.question_data.choices || ["", "", "", ""];
      const correctChoice = question.question_data.correctAnswer || choices[0];
      const savedChoiceTable = question.question_data.choiceTable;
      const choiceCount = savedChoiceTable?.enabled
        ? Math.max(2, savedChoiceTable.rows.length)
        : Math.max(2, choices.length);
      setChoiceTexts(
        savedChoiceTable?.enabled
          ? Array.from({ length: choiceCount }, () => "")
          : choices.length >= 2 ? choices : ["", ""]
      );
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
        const correctChoice = getCorrectChoice(choices);
        const choiceImages = await uploadMultipleChoiceImages();
        const tableCellImages = await uploadChoiceTableCellImages();

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "multiple-choice",
            prompt: prompt.trim(),
            question_data: {
              ...(await getQuestionLayoutData()),
              choices,
              choiceImages,
              choiceHtml,
              choiceTable: {
                enabled: choiceTableEnabled,
                headers: choiceTableHeaders.map((header) => header.trim()),
                rows: choiceTableRows.map((row) => row.map((cell) => cell.trim())),
                hasBorder: choiceTableHasBorder,
                cellImages: tableCellImages,
              },
              correctAnswer: correctChoice,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }
      if (questionType === "drag-and-drop") {
        const { error } = await supabase.from("questions").update({ question_type: "drag-and-drop", prompt: prompt.trim(), question_data: { ...(await getQuestionLayoutData()), dragDrop: dragDropData } }).eq("id", editingQuestionId);
        if (error) { alert(error.message); return; }
      }

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

  const multipleChoicePreviewHasImages = choiceTexts.some(
    (_, index) =>
      Boolean(
        multipleChoiceImagePreviewUrls[index] ||
          multipleChoiceImages[index]?.imageUrl
      )
  );

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
            <Link href="/teacher" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Dashboard</Link>
            <Link href="/teacher/classrooms" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Classrooms</Link>
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

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <span>Student Code:</span>
                <span className="font-mono text-lg font-semibold tracking-wider text-blue-300">
                  {assessment.assessment_code}
                </span>
                <button
                  type="button"
                  onClick={copyStudentCode}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-blue-500/60 hover:bg-blue-500/10 hover:text-blue-200"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                    {codeCopied ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                    ) : (
                      <><rect x="9" y="9" width="11" height="11" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>
                    )}
                  </svg>
                  {codeCopied ? "Copied" : "Copy"}
                </button>
              </div>

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
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Assessment questions</h2>
            <p className="mt-1 text-sm text-slate-500">Create, preview, and manage the questions students will see.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetQuestionForm();
              setQuestionModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
          >
            <span className="text-xl leading-none">+</span> Add Question
          </button>
        </div>

        {questionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <button
            type="button"
            aria-label="Close question editor"
            onClick={resetQuestionForm}
            className="fixed inset-0 bg-black/35 backdrop-blur-sm"
          />
          <section className="relative z-10 w-full max-w-7xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
          <button
            type="button"
            onClick={resetQuestionForm}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          >
            ×
          </button>
          <h2 className="text-2xl font-semibold">
            {editingQuestionId ? "Edit Question" : "Add Question"}
          </h2>

          {editingQuestionId && (
            <p className="mt-2 text-sm text-yellow-300">
              You are currently editing an existing question.
            </p>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <p className="text-sm text-slate-300">Question Type</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setQuestionType("multiple-choice")} className={`rounded-xl border px-4 py-3 text-left font-semibold ${questionType === "multiple-choice" ? "border-blue-400 bg-blue-500/20 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>Multiple Choice</button>
                <button type="button" onClick={() => setQuestionType("drag-and-drop")} className={`rounded-xl border px-4 py-3 text-left font-semibold ${questionType === "drag-and-drop" ? "border-blue-400 bg-blue-500/20 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>Drag &amp; Drop</button>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-300">Student Page Layout</label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setQuestionLayout("standard")}
                  className={`rounded-xl border p-4 text-left transition ${
                    questionLayout === "standard"
                      ? "border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/20"
                      : "border-slate-700 bg-slate-950 hover:border-slate-600"
                  }`}
                >
                  <span className="block font-semibold">Standard</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Show the question and response together in the answer area.
                  </span>
                  <span className="mt-3 block h-10 rounded-md border border-slate-600 bg-slate-800" />
                </button>

                <button
                  type="button"
                  onClick={() => setQuestionLayout("split")}
                  className={`rounded-xl border p-4 text-left transition ${
                    questionLayout === "split"
                      ? "border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/20"
                      : "border-slate-700 bg-slate-950 hover:border-slate-600"
                  }`}
                >
                  <span className="block font-semibold">Left + Right Split</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Put reference material on the left and the question on the right.
                  </span>
                  <span className="mt-3 grid h-10 grid-cols-2 gap-1">
                    <span className="rounded-l-md border border-blue-500/60 bg-blue-950" />
                    <span className="rounded-r-md border border-blue-500/60 bg-slate-800" />
                  </span>
                </button>
              </div>
            </div>

            <hr className="border-slate-700" />

            <div
              className={`grid items-start gap-4 lg:gap-6 ${
                questionLayout === "split" ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {questionLayout === "split" && (
              <section className="min-w-0 rounded-2xl border border-blue-900/80 bg-blue-950/20 p-4 lg:sticky lg:top-4 lg:p-5">
                <div className="mb-5 flex items-center gap-3 border-b border-blue-900/60 pb-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-sm font-bold text-white">L</span>
                  <div>
                    <h3 className="font-semibold text-blue-100">Left side</h3>
                    <p className="text-xs text-slate-400">Reference material shown beside the question</p>
                  </div>
                </div>
                  <div>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Add a title, supporting image, and reference text. Each field is optional.
                </p>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Title
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  value={leftPanelTitle}
                  onChange={(event) => setLeftPanelTitle(event.target.value)}
                  placeholder="Example: Some Facts About Giant Canada Geese"
                />

                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Text above image
                </label>
                <RichTextEditor
                  value={leftPanelTopContent}
                  onChange={setLeftPanelTopContent}
                  placeholder="Add introductory text that appears before the image..."
                  minHeight="7rem"
                />

                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleLeftPanelImageChange(event.target.files?.[0] || null)
                  }
                  className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowUploadedImagePicker((current) => !current)
                  }
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-blue-600 hover:bg-blue-950/40 hover:text-blue-200"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="9" cy="10" r="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 20" />
                  </svg>
                  {showUploadedImagePicker ? "Close uploaded images" : "Select from uploaded"}
                </button>

                {showUploadedImagePicker && (
                  <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Uploaded in this assessment
                    </p>
                    {uploadedImages.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        No previously uploaded images are available yet.
                      </p>
                    ) : (
                      <div className="mt-3 grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                        {uploadedImages.map((image) => {
                          const selected =
                            leftPanelImagePreviewUrl === image.url;

                          return (
                            <button
                              key={image.url}
                              type="button"
                              onClick={() => {
                                setSelectedLeftPanelImageFile(null);
                                setExistingLeftPanelImageUrl(image.url);
                                setExistingLeftPanelImagePath(image.path);
                                setLeftPanelImagePreviewUrl(image.url);
                                setShowUploadedImagePicker(false);
                              }}
                              className={`overflow-hidden rounded-lg border p-2 text-left transition ${
                                selected
                                  ? "border-blue-500 bg-blue-950/50 ring-2 ring-blue-500/20"
                                  : "border-slate-700 bg-slate-900 hover:border-slate-500"
                              }`}
                            >
                              <img
                                src={image.url}
                                alt={image.label}
                                className="h-24 w-full rounded-md bg-white object-contain"
                              />
                              <span className="mt-2 block truncate text-xs text-slate-300">
                                {image.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {leftPanelImagePreviewUrl && (
                  <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <img
                      src={leftPanelImagePreviewUrl}
                      alt="Left panel preview"
                      className="max-h-64 w-full rounded-lg object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLeftPanelImageFile(null);
                        setExistingLeftPanelImageUrl("");
                        setExistingLeftPanelImagePath("");
                        setLeftPanelImagePreviewUrl("");
                      }}
                      className="mt-3 text-sm font-semibold text-red-300 hover:text-red-200"
                    >
                      Remove image
                    </button>
                  </div>
                )}

                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Text below image
                </label>
                <RichTextEditor
                  value={leftPanelContent}
                  onChange={setLeftPanelContent}
                  placeholder="Add captions, facts, or reference text that appears after the image..."
                />
                  </div>
              </section>
              )}

              <section className="min-w-0">
                {questionLayout === "split" && (
                  <div className="mb-5 flex items-center gap-3 border-b border-slate-700 pb-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500 text-sm font-bold text-white">R</span>
                  <div>
                    <h3 className="font-semibold text-white">Right side</h3>
                    <p className="text-xs text-slate-400">Question prompt and student response</p>
                  </div>
                  </div>
                )}

            <div>
              <label className="text-base font-semibold text-slate-200">
                {questionType === "fill-in-the-blank"
                  ? "Question Prompt with Blanks"
                  : "Question Prompt"}
              </label>
              {questionType === "fill-in-the-blank" ? (
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: A triangle has [[3]] sides and angle sum [[180]] degrees."
                />
              ) : (
                <RichTextEditor
                  value={promptHtml}
                  onChange={updateRichPrompt}
                  placeholder={
                    questionType === "image-question"
                      ? "Example: Label the image by typing or dragging answers into the boxes."
                      : questionType === "sorting-order"
                      ? "Example: Put these numbers in order from smallest to largest."
                      : questionType === "sorting-category"
                      ? "Example: Sort each item into the correct category."
                      : "Example: Solve the following question."
                  }
                  minHeight="7rem"
                />
              )}

              <hr className="my-5 border-slate-700" />

              {questionType === "fill-in-the-blank" && (
                <div className="mt-3 rounded-xl border border-blue-900 bg-blue-950/30 p-4 text-sm text-blue-100">
                  <p className="font-semibold">How to make blanks:</p>
                  <p className="mt-1">
                    Put the correct answer inside double square brackets.
                  </p>
                  <p className="mt-2 font-mono text-blue-200">
                    Example: The answer is [[56]].
                  </p>

                  <p className="mt-3 text-slate-300">Student preview:</p>
                  <p className="mt-1 rounded-lg bg-slate-950 p-3">
                    {prompt.trim()
                      ? makeStudentPreview(prompt)
                      : "Your preview will appear here."}
                  </p>
                </div>
              )}
            </div>

            {questionType === "drag-and-drop" && <DragDropEditor value={dragDropData} onChange={setDragDropData} />}

            {questionType === "multiple-choice" && (
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
                                {uploadedImages.map((image) => <button key={`${cellKey}-${image.url}`} type="button" onClick={() => {
                                  setChoiceTableCellImages((current) => current.map((imageRow, currentRowIndex) => currentRowIndex === rowIndex ? imageRow.map((currentImage, currentColumnIndex) => currentColumnIndex === columnIndex ? { imageUrl: image.url, imagePath: image.path } : currentImage) : imageRow));
                                  setSelectedChoiceTableCellFiles((current) => { const next = { ...current }; delete next[cellKey]; return next; });
                                  setChoiceTableCellPreviewUrls((current) => ({ ...current, [cellKey]: image.url }));
                                  setChoiceTableUploadedPickerCell(null);
                                }} className="overflow-hidden rounded-md border border-slate-200 bg-white p-1.5 text-left transition hover:border-blue-500">
                                  <img src={image.url} alt={image.label} className="h-20 w-full rounded object-contain" />
                                  <span className="mt-1 block truncate text-[11px] font-medium text-slate-600">{image.label}</span>
                                </button>)}
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
                    Correct Answer
                  </label>
                  <p className="mt-1 text-xs text-emerald-700">Choose the option students must select to receive the mark.</p>
                  <select
                    className="mt-3 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3 font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    value={correctChoiceIndex}
                    onChange={(event) => setCorrectChoiceIndex(Number(event.target.value))}
                  >
                    {choiceTexts.map((choice, index) => (
                      <option key={index} value={index}>
                        Choice {String.fromCharCode(65 + index)}{choice.trim() ? ` — ${choice.trim()}` : ""}
                      </option>
                    ))}
                  </select>
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

            <div className="mt-8 overflow-hidden rounded-2xl border border-slate-700 bg-white text-slate-900 shadow-xl">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                      Student layout preview
                    </p>
                  </div>
                </div>

                <div className={`grid min-h-96 ${questionLayout === "split" ? "lg:grid-cols-2" : "grid-cols-1"}`}>
                  {questionLayout === "split" && (
                  <div className="border-b border-slate-200 bg-slate-50/70 p-6 lg:border-b-0 lg:border-r">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Reference material
                    </p>
                    {leftPanelTitle.trim() && (
                      <h3 className="mt-3 text-2xl font-bold">{leftPanelTitle.trim()}</h3>
                    )}
                    {leftPanelTopContent.trim() && (
                      <div
                        className="rich-text-content mt-4 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: leftPanelTopContent }}
                      />
                    )}
                    {leftPanelImagePreviewUrl && (
                      <img
                        src={leftPanelImagePreviewUrl}
                        alt="Left panel preview"
                        className="mt-5 max-h-72 w-full rounded-xl border border-slate-200 bg-white object-contain p-2"
                      />
                    )}
                    {leftPanelContent.trim() && (
                      <div
                        className="rich-text-content mt-4 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: leftPanelContent }}
                      />
                    )}
                    {leftPanelTableEnabled &&
                      leftPanelTableCells.some((row) =>
                        row.some((cell) => cell.trim().length > 0)
                      ) && (
                      <div className="mt-5 overflow-x-auto">
                        <table
                          className={`w-full border-collapse text-left text-sm ${
                            leftPanelTableHasBorder
                              ? "border border-slate-300"
                              : ""
                          }`}
                        >
                          <tbody>
                            {leftPanelTableCells.map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {row.map((cell, columnIndex) => {
                                  const Cell = rowIndex === 0 ? "th" : "td";
                                  return (
                                    <Cell
                                      key={columnIndex}
                                      className={`px-3 py-2 ${
                                        rowIndex === 0 ? "font-semibold" : ""
                                      } ${
                                        leftPanelTableHasBorder
                                          ? "border border-slate-300"
                                          : ""
                                      }`}
                                    >
                                      {cell}
                                    </Cell>
                                  );
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
                    {prompt.trim() && (
                      questionType === "fill-in-the-blank" ? (
                        <h3 className="text-xl font-semibold leading-8">{makeStudentPreview(prompt.trim())}</h3>
                      ) : promptHtml.trim() ? (
                        <div className="rich-text-content text-xl leading-8" dangerouslySetInnerHTML={{ __html: promptHtml }} />
                      ) : null
                    )}

                    {questionType === "multiple-choice" && choiceTableEnabled ? (
                      <ChoiceTablePreview table={{ enabled: true, headers: choiceTableHeaders, rows: choiceTableRows, hasBorder: choiceTableHasBorder, cellImages: choiceTableRows.map((row, rowIndex) => row.map((_, columnIndex) => ({ imageUrl: choiceTableCellPreviewUrls[`${rowIndex}-${columnIndex}`] || choiceTableCellImages[rowIndex]?.[columnIndex]?.imageUrl || "", imagePath: choiceTableCellImages[rowIndex]?.[columnIndex]?.imagePath || "" }))) }} />
                    ) : questionType === "multiple-choice" && (
                      <div className={`mt-6 grid w-fit max-w-full ${multipleChoicePreviewHasImages ? "grid-cols-1 gap-4 sm:grid-cols-2" : "grid-cols-[fit-content(32rem)] gap-3"}`}>
                        {choiceTexts.map((choice, index) => (
                          (choice.trim() || multipleChoiceImagePreviewUrls[index] || multipleChoiceImages[index]?.imageUrl) &&
                          <div key={index} className={`w-full rounded-xl border-2 border-slate-200 text-slate-700 ${multipleChoicePreviewHasImages ? "max-w-[22rem] p-4" : "max-w-full px-5 py-3"}`}>
                            {(multipleChoiceImagePreviewUrls[index] ||
                              multipleChoiceImages[index]?.imageUrl) && (
                              <img
                                src={
                                  multipleChoiceImagePreviewUrls[index] ||
                                  multipleChoiceImages[index]?.imageUrl
                                }
                                alt={choice || `Choice ${String.fromCharCode(65 + index)}`}
                                className="mx-auto mb-3 h-auto max-h-72 w-auto max-w-full rounded-lg object-contain"
                              />
                            )}
                            {choiceHtml[index] ? <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: choiceHtml[index] }} /> : choice.trim()}
                          </div>
                        ))}
                      </div>
                    )}

                    {questionType === "short-answer" && (
                      <div className="mt-6 space-y-4">
                        {answerBoxes.map((box, index) => (
                          <label key={box.id} className="block text-sm font-medium text-slate-600">
                            {box.label.trim() || `Answer ${index + 1}`}
                            <span className="mt-2 block h-12 rounded-xl border border-slate-300 bg-white" />
                          </label>
                        ))}
                      </div>
                    )}

                    {questionType === "fill-in-the-blank" && (
                      <div className="mt-6 flex flex-wrap gap-3">
                        {extractBlanksFromTemplate(prompt).map((blank, index) => (
                          <span key={blank.id} className="h-11 w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-400">
                            Blank {index + 1}
                          </span>
                        ))}
                      </div>
                    )}

                    {questionType === "sorting-order" && (
                      <div className="mt-6 space-y-2">
                        {sortingItems.filter(sortingItemHasContent).map((item, index) => (
                          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-700">{index + 1}</span>
                            <span className="font-medium">{getSortingItemDisplayLabel(item, `Item ${index + 1}`)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {questionType === "sorting-category" && (
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {sortingCategories.filter((category) => category.name.trim()).map((category) => (
                          <div key={category.id} className="min-h-24 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-3 font-semibold text-blue-800">
                            {category.name.trim()}
                          </div>
                        ))}
                      </div>
                    )}

                    {questionType === "image-question" && (
                      <div className="mt-6">
                        {imagePreviewUrl ? (
                          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            <img src={imagePreviewUrl} alt="Question preview" className="w-full object-contain" />
                            {overlayBoxes.map((box) => (
                              <span
                                key={box.id}
                                className="absolute flex items-center justify-center rounded border-2 border-blue-500 bg-white/90 px-1 text-[10px] font-semibold text-blue-700"
                                style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
                              >
                                {box.label || "Answer"}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            <div className="flex flex-wrap gap-3">
              {editingQuestionId ? (
                <>
                  <button
                    onClick={updateQuestion}
                    disabled={uploadingImage}
                    className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingImage ? "Uploading..." : "Update Question"}
                  </button>

                  <button
                    onClick={resetQuestionForm}
                    className="rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Cancel Edit
                  </button>
                </>
              ) : (
                <button
                  onClick={addQuestion}
                  disabled={uploadingImage}
                  className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingImage ? "Uploading..." : "Save Question"}
                </button>
              )}
            </div>
          </div>
          </section>
        </div>
        )}

        <section className="mt-8">
          {questions.length === 0 ? (
            <p className="mt-4 text-slate-400">
              This assessment does not have any questions yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>Drag the handle on any question to change its order.</span>
                {reorderingQuestions && <span className="font-semibold text-blue-600">Saving order…</span>}
              </div>
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
                        <span className="block text-sm font-semibold text-slate-900">Question {index + 1}</span>
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
                          <p className="text-sm text-slate-400">
                            Original template:
                          </p>
                          <p className="rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-slate-200">
                            {question.question_data.template}
                          </p>

                          <div className="mt-3 space-y-2">
                            {question.question_data.blanks?.map(
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
