import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as checkout } from "../app/api/teacher-signup/checkout/route";
import Stripe from "stripe";
import { syncTeacherSubscription } from "../lib/teacherBilling";

test("free signup activates server-side without any Stripe configuration; client amounts cannot bypass payment", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  let activations = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://billing-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.TEACHER_SIGNUP_COUPON;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    assert.equal(url.origin, "https://billing-test.supabase.co");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", email: "teacher@example.test" });
    if (url.pathname === "/rest/v1/profiles") return Response.json({ role: "student" });
    if (url.pathname === "/rest/v1/teacher_entitlements") return Response.json(null);
    if (url.pathname === "/rest/v1/teacher_checkout_attempts") return Response.json(null);
    if (url.pathname === "/rest/v1/rpc/activate_teacher_plan") {
      assert.deepEqual(JSON.parse(init?.body as string), { target_user_id: "user-1", entitlement_source: "coupon", selected_plan: "unlimited", checkout_session_id: null, subscription_id: null, paid_until: null, current_status: null, cancel_renewal: false });
      activations++;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const request = (body: object, authenticated = true) => new Request("http://localhost/api/teacher-signup/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer test-user-token" } : {}) },
    body: JSON.stringify(body),
  });
  try {
    const free = await checkout(request({ couponCode: "webberteam" }));
    assert.equal(free.status, 200);
    assert.deepEqual(await free.json(), { activated: true });
    assert.equal(activations, 1);
    const forged = await checkout(request({ couponCode: "", amount: 0, role: "teacher" }));
    assert.equal(forged.status, 503); // Paid checkout requires configured Stripe.
    assert.equal(activations, 1);
    assert.equal((await checkout(request({ couponCode: "invalid", amount: 0 }))).status, 400);
    assert.equal((await checkout(request({ couponCode: "webberteam" }, false))).status, 401);
    assert.equal(activations, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("renewals extend paid access, failed invoices do not, and cancellation syncs current Stripe status", async (t) => {
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://billing-test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-role-key";
  let status = "active";
  let invoicePaid = true;
  const updates: Record<string, unknown>[] = [];
  const prototype = Object.getPrototypeOf(new Stripe("sk_test_placeholder").subscriptions);
  t.mock.method(prototype, "retrieve", async () => ({
    metadata: { purpose: "teacher_signup", user_id: "user-1", plan: "basic" }, status,
    items: { data: [{ quantity: 1, current_period_end: 2000000000, price: { currency: "cad", unit_amount: 6000, recurring: { interval: "year", interval_count: 1 } } }] },
    latest_invoice: { status: invoicePaid ? "paid" : "open", amount_paid: invoicePaid ? 6000 : 0, currency: "cad" },
    cancel_at_period_end: status === "canceled", customer: "cus_test",
  }));
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    assert.equal(url.pathname, "/rest/v1/rpc/sync_teacher_subscription");
    updates.push(JSON.parse(init?.body as string));
    return new Response(null, { status: 204 });
  };
  try {
    await syncTeacherSubscription("sub_test");
    assert.equal(updates[0].paid_until, new Date(2000000000 * 1000).toISOString());
    invoicePaid = false; status = "past_due";
    await syncTeacherSubscription("sub_test");
    assert.equal(updates[1].paid_until, null);
    assert.equal(updates[1].current_status, "past_due");
    status = "canceled";
    await syncTeacherSubscription("sub_test");
    assert.equal(updates[2].current_status, "canceled");
    assert.equal(updates[2].cancel_renewal, true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("paid signup returns an embedded form secret, reuses it, and expires it for a free coupon", async (t) => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://billing-test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-role-key";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  delete process.env.TEACHER_SIGNUP_COUPON;
  let stored = false;
  let expired = false;
  let created = 0;
  let activated = false;
  let expectedUi = "embedded_page";
  const prototype = Object.getPrototypeOf(new Stripe("sk_test_placeholder").checkout.sessions);
  t.mock.method(prototype, "create", async (params: Stripe.Checkout.SessionCreateParams) => {
    created++;
    assert.equal(params.ui_mode, expectedUi);
    assert.equal(params.mode, "subscription");
    assert.deepEqual(params.line_items?.[0].price_data?.recurring, { interval: "year" });
    assert.equal(params.metadata?.plan, "basic");
    assert.equal(params.redirect_on_completion, expectedUi === "embedded_page" ? "never" : undefined);
    assert.equal(params.success_url, undefined);
    assert.equal(params.cancel_url, undefined);
    assert.equal(params.line_items?.[0].price_data?.unit_amount, 6000);
    assert.equal(params.line_items?.[0].price_data?.currency, "cad");
    return { id: "cs_embedded", client_secret: "cs_embedded_secret_example" };
  });
  t.mock.method(prototype, "retrieve", async () => ({ id: "cs_embedded", status: "open", ui_mode: "embedded_page", metadata: { plan: "basic" }, client_secret: "cs_embedded_secret_example" }));
  t.mock.method(prototype, "expire", async () => { expired = true; return {}; });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    assert.equal(url.origin, "https://billing-test.supabase.co");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", email: "teacher@example.test" });
    if (url.pathname === "/rest/v1/profiles") return Response.json({ role: "student" });
    if (url.pathname === "/rest/v1/teacher_entitlements") return Response.json(null);
    if (url.pathname === "/rest/v1/teacher_checkout_attempts") {
      if (init?.method === "PATCH") stored = true;
      if (init?.method === "DELETE") { assert.equal(expired, true); stored = false; }
      if (init?.method && init.method !== "GET") return new Response(null, { status: 204 });
      if (url.searchParams.get("select") === "attempt_id,plan,ui_mode") return Response.json({ attempt_id: "attempt-1", plan: "basic", ui_mode: expectedUi });
      return Response.json(stored ? { stripe_session_id: "cs_embedded", attempt_id: "attempt-1" } : null);
    }
    if (url.pathname === "/rest/v1/rpc/activate_teacher_plan") {
      assert.equal(expired, true); activated = true;
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected backend request");
  };
  const request = (couponCode = "") => new Request("http://localhost/api/teacher-signup/checkout", {
    method: "POST", headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" }, body: JSON.stringify({ couponCode, uiMode: expectedUi }),
  });
  try {
    for (let i = 0; i < 2; i++) {
      const response = await checkout(request());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { clientSecret: "cs_embedded_secret_example", sessionId: "cs_embedded" });
    }
    assert.equal(created, 1);
    assert.equal((await checkout(request("webberteam"))).status, 200);
    assert.equal(activated, true);
    expectedUi = "elements";
    const elementsResponse = await checkout(request());
    assert.equal(elementsResponse.status, 200);
    assert.equal(created, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
