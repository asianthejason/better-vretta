import "server-only";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { isTeacherPlan, TEACHER_PLANS, type TeacherPlan } from "@/lib/teacherPlans";
import { isPaidTeacherSession } from "@/lib/teacherPricing";

export class BillingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new BillingError("Teacher signup is not configured yet. Please try again later.", 503);
  return value;
}

export function adminClient() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), process.env.SUPABASE_SECRET_KEY || required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    // ws is Supabase's supported Node 20 transport; its event types differ
    // from the browser-shaped interface used by Realtime's declarations.
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  });
}

export function stripeClient() { return new Stripe(required("STRIPE_SECRET_KEY")); }
export function webhookSecret() { return required("STRIPE_WEBHOOK_SECRET"); }
export function appUrl() {
  const url = new URL(required("APP_URL"));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new BillingError("Invalid application URL configuration.", 503);
  }
  return url.origin;
}

export async function authenticatedAccount(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const admin = adminClient();
  let user;
  if (token) {
    const result = await admin.auth.getUser(token);
    if (result.error || !result.data.user) throw new BillingError("Please sign in again to continue.", 401);
    user = result.data.user;
  } else {
    const userId = request.headers.get("x-signup-user-id");
    const nonce = request.headers.get("x-signup-nonce");
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || !nonce || nonce.length > 100) throw new BillingError("Please sign in to continue.", 401);
    const result = await admin.auth.admin.getUserById(userId);
    if (result.error || !result.data.user || result.data.user.user_metadata?.signup_nonce !== nonce
      || result.data.user.user_metadata?.signup_intent !== "teacher") {
      throw new BillingError("Teacher signup could not be verified.", 401);
    }
    const created = new Date(result.data.user.created_at).getTime();
    if (!Number.isFinite(created) || Date.now() - created > 2 * 60 * 60 * 1000) throw new BillingError("Teacher signup expired. Please sign in to continue.", 401);
    user = result.data.user;
  }
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profileError || !profile) throw new BillingError("Your account profile could not be loaded.", 503);
  // Also fail closed before accepting money if the required migration is missing.
  const { data: entitlement, error: migrationError } = await admin.from("teacher_entitlements").select("user_id,plan,stripe_subscription_id,subscription_status,access_until").eq("user_id", user.id).maybeSingle();
  if (migrationError) throw new BillingError("Teacher signup is not configured yet. Please try again later.", 503);
  const active = !!entitlement && (!entitlement.stripe_subscription_id || (["active", "past_due"].includes(entitlement.subscription_status) && new Date(entitlement.access_until).getTime() > Date.now()));
  return { user, profile, active, entitlement };
}

export async function activateTeacher(userId: string, source: "stripe" | "coupon", sessionId: string | null = null) {
  const { error } = await adminClient().rpc("activate_teacher_account", {
    target_user_id: userId, entitlement_source: source, checkout_session_id: sessionId,
  });
  if (error) throw new BillingError("Your teacher account could not be activated. Please retry; you will not need to pay again.", 503);
}

export async function fulfillTeacherSession(session: Stripe.Checkout.Session, expectedUserId?: string) {
  if (expectedUserId && session.client_reference_id !== expectedUserId) throw new BillingError("This payment belongs to another account.", 403);
  if (!isPaidTeacherSession(session)) throw new BillingError("Payment has not been confirmed. Please finish checkout or try again.", 409);
  if (session.mode === "payment") {
    await activateTeacher(session.client_reference_id!, "stripe", session.id);
    return;
  }
  const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!id) throw new BillingError("Subscription could not be verified.", 409);
  const info = await subscriptionInfo(id);
  if (info.userId !== session.client_reference_id || info.plan !== session.metadata?.plan || !info.paidUntil || info.status !== "active") throw new BillingError("Your subscription payment has not been confirmed.", 409);
  await activateTeacherPlan(info.userId, "stripe", info.plan, session.id, id, info.paidUntil, info.status, info.cancelAtPeriodEnd);
  await syncTeacherSubscription(id);

}

export function billingResponse(error: unknown) {
  if (error instanceof BillingError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Teacher billing request failed", error instanceof Error ? error.name : "Unknown error");
  return Response.json({ error: "Unable to process your request. Please try again." }, { status: 500 });
}

export async function activateTeacherPlan(userId: string, source: "stripe" | "coupon", plan: TeacherPlan,
  sessionId: string | null = null, subscriptionId: string | null = null,
  paidUntil: string | null = null, status: string | null = null, cancel = false) {
  const { error } = await adminClient().rpc("activate_teacher_plan", {
    target_user_id: userId, entitlement_source: source, selected_plan: plan,
    checkout_session_id: sessionId, subscription_id: subscriptionId, paid_until: paidUntil,
    current_status: status, cancel_renewal: cancel,
  });
  if (error) throw new BillingError("Unable to activate your plan. Please retry; you will not need to pay again.", 503);
}

export async function subscriptionInfo(id: string) {
  const subscription = await stripeClient().subscriptions.retrieve(id, { expand: ["latest_invoice"] });
  const plan = subscription.metadata.plan;
  const item = subscription.items.data[0];
  if (subscription.metadata.purpose !== "teacher_signup" || !subscription.metadata.user_id || !isTeacherPlan(plan)
    || subscription.items.data.length !== 1 || item.quantity !== 1
    || item.price.currency !== "cad" || item.price.unit_amount !== TEACHER_PLANS[plan].annualAmount
    || item.price.recurring?.interval !== "year" || item.price.recurring.interval_count !== 1) {
    throw new BillingError("Invalid teacher subscription.", 409);
  }
  const invoice = subscription.latest_invoice;
  const paid = invoice && typeof invoice !== "string" && invoice.status === "paid"
    && invoice.currency === "cad" && invoice.amount_paid >= TEACHER_PLANS[plan].annualAmount;
  return { userId: subscription.metadata.user_id, plan, status: subscription.status,
    paidUntil: paid ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end, customer: subscription.customer };
}

export async function syncTeacherSubscription(id: string) {
  const info = await subscriptionInfo(id);
  const { error } = await adminClient().rpc("sync_teacher_subscription", {
    subscription_id: id, selected_plan: info.plan, current_status: info.status,
    paid_until: info.paidUntil, cancel_renewal: info.cancelAtPeriodEnd,
  });
  if (error) throw new BillingError("Unable to update subscription status.", 503);
}
