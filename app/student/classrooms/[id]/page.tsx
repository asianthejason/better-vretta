"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { requireAccountRole } from "@/lib/roleGuard";
import { type StudentAssessmentAccess, type StudentAssignment, visibleStudentAssignments } from "@/lib/studentClassrooms";
import { supabase } from "@/lib/supabaseClient";

type Classroom = { id: string; name: string };

export default function StudentClassroomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    async function load() {
      const user = await requireAccountRole("student");
      if (!user) return;
      const { data: membership, error: membershipError } = await supabase.from("classroom_students").select("classroom_id").eq("classroom_id", id).eq("student_id", user.id).maybeSingle();
      if (membershipError || !membership) {
        setUnavailable(true);
        setLoading(false);
        return;
      }

      const [classroomResult, assignmentResult, accessResult] = await Promise.all([
        supabase.from("classrooms").select("id,name").eq("id", id).single(),
        supabase.from("classroom_assessments").select("classroom_id,assessment_id,allow_all_students,assessments(title,description,is_published)").eq("classroom_id", id),
        supabase.from("assessment_student_access").select("classroom_id,assessment_id,allowed").eq("classroom_id", id).eq("student_id", user.id),
      ]);
      const error = classroomResult.error || assignmentResult.error || accessResult.error;
      if (error || !classroomResult.data) setUnavailable(true);
      else {
        setClassroom(classroomResult.data as Classroom);
        setAssignments(visibleStudentAssignments((assignmentResult.data || []) as unknown as StudentAssignment[], (accessResult.data || []) as StudentAssessmentAccess[]));
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return <main className="min-h-screen bg-white text-slate-900">
    <header className="border-b border-slate-200"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <Link href="/" className="flex items-center gap-3 font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">J</span>Jretta</Link>
      <div className="flex items-center gap-2"><Link href="/student/dashboard" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Student Dashboard</Link><Link href="/profile" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Profile</Link><button onClick={() => void signOut()} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Sign out</button></div>
    </div></header>

    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/student/dashboard" className="text-sm font-semibold text-blue-700 hover:text-blue-800">← All classrooms</Link>
      {loading ? <p className="mt-10 text-slate-500">Loading classroom…</p> : unavailable || !classroom ? <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center"><h1 className="text-2xl font-bold">Classroom unavailable</h1><p className="mt-2 text-slate-500">This classroom does not exist or you are not enrolled in it.</p></div> : <>
        <p className="mt-10 text-sm font-semibold uppercase tracking-widest text-blue-600">Your classroom</p><h1 className="mt-2 text-4xl font-bold">{classroom.name}</h1><p className="mt-3 text-slate-500">Assessments your teacher has assigned to you appear below.</p>
        {assignments.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">There are no assessments for you in this classroom yet.</div> : <div className="mt-8 grid gap-4 md:grid-cols-2">
          {assignments.map((assignment) => assignment.assessments && <article key={assignment.assessment_id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">{assignment.assessments.title}</h2>{assignment.assessments.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{assignment.assessments.description}</p>}<Link href={`/student/${assignment.assessment_id}`} className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Open assessment</Link></article>)}
        </div>}
      </>}
    </div>
  </main>;
}
