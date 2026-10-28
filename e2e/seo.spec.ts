import { expect, test } from "@playwright/test";
import { accounts, signInAs } from "./helpers";

// What search engines see (D-058).

test("the sitemap lists public pages and robots.txt keeps private areas out", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Same on every device");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/companies", "/companies/acme-tech", "/pricing", "/jobs", "/privacy"])
    expect(sitemap).toContain(`${path}<`);
  expect(sitemap).not.toContain("/admin");

  const robots = await (await request.get("/robots.txt")).text();
  for (const path of ["/admin", "/practice", "/dashboard"])
    expect(robots).toContain(`Disallow: ${path}`);
});

test("an admin marks a question as a public sample", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  await signInAs(page, accounts.admin, "/admin/questions?q=QA-PCT-0001");
  await page.getByRole("link", { name: "QA-PCT-0001" }).click();
  const box = page.getByTestId("public-sample");
  const wasChecked = (await box.getAttribute("data-state")) === "checked";
  await box.click();
  // Save and publish keeps the sample question live for the other tests.
  await page.getByTestId("save-publish-question").click();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  await expect(page.getByTestId("public-sample")).toHaveAttribute(
    "data-state",
    wasChecked ? "unchecked" : "checked",
  );
});
