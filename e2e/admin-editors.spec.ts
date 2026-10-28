import { expect, test } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

// Drafts created here use e2e- IDs (see progress.md: e2e tests share the dev database).
const stamp = () => Date.now().toString(36);

test("an admin writes a coding problem and its reference solution in the admin panel", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once; phone layout checked below");
  const id = stamp();
  await signInAs(page, accounts.admin, "/admin/problems");
  await page.getByRole("link", { name: "New problem" }).click();
  await expect(page).toHaveURL("/admin/problems/new");

  const form = page.getByRole("form", { name: "Coding problem" });
  await form.getByLabel("ID", { exact: true }).fill(`e2e-${id}`);
  await form.getByLabel("URL slug").fill(`e2e-problem-${id}`);
  await form.getByLabel("Title", { exact: true }).fill(`E2E problem ${id}`);
  await form.getByLabel("Statement (Markdown)").fill("Read a number and print it back.");
  await form.getByLabel("Input format").fill("One integer.");
  await form.getByLabel("Output format").fill("The same integer.");
  await form.getByLabel("Constraints").fill("0 <= n <= 100");

  // Forgetting the topic shows a field error and keeps what was typed.
  await page.getByTestId("save-problem").click();
  await expect(form.getByText("Choose at least one DSA topic.")).toBeVisible();
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue(`E2E problem ${id}`);

  await form.getByRole("checkbox", { name: "Arrays" }).check();
  await page.getByTestId("save-problem").click();
  await expect(page.getByText("Problem created as a draft")).toBeVisible();

  const add = page.getByRole("form", { name: "Solution code" }).last();
  await add.getByLabel("Language").selectOption("python");
  await add.getByLabel("Code").fill("print(input())");
  await add.getByRole("button", { name: "Add code" }).click();
  await expect(page.getByText("Code saved")).toBeVisible();
  await expect(page.getByText("reference", { exact: true })).toBeVisible();
});

test("an admin writes a passage with a live preview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  const id = stamp();
  await signInAs(page, accounts.admin, "/admin/passages/new");
  const form = page.getByRole("form", { name: "Passage" });
  await form.getByLabel("ID", { exact: true }).fill(`e2e-rc-${id}`);
  await form.getByLabel("Title", { exact: true }).fill(`E2E passage ${id}`);
  await form.getByLabel(/^Passage/).fill("| City | Rain |\n|---|---|\n| Pune | 72 |");
  await expect(form.getByRole("cell", { name: "Pune" })).toBeVisible();
  await form.getByRole("button", { name: "Create passage" }).click();
  await expect(page.getByText("Passage created")).toBeVisible();
  await expect(page.getByText("No questions use it yet.")).toBeVisible();
});

test("an ops admin opens an interview type's rubric", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  await signInAs(page, accounts.admin, "/admin/interview-types");
  await page.getByRole("link", { name: /HR/ }).first().click();
  const form = page.getByRole("form", { name: "Interview type" });
  await expect(form.getByLabel("URL slug")).toHaveAttribute("readonly", "");
  await expect(form.getByLabel("Item 1", { exact: true })).not.toHaveValue("");
  await form.getByRole("button", { name: "Add item" }).click();
  const items = await form.getByRole("listitem").count();
  await expect(form.getByLabel(`Item ${items}`, { exact: true })).toHaveValue("");
});

test("the new admin editors fit a 360 px phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-360", "Phone layout check");
  await signInAs(page, accounts.admin);
  for (const path of [
    "/admin/problems/new",
    "/admin/design/new",
    "/admin/tracks",
    "/admin/tracks/new",
    "/admin/interview-types",
    "/admin/interview-types/new",
    "/admin/passages",
    "/admin/passages/new",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
