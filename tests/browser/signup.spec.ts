import { expect, test } from "@playwright/test";

test("homepage keeps the hero and removes the sections below it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Digital assessmentsmade “easy”.");
  await expect(page.getByText("The quotation marks are doing a lot of work here.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(page.getByText("Some assembly required")).toHaveCount(0);
});

test("teacher signup applies a free coupon and removes Stripe payment messaging", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("button", { name: "teacher", exact: true }).click();
  await expect(page.getByText("$60.00 CAD", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Credit card payment" })).toBeVisible();
  await page.getByRole("button", { name: "Pay $60 CAD & subscribe yearly" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText(/Renews at \$60 CAD each year/)).toBeVisible();
  await page.getByLabel("Coupon code").fill("bad-code");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That coupon code is not valid." })).toBeVisible();
  await expect(page.getByText("$60.00 CAD", { exact: true })).toBeVisible();
  await page.getByLabel("Coupon code").fill("webberteam");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("$0.00 CAD", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Credit card payment" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Unlimited/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Continue with free teacher signup" })).toBeVisible();
  await page.getByRole("button", { name: "Remove coupon" }).click();
  await expect(page.getByText("$60.00 CAD", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "student", exact: true }).click();
  await expect(page.getByLabel("Coupon code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Student Account" })).toBeVisible();
});

test("checkout and payment confirmation require authentication", async ({ request }) => {
  for (const route of ["checkout", "confirm"]) {
    const response = await request.post(`/api/teacher-signup/${route}`, { data: { couponCode: "webberteam", amount: 0 } });
    expect(response.status()).toBe(401);
  }
});

test("email teacher signup stays on the signup page and a free coupon omits the card form", async ({ page }) => {
  const user = { id: "00000000-0000-4000-8000-000000000010", aud: "authenticated", role: "authenticated", email: "signup@example.test", user_metadata: { signup_intent: "teacher" }, app_metadata: {}, created_at: new Date().toISOString() };
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`, refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, user };
  await page.route("**/auth/v1/signup**", route => route.fulfill({ json: session }));
  await page.route("**/auth/v1/user", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/profiles?**", route => route.fulfill({ json: { role: "student" } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("button", { name: "teacher", exact: true }).click();
  await page.getByLabel("Coupon code").fill("webberteam");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByPlaceholder("teacher@example.com").fill("signup@example.test");
  await page.getByPlaceholder("Enter a password").fill("Test-password-123!");
  await page.getByRole("button", { name: "Continue with free teacher signup" }).click();
  await expect(page.getByRole("heading", { name: "Create your teacher account." })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Create teacher account — free" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Credit card payment" })).toHaveCount(0);
});
