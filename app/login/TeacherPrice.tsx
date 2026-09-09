"use client";

import { useRef, useState } from "react";
import { TEACHER_PLANS, type TeacherPlan } from "@/lib/teacherPlans";

export default function TeacherPrice({ coupon, amount, plan, onChange }: {
  coupon: string; amount: number; plan: TeacherPlan;
  onChange: (coupon: string, amount: number, plan: TeacherPlan) => void;
}) {
  const [draft, setDraft] = useState(coupon);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const beforeCoupon = useRef<TeacherPlan>(plan);
  function remove() {
    setDraft(""); setError("");
    onChange("", TEACHER_PLANS[beforeCoupon.current].annualAmount, beforeCoupon.current);
  }
  async function apply() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/teacher-signup/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponCode: draft, plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!coupon) beforeCoupon.current = plan;
      onChange(draft.trim(), data.amount, data.plan);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to apply coupon."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Teacher plans" className="space-y-5">
    <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">Choose your plan</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Billed yearly · CAD</span></div>
    <div role="radiogroup" aria-label="Annual teacher plan" className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(TEACHER_PLANS) as TeacherPlan[]).map(key => {
        const option = TEACHER_PLANS[key]; const selected = plan === key;
        return <button key={key} type="button" role="radio" aria-checked={selected} disabled={busy || !!coupon} onClick={() => onChange("", option.annualAmount, key)} className={`relative rounded-2xl border-2 p-5 text-left transition ${selected ? "border-blue-600 bg-blue-50/60 ring-4 ring-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
          <div className="flex items-center justify-between"><span className="font-bold">{option.name}</span><span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{selected ? "✓" : ""}</span></div>
          <p className="mt-4"><span className="text-3xl font-bold tracking-tight">{amount === 0 && selected ? "$0" : option.monthlyLabel}</span><span className="text-sm text-slate-500">/month</span></p>
          <p className="mt-1 text-sm font-medium text-slate-600">{amount === 0 && selected ? "Free with your coupon" : `$${option.annualAmount / 100} CAD billed yearly`}</p>
          <p className="mt-5 text-sm font-semibold text-slate-800">{option.classrooms ? "2 classrooms" : "Unlimited classrooms"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{key === "basic" ? "For a small teaching schedule." : "Room for every class you teach."}</p>
        </button>;
      })}
    </div>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      {coupon ? <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-green-700">{coupon} applied</p><p role="status" className="mt-1 text-sm text-slate-600">Unlimited selected. Free access, no card needed.</p></div><button type="button" onClick={remove} disabled={busy} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-red-700">Remove coupon</button></div> : <>
        <label htmlFor="teacher-coupon" className="text-sm font-semibold text-slate-700">Have a coupon?</label>
        <div className="mt-2 flex gap-2"><input id="teacher-coupon" aria-label="Coupon code" disabled={busy} value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} maxLength={100} autoCapitalize="none" autoCorrect="off" placeholder="Enter a code" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2"/><button type="button" onClick={() => void apply()} disabled={busy || !draft.trim()} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 ring-1 ring-slate-200 disabled:opacity-50">{busy ? "Checking…" : "Apply"}</button></div>
      </>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
    <div className="flex items-center justify-between border-t border-slate-200 pt-4"><span className="font-semibold">Due today</span><span className="text-xl font-bold">${(amount / 100).toFixed(2)} CAD</span></div>
    <p className="text-xs leading-5 text-slate-500">{amount === 0 ? "Your Unlimited plan is free. No subscription or automatic charges." : `Renews at $${amount / 100} CAD each year. Cancel renewal anytime. The monthly price is shown for comparison; you pay the annual total.`}</p>
  </section>;
}
