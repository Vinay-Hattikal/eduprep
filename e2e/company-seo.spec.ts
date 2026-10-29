import { expect, test } from "@playwright/test";
import { sql } from "./db";

// Company pages link into the public pages, and public pages limit scraping (D-058, C.5).

test("a company page shows sample answers and links to public topic and problem pages", async ({
  page,
}) => {
  // The sample content's percentage question is Acme's public sample (other tests flip it).
  await sql(`UPDATE questions SET public_sample = true WHERE external_id = 'QA-PCT-0001'`);
  await page.goto("/companies/acme-tech");
  await expect(page.getByRole("heading", { name: "Sample questions with answers" })).toBeVisible();
  await expect(page.getByTestId("public-question").first()).toBeVisible();
  const topicLink = page.locator('a[href^="/questions/"]').first();
  await expect(topicLink).toBeVisible();
  await expect(page.locator('a[href^="/problems/"]').first()).toBeVisible();
});

test("one visitor loading too many public pages a minute is asked to wait", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Same on every device");
  // A made-up address (documentation range), so no other test shares this allowance.
  const headers = { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}` };
  let last = 200;
  let retryAfter: string | undefined;
  for (let i = 0; i < 61; i++) {
    const response = await request.get("/mock-tests", { headers, maxRedirects: 0 });
    last = response.status();
    retryAfter = response.headers()["retry-after"];
  }
  expect(last).toBe(429);
  expect(Number(retryAfter)).toBeGreaterThan(0);
  // Visitors the host can't identify are never limited together.
  expect((await request.get("/mock-tests")).status()).toBe(200);
});
