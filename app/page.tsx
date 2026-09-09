"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Yes, this will be on the test.
          </p>
          <h1 className="mt-7 text-5xl font-bold tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-7xl">
            Digital assessments<span className="block text-blue-600">made &ldquo;easy&rdquo;.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            Make tests. Assign tests. Take tests. Jretta handles the logistics. The knowing-the-answers part is still on you.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-xl shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700 sm:w-auto">
              Create an account <span aria-hidden="true">→</span>
            </Link>
            {accountRole === "student" && <Link href="/student/dashboard" className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 sm:w-auto">View student assignments</Link>}
          </div>
          <p className="mt-4 text-sm text-slate-500">The quotation marks are doing a lot of work here.</p>
        </div>

      </section>
    </main>
  );
}
