import { activateTeacherPlan, adminClient, authenticatedAccount, BillingError, billingResponse, fulfillTeacherSession, stripeClient } from "@/lib/teacherBilling";
import { TEACHER_PLANS } from "@/lib/teacherPlans";
import { teacherQuote } from "@/lib/teacherPricing";

export async function POST(request: Request) {
  try {
    const { user, active, entitlement } = await authenticatedAccount(request);
    if (active) return Response.json({ activated: true });
    if (entitlement?.stripe_subscription_id) throw new BillingError("Your existing subscription needs attention. Open Manage plan & renewal from your dashboard.", 409);
    let couponCode: unknown;
    let requestedUi: unknown;
    let selectedPlan: unknown;
    try { ({ couponCode = "", uiMode: requestedUi, plan: selectedPlan = "basic" } = await request.json()); } catch { throw new BillingError("Invalid signup request."); }
    const uiMode = requestedUi === "elements" ? "elements" : "embedded_page";
    let quote;
    try { quote = teacherQuote(couponCode, selectedPlan); } catch { throw new BillingError("That coupon code is not valid."); }
    const admin = adminClient();
    const { data: prior, error: priorError } = await admin.from("teacher_checkout_attempts").select("stripe_session_id, attempt_id, plan, ui_mode").eq("user_id", user.id).maybeSingle();
    if (priorError) throw new BillingError("Teacher signup is not configured yet. Please try again later.", 503);
    if (prior?.stripe_session_id) {
      const stripe = stripeClient();
      const previous = await stripe.checkout.sessions.retrieve(prior.stripe_session_id);
      if (previous.status === "complete") {
        await fulfillTeacherSession(previous, user.id);
        return Response.json({ activated: true });
      }
      if (previous.status === "open" && quote.amount > 0 && previous.metadata?.plan === quote.plan && previous.ui_mode === uiMode && previous.client_secret) {
        return Response.json({ clientSecret: previous.client_secret, sessionId: previous.id });
      }
      if (previous.status === "open") await stripe.checkout.sessions.expire(previous.id);
      const { error } = await admin.from("teacher_checkout_attempts").delete().eq("user_id", user.id).eq("attempt_id", prior.attempt_id);
      if (error) throw new BillingError("Unable to update checkout. Please retry.", 503);
    } else if (prior && quote.amount === 0) {
      throw new BillingError("A checkout is being prepared. Please retry checkout, then apply your coupon.", 409);
    }
    if (prior && !prior.stripe_session_id && (prior.plan !== quote.plan || prior.ui_mode !== uiMode)) throw new BillingError("Another checkout is being prepared. Please retry in a moment.", 409);
    if (quote.amount === 0) {
      await activateTeacherPlan(user.id, "coupon", "unlimited");
      return Response.json({ activated: true });
    }
    const stripe = stripeClient();

    const { error: attemptError } = await admin.from("teacher_checkout_attempts").upsert({ user_id: user.id, plan: quote.plan, ui_mode: uiMode }, { onConflict: "user_id", ignoreDuplicates: true });
    if (attemptError) throw new BillingError("Unable to prepare checkout. Please retry.", 503);
    const { data: attempt, error: readError } = await admin.from("teacher_checkout_attempts").select("attempt_id,plan,ui_mode").eq("user_id", user.id).single();
    if (readError || !attempt) throw new BillingError("Unable to prepare checkout. Please retry.", 503);
    if (attempt.plan !== quote.plan || attempt.ui_mode !== uiMode) throw new BillingError("Another checkout is being prepared. Please retry in a moment.", 409);
    // The persisted attempt ID survives retries and concurrent browser tabs.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", payment_method_types: ["card"], adaptive_pricing: { enabled: false },
      client_reference_id: user.id, customer_email: user.email,
      metadata: { purpose: "teacher_signup", user_id: user.id, plan: quote.plan },
      subscription_data: { metadata: { purpose: "teacher_signup", user_id: user.id, plan: quote.plan } },
      line_items: [{ quantity: 1, price_data: {
        currency: quote.currency, unit_amount: quote.amount, recurring: { interval: "year" },
        product_data: { name: `Jretta ${TEACHER_PLANS[quote.plan].name}`, description: quote.plan === "basic" ? "Annual teacher plan · 2 classrooms" : "Annual teacher plan · unlimited classrooms" },
      } }],
      ui_mode: uiMode,
      ...(uiMode === "embedded_page" ? { redirect_on_completion: "never" as const } : {}),
    }, { idempotencyKey: `teacher-annual-${quote.plan}-${uiMode}-${attempt.attempt_id}` });
    if (!session.client_secret) throw new BillingError("Checkout is unavailable. Please try again.", 503);
    const { error: saveError } = await admin.from("teacher_checkout_attempts").update({ stripe_session_id: session.id }).eq("user_id", user.id).eq("attempt_id", attempt.attempt_id);
    if (saveError) throw new BillingError("Unable to save checkout. Please retry.", 503);
    return Response.json({ clientSecret: session.client_secret, sessionId: session.id });
  } catch (error) { return billingResponse(error); }
}
