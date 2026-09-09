import { adminClient, authenticatedAccount, BillingError, billingResponse, stripeClient, syncTeacherSubscription } from "@/lib/teacherBilling";

export async function GET(request: Request) {
  try {
    const { user, active } = await authenticatedAccount(request);
    const { data, error } = await adminClient().from("teacher_entitlements").select("plan,source,access_until,subscription_status,cancel_at_period_end,stripe_subscription_id").eq("user_id", user.id).maybeSingle();
    if (error) throw new BillingError("Unable to load your plan.", 503);
    return Response.json({ ...data, active, hasSubscription: !!data?.stripe_subscription_id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await authenticatedAccount(request);
    const { cancel } = await request.json();
    if (typeof cancel !== "boolean") throw new BillingError("Invalid renewal preference.");
    const { data, error } = await adminClient().from("teacher_entitlements").select("stripe_subscription_id").eq("user_id", user.id).single();
    if (error || !data?.stripe_subscription_id) throw new BillingError("This account has no paid subscription.");
    await stripeClient().subscriptions.update(data.stripe_subscription_id, { cancel_at_period_end: cancel });
    await syncTeacherSubscription(data.stripe_subscription_id);
    return Response.json({ updated: true });
  } catch (error) { return billingResponse(error); }
}
