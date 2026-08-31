"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAccountRole } from "@/lib/roleGuard";

type Assessment = {
  id: string;
  title: string;
  description: string | null;
  assessment_code: string;
  is_published: boolean;
  created_at: string;
  classroom_id?: string | null;
};

type Classroom = { id: string; name: string; join_code: string };
type AssessmentStats = { assigned: number; completed: number; average: number | null };
type ClassroomStudent = { classroom_id: string; student_id: string };
type StudentAttempt = { assessment_id: string; student_id: string | null; score: number | null };
type AssessmentQuestion = {
  assessment_id: string;
  question_type: string;
  question_data: { overlayBoxes?: unknown[] } | null;
};
const UNASSIGNED_CLASSROOM = "__unassigned__";

function generateAssessmentCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }

  return code;
}

export default function TeacherPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [movingAssessmentId, setMovingAssessmentId] = useState<string | null>(null);
  const [publishingAssessmentId, setPublishingAssessmentId] = useState<string | null>(null);
  const [assessmentStats, setAssessmentStats] = useState<Record<string, AssessmentStats>>({});
  const [copiedClassroomId, setCopiedClassroomId] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const unassignedAssessmentCount = assessments.filter(
    (assessment) => !assessment.classroom_id
  ).length;
  const visibleAssessments = assessments.filter((assessment) =>
    selectedClassroomId === UNASSIGNED_CLASSROOM
      ? !assessment.classroom_id
      : assessment.classroom_id === selectedClassroomId
  );
  const selectedClassroom = classrooms.find(
    (classroom) => classroom.id === selectedClassroomId
  );

  useEffect(() => {
    loadTeacherData();
  }, []);

  async function loadTeacherData() {
    const user = await requireAccountRole("teacher");
    if (!user) return;

    setUserId(user.id);

    const [{ data, error }, { data: classroomData }] = await Promise.all([
      supabase.from("assessments").select("*").order("created_at", { ascending: false }),
      supabase.from("classrooms").select("id,name,join_code").order("created_at", { ascending: true }),
    ]);

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setAssessments(data || []);
    setClassrooms(classroomData || []);
    await loadAssessmentStats(data || [], classroomData || []);
    if (classroomData?.[0]) setSelectedClassroomId((current) => current || classroomData[0].id);
    setLoading(false);
  }

  async function loadAssessmentStats(assessmentData: Assessment[], classroomData: Classroom[]) {
    const assessmentIds = assessmentData.map((assessment) => assessment.id);
    const classroomIds = classroomData.map((classroom) => classroom.id);
    const [studentResult, attemptResult, questionResult] = await Promise.all([
      classroomIds.length
        ? supabase.from("classroom_students").select("classroom_id,student_id").in("classroom_id", classroomIds)
        : Promise.resolve({ data: [] as ClassroomStudent[], error: null }),
      assessmentIds.length
        ? supabase.from("student_attempts").select("assessment_id,student_id,score").in("assessment_id", assessmentIds)
        : Promise.resolve({ data: [] as StudentAttempt[], error: null }),
      assessmentIds.length
        ? supabase.from("questions").select("assessment_id,question_type,question_data").in("assessment_id", assessmentIds)
        : Promise.resolve({ data: [] as AssessmentQuestion[], error: null }),
    ]);

    if (studentResult.error || attemptResult.error || questionResult.error) {
      console.error("Unable to load assessment statistics", studentResult.error || attemptResult.error || questionResult.error);
      return;
    }

    const studentsByClassroom = new Map<string, Set<string>>();
    (studentResult.data || []).forEach((student) => {
      const students = studentsByClassroom.get(student.classroom_id) || new Set<string>();
      students.add(student.student_id);
      studentsByClassroom.set(student.classroom_id, students);
    });
    const attemptsByAssessment = new Map<string, StudentAttempt[]>();
    (attemptResult.data || []).forEach((attempt) => {
      const attempts = attemptsByAssessment.get(attempt.assessment_id) || [];
      attempts.push(attempt);
      attemptsByAssessment.set(attempt.assessment_id, attempts);
    });
    const scoredQuestionCounts = new Map<string, number>();
    (questionResult.data || []).forEach((question) => {
      scoredQuestionCounts.set(question.assessment_id, (scoredQuestionCounts.get(question.assessment_id) || 0) + 1);
    });

    const nextStats: Record<string, AssessmentStats> = {};
    assessmentData.forEach((assessment) => {
      const assignedStudents = assessment.classroom_id
        ? studentsByClassroom.get(assessment.classroom_id) || new Set<string>()
        : new Set<string>();
      const attempts = attemptsByAssessment.get(assessment.id) || [];
      const completedStudents = new Set(
        attempts.map((attempt) => attempt.student_id).filter(
          (studentId): studentId is string => Boolean(studentId) && assignedStudents.has(studentId as string)
        )
      );
      const scoredQuestionCount = scoredQuestionCounts.get(assessment.id) || 0;
      const scoredAttempts = attempts.filter((attempt) => attempt.score !== null);
      const average = scoredAttempts.length && scoredQuestionCount
        ? Math.round((scoredAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0) / scoredAttempts.length / scoredQuestionCount) * 100)
        : null;
      nextStats[assessment.id] = { assigned: assignedStudents.size, completed: completedStudents.size, average };
    });
    setAssessmentStats(nextStats);
  }

  async function togglePublished(assessment: Assessment) {
    setPublishingAssessmentId(assessment.id);
    const { data, error } = await supabase
      .from("assessments")
      .update({ is_published: !assessment.is_published })
      .eq("id", assessment.id)
      .select("id,is_published")
      .single();
    if (error || !data) {
      alert(error?.message || "The publish status could not be changed.");
      setPublishingAssessmentId(null);
      return;
    }
    setAssessments((current) => current.map((item) =>
      item.id === assessment.id ? { ...item, is_published: data.is_published } : item
    ));
    setPublishingAssessmentId(null);
  }

  async function createAssessment() {
    if (!userId) {
      alert("You must be logged in.");
      return;
    }
    if (!selectedClassroomId || selectedClassroomId === UNASSIGNED_CLASSROOM) {
      alert("Create or select a classroom before creating an assessment.");
      router.push("/teacher/classrooms");
      return;
    }

    setCreating(true);
    const newAssessment = {
      teacher_id: userId,
      title: "Untitled Assessment",
      description: null,
      assessment_code: generateAssessmentCode(),
      is_published: false,
      classroom_id: selectedClassroomId,
    };

    const { data, error } = await supabase
      .from("assessments")
      .insert(newAssessment)
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      setCreating(false);
      return;
    }

    router.push(`/teacher/assessments/${data.id}`);
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

  async function moveAssessment(assessment: Assessment, classroomId: string) {
    const nextClassroomId = classroomId || null;
    if ((assessment.classroom_id || null) === nextClassroomId) return;

    setMovingAssessmentId(assessment.id);
    const { error } = await supabase.rpc("move_assessment_to_classroom", {
      target_assessment: assessment.id,
      target_classroom: nextClassroomId,
    });

    if (error) {
      alert(error.message);
      setMovingAssessmentId(null);
      return;
    }

    setAssessments((current) =>
      current.map((item) =>
        item.id === assessment.id ? { ...item, classroom_id: nextClassroomId } : item
      )
    );
    if (selectedClassroomId === UNASSIGNED_CLASSROOM && nextClassroomId) {
      setSelectedClassroomId(nextClassroomId);
    }
    setMovingAssessmentId(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function copyClassroomCode(classroom: Classroom) {
    if (!classroom.join_code) return;
    await navigator.clipboard.writeText(classroom.join_code);
    setCopiedClassroomId(classroom.id);
    window.setTimeout(() => setCopiedClassroomId(null), 1800);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-900">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          Loading your dashboard...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <nav className="border-b border-slate-200 bg-white" aria-label="Global navigation">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-slate-950">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              J
            </span>
            Jretta
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/teacher"
              aria-current="page"
              className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              Dashboard
            </Link>
            <Link
              href="/teacher/classrooms"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Classrooms
            </Link>
            <Link
              href="/profile"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Teacher Dashboard
          </h1>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              aria-label="Select classroom"
              value={selectedClassroomId}
              onChange={(event) => setSelectedClassroomId(event.target.value)}
              className="min-w-52 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Select classroom</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
              {unassignedAssessmentCount > 0 && (
                <option value={UNASSIGNED_CLASSROOM}>
                  Unassigned assessments ({unassignedAssessmentCount})
                </option>
              )}
            </select>
            {selectedClassroom && (
              <button
                type="button"
                onClick={() => void copyClassroomCode(selectedClassroom)}
                disabled={!selectedClassroom.join_code}
                title="Copy classroom enrollment code"
                className="group flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
              >
                {copiedClassroomId === selectedClassroom.id ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="2">
                    <path d="m4 10 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8">
                    <rect x="7" y="6" width="9" height="10" rx="2" />
                    <path d="M13 6V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1" />
                  </svg>
                )}
                <code className="font-mono text-sm font-black tracking-widest">
                  {selectedClassroom.join_code || "No code"}
                </code>
                <span className="text-xs font-bold">
                  {copiedClassroomId === selectedClassroom.id ? "Copied!" : "Copy"}
                </span>
              </button>
            )}
            <button
              onClick={createAssessment}
              disabled={creating}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              <span className="text-lg leading-none">+</span>
              {creating ? "Creating..." : "Create Assessment"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-7 sm:py-8">

        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-600">Your library</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Assessments</h2>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">
              {visibleAssessments.length} {visibleAssessments.length === 1 ? "assessment" : "assessments"}
            </span>
          </div>

          {visibleAssessments.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl text-indigo-600">+</div>
              <h3 className="mt-4 font-semibold">No assessments in this classroom</h3>
              <p className="mt-1 text-sm text-slate-500">Create an assessment or move an existing one into this classroom.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleAssessments.map((assessment) => (
                <div
                  key={assessment.id}
                  className="group rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-100/60"
                >
                  <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold tracking-tight">
                        {assessment.title}
                        </h3>

                        {assessment.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {assessment.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={assessment.is_published}
                        aria-label={`${assessment.is_published ? "Unpublish" : "Publish"} ${assessment.title}`}
                        disabled={publishingAssessmentId === assessment.id}
                        onClick={() => void togglePublished(assessment)}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${assessment.is_published ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        <span className={`relative h-3.5 w-6 rounded-full transition ${assessment.is_published ? "bg-emerald-500" : "bg-slate-300"}`}>
                          <span className={`absolute top-0.5 size-2.5 rounded-full bg-white shadow-sm transition ${assessment.is_published ? "left-3" : "left-0.5"}`} />
                        </span>
                        {assessment.is_published ? "Published" : "Draft"}
                      </button>
                    </div>

                    <label className="mt-2.5 block">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Classroom
                      </span>
                      <select
                        value={assessment.classroom_id || ""}
                        disabled={movingAssessmentId === assessment.id}
                        onChange={(event) => void moveAssessment(assessment, event.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:bg-slate-100"
                      >
                        <option value="">No classroom</option>
                        {classrooms.map((classroom) => (
                          <option key={classroom.id} value={classroom.id}>
                            {classroom.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-2 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Student code</span>
                      <span className="font-mono text-xs font-bold tracking-widest text-indigo-600">{assessment.assessment_code}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 divide-x divide-slate-200 rounded-md border border-slate-200 bg-white py-1.5 text-center">
                      <div className="px-1">
                        <p className="text-xs font-bold text-slate-900">
                          {assessmentStats[assessment.id]?.completed || 0} / {assessmentStats[assessment.id]?.assigned || 0}
                        </p>
                        <p className="text-[9px] font-medium text-slate-500">complete</p>
                      </div>
                      <div className="px-1">
                        <p className="text-xs font-bold text-slate-900">
                          {assessmentStats[assessment.id]?.average ?? "—"}{assessmentStats[assessment.id]?.average !== null && assessmentStats[assessment.id]?.average !== undefined ? "%" : ""}
                        </p>
                        <p className="text-[9px] font-medium text-slate-500">average</p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                      <Link
                        href={`/teacher/assessments/${assessment.id}`}
                        className="flex-1 rounded-md bg-indigo-600 px-2 py-1.5 text-center text-[10px] font-semibold text-white transition hover:bg-indigo-500"
                      >
                        Edit
                      </Link>

                      <Link
                        href={`/student/${assessment.assessment_code}?preview=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-center text-[10px] font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        Preview
                      </Link>

                      <Link
                        href={`/teacher/assessments/${assessment.id}/results`}
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-center text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        Results
                      </Link>

                      <button
                        onClick={() => deleteAssessment(assessment)}
                        aria-label={`Delete ${assessment.title}`}
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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
