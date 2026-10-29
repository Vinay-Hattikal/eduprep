import { expect, test } from "@playwright/test";
import { accounts, signInAs } from "./helpers";

// Job alerts and contest reminders can be turned off and on (D-059).
test("a student turns job alerts and mock reminders off and on", async ({ page }) => {
  await signInAs(page, accounts.fresher, "/account");
  const pref = page.getByTestId("alerts-preference");
  await expect(pref).toContainText("on");
  await pref.getByRole("button", { name: "Turn off" }).click();
  await expect(pref).toContainText("reminders: off");
  await pref.getByRole("button", { name: "Turn on" }).click();
  await expect(pref).toContainText("reminders: on");
});
