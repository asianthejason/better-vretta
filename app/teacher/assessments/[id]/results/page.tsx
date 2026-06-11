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
  assessment_code: string;
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

type StudentAnswer = {
  id: string;
  attempt_id: string;
  question_id: string;
  answer_data: {
    answer?: string;
    answers?: Record<string, string>;
    boxResults?: Record<string, boolean>;
    blankResults?: Record<string, boolean>;
    missing?: boolean;
    viewed?: boolean;
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
    };
  } | null;
};

type StudentAttempt = {
  id: string;
  assessment_id: string;
  student_name: string;
  score: number | null;
  submitted_at: string;
};

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [assessmentId, setAssessmentId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<StudentAttempt[]>([]);
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: assessmentData, error: assessmentError } = await supabase
      .from("assessments")
      .select("id, title, assessment_code")
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

  function normalizeAnswer(answer: string | undefined) {
    return (answer || "").trim().toLowerCase();
  }

  function questionIsScored(question: Question | StudentAnswer["questions"]) {
    return question?.question_type !== "image-question";
  }

  function getScoredQuestionCount() {
    return questions.filter(questionIsScored).length;
  }

  function gradeAnswer(answer: StudentAnswer) {
    const question = answer.questions;

    if (!question) {
      return false;
    }

    if (question.question_type === "image-question") {
      return null;
    }

    if (answer.answer_data.missing) {
      return false;
    }

    if (question.question_type === "multiple-choice") {
      return answer.answer_data.answer === question.question_data.correctAnswer;
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

    return false;
  }

  function buildUpdatedAnswerData(answer: StudentAnswer) {
    const question = answer.questions;

    if (!question) {
      return answer.answer_data;
    }

    if (question.question_type === "image-question") {
      return {
        ...answer.answer_data,
        viewed: Boolean(answer.answer_data.viewed),
      };
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

    return answer.answer_data;
  }

  function createMissingAnswerData(question: Question) {
    if (question.question_type === "image-question") {
      return {
        viewed: false,
        missing: true,
      };
    }

    if (question.question_type === "multiple-choice") {
      return {
        answer: "",
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
              is_correct: question.question_type === "image-question" ? null : false,
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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a
            href={`/teacher/assessments/${assessmentId}`}
            className="text-sm text-blue-300 hover:underline"
          >
            ← Back to Assessment Editor
          </a>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => loadResults(assessmentId)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
            >
              Refresh Results
            </button>

            <button
              onClick={regradeResults}
              disabled={regrading}
              className="rounded-xl border border-green-700 px-4 py-2 text-sm font-semibold text-green-300 hover:bg-green-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regrading ? "Regrading..." : "Regrade Results"}
            </button>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">
            Student Code:{" "}
            <span className="font-mono text-blue-300">
              {assessment.assessment_code}
            </span>
          </p>

          <h1 className="mt-3 text-4xl font-bold">{assessment.title}</h1>

          <p className="mt-4 text-slate-300">
            Total submissions: {attempts.length}
          </p>

          <p className="mt-1 text-slate-400">
            Current number of questions: {questions.length}
          </p>

          <p className="mt-1 text-slate-400">
            Scored questions: {scoredQuestionCount}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Student Results</h2>

          {attempts.length === 0 ? (
            <p className="mt-4 text-slate-400">
              No students have submitted this assessment yet.
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="hidden grid-cols-[1.4fr_1.2fr_100px_150px] gap-4 border-b border-slate-800 bg-slate-950/60 px-5 py-3 text-sm font-semibold text-slate-400 md:grid">
                <div>Student</div>
                <div>Submitted</div>
                <div className="text-right">Score</div>
                <div className="text-right">Details</div>
              </div>

              {attempts.map((attempt) => {
                const answers = answersByAttempt[attempt.id] || [];
                const isExpanded = expandedAttemptId === attempt.id;

                return (
                  <div
                    key={attempt.id}
                    className="border-b border-slate-800 last:border-b-0"
                  >
                    <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.4fr_1.2fr_100px_150px] md:items-center md:gap-4">
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
                        {formatDate(attempt.submitted_at)}
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
                        {answers.map((answer, index) => (
                          <div
                            key={answer.id}
                            className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                          >
                            <p className="text-sm text-slate-500">
                              Question {index + 1} ·{" "}
                              {answer.questions?.question_type ===
                              "multiple-choice"
                                ? "Multiple Choice"
                                : answer.questions?.question_type ===
                                  "short-answer"
                                ? "Short Answer"
                                : answer.questions?.question_type ===
                                  "fill-in-the-blank"
                                ? "Fill in the Blank"
                                : "Image Question"}
                            </p>

                            <h4 className="mt-2 font-semibold">
                              {answer.questions?.prompt}
                            </h4>

                            {answer.answer_data.missing && (
                              <p className="mt-3 rounded-xl border border-yellow-800 bg-yellow-950/40 p-3 font-semibold text-yellow-200">
                                No answer was submitted for this question. This
                                question was likely added after the student
                                submitted.
                              </p>
                            )}

                            {answer.questions?.question_type ===
                              "image-question" && (
                              <div className="mt-4">
                                <p className="mb-3 text-sm font-semibold text-slate-300">
                                  Image question — not scored
                                </p>

                                {answer.questions.question_data.imageUrl && (
                                  <img
                                    src={answer.questions.question_data.imageUrl}
                                    alt="Question image"
                                    className="max-h-[500px] w-full rounded-xl border border-slate-800 object-contain"
                                  />
                                )}
                              </div>
                            )}

                            {answer.questions?.question_type ===
                              "multiple-choice" && (
                              <>
                                <p className="mt-3 text-slate-300">
                                  Student answer:{" "}
                                  <span className="font-semibold">
                                    {answer.answer_data.answer || "No answer"}
                                  </span>
                                </p>

                                <p className="mt-1 text-slate-300">
                                  Current correct answer:{" "}
                                  <span className="font-semibold">
                                    {
                                      answer.questions?.question_data
                                        .correctAnswer
                                    }
                                  </span>
                                </p>
                              </>
                            )}

                            {answer.questions?.question_type ===
                              "short-answer" && (
                              <div className="mt-3 space-y-3">
                                {answer.questions.question_data.answerBoxes?.map(
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

                            {answer.questions?.question_type ===
                              "fill-in-the-blank" && (
                              <div className="mt-3 space-y-3">
                                {answer.questions.question_data.blanks?.map(
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

                            {answer.questions?.question_type !==
                              "image-question" && (
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
                          </div>
                        ))}
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
  );
}