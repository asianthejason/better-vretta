"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import TeacherPrice from "./TeacherPrice";
import { type TeacherPlan } from "@/lib/teacherPlans";
import TeacherSignup from "@/app/teacher/signup/page";
import SignupCard, { type SignupCardHandle } from "./SignupCard";

export default function LoginPage() {
  const [teacherSetup, setTeacherSetup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [plan, setPlan] = useState<TeacherPlan>("basic");
  const [coupon, setCoupon] = useState("");
  const [amount, setAmount] = useState(6000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const card = useRef<SignupCardHandle>(null);
  const inlineSignup = useRef(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [identityCreated, setIdentityCreated] = useState(false);

  useEffect(() => {
    let redirecting = false;
    const teacherIntent = new URLSearchParams(window.location.search).has("teacher");
    if (teacherIntent) window.localStorage.setItem("jretta_pending_role", "teacher");

    async function finishAuthentication(user: { id: string; user_metadata?: Record<string, unknown> } | null) {
      if (!user) return;
      if (inlineSignup.current) return;
      if (redirecting) return;
      const pendingRole = window.localStorage.getItem("jretta_pending_role");
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role) {
        redirecting = true;
        if (profile.role === "teacher") {
          window.localStorage.removeItem("jretta_pending_role");
          window.location.replace("/teacher");
        } else if (pendingRole === "teacher" || user.user_metadata?.signup_intent === "teacher") {
          setTeacherSetup(true);
        } else {
          window.localStorage.removeItem("jretta_pending_role");
          window.location.replace("/student/dashboard");
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => finishAuthentication(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => finishAuthentication(session?.user || null), 0);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signUp() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage("Enter a valid email address."); return;
    }
    if (password.length < 6) { setMessage("Enter a password with at least 6 characters."); return; }
    setBusy(true); setMessage("");
    window.localStorage.setItem("jretta_pending_role", role);
    window.sessionStorage.setItem("jretta_teacher_coupon", role === "teacher" ? coupon : "");
    window.sessionStorage.setItem("jretta_teacher_plan", plan);
    try {
      if (role === "teacher" && (amount > 0 || identityCreated)) {
        inlineSignup.current = true;
        let paymentMethod: string | null = null;
        if (amount > 0) {
          if (!card.current) throw new Error("The card form is unavailable. Please reload and try again.");
          paymentMethod = await card.current.collect(email.trim());
        }
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (awaitingConfirmation) {
            const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
            if (result.error) throw new Error("Confirm your email first, then click the signup button again.");
            session = result.data.session;
          } else {
            const result = await supabase.auth.signUp({ email: email.trim(), password, options: {
              data: { role: "student", signup_intent: "teacher" },
              emailRedirectTo: `${window.location.origin}/login?teacher=1`,
            } });
            if (result.error) throw result.error;
            setIdentityCreated(true);
            session = result.data.session;
            if (!session) {
              setAwaitingConfirmation(true);
              setMessage("Check your email and confirm it in another tab, then return here and click the signup button again. You have not been charged.");
              return;
            }
          }
        }
        if (!session) throw new Error("Please confirm your email before completing signup.");
        if (paymentMethod && card.current) await card.current.pay(paymentMethod, session.access_token, plan);
        else {
          const response = await fetch("/api/teacher-signup/checkout", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ couponCode: coupon, plan }) });
          const result = await response.json();
          if (!response.ok || !result.activated) throw new Error(result.error || "Unable to activate your account.");
        }
        window.localStorage.removeItem("jretta_pending_role");
        window.sessionStorage.removeItem("jretta_teacher_coupon");
        window.location.replace("/teacher");
        return;
      }
      const { error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { role: "student", signup_intent: role },
          emailRedirectTo: `${window.location.origin}/login${role === "teacher" ? "?teacher=1" : ""}`,
        },
      });
      if (error) throw error;
      setMessage(role === "teacher"
        ? "Check your email to confirm your sign-in, then finish teacher signup. Teacher access begins after payment or a valid coupon."
        : "Account created. Check your email if confirmation is required.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create your account."); }
    finally { setBusy(false); }
  }

  async function continueWithGoogle() {
    inlineSignup.current = false;
    if (mode === "signup") {
      window.localStorage.setItem("jretta_pending_role", role);
      window.sessionStorage.setItem("jretta_teacher_coupon", role === "teacher" ? coupon : "");
    window.sessionStorage.setItem("jretta_teacher_plan", plan);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login${mode === "signup" && role === "teacher" ? "?teacher=1" : ""}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) alert(error.message);
  }

  async function signIn() {
    if (!email.trim() || !password) { setMessage("Enter your email and password."); return; }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    // The auth listener sends pending teacher signups through payment activation.
  }

  if (teacherSetup) return <TeacherSignup />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-slate-900">
      <div className="w-full max-w-2xl">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">J</span>
          Jretta
        </Link>

        <p className="mt-12 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Jretta account</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>

        <p className="mt-3 leading-7 text-slate-500">
          {mode === "login" ? "Enter your email and password to continue." : "Choose an account type, then sign up with email or Google."}
        </p>

        <div className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button type="button" disabled={busy || identityCreated} onClick={() => { inlineSignup.current = false; setMode("login"); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${mode === "login" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>Log in</button>
            <button type="button" disabled={busy || identityCreated} onClick={() => { inlineSignup.current = false; setMode("signup"); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${mode === "signup" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>Sign up</button>
          </div>
          {mode === "signup" && <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-1">
            {(["student", "teacher"] as const).map((accountRole) => <button key={accountRole} type="button" disabled={busy || identityCreated} onClick={() => { inlineSignup.current = false; setRole(accountRole); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold capitalize ${role === accountRole ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{accountRole}</button>)}
          </div>}
          {mode === "signup" && role === "teacher" && <fieldset disabled={busy}><TeacherPrice coupon={coupon} amount={amount} plan={plan} onChange={(code, total, selected) => { setCoupon(code); setAmount(total); setPlan(selected); }} /></fieldset>}
          <div>
            <label htmlFor="signup-email" className="text-sm font-semibold text-slate-700">Email</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              id="signup-email"
              disabled={busy || identityCreated}
              required
              type="email"
              placeholder="teacher@example.com"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="text-sm font-semibold text-slate-700">Password</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              id="signup-password"
              disabled={busy || identityCreated}
              required
              type="password"
              placeholder="Enter a password"
            />
          </div>

          {mode === "signup" && role === "teacher" && amount > 0 && <SignupCard key={plan} ref={card} plan={plan} />}

          <button
            onClick={mode === "login" ? signIn : signUp}
            disabled={busy}
            className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Log In" : role === "teacher" ? (amount === 0 ? "Continue with free teacher signup" : `Pay $${amount / 100} CAD & subscribe yearly`) : "Create Student Account"}
          </button>
          {message && <p role="status" className="text-sm text-slate-600">{message}</p>}

          <div className="flex items-center gap-3"><span className="h-px flex-1 bg-slate-200"/><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">or</span><span className="h-px flex-1 bg-slate-200"/></div>
          <button disabled={busy || identityCreated} onClick={continueWithGoogle} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-bold text-blue-600 shadow ring-1 ring-slate-200">G</span>
            {mode === "login" ? "Continue with Google" : `Sign up with Google as ${role}`}
          </button>
        </div>
      </div>
    </main>
  );
}
