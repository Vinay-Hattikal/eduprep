import { expect, test } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs, signOut } from "./helpers";

test("signed-out visitors are sent to sign-in and returned afterwards", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin%2Fsettings/);

  // Development builds offer the test-account picker next to real sign-in.
  await page.getByRole("link", { name: "sign in as a test account" }).click();
  await expect(page).toHaveURL(/\/dev-login\?next=%2Fadmin%2Fsettings/);
  await page.getByTestId(`dev-login-${accounts.admin}`).click();
  await expect(page).toHaveURL("/admin/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});

test("a student lands on their dashboard and can sign out", async ({ page }) => {
  await signInAs(page, accounts.fresher);
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Hi, Priya" })).toBeVisible();
  await expect(page.getByText("Fresher track")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await signOut(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a student cannot open the admin panel", async ({ page }) => {
  await signInAs(page, accounts.fresher);
  await page.goto("/admin");
  await expect(page).toHaveURL("/access-denied");
  await expect(
    page.getByRole("heading", { name: "You don't have access to this page" }),
  ).toBeVisible();
});

test("an interviewer lands on the interviewer portal", async ({ page }) => {
  await signInAs(page, accounts.interviewer);
  await expect(page).toHaveURL("/interviewer");
  await expect(page.getByRole("heading", { level: 1, name: "Hello, Ananya" })).toBeVisible();
});

test("a content author sees only the admin sections their role allows", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Sidebar is in the drawer on phones");
  await signInAs(page, accounts.author);
  await expect(page).toHaveURL("/admin");

  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Questions", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0);

  await page.goto("/admin/users");
  await expect(page).toHaveURL("/access-denied");
});
