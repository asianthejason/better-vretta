"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ImageMarkup from "./ImageMarkup";
import DragDropQuestion from "./DragDropQuestion";
import { gradeDragDrop, isDragDropAnswered, normalizeDragDropData, type DragDropData, type DragDropPlacements } from "@/lib/dragDrop";

type QuestionType =
  | "multiple-choice"
  | "drag-and-drop"
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
    dragDrop?: DragDropData;
    layout?: "standard" | "split";
    leftPanelTitle?: string;
    leftPanelTopContent?: string;
    leftPanelContent?: string;
    leftPanelImageUrl?: string;
    leftPanelImagePath?: string;
    leftPanelTable?: LeftPanelTable;
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

function parseFillInBlankTemplate(template: string) {
  const parts: { type: "text" | "blank"; value: string; blankIndex?: number }[] =
    [];

  const regex = /\[\[(.*?)\]\]/g;
  let lastIndex = 0;
  let blankIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: template.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: "blank",
      value: "",
      blankIndex,
    });

    blankIndex += 1;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < template.length) {
    parts.push({
      type: "text",
      value: template.slice(lastIndex),
    });
  }

  return parts;
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

export default function StudentAssessmentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const searchParams = useSearchParams();
  const teacherPreview = searchParams.get("preview") === "1";
  const [assessmentCode, setAssessmentCode] = useState("");
  const [studentUserId, setStudentUserId] = useState("");
  const [accountRole, setAccountRole] = useState<"teacher" | "student">("student");
  const [accessDenied, setAccessDenied] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studentName, setStudentName] = useState("");

  const [multipleChoiceAnswers, setMultipleChoiceAnswers] = useState<
    Record<string, string>
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
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [studentPanelView, setStudentPanelView] = useState<StudentPanelView>("split");
  const activeSecondsRef = useRef(0);
  const lockdownEndingRef = useRef(false);

  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      const code = resolvedParams.code.toUpperCase();

      setAssessmentCode(code);
      loadAssessment(code);
    }

    getParams();
  }, [params, teacherPreview]);

  useEffect(() => {
    setStudentPanelView("split");
  }, [activeQuestionIndex]);

  useEffect(() => {
    if (!assessment || accountRole !== "student" || teacherPreview || submitted) return;

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
      const seconds = activeSecondsRef.current;
      activeSecondsRef.current = 0;
      await supabase.rpc("record_assessment_kick", {
        target_assessment: assessment.id,
        seconds_to_add: seconds,
      });
      window.location.replace("/student/dashboard?lockdown=1");
    }

    const activeTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        activeSecondsRef.current += 1;
      }
    }, 1000);
    const flushTimer = window.setInterval(() => void flushActivity(), 10000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") void terminateForLockdown();
    };
    const handleBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus()) void terminateForLockdown();
      }, 150);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.clearInterval(activeTimer);
      window.clearInterval(flushTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      if (!lockdownEndingRef.current) void flushActivity();
    };
  }, [assessment, accountRole, submitted, teacherPreview]);

  async function loadAssessment(code: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setStudentUserId(user.id);
    let assessmentQuery = supabase
      .from("assessments")
      .select("*")
      .eq("assessment_code", code);
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

    const { data: questionData, error: questionError } = await supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", assessmentData.id)
      .in("question_type", ["multiple-choice", "drag-and-drop"])
      .order("question_order", { ascending: true });

    if (questionError) {
      alert(questionError.message);
      setLoading(false);
      return;
    }

    const typedQuestions = (questionData || []) as Question[];

    if (profile?.role === "student") {
      const { error: sessionError } = await supabase.rpc("start_assessment_session", {
        target_assessment: assessmentData.id,
      });
      if (sessionError) {
        alert(`The assessment session could not be started: ${sessionError.message}`);
        setLoading(false);
        return;
      }
    }

    const initialOrderResponses: SortingOrderResponses = {};
    const initialCategoryResponses: SortingCategoryResponses = {};
    const initialDragDropResponses: Record<string, DragDropPlacements> = {};

    typedQuestions.forEach((question) => {
      if (question.question_type === "sorting-order") {
        initialOrderResponses[question.id] = shuffleArray(
          question.question_data.sortingItems?.map((item) => item.id) || []
        );
      }

      if (question.question_type === "sorting-category") {
        const assignments: Record<string, string> = {};
        (question.question_data.sortingItems || []).forEach((item) => {
          assignments[item.id] = "";
        });
        initialCategoryResponses[question.id] = assignments;
      }
      if (question.question_type === "drag-and-drop") {
        initialDragDropResponses[question.id] = Object.fromEntries(normalizeDragDropData(question.question_data.dragDrop).zones.map((zone) => [zone.id, []]));
      }
    });

    setAssessment(assessmentData);
    setQuestions(typedQuestions);
    setDragDropResponses(initialDragDropResponses);
    setSortingOrderResponses(initialOrderResponses);
    setSortingCategoryResponses(initialCategoryResponses);
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

  function selectMultipleChoiceAnswer(questionId: string, answer: string) {
    setMultipleChoiceAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: answer,
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
      return Boolean(multipleChoiceAnswers[question.id]);
    }
    if (question.question_type === "drag-and-drop") return isDragDropAnswered(normalizeDragDropData(question.question_data.dragDrop), dragDropResponses[question.id] || {});

    if (question.question_type === "short-answer") {
      const answerBoxes = question.question_data.answerBoxes || [];
      const responses = shortAnswerResponses[question.id] || {};

      return answerBoxes.every((answerBox) =>
        Boolean(responses[answerBox.id]?.trim())
      );
    }

    if (question.question_type === "fill-in-the-blank") {
      const blanks = question.question_data.blanks || [];
      const responses = fillBlankResponses[question.id] || {};

      return blanks.every((blank) => Boolean(responses[blank.id]?.trim()));
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
      return (
        multipleChoiceAnswers[question.id] ===
        question.question_data.correctAnswer
      );
    }
    if (question.question_type === "drag-and-drop") return gradeDragDrop(normalizeDragDropData(question.question_data.dragDrop), dragDropResponses[question.id] || {}).isCorrect;

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
      const blanks = question.question_data.blanks || [];
      const responses = fillBlankResponses[question.id] || {};

      return blanks.every(
        (blank) =>
          normalizeAnswer(responses[blank.id]) ===
          normalizeAnswer(blank.correctAnswer)
      );
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
      return {
        answer: multipleChoiceAnswers[question.id],
      };
    }
    if (question.question_type === "drag-and-drop") {
      const data = normalizeDragDropData(question.question_data.dragDrop);
      const placements = dragDropResponses[question.id] || {};
      return { placements, ...gradeDragDrop(data, placements) };
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
      const blanks = question.question_data.blanks || [];
      const responses = fillBlankResponses[question.id] || {};
      const blankResults: Record<string, boolean> = {};

      blanks.forEach((blank) => {
        blankResults[blank.id] =
          normalizeAnswer(responses[blank.id]) ===
          normalizeAnswer(blank.correctAnswer);
      });

      return {
        answers: responses,
        blankResults,
      };
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

    setScore(totalCorrect);
    setSubmitted(true);
  }

  function prepareIntentionalExit() {
    lockdownEndingRef.current = true;
    const seconds = activeSecondsRef.current;
    activeSecondsRef.current = 0;
    if (assessment && seconds > 0 && accountRole === "student") {
      void supabase.rpc("record_assessment_activity", {
        target_assessment: assessment.id,
        seconds_to_add: seconds,
      });
    }
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
          <Link href="/student" className="text-sm text-blue-300 hover:underline">
            ← Try another code
          </Link>

          <h1 className="mt-8 text-4xl font-bold">{accessDenied ? "Access not assigned" : "Assessment Not Found"}</h1>

          <p className="mt-4 text-slate-300">
            {accessDenied ? "Your student account has not been given access to this assessment." : <>The code{" "}
            <span className="font-mono text-blue-300">{assessmentCode}</span>{" "}
            does not match a published assessment.</>}
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
            <span className="hidden rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-600 sm:block">
              {assessment.assessment_code}
            </span>
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
              <Link href="/student" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700">
                Enter another code
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

  const answeredCount = questions.filter(questionIsAnswered).length;
  const dashboardHref = accountRole === "teacher" ? "/teacher" : "/student/dashboard";
  const activeQuestionHasSplitView =
    questions[activeQuestionIndex]?.question_data.layout === "split";
  const canSubmitAssessment =
    !teacherPreview && studentName.trim().length > 0 && answeredCount === questions.length;
  const submitDisabledReason = teacherPreview
    ? "Teacher preview mode cannot submit an assessment."
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
            <h2 className="mt-5 text-2xl font-bold">Assessment exited</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
              The assessment window lost focus. Returning to your dashboard…
            </p>
          </div>
        </div>
      )}
      <header className="border-b border-slate-200 bg-white">
        <div className="flex min-h-20 items-center justify-between gap-6 px-5 py-4 lg:px-7">
          <div className="min-w-0">
            <Link href={dashboardHref} onClick={prepareIntentionalExit} className="text-xs font-semibold uppercase tracking-wider text-blue-600 hover:text-blue-700">
              Jretta
            </Link>
            <h1 className="mt-1 truncate text-xl font-bold">{assessment.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href={dashboardHref}
              onClick={prepareIntentionalExit}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
            >
              Exit assessment
            </Link>
            {teacherPreview && (
              <span className="hidden rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-200 sm:inline-flex">
                Teacher preview
              </span>
            )}
            {!teacherPreview && (
              <label className="flex items-center gap-2" htmlFor="student-name">
                <span className="hidden text-sm font-medium text-slate-500 sm:inline">Student</span>
                <input
                  id="student-name"
                  className="w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-44 md:w-52"
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </label>
            )}
            <span className="hidden rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-600 md:block">
              {assessment.assessment_code}
            </span>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-5rem)] flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-slate-200 bg-white lg:relative lg:w-16 lg:border-b-0 lg:border-r">
          <div className="group/sidebar bg-white transition-[width,box-shadow] duration-200 lg:absolute lg:inset-y-0 lg:left-0 lg:z-40 lg:w-16 lg:overflow-hidden lg:border-r lg:border-slate-200 lg:hover:w-64 lg:hover:shadow-xl lg:focus-within:w-64 lg:focus-within:shadow-xl">
          <div className="border-b border-slate-200 px-3 py-4">
            <div className="hidden h-6 items-center justify-center text-xs font-bold text-blue-700 lg:flex lg:group-hover/sidebar:hidden lg:group-focus-within/sidebar:hidden">
              {activeQuestionIndex + 1}/{questions.length}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700 lg:opacity-0 lg:group-hover/sidebar:opacity-100 lg:group-focus-within/sidebar:opacity-100">Questions</span>
              <span className="text-slate-500 lg:opacity-0 lg:group-hover/sidebar:opacity-100 lg:group-focus-within/sidebar:opacity-100">{answeredCount}/{questions.length}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 lg:opacity-0 lg:group-hover/sidebar:opacity-100 lg:group-focus-within/sidebar:opacity-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <nav aria-label="Assessment questions" className="flex gap-2 overflow-x-auto p-3 lg:max-h-[calc(100vh-10rem)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
            {questions.map((question, index) => {
              const answered = questionIsAnswered(question);
              const active = index === activeQuestionIndex;

              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setActiveQuestionIndex(index)}
                  aria-current={active ? "step" : undefined}
                  className={`flex shrink-0 items-center gap-3 rounded-lg px-1.5 py-2 text-left text-sm font-semibold transition lg:w-full lg:px-1.5 ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className={`flex h-7 w-7 aspect-square shrink-0 items-center justify-center rounded-full border-2 text-[11px] ${
                    answered
                      ? "border-blue-600 bg-blue-600 text-white"
                      : active
                        ? "border-blue-600 text-blue-600"
                        : "border-slate-300 text-slate-400"
                  }`}>
                    {answered ? "✓" : index + 1}
                  </span>
                  <span className="hidden whitespace-nowrap opacity-0 transition-opacity lg:inline lg:group-hover/sidebar:opacity-100 lg:group-focus-within/sidebar:opacity-100">Question {index + 1}</span>
                </button>
              );
            })}
          </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <section className="flex-1 p-4 sm:p-6 lg:p-8">
          {questions.map((question, index) => {
            if (index !== activeQuestionIndex) {
              return null;
            }

            const overlayAnswerMode =
              question.question_data.overlayAnswerMode || "text-entry";
            const multipleChoiceHasImages = Boolean(
              question.question_data.choiceImages?.some((image) => image.imageUrl)
            );

            return (
              <div
                key={question.id}
                className={`grid min-h-[calc(100vh-15rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
                  question.question_data.layout === "split" && studentPanelView === "split"
                    ? "grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                {(question.question_data.layout !== "split" || studentPanelView !== "right") && (
                <div className={`min-w-0 bg-slate-50/70 p-4 sm:p-6 lg:p-8 ${question.question_data.layout === "split" && studentPanelView === "split" ? "border-r border-slate-200" : "border-b border-slate-200"}`}>
                  <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
                    Question {index + 1} of {questions.length}
                  </p>
                  {question.question_data.layout === "split" ? (
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
                  ) : (
                    <p className="mt-5 text-sm leading-6 text-slate-500">
                      Complete the statement by filling in each blank.
                    </p>
                  )}
                  {assessment.description && index === 0 && (
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

                {(question.question_data.layout !== "split" || studentPanelView !== "left") && (
                <div className="min-w-0 p-4 text-slate-900 sm:p-6 lg:p-8">
                {question.question_data.layout === "split" &&
                  question.question_type !== "fill-in-the-blank" && (
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
                  question.question_data.choiceTable?.enabled ? (
                  <div className="mt-6 overflow-x-auto">
                    <table className={`w-full border-collapse text-left ${question.question_data.choiceTable.hasBorder ? "border border-slate-300" : ""}`}>
                      <thead><tr><th className={`w-16 px-3 py-3 text-center ${question.question_data.choiceTable.hasBorder ? "border border-slate-300" : ""}`}>Row</th>{question.question_data.choiceTable.headers.map((header, headerIndex) => <th key={headerIndex} className={`px-4 py-3 font-semibold ${question.question_data.choiceTable?.hasBorder ? "border border-slate-300" : ""}`}>{header}</th>)}</tr></thead>
                      <tbody>{question.question_data.choiceTable.rows.map((row, rowIndex) => { const choiceValue = getMultipleChoiceValue(question.question_data.choices?.[rowIndex] || "", rowIndex); const selected = multipleChoiceAnswers[question.id] === choiceValue; return <tr key={rowIndex} role="radio" aria-checked={selected} tabIndex={0} onClick={() => selectMultipleChoiceAnswer(question.id, choiceValue)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectMultipleChoiceAnswer(question.id, choiceValue); } }} className={`cursor-pointer outline-none transition focus:ring-2 focus:ring-inset focus:ring-blue-500 ${selected ? "bg-blue-100 text-blue-950" : "hover:bg-blue-50/60"}`}><td className={`px-3 py-3 text-center ${question.question_data.choiceTable?.hasBorder ? "border border-slate-300" : ""}`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? "border-blue-600" : "border-slate-500"}`}>{selected && <span className="h-3 w-3 rounded-full bg-blue-600" />}</span></td>{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-4 py-3 ${question.question_data.choiceTable?.hasBorder ? "border border-slate-300" : ""}`}>{question.question_data.choiceTable?.cellImages?.[rowIndex]?.[cellIndex]?.imageUrl && <img src={question.question_data.choiceTable.cellImages[rowIndex][cellIndex].imageUrl} alt="" className="mx-auto mb-2 max-h-40 max-w-full object-contain" />}<div className="rich-text-content" dangerouslySetInnerHTML={{ __html: cell }} /></td>)}</tr>; })}</tbody>
                    </table>
                  </div>
                  ) : (
                  <div className={`mt-6 grid w-fit max-w-full ${multipleChoiceHasImages ? "grid-cols-1 gap-4 sm:grid-cols-2" : "grid-cols-[fit-content(32rem)] gap-3"}`}>
                    {question.question_data.choices?.map((choice, choiceIndex) => {
                      const choiceValue = getMultipleChoiceValue(choice, choiceIndex);
                      const selected =
                        multipleChoiceAnswers[question.id] === choiceValue;

                      return (
                        <button
                          key={choiceIndex}
                          onClick={() =>
                            selectMultipleChoiceAnswer(question.id, choiceValue)
                          }
                          className={
                            selected
                              ? `w-full rounded-xl border-2 border-blue-600 bg-blue-50 text-left font-semibold text-blue-900 ${multipleChoiceHasImages ? "max-w-[22rem] p-4" : "max-w-full px-5 py-3"}`
                              : `w-full rounded-xl border-2 border-slate-200 bg-white text-left text-slate-700 hover:border-blue-300 hover:bg-blue-50/40 ${multipleChoiceHasImages ? "max-w-[22rem] p-4" : "max-w-full px-5 py-3"}`
                          }
                        >
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
                  )
                )}

                {question.question_type === "drag-and-drop" && (
                  <DragDropQuestion
                    data={normalizeDragDropData(question.question_data.dragDrop)}
                    placements={dragDropResponses[question.id] || {}}
                    onChange={(placements) =>
                      setDragDropResponses((current) => ({
                        ...current,
                        [question.id]: placements,
                      }))
                    }
                  />
                )}

                {question.question_type === "short-answer" && (
                  <div className="mt-6 space-y-4">
                    {question.question_data.answerBoxes?.map(
                      (answerBox, answerBoxIndex) => (
                        <div key={answerBox.id}>
                          <label className="text-sm font-medium text-slate-600">
                            {answerBox.label || `Answer ${answerBoxIndex + 1}`}
                          </label>

                          <input
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                  <div className="mt-3 text-2xl font-semibold leading-loose">
                    {parseFillInBlankTemplate(
                      question.question_data.template || question.prompt
                    ).map((part, partIndex) => {
                      if (part.type === "text") {
                        return <span key={partIndex}>{part.value}</span>;
                      }

                      const blank =
                        question.question_data.blanks?.[part.blankIndex || 0];

                      if (!blank) {
                        return null;
                      }

                      return (
                        <input
                          key={partIndex}
                          className="mx-2 inline-block w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          value={
                            fillBlankResponses[question.id]?.[blank.id] || ""
                          }
                          onChange={(event) =>
                            updateFillBlankResponse(
                              question.id,
                              blank.id,
                              event.target.value
                            )
                          }
                          placeholder="answer"
                        />
                      );
                    })}
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
            );
          })}
        </section>

          <footer className="sticky bottom-0 z-50 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setActiveQuestionIndex((current) => Math.max(0, current - 1))}
              disabled={activeQuestionIndex === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">←</span> Previous
            </button>

            <div className="group relative flex items-center rounded-xl border border-slate-300 bg-slate-100 p-1 shadow-sm">
              {(["left", "split", "right"] as StudentPanelView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  disabled={!activeQuestionHasSplitView}
                  onClick={() => setStudentPanelView(view)}
                  aria-pressed={activeQuestionHasSplitView && studentPanelView === view}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition sm:px-4 sm:text-sm ${
                    activeQuestionHasSplitView && studentPanelView === view
                      ? "bg-blue-600 text-white shadow-sm"
                      : activeQuestionHasSplitView
                        ? "bg-transparent text-slate-600 hover:bg-white hover:text-slate-900"
                        : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  {view === "split" && <span className="mr-1.5" aria-hidden="true">▣</span>}
                  {view}
                </button>
              ))}
              {!activeQuestionHasSplitView && (
                <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-64 -translate-x-1/2 translate-y-1 rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-medium leading-5 text-white opacity-0 shadow-lg transition duration-100 group-hover:translate-y-0 group-hover:opacity-100">
                  This question does not have a split view.
                  <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-slate-900" />
                </span>
              )}
            </div>

            {activeQuestionIndex < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveQuestionIndex((current) => Math.min(questions.length - 1, current + 1))}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Next <span aria-hidden="true">→</span>
              </button>
            ) : (
              <span className="group relative inline-flex">
                <button
                  type="button"
                  onClick={submitAssessment}
                  disabled={!canSubmitAssessment}
                  aria-disabled={!canSubmitAssessment}
                  aria-describedby={!canSubmitAssessment ? "submit-disabled-reason" : undefined}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:hover:bg-slate-200"
                >
                  Submit Assessment
                </button>
                {!canSubmitAssessment && (
                  <span
                    id="submit-disabled-reason"
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max max-w-72 translate-y-1 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-lg transition duration-100 group-hover:translate-y-0 group-hover:opacity-100"
                  >
                    {submitDisabledReason}
                    <span className="absolute right-5 top-full h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-slate-900" />
                  </span>
                )}
              </span>
            )}
          </footer>
        </div>
      </div>
    </main>
  );
}
