"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  email: string;
  full_name: string;
  role: "teacher" | "student";
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("email,full_name,role")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      alert(error?.message || "Profile not found.");
      return;
    }

    setProfile(data as Profile);
    setName(data.full_name || "");
  }

  async function saveProfile() {
    const nextName = name.trim();
    if (!nextName || !profile) return;

    setSaving(true);
    setSaved(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.replace("/login");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: nextName })
      .eq("id", user.id);

    if (error) {
      alert(error.message);
      setSaving(false);
      return;
    }

    setProfile({ ...profile, full_name: nextName });
    setName(nextName);
    setSaving(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <nav className="border-b border-slate-200 bg-white" aria-label="Global navigation">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              J
            </span>
            Jretta
          </Link>
          <div className="flex items-center gap-2">
            {profile?.role === "teacher" && (
              <>
                <Link
                  href="/teacher"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                >
                  Dashboard
                </Link>
                <Link
                  href="/teacher/classrooms"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                >
                  Classrooms
                </Link>
              </>
            )}
            {profile?.role === "student" && (
              <Link
                href="/student/dashboard"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/profile"
              aria-current="page"
              className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
        <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Account settings</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Your profile</h1>
        <p className="mt-3 text-slate-600">Update the name other people see in Jretta.</p>

        {!profile ? (
          <div className="mt-8 rounded-2xl border border-slate-200 p-8 text-sm text-slate-600">Loading profile…</div>
        ) : (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <label htmlFor="profile-name" className="block text-sm font-bold text-slate-800">
              Display name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              onKeyDown={(event) => event.key === "Enter" && void saveProfile()}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <label htmlFor="profile-email" className="mt-6 block text-sm font-bold text-slate-800">
              Email address
            </label>
            <input
              id="profile-email"
              value={profile.email}
              readOnly
              aria-readonly="true"
              className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-600 outline-none"
            />
            <p className="mt-2 text-xs font-medium text-slate-500">Email addresses cannot be changed.</p>

            <div className="mt-7 flex items-center gap-3 border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={!name.trim() || saving || name.trim() === profile.full_name}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saved && <span className="text-sm font-bold text-emerald-700">Saved!</span>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
