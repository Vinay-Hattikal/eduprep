import { expect, test } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

// Company workspace part 2, step 3 (D-067): the Community tab, previews and the companies list.

test("a drive report is approved from the company's Community tab and turned into a question", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  const question = `A train crosses a pole in 9 s at 72 km/h; find its length (${Date.now()})`;
  await signInAs(page, accounts.fresher, "/asked/new?company=acme-tech");
  await page.getByLabel("What was asked?").fill(question);
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByTestId("drive-report-sent")).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, accounts.admin, "/admin/companies/acme-tech?tab=community");
  const card = page.getByTestId("pending-drive-report").filter({ hasText: question });
  await card.getByTestId("approve-drive-report").click();
  await expect(page).toHaveURL(/\/admin\/companies\/acme-tech\?tab=community/);
  await expect(card).toHaveCount(0);

  // Approved reports can be turned into practice questions for the company.
  const approved = page.locator("li", { hasText: question.slice(0, 40) }).first();
  await approved.getByRole("link", { name: "Turn into a question" }).click();
  await expect(page.getByLabel("Question text", { exact: true })).toHaveValue(question);
  await expect(page.getByLabel("Company 1", { exact: true })).toHaveValue(/.+/);
});

test("the companies list shows progress and filters to what needs work", async ({
  page,
}, testInfo) => {
  await signInAs(page, accounts.admin, "/admin/companies");
  await expect(page.getByTestId("company-progress-cell").first()).toContainText("/");
  await page.getByLabel("Show").selectOption("not-ready");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/filter=not-ready/);
  if (testInfo.project.name === "phone-360") await expectNoHorizontalScroll(page);

  // The workspace links to the page students see.
  await page.goto("/admin/companies/acme-tech");
  await expect(page.getByTestId("view-company-page")).toHaveAttribute(
    "href",
    "/companies/acme-tech",
  );
  await page.goto("/admin/companies/acme-tech?tab=community");
  await expect(page.getByRole("heading", { level: 2, name: /To review/ })).toBeVisible();
  if (testInfo.project.name === "phone-360") await expectNoHorizontalScroll(page);
});

test("a draft company's page is visible to admins only", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  const slug = `e2e-draft-${Date.now().toString(36)}`;
  await signInAs(page, accounts.admin, "/admin/companies/new");
  await page.getByLabel("Name").fill(`E2E Draft ${slug}`);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Overview").fill("A draft company for the preview test.");
  await page.getByLabel("Last verified").fill("2026-10-01");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.waitForURL(`/admin/companies/${slug}?saved=1`);

  await page.goto(`/companies/${slug}`);
  await expect(page.getByTestId("draft-preview")).toBeVisible();
  // Visitors get the not-found page (inside the streamed page, so the status is already sent).
  await page.context().clearCookies();
  await page.goto(`/companies/${slug}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByTestId("draft-preview")).toHaveCount(0);
});
