"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"teacher" | "student">("student");

  useEffect(() => {
    let redirecting = false;
    let roleErrorShown = false;

    async function finishAuthentication(user: { id: string } | null) {
      if (!user) return;
      if (redirecting) return;
      const pendingRole = window.localStorage.getItem("jretta_pending_role");
      if (pendingRole === "teacher" || pendingRole === "student") {
        const { error } = await supabase.from("profiles").update({ role: pendingRole }).eq("id", user.id);
        if (error) {
          if (!roleErrorShown) {
            roleErrorShown = true;
            alert(`Google login completed, but the account role could not be saved: ${error.message}`);
          }
          return;
        }
        window.localStorage.removeItem("jretta_pending_role");
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role) {
        redirecting = true;
        window.location.replace(profile.role === "teacher" ? "/teacher" : "/student/dashboard");
      }
    }

    supabase.auth.getSession().then(({ data }) => finishAuthentication(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => finishAuthentication(session?.user || null), 0);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Account created. Check your email if confirmation is required.");
  }

  async function continueWithGoogle() {
    if (mode === "signup") window.localStorage.setItem("jretta_pending_role", role);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) alert(error.message);
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("role").single();
    window.location.href = profile?.role === "teacher" ? "/teacher" : "/student/dashboard";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-slate-900">
      <div className="w-full max-w-md">
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
            <button type="button" onClick={() => setMode("login")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${mode === "login" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>Log in</button>
            <button type="button" onClick={() => setMode("signup")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${mode === "signup" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>Sign up</button>
          </div>
          {mode === "signup" && <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-1">
            {(["student", "teacher"] as const).map((accountRole) => <button key={accountRole} type="button" onClick={() => setRole(accountRole)} className={`rounded-lg px-3 py-2.5 text-sm font-semibold capitalize ${role === accountRole ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{accountRole}</button>)}
          </div>}
          <div>
            <label className="text-sm font-semibold text-slate-700">Email</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="teacher@example.com"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Password</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Enter a password"
            />
          </div>

          <button
            onClick={mode === "login" ? signIn : signUp}
            className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
          >
            {mode === "login" ? "Log In" : `Create ${role === "teacher" ? "Teacher" : "Student"} Account`}
          </button>

          <div className="flex items-center gap-3"><span className="h-px flex-1 bg-slate-200"/><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">or</span><span className="h-px flex-1 bg-slate-200"/></div>
          <button onClick={continueWithGoogle} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-bold text-blue-600 shadow ring-1 ring-slate-200">G</span>
            {mode === "login" ? "Continue with Google" : `Sign up with Google as ${role}`}
          </button>
        </div>
      </div>
    </main>
  );
}
