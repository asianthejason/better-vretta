"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { TEACHER_PLANS, type TeacherPlan } from "@/lib/teacherPlans";

type Billing = { plan: TeacherPlan; active: boolean; source: string; access_until: string | null; subscription_status: string | null; cancel_at_period_end: boolean; hasSubscription: boolean };
export default function TeacherBilling() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function call(cancel?: boolean) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.replace("/login"); return null; }
    const response = await fetch("/api/teacher-billing", { method: cancel === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(cancel === undefined ? {} : { body: JSON.stringify({ cancel }) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }
  useEffect(() => { void call().then(setBilling).catch(error => setError(error.message)); }, []);
  async function toggle() {
    if (!billing) return;
    setBusy(true); setError("");
    try { await call(!billing.cancel_at_period_end); setBilling(await call()); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update renewal."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl px-6 py-16 text-slate-900">
    <Link href="/teacher" className="text-sm font-semibold text-blue-700">← Teacher Dashboard</Link>
    <h1 className="mt-8 text-3xl font-bold">Your teacher plan</h1>
    {billing ? <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 p-6">
      <h2 className="text-xl font-bold">{TEACHER_PLANS[billing.plan]?.name || "Teacher account"}</h2>
      <p>{billing.plan === "basic" ? "2 classrooms" : "Unlimited classrooms"}</p>
      {billing.hasSubscription ? <>
        <p>${TEACHER_PLANS[billing.plan].annualAmount / 100} CAD per year</p>
        <p>{billing.active ? (billing.cancel_at_period_end ? "Renewal canceled. Access continues until " : "Current paid access ends ") : "Your subscription is not active. Last paid access ended "}{billing.access_until ? new Date(billing.access_until).toLocaleDateString() : "—"}.</p>
        {!["canceled", "incomplete_expired"].includes(billing.subscription_status || "") && <button disabled={busy} onClick={() => void toggle()} className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Updating…" : billing.cancel_at_period_end ? "Resume annual renewal" : "Cancel annual renewal"}</button>}
        {!billing.active && <p className="text-sm text-slate-600">Contact the site administrator to resolve a failed payment or restart your subscription.</p>}
      </> : <p>{billing.source === "coupon" ? "Free Unlimited access. No recurring charges." : "Existing account access. No recurring charges."}</p>}
    </div> : !error && <p className="mt-6">Loading your plan…</p>}
    {error && <p role="alert" className="mt-5 text-red-700">{error}</p>}
  </main>;
}
