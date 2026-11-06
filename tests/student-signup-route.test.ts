import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/student-signup/route";

test("student signup creates an auto-confirmed student without changing teacher verification", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://student-signup-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  delete process.env.SUPABASE_SECRET_KEY;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/admin/users");
    assert.equal(init?.method, "POST");
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ id: "student-1", email: "student@example.test", user_metadata: { signup_intent: "student" } });
  };
  try {
    const response = await POST(new Request("http://localhost/api/student-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.10" },
      body: JSON.stringify({ email: " Student@Example.Test ", password: "Test-password-123!" }),
    }));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { created: true });
    assert.deepEqual(requestBody, {
      email: "student@example.test",
      password: "Test-password-123!",
      email_confirm: true,
      user_metadata: { role: "student", signup_intent: "student" },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("student signup rejects invalid credentials before using the admin API", async () => {
  const invalidEmail = await POST(new Request("http://localhost/api/student-signup", {
    method: "POST", body: JSON.stringify({ email: "not-an-email", password: "password" }),
  }));
  assert.equal(invalidEmail.status, 400);
  const invalidPassword = await POST(new Request("http://localhost/api/student-signup", {
    method: "POST", body: JSON.stringify({ email: "student@example.test", password: "short" }),
  }));
  assert.equal(invalidPassword.status, 400);
});
