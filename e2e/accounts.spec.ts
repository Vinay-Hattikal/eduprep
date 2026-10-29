import { expect, test, type Page } from "@playwright/test";
import { sql } from "./db";
import { expectNoHorizontalScroll, signOut } from "./helpers";

// Real accounts (D-043) with the development message outbox: codes are read from the
// notifications table, as a person would read them from their inbox or phone.

// Sign-up, code and password hashing in one test take longer than the 30 s default.
test.describe.configure({ timeout: 90_000 });

async function latestCode(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const rows = await sql<{ body: string }>(
      `SELECT body FROM notifications WHERE "to" = $1 AND template = 'auth.code' ORDER BY created_at DESC LIMIT 1`,
      [to],
    );
    const code = rows[0] && /\b(\d{6})\b/.exec(rows[0].body)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code sent to ${to}`);
}

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function signUpAndVerify(page: Page, email: string, password: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Full name").fill("Kiran Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByTestId("signup-submit").click();
  await expect(page).toHaveURL(/\/verify-email\?email=/);
  await page.getByLabel("6-digit code").fill(await latestCode(email));
  await page.getByTestId("verify-email-submit").click();
  await expect(page).toHaveURL("/onboarding");
}

test("sign up with email, confirm the code, sign out and back in", async ({ page }) => {
  const email = `e2e-${unique()}@example.com`;
  await signUpAndVerify(page, email, "blue-river-42");

  await page.goto("/sign-in");
  await expect(page).toHaveURL("/onboarding"); // already signed in
  await signOut(page);

  await page.goto("/sign-in?next=/practice");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("email-signin").getByRole("alert")).toContainText(
    "Email or password is wrong",
  );
  await expect(page.getByLabel("Email")).toHaveValue(email); // kept after an error
  await page.getByLabel("Password", { exact: true }).fill("blue-river-42");
  await page.getByTestId("signin-submit").click();
  // A new student finishes onboarding before anything else.
  await expect(page).toHaveURL("/onboarding");
});

test("sign in with a phone OTP creates an account", async ({ page }) => {
  const digits = `9${unique().slice(-9)}`;
  await page.goto("/sign-in");
  await expectNoHorizontalScroll(page);
  await page.getByTestId("signin-tab-phone").click();
  await page.getByLabel("Mobile number").fill(digits);
  await page.getByTestId("send-phone-code").click();
  await expect(page.getByText(/Code sent to \+91/)).toBeVisible();
  await page.getByLabel("6-digit code").fill(await latestCode(`+91${digits}`));
  await page.getByTestId("verify-phone-code").click();
  await expect(page).toHaveURL("/onboarding");
});

test("reset a forgotten password", async ({ page }) => {
  const email = `e2e-${unique()}@example.com`;
  await signUpAndVerify(page, email, "blue-river-42");
  await signOut(page);

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  // Wait for the form to be interactive: a submit before hydration just reloads the page.
  await page.waitForURL("/forgot-password");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByTestId("forgot-submit").click();
  await expect(page).toHaveURL(/\/reset-password\?email=/);
  await page.getByLabel("6-digit code").fill(await latestCode(email));
  await page.getByLabel("New password").fill("green-hill-77");
  await page.getByTestId("reset-submit").click();
  await expect(page).toHaveURL("/onboarding");
});

test("signing out ends the session on the server, not just in the browser", async ({
  page,
  context,
}) => {
  const email = `e2e-${unique()}@example.com`;
  await signUpAndVerify(page, email, "blue-river-42");
  const cookies = await context.cookies();
  await signOut(page);
  // Replaying the old cookie must not work.
  await context.addCookies(cookies);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign-up and sign-in fit a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-360", "phone layout check");
  for (const route of ["/sign-in", "/sign-up", "/forgot-password", "/terms", "/privacy"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
