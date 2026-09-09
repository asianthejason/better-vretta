"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import { type TeacherPlan } from "@/lib/teacherPlans";
import { supabase } from "@/lib/supabaseClient";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export default function TeacherPayment({ plan }: { plan: TeacherPlan }) {
  const stripePromise = useMemo(() => publishableKey ? loadStripe(publishableKey) : null, []);
  const checkoutId = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);

  const api = useCallback(async (path: string, body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Your sign-in expired. Please sign in again to finish signup.");
    const response = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load payment. Please try again.");
    return data;
  }, []);

  const finish = useCallback(() => {
    window.localStorage.removeItem("jretta_pending_role");
    window.sessionStorage.removeItem("jretta_teacher_coupon");
    window.location.replace("/teacher");
  }, []);

  const fetchClientSecret = useCallback(async () => {
    try {
      const data = await api("/api/teacher-signup/checkout", { couponCode: "", plan });
      if (data.activated) { finish(); throw new Error("Your teacher account is already active."); }
      checkoutId.current = data.sessionId;
      return data.clientSecret as string;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load payment.");
      throw error;
    }
  }, [api, finish, plan]);

  const onComplete = useCallback(async () => {
    setPaymentComplete(true); setConfirming(true); setError("");
    try {
      const data = await api("/api/teacher-signup/confirm", { sessionId: checkoutId.current });
      if (data.activated) finish();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to confirm payment. Please retry."); }
    finally { setConfirming(false); }
  }, [api, finish]);

  const options = useMemo(() => ({ fetchClientSecret, onComplete }), [fetchClientSecret, onComplete]);

  if (!stripePromise) return <p role="alert" className="text-sm text-red-700">Card payments are temporarily unavailable. Please try again later.</p>;

  return <section aria-label="Credit card payment" className="space-y-3">
    <h2 className="font-semibold text-slate-900">Card details</h2>
    {!paymentComplete && <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>}
    {confirming && <p role="status" className="text-sm text-slate-600">Payment received. Finishing your teacher account…</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-red-700">
      <p>{error}</p>
      <button type="button" disabled={confirming} onClick={() => paymentComplete ? void onComplete() : window.location.reload()} className="font-semibold underline">{paymentComplete ? "Retry confirmation" : "Reload payment form"}</button>
    </div>}
  </section>;
}
