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

function createAnswerBox(): AnswerBox {
  return {
    id: crypto.randomUUID(),
    label: "",
    correctAnswer: "",
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

function cleanFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-");
}

export default function AssessmentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [assessmentId, setAssessmentId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [questionType, setQuestionType] =
    useState<QuestionType>("multiple-choice");

  const [prompt, setPrompt] = useState("");

  const [choiceA, setChoiceA] = useState("");
  const [choiceB, setChoiceB] = useState("");
  const [choiceC, setChoiceC] = useState("");
  const [choiceD, setChoiceD] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("A");

  const [answerBoxes, setAnswerBoxes] = useState<AnswerBox[]>([
    createAnswerBox(),
  ]);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      setAssessmentId(resolvedParams.id);
      loadAssessment(resolvedParams.id);
    }

    getParams();
  }, [params]);

  async function loadAssessment(id: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

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

  function resetQuestionForm() {
    setQuestionType("multiple-choice");
    setPrompt("");

    setChoiceA("");
    setChoiceB("");
    setChoiceC("");
    setChoiceD("");
    setCorrectAnswer("A");

    setAnswerBoxes([createAnswerBox()]);

    setSelectedImageFile(null);
    setExistingImageUrl("");
    setImagePreviewUrl("");

    setEditingQuestionId(null);
  }

  function getChoicesFromForm() {
    return [choiceA.trim(), choiceB.trim(), choiceC.trim(), choiceD.trim()];
  }

  function getCorrectChoice(choices: string[]) {
    const answerIndex = ["A", "B", "C", "D"].indexOf(correctAnswer);
    return choices[answerIndex];
  }

  function validateQuestionForm() {
    if (!prompt.trim()) {
      alert("Please enter a question.");
      return false;
    }

    if (questionType === "multiple-choice") {
      const choices = getChoicesFromForm();

      if (choices.some((choice) => choice.length === 0)) {
        alert("Please enter all 4 answer choices.");
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

    if (questionType === "image-question") {
      if (!selectedImageFile && !existingImageUrl) {
        alert("Please upload an image for this question.");
        return false;
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

  async function uploadQuestionImage() {
    if (!selectedImageFile) {
      return {
        imageUrl: existingImageUrl,
        imagePath: "",
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

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "multiple-choice",
          prompt: prompt.trim(),
          question_data: {
            choices,
            correctAnswer: correctChoice,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "short-answer") {
        const cleanedAnswerBoxes = answerBoxes.map((box, index) => ({
          id: box.id || crypto.randomUUID(),
          label: box.label.trim() || `Answer ${index + 1}`,
          correctAnswer: box.correctAnswer.trim(),
        }));

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "short-answer",
          prompt: prompt.trim(),
          question_data: {
            answerBoxes: cleanedAnswerBoxes,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "fill-in-the-blank") {
        const blanks = extractBlanksFromTemplate(prompt);

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "fill-in-the-blank",
          prompt: makeStudentPreview(prompt.trim()),
          question_data: {
            template: prompt.trim(),
            blanks,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "image-question") {
        const imageData = await uploadQuestionImage();

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "image-question",
          prompt: prompt.trim(),
          question_data: {
            imageUrl: imageData.imageUrl,
            imagePath: imageData.imagePath,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      resetQuestionForm();
      loadAssessment(assessmentId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
      setUploadingImage(false);
    }
  }

  function startEditingQuestion(question: Question) {
    setEditingQuestionId(question.id);
    setQuestionType(question.question_type);

    if (question.question_type === "fill-in-the-blank") {
      setPrompt(question.question_data.template || question.prompt);
    } else {
      setPrompt(question.prompt);
    }

    if (question.question_type === "multiple-choice") {
      const choices = question.question_data.choices || ["", "", "", ""];
      const correctChoice = question.question_data.correctAnswer || choices[0];

      setChoiceA(choices[0] || "");
      setChoiceB(choices[1] || "");
      setChoiceC(choices[2] || "");
      setChoiceD(choices[3] || "");

      const correctIndex = choices.indexOf(correctChoice);
      setCorrectAnswer(["A", "B", "C", "D"][correctIndex] || "A");

      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setImagePreviewUrl("");
    }

    if (question.question_type === "short-answer") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");

      setAnswerBoxes(
        question.question_data.answerBoxes &&
          question.question_data.answerBoxes.length > 0
          ? question.question_data.answerBoxes
          : [createAnswerBox()]
      );

      setSelectedImageFile(null);
      setExistingImageUrl("");
      setImagePreviewUrl("");
    }

    if (question.question_type === "fill-in-the-blank") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setImagePreviewUrl("");
    }

    if (question.question_type === "image-question") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl(question.question_data.imageUrl || "");
      setImagePreviewUrl(question.question_data.imageUrl || "");
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

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "multiple-choice",
            prompt: prompt.trim(),
            question_data: {
              choices,
              correctAnswer: correctChoice,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "short-answer") {
        const cleanedAnswerBoxes = answerBoxes.map((box, index) => ({
          id: box.id || crypto.randomUUID(),
          label: box.label.trim() || `Answer ${index + 1}`,
          correctAnswer: box.correctAnswer.trim(),
        }));

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "short-answer",
            prompt: prompt.trim(),
            question_data: {
              answerBoxes: cleanedAnswerBoxes,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "fill-in-the-blank") {
        const blanks = extractBlanksFromTemplate(prompt);

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "fill-in-the-blank",
            prompt: makeStudentPreview(prompt.trim()),
            question_data: {
              template: prompt.trim(),
              blanks,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "image-question") {
        const imageData = await uploadQuestionImage();

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "image-question",
            prompt: prompt.trim(),
            question_data: {
              imageUrl: imageData.imageUrl,
              imagePath: imageData.imagePath,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
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
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a href="/teacher" className="text-sm text-blue-300 hover:underline">
            ← Back to Teacher Dashboard
          </a>

          <a
            href={`/teacher/assessments/${assessmentId}/results`}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            View Results
          </a>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h1 className="text-4xl font-bold">{assessment.title}</h1>

              {assessment.description && (
                <p className="mt-3 text-slate-300">
                  {assessment.description}
                </p>
              )}

              <p className="mt-4 text-sm text-slate-400">
                Student Code:{" "}
                <span className="font-mono text-lg text-blue-300">
                  {assessment.assessment_code}
                </span>
              </p>

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

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
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
              <label className="text-sm text-slate-300">Question Type</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                value={questionType}
                onChange={(event) =>
                  setQuestionType(event.target.value as QuestionType)
                }
              >
                <option value="multiple-choice">Multiple Choice</option>
                <option value="short-answer">Short Answer</option>
                <option value="fill-in-the-blank">Fill in the Blank</option>
                <option value="image-question">Image Question</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-300">
                {questionType === "fill-in-the-blank"
                  ? "Question with Blanks"
                  : "Question"}
              </label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  questionType === "fill-in-the-blank"
                    ? "Example: A triangle has [[3]] sides and angle sum [[180]] degrees."
                    : questionType === "image-question"
                    ? "Example: Use the image below to answer the question."
                    : "Example: Solve the following question."
                }
              />

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

            {questionType === "multiple-choice" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-slate-300">Choice A</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceA}
                      onChange={(event) => setChoiceA(event.target.value)}
                      placeholder="Example: 48"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">Choice B</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceB}
                      onChange={(event) => setChoiceB(event.target.value)}
                      placeholder="Example: 54"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">Choice C</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceC}
                      onChange={(event) => setChoiceC(event.target.value)}
                      placeholder="Example: 56"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">Choice D</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceD}
                      onChange={(event) => setChoiceD(event.target.value)}
                      placeholder="Example: 64"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-300">
                    Correct Answer
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                    value={correctAnswer}
                    onChange={(event) => setCorrectAnswer(event.target.value)}
                  >
                    <option value="A">Choice A</option>
                    <option value="B">Choice B</option>
                    <option value="C">Choice C</option>
                    <option value="D">Choice D</option>
                  </select>
                </div>
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

            {questionType === "image-question" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <h3 className="text-lg font-semibold">Image Upload</h3>

                <p className="mt-1 text-sm text-slate-400">
                  Upload an image for students to view. Overlay answer boxes
                  will be added in the next step.
                </p>

                <input
                  className="mt-5 block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleImageFileChange(event.target.files?.[0] || null)
                  }
                />

                {imagePreviewUrl && (
                  <div className="mt-5">
                    <p className="mb-2 text-sm text-slate-300">Preview</p>
                    <img
                      src={imagePreviewUrl}
                      alt="Question image preview"
                      className="max-h-[500px] w-full rounded-xl border border-slate-800 object-contain"
                    />
                  </div>
                )}
              </div>
            )}

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

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Questions</h2>

          {questions.length === 0 ? (
            <p className="mt-4 text-slate-400">
              This assessment does not have any questions yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div className="w-full">
                      <p className="text-sm text-slate-500">
                        Question {index + 1} ·{" "}
                        {question.question_type === "multiple-choice"
                          ? "Multiple Choice"
                          : question.question_type === "short-answer"
                          ? "Short Answer"
                          : question.question_type === "fill-in-the-blank"
                          ? "Fill in the Blank"
                          : "Image Question"}
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

                      {question.question_type === "image-question" &&
                        question.question_data.imageUrl && (
                          <div className="mt-4">
                            <img
                              src={question.question_data.imageUrl}
                              alt="Question image"
                              className="max-h-[400px] w-full rounded-xl border border-slate-800 object-contain"
                            />
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
  );
}