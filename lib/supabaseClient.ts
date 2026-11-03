import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

/** Read Supabase's persisted token without initiating a network session refresh. */
export function getCachedAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(authStorageKey);
    if (!stored) return null;
    const session = JSON.parse(stored) as { access_token?: unknown };
    return typeof session.access_token === "string" ? session.access_token : null;
  } catch {
    return null;
  }
}
