"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { requireAccountRole } from "@/lib/roleGuard";
import {
  gradeDragDrop,
  normalizeDragDropData,
  type DragDropData,
  type DragDropPlacements,
} from "@/lib/dragDrop";

type QuestionType =
  | "multiple-choice"
  | "drag-and-drop"
  | "short-answer"
  | "fill-in-the-blank"
  | "image-question"
  | "sorting-order"
  | "sorting-category";

type OverlayAnswerMode = "text-entry" | "drag-drop-text" | "drag-drop-image";

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
  assessment_code: string;
  classroom_id: string | null;
};

type Question = {
  id: string;
  assessment_id: string;
  question_type: QuestionType;
  prompt: string;
  question_data: {
    choices?: string[];
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
  };
  question_order: number;
};

type StudentAnswer = {
  id: string;
  attempt_id: string;
  question_id: string;
  answer_data: {
    answer?: string;
    answers?: Record<string, string>;
    boxResults?: Record<string, boolean>;
    blankResults?: Record<string, boolean>;
    overlayResults?: Record<string, boolean>;
    missing?: boolean;
    viewed?: boolean;
    hasOverlayBoxes?: boolean;
    overlayAnswerMode?: OverlayAnswerMode;
    orderedItemIds?: string[];
    correctOrder?: string[];
    categoryAssignments?: Record<string, string>;
    categoryResults?: Record<string, boolean>;
    placements?: DragDropPlacements;
  };
  is_correct: boolean | null;
  questions: {
    id: string;
    prompt: string;
    question_type: QuestionType;
    question_order: number;
    question_data: {
      choices?: string[];
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
    };
  } | null;
};

type StudentAttempt = {
  id: string;
  assessment_id: string;
  student_id: string | null;
  student_name: string;
  score: number | null;
  submitted_at: string;
};

type AssessmentSession = {
  student_id: string;
  first_opened_at: string;
  active_seconds: number;
  kick_count: number;
};

function normalizeAnswer(answer: string | undefined) {
  return (answer || "").trim().toLowerCase();
}

