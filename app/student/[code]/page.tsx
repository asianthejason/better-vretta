"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type QuestionType =
  | "multiple-choice"
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
  };
  question_order: number;
};

type ShortAnswerResponses = Record<string, string>;
type FillBlankResponses = Record<string, string>;
type OverlayResponses = Record<string, string>;
type SortingOrderResponses = Record<string, string[]>;
type SortingCategoryResponses = Record<string, Record<string, string>>;

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

export default function StudentAssessmentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const [assessmentCode, setAssessmentCode] = useState("");
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
  const [draggedSortingItem, setDraggedSortingItem] = useState<{
    questionId: string;
    itemId: string;
  } | null>(null);

  const [draggedChoice, setDraggedChoice] = useState<{
    questionId: string;
    choiceValue: string;
  } | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      const code = resolvedParams.code.toUpperCase();

      setAssessmentCode(code);
      loadAssessment(code);
    }

    getParams();
  }, [params]);

  async function loadAssessment(code: string) {
    const { data: assessmentData, error: assessmentError } = await supabase
      .from("assessments")
      .select("*")
      .eq("assessment_code", code)
      .eq("is_published", true)
      .single();

    if (assessmentError) {
      setAssessment(null);
      setLoading(false);
      return;
    }

    const { data: questionData, error: questionError } = await supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", assessmentData.id)
      .order("question_order", { ascending: true });

    if (questionError) {
      alert(questionError.message);
      setLoading(false);
      return;
    }

    const typedQuestions = (questionData || []) as Question[];

    const initialOrderResponses: SortingOrderResponses = {};
    const initialCategoryResponses: SortingCategoryResponses = {};

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
    });

    setAssessment(assessmentData);
    setQuestions(typedQuestions);
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
      alert("Please enter your name.");
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
          <a href="/student" className="text-sm text-blue-300 hover:underline">
            ← Try another code
          </a>

          <h1 className="mt-8 text-4xl font-bold">Assessment Not Found</h1>

          <p className="mt-4 text-slate-300">
            The code{" "}
            <span className="font-mono text-blue-300">{assessmentCode}</span>{" "}
            does not match a published assessment.
          </p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-4xl font-bold">Submitted</h1>

          <p className="mt-4 text-slate-300">
            Thank you, {studentName}. Your assessment has been submitted.
          </p>

          <p className="mt-6 text-2xl font-semibold text-blue-300">
            Score: {score} / {scoredQuestions.length}
          </p>

          <a
            href="/student"
            className="mt-8 inline-block rounded-xl border border-slate-700 px-4 py-2 font-semibold hover:bg-slate-800"
          >
            Enter Another Code
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <a href="/student" className="text-sm text-blue-300 hover:underline">
          ← Back to code entry
        </a>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">
            Code:{" "}
            <span className="font-mono text-blue-300">
              {assessment.assessment_code}
            </span>
          </p>

          <h1 className="mt-3 text-4xl font-bold">{assessment.title}</h1>

          {assessment.description && (
            <p className="mt-3 text-slate-300">{assessment.description}</p>
          )}

          <div className="mt-6">
            <label className="text-sm text-slate-300">Your Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Enter your name"
            />
          </div>
        </section>

        <section className="mt-8 space-y-6">
          {questions.map((question, index) => {
            const overlayAnswerMode =
              question.question_data.overlayAnswerMode || "text-entry";

            return (
              <div
                key={question.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <p className="text-sm text-slate-500">
                  Question {index + 1}
                  {question.question_type === "image-question" &&
                    (question.question_data.overlayBoxes || []).length === 0 &&
                    " · Not scored"}
                </p>

                {question.question_type !== "fill-in-the-blank" && (
                  <h2 className="mt-2 text-2xl font-semibold">
                    {question.prompt}
                  </h2>
                )}

                {question.question_type === "multiple-choice" && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {question.question_data.choices?.map((choice) => {
                      const selected =
                        multipleChoiceAnswers[question.id] === choice;

                      return (
                        <button
                          key={choice}
                          onClick={() =>
                            selectMultipleChoiceAnswer(question.id, choice)
                          }
                          className={
                            selected
                              ? "rounded-xl border border-blue-500 bg-blue-950 p-4 text-left text-blue-100"
                              : "rounded-xl border border-slate-700 p-4 text-left text-slate-200 hover:bg-slate-800"
                          }
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                )}

                {question.question_type === "short-answer" && (
                  <div className="mt-6 space-y-4">
                    {question.question_data.answerBoxes?.map(
                      (answerBox, answerBoxIndex) => (
                        <div key={answerBox.id}>
                          <label className="text-sm text-slate-300">
                            {answerBox.label || `Answer ${answerBoxIndex + 1}`}
                          </label>

                          <input
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
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
                          className="mx-2 inline-block w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-white"
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
                        className="flex cursor-grab items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 p-3 active:cursor-grabbing"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-950 text-sm font-bold text-blue-200">
                          {orderIndex + 1}
                        </div>
                        <div className="flex flex-1 items-center gap-3 font-semibold text-slate-100">
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
                          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSortingOrderItem(question.id, itemId, "down")}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                        >
                          ↓
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {question.question_type === "sorting-category" && (
                  <div className="mt-6 space-y-5">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <p className="text-sm font-semibold text-slate-300">
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
                              className="cursor-grab rounded-xl border border-blue-700 bg-blue-950 px-4 py-2 text-sm font-semibold text-blue-100 active:cursor-grabbing"
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
                          className="min-h-36 rounded-2xl border border-dashed border-blue-700 bg-slate-950 p-4"
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
                                  className="rounded-xl border border-green-700 bg-green-950/60 px-3 py-2 text-sm font-semibold text-green-100"
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
            );
          })}
        </section>

        <button
          onClick={submitAssessment}
          className="mt-8 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-500"
        >
          Submit Assessment
        </button>
      </div>
    </main>
  );
}