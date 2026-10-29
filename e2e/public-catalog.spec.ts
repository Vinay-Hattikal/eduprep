import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { expectNoHorizontalScroll } from "./helpers";

// Public coding problems and mock tests (D-058, C.4): statements and formats are public,
// hidden tests and test questions are not.

test("visitors read a coding problem with its samples, never its hidden tests", async ({
  page,
}) => {
  await page.goto("/problems");
  await expect(page.getByRole("heading", { level: 1, name: "Coding problems" })).toBeVisible();
  await page
    .getByRole("link", { name: /Pair with target sum/i })
    .first()
    .click();
  await expect(page).toHaveURL("/problems/pair-with-target-sum");
  await expect(page.getByRole("link", { name: /Solve this problem/ })).toHaveAttribute(
    "href",
    "/coding/pair-with-target-sum",
  );
  await expectNoHorizontalScroll(page);

  const hidden = await sql<{ input: string }>(
    `SELECT t.input FROM problem_test_cases t JOIN problems p ON p.id = t.problem_id
      WHERE p.slug = 'pair-with-target-sum' AND NOT t.is_sample`,
  );
  const html = await (await page.request.get("/problems/pair-with-target-sum")).text();
  // The longest line of each hidden input is distinctive; none may appear on the page.
  const lines = hidden
    .map(({ input }) =>
      input
        .split("\n")
        .sort((x, y) => y.length - x.length)[0]!
        .trim(),
    )
    .filter((line) => line.length >= 10);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect(html).not.toContain(line);
});

test("visitors see a mock test's pattern and can start it", async ({ page }) => {
  await page.goto("/mock-tests");
  await expect(page.getByRole("heading", { level: 1, name: "Mock tests" })).toBeVisible();
  await page.goto("/mock-tests/acme-tech-mock");
  await expect(page.getByRole("heading", { level: 2, name: "Sections" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Take this mock test/ })).toHaveAttribute(
    "href",
    "/tests/acme-tech-mock",
  );
  await expectNoHorizontalScroll(page);
});

test("the sitemap lists problems and mock tests", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Same on every device");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/problems/pair-with-target-sum<");
  expect(sitemap).toContain("/mock-tests/acme-tech-mock<");
});