function displayMultipleChoiceAnswer(answer: string | undefined) {
  if (!answer) return "No answer";
  const imageChoiceMatch = answer.match(/^__image_choice_(\d+)__$/);
  if (imageChoiceMatch) {
    return `Choice ${String.fromCharCode(64 + Number(imageChoiceMatch[1]))} (image)`;
  }
  const tableChoiceMatch = answer.match(/^__table_choice_(\d+)__$/);
  return tableChoiceMatch
    ? `Row ${String.fromCharCode(64 + Number(tableChoiceMatch[1]))}`
    : answer;
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

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [assessmentId, setAssessmentId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<StudentAttempt[]>([]);
  const [sessionsByStudent, setSessionsByStudent] = useState<Record<string, AssessmentSession>>({});
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [answersByAttempt, setAnswersByAttempt] = useState<
    Record<string, StudentAnswer[]>
  >({});
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [regrading, setRegrading] = useState(false);

  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      setAssessmentId(resolvedParams.id);
      loadResults(resolvedParams.id);
    }

    getParams();
  }, [params]);

  async function loadResults(id: string) {
    const user = await requireAccountRole("teacher");
    if (!user) return;

    const { data: assessmentData, error: assessmentError } = await supabase
      .from("assessments")
      .select("id, title, assessment_code, classroom_id")
      .eq("id", id)
      .single();

    if (assessmentError) {
      alert(assessmentError.message);
      setLoading(false);
      return;
    }

    if (assessmentData.classroom_id) {
      const { data: rosterData, error: rosterError } = await supabase
        .from("classroom_students")
        .select("student_id")
        .eq("classroom_id", assessmentData.classroom_id);
      if (rosterError) {
        alert(`The classroom roster could not be loaded: ${rosterError.message}`);
        setLoading(false);
        return;
      }
      setAssignedStudentIds((rosterData || []).map((student) => student.student_id));
    } else {
      setAssignedStudentIds([]);
    }

    const { data: questionData, error: questionError } = await supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", id)
      .in("question_type", ["multiple-choice", "drag-and-drop"])
      .order("question_order", { ascending: true });

    if (questionError) {
      alert(questionError.message);
      setLoading(false);
      return;
    }

    const { data: attemptData, error: attemptError } = await supabase
      .from("student_attempts")
      .select("*")
      .eq("assessment_id", id)
      .order("submitted_at", { ascending: false });

    if (attemptError) {
      alert(attemptError.message);
      setLoading(false);
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from("assessment_sessions")
      .select("student_id,first_opened_at,active_seconds,kick_count")
      .eq("assessment_id", id);

    if (sessionError) {
      alert(`Session tracking could not be loaded: ${sessionError.message}`);
      setLoading(false);
      return;
    }

    const attemptIds = (attemptData || []).map((attempt) => attempt.id);

    let groupedAnswers: Record<string, StudentAnswer[]> = {};

    if (attemptIds.length > 0) {
      const { data: answerData, error: answerError } = await supabase
        .from("student_answers")
        .select(
          `
          id,
          attempt_id,
          question_id,
          answer_data,
          is_correct,
          questions (
            id,
            prompt,
            question_type,
            question_order,
            question_data
          )
        `
        )
        .in("attempt_id", attemptIds);

      if (answerError) {
        alert(answerError.message);
        setLoading(false);
        return;
      }

      groupedAnswers = (answerData || []).reduce(
        (groups: Record<string, StudentAnswer[]>, answer) => {
          const typedAnswer = answer as unknown as StudentAnswer;

          if (!groups[typedAnswer.attempt_id]) {
            groups[typedAnswer.attempt_id] = [];
          }

          groups[typedAnswer.attempt_id].push(typedAnswer);
          return groups;
        },
        {}
      );

      Object.keys(groupedAnswers).forEach((attemptId) => {
        groupedAnswers[attemptId].sort((a, b) => {
          const aOrder = a.questions?.question_order || 0;
          const bOrder = b.questions?.question_order || 0;
          return aOrder - bOrder;
        });
      });
    }

    setAssessment(assessmentData);
    setQuestions((questionData || []) as Question[]);
    setAttempts(attemptData || []);
    setSessionsByStudent(
      (sessionData || []).reduce((sessions: Record<string, AssessmentSession>, session) => {
        sessions[session.student_id] = session;
        return sessions;
      }, {})
    );
    setAnswersByAttempt(groupedAnswers);
    setLoading(false);
  }

  function formatDate(dateText: string) {
    return new Date(dateText).toLocaleString([], {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatActiveMinutes(seconds: number | undefined) {
    if (!seconds) return "0.0 min";
    return `${(seconds / 60).toFixed(1)} min`;
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function questionIsScored(question: Question | StudentAnswer["questions"]) {
    if (!question) {
      return false;
    }

    if (question.question_type !== "image-question") {
      return true;
    }

    return (question.question_data.overlayBoxes || []).length > 0;
  }

  function getScoredQuestionCount() {
    return questions.filter(questionIsScored).length;
  }

  function gradeAnswer(answer: StudentAnswer) {
    const question = answer.questions;

    if (!question) {
      return false;
    }

    if (answer.answer_data.missing) {
      return false;
    }

    if (question.question_type === "multiple-choice") {
      return answer.answer_data.answer === question.question_data.correctAnswer;
    }

    if (question.question_type === "drag-and-drop") {
      return gradeDragDrop(
        normalizeDragDropData(question.question_data.dragDrop),
        answer.answer_data.placements || {}
      ).isCorrect;
    }

    if (question.question_type === "short-answer") {
      const answerBoxes = question.question_data.answerBoxes || [];
      const studentAnswers = answer.answer_data.answers || {};

      return answerBoxes.every(
        (answerBox) =>
          normalizeAnswer(studentAnswers[answerBox.id]) ===
          normalizeAnswer(answerBox.correctAnswer)
      );
    }

    if (question.question_type === "fill-in-the-blank") {
      const blanks = question.question_data.blanks || [];
      const studentAnswers = answer.answer_data.answers || {};

      return blanks.every(
        (blank) =>
          normalizeAnswer(studentAnswers[blank.id]) ===
          normalizeAnswer(blank.correctAnswer)
      );
    }

    if (question.question_type === "sorting-order") {
      const orderedItemIds = answer.answer_data.orderedItemIds || [];
      const correctOrder =
        question.question_data.correctOrder ||
        (question.question_data.sortingItems || []).map((item) => item.id);

      return (
        orderedItemIds.length === correctOrder.length &&
        orderedItemIds.every((itemId, index) => itemId === correctOrder[index])
      );
    }

    if (question.question_type === "sorting-category") {
      const categoryAssignments = answer.answer_data.categoryAssignments || {};
      const items = question.question_data.sortingItems || [];

      return items.every(
        (item) => categoryAssignments[item.id] === item.correctCategoryId
      );
    }

    if (question.question_type === "image-question") {
      const overlayBoxes = question.question_data.overlayBoxes || [];

      if (overlayBoxes.length === 0) {
        return null;
      }

      const studentAnswers = answer.answer_data.answers || {};

      return overlayBoxes.every(
        (box) =>
          normalizeAnswer(studentAnswers[box.id]) ===
          normalizeAnswer(box.correctAnswer)
      );
    }

    return false;
  }

  function buildUpdatedAnswerData(answer: StudentAnswer) {
    const question = answer.questions;

    if (!question) {
      return answer.answer_data;
    }

    if (answer.answer_data.missing) {
      return answer.answer_data;
    }

    if (question.question_type === "short-answer") {
      const answerBoxes = question.question_data.answerBoxes || [];
      const studentAnswers = answer.answer_data.answers || {};
      const boxResults: Record<string, boolean> = {};

      answerBoxes.forEach((answerBox) => {
        boxResults[answerBox.id] =
          normalizeAnswer(studentAnswers[answerBox.id]) ===
          normalizeAnswer(answerBox.correctAnswer);
      });

      return {
        ...answer.answer_data,
        boxResults,
      };
    }

    if (question.question_type === "fill-in-the-blank") {
      const blanks = question.question_data.blanks || [];
      const studentAnswers = answer.answer_data.answers || {};
      const blankResults: Record<string, boolean> = {};

      blanks.forEach((blank) => {
        blankResults[blank.id] =
          normalizeAnswer(studentAnswers[blank.id]) ===
          normalizeAnswer(blank.correctAnswer);
      });

      return {
        ...answer.answer_data,
        blankResults,
      };
    }

    if (question.question_type === "sorting-order") {
      return {
        ...answer.answer_data,
        correctOrder:
          question.question_data.correctOrder ||
          (question.question_data.sortingItems || []).map((item) => item.id),
      };
    }

    if (question.question_type === "sorting-category") {
      const categoryAssignments = answer.answer_data.categoryAssignments || {};
      const categoryResults: Record<string, boolean> = {};

      (question.question_data.sortingItems || []).forEach((item) => {
        categoryResults[item.id] =
          categoryAssignments[item.id] === item.correctCategoryId;
      });

      return {
        ...answer.answer_data,
        categoryResults,
      };
    }

    if (question.question_type === "image-question") {
      const overlayBoxes = question.question_data.overlayBoxes || [];
      const studentAnswers = answer.answer_data.answers || {};
      const overlayResults: Record<string, boolean> = {};

      overlayBoxes.forEach((box) => {
        overlayResults[box.id] =
          normalizeAnswer(studentAnswers[box.id]) ===
          normalizeAnswer(box.correctAnswer);
      });

      return {
        ...answer.answer_data,
        overlayResults,
        hasOverlayBoxes: overlayBoxes.length > 0,
        overlayAnswerMode:
          question.question_data.overlayAnswerMode || "text-entry",
        viewed: true,
      };
    }

    return answer.answer_data;
  }

  function createMissingAnswerData(question: Question) {
    if (question.question_type === "multiple-choice") {
      return {
        answer: "",
        missing: true,
      };
    }


    if (question.question_type === "drag-and-drop") {
      return {
        placements: {},
        missing: true,
      };
    }

    if (question.question_type === "short-answer") {
      const answers: Record<string, string> = {};
      const boxResults: Record<string, boolean> = {};

      (question.question_data.answerBoxes || []).forEach((box) => {
        answers[box.id] = "";
        boxResults[box.id] = false;
      });

      return {
        answers,
        boxResults,
        missing: true,
      };
    }

    if (question.question_type === "fill-in-the-blank") {
      const answers: Record<string, string> = {};
      const blankResults: Record<string, boolean> = {};

      (question.question_data.blanks || []).forEach((blank) => {
        answers[blank.id] = "";
        blankResults[blank.id] = false;
      });

      return {
        answers,
        blankResults,
        missing: true,
      };
    }

    if (question.question_type === "sorting-order") {
      return {
        orderedItemIds: [],
        correctOrder:
          question.question_data.correctOrder ||
          (question.question_data.sortingItems || []).map((item) => item.id),
        missing: true,
      };
    }

    if (question.question_type === "sorting-category") {
      const categoryAssignments: Record<string, string> = {};
      const categoryResults: Record<string, boolean> = {};

      (question.question_data.sortingItems || []).forEach((item) => {
        categoryAssignments[item.id] = "";
        categoryResults[item.id] = false;
      });

      return {
        categoryAssignments,
        categoryResults,
        missing: true,
      };
    }

    if (question.question_type === "image-question") {
      const answers: Record<string, string> = {};
      const overlayResults: Record<string, boolean> = {};

      (question.question_data.overlayBoxes || []).forEach((box) => {
        answers[box.id] = "";
        overlayResults[box.id] = false;
      });

      return {
        answers,
        overlayResults,
        hasOverlayBoxes: (question.question_data.overlayBoxes || []).length > 0,
        overlayAnswerMode: question.question_data.overlayAnswerMode || "text-entry",
        viewed: false,
        missing: true,
      };
    }

    return {
      missing: true,
    };
  }

  async function regradeResults() {
    if (!assessmentId) {
      return;
    }

    const confirmRegrade = window.confirm(
      "This will regrade all submitted answers using the current questions and correct answers. Newer questions will be marked unanswered for older submissions. Continue?"
    );

    if (!confirmRegrade) {
      return;
    }

    setRegrading(true);

    const { data: questionData, error: questionError } = await supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("question_order", { ascending: true });

    if (questionError) {
      alert(questionError.message);
      setRegrading(false);
      return;
    }

    const currentQuestions = (questionData || []) as Question[];

    const { data: attemptData, error: attemptError } = await supabase
      .from("student_attempts")
      .select("*")
      .eq("assessment_id", assessmentId);

    if (attemptError) {
      alert(attemptError.message);
      setRegrading(false);
      return;
    }

    const attemptIds = (attemptData || []).map((attempt) => attempt.id);

    if (attemptIds.length === 0) {
      alert("There are no submissions to regrade.");
      setRegrading(false);
      return;
    }

    const { data: answerData, error: answerError } = await supabase
      .from("student_answers")
      .select(
        `
        id,
        attempt_id,
        question_id,
        answer_data,
        is_correct,
        questions (
          id,
          prompt,
          question_type,
          question_order,
          question_data
        )
      `
      )
      .in("attempt_id", attemptIds);

    if (answerError) {
      alert(answerError.message);
      setRegrading(false);
      return;
    }

    let answers = (answerData || []) as unknown as StudentAnswer[];

    for (const attempt of attemptData || []) {
      for (const question of currentQuestions) {
        const alreadyHasAnswer = answers.some(
          (answer) =>
            answer.attempt_id === attempt.id &&
            answer.question_id === question.id
        );

        if (!alreadyHasAnswer) {
          const { data: insertedAnswer, error: insertError } = await supabase
            .from("student_answers")
            .insert({
              attempt_id: attempt.id,
              question_id: question.id,
              answer_data: createMissingAnswerData(question),
              is_correct: questionIsScored(question) ? false : null,
            })
            .select(
              `
              id,
              attempt_id,
              question_id,
              answer_data,
              is_correct,
              questions (
                id,
                prompt,
                question_type,
                question_order,
                question_data
              )
            `
            )
            .single();

          if (insertError) {
            alert(insertError.message);
            setRegrading(false);
            return;
          }

          answers = [...answers, insertedAnswer as unknown as StudentAnswer];
        }
      }
    }

    for (const answer of answers) {
      const shouldBeCorrect = gradeAnswer(answer);
      const updatedAnswerData = buildUpdatedAnswerData(answer);

      const { error } = await supabase
        .from("student_answers")
        .update({
          is_correct: shouldBeCorrect,
          answer_data: updatedAnswerData,
        })
        .eq("id", answer.id);

      if (error) {
        alert(error.message);
        setRegrading(false);
        return;
      }
    }

    for (const attempt of attemptData || []) {
      const answersForAttempt = answers.filter(
        (answer) => answer.attempt_id === attempt.id
      );

      const currentQuestionIds = currentQuestions.map((question) => question.id);

      const validScoredAnswersForAttempt = answersForAttempt.filter(
        (answer) =>
          currentQuestionIds.includes(answer.question_id) &&
          questionIsScored(answer.questions)
      );

      const updatedScore = validScoredAnswersForAttempt.filter(
        (answer) => gradeAnswer(answer) === true
      ).length;

      if (attempt.score !== updatedScore) {
        const { error } = await supabase
          .from("student_attempts")
          .update({ score: updatedScore })
          .eq("id", attempt.id);

        if (error) {
          alert(error.message);
          setRegrading(false);
          return;
        }
      }
    }

    await loadResults(assessmentId);
    setRegrading(false);
    alert("Results have been regraded.");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        Loading results...
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

  const scoredQuestionCount = getScoredQuestionCount();
  const assignedStudentSet = new Set(assignedStudentIds);
  const completedStudentCount = new Set(
    attempts
      .map((attempt) => attempt.student_id)
      .filter(
        (studentId): studentId is string =>
          Boolean(studentId) && assignedStudentSet.has(studentId as string)
      )
  ).size;
  const scoredAttempts = attempts.filter((attempt) => attempt.score !== null);
  const classAverage = scoredAttempts.length && scoredQuestionCount
    ? Math.round(
        (scoredAttempts.reduce((total, attempt) => total + (attempt.score || 0), 0) /
          scoredAttempts.length /
          scoredQuestionCount) *
          100
      )
    : null;

  return (
    <>
      <nav className="border-b border-slate-200 bg-white text-slate-900" aria-label="Global navigation">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/80 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-6 border-b border-slate-800 px-6 py-6 sm:flex-row sm:items-start sm:justify-between lg:px-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 ring-1 ring-inset ring-blue-400/20">
                  Assessment results
                </span>
                <span className="font-mono text-xs font-bold tracking-widest text-slate-400">
                  {assessment.assessment_code}
                </span>
              </div>
              <h1 className="mt-4 truncate text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {assessment.title}
              </h1>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={() => loadResults(assessmentId)}
              className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
            >
              Refresh Results
            </button>

            <button
              onClick={regradeResults}
              disabled={regrading}
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regrading ? "Regrading..." : "Regrade Results"}
            </button>
            </div>
          </div>
          <div className="grid divide-y divide-slate-800 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-5 lg:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Completed</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {completedStudentCount} <span className="text-base font-semibold text-slate-500">/ {assignedStudentIds.length}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">assigned students</p>
            </div>
            <div className="px-5 py-5 lg:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Class average</p>
              <p className="mt-2 text-2xl font-bold text-blue-300">{classAverage === null ? "—" : `${classAverage}%`}</p>
              <p className="mt-1 text-xs text-slate-500">across submissions</p>
            </div>
            <div className="px-5 py-5 lg:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Submissions</p>
              <p className="mt-2 text-2xl font-bold text-white">{attempts.length}</p>
              <p className="mt-1 text-xs text-slate-500">total attempts</p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Student Results</h2>

          {attempts.length === 0 ? (
            <p className="mt-4 text-slate-400">
              No students have submitted this assessment yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
              <div className="hidden min-w-[1100px] grid-cols-[1.3fr_1.1fr_1.1fr_100px_100px_90px_140px] gap-4 border-b border-slate-800 bg-slate-950/60 px-5 py-3 text-sm font-semibold text-slate-400 md:grid">
                <div>Student</div>
                <div>First opened</div>
                <div>Submitted</div>
                <div>Active time</div>
                <div>Kicked out</div>
                <div className="text-right">Score</div>
                <div className="text-right">Details</div>
              </div>

              {attempts.map((attempt) => {
                const answers = answersByAttempt[attempt.id] || [];
                const isExpanded = expandedAttemptId === attempt.id;
                const session = attempt.student_id ? sessionsByStudent[attempt.student_id] : undefined;

                return (
                  <div
                    key={attempt.id}
                    className="border-b border-slate-800 last:border-b-0"
                  >
                    <div className="grid gap-3 px-5 py-4 md:min-w-[1100px] md:grid-cols-[1.3fr_1.1fr_1.1fr_100px_100px_90px_140px] md:items-center md:gap-4">
                      <div>
                        <p className="font-semibold text-white">
                          {attempt.student_name}
                        </p>

                        {answers.length < questions.length && (
                          <p className="mt-1 text-xs text-yellow-300">
                            Missing newer question answers
                          </p>
                        )}
                      </div>

                      <p className="text-sm text-slate-400">
                        {session ? formatDate(session.first_opened_at) : "Not recorded"}
                      </p>

                      <p className="text-sm text-slate-400">
                        {formatDate(attempt.submitted_at)}
                      </p>

                      <p className="text-sm font-medium text-slate-300">
                        {formatActiveMinutes(session?.active_seconds)}
                      </p>

                      <p className={`text-sm font-semibold ${session?.kick_count ? "text-red-300" : "text-slate-300"}`}>
                        {session?.kick_count || 0}
                      </p>

                      <p className="font-semibold text-blue-300 md:text-right">
                        {attempt.score} / {scoredQuestionCount}
                      </p>

                      <div className="md:text-right">
                        <button
                          onClick={() =>
                            setExpandedAttemptId(
                              isExpanded ? null : attempt.id
                            )
                          }
                          className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
                        >
                          {isExpanded ? "Hide Answers" : "View Answers"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="space-y-4 border-t border-slate-800 bg-slate-950/40 px-5 py-5">
                        {answers.map((answer, index) => {
                          const question = answer.questions;
                          const overlayAnswerMode =
                            question?.question_data.overlayAnswerMode ||
                            answer.answer_data.overlayAnswerMode ||
                            "text-entry";

                          return (
                            <div
                              key={answer.id}
                              className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                            >
                              <p className="text-sm text-slate-500">
                                Question {index + 1} ·{" "}
                                {question?.question_type === "multiple-choice"
                                  ? "Multiple Choice"
                                  : question?.question_type === "drag-and-drop"
                                  ? "Drag & Drop"
                                  : question?.question_type === "short-answer"
                                  ? "Short Answer"
                                  : question?.question_type ===
                                    "fill-in-the-blank"
                                  ? "Fill in the Blank"
                                  : question?.question_type === "sorting-order"
                                  ? "Sorting: Put in Order"
                                  : question?.question_type === "sorting-category"
                                  ? "Sorting: Categories"
                                  : overlayAnswerMode === "drag-drop-text"
                                  ? "Image Text Drag and Drop"
                                  : overlayAnswerMode === "drag-drop-image"
                                  ? "Image Drag and Drop"
                                  : "Image Text Entry"}
                              </p>

                              <h4 className="mt-2 font-semibold">
                                {question?.prompt}
                              </h4>

                              {question?.question_type === "drag-and-drop" && (() => {
                                const data = normalizeDragDropData(question.question_data.dragDrop);
                                const placements = answer.answer_data.placements || {};
                                return (
                                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    {data.zones.map((zone) => (
                                      <div key={zone.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{zone.label}</p>
                                        <p className="mt-1 text-sm text-slate-200">
                                          {(placements[zone.id] || []).map((itemId) => data.items.find((item) => item.id === itemId)?.content || "Unknown item").join(", ") || "No response"}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}

                              {answer.answer_data.missing && (
                                <p className="mt-3 rounded-xl border border-yellow-800 bg-yellow-950/40 p-3 font-semibold text-yellow-200">
                                  No answer was submitted for this question. This
                                  question was likely added after the student
                                  submitted.
                                </p>
                              )}

                              {question?.question_type === "sorting-order" && (
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                                    <p className="text-sm font-semibold text-slate-300">
                                      Student order:
                                    </p>
                                    <div className="mt-3 space-y-2">
                                      {(answer.answer_data.orderedItemIds || []).map((itemId, orderIndex) => {
                                        const item = question.question_data.sortingItems?.find(
                                          (sortingItem) => sortingItem.id === itemId
                                        );
                                        const correctOrder = question.question_data.correctOrder || [];
                                        const isCorrectPosition = correctOrder[orderIndex] === itemId;

                                        return (
                                          <div
                                            key={`${answer.id}-student-${itemId}`}
                                            className={
                                              isCorrectPosition
                                                ? "rounded-lg border border-green-700 bg-green-950/40 p-3 text-green-200"
                                                : "rounded-lg border border-red-800 bg-red-950/30 p-3 text-red-200"
                                            }
                                          >
                                            <div className="flex items-center gap-3">
                                              {item?.imageUrl && (
                                                <img
                                                  src={item.imageUrl}
                                                  alt={getSortingItemDisplayLabel(item, `Item ${orderIndex + 1}`)}
                                                  className="h-14 w-14 rounded-lg border border-current/30 object-cover"
                                                />
                                              )}
                                              <div>
                                                <span className="font-semibold">#{orderIndex + 1}:</span>{" "}
                                                {getSortingItemDisplayLabel(item, `Item ${orderIndex + 1}`)}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                                    <p className="text-sm font-semibold text-slate-300">
                                      Correct order:
                                    </p>
                                    <div className="mt-3 space-y-2">
                                      {(question.question_data.correctOrder || []).map((itemId, orderIndex) => {
                                        const item = question.question_data.sortingItems?.find(
                                          (sortingItem) => sortingItem.id === itemId
                                        );

                                        return (
                                          <div
                                            key={`${answer.id}-correct-${itemId}`}
                                            className="rounded-lg border border-blue-800 bg-blue-950/30 p-3 text-blue-100"
                                          >
                                            <div className="flex items-center gap-3">
                                              {item?.imageUrl && (
                                                <img
                                                  src={item.imageUrl}
                                                  alt={getSortingItemDisplayLabel(item, `Item ${orderIndex + 1}`)}
                                                  className="h-14 w-14 rounded-lg border border-blue-700 object-cover"
                                                />
                                              )}
                                              <div>
                                                <span className="font-semibold">#{orderIndex + 1}:</span>{" "}
                                                {getSortingItemDisplayLabel(item, `Item ${orderIndex + 1}`)}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {question?.question_type === "sorting-category" && (
                                <div className="mt-4 space-y-4">
                                  {question.question_data.sortingCategories?.map((category) => (
                                    <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                                      <p className="font-semibold text-blue-200">{category.name}</p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {question.question_data.sortingItems
                                          ?.filter(
                                            (item) =>
                                              answer.answer_data.categoryAssignments?.[item.id] === category.id
                                          )
                                          .map((item) => {
                                            const isCorrect = item.correctCategoryId === category.id;

                                            return (
                                              <div
                                                key={item.id}
                                                className={
                                                  isCorrect
                                                    ? "rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-sm font-semibold text-green-200"
                                                    : "rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-sm font-semibold text-red-200"
                                                }
                                              >
                                                <div className="flex items-center gap-2">
                                                  {item.imageUrl && (
                                                    <img
                                                      src={item.imageUrl}
                                                      alt={getSortingItemDisplayLabel(item, "Sorting item")}
                                                      className="h-12 w-12 rounded-md border border-current/30 object-cover"
                                                    />
                                                  )}
                                                  <span>{getSortingItemDisplayLabel(item, "Sorting item")}</span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                      </div>
                                    </div>
                                  ))}

                                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                                    <p className="text-sm font-semibold text-slate-300">Correct categories:</p>
                                    <div className="mt-3 space-y-2">
                                      {question.question_data.sortingItems?.map((item) => {
                                        const correctCategory = question.question_data.sortingCategories?.find(
                                          (category) => category.id === item.correctCategoryId
                                        );
                                        const studentCategory = question.question_data.sortingCategories?.find(
                                          (category) =>
                                            category.id === answer.answer_data.categoryAssignments?.[item.id]
                                        );
                                        const isCorrect = item.correctCategoryId === answer.answer_data.categoryAssignments?.[item.id];

                                        return (
                                          <div
                                            key={item.id}
                                            className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"
                                          >
                                            <div className="flex items-center gap-3">
                                              {item.imageUrl && (
                                                <img
                                                  src={item.imageUrl}
                                                  alt={getSortingItemDisplayLabel(item, "Sorting item")}
                                                  className="h-14 w-14 rounded-lg border border-slate-700 object-cover"
                                                />
                                              )}
                                              <p className="font-semibold text-white">
                                                {getSortingItemDisplayLabel(item, "Sorting item")}
                                              </p>
                                            </div>
                                            <p className="mt-1 text-slate-300">
                                              Student category: {" "}
                                              <span className={isCorrect ? "font-semibold text-green-300" : "font-semibold text-red-300"}>
                                                {studentCategory?.name || "No category"}
                                              </span>
                                            </p>
                                            <p className="mt-1 text-slate-300">
                                              Correct category: {" "}
                                              <span className="font-semibold text-blue-300">
                                                {correctCategory?.name || "Missing category"}
                                              </span>
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {question?.question_type === "image-question" && (
                                <div className="mt-4 space-y-4">
                                  {question.question_data.imageUrl && (
                                    <div className="relative mx-auto w-full overflow-visible rounded-xl border border-slate-800 bg-slate-900">
                                      <img
                                        src={question.question_data.imageUrl}
                                        alt="Question image"
                                        className="block w-full rounded-xl"
                                      />

                                      {question.question_data.overlayBoxes?.map(
                                        (box, overlayIndex) => {
                                          const studentAnswer =
                                            answer.answer_data.answers?.[
                                              box.id
                                            ] || "";

                                          const overlayIsCorrect =
                                            normalizeAnswer(studentAnswer) ===
                                            normalizeAnswer(box.correctAnswer);

                                          const studentImageChoice =
                                            question.question_data.draggableImageChoices?.find(
                                              (choice) =>
                                                choice.id === studentAnswer
                                            );

                                          const correctImageChoice =
                                            question.question_data.draggableImageChoices?.find(
                                              (choice) =>
                                                choice.id === box.correctAnswer
                                            );

                                          const overlayBorderClass =
                                            overlayAnswerMode ===
                                            "drag-drop-image"
                                              ? overlayIsCorrect
                                                ? "border-green-400 bg-green-500/10"
                                                : "border-red-400 bg-red-500/10"
                                              : "border-blue-400 bg-blue-500/10";

                                          return (
                                            <div
                                              key={box.id}
                                              className={`group absolute border-2 ${overlayBorderClass}`}
                                              style={{
                                                left: `${box.x}%`,
                                                top: `${box.y}%`,
                                                width: `${box.width}%`,
                                                height: `${box.height}%`,
                                              }}
                                            >
                                              <div className="absolute left-0 top-0 z-10 rounded-br bg-blue-500 px-1 py-0.5 text-[10px] font-semibold text-white">
                                                {box.label ||
                                                  `Box ${overlayIndex + 1}`}
                                              </div>

                                              {overlayAnswerMode ===
                                                "drag-drop-image" && (
                                                <>
                                                  <div className="flex h-full w-full items-center justify-center overflow-hidden bg-slate-950/35 p-1">
                                                    {studentImageChoice ? (
                                                      <img
                                                        src={
                                                          studentImageChoice.imageUrl
                                                        }
                                                        alt={
                                                          studentImageChoice.label
                                                        }
                                                        className="h-full w-full object-contain"
                                                      />
                                                    ) : (
                                                      <span className="px-2 text-center text-xs font-semibold text-slate-200">
                                                        No answer
                                                      </span>
                                                    )}
                                                  </div>

                                                  <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-56 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl group-hover:block">
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                                      Correct answer
                                                    </p>

                                                    {correctImageChoice ? (
                                                      <div className="mt-2">
                                                        <img
                                                          src={
                                                            correctImageChoice.imageUrl
                                                          }
                                                          alt={
                                                            correctImageChoice.label
                                                          }
                                                          className="h-28 w-full rounded-lg object-contain"
                                                        />
                                                        <p className="mt-2 text-sm font-semibold text-white">
                                                          {
                                                            correctImageChoice.label
                                                          }
                                                        </p>
                                                      </div>
                                                    ) : (
                                                      <p className="mt-2 text-sm font-semibold text-red-300">
                                                        Missing correct image
                                                      </p>
                                                    )}
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          );
                                        }
                                      )}
                                    </div>
                                  )}

                                  {(question.question_data.overlayBoxes || [])
                                    .length === 0 && (
                                    <p className="text-sm text-slate-400">
                                      Image question — view only, not scored.
                                    </p>
                                  )}

                                  {overlayAnswerMode === "drag-drop-image" &&
                                    (question.question_data.overlayBoxes || [])
                                      .length > 0 && (
                                      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                                        The student&apos;s dropped images are shown
                                        directly in each overlay box. Hover over
                                        a box to see the correct answer image.
                                      </div>
                                    )}

                                  {overlayAnswerMode !== "drag-drop-image" &&
                                    (question.question_data.overlayBoxes || [])
                                      .length > 0 && (
                                      <div className="space-y-3">
                                        {question.question_data.overlayBoxes?.map(
                                          (box, overlayIndex) => {
                                            const studentAnswer =
                                              answer.answer_data.answers?.[
                                                box.id
                                              ] || "";

                                            const overlayIsCorrect =
                                              normalizeAnswer(studentAnswer) ===
                                              normalizeAnswer(box.correctAnswer);

                                            return (
                                              <div
                                                key={box.id}
                                                className="rounded-xl border border-slate-800 bg-slate-900 p-3"
                                              >
                                                <p className="text-sm text-slate-400">
                                                  {box.label ||
                                                    `Box ${overlayIndex + 1}`}
                                                </p>

                                                <p className="mt-1 text-slate-300">
                                                  {overlayAnswerMode ===
                                                  "drag-drop-text"
                                                    ? "Student dropped: "
                                                    : "Student answer: "}
                                                  <span className="font-semibold">
                                                    {studentAnswer ||
                                                      "No answer"}
                                                  </span>
                                                </p>

                                                <p className="mt-1 text-slate-300">
                                                  Correct answer:{" "}
                                                  <span className="font-semibold">
                                                    {box.correctAnswer}
                                                  </span>
                                                </p>

                                                <p
                                                  className={
                                                    overlayIsCorrect
                                                      ? "mt-1 font-semibold text-green-300"
                                                      : "mt-1 font-semibold text-red-300"
                                                  }
                                                >
                                                  {overlayIsCorrect
                                                    ? "This overlay box is correct"
                                                    : "This overlay box is incorrect"}
                                                </p>
                                              </div>
                                            );
                                          }
                                        )}
                                      </div>
                                    )}

                                  {overlayAnswerMode === "drag-drop-text" &&
                                    (question.question_data.draggableChoices ||
                                      []).length > 0 && (
                                      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                                        <p className="text-sm font-semibold text-slate-300">
                                          Available draggable choices:
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

                                  {overlayAnswerMode === "drag-drop-image" &&
                                    (question.question_data
                                      .draggableImageChoices || []).length >
                                      0 && (
                                      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                                        <p className="text-sm font-semibold text-slate-300">
                                          Available draggable image choices:
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
                                                <p className="mt-1">
                                                  {choice.label}
                                                </p>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    )}
                                </div>
                              )}

                              {question?.question_type === "multiple-choice" && (
                                <>
                                  <p className="mt-3 text-slate-300">
                                    Student answer:{" "}
                                    <span className="font-semibold">
                                      {displayMultipleChoiceAnswer(answer.answer_data.answer)}
                                    </span>
                                  </p>

                                  <p className="mt-1 text-slate-300">
                                    Current correct answer:{" "}
                                    <span className="font-semibold">
                                      {displayMultipleChoiceAnswer(question.question_data.correctAnswer)}
                                    </span>
                                  </p>
                                </>
                              )}

                              {question?.question_type === "short-answer" && (
                                <div className="mt-3 space-y-3">
                                  {question.question_data.answerBoxes?.map(
                                    (answerBox, answerBoxIndex) => {
                                      const studentAnswer =
                                        answer.answer_data.answers?.[
                                          answerBox.id
                                        ] || "";

                                      const boxIsCorrect =
                                        normalizeAnswer(studentAnswer) ===
                                        normalizeAnswer(
                                          answerBox.correctAnswer
                                        );

                                      return (
                                        <div
                                          key={answerBox.id}
                                          className="rounded-xl border border-slate-800 bg-slate-900 p-3"
                                        >
                                          <p className="text-sm text-slate-400">
                                            {answerBox.label ||
                                              `Answer ${answerBoxIndex + 1}`}
                                          </p>

                                          <p className="mt-1 text-slate-300">
                                            Student answer:{" "}
                                            <span className="font-semibold">
                                              {studentAnswer || "No answer"}
                                            </span>
                                          </p>

                                          <p className="mt-1 text-slate-300">
                                            Correct answer:{" "}
                                            <span className="font-semibold">
                                              {answerBox.correctAnswer}
                                            </span>
                                          </p>

                                          <p
                                            className={
                                              boxIsCorrect
                                                ? "mt-1 font-semibold text-green-300"
                                                : "mt-1 font-semibold text-red-300"
                                            }
                                          >
                                            {boxIsCorrect
                                              ? "This box is correct"
                                              : "This box is incorrect"}
                                          </p>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              )}

                              {question?.question_type ===
                                "fill-in-the-blank" && (
                                <div className="mt-3 space-y-3">
                                  {question.question_data.blanks?.map(
                                    (blank, blankIndex) => {
                                      const studentAnswer =
                                        answer.answer_data.answers?.[
                                          blank.id
                                        ] || "";

                                      const blankIsCorrect =
                                        normalizeAnswer(studentAnswer) ===
                                        normalizeAnswer(blank.correctAnswer);

                                      return (
                                        <div
                                          key={blank.id}
                                          className="rounded-xl border border-slate-800 bg-slate-900 p-3"
                                        >
                                          <p className="text-sm text-slate-400">
                                            Blank {blankIndex + 1}
                                          </p>

                                          <p className="mt-1 text-slate-300">
                                            Student answer:{" "}
                                            <span className="font-semibold">
                                              {studentAnswer || "No answer"}
                                            </span>
                                          </p>

                                          <p className="mt-1 text-slate-300">
                                            Correct answer:{" "}
                                            <span className="font-semibold">
                                              {blank.correctAnswer}
                                            </span>
                                          </p>

                                          <p
                                            className={
                                              blankIsCorrect
                                                ? "mt-1 font-semibold text-green-300"
                                                : "mt-1 font-semibold text-red-300"
                                            }
                                          >
                                            {blankIsCorrect
                                              ? "This blank is correct"
                                              : "This blank is incorrect"}
                                          </p>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              )}

                              {questionIsScored(question) && (
                                <p
                                  className={
                                    answer.is_correct
                                      ? "mt-3 font-semibold text-green-300"
                                      : "mt-3 font-semibold text-red-300"
                                  }
                                >
                                  {answer.is_correct
                                    ? "Question Correct"
                                    : "Question Incorrect"}
                                </p>
                              )}

                              {!questionIsScored(question) && (
                                <p className="mt-3 font-semibold text-slate-400">
                                  This question is not scored
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      </main>
    </>
  );
}
