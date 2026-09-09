"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LockedDashboard from "@/app/components/LockedDashboard";
import { readPendingSignup } from "@/lib/pendingSignup";
import { requireAccountRole } from "@/lib/roleGuard";
import { type StudentAssessmentAccess, type StudentAssignment, visibleStudentAssignments } from "@/lib/studentClassrooms";
import { supabase } from "@/lib/supabaseClient";

type Classroom = { id: string; name: string; created_at: string };

export default function StudentDashboard() {
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [classroomCode, setClassroomCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    const pending = readPendingSignup();
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    if (!sessionUser && pending?.role === "student") {
      setLockedEmail(pending.email);
      setLoading(false);
      return;
    }
    const user = await requireAccountRole("student");
    if (!user) return;

    setAssignments([]);
    setClassrooms([]);
    const { data: memberships, error: membershipError } = await supabase.from("classroom_students").select("classroom_id").eq("student_id", user.id);
    if (membershipError) {
      alert(membershipError.message);
      setLoading(false);
      return;
    }
    const classroomIds = memberships?.map((item) => item.classroom_id) || [];
    if (!classroomIds.length) {
      setLoading(false);
      return;
    }

    const [classroomResult, assignmentResult, accessResult] = await Promise.all([
      supabase.from("classrooms").select("id,name,created_at").in("id", classroomIds).order("created_at", { ascending: true }),
      supabase.from("classroom_assessments").select("classroom_id,assessment_id,allow_all_students,assessments(title,description,assessment_code,is_published)").in("classroom_id", classroomIds),
      supabase.from("assessment_student_access").select("classroom_id,assessment_id,allowed").eq("student_id", user.id).in("classroom_id", classroomIds),
    ]);
    const error = classroomResult.error || assignmentResult.error || accessResult.error;
    if (error) alert(error.message);
    else {
      setClassrooms((classroomResult.data || []) as Classroom[]);
      setAssignments(visibleStudentAssignments(
        (assignmentResult.data || []) as unknown as StudentAssignment[],
        (accessResult.data || []) as StudentAssessmentAccess[],
      ));
    }
    setLoading(false);
  }

  async function joinClassroom() {
    if (!classroomCode.trim()) return;
    setJoining(true);
    const { error } = await supabase.rpc("join_classroom_by_code", { classroom_code: classroomCode.trim().toUpperCase() });
    if (error) alert(error.message);
    else {
      setClassroomCode("");
      await load();
    }
    setJoining(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (lockedEmail) return <LockedDashboard role="student" email={lockedEmail} />;

  return <main className="min-h-screen bg-white text-slate-900">
    <header className="border-b border-slate-200"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <Link href="/" className="flex items-center gap-3 font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">J</span>Jretta</Link>
      <div className="flex items-center gap-2"><Link href="/student/dashboard" aria-current="page" className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">Student Dashboard</Link><Link href="/profile" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Profile</Link><button onClick={() => void signOut()} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Sign out</button></div>
    </div></header>

    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Student workspace</p>
      <h1 className="mt-2 text-4xl font-bold">Your classrooms</h1>
      <p className="mt-3 text-slate-500">Open a classroom to find the assessments assigned to you.</p>

      <div className="mt-7 flex max-w-xl flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1"><span className="text-sm font-bold text-slate-800">Join a classroom</span><input value={classroomCode} onChange={(event) => setClassroomCode(event.target.value.toUpperCase())} onKeyDown={(event) => event.key === "Enter" && void joinClassroom()} placeholder="Enter classroom code" maxLength={8} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm font-bold uppercase tracking-widest text-slate-950 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
        <button type="button" onClick={() => void joinClassroom()} disabled={!classroomCode.trim() || joining} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{joining ? "Joining…" : "Join classroom"}</button>
      </div>

      {loading ? <p className="mt-10 text-slate-500">Loading classrooms…</p> : classrooms.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">You have not joined a classroom yet. Enter a classroom code above to get started.</div> : <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {classrooms.map((classroom) => {
          const count = assignments.filter((assignment) => assignment.classroom_id === classroom.id).length;
          return <Link key={classroom.id} href={`/student/classrooms/${classroom.id}`} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl bg-blue-100 text-xl">🏫</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{count} {count === 1 ? "assessment" : "assessments"}</span></div>
            <h2 className="mt-5 text-xl font-bold text-slate-950 group-hover:text-blue-700">{classroom.name}</h2><p className="mt-2 text-sm font-semibold text-blue-700">Open classroom →</p>
          </Link>;
        })}
      </div>}

      {!loading && classrooms.length > 0 && <section className="mt-14 border-t border-slate-200 pt-10">
        <h2 className="text-2xl font-bold">All assigned assessments</h2><p className="mt-2 text-sm text-slate-500">Everything currently available to you across your classrooms.</p>
        {assignments.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">No assessments have been assigned to you yet.</div> : <div className="mt-6 grid gap-4 md:grid-cols-2">
          {assignments.map((assignment) => assignment.assessments && <div key={`${assignment.classroom_id}-${assignment.assessment_id}`} className="rounded-2xl border border-slate-200 p-6 shadow-sm"><h3 className="text-xl font-bold">{assignment.assessments.title}</h3>{assignment.assessments.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{assignment.assessments.description}</p>}<Link href={`/student/${assignment.assessments.assessment_code}`} className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Open assessment</Link></div>)}
        </div>}
      </section>}
    </div>
  </main>;
}
