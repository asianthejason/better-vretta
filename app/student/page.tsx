"use client";

import { useState } from "react";

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
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-md">
        <a href="/" className="text-sm text-blue-300 hover:underline">
          ← Back home
        </a>

        <h1 className="mt-8 text-4xl font-bold">Enter Assessment Code</h1>

        <p className="mt-4 text-slate-300">
          Ask your teacher for the assessment code, then enter it below.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <label className="text-sm text-slate-300">Assessment Code</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg uppercase tracking-widest text-white"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Example: V8NUKJ"
            />
          </div>

          <button
            onClick={openAssessment}
            className="w-full rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-400"
          >
            Open Assessment
          </button>
        </div>
      </div>
    </main>
  );
}