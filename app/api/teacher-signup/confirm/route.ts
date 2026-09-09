import { authenticatedAccount, BillingError, billingResponse, fulfillTeacherSession, stripeClient } from "@/lib/teacherBilling";

export async function POST(request: Request) {
  try {
    const { user, active } = await authenticatedAccount(request);
    if (active) return Response.json({ activated: true });
    const { sessionId } = await request.json();
    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_") || sessionId.length > 255) throw new BillingError("Invalid checkout session.");
    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    await fulfillTeacherSession(session, user.id);
    return Response.json({ activated: true });
  } catch (error) { return billingResponse(error); }
}
