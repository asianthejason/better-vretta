export type PendingSignup = {
  role: "teacher" | "student";
  email: string;
  userId?: string;
  nonce?: string;
};

const KEY = "jretta_pending_signup";

export function savePendingSignup(value: PendingSignup) {
  window.localStorage.setItem(KEY, JSON.stringify(value));
  window.localStorage.setItem("jretta_pending_role", value.role);
}

export function readPendingSignup(): PendingSignup | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (!value || (value.role !== "teacher" && value.role !== "student") || typeof value.email !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export function clearPendingSignup() {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem("jretta_pending_role");
}
