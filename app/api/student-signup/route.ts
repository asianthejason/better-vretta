import { createHash } from "node:crypto";
import { adminClient } from "@/lib/teacherBilling";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimitKey(request: Request, email: string) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  return createHash("sha256").update(`${address}:${email}`).digest("hex");
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 6 || password.length > 128) {
      return Response.json({ error: "Enter a password with 6 to 128 characters." }, { status: 400 });
    }
    if (isRateLimited(rateLimitKey(request, email))) {
      return Response.json({ error: "Too many signup attempts. Please wait a few minutes and try again." }, { status: 429 });
    }

    const { data, error } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "student", signup_intent: "student" },
    });
    if (error || !data.user) {
      const duplicate = error?.status === 422 || /already|registered|exists/i.test(error?.message || "");
      return Response.json({
        error: duplicate
          ? "An account may already exist for this email. Try logging in instead."
          : "Unable to create your student account. Please try again.",
      }, { status: duplicate ? 409 : 503 });
    }

    return Response.json({ created: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Student signup is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
