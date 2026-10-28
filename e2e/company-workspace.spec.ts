import { expect, test } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

// Company-wise content entry (D-057): build a company's content by hand from its page.
// Leaves an e2e-… company behind (e2e tests share the dev database, see progress.md).

test("an admin builds a company's hiring process and questions from its page", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once; phone layout checked below");
  const stamp = Date.now().toString(36);
  const slug = `e2e-ws-${stamp}`;
  const name = `E2E Workspace ${stamp}`;

  await signInAs(page, accounts.admin, "/admin/companies/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Overview").fill("A company built by the end-to-end tests.");
  await page.getByLabel("Last verified").fill("2026-10-01");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.waitForURL(`/admin/companies/${slug}?saved=1`);
  const tabs = page.getByRole("navigation", { name: "Company sections" });

  // Hiring process: a round with one test section.
  await tabs.getByRole("link", { name: /Hiring process/ }).click();
  const newRound = page.getByRole("form", { name: "New round" });
  await newRound.getByLabel("Round name").fill("Online assessment");
  await newRound.getByLabel("Length (minutes)").fill("90");
  await newRound.getByRole("button", { name: "Add round" }).click();
  await expect(page.getByText("Round saved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Online assessment" })).toBeVisible();

  await page.locator("summary", { hasText: "Add section" }).click();
  const newSection = page.getByRole("form", { name: "New section" });
  await newSection.getByLabel("Section name").fill("Numerical ability");
  await newSection.getByLabel("Questions").fill("20");
  await newSection.getByLabel("Minutes").fill("25");
  await newSection.getByRole("checkbox", { name: "Percentages" }).check();
  await newSection.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByText("Section saved")).toBeVisible();
  await expect(page.getByText("20 questions · 25 min")).toBeVisible();

  // Sources.
  await tabs.getByRole("link", { name: /Sources/ }).click();
  const source = page.getByRole("form", { name: "New source" });
  await source.getByLabel("Label").fill("Careers page");
  await source.getByLabel("Link").fill(`https://example.com/${slug}`);
  await source.getByRole("button", { name: "Add source" }).click();
  await expect(page.getByText("Source added")).toBeVisible();

  // Questions: the company is tagged, and "Then add another" keeps the setup.
  await tabs.getByRole("link", { name: /MCQ questions/ }).click();
  await page.getByTestId("add-question").click();
  await expect(
    page.getByRole("heading", { level: 1, name: `New question for ${name}` }),
  ).toBeVisible();
  await expect(page.getByLabel("Company 1", { exact: true })).toHaveValue(/.+/);
  await expect(page.getByTestId("add-another")).toBeChecked();

  const editor = page.getByRole("form", { name: "Question editor" });
  const id = `QA-E2E-WS-${stamp}-1`.toUpperCase();
  await editor.getByLabel("Question ID", { exact: true }).fill(id);
  await editor
    .getByLabel("Subject", { exact: true })
    .selectOption({ label: "Quantitative Aptitude" });
  await editor.getByLabel("Topic", { exact: true }).selectOption({ label: "Percentages" });
  await editor.getByLabel("Question text", { exact: true }).fill("What is 20% of 50?");
  await editor.getByLabel("Option A", { exact: true }).fill("10");
  await editor.getByLabel("Option B", { exact: true }).fill("20");
  await editor.getByLabel("Option A is correct").click();
  await editor
    .getByLabel("Explanation", { exact: true })
    .fill("20% is one fifth, and one fifth of 50 is 10.");
  await page.getByTestId("save-publish-question").click();

  await expect(page.getByText(`Saved ${id} and published`)).toBeVisible();
  await expect(editor.getByLabel("Question ID", { exact: true })).toHaveValue(
    `QA-E2E-WS-${stamp}-2`.toUpperCase(),
  );
  await expect(editor.getByLabel("Topic", { exact: true })).toHaveValue(/.+/);
  await expect(editor.getByLabel("Question text", { exact: true })).toHaveValue("");

  await page.getByRole("link", { name: `${name} questions` }).click();
  await expect(page.getByRole("link", { name: id })).toBeVisible();

  // Coding: the new-problem form arrives tagged with the company.
  await tabs.getByRole("link", { name: /Coding/ }).click();
  await page.getByTestId("add-problem").click();
  await expect(
    page.getByRole("heading", { level: 1, name: `New coding problem for ${name}` }),
  ).toBeVisible();
  await expect(page.getByLabel("Company 1", { exact: true })).toHaveValue(/.+/);
});

test("company tabs fit a 360 px phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-360", "Phone layout check");
  await signInAs(page, accounts.admin);
  for (const tab of [
    "",
    "?tab=process",
    "?tab=sources",
    "?tab=questions",
    "?tab=coding",
    "?tab=mocks",
  ]) {
    await page.goto(`/admin/companies/acme-tech${tab}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await page.goto("/admin/questions/new?company=acme-tech");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
