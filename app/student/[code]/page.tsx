"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type QuestionType =
  | "multiple-choice"
  | "short-answer"
  | "fill-in-the-blank"
  | "image-question";

type AnswerBox = {
  id: string;
  label: string;
  correctAnswer: string;
};

type BlankBox = {
  id: string;
  correctAnswer: string;
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
  };
  question_order: number;
};

type ShortAnswerResponses = Record<string, string>;
type FillBlankResponses = Record<string, string>;

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

    setAssessment(assessmentData);
    setQuestions((questionData || []) as Question[]);
    setLoading(false);
  }

  function normalizeAnswer(answer: string | undefined) {
    return (answer || "").trim().toLowerCase();
  }

  function questionIsScored(question: Question) {
    return question.question_type !== "image-question";
  }

  function getScoredQuestions() {
    return questions.filter(questionIsScored);
  }

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

  function questionIsAnswered(question: Question) {
    if (question.question_type === "image-question") {
      return true;
    }

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

    return false;
  }

  function gradeQuestion(question: Question) {
    if (question.question_type === "image-question") {
      return null;
    }

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

    return false;
  }

  function buildAnswerData(question: Question) {
    if (question.question_type === "image-question") {
      return {
        viewed: true,
      };
    }

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

    getScoredQuestions().forEach((question) => {
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
            Score: {score} / {getScoredQuestions().length}
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
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
            >
              <p className="text-sm text-slate-500">
                Question {index + 1}
                {question.question_type === "image-question" && " · Not scored"}
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

              {question.question_type === "image-question" && (
                <div className="mt-6">
                  {question.question_data.imageUrl ? (
                    <img
                      src={question.question_data.imageUrl}
                      alt="Question image"
                      className="max-h-[600px] w-full rounded-xl border border-slate-800 object-contain"
                    />
                  ) : (
                    <p className="text-red-300">Image could not be loaded.</p>
                  )}
                </div>
              )}
            </div>
          ))}
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