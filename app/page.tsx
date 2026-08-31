"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const features = [
  ["Flexible assessments", "Build polished multiple-choice questions with text, images, tables, and split-screen layouts."],
  ["Classroom control", "Create classroom rosters, assign assessments, and decide exactly which students can access each exam."],
  ["Focused testing", "Students sign in to complete assigned assessments in a clear, distraction-free testing experience."],
];

export default function Home() {
  const [accountRole, setAccountRole] = useState<"teacher" | "student" | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    async function loadSessionRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSessionLoaded(true);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role === "teacher" || profile?.role === "student") setAccountRole(profile.role);
      setSessionLoaded(true);
    }
    loadSessionRole();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setAccountRole(null);
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-900">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">J</span>
          Jretta
        </Link>
        <div className="flex items-center gap-2">
          {accountRole ? (
            <>
              <Link
                href={accountRole === "teacher" ? "/teacher" : "/student/dashboard"}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Open dashboard
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                Sign out
              </button>
            </>
          ) : sessionLoaded ? (
            <Link
              href="/login"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Login / Sign up
            </Link>
          ) : null}
        </div>
      </nav>

      <section className="relative mx-auto max-w-7xl px-6 pb-24 pt-16 lg:px-8 lg:pb-32 lg:pt-24">
        <div className="absolute left-1/2 top-16 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-100/70 blur-3xl" />
        <div className="mx-auto max-w-4xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Classrooms and assessments, together
          </p>
          <h1 className="mt-7 text-5xl font-bold tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-7xl">
            Teach with clarity.<span className="block text-blue-600">Assess with confidence.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            Jretta gives teachers one place to create rich assessments, manage classrooms, assign exams, and control student access.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-xl shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700 sm:w-auto">
              Create an account <span aria-hidden="true">→</span>
            </Link>
            {accountRole === "student" && <Link href="/student/dashboard" className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 sm:w-auto">View student assignments</Link>}
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-5xl gap-4 md:grid-cols-3">
          {features.map(([title, description], index) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">0{index + 1}</span>
              <h2 className="mt-5 font-bold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 md:grid-cols-2">
          <div className="border-b border-slate-200 p-8 md:border-b-0 md:border-r lg:p-10">
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">For teachers</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">Your entire assessment workflow</h2>
            <p className="mt-3 leading-7 text-slate-600">Create questions, organize students into classrooms, assign exams, control access, and review results.</p>
            <Link href={accountRole === "teacher" ? "/teacher" : "/login"} className="mt-6 inline-flex items-center gap-2 font-semibold text-blue-700 hover:text-blue-800">{accountRole === "teacher" ? "Open teacher workspace" : "Teacher login"} <span aria-hidden="true">→</span></Link>
          </div>
          <div className="p-8 lg:p-10">
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">For students</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">Every assignment in one place</h2>
            <p className="mt-3 leading-7 text-slate-600">Sign in to see assessments assigned by your teachers and complete them with Jretta’s accessible testing tools.</p>
            <Link href={accountRole === "student" ? "/student/dashboard" : "/login"} className="mt-6 inline-flex items-center gap-2 font-semibold text-indigo-700 hover:text-indigo-800">{accountRole === "student" ? "Open student workspace" : "Student login"} <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
