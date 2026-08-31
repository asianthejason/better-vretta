"use client";

import { useState } from "react";
import Link from "next/link";

export default function StudentCodePage() {
  const [code, setCode] = useState("");

  function openAssessment() {
    if (!code.trim()) {
      alert("Please enter an assessment code.");
      return;
    }

    window.location.href = `/student/${code.trim().toUpperCase()}`;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-slate-900">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">J</span>
          Jretta
        </Link>

        <p className="mt-12 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Student access</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Join your assessment</h1>

        <p className="mt-3 leading-7 text-slate-500">
          Ask your teacher for the assessment code, then enter it below.
        </p>

        <div className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div>
            <label className="text-sm font-semibold text-slate-700">Assessment Code</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center text-xl font-bold uppercase tracking-[0.3em] text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Example: V8NUKJ"
            />
          </div>

          <button
            onClick={openAssessment}
            className="w-full rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
          >
            Open Assessment
          </button>
        </div>
      </div>
    </main>
  );
}
