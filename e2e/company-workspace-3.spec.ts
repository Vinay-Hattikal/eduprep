import { expect, test } from "@playwright/test";
import { accounts, signInAs } from "./helpers";

// Company workspace part 2, step 2 (D-067): copy a pattern, interview questions by round, a
// passage from the question editor, and import for a company. Leaves an e2e-… company behind.

test("an admin copies a pattern, adds an HR question to a round and imports for the company", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const slug = `e2e-iq-${stamp}`;
  const name = `E2E Interview ${stamp}`;

  await signInAs(page, accounts.admin, "/admin/companies/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Overview").fill("A company made by the end-to-end tests for step 2.");
  await page.getByLabel("Last verified").fill("2026-10-01");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.waitForURL(`/admin/companies/${slug}?saved=1`);
  const tabs = page.getByRole("navigation", { name: "Company sections" });

  // Copy the sample company's pattern, then add an HR round.
  await tabs.getByRole("link", { name: /Hiring process/ }).click();
  const copy = page.getByRole("form", { name: "Copy pattern" });
  await copy
    .getByLabel("Copy from")
    .selectOption({ label: "Acme Technologies (EXAMPLE - not real data)" });
  await copy.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Copied the pattern")).toBeVisible();
  const newRound = page.getByRole("form", { name: "New round" });
  await newRound.getByLabel("Round name").fill("HR chat");
  await newRound.getByLabel("Round type").selectOption({ label: "HR interview" });
  await newRound.getByRole("button", { name: "Add round" }).click();
  await expect(page.getByText("Round saved")).toBeVisible();

  // Interview questions: add an HR question from the HR round.
  await tabs.getByRole("link", { name: /Interview questions/ }).click();
  const hrRound = page.locator('[data-testid^="interview-round-"]', { hasText: "HR chat" });
  await hrRound.getByRole("link", { name: "Add HR question" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `New interview question for ${name}` }),
  ).toBeVisible();
  const form = page.getByRole("form", { name: "Design question" });
  await expect(form.getByLabel("Kind")).toHaveValue("HR");
  await form.getByLabel("ID", { exact: true }).fill(`HR-E2E-${stamp}`.toUpperCase());
  await form.getByLabel("URL slug").fill(`e2e-hr-${stamp}`);
  await form.getByLabel("Title", { exact: true }).fill("Why do you want to join us?");
  await form.getByLabel("Question (Markdown)").fill("Why do you want to join this company?");
  await form.getByLabel("What the interviewer looks for (Markdown)").fill("Research and fit.");
  await form.getByLabel("A strong answer (Markdown)").fill("Specific reasons tied to the role.");
  await form.getByLabel("Common mistakes (Markdown)").fill("Talking only about salary.");
  await form.getByRole("button", { name: "Save as draft" }).click();
  await page.getByRole("link", { name: `Back to ${slug}` }).click();

  // It's linked; put it in the HR round.
  const unassigned = page.getByTestId("interview-round-none");
  const roundSelect = unassigned.getByLabel(`Round for HR-E2E-${stamp}`.toUpperCase());
  const hrOption = roundSelect.locator("option", { hasText: "HR chat" });
  await roundSelect.selectOption((await hrOption.getAttribute("value"))!);
  await unassigned.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText("Round updated")).toBeVisible();
  await expect(hrRound.getByText("Why do you want to join us?")).toBeVisible();

  // A passage written from the question editor fills the question's passage ID.
  await page.goto(`/admin/questions/new?company=${slug}`);
  await page.getByRole("button", { name: "New passage" }).click();
  const passage = page.getByTestId("quick-passage");
  await passage.getByLabel("New passage ID").fill(`RC-E2E-${stamp}`.toUpperCase());
  await passage.getByLabel("New passage title").fill("Rainfall");
  await passage.getByLabel("New passage text").fill("Pune got 72 cm of rain this year.");
  await passage.getByRole("button", { name: "Add passage" }).click();
  await expect(page.getByLabel("Passage ID (optional)")).toHaveValue(
    `RC-E2E-${stamp}`.toUpperCase(),
  );

  // Import for the company: only question, problem and interview files are offered.
  await page.goto(`/admin/companies/${slug}?tab=questions`);
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(`/admin/imports?company=${slug}`);
  await expect(page.getByText(`Upload a file for ${name}`)).toBeVisible();
  const types = await page.getByTestId("import-type").locator("option").allTextContents();
  expect(types.join()).not.toMatch(/Taxonomy|Companies/);
});
