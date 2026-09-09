"use client";

import Link from "next/link";
import { useEffect } from "react";
import { clearPendingSignup } from "@/lib/pendingSignup";
import { supabase } from "@/lib/supabaseClient";

const lockMessage = "Verify your email to unlock this feature.";

function LockedButton({ children }: { children: React.ReactNode }) {
  return <span className="group relative inline-flex" tabIndex={0} aria-label={`${children}. ${lockMessage}`}>
    <button type="button" disabled className="cursor-not-allowed rounded-xl bg-slate-200 px-5 py-3 font-semibold text-slate-500">🔒 {children}</button>
    <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-52 -translate-x-1/2 rounded-lg bg-slate-950 px-3 py-2 text-center text-xs font-medium text-white shadow-lg group-hover:block group-focus:block">{lockMessage}</span>
  </span>;
}

export default function LockedDashboard({ role, email }: { role: "teacher" | "student"; email: string }) {
  const teacher = role === "teacher";

  useEffect(() => {
    let refreshing = false;
    const unlockIfVerified = async () => {
      const { data } = await supabase.auth.getUser();
      if (!refreshing && data.user?.email_confirmed_at) {
        refreshing = true;
        clearPendingSignup();
        window.location.replace(teacher ? "/teacher" : "/student/dashboard");
      }
    };

    void unlockIfVerified();
    const timer = window.setInterval(unlockIfVerified, 3000);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!refreshing && session?.user.email_confirmed_at) {
        refreshing = true;
        clearPendingSignup();
        window.location.replace(teacher ? "/teacher" : "/student/dashboard");
      }
    });

    return () => {
      window.clearInterval(timer);
      listener.subscription.unsubscribe();
    };
  }, [teacher]);

  function useAnotherAccount() {
    clearPendingSignup();
    window.location.replace("/login");
  }

  return <main className="min-h-screen bg-white text-slate-900">
    <nav className="border-b border-slate-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3 font-bold"><span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white">J</span>Jretta</Link>
        <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{teacher ? "Teacher Dashboard" : "Student Dashboard"}</span>
      </div>
    </nav>
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">{teacher ? "Teacher workspace" : "Student workspace"}</p>
      <h1 className="mt-2 text-4xl font-bold">{teacher ? "Teacher Dashboard" : "Your assessments"}</h1>
      <p className="mt-3 text-slate-500">Your account is ready. Verify your email to start using it.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {teacher ? <><LockedButton>Create Assessment</LockedButton><LockedButton>Create Classroom</LockedButton><LockedButton>Manage Students</LockedButton></> : <><LockedButton>Join Classroom</LockedButton><LockedButton>Open Assessment</LockedButton></>}
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {[teacher ? "Your classrooms will appear here" : "Your assigned assessments will appear here", teacher ? "Your assessments will appear here" : "Join a classroom after verification"].map(text => <div key={text} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-400"><span className="mb-3 block text-2xl">🔒</span>{text}</div>)}
      </div>
    </div>
    <aside role="dialog" aria-modal="false" aria-labelledby="verify-title" className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-sm rounded-2xl border border-blue-200 bg-white p-5 shadow-2xl shadow-slate-300/60">
      <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 text-lg">✉️</span><div><h2 id="verify-title" className="font-bold">Verify your email to unlock features</h2><p className="mt-1 text-sm leading-6 text-slate-600">We sent a verification link to <strong className="text-slate-800">{email}</strong>. Open it, then return here. This dashboard will unlock automatically.</p><button type="button" onClick={useAnotherAccount} className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-800">Use another account</button></div></div>
    </aside>
  </main>;
}
