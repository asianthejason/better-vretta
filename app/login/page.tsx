"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Account created. Check your email if confirmation is required.");
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

    window.location.href = "/teacher";
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-md">
        <a href="/" className="text-sm text-blue-300 hover:underline">
          ← Back home
        </a>

        <h1 className="mt-8 text-4xl font-bold">Teacher Login</h1>

        <p className="mt-4 text-slate-300">
          Teachers can create an account to build and manage assessments.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <label className="text-sm text-slate-300">Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="teacher@example.com"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300">Password</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Enter a password"
            />
          </div>

          <button
            onClick={signIn}
            className="w-full rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-400"
          >
            Log In
          </button>

          <button
            onClick={signUp}
            className="w-full rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800"
          >
            Create Teacher Account
          </button>
        </div>
      </div>
    </main>
  );
}