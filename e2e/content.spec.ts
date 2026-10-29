import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

const templates = path.resolve("docs/templates");

/** Uploads a file on /admin/imports and waits for the preview. */
async function upload(
  page: Page,
  type: string,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto("/admin/imports");
  await page.getByLabel("What are you importing?").selectOption(type);
  await page
    .getByLabel("File", { exact: true })
    .setInputFiles(typeof file === "string" ? path.join(templates, file) : file);
  await page.getByRole("button", { name: "Upload and check" }).click();
  await page.waitForURL(/\/admin\/imports\/[a-z0-9]+/);
  // The worker validates in the background; the page refreshes itself.
  // (Next keeps visited pages mounted but hidden, so match this page's own status badge.)
  await expect(page.getByTestId("import-status")).toHaveText(/Ready to import|Failed/, {
    timeout: 30_000,
  });
}

async function confirmAndWait(page: Page) {
  await page.getByTestId("confirm-import").click();
  await expect(page.getByTestId("import-status")).toHaveText("Completed", { timeout: 30_000 });
}

test.describe("content engine", () => {
  test.describe.configure({ mode: "serial" });
  // The phone project sets isMobile; these flows run once, on desktop.
  test.skip(({ isMobile }) => isMobile, "Flows run once on desktop");

  test("imports the taxonomy and a subject file through preview and confirm", async ({ page }) => {
    await signInAs(page, accounts.admin, "/admin/imports");

    await upload(page, "TAXONOMY", "taxonomy.csv");
    await confirmAndWait(page);

    await upload(page, "MCQ", "mcq/quantitative-aptitude.csv");
    await expect(page.getByText("QA-PCT-0001")).toBeVisible();
    await confirmAndWait(page);

    await page.goto("/admin/questions?q=QA-PCT-0001");
    await expect(page.getByRole("link", { name: "QA-PCT-0001" })).toBeVisible();
  });

  test("imports coding problems from one file, and downloads them back (D-054)", async ({
    page,
  }) => {
    await signInAs(page, accounts.admin, "/admin/imports");
    await upload(page, "CODING_BUNDLE", "coding/coding-problems-single-file.csv");
    await expect(page.getByText("CODE-ARR-0001")).toBeVisible();
    await confirmAndWait(page);

    await page.goto("/admin/imports");
    const download = page.waitForEvent("download");
    await page.locator(`a[href="/admin/imports/export/coding"]`).click();
    expect((await download).suggestedFilename()).toBe("coding-problems.csv");
  });

  test("replace all shows what it archives and needs REPLACE typed", async ({ page }) => {
    await signInAs(page, accounts.admin, "/admin/imports");
    await page.getByLabel("What are you importing?").selectOption("CODING_BUNDLE");
    await page.getByLabel("How to import").selectOption("REPLACE");
    await page
      .getByLabel("File", { exact: true })
      .setInputFiles(path.join(templates, "coding/coding-problems-single-file.csv"));
    await page.getByRole("button", { name: "Upload and check" }).click();
    await page.waitForURL(/\/admin\/imports\/[a-z0-9]+/);
    await expect(page.getByTestId("import-status")).toHaveText("Ready to import", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("replace-preview")).toBeVisible();

    await page.getByTestId("confirm-import").click();
    await expect(page.getByText("Type REPLACE to confirm the replace.")).toBeVisible();
    // The test database is shared: don't actually replace anything.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("import-status")).toHaveText("Cancelled");
  });

  test("shows row errors before anything is imported", async ({ page }) => {
    await signInAs(page, accounts.admin);
    const header =
      "external_id,subject,topic,subtopic,type,question,code,code_language,option_a,option_b,option_c,option_d,option_e,correct,tolerance,explanation,difficulty,expected_time_sec,passage_id,tags,source";
    const broken = `${header}\nQA-E2E-BAD,quantitative-aptitude,percentages,,single,"Broken?",,,Same,same,,,,C,,"Explanation long enough here.",easy,30,,,original\n`;
    await upload(page, "MCQ", {
      name: "broken.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(broken),
    });

    await expect(page.getByText("Two options are the same")).toBeVisible();
    await expect(page.getByText("Correct answer C points to an empty option.")).toBeVisible();
    await expect(page.getByTestId("confirm-import")).toBeDisabled();
    await expect(page.getByRole("link", { name: "Download rows with errors" })).toBeVisible();
  });

  test("writes a question as a draft, then publishes and unpublishes it", async ({ page }) => {
    await signInAs(page, accounts.admin, "/admin/questions/new");
    const id = `QA-E2E-${Date.now()}`;

    await page.getByLabel("Question ID").fill(id);
    await page.getByLabel("Subject").selectOption({ label: "Quantitative Aptitude" });
    await page.getByLabel("Topic", { exact: true }).selectOption({ label: "Averages" });
    await page.getByLabel("Question text").fill("The average of $2$, $4$ and $6$ is?");
    await page.getByLabel("Option A", { exact: true }).fill("3");
    await page.getByLabel("Option B", { exact: true }).fill("4");
    await page.getByLabel("Option C", { exact: true }).fill("5");
    await page.getByLabel("Option B is correct").click();
    await page
      .getByLabel("Explanation")
      .fill("The sum is 12 and there are 3 numbers, so the average is 4.");

    // Live preview shows the student view.
    await expect(page.getByRole("list", { name: "Options" }).getByLabel("Correct")).toHaveCount(1);

    await page.getByTestId("save-question").click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: id })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

    // One admin publishes directly: no review step (D-056).
    await page.getByTestId("question-publish").click();
    await expect(page.getByText("Done: Publish")).toBeVisible();
    await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();

    await page.getByTestId("question-unpublish").click();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  });

  test("save and publish puts a new question live in one step", async ({ page }) => {
    await signInAs(page, accounts.admin, "/admin/questions/new");
    const id = `QA-E2E-P-${Date.now()}`;
    await page.getByLabel("Question ID").fill(id);
    await page.getByLabel("Subject").selectOption({ label: "Quantitative Aptitude" });
    await page.getByLabel("Topic", { exact: true }).selectOption({ label: "Percentages" });
    await page.getByLabel("Question text").fill("What is 10% of 50?");
    await page.getByLabel("Option A", { exact: true }).fill("5");
    await page.getByLabel("Option B", { exact: true }).fill("10");
    await page.getByLabel("Option A is correct").click();
    await page.getByLabel("Explanation").fill("10% means one tenth, and one tenth of 50 is 5.");
    await page.getByTestId("save-publish-question").click();
    await expect(page.getByText("Saved and published")).toBeVisible();
    await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();

    await page.goto("/admin/drafts");
    await expect(page.getByRole("heading", { level: 1, name: "Drafts" })).toBeVisible();
    await expect(page.getByRole("link", { name: id })).toHaveCount(0);
  });

  test("taxonomy and companies pages list imported content", async ({ page }) => {
    await signInAs(page, accounts.admin, "/admin/taxonomy");
    await expect(page.getByLabel("Name of quantitative-aptitude")).toHaveValue(
      "Quantitative Aptitude",
    );

    await upload(page, "COMPANIES", "companies/companies.csv");
    await confirmAndWait(page);
    await page.goto("/admin/companies");
    await expect(page.getByRole("link", { name: /Acme Technologies/ })).toBeVisible();
  });

  test("creates a company and won't publish it without a source", async ({ page }) => {
    await signInAs(page, accounts.admin, "/admin/companies/new");
    const slug = `e2e-${Date.now()}`;
    await page.getByLabel("Name").fill("E2E Test Company");
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Overview").fill("A company created by the end-to-end tests.");
    await page.getByLabel("Last verified").fill("2026-10-01");
    await page.getByRole("button", { name: "Create company" }).click();

    await page.waitForURL(`/admin/companies/${slug}?saved=1`);
    await expect(page.getByRole("heading", { level: 1, name: "E2E Test Company" })).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Add at least one source before publishing.")).toBeVisible();
  });
});

test("content pages fit a 360 px phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-360", "Phone layout check");
  await signInAs(page, accounts.admin);
  for (const route of [
    "/admin/imports",
    "/admin/questions",
    "/admin/questions/new",
    "/admin/taxonomy",
    "/admin/companies",
    "/admin/drafts",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
