import { expect, test } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

test("a super admin changes a setting and it appears in the audit log", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Covered once; layout checked separately on phones",
  );
  await signInAs(page, accounts.admin, "/admin/settings");

  const field = page.getByLabel("MCQs per day");
  const original = await field.inputValue();
  const changed = original === "30" ? "31" : "30";

  const form = page.locator("form").filter({ has: field });
  await field.fill(changed);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("MCQs per day saved")).toBeVisible();

  await page.goto("/admin/audit-log");
  const latest = page.getByRole("row").nth(1);
  await expect(latest).toContainText("setting.update");
  await expect(latest).toContainText("limits.freeMcqPerDay");

  // Put the value back so the test can run again.
  await page.goto("/admin/settings");
  await page.getByLabel("MCQs per day").fill(original);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("MCQs per day") })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByText("MCQs per day saved")).toBeVisible();
});

test("settings rejects values outside the allowed range", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  await signInAs(page, accounts.admin, "/admin/settings");

  const field = page.getByLabel("Interviewer share");
  await field.fill("150");
  await page.locator("form").filter({ has: field }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter a valid number in the allowed range.")).toBeVisible();
});

test("admin pages fit a 360 px phone and the menu opens", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-360", "Phone layout check");
  await signInAs(page, accounts.admin);

  for (const path of ["/admin", "/admin/settings", "/admin/users", "/admin/audit-log"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL("/admin/settings");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
