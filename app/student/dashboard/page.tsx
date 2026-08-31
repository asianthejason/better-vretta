"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { requireAccountRole } from "@/lib/roleGuard";

type Assignment = { assessment_id: string; allow_all_students: boolean; classroom_id: string; assessments: { title: string; description: string | null; assessment_code: string; is_published: boolean } | null };

export default function StudentDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [classroomCode, setClassroomCode] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const user = await requireAccountRole("student");
    if (!user) return;
    setAssignments([]);
    const { data: memberships } = await supabase.from("classroom_students").select("classroom_id").eq("student_id", user.id);
    const classroomIds = memberships?.map((item) => item.classroom_id) || [];
    if (!classroomIds.length) { setLoading(false); return; }
    const { data, error } = await supabase.from("classroom_assessments").select("classroom_id,assessment_id,allow_all_students,assessments(title,description,assessment_code,is_published)").in("classroom_id", classroomIds);
    if (error) alert(error.message); else setAssignments((data || []) as unknown as Assignment[]);
    setLoading(false);
  }
  async function joinClassroom() {
    if (!classroomCode.trim()) return;
    setJoining(true);
    const { error } = await supabase.rpc("join_classroom_by_code", {
      classroom_code: classroomCode.trim().toUpperCase(),
    });
    if (error) {
      alert(error.message);
      setJoining(false);
      return;
    }
    setClassroomCode("");
    await load();
    setJoining(false);
  }
  async function signOut() { await supabase.auth.signOut(); window.location.href = "/"; }

  return <main className="min-h-screen bg-white text-slate-900">
    <header className="border-b border-slate-200"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"><Link href="/" className="flex items-center gap-3 font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">J</span>Jretta</Link><div className="flex items-center gap-2"><Link href="/student/dashboard" aria-current="page" className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">Dashboard</Link><Link href="/profile" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Profile</Link><button onClick={signOut} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Sign out</button></div></div></header>
    <div className="mx-auto max-w-6xl px-6 py-12"><p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Student workspace</p><h1 className="mt-2 text-4xl font-bold">Your assessments</h1><p className="mt-3 text-slate-500">Assessments assigned to your classrooms appear here.</p>
      <div className="mt-7 flex max-w-xl flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="text-sm font-bold text-slate-800">Join a classroom</span>
          <input
            value={classroomCode}
            onChange={(event) => setClassroomCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => event.key === "Enter" && void joinClassroom()}
            placeholder="Enter classroom code"
            maxLength={8}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm font-bold uppercase tracking-widest text-slate-950 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void joinClassroom()}
          disabled={!classroomCode.trim() || joining}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {joining ? "Joining…" : "Join classroom"}
        </button>
      </div>
      {loading ? <p className="mt-10 text-slate-500">Loading assignments…</p> : assignments.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">No assessments have been assigned to you yet.</div> : <div className="mt-8 grid gap-4 md:grid-cols-2">{assignments.map((assignment) => assignment.assessments && <div key={`${assignment.classroom_id}-${assignment.assessment_id}`} className="rounded-2xl border border-slate-200 p-6 shadow-sm"><h2 className="text-xl font-bold">{assignment.assessments.title}</h2>{assignment.assessments.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{assignment.assessments.description}</p>}<Link href={`/student/${assignment.assessments.assessment_code}`} className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Open assessment</Link></div>)}</div>}
    </div>
  </main>;
}
