import { expect, test, type Page } from "@playwright/test";
import { accounts, signInAs } from "./helpers";

// Content-Security-Policy (D-063): the header is sent, and no page the tests visit breaks it.

function watchViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("pages send the policy and nothing on them breaks it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Same on every device");
  test.setTimeout(120_000);
  const violations = watchViolations(page);

  const response = await page.goto("/");
  const policy = response!.headers()["content-security-policy"];
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("unsafe-eval");

  for (const path of ["/", "/companies/acme-tech", "/question/qa-pct-0001", "/problems"])
    await visit(page, path);

  await signInAs(page, accounts.fresher, "/dashboard");
  for (const path of ["/dashboard", "/practice", "/coding/pair-with-target-sum", "/account"])
    await visit(page, path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, accounts.admin, "/admin");
  for (const path of ["/admin", "/admin/questions", "/admin/imports"]) await visit(page, path);

  expect(violations).toEqual([]);
});
