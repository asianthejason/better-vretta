"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { TEACHER_PLANS, type TeacherPlan } from "@/lib/teacherPlans";
import { loadStripe } from "@stripe/stripe-js/pure";

export type SignupCardHandle = {
  collect: (email: string) => Promise<string>;
  pay: (paymentMethod: string, token: string, plan: TeacherPlan) => Promise<void>;
};

const CardFields = forwardRef<SignupCardHandle, { plan: TeacherPlan }>(function CardFields({ plan }, ref) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState("");

  useImperativeHandle(ref, () => ({
    async collect(email) {
      if (!stripe || !elements || !ready) throw new Error("The card form is still loading. Please try again in a moment.");
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Please reload the card form.");
      const result = await stripe.createPaymentMethod({ type: "card", card, billing_details: { email } });
      if (result.error) throw new Error(result.error.message || "Please check your card details.");
      return result.paymentMethod.id;
    },
    async pay(paymentMethod, token, selectedPlan) {
      if (!stripe) throw new Error("Please reload the card form.");
      async function api(path: string, body: object) {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to process payment.");
        return data;
      }
      const data = await api("/api/teacher-signup/checkout", { couponCode: "", uiMode: "elements", plan: selectedPlan });
      if (data.activated) return;
      const checkout = stripe.initCheckoutElementsSdk({ clientSecret: data.clientSecret });
      const loaded = await checkout.loadActions();
      if (loaded.type === "error") throw new Error(loaded.error.message);
      const session = loaded.actions.getSession();
      // Display Stripe's authoritative total before confirming the payment.
      flushSync(() => setTotal(session.total.total.amount));
      if (session.total.total.minorUnitsAmount !== TEACHER_PLANS[selectedPlan].annualAmount || session.currency.toLowerCase() !== "cad") throw new Error("The payment total changed. Please reload before paying.");
      const result = await loaded.actions.confirm({
        paymentMethod, redirect: "if_required",
        returnUrl: `${window.location.origin}/teacher/signup?session_id=${encodeURIComponent(data.sessionId)}`,
      });
      if (result.type === "error") throw new Error(result.error.message);
      await api("/api/teacher-signup/confirm", { sessionId: data.sessionId });
    },
  }), [stripe, elements, ready]);

  return <section aria-label="Credit card payment" className="space-y-2">
    <h2 className="text-sm font-semibold text-slate-700">Credit or debit card</h2>
    <div className="rounded-xl border border-slate-300 bg-white px-4 py-4">
      <CardElement options={{ style: { base: { fontSize: "16px", color: "#0f172a", "::placeholder": { color: "#94a3b8" } }, invalid: { color: "#b91c1c" } } }} onReady={() => setReady(true)} onChange={event => setError(event.error?.message || "")} />
    </div>
    {!ready && <p role="status" className="text-sm text-slate-500">Loading secure card fields…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-xs text-slate-500">Annual payment of {total || `$${TEACHER_PLANS[plan].annualAmount / 100}.00`} CAD. Renews yearly until canceled. Card details are secured by Stripe.</p>
  </section>;
});

export default forwardRef<SignupCardHandle, { plan: TeacherPlan }>(function SignupCard({ plan }, ref) {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripe = useMemo(() => key ? loadStripe(key) : null, [key]);
  if (!stripe) return <p role="alert" className="text-sm text-red-700">Card payments are temporarily unavailable. Please try again later.</p>;
  return <Elements stripe={stripe}><CardFields ref={ref} plan={plan} /></Elements>;
});
