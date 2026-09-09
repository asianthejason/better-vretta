import { billingResponse, syncTeacherSubscription, fulfillTeacherSession, stripeClient, webhookSecret } from "@/lib/teacherBilling";

export async function POST(request: Request) {
  try {
    const stripe = stripeClient();
    const secret = webhookSecret();
    const signature = request.headers.get("stripe-signature");
    if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });
    let event;
    try { event = stripe.webhooks.constructEvent(await request.text(), signature, secret); }
    catch { return Response.json({ error: "Invalid webhook signature." }, { status: 400 }); }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (session.metadata?.purpose === "teacher_signup" && session.payment_status === "paid") {
        await fulfillTeacherSession(session);
      }
    }
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      if (event.data.object.metadata.purpose === "teacher_signup") await syncTeacherSubscription(event.data.object.id);
    }
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const reference = event.data.object.parent?.subscription_details?.subscription;
      const id = typeof reference === "string" ? reference : reference?.id;
      if (id) {
        const subscription = await stripe.subscriptions.retrieve(id);
        if (subscription.metadata.purpose === "teacher_signup") await syncTeacherSubscription(id);
      }
    }
    return Response.json({ received: true });
  } catch (error) { return billingResponse(error); }
}
