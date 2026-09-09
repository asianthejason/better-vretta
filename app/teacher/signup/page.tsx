"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { isTeacherPlan, TEACHER_PLANS, type TeacherPlan } from "@/lib/teacherPlans";
import TeacherPrice from "@/app/login/TeacherPrice";
import TeacherPayment from "./TeacherPayment";
import { payTeacherPlan } from "@/app/login/SignupCard";

export default function TeacherSignup() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<TeacherPlan>("basic");
  const [coupon, setCoupon] = useState("");
  const [amount, setAmount] = useState(6000);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const automaticPaymentStarted = useRef(false);

  async function request(path: string, body: object) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.replace("/login?teacher=1"); return null; }
    const response = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to finish signup.");
    return data;
  }

  function finish() {
    window.localStorage.removeItem("jretta_pending_role");
    window.sessionStorage.removeItem("jretta_teacher_coupon");
    window.sessionStorage.removeItem("jretta_teacher_payment_method");
    window.location.replace("/teacher");
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.replace("/login?teacher=1"); return; }
        const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (profileError) throw new Error("Unable to load your account. Please refresh to retry.");
        if (profile?.role === "teacher") {
          const { data: status } = await supabase.rpc("teacher_plan_status");
          if (status?.active) finish();
          else window.location.replace("/teacher/billing");
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const checkoutId = params.get("session_id");
        if (active) { setSessionId(checkoutId); setCanceled(params.has("canceled")); }
        if (checkoutId) {
          if (active) setBusy(true);
          const result = await request("/api/teacher-signup/confirm", { sessionId: checkoutId });
          if (result?.activated) { finish(); return; }
        } else {
          const savedPlan = window.sessionStorage.getItem("jretta_teacher_plan");
          const selected = isTeacherPlan(savedPlan) ? savedPlan : "basic";
          let quotedAmount: number = TEACHER_PLANS[selected].annualAmount;
          let quotedPlan: TeacherPlan = selected;
          if (active) { setPlan(selected); setAmount(quotedAmount); }
          const saved = window.sessionStorage.getItem("jretta_teacher_coupon") || "";
          if (saved) {
            const response = await fetch("/api/teacher-signup/quote", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ couponCode: saved, plan: selected }),
            });
            const quote = await response.json();
            if (response.ok) {
              quotedAmount = quote.amount;
              quotedPlan = quote.plan;
              if (active) { setCoupon(saved); setAmount(quote.amount); setPlan(quote.plan); }
            }
          }
          const savedPaymentMethod = window.sessionStorage.getItem("jretta_teacher_payment_method");
          if (!automaticPaymentStarted.current && ((savedPaymentMethod && quotedAmount > 0) || quotedAmount === 0)) {
            automaticPaymentStarted.current = true;
            if (active) setBusy(true);
            if (quotedAmount === 0) {
              const result = await request("/api/teacher-signup/checkout", { couponCode: saved, plan: quotedPlan });
              if (result?.activated) { finish(); return; }
            } else {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) throw new Error("Your Google sign-in expired. Please sign in again.");
              await payTeacherPlan(savedPaymentMethod!, { token: session.access_token }, quotedPlan);
              finish();
              return;
            }
          }
        }
      } catch (error) {
        window.sessionStorage.removeItem("jretta_teacher_payment_method");
        if (active) setError(error instanceof Error ? error.message : "Unable to finish signup.");
      }
      finally { if (active) { setReady(true); setBusy(false); } }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function submit() {
    setBusy(true); setError("");
    try {
      const result = await request(sessionId ? "/api/teacher-signup/confirm" : "/api/teacher-signup/checkout",
        sessionId ? { sessionId } : { couponCode: coupon, plan });
      if (result?.activated) finish();

    } catch (error) { setError(error instanceof Error ? error.message : "Unable to finish signup."); }
    finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-slate-900">
    <div className="w-full max-w-2xl">
      <Link href="/" className="flex items-center gap-3 font-bold tracking-tight"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">J</span>Jretta</Link>
      <h1 className="mt-12 text-4xl font-bold tracking-tight">Create your teacher account.</h1>
      <p className="mt-3 leading-7 text-slate-500">{sessionId ? "Confirming your payment and finishing your teacher account." : "Step 2 of 2 — payment. Enter your card details below to finish signup, or apply a coupon."}</p>
      <div className="mt-8 space-y-5 rounded-2xl border border-slate-200 p-6 shadow-sm">
        {!ready ? <p role="status">Checking your account…</p> : <>
          {canceled && <p role="status" className="text-sm text-slate-600">Checkout canceled. You can try again or apply a coupon below.</p>}
          {!sessionId && <TeacherPrice key={ready ? "ready" : "loading"} coupon={coupon} amount={amount} plan={plan} onChange={(code, total, selected) => {
            setCoupon(code); setAmount(total); setPlan(selected); window.sessionStorage.setItem("jretta_teacher_plan", selected); window.sessionStorage.setItem("jretta_teacher_coupon", code);
          }} />}
          {!sessionId && amount > 0 && <TeacherPayment key={plan} plan={plan} />}
          {(sessionId || amount === 0) && <button type="button" disabled={busy} onClick={() => void submit()} className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Please wait…" : sessionId ? "Retry payment confirmation" : amount === 0 ? "Create teacher account — free" : `Pay $${amount / 100} CAD & subscribe yearly`}
          </button>}
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
      <button type="button" onClick={async () => { await supabase.auth.signOut(); window.location.replace("/login"); }} className="mt-5 text-sm text-slate-500 hover:text-slate-900">Sign out</button>
    </div>
  </main>;
}
