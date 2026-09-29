"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ImageMarkup from "./ImageMarkup";
import DragDropQuestion from "./DragDropQuestion";
import StudentAssessmentFrame from "./StudentAssessmentFrame";
import FillBlankQuestion from "@/app/components/FillBlankQuestion";
import QuestionCanvas from "@/app/components/QuestionCanvas";
import CanvasDropdownField from "@/app/components/CanvasDropdownField";
import CanvasFillBlankField from "@/app/components/CanvasFillBlankField";
import { asLocationDragDropData, getChoiceContentSizes, gradeDragDrop, isDragDropAnswered, normalizeCanvasHeight, normalizeDragDropData, type DragDropData, type DragDropPlacements } from "@/lib/dragDrop";
import { dropdownIsAnswered, getDropdownEntryOptions, getDropdownSegments, gradeDropdown, normalizeDropdownData, type DropdownEntry, type DropdownQuestionData, type DropdownResponses } from "@/lib/dropdownQuestion";
import { fillBlankIsAnswered, getFillBlankBounds, gradeFillBlank, normalizeFillBlankData, type FillBlankData } from "@/lib/fillBlank";
import { getMultipleChoiceSelectionMode, gradeMultipleChoice, normalizeMultipleChoiceResponse, toggleMultipleChoiceAnswer, type MultipleChoiceSelectionMode } from "@/lib/multipleChoice";
import { lockdownFrameWasInterrupted, lockdownPageLostFocus } from "@/lib/lockdownMonitor";
import { normalizeQuestionCanvas, type QuestionCanvasData } from "@/lib/questionCanvas";
import { hydratePrivateImageUrls } from "@/lib/privateImageUrls";

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

type StudentPanelView = "left" | "split" | "right";

type OverlayAnswerMode = "text-entry" | "drag-drop-text" | "drag-drop-image";
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
type ChoiceTable = { enabled: boolean; headers: string[]; rows: string[][]; hasBorder: boolean; cellImages?: MultipleChoiceImage[][] };

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

type AssessmentEntryState = {
  runStatus: "waiting" | "live" | "ended";
  studentStatus: "waiting" | "active" | "blocked" | "submitted";
  blockReason: string | null;
  kickCount: number;
};

type DraftAnswerPayload = {
  question_id: string;
  answer_data: Record<string, unknown>;
};

type DraftAnswerRow = DraftAnswerPayload & { updated_at: string };

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
    selectionMode?: MultipleChoiceSelectionMode;
    correctAnswer?: string;
    correctAnswers?: string[];
    answerBoxes?: AnswerBox[];
    template?: string;
    blanks?: BlankBox[];
    fillBlank?: FillBlankData;
    imageUrl?: string;
    imagePath?: string;
    overlayBoxes?: OverlayBox[];
    overlayAnswerMode?: OverlayAnswerMode;
    draggableChoices?: DraggableChoice[];
    draggableImageChoices?: DraggableImageChoice[];
    sortingItems?: SortingItem[];
    sortingCategories?: SortingCategory[];
    correctOrder?: string[];
    dragDrop?: DragDropData;
    dropdown?: DropdownQuestionData;
    layout?: "standard" | "split";
    leftPanelTitle?: string;
    leftPanelTopContent?: string;
    leftPanelContent?: string;
    leftPanelImageUrl?: string;
    leftPanelImagePath?: string;
    leftPanelTable?: LeftPanelTable;
    canvas?: QuestionCanvasData;
    leftCanvas?: QuestionCanvasData;
  };
  question_order: number;
};

type ShortAnswerResponses = Record<string, string>;
type FillBlankResponses = Record<string, string>;
type OverlayResponses = Record<string, string>;
type SortingOrderResponses = Record<string, string[]>;
type SortingCategoryResponses = Record<string, Record<string, string>>;

function getMultipleChoiceValue(choice: string, index: number) {
  return choice || `__image_choice_${index + 1}__`;
}

function normalizeAnswer(answer: string | undefined) {
  return (answer || "").trim().toLowerCase();
}

function shuffleArray<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function getSortingItemDisplayLabel(item: SortingItem | undefined, fallback = "Item") {
  if (!item) {
    return fallback;
  }

  if (item.text.trim()) {
    return item.text.trim();
  }

  return fallback;
}

function leftPanelTableHasContent(table: LeftPanelTable | undefined) {
  return Boolean(
    table?.enabled &&
      table.cells.some((row) => row.some((cell) => cell.trim().length > 0))
  );
}

function dropdownEntryBounds(entry: DropdownEntry, index: number) {
  const x = entry.x ?? 8 + (index % 3) * 24;
  const y = entry.y ?? Math.min(84, 35 + Math.floor(index / 3) * 14);
  return { x, y, width: Math.min(entry.width ?? 20, 100 - x), height: Math.min(entry.height ?? 8, 100 - y) };
}

