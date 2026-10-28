import { expect, type Page } from "@playwright/test";

/** Seeded accounts from prisma/seed.ts. */
export const accounts = {
  admin: "admin@example.com",
  author: "author@example.com",
  fresher: "fresher@example.com",
  experienced: "experienced@example.com",
  interviewer: "interviewer@example.com",
} as const;

export async function signInAs(page: Page, email: string, next?: string) {
  await page.goto(next ? `/dev-login?next=${encodeURIComponent(next)}` : "/dev-login");
  await page.getByTestId(`dev-login-${email}`).click();
  // The session cookie is set by a server action; wait until it has redirected away.
  await page.waitForURL((url) => !url.pathname.startsWith("/dev-login"));
}

export async function signOut(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL("/");
}

/** Fails if the page scrolls sideways (design-system.md: works at 360 px). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(0);
}
