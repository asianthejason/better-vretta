"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error("Cloneretta page error", error);
  }, [error]);

  return <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-950">
    <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 sm:p-12">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-100 text-2xl" aria-hidden="true">!</span>
      <h1 className="mt-5 text-3xl font-black tracking-tight">Something went wrong</h1>
      <p className="mt-3 leading-7 text-slate-600">Your work may still be saved. Try loading this page again, or return to the home page.</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => unstable_retry()} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700">Try again</button>
        <Link href="/" className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50">Go home</Link>
      </div>
    </section>
  </main>;
}