function StudentReferencePanel({ data, compact = false }: { data: Question["question_data"]; compact?: boolean }) {
  return (
    <div className={`h-full overflow-auto bg-slate-50/70 text-slate-900 ${compact ? "p-[3cqw]" : "p-4 sm:p-6 lg:p-8"}`}>
      <p className={`${compact ? "text-[1.15cqw]" : "text-xs"} font-semibold uppercase tracking-wider text-slate-400`}>Reference material</p>
      {data.leftPanelTitle && <h2 className={`${compact ? "mt-[1.4cqw] text-[2.2cqw]" : "mt-3 text-2xl"} font-bold leading-tight`}>{data.leftPanelTitle}</h2>}
      {data.leftPanelTopContent && <div className={`rich-text-content ${compact ? "mt-[1.8cqw] text-[1.65cqw]" : "mt-5 text-lg"} text-slate-800`} dangerouslySetInnerHTML={{ __html: data.leftPanelTopContent }} />}
      {data.leftPanelImageUrl && <div className={compact ? "mt-[1.8cqw]" : "mt-5"}><ImageMarkup src={data.leftPanelImageUrl} alt={data.leftPanelTitle || "Question reference"} /></div>}
      {data.leftPanelContent && <div className={`rich-text-content ${compact ? "mt-[1.8cqw] text-[1.65cqw]" : "mt-5 text-lg"} text-slate-800`} dangerouslySetInnerHTML={{ __html: data.leftPanelContent }} />}
      {leftPanelTableHasContent(data.leftPanelTable) && (
        <div className={compact ? "mt-[1.8cqw] overflow-x-auto" : "mt-5 overflow-x-auto"}>
          <table className={`w-full border-collapse text-left ${compact ? "text-[1.35cqw]" : "text-base"} ${data.leftPanelTable?.hasBorder ? "border border-slate-300" : ""}`}>
            <tbody>{data.leftPanelTable?.cells.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => { const Cell = rowIndex === 0 ? "th" : "td"; return <Cell key={columnIndex} className={`${compact ? "px-[1.1cqw] py-[0.8cqw]" : "px-4 py-3"} ${rowIndex === 0 ? "font-semibold" : ""} ${data.leftPanelTable?.hasBorder ? "border border-slate-300" : ""}`}>{cell}</Cell>; })}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StudentAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const teacherPreview = searchParams.get("preview") === "1";
  const [studentUserId, setStudentUserId] = useState("");
  const [accountRole, setAccountRole] = useState<"teacher" | "student">("student");
  const [accessDenied, setAccessDenied] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studentName, setStudentName] = useState("");

  const [multipleChoiceAnswers, setMultipleChoiceAnswers] = useState<
    Record<string, string[]>
  >({});

  const [shortAnswerResponses, setShortAnswerResponses] = useState<
    Record<string, ShortAnswerResponses>
  >({});

  const [fillBlankResponses, setFillBlankResponses] = useState<
    Record<string, FillBlankResponses>
  >({});

  const [imageOverlayResponses, setImageOverlayResponses] = useState<
    Record<string, OverlayResponses>
  >({});

  const [sortingOrderResponses, setSortingOrderResponses] =
    useState<SortingOrderResponses>({});
  const [sortingCategoryResponses, setSortingCategoryResponses] =
    useState<SortingCategoryResponses>({});
  const [dragDropResponses, setDragDropResponses] = useState<Record<string, DragDropPlacements>>({});
  const [dropdownResponses, setDropdownResponses] = useState<Record<string, DropdownResponses>>({});
  const [draggedSortingItem, setDraggedSortingItem] = useState<{
    questionId: string;
    itemId: string;
  } | null>(null);

  const [draggedChoice, setDraggedChoice] = useState<{
    questionId: string;
    choiceValue: string;
  } | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [lockdownExit, setLockdownExit] = useState(false);
  const [entryState, setEntryState] = useState<AssessmentEntryState | null>(null);
  const [questionsReady, setQuestionsReady] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "restored" | "error">("idle");
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resourcePanelView, setResourcePanelView] = useState<StudentPanelView>("split");
  const [studentPanelView, setStudentPanelView] = useState<StudentPanelView>("split");
  const activeSecondsRef = useRef(0);
  const lockdownEndingRef = useRef(false);
  const accessTokenRef = useRef("");
  const questionsLoadingRef = useRef(false);
  const questionsLoadedRef = useRef(false);
  const autosaveReadyRef = useRef(false);
  const draftPayloadRef = useRef<DraftAnswerPayload[]>([]);
  const savedDraftSignaturesRef = useRef(new Map<string, string>());
  const draftSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      loadAssessment(resolvedParams.id);
    }

    getParams();
  }, [params, teacherPreview]);

  useEffect(() => {
    if (!assessment || accountRole !== "student" || teacherPreview || submitted || entryState?.studentStatus === "submitted") return;

    lockdownEndingRef.current = false;

    async function flushActivity() {
      const seconds = activeSecondsRef.current;
      if (!seconds || !assessment) return;
      activeSecondsRef.current = 0;
      const { error } = await supabase.rpc("record_assessment_activity", {
        target_assessment: assessment.id,
        seconds_to_add: seconds,
      });
      if (error) activeSecondsRef.current += seconds;
    }

    async function terminateForLockdown() {
      if (lockdownEndingRef.current || !assessment) return;
      lockdownEndingRef.current = true;
      setLockdownExit(true);
      await persistDraftAnswers(assessment.id);
      const seconds = activeSecondsRef.current;
      activeSecondsRef.current = 0;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      let violationRecorded = false;
      if (supabaseUrl && anonKey && accessTokenRef.current) {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_assessment_kick`, {
          method: "POST",
          keepalive: true,
          headers: { apikey: anonKey, Authorization: `Bearer ${accessTokenRef.current}`, "Content-Type": "application/json" },
          body: JSON.stringify({ target_assessment: assessment.id, seconds_to_add: seconds }),
        });
        violationRecorded = response.ok;
        if (!response.ok) {
          const { error } = await supabase.rpc("record_assessment_kick", { target_assessment: assessment.id, seconds_to_add: seconds });
          violationRecorded = !error;
        }
      } else {
        const { error } = await supabase.rpc("record_assessment_kick", { target_assessment: assessment.id, seconds_to_add: seconds });
        violationRecorded = !error;
      }
      if (violationRecorded) setEntryState((current) => current ? { ...current, studentStatus: "blocked", blockReason: "Tried to leave lockdown browser", kickCount: current.kickCount + 1 } : current);
      else await refreshEntryState(assessment.id);
      setLockdownExit(false);
    }

    const activeTimer = window.setInterval(() => {
      if (
        entryState?.runStatus === "live"
        && entryState.studentStatus === "active"
        && questionsReady
        && document.visibilityState === "visible"
        && document.hasFocus()
      ) {
        activeSecondsRef.current += 1;
      }
    }, 1000);
    const flushTimer = window.setInterval(() => void flushActivity(), 10000);
    const focusCheckTimer = window.setInterval(() => {
      if (lockdownPageLostFocus(document.visibilityState, document.hasFocus())) void terminateForLockdown();
    }, 400);
    let lastAnimationFrame = performance.now();
    let animationFrameId = 0;
    const monitorAnimationFrames = (now: number) => {
      const frameGap = now - lastAnimationFrame;
      lastAnimationFrame = now;
      if (lockdownFrameWasInterrupted(frameGap)) void terminateForLockdown();
      animationFrameId = window.requestAnimationFrame(monitorAnimationFrames);
    };
    animationFrameId = window.requestAnimationFrame(monitorAnimationFrames);
    const handleVisibilityChange = () => {
      if (lockdownPageLostFocus(document.visibilityState, document.hasFocus())) void terminateForLockdown();
    };
    const handleBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus()) void terminateForLockdown();
      }, 150);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", terminateForLockdown);
    return () => {
      window.clearInterval(activeTimer);
      window.clearInterval(flushTimer);
      window.clearInterval(focusCheckTimer);
      window.cancelAnimationFrame(animationFrameId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", terminateForLockdown);
      if (!lockdownEndingRef.current) void flushActivity();
    };
  }, [assessment, accountRole, submitted, teacherPreview, entryState?.runStatus, entryState?.studentStatus, questionsReady]);

  useEffect(() => {
    if (entryState?.studentStatus === "active") lockdownEndingRef.current = false;
  }, [entryState?.studentStatus]);

  async function loadQuestions(assessmentId: string, restoreStudentDraft = true) {
    if (questionsLoadedRef.current || questionsLoadingRef.current) return;
    questionsLoadingRef.current = true;
    const { data: questionData, error: questionError } = await supabase.from("questions").select("*").eq("assessment_id", assessmentId).in("question_type", ["multiple-choice", "drag-and-drop", "sort-into-groups", "dropdown", "fill-in-the-blank"]).order("question_order", { ascending: true });
    if (questionError) {
      questionsLoadingRef.current = false;
      setQuestionsReady(true);
      alert(questionError.message);
      return;
    }
    const { data: resourceAssessment } = await supabase.from("assessments").select("*").eq("id", assessmentId).single();
    if (resourceAssessment) setAssessment(await hydratePrivateImageUrls(supabase, resourceAssessment));
    let typedQuestions = (questionData || []) as Question[];
    try {
      typedQuestions = await hydratePrivateImageUrls(supabase, typedQuestions);
    } catch (error) {
      console.error("Could not authorize assessment images:", error);
    }
    const initialMultipleChoiceAnswers: Record<string, string[]> = {};
    const initialShortAnswerResponses: Record<string, ShortAnswerResponses> = {};
    const initialFillBlankResponses: Record<string, FillBlankResponses> = {};
    const initialImageOverlayResponses: Record<string, OverlayResponses> = {};
    const initialOrderResponses: SortingOrderResponses = {};
    const initialCategoryResponses: SortingCategoryResponses = {};
    const initialDragDropResponses: Record<string, DragDropPlacements> = {};
    const initialDropdownResponses: Record<string, DropdownResponses> = {};
    typedQuestions.forEach((question) => {
      if (question.question_type === "sorting-order") initialOrderResponses[question.id] = shuffleArray(question.question_data.sortingItems?.map((item) => item.id) || []);
      if (question.question_type === "sorting-category") {
        const assignments: Record<string, string> = {};
        (question.question_data.sortingItems || []).forEach((item) => { assignments[item.id] = ""; });
        initialCategoryResponses[question.id] = assignments;
      }
      if ((question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")) initialDragDropResponses[question.id] = Object.fromEntries(normalizeDragDropData(question.question_data.dragDrop).zones.map((zone) => [zone.id, []]));
      if (question.question_type === "dropdown") initialDropdownResponses[question.id] = Object.fromEntries(normalizeDropdownData(question.question_data.dropdown).entries.map((entry) => [entry.id, ""]));
      if (question.question_type === "fill-in-the-blank") initialFillBlankResponses[question.id] = Object.fromEntries(normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks).blanks.map((blank) => [blank.id, ""]));
    });

    let savedDrafts: DraftAnswerRow[] = [];
    if (restoreStudentDraft) {
      const { data, error } = await supabase.rpc("load_assessment_draft_answers", { target_assessment: assessmentId });
      if (error) {
        setAutosaveStatus("error");
      } else {
        savedDrafts = (data || []) as DraftAnswerRow[];
      }
    }

    savedDrafts.forEach((draft) => {
      const question = typedQuestions.find((candidate) => candidate.id === draft.question_id);
      if (!question) return;
      const saved = draft.answer_data;
      if (question.question_type === "multiple-choice") initialMultipleChoiceAnswers[question.id] = normalizeMultipleChoiceResponse(saved.answer, saved.selectedAnswers);
      if ((question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups") && saved.placements && typeof saved.placements === "object") initialDragDropResponses[question.id] = saved.placements as DragDropPlacements;
      if (question.question_type === "dropdown" && saved.answers && typeof saved.answers === "object") initialDropdownResponses[question.id] = saved.answers as DropdownResponses;
      if (question.question_type === "short-answer" && saved.answers && typeof saved.answers === "object") initialShortAnswerResponses[question.id] = saved.answers as ShortAnswerResponses;
      if (question.question_type === "fill-in-the-blank" && saved.answers && typeof saved.answers === "object") initialFillBlankResponses[question.id] = saved.answers as FillBlankResponses;
      if (question.question_type === "image-question" && saved.answers && typeof saved.answers === "object") initialImageOverlayResponses[question.id] = saved.answers as OverlayResponses;
      if (question.question_type === "sorting-order" && Array.isArray(saved.orderedItemIds)) initialOrderResponses[question.id] = saved.orderedItemIds as string[];
      if (question.question_type === "sorting-category" && saved.categoryAssignments && typeof saved.categoryAssignments === "object") initialCategoryResponses[question.id] = saved.categoryAssignments as Record<string, string>;
    });

    setQuestions(typedQuestions);
    setMultipleChoiceAnswers(initialMultipleChoiceAnswers);
    setShortAnswerResponses(initialShortAnswerResponses);
    setFillBlankResponses(initialFillBlankResponses);
    setImageOverlayResponses(initialImageOverlayResponses);
    setDragDropResponses(initialDragDropResponses);
    setDropdownResponses(initialDropdownResponses);
    setSortingOrderResponses(initialOrderResponses);
    setSortingCategoryResponses(initialCategoryResponses);
    savedDraftSignaturesRef.current = new Map(savedDrafts.map((draft) => [draft.question_id, JSON.stringify(draft.answer_data)]));
    autosaveReadyRef.current = restoreStudentDraft;
    if (restoreStudentDraft && savedDrafts.length > 0) setAutosaveStatus("restored");
    questionsLoadedRef.current = true;
    questionsLoadingRef.current = false;
    setQuestionsReady(true);
  }

  async function refreshEntryState(assessmentId: string) {
    const { data, error } = await supabase.rpc("assessment_entry_state", { target_assessment: assessmentId });
    if (error || !data) return;
    const next = data as AssessmentEntryState;
    setEntryState(next);
    if (next.runStatus === "live" && next.studentStatus === "active") await loadQuestions(assessmentId);
  }

  useEffect(() => {
    if (!assessment || accountRole !== "student" || teacherPreview || submitted) return;
    const timer = window.setInterval(() => void refreshEntryState(assessment.id), 2000);
    return () => window.clearInterval(timer);
  }, [assessment, accountRole, submitted, teacherPreview]);

  useEffect(() => {
    if (
      !assessment
      || accountRole !== "student"
      || teacherPreview
      || submitted
      || !entryState?.studentStatus
      || entryState.studentStatus === "submitted"
    ) return;

    const recordPresence = async () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      await supabase.rpc("record_assessment_presence", { target_assessment: assessment.id });
    };

    void recordPresence();
    const timer = window.setInterval(() => void recordPresence(), 10_000);
    return () => window.clearInterval(timer);
  }, [assessment, accountRole, entryState?.studentStatus, submitted, teacherPreview]);

  useEffect(() => {
    if (questions.length === 0) return;
    draftPayloadRef.current = questions.map((question) => ({
      question_id: question.id,
      answer_data: buildAnswerData(question) as Record<string, unknown>,
    }));
    if (!autosaveReadyRef.current || !assessment || teacherPreview || submitted || entryState?.studentStatus !== "active") return;
    if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
    setAutosaveStatus("saving");
    draftSaveTimerRef.current = window.setTimeout(() => void persistDraftAnswers(assessment.id), 800);
    return () => {
      if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
    };
    // buildAnswerData reads the response states listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, teacherPreview, submitted, entryState?.studentStatus, questions, multipleChoiceAnswers, shortAnswerResponses, fillBlankResponses, imageOverlayResponses, sortingOrderResponses, sortingCategoryResponses, dragDropResponses, dropdownResponses]);

  async function persistDraftAnswers(assessmentId: string) {
    if (!autosaveReadyRef.current) return true;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const changedAnswers = draftPayloadRef.current.filter((draft) => savedDraftSignaturesRef.current.get(draft.question_id) !== JSON.stringify(draft.answer_data));
    if (changedAnswers.length === 0) {
      setAutosaveStatus("saved");
      return true;
    }
    setAutosaveStatus("saving");
    const { error } = await supabase.rpc("save_assessment_draft_answers", {
      target_assessment: assessmentId,
      answer_batch: changedAnswers,
    });
    if (error) {
      setAutosaveStatus("error");
      return false;
    }
    changedAnswers.forEach((draft) => savedDraftSignaturesRef.current.set(draft.question_id, JSON.stringify(draft.answer_data)));
    setAutosaveStatus("saved");
    return true;
  }

  async function loadAssessment(id: string) {
    const [{ data: { user } }, { data: { session } }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
    if (!user) {
      window.location.href = "/login";
      return;
    }
    accessTokenRef.current = session?.access_token || "";
    setStudentUserId(user.id);
    let assessmentQuery = supabase
      .from("assessments")
      .select("*")
      .eq("id", id);
    if (!teacherPreview) assessmentQuery = assessmentQuery.eq("is_published", true);
    const { data: assessmentData, error: assessmentError } = await assessmentQuery.single();

    if (assessmentError) {
      setAssessment(null);
      setLoading(false);
      return;
    }

    const [{ data: profile }, { data: allowed }] = await Promise.all([
      supabase.from("profiles").select("role,full_name,email").eq("id", user.id).single(),
      supabase.rpc("can_access_assessment", { target_assessment: assessmentData.id }),
    ]);
    if ((teacherPreview && profile?.role !== "teacher") || (!teacherPreview && profile?.role !== "teacher" && !allowed)) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    setAccountRole(profile?.role === "teacher" ? "teacher" : "student");
    setStudentName(profile?.full_name?.trim() || profile?.email?.trim() || user.email || "");
    setAssessment(assessmentData);

    if (profile?.role === "student") {
      const { error: sessionError } = await supabase.rpc("start_assessment_session", {
        target_assessment: assessmentData.id,
      });
      if (sessionError) {
        alert(`The assessment session could not be started: ${sessionError.message}`);
        setLoading(false);
        return;
      }
      await refreshEntryState(assessmentData.id);
    } else {
      await loadQuestions(assessmentData.id, false);
    }
    setLoading(false);
  }

  const scoredQuestions = useMemo(() => {
    return questions.filter((question) => {
      if (question.question_type !== "image-question") {
        return true;
      }

      return (question.question_data.overlayBoxes || []).length > 0;
    });
  }, [questions]);

  function selectMultipleChoiceAnswer(question: Question, answer: string) {
    setMultipleChoiceAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: toggleMultipleChoiceAnswer(currentAnswers[question.id] || [], answer, getMultipleChoiceSelectionMode(question.question_data)),
    }));
  }

  function updateShortAnswerResponse(
    questionId: string,
    answerBoxId: string,
    value: string
  ) {
    setShortAnswerResponses((currentResponses) => ({
      ...currentResponses,
      [questionId]: {
        ...(currentResponses[questionId] || {}),
        [answerBoxId]: value,
      },
    }));
  }

  function updateFillBlankResponse(
    questionId: string,
    blankId: string,
    value: string
  ) {
    setFillBlankResponses((currentResponses) => ({
      ...currentResponses,
      [questionId]: {
        ...(currentResponses[questionId] || {}),
        [blankId]: value,
      },
    }));
  }

  function updateImageOverlayResponse(
    questionId: string,
    overlayBoxId: string,
    value: string
  ) {
    setImageOverlayResponses((currentResponses) => ({
      ...currentResponses,
      [questionId]: {
        ...(currentResponses[questionId] || {}),
        [overlayBoxId]: value,
      },
    }));
  }

  function dropChoiceIntoOverlay(questionId: string, overlayBoxId: string) {
    if (!draggedChoice) {
      return;
    }

    if (draggedChoice.questionId !== questionId) {
      return;
    }

    updateImageOverlayResponse(questionId, overlayBoxId, draggedChoice.choiceValue);
    setDraggedChoice(null);
  }

  function clearDroppedChoice(questionId: string, overlayBoxId: string) {
    setImageOverlayResponses((currentResponses) => {
      const questionResponses = { ...(currentResponses[questionId] || {}) };
      delete questionResponses[overlayBoxId];

      return {
        ...currentResponses,
        [questionId]: questionResponses,
      };
    });
  }

  function getUsedDragChoices(question: Question) {
    const responses = imageOverlayResponses[question.id] || {};
    return Object.values(responses).filter(Boolean);
  }

  function choiceIsUsed(question: Question, choiceText: string) {
    return getUsedDragChoices(question).includes(choiceText);
  }

  function moveSortingOrderItem(questionId: string, itemId: string, direction: "up" | "down") {
    setSortingOrderResponses((current) => {
      const currentOrder = [...(current[questionId] || [])];
      const currentIndex = currentOrder.indexOf(itemId);

      if (currentIndex === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= currentOrder.length) {
        return current;
      }

      const [movedItem] = currentOrder.splice(currentIndex, 1);
      currentOrder.splice(targetIndex, 0, movedItem);

      return {
        ...current,
        [questionId]: currentOrder,
      };
    });
  }

  function dropSortingOrderItem(questionId: string, targetItemId: string) {
    if (!draggedSortingItem || draggedSortingItem.questionId !== questionId) {
      return;
    }

    setSortingOrderResponses((current) => {
      const currentOrder = [...(current[questionId] || [])];
      const fromIndex = currentOrder.indexOf(draggedSortingItem.itemId);
      const toIndex = currentOrder.indexOf(targetItemId);

      if (fromIndex === -1 || toIndex === -1) {
        return current;
      }

      const [movedItem] = currentOrder.splice(fromIndex, 1);
      currentOrder.splice(toIndex, 0, movedItem);

      return {
        ...current,
        [questionId]: currentOrder,
      };
    });

    setDraggedSortingItem(null);
  }

  function dropSortingItemIntoCategory(questionId: string, categoryId: string) {
    if (!draggedSortingItem || draggedSortingItem.questionId !== questionId) {
      return;
    }

    setSortingCategoryResponses((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] || {}),
        [draggedSortingItem.itemId]: categoryId,
      },
    }));

    setDraggedSortingItem(null);
  }

  function clearSortingCategoryItem(questionId: string, itemId: string) {
    setSortingCategoryResponses((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] || {}),
        [itemId]: "",
      },
    }));
  }

  function getSortingItem(question: Question, itemId: string) {
    return question.question_data.sortingItems?.find((item) => item.id === itemId);
  }

  function questionIsAnswered(question: Question) {
    if (question.question_type === "multiple-choice") {
      return (multipleChoiceAnswers[question.id] || []).length > 0;
    }
    if ((question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")) return isDragDropAnswered(normalizeDragDropData(question.question_data.dragDrop), dragDropResponses[question.id] || {});
    if (question.question_type === "dropdown") return dropdownIsAnswered(normalizeDropdownData(question.question_data.dropdown), dropdownResponses[question.id] || {});

    if (question.question_type === "short-answer") {
      const answerBoxes = question.question_data.answerBoxes || [];
      const responses = shortAnswerResponses[question.id] || {};

      return answerBoxes.every((answerBox) =>
        Boolean(responses[answerBox.id]?.trim())
      );
    }

    if (question.question_type === "fill-in-the-blank") {
      return fillBlankIsAnswered(
        normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks),
        fillBlankResponses[question.id] || {},
      );
    }

    if (question.question_type === "sorting-order") {
      const items = question.question_data.sortingItems || [];
      const response = sortingOrderResponses[question.id] || [];
      return items.length > 0 && response.length === items.length;
    }

    if (question.question_type === "sorting-category") {
      const items = question.question_data.sortingItems || [];
      const response = sortingCategoryResponses[question.id] || {};
      return items.every((item) => Boolean(response[item.id]));
    }

    if (question.question_type === "image-question") {
      const overlayBoxes = question.question_data.overlayBoxes || [];

      if (overlayBoxes.length === 0) {
        return true;
      }

      const responses = imageOverlayResponses[question.id] || {};

      return overlayBoxes.every((box) => Boolean(responses[box.id]?.trim()));
    }

    return false;
  }

  function gradeQuestion(question: Question) {
    if (question.question_type === "multiple-choice") {
      return gradeMultipleChoice(question.question_data, multipleChoiceAnswers[question.id] || []);
    }
    if ((question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")) return gradeDragDrop(normalizeDragDropData(question.question_data.dragDrop), dragDropResponses[question.id] || {}).isCorrect;
    if (question.question_type === "dropdown") return gradeDropdown(normalizeDropdownData(question.question_data.dropdown), dropdownResponses[question.id] || {}).isCorrect;

    if (question.question_type === "short-answer") {
      const answerBoxes = question.question_data.answerBoxes || [];
      const responses = shortAnswerResponses[question.id] || {};

      return answerBoxes.every(
        (answerBox) =>
          normalizeAnswer(responses[answerBox.id]) ===
          normalizeAnswer(answerBox.correctAnswer)
      );
    }

    if (question.question_type === "fill-in-the-blank") {
      return gradeFillBlank(
        normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks),
        fillBlankResponses[question.id] || {},
      ).isCorrect;
    }

    if (question.question_type === "sorting-order") {
      const response = sortingOrderResponses[question.id] || [];
      const correctOrder =
        question.question_data.correctOrder ||
        (question.question_data.sortingItems || []).map((item) => item.id);

      return (
        response.length === correctOrder.length &&
        response.every((itemId, index) => itemId === correctOrder[index])
      );
    }

    if (question.question_type === "sorting-category") {
      const items = question.question_data.sortingItems || [];
      const response = sortingCategoryResponses[question.id] || {};

      return items.every(
        (item) => response[item.id] === item.correctCategoryId
      );
    }

    if (question.question_type === "image-question") {
      const overlayBoxes = question.question_data.overlayBoxes || [];

      if (overlayBoxes.length === 0) {
        return null;
      }

      const responses = imageOverlayResponses[question.id] || {};

      return overlayBoxes.every(
        (box) =>
          normalizeAnswer(responses[box.id]) ===
          normalizeAnswer(box.correctAnswer)
      );
    }

    return false;
  }

  function buildAnswerData(question: Question) {
    if (question.question_type === "multiple-choice") {
      const answers = multipleChoiceAnswers[question.id] || [];
      return {
        answer: answers[0] || "",
        selectedAnswers: answers,
        isCorrect: gradeMultipleChoice(question.question_data, answers),
      };
    }
    if ((question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")) {
      const data = normalizeDragDropData(question.question_data.dragDrop);
      const placements = dragDropResponses[question.id] || {};
      return { placements, ...gradeDragDrop(data, placements) };
    }
    if (question.question_type === "dropdown") {
      const data = normalizeDropdownData(question.question_data.dropdown);
      const answers = dropdownResponses[question.id] || {};
      return { answers, ...gradeDropdown(data, answers) };
    }

    if (question.question_type === "short-answer") {
      const answerBoxes = question.question_data.answerBoxes || [];
      const responses = shortAnswerResponses[question.id] || {};
      const boxResults: Record<string, boolean> = {};

      answerBoxes.forEach((answerBox) => {
        boxResults[answerBox.id] =
          normalizeAnswer(responses[answerBox.id]) ===
          normalizeAnswer(answerBox.correctAnswer);
      });

      return {
        answers: responses,
        boxResults,
      };
    }

    if (question.question_type === "fill-in-the-blank") {
      const data = normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks);
      const answers = fillBlankResponses[question.id] || {};
      return { answers, ...gradeFillBlank(data, answers) };
    }

    if (question.question_type === "sorting-order") {
      const orderedItemIds = sortingOrderResponses[question.id] || [];
      const correctOrder =
        question.question_data.correctOrder ||
        (question.question_data.sortingItems || []).map((item) => item.id);

      return {
        orderedItemIds,
        correctOrder,
      };
    }

    if (question.question_type === "sorting-category") {
      const categoryAssignments = sortingCategoryResponses[question.id] || {};
      const categoryResults: Record<string, boolean> = {};

      (question.question_data.sortingItems || []).forEach((item) => {
        categoryResults[item.id] =
          categoryAssignments[item.id] === item.correctCategoryId;
      });

      return {
        categoryAssignments,
        categoryResults,
      };
    }

    if (question.question_type === "image-question") {
      const overlayBoxes = question.question_data.overlayBoxes || [];
      const responses = imageOverlayResponses[question.id] || {};
      const overlayResults: Record<string, boolean> = {};

      overlayBoxes.forEach((box) => {
        overlayResults[box.id] =
          normalizeAnswer(responses[box.id]) ===
          normalizeAnswer(box.correctAnswer);
      });

      return {
        answers: responses,
        overlayResults,
        hasOverlayBoxes: overlayBoxes.length > 0,
        overlayAnswerMode: question.question_data.overlayAnswerMode || "text-entry",
        viewed: true,
      };
    }

    return {};
  }

  async function submitAssessment() {
    if (!assessment) {
      return;
    }

    if (!studentName.trim()) {
      alert("Your profile is missing a name and email. Update your profile before submitting.");
      return;
    }

    if (questions.some((question) => !questionIsAnswered(question))) {
      alert("Please answer every question before submitting.");
      return;
    }

    await persistDraftAnswers(assessment.id);

    let totalCorrect = 0;

    scoredQuestions.forEach((question) => {
      if (gradeQuestion(question) === true) {
        totalCorrect += 1;
      }
    });

    const { data: attemptData, error: attemptError } = await supabase
      .from("student_attempts")
      .insert({
        assessment_id: assessment.id,
        student_id: studentUserId || null,
        student_name: studentName.trim(),
        score: totalCorrect,
      })
      .select()
      .single();

    if (attemptError) {
      alert(attemptError.message);
      return;
    }

    const answerRows = questions.map((question) => ({
      attempt_id: attemptData.id,
      question_id: question.id,
      answer_data: buildAnswerData(question),
      is_correct: gradeQuestion(question),
    }));

    const { error: answersError } = await supabase
      .from("student_answers")
      .insert(answerRows);

    if (answersError) {
      alert(answersError.message);
      return;
    }

    const { error: completionError } = await supabase.rpc("complete_assessment_session", {
      target_assessment: assessment.id,
    });
    if (completionError) {
      alert(`Your answers were saved, but the assessment could not be closed: ${completionError.message}`);
      return;
    }

    setScore(totalCorrect);
    setSubmitted(true);
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
        <div className="mx-auto max-w-3xl">
          <Link href="/student/dashboard" className="text-sm text-blue-300 hover:underline">
            ← Back to assigned assessments
          </Link>

          <h1 className="mt-8 text-4xl font-bold">{accessDenied ? "Access not assigned" : "Assessment Not Found"}</h1>

          <p className="mt-4 text-slate-300">
            {accessDenied ? "Your student account has not been assigned this assessment." : "This assigned assessment is unavailable or has not been published."}
          </p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-white text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
            <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">J</span>
              Jretta
            </Link>
            <Link href="/student/dashboard" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Student Dashboard</Link>
          </div>
        </header>

        <section className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center overflow-hidden px-6 py-16">
          <div className="absolute left-1/2 top-20 -z-10 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-100/70 blur-3xl" />
          <div className="w-full max-w-xl text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-3xl font-bold text-white shadow-xl shadow-blue-200" aria-hidden="true">
              ✓
            </span>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Assessment complete</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Successfully submitted</h1>
            <p className="mx-auto mt-4 max-w-md leading-7 text-slate-500">
              Thank you, <span className="font-semibold text-slate-700">{studentName}</span>. Your responses for {assessment.title} have been recorded.
            </p>

            <div className="mt-9 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assessment</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{assessment.title}</p>
              </div>
              <div className="flex items-center justify-between gap-6 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your score</p>
                  <p className="mt-1 text-3xl font-bold text-blue-600">{score} <span className="text-lg font-semibold text-slate-400">/ {scoredQuestions.length}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p>
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Submitted
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/student/dashboard" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700">
                View assigned assessments
              </Link>
              <Link href="/" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50">
                Return home
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!teacherPreview && accountRole === "student" && entryState?.studentStatus !== "active") {
    const blocked = entryState?.studentStatus === "blocked";
    const alreadySubmitted = entryState?.studentStatus === "submitted";
    const ended = entryState?.runStatus === "ended";
    return <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800"><div className="mx-auto flex min-h-20 max-w-5xl items-center justify-between px-6"><span className="font-bold">Jretta</span><Link href="/student/dashboard" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">Student Dashboard</Link></div></header>
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center justify-center px-6 py-16 text-center">
        <div aria-live="polite">
          <span className={`mx-auto grid size-16 place-items-center rounded-full text-2xl ${blocked ? "bg-red-500/20 text-red-300" : alreadySubmitted ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"}`}>{blocked ? "!" : alreadySubmitted ? "✓" : "…"}</span>
          <p className="mt-7 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{alreadySubmitted ? "Assessment complete" : "Lockdown waiting room"}</p>
          <h1 className="mt-3 text-4xl font-bold">{blocked ? "Access paused" : alreadySubmitted ? "Already submitted" : ended ? "Assessment ended" : "Waiting for your teacher"}</h1>
          <p className={`mx-auto mt-4 max-w-lg leading-7 ${blocked ? "font-semibold text-red-300" : "text-slate-300"}`}>{blocked ? (entryState?.blockReason || "Tried to leave lockdown browser") : alreadySubmitted ? "Your response has already been recorded." : ended ? "Your teacher has ended this assessment." : "You are checked in. The assessment will open automatically when your teacher starts it."}</p>
          {blocked && <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">Your teacher can see this warning and must grant access before you can continue.</p>}
          {!alreadySubmitted && !ended && <div className="mx-auto mt-8 h-2 w-48 overflow-hidden rounded-full bg-slate-800"><span className="block h-full w-1/2 animate-pulse rounded-full bg-blue-500" /></div>}
          <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-slate-500">Lockdown is active. Keep this tab and window focused.</p>
        </div>
      </section>
    </main>;
  }

  if (!questionsReady) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-white"><div><span className="mx-auto block size-8 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" /><h1 className="mt-5 text-2xl font-bold">Opening assessment…</h1><p className="mt-2 text-sm text-slate-400">Lockdown is active while your questions load.</p></div></main>;
  }

  const answeredCount = questions.filter(questionIsAnswered).length;
  const dashboardHref = accountRole === "teacher" ? "/teacher" : "/student/dashboard";
  const showingResources = resourcesOpen && Boolean(assessment.formula_sheet);
  const activePanelView = showingResources ? resourcePanelView : studentPanelView;
  const activeQuestionHasSplitView = showingResources ||
    questions[activeQuestionIndex]?.question_data.layout === "split";
  const canSubmitAssessment =
    !teacherPreview && questions.length > 0 && studentName.trim().length > 0 && answeredCount === questions.length;
  const submitDisabledReason = teacherPreview
    ? "Teacher preview mode cannot submit an assessment."
    : questions.length === 0
    ? "This assessment does not have any questions."
    : !studentName.trim()
    ? "Update your profile name before submitting."
    : answeredCount < questions.length
      ? `Answer every question before submitting (${answeredCount} of ${questions.length} complete).`
      : "";

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {lockdownExit && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950 px-6 text-center text-white">
          <div>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-red-500/20 text-2xl text-red-300">!</div>
            <h2 className="mt-5 text-2xl font-bold">Lockdown interrupted</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
              The assessment window lost focus. Returning to the waiting room…
            </p>
          </div>
        </div>
      )}
      <StudentAssessmentFrame
        title={assessment.title}
        questions={questions.map((question) => ({ id: question.id, answered: questionIsAnswered(question) }))}
        activeIndex={activeQuestionIndex}
        onNavigate={(index) => { setActiveQuestionIndex(index); setStudentPanelView("split"); setResourcePanelView("split"); }}
        split={activeQuestionHasSplitView}
        panelView={activePanelView}
        onPanelViewChange={showingResources ? setResourcePanelView : setStudentPanelView}
        hasFormulaSheet={Boolean(assessment.formula_sheet)}
        resourcesOpen={showingResources}
        onToggleResources={() => { if (!resourcesOpen) setResourcePanelView("split"); setResourcesOpen((open) => !open); }}
        onSubmit={submitAssessment}
        canSubmit={canSubmitAssessment}
        submitDisabledReason={submitDisabledReason}
        accountControls={<div className="space-y-2">
          {teacherPreview ? <Link href={dashboardHref} className="text-blue-600 hover:underline">Exit teacher preview</Link> : <>
            <label htmlFor="student-name" className="block"><span className="sr-only">Student name</span><input id="student-name" className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700" value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Your name" autoComplete="name" /></label>
            <p role="status" className={autosaveStatus === "error" ? "text-red-600" : "text-slate-500"}>{autosaveStatus === "error" ? "Autosave failed" : autosaveStatus === "saving" ? "Saving…" : autosaveStatus === "restored" ? "Progress restored" : "Progress saved"} · {answeredCount}/{questions.length}</p>
          </>}
        </div>}
      >
        <section id="student-question-content">
          {questions.map((question, index) => {
            if (index !== activeQuestionIndex) {
              return null;
            }

            const overlayAnswerMode =
              question.question_data.overlayAnswerMode || "text-entry";
            const multipleChoiceHasImages = Boolean(
              question.question_data.choiceImages?.some((image) => image.imageUrl)
            );
            const canvas = question.question_data.canvas ? normalizeQuestionCanvas(question.question_data.canvas) : null;
            const unifiedDragDropCanvas = (question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups")
              ? asLocationDragDropData(question.question_data.dragDrop, canvas || undefined)
              : null;
            const leftCanvas = showingResources ? normalizeQuestionCanvas(assessment.formula_sheet) : question.question_data.layout === "split" && question.question_data.leftCanvas ? normalizeQuestionCanvas(question.question_data.leftCanvas) : null;
            const interactionBounds = unifiedDragDropCanvas ? { x: 0, y: 0, width: 100, height: 100 } : canvas?.interaction;
            const activeCanvasHeight = normalizeCanvasHeight(unifiedDragDropCanvas?.canvasHeight ?? canvas?.canvasHeight);
            const leftCanvasHeight = normalizeCanvasHeight(leftCanvas?.canvasHeight ?? activeCanvasHeight);
            const isSplitCanvas = showingResources || question.question_data.layout === "split";
            const panelView = showingResources && !canvas ? "right" : activePanelView;
            const renderedCanvasHeight = isSplitCanvas
              ? panelView === "split"
                ? Math.max(leftCanvasHeight, activeCanvasHeight) / 2
                : panelView === "left"
                  ? leftCanvasHeight
                  : activeCanvasHeight
              : activeCanvasHeight;

            return (
              <div key={question.id} className={showingResources && !canvas && activePanelView === "split" ? "grid grid-cols-2 items-start" : ""}>
                {showingResources && !canvas && activePanelView !== "right" && (
                  <div role="region" aria-label="Formula sheet" className="min-w-0 overflow-hidden border-r border-slate-200 bg-white">
                    <QuestionCanvas canvas={normalizeQuestionCanvas(assessment.formula_sheet)} />
                  </div>
                )}
              <div
                key={question.id}
                style={canvas ? { aspectRatio: `100 / ${renderedCanvasHeight}` } : undefined}
                className={`${showingResources && !canvas && activePanelView === "left" ? "hidden" : ""} ${canvas ? "relative w-full min-h-0" : "grid min-h-[calc(100vh-15rem)]"} overflow-hidden bg-white ${
                  isSplitCanvas && panelView === "split"
                    ? "grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                {canvas && isSplitCanvas && panelView !== "right" && (
                  <div role="region" aria-label={showingResources ? "Formula sheet" : "Question reference"} className={`absolute left-0 top-0 z-10 overflow-hidden border-r border-slate-200 ${panelView === "split" ? "w-1/2" : "w-full"}`} style={{ containerType: "inline-size", aspectRatio: `100 / ${leftCanvasHeight}` }}>
                    {leftCanvas ? <QuestionCanvas canvas={leftCanvas} className="pointer-events-none absolute inset-0 h-full w-full border-0" /> : <StudentReferencePanel data={question.question_data} compact />}
                  </div>
                )}
                <div
                  style={canvas ? { containerType: "inline-size", aspectRatio: `100 / ${activeCanvasHeight}` } : undefined}
                  className={canvas
                    ? isSplitCanvas
                      ? panelView === "left"
                        ? "hidden"
                        : panelView === "split"
                          ? "absolute right-0 top-0 w-1/2 overflow-hidden"
                          : "absolute inset-x-0 top-0 w-full overflow-hidden"
                      : "absolute inset-x-0 top-0 w-full overflow-hidden"
                    : "contents"}
                >
                {canvas && !unifiedDragDropCanvas && <QuestionCanvas canvas={canvas} className="pointer-events-none absolute inset-0 h-full w-full border-0" />}
                {canvas && question.question_type === "dropdown" && (() => {
                  const data = normalizeDropdownData(question.question_data.dropdown);
                  return data.entries.map((entry, entryIndex) => {
                    const bounds = dropdownEntryBounds(entry, entryIndex);
                    return <div key={entry.id} className="absolute z-20" style={{ left: `${bounds.x}%`, top: `${bounds.y}%`, width: `${bounds.width}%`, height: `${bounds.height}%` }}>
                      <CanvasDropdownField ariaLabel={`Dropdown ${entryIndex + 1}`} options={getDropdownEntryOptions(entry)} value={dropdownResponses[question.id]?.[entry.id] || ""} onChange={(value) => setDropdownResponses((current) => ({ ...current, [question.id]: { ...(current[question.id] || {}), [entry.id]: value } }))} />
                    </div>;
                  });
                })()}
                {canvas && question.question_type === "fill-in-the-blank" && (() => {
                  const data = normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks);
                  return data.blanks.map((blank, blankIndex) => {
                    const bounds = getFillBlankBounds(blank, blankIndex);
                    return <div key={blank.id} className="absolute z-20" style={{ left: `${bounds.x}%`, top: `${bounds.y}%`, width: `${bounds.width}%`, height: `${bounds.height}%` }}><CanvasFillBlankField blank={blank} value={fillBlankResponses[question.id]?.[blank.id] || ""} onChange={(value) => updateFillBlankResponse(question.id, blank.id, value)} /></div>;
                  });
                })()}
                {canvas && question.question_type === "multiple-choice" && (() => {
                  const choices = question.question_data.choices || [];
                  const selectionMode = getMultipleChoiceSelectionMode(question.question_data);
                  const savedLayout = canvas.choiceLayout || { grouped: true, direction: "vertical" as const, presentation: "content" as const, x: 8, y: 35, positions: [] };
                  const layout = selectionMode === "multiple" ? { ...savedLayout, presentation: "content" as const } : savedLayout;
                  const contentSizes = getChoiceContentSizes(choices.map((content, index) => ({ id: String(index), content, html: question.question_data.choiceHtml?.[index], imageUrl: question.question_data.choiceImages?.[index]?.imageUrl, ...layout.positions[index] })), { sameSize: layout.sameSize, canvasHeight: canvas.canvasHeight, selectionMode });
                  const option = (choice: string, choiceIndex: number, fillsWrapper = false) => {
                    const choiceValue = getMultipleChoiceValue(choice, choiceIndex);
                    const selected = (multipleChoiceAnswers[question.id] || []).includes(choiceValue);
                    return <button key={choiceIndex} type="button" role={selectionMode === "multiple" ? "checkbox" : "radio"} aria-label={choice || `Choice ${choiceIndex + 1}`} aria-checked={selected} onClick={() => selectMultipleChoiceAnswer(question, choiceValue)} style={fillsWrapper ? { width: "100%", height: "100%" } : layout.presentation === "content" ? { paddingTop: "1cqw", paddingBottom: "1cqw", paddingRight: "1.2cqw", paddingLeft: selectionMode === "multiple" ? "4cqw" : "1.2cqw", fontSize: "1.7cqw", width: `${contentSizes[choiceIndex].width}cqw`, height: `${contentSizes[choiceIndex].height}cqw` } : layout.presentation === "radio" ? { width: "3.2cqw", height: "3.2cqw" } : { width: `${layout.positions[choiceIndex]?.width ?? 6}cqw`, height: `${(layout.positions[choiceIndex]?.height ?? 10.5) * 9 / 16}cqw` }} className={`relative box-border flex shrink-0 flex-col ${layout.presentation === "content" ? "items-start text-left" : "items-center text-center"} whitespace-nowrap ${layout.positions[choiceIndex]?.textVerticalAlign === "top" ? "justify-start" : layout.positions[choiceIndex]?.textVerticalAlign === "bottom" ? "justify-end" : "justify-center"} border bg-white/50 font-medium text-black shadow-sm transition hover:border-blue-600 ${layout.presentation === "radio" ? "rounded-full border-2" : "rounded"} ${selected ? "border-blue-600 ring-2 ring-blue-300" : "border-slate-400"}`}>
                      {layout.presentation === "radio" && selected && <span className="h-[1.5cqw] w-[1.5cqw] rounded-full bg-blue-600" />}
                      {layout.presentation === "content" && <>{selectionMode === "multiple" && <span className={`absolute left-[0.8cqw] top-1/2 inline-flex h-[1.5cqw] w-[1.5cqw] -translate-y-1/2 items-center justify-center rounded-sm border text-[1.1cqw] font-bold leading-none ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-500 bg-white"}`}>{selected ? "✓" : ""}</span>}{question.question_data.choiceImages?.[choiceIndex]?.imageUrl && <img src={question.question_data.choiceImages[choiceIndex].imageUrl} alt="" style={{ maxHeight: "10cqw", maxWidth: "14cqw", marginBottom: "0.5cqw" }} className="min-h-0 flex-1 object-contain" />}<span className="w-full">{question.question_data.choiceHtml?.[choiceIndex] ? <span className="rich-text-content inline" dangerouslySetInnerHTML={{ __html: question.question_data.choiceHtml[choiceIndex] }} /> : choice}</span></>}
                    </button>;
                  };
                  return layout.grouped ? <div className={`absolute z-20 flex w-max ${layout.direction === "vertical" ? "flex-col" : "flex-row"}`} style={{ left: `${layout.x}%`, top: `${layout.y}%`, gap: "0.8cqw" }}>{choices.map((choice, choiceIndex) => option(choice, choiceIndex))}</div> : <>{choices.map((choice, choiceIndex) => <div key={choiceIndex} className="absolute z-20" style={{ left: `${layout.positions[choiceIndex]?.x ?? 8}%`, top: `${layout.positions[choiceIndex]?.y ?? 35 + choiceIndex * 12}%`, ...(layout.presentation === "box" ? { width: `${layout.positions[choiceIndex]?.width ?? 6}%`, height: `${layout.positions[choiceIndex]?.height ?? 10.5}%` } : {}) }}>{option(choice, choiceIndex, layout.presentation === "box")}</div>)}</>;
                })()}
                {(!canvas || Boolean(canvas.legacyPrompt)) && (canvas || question.question_data.layout !== "split" || panelView !== "right") && (
                <div style={canvas?.legacyPrompt ? { position: "absolute", left: `${canvas.legacyPrompt.x}%`, top: `${canvas.legacyPrompt.y}%`, width: `${canvas.legacyPrompt.width}%`, height: `${canvas.legacyPrompt.height}%`, overflow: "auto", background: "transparent", padding: 0 } : undefined} className={`min-w-0 bg-slate-50/70 p-4 sm:p-6 lg:p-8 ${question.question_data.layout === "split" && panelView === "split" ? "border-r border-slate-200" : "border-b border-slate-200"}`}>
                  {!canvas && question.question_data.layout === "split" ? (
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Reference material
                      </p>
                      {question.question_data.leftPanelTitle && (
                        <h2 className="mt-3 text-2xl font-bold leading-tight text-slate-900">
                          {question.question_data.leftPanelTitle}
                        </h2>
                      )}
                      {question.question_data.leftPanelTopContent && (
                        <div
                          className="rich-text-content mt-5 text-lg text-slate-800"
                          dangerouslySetInnerHTML={{
                            __html: question.question_data.leftPanelTopContent,
                          }}
                        />
                      )}
                      {question.question_data.leftPanelImageUrl && (
                        <div className="mt-5">
                          <ImageMarkup
                            src={question.question_data.leftPanelImageUrl}
                            alt={question.question_data.leftPanelTitle || "Question reference"}
                          />
                        </div>
                      )}
                      {question.question_data.leftPanelContent && (
                        <div
                          className="rich-text-content mt-5 text-lg text-slate-800"
                          dangerouslySetInnerHTML={{
                            __html: question.question_data.leftPanelContent,
                          }}
                        />
                      )}
                      {leftPanelTableHasContent(
                        question.question_data.leftPanelTable
                      ) && (
                        <div className="mt-5 overflow-x-auto">
                          <table
                            className={`w-full border-collapse text-left text-base ${
                              question.question_data.leftPanelTable?.hasBorder
                                ? "border border-slate-300"
                                : ""
                            }`}
                          >
                            <tbody>
                              {question.question_data.leftPanelTable?.cells.map(
                                (row, rowIndex) => (
                                  <tr key={rowIndex}>
                                    {row.map((cell, columnIndex) => {
                                      const Cell = rowIndex === 0 ? "th" : "td";
                                      return (
                                        <Cell
                                          key={columnIndex}
                                          className={`px-4 py-3 ${
                                            rowIndex === 0 ? "font-semibold" : ""
                                          } ${
                                            question.question_data.leftPanelTable
                                              ?.hasBorder
                                              ? "border border-slate-300"
                                              : ""
                                          }`}
                                        >
                                          {cell}
                                        </Cell>
                                      );
                                    })}
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : question.question_type !== "fill-in-the-blank" ? (
                    question.question_data.promptHtml ? (
                      <div className="rich-text-content mt-5 text-2xl leading-relaxed text-slate-900" dangerouslySetInnerHTML={{ __html: question.question_data.promptHtml }} />
                    ) : (
                      <h2 className="mt-5 text-2xl font-semibold leading-relaxed text-slate-900">
                        {question.prompt}
                      </h2>
                    )
                  ) : canvas ? (
                    <div className="text-[2cqw] font-semibold leading-snug text-slate-950">
                      Complete each blank.
                    </div>
                  ) : null}
                  {!canvas && assessment.description && index === 0 && (
                    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                      <span className="font-semibold text-slate-800">Instructions: </span>
                      {assessment.description}
                    </div>
                  )}
                  {question.question_type === "image-question" &&
                    (question.question_data.overlayBoxes || []).length === 0 && (
                      <p className="mt-4 text-sm text-slate-500">This question is not scored.</p>
                    )}
                </div>
                )}

                {(canvas ? Boolean(interactionBounds) : question.question_data.layout !== "split" || panelView !== "left") && (
                <div style={interactionBounds ? { position: "absolute", left: `${interactionBounds.x}%`, top: `${interactionBounds.y}%`, width: `${interactionBounds.width}%`, height: `${interactionBounds.height}%`, overflow: "auto", padding: 0 } : undefined} className={`min-w-0 text-slate-900 ${unifiedDragDropCanvas ? "p-0" : "p-4 sm:p-6 lg:p-8"}`}>
                {!canvas && question.question_data.layout === "split" && question.question_type !== "fill-in-the-blank" && (
                    <div className="border-b border-slate-200 pb-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Your question
                      </p>
                      {question.question_data.promptHtml ? (
                        <div className="rich-text-content mt-3 text-2xl leading-relaxed text-slate-900" dangerouslySetInnerHTML={{ __html: question.question_data.promptHtml }} />
                      ) : (
                        <h2 className="mt-3 text-2xl font-semibold leading-relaxed text-slate-900">
                          {question.prompt}
                        </h2>
                      )}
                    </div>
                  )}

                {question.question_type === "multiple-choice" && (
                  <div>
                  {getMultipleChoiceSelectionMode(question.question_data) === "multiple" && <p className="mt-5 text-sm font-semibold text-slate-600">Select all answers that apply.</p>}
                  {question.question_data.choiceTable?.enabled ? (
                  <div className="mt-6 overflow-x-auto">
                    <table className={`w-full border-collapse text-left ${question.question_data.choiceTable.hasBorder ? "border border-slate-300" : ""}`}>
                      <thead><tr><th className={`w-16 px-3 py-3 text-center ${question.question_data.choiceTable.hasBorder ? "border border-slate-300" : ""}`}>Row</th>{question.question_data.choiceTable.headers.map((header, headerIndex) => <th key={headerIndex} className={`px-4 py-3 font-semibold ${question.question_data.choiceTable?.hasBorder ? "border border-slate-300" : ""}`}>{header}</th>)}</tr></thead>
                      <tbody>{question.question_data.choiceTable.rows.map((row, rowIndex) => { const choiceValue = getMultipleChoiceValue(question.question_data.choices?.[rowIndex] || "", rowIndex); const selectionMode = getMultipleChoiceSelectionMode(question.question_data); const selected = (multipleChoiceAnswers[question.id] || []).includes(choiceValue); return <tr key={rowIndex} role={selectionMode === "multiple" ? "checkbox" : "radio"} aria-checked={selected} tabIndex={0} onClick={() => selectMultipleChoiceAnswer(question, choiceValue)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectMultipleChoiceAnswer(question, choiceValue); } }} className={`cursor-pointer text-black outline-none transition focus:ring-2 focus:ring-inset focus:ring-blue-500 ${selected ? "bg-blue-100" : "hover:bg-blue-50/60"}`}><td className={`px-3 py-3 text-center ${question.question_data.choiceTable?.hasBorder ? "border border-slate-300" : ""}`}><span className={`inline-flex h-6 w-6 items-center justify-center border-2 ${selectionMode === "multiple" ? "rounded" : "rounded-full"} ${selected ? "border-blue-600 bg-blue-600" : "border-slate-500"}`}>{selected && (selectionMode === "multiple" ? <span className="text-sm font-bold leading-none text-white">✓</span> : <span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-white" />)}</span></td>{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-4 py-3 ${question.question_data.choiceTable?.hasBorder ? "border border-slate-300" : ""}`}>{question.question_data.choiceTable?.cellImages?.[rowIndex]?.[cellIndex]?.imageUrl && <img src={question.question_data.choiceTable.cellImages[rowIndex][cellIndex].imageUrl} alt="" className="mx-auto mb-2 max-h-40 max-w-full object-contain" />}<div className="rich-text-content" dangerouslySetInnerHTML={{ __html: cell }} /></td>)}</tr>; })}</tbody>
                    </table>
                  </div>
                  ) : (
                  <div className={`mt-6 grid w-fit max-w-full ${multipleChoiceHasImages ? "grid-cols-1 gap-4 sm:grid-cols-2" : "grid-cols-[fit-content(32rem)] gap-3"}`}>
                    {question.question_data.choices?.map((choice, choiceIndex) => {
                      const choiceValue = getMultipleChoiceValue(choice, choiceIndex);
                      const selectionMode = getMultipleChoiceSelectionMode(question.question_data);
                      const selected = (multipleChoiceAnswers[question.id] || []).includes(choiceValue);

                      return (
                        <button
                          key={choiceIndex}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            selectMultipleChoiceAnswer(question, choiceValue)
                          }
                          className={
                            selected
                              ? `w-full rounded-xl border-2 border-blue-600 bg-blue-50/50 text-left font-semibold text-black ${multipleChoiceHasImages ? "max-w-[22rem] p-4" : "max-w-full px-5 py-3"}`
                              : `w-full rounded-xl border-2 border-slate-200 bg-white/50 text-left text-black hover:border-blue-300 hover:bg-blue-50/40 ${multipleChoiceHasImages ? "max-w-[22rem] p-4" : "max-w-full px-5 py-3"}`
                          }
                        >
                          {selectionMode === "multiple" && <span className={`mr-3 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 align-middle ${selected ? "border-blue-600 bg-blue-600" : "border-slate-500"}`}>{selected && <span className="text-sm font-bold leading-none text-white">✓</span>}</span>}
                          {question.question_data.choiceImages?.[choiceIndex]
                            ?.imageUrl && (
                            <img
                              src={
                                question.question_data.choiceImages[choiceIndex]
                                  .imageUrl
                              }
                              alt={choice || `Choice ${String.fromCharCode(65 + choiceIndex)}`}
                              className="mx-auto mb-3 h-auto max-h-72 w-auto max-w-full rounded-lg object-contain"
                            />
                          )}
                          {question.question_data.choiceHtml?.[choiceIndex] ? <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: question.question_data.choiceHtml[choiceIndex] }} /> : choice}
                        </button>
                      );
                    })}
                  </div>
                  )}
                  </div>
                )}

                {(question.question_type === "drag-and-drop" || question.question_type === "sort-into-groups") && (
                  <DragDropQuestion
                    data={unifiedDragDropCanvas || normalizeDragDropData(question.question_data.dragDrop)}
                    placements={dragDropResponses[question.id] || {}}
                    onChange={(placements) =>
                      setDragDropResponses((current) => ({
                        ...current,
                        [question.id]: placements,
                      }))
                    }
                  />
                )}

                {question.question_type === "dropdown" && !canvas && (() => {
                  const data = normalizeDropdownData(question.question_data.dropdown);
                  const answerSelect = (entry: DropdownQuestionData["entries"][number], entryIndex: number) => (
                    <span key={entry.id} className="mx-1 inline-block h-12 w-36 align-middle"><CanvasDropdownField ariaLabel={`Dropdown ${entryIndex + 1}`} options={getDropdownEntryOptions(entry)} value={dropdownResponses[question.id]?.[entry.id] || ""} onChange={(value) => setDropdownResponses((current) => ({ ...current, [question.id]: { ...(current[question.id] || {}), [entry.id]: value } }))} /></span>
                  );
                  return data.layout === "table" ? <div className="mt-6 overflow-x-auto"><table className="w-full border-collapse text-left"><tbody>{data.entries.map((entry, entryIndex) => <tr key={entry.id}><td className="border border-slate-300 px-4 py-3 text-slate-900">{entry.label}</td><td className="w-56 border border-slate-300 p-2 text-center">{answerSelect(entry, entryIndex)}</td></tr>)}</tbody></table></div> : <div className="mt-6 text-lg leading-[3.6rem] text-slate-950">{getDropdownSegments(data.template).map((segment, segmentIndex) => segment.type === "text" ? <span key={segmentIndex} className="whitespace-pre-wrap">{segment.content}</span> : data.entries[segment.index] ? answerSelect(data.entries[segment.index], segment.index) : null)}</div>;
                })()}

                {question.question_type === "short-answer" && (
                  <div className="mt-6 space-y-4">
                    {question.question_data.answerBoxes?.map(
                      (answerBox, answerBoxIndex) => (
                        <div key={answerBox.id}>
                          <label className="text-sm font-medium text-slate-600">
                            {answerBox.label || `Answer ${answerBoxIndex + 1}`}
                          </label>

                          <input
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white/50 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            value={
                              shortAnswerResponses[question.id]?.[
                                answerBox.id
                              ] || ""
                            }
                            onChange={(event) =>
                              updateShortAnswerResponse(
                                question.id,
                                answerBox.id,
                                event.target.value
                              )
                            }
                            placeholder="Type your answer"
                          />
                        </div>
                      )
                    )}
                  </div>
                )}

                {question.question_type === "fill-in-the-blank" && (
                  <div className="mt-6">
                    <FillBlankQuestion
                      data={normalizeFillBlankData(question.question_data.fillBlank, question.question_data.template, question.question_data.blanks)}
                      answers={fillBlankResponses[question.id] || {}}
                      onAnswer={(blankId, value) => updateFillBlankResponse(question.id, blankId, value)}
                    />
                  </div>
                )}

                {question.question_type === "sorting-order" && (
                  <div className="mt-6 space-y-3">
                    <p className="text-sm text-slate-400">
                      Drag the items into the correct order. You can also use the arrow buttons.
                    </p>

                    {(sortingOrderResponses[question.id] || []).map((itemId, orderIndex) => (
                      <div
                        key={itemId}
                        draggable
                        onDragStart={() =>
                          setDraggedSortingItem({ questionId: question.id, itemId })
                        }
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          dropSortingOrderItem(question.id, itemId);
                        }}
                        className="flex cursor-grab items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm active:cursor-grabbing"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-sm font-bold text-blue-700">
                          {orderIndex + 1}
                        </div>
                        <div className="flex flex-1 items-center gap-3 font-semibold text-slate-800">
                          {getSortingItem(question, itemId)?.imageUrl && (
                            <img
                              src={getSortingItem(question, itemId)?.imageUrl}
                              alt={getSortingItemDisplayLabel(getSortingItem(question, itemId), `Item ${orderIndex + 1}`)}
                              className="h-14 w-14 rounded-lg border border-slate-700 object-cover"
                            />
                          )}
                          <span>
                            {getSortingItemDisplayLabel(getSortingItem(question, itemId), `Item ${orderIndex + 1}`)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => moveSortingOrderItem(question.id, itemId, "up")}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSortingOrderItem(question.id, itemId, "down")}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          ↓
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {question.question_type === "sorting-category" && (
                  <div className="mt-6 space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-600">
                        Drag each item into the correct category.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {(question.question_data.sortingItems || [])
                          .filter((item) => !sortingCategoryResponses[question.id]?.[item.id])
                          .map((item) => (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={() =>
                                setDraggedSortingItem({ questionId: question.id, itemId: item.id })
                              }
                              onDragEnd={() => setDraggedSortingItem(null)}
                              className="cursor-grab rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 active:cursor-grabbing"
                            >
                              <div className="flex items-center gap-3">
                                {item.imageUrl && (
                                  <img
                                    src={item.imageUrl}
                                    alt={getSortingItemDisplayLabel(item, "Sorting item")}
                                    className="h-14 w-14 rounded-lg border border-blue-700 object-cover"
                                  />
                                )}
                                <span>{getSortingItemDisplayLabel(item, "Sorting item")}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {question.question_data.sortingCategories?.map((category) => (
                        <div
                          key={category.id}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            dropSortingItemIntoCategory(question.id, category.id);
                          }}
                          className="min-h-36 rounded-2xl border border-dashed border-blue-300 bg-blue-50/40 p-4"
                        >
                          <h3 className="font-semibold text-blue-200">{category.name}</h3>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(question.question_data.sortingItems || [])
                              .filter(
                                (item) => sortingCategoryResponses[question.id]?.[item.id] === category.id
                              )
                              .map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => clearSortingCategoryItem(question.id, item.id)}
                                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
                                  title="Click to remove from this category"
                                >
                                  <div className="flex items-center gap-2">
                                    {item.imageUrl && (
                                      <img
                                        src={item.imageUrl}
                                        alt={getSortingItemDisplayLabel(item, "Sorting item")}
                                        className="h-12 w-12 rounded-md border border-green-700 object-cover"
                                      />
                                    )}
                                    <span>{getSortingItemDisplayLabel(item, "Sorting item")}</span>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {question.question_type === "image-question" && (
                  <div className="mt-6 space-y-4">
                    {overlayAnswerMode === "drag-drop-text" &&
                      (question.question_data.overlayBoxes || []).length > 0 && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                          <p className="text-sm font-semibold text-slate-300">
                            Drag each choice into the correct box on the image.
                          </p>

                          <div className="mt-3 flex flex-wrap gap-3">
                            {question.question_data.draggableChoices?.map(
                              (choice) => {
                                const used = choiceIsUsed(question, choice.text);

                                return (
                                  <div
                                    key={choice.id}
                                    draggable={!used}
                                    onDragStart={() =>
                                      setDraggedChoice({
                                        questionId: question.id,
                                        choiceValue: choice.text,
                                      })
                                    }
                                    onDragEnd={() => setDraggedChoice(null)}
                                    className={
                                      used
                                        ? "cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-500 opacity-50"
                                        : "cursor-grab rounded-xl border border-blue-700 bg-blue-950 px-4 py-2 text-sm font-semibold text-blue-100 active:cursor-grabbing"
                                    }
                                  >
                                    {choice.text}
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}

                    {overlayAnswerMode === "drag-drop-image" &&
                      (question.question_data.overlayBoxes || []).length > 0 && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                          <p className="text-sm font-semibold text-slate-300">
                            Drag each image into the correct box on the image.
                          </p>

                          <div className="mt-3 flex flex-wrap gap-3">
                            {question.question_data.draggableImageChoices?.map(
                              (choice) => {
                                const used = choiceIsUsed(question, choice.id);

                                return (
                                  <div
                                    key={choice.id}
                                    draggable={!used}
                                    onDragStart={() =>
                                      setDraggedChoice({
                                        questionId: question.id,
                                        choiceValue: choice.id,
                                      })
                                    }
                                    onDragEnd={() => setDraggedChoice(null)}
                                    className={
                                      used
                                        ? "cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900 p-2 text-sm font-semibold text-slate-500 opacity-50"
                                        : "cursor-grab rounded-xl border border-blue-700 bg-blue-950 p-2 text-sm font-semibold text-blue-100 active:cursor-grabbing"
                                    }
                                  >
                                    <img
                                      src={choice.imageUrl}
                                      alt={choice.label}
                                      className="h-20 w-20 rounded-lg object-contain"
                                    />
                                    <p className="mt-1 text-center">
                                      {choice.label}
                                    </p>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}

                    {question.question_data.imageUrl ? (
                      <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                        <img
                          src={question.question_data.imageUrl}
                          alt="Question image"
                          className="block w-full"
                        />

                        {question.question_data.overlayBoxes?.map(
                          (box, overlayIndex) => {
                            const currentAnswer =
                              imageOverlayResponses[question.id]?.[box.id] || "";

                            return (
                              <div
                                key={box.id}
                                className="absolute"
                                style={{
                                  left: `${box.x}%`,
                                  top: `${box.y}%`,
                                  width: `${box.width}%`,
                                  height: `${box.height}%`,
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  dropChoiceIntoOverlay(question.id, box.id);
                                }}
                              >
                                <div className="flex h-full w-full flex-col">
                                  <div className="mb-1 inline-block self-start rounded bg-slate-900/90 px-1 py-0.5 text-[10px] font-semibold text-white">
                                    {box.label || `Box ${overlayIndex + 1}`}
                                  </div>

                                  {overlayAnswerMode === "drag-drop-text" ? (
                                    <div
                                      className={
                                        currentAnswer
                                          ? "flex h-full w-full items-center justify-center rounded-lg border border-green-500 bg-green-950/95 px-2 py-1 text-center text-sm font-semibold text-green-100"
                                          : "flex h-full w-full items-center justify-center rounded-lg border border-dashed border-blue-500 bg-slate-950/80 px-2 py-1 text-center text-xs font-semibold text-blue-200"
                                      }
                                    >
                                      {currentAnswer ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            clearDroppedChoice(
                                              question.id,
                                              box.id
                                            )
                                          }
                                          className="h-full w-full"
                                          title="Click to remove this choice"
                                        >
                                          {currentAnswer}
                                        </button>
                                      ) : (
                                        "Drop here"
                                      )}
                                    </div>
                                  ) : overlayAnswerMode === "drag-drop-image" ? (
                                    <div
                                      className={
                                        currentAnswer
                                          ? "flex h-full w-full items-center justify-center rounded-lg border border-green-500 bg-green-950/95 p-1"
                                          : "flex h-full w-full items-center justify-center rounded-lg border border-dashed border-blue-500 bg-slate-950/80 px-2 py-1 text-center text-xs font-semibold text-blue-200"
                                      }
                                    >
                                      {currentAnswer ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            clearDroppedChoice(
                                              question.id,
                                              box.id
                                            )
                                          }
                                          className="flex h-full w-full items-center justify-center"
                                          title="Click to remove this choice"
                                        >
                                          {(() => {
                                            const selectedChoice =
                                              question.question_data.draggableImageChoices?.find(
                                                (choice) =>
                                                  choice.id === currentAnswer
                                              );

                                            if (!selectedChoice) {
                                              return (
                                                <span className="text-xs text-red-200">
                                                  Missing image
                                                </span>
                                              );
                                            }

                                            return (
                                              <img
                                                src={selectedChoice.imageUrl}
                                                alt={selectedChoice.label}
                                                className="max-h-full max-w-full object-contain"
                                              />
                                            );
                                          })()}
                                        </button>
                                      ) : (
                                        "Drop here"
                                      )}
                                    </div>
                                  ) : (
                                    <input
                                      className="h-full w-full rounded-lg border border-blue-500 bg-slate-950/95 px-2 py-1 text-sm text-white"
                                      value={currentAnswer}
                                      onChange={(event) =>
                                        updateImageOverlayResponse(
                                          question.id,
                                          box.id,
                                          event.target.value
                                        )
                                      }
                                      placeholder="answer"
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <p className="text-red-300">Image could not be loaded.</p>
                    )}

                    {(question.question_data.overlayBoxes || []).length === 0 && (
                      <p className="text-sm text-slate-400">
                        This image question has no answer boxes, so students only
                        view the image.
                      </p>
                    )}
                  </div>
                )}
                </div>
              )}
                </div>
              </div>
              </div>
            );
          })}
        </section>

      </StudentAssessmentFrame>
    </main>
  );
}
