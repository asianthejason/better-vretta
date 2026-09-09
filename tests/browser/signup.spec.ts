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
  await expect(page.getByRole("button", { name: "Sign up with Google as teacher" })).toBeDisabled();
  await expect(page.getByText("Complete the card fields to continue with Google.")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Sign up with Google as teacher" })).toBeEnabled();
  await page.getByRole("button", { name: "Remove coupon" }).click();
  await expect(page.getByText("$60.00 CAD", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign up with Google as teacher" })).toBeDisabled();
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

test("unverified teacher signup opens a locked teacher dashboard", async ({ page }) => {
  const user = { id: "00000000-0000-4000-8000-000000000010", aud: "authenticated", role: "authenticated", email: "signup@example.test", identities: [{ id: "identity-1" }], user_metadata: { signup_intent: "teacher" }, app_metadata: {}, created_at: new Date().toISOString() };
  await page.route("**/auth/v1/signup**", route => route.fulfill({ json: { user, session: null } }));
  await page.route("**/api/teacher-signup/checkout", async route => {
    const headers = route.request().headers();
    expect(headers["x-signup-user-id"]).toBe(user.id);
    expect(headers["x-signup-nonce"]).toBeTruthy();
    await route.fulfill({ json: { activated: true } });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("button", { name: "teacher", exact: true }).click();
  await page.getByLabel("Coupon code").fill("webberteam");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByPlaceholder("teacher@example.com").fill("signup@example.test");
  await page.getByPlaceholder("Enter a password").fill("Test-password-123!");
  await page.getByRole("button", { name: "Continue with free teacher signup" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByRole("navigation").getByText("Teacher Dashboard", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Verify your email to unlock features")).toBeVisible();
  await page.getByRole("button", { name: /Create Classroom/ }).hover({ force: true });
  await expect(page.getByRole("tooltip").filter({ hasText: "Verify your email to unlock this feature." })).toBeVisible();
});

test("unverified student signup opens a locked student dashboard", async ({ page }) => {
  const user = { id: "00000000-0000-4000-8000-000000000011", aud: "authenticated", role: "authenticated", email: "student@example.test", identities: [{ id: "identity-2" }], user_metadata: { signup_intent: "student" }, app_metadata: {}, created_at: new Date().toISOString() };
  await page.route("**/auth/v1/signup**", route => route.fulfill({ json: { user, session: null } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByPlaceholder("teacher@example.com").fill("student@example.test");
  await page.getByPlaceholder("Enter a password").fill("Test-password-123!");
  await page.getByRole("button", { name: "Create Student Account" }).click();
  await expect(page).toHaveURL(/\/student\/dashboard$/);
  await expect(page.getByText("Student Dashboard", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("student@example.test")).toBeVisible();
  await expect(page.getByRole("button", { name: /Join Classroom/ })).toBeDisabled();
});
