import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll } from "./helpers";

test("landing page shows the pitch and a way in", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Prepare for the company you want, not just any test",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" }).first()).toBeVisible();
  await expect(page).toHaveTitle(/AnyPrep/);
  await expectNoHorizontalScroll(page);
});

test("theme can be switched to dark and back", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("menu")).toHaveCount(0);

  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("unknown pages show a friendly 404", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
