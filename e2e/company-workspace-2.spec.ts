import { expect, test } from "@playwright/test";
import { accounts, signInAs } from "./helpers";

// Company workspace part 2 (D-067): checklist and next step, section coverage, the guided coding
// problem flow, and "Publish everything". Leaves an e2e-… company behind (shared dev database).

test("an admin follows the checklist from a new company to a published coding problem", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36);
  const slug = `e2e-ck-${stamp}`;
  const name = `E2E Checklist ${stamp}`;

  await signInAs(page, accounts.admin, "/admin/companies/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Slug").fill(slug);
  await page
    .getByLabel("Overview")
    .fill(
      "A company made by the end-to-end tests. It hires freshers through an online test and a coding round.",
    );
  await page.getByLabel("Last verified").fill("2026-10-01");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.waitForURL(`/admin/companies/${slug}?saved=1`);

  // A new company lands on its checklist, pointed at the hiring rounds.
  await expect(page.getByTestId("company-checklist")).toBeVisible();
  await expect(page.getByTestId("check-process")).toHaveAttribute("data-done", "false");
  await page.getByTestId("next-step").click();
  await expect(page).toHaveURL(`/admin/companies/${slug}?tab=process`);

  // A coding round with one section: the topic shows it's short of problems, with a link.
  const newRound = page.getByRole("form", { name: "New round" });
  await newRound.getByLabel("Round name").fill("Coding round");
  await newRound.getByLabel("Round type").selectOption({ label: "Coding test" });
  await newRound.getByRole("button", { name: "Add round" }).click();
  await expect(page.getByText("Round saved")).toBeVisible();
  await page.locator("summary", { hasText: "Add section" }).click();
  const newSection = page.getByRole("form", { name: "New section" });
  await newSection.getByLabel("Section name").fill("Coding");
  await newSection.getByLabel("Section type").selectOption({ label: "Coding" });
  // More than the dev database has, so the topic stays short however often this runs.
  await newSection.getByLabel("Questions").fill("20");
  await newSection.getByLabel("Minutes").fill("45");
  await newSection.getByRole("checkbox", { name: "Strings" }).check();
  await newSection.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByText("Section saved")).toBeVisible();

  const short = page.getByTestId("coverage-short").first();
  await expect(short).toContainText("Strings");
  await short.click();
  await expect(
    page.getByRole("heading", { level: 1, name: `New coding problem for ${name}` }),
  ).toBeVisible();
  const form = page.getByRole("form", { name: "Coding problem" });
  await expect(form.getByRole("checkbox", { name: "Strings" })).toBeChecked();

  // The problem, then tests pasted in two goes, then the reference solution.
  await form.getByLabel("ID", { exact: true }).fill(`e2e-ck-${stamp}`);
  await form.getByLabel("URL slug").fill(`e2e-ck-problem-${stamp}`);
  await form.getByLabel("Title", { exact: true }).fill(`E2E echo ${stamp}`);
  await form.getByLabel("Statement (Markdown)").fill("Read a word and print it back.");
  await form.getByLabel("Input format").fill("One word.");
  await form.getByLabel("Output format").fill("The same word.");
  await form.getByLabel("Constraints").fill("1 <= length <= 20");
  await page.getByTestId("save-problem").click();
  await expect(page.getByText("Problem created as a draft")).toBeVisible();
  await expect(page.getByTestId("problem-company")).toContainText(`Back to ${name}`);

  const paste = async (tests: string[], sample: boolean) => {
    await page.locator("summary", { hasText: "Paste several tests" }).click();
    const pasteForm = page.getByRole("form", { name: "Paste tests" });
    await pasteForm
      .getByLabel("Tests", { exact: true })
      .fill(tests.map((w) => `${w}\n===\n${w}`).join("\n---\n"));
    await pasteForm.getByLabel("These tests are").selectOption(sample ? "yes" : "no");
    await page.getByTestId("paste-tests").click();
  };
  await paste(["hello"], true);
  await expect(page.getByText("(1 sample, 0 hidden)")).toBeVisible();
  await paste(["a", "bb", "ccc", "dddd", "eeeee"], false);
  await expect(page.getByText("(1 sample, 5 hidden)")).toBeVisible();

  const code = page.getByRole("form", { name: "Solution code" }).last();
  await code.getByLabel("Language").selectOption("python");
  await code.getByLabel("Code").fill("print(input().strip())");
  await code.getByRole("button", { name: "Add code" }).click();
  await expect(page.getByText("Code saved")).toBeVisible();
  // The worker runs the judge check; the page refreshes itself while it runs.
  await expect(page.getByTestId("judge-check").getByText(/Passed \d/)).toBeVisible({
    timeout: 180_000,
  });

  // Back on the company: "Publish everything" publishes the checked problem.
  await page.getByRole("link", { name: `Back to ${name}` }).click();
  await expect(page).toHaveURL(`/admin/companies/${slug}?tab=coding`);
  await page.goto(`/admin/companies/${slug}`);
  await page.getByTestId("publish-everything").click();
  await expect(page.getByTestId("published-all")).toContainText("1 coding problems");
  await expect(page.getByTestId("check-coding")).toHaveAttribute("data-done", "true");
});
