import "server-only";
import { isTeacherPlan, TEACHER_PLANS } from "./teacherPlans";
export const TEACHER_CURRENCY = "cad";

export function teacherQuote(code: unknown, plan: unknown = "basic") {
  if (!isTeacherPlan(plan)) throw new Error("Choose a valid plan.");
  if (typeof code !== "string" || code.length > 100) throw new Error("Invalid coupon code.");
  const normalized = code.trim().toLowerCase();
  const expected = (process.env.TEACHER_SIGNUP_COUPON || "webberteam").trim().toLowerCase();
  if (normalized && normalized !== expected) throw new Error("That coupon code is not valid.");
  const selected = normalized ? "unlimited" : plan;
  return { amount: normalized ? 0 : TEACHER_PLANS[selected].annualAmount, currency: TEACHER_CURRENCY, plan: selected };
}

export function isPaidTeacherSession(session: {
  status: string | null; payment_status: string; mode: string;
  amount_total: number | null; currency: string | null;
  client_reference_id: string | null; metadata: Record<string, string> | null;
}) {
  const plan = session.metadata?.plan;
  const correctPrice = session.mode === "subscription" && isTeacherPlan(plan)
    && session.amount_total === TEACHER_PLANS[plan].annualAmount;
  // Honor already-issued $40 one-time sessions, without selling new ones.
  const legacy = session.mode === "payment" && !plan && session.amount_total === 4000;
  return session.status === "complete" && session.payment_status === "paid"
    && (correctPrice || legacy) && session.currency === TEACHER_CURRENCY
    && session.metadata?.purpose === "teacher_signup" && !!session.client_reference_id
    && session.metadata?.user_id === session.client_reference_id;
}
