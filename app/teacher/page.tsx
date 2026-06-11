"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Assessment = {
  id: string;
  title: string;
  description: string | null;
  assessment_code: string;
  is_published: boolean;
  created_at: string;
};

function generateAssessmentCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }

  return code;
}

export default function TeacherPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeacherData();
  }, []);

  async function loadTeacherData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setUserId(user.id);

    const { data, error } = await supabase
      .from("assessments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setAssessments(data || []);
    setLoading(false);
  }

  async function createAssessment() {
    if (!userId) {
      alert("You must be logged in.");
      return;
    }

    if (!title.trim()) {
      alert("Please enter an assessment title.");
      return;
    }

    const newAssessment = {
      teacher_id: userId,
      title: title.trim(),
      description: description.trim(),
      assessment_code: generateAssessmentCode(),
      is_published: false,
    };

    const { error } = await supabase.from("assessments").insert(newAssessment);

    if (error) {
      alert(error.message);
      return;
    }

    setTitle("");
    setDescription("");
    loadTeacherData();
  }

  async function deleteAssessment(assessment: Assessment) {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${assessment.title}"?\n\nThis will permanently delete the assessment, all questions, and all student results.`
    );

    if (!confirmDelete) {
      return;
    }

    const secondConfirm = window.confirm(
      "This cannot be undone. Are you absolutely sure?"
    );

    if (!secondConfirm) {
      return;
    }

    const { error } = await supabase
      .from("assessments")
      .delete()
      .eq("id", assessment.id);

    if (error) {
      alert(error.message);
      return;
    }

    loadTeacherData();
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <a href="/" className="text-sm text-blue-300 hover:underline">
            ← Back home
          </a>

          <button
            onClick={signOut}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Sign Out
          </button>
        </div>

        <h1 className="mt-8 text-4xl font-bold">Teacher Dashboard</h1>

        <p className="mt-4 max-w-2xl text-slate-300">
          Create assessments, generate student access codes, and manage your
          question sets.
        </p>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Create New Assessment</h2>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-slate-300">
                Assessment Title
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: Grade 8 Linear Relations Practice"
              />
            </div>

            <div>
              <label className="text-sm text-slate-300">Description</label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional instructions for students"
              />
            </div>

            <button
              onClick={createAssessment}
              className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-400"
            >
              Create Assessment
            </button>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Your Assessments</h2>

          {assessments.length === 0 ? (
            <p className="mt-4 text-slate-400">
              You have not created any assessments yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-4">
              {assessments.map((assessment) => (
                <div
                  key={assessment.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-xl font-semibold">
                        {assessment.title}
                      </h3>

                      {assessment.description && (
                        <p className="mt-2 text-slate-400">
                          {assessment.description}
                        </p>
                      )}

                      <p className="mt-3 text-sm text-slate-400">
                        Student Code:{" "}
                        <span className="font-mono text-blue-300">
                          {assessment.assessment_code}
                        </span>
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Status:{" "}
                        {assessment.is_published ? "Published" : "Draft"}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:min-w-40">
                      <a
                        href={`/teacher/assessments/${assessment.id}`}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-center font-semibold hover:bg-slate-800"
                      >
                        Edit Questions
                      </a>

                      <a
                        href={`/teacher/assessments/${assessment.id}/results`}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-center font-semibold hover:bg-slate-800"
                      >
                        View Results
                      </a>

                      <button
                        onClick={() => deleteAssessment(assessment)}
                        className="rounded-xl border border-red-800 px-4 py-2 text-center font-semibold text-red-300 hover:bg-red-950"
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