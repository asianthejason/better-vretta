import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-950">
    <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 sm:p-12">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">404</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight">Page not found</h1>
      <p className="mt-3 leading-7 text-slate-600">This link may be outdated, or the page may have moved.</p>
      <Link href="/" className="mt-7 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700">Return home</Link>
    </section>
  </main>;
}
