import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

// Public question pages (D-058): anyone can read questions; only public samples show answers.

async function sampleQuestion() {
  const [row] = await sql<{
    external_id: string;
    explanation: string;
    subject: string;
    topic: string;
  }>(
    `SELECT q.external_id, q.explanation, s.slug AS subject, t.slug AS topic
       FROM questions q JOIN topics t ON t.id = q.topic_id JOIN subjects s ON s.id = q.subject_id
      WHERE q.external_id = 'QA-PCT-0001'`,
  );
  // A plain-text piece of the explanation (formulas render differently from their source).
  const marker = row!.explanation
    .replace(/\$[^$]*\$/g, "|")
    .split(/[|*_`\\]/)
    .map((part) => part.trim())
    .sort((a, b) => b.length - a.length)[0]!
    .slice(0, 30);
  return { ...row!, marker };
}

async function setSample(page: import("@playwright/test").Page, on: boolean) {
  await signInAs(page, accounts.admin, "/admin/questions?q=QA-PCT-0001");
  await page.getByRole("link", { name: "QA-PCT-0001" }).click();
  const box = page.getByTestId("public-sample");
  if (((await box.getAttribute("data-state")) === "checked") !== on) await box.click();
  await page.getByTestId("save-publish-question").click();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  await page.context().clearCookies();
}

test("visitors browse subjects and topics and see sample answers without signing in", async ({
  page,
}) => {
  const q = await sampleQuestion();
  await page.goto("/questions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Placement practice questions" }),
  ).toBeVisible();
  await page.goto(`/questions/${q.subject}/${q.topic}`);
  await expect(page.getByTestId("public-question").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Practise all/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("only public samples carry their answer, and the page says so to everyone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  const q = await sampleQuestion();
  const url = `/question/${q.external_id.toLowerCase()}`;

  await setSample(page, false);
  const hidden = await (await page.request.get(url)).text();
  expect(hidden).toContain("Sign up free to see the answer");
  expect(q.marker.length).toBeGreaterThan(10);
  expect(hidden).not.toContain(q.marker);

  await setSample(page, true);
  await page.goto(url);
  await page.getByText("Show answer and explanation").click();
  await expect(page.getByTestId("public-question").getByText(q.marker)).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toContain('"Quiz"');
});

test("the question sitemap lists topics and questions", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Same on every device");
  const index = await (await request.get("/sitemaps/questions")).text();
  expect(index).toContain("/sitemaps/questions/0");
  const first = await (await request.get("/sitemaps/questions/0")).text();
  expect(first).toContain("/question/qa-pct-0001");
  expect(await (await request.get("/robots.txt")).text()).toContain("/sitemaps/questions");
});
