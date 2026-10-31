import { expect, test } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

// Solving and tests use the experienced student, so the fresher's practice state
// (learning.spec.ts) stays untouched. Hints use the fresher, who hasn't solved the problem.

// One-line Python so the editor's auto-indent can't change it.
const SOLUTION =
  'import sys;d=sys.stdin.read().split();n,t=int(d[0]),int(d[1]);a=list(map(int,d[2:2+n]));s=set();print("YES" if any(t-x in s or s.add(x) for x in a) else "NO")';

test.describe("coding", () => {
  test("solves a problem in the workspace", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, accounts.experienced, "/coding");
    await expect(page.getByTestId("problem-list")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: /Pair With Target Sum/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Pair With Target Sum" }),
    ).toBeVisible();

    await page.getByTestId("language-select").selectOption("python");
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(SOLUTION);

    await page.getByTestId("run-code").click();
    await expect(page.getByTestId("submission-result")).toContainText("Sample tests passed", {
      timeout: 60_000,
    });

    await page.getByTestId("submit-code").click();
    await expect(page.getByTestId("submission-result")).toContainText("Accepted", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("submission-result")).toContainText("6/6 tests passed");
    await expect(page.getByRole("region", { name: "Code" }).getByText("Solved")).toBeVisible({
      timeout: 15_000,
    });
    await expectNoHorizontalScroll(page);
  });

  test("reveals hints one at a time", async ({ page }) => {
    await signInAs(page, accounts.fresher, "/coding/pair-with-target-sum");
    await page.getByRole("tab", { name: "Hints" }).click();
    await page.getByTestId("reveal-hint").click();
    await expect(page.getByTestId("hints-panel")).toContainText("Hint 1");
    await expect(page.getByTestId("hints-panel")).not.toContainText("Hint 2");
  });
});

test.describe("mock tests", () => {
  test("takes a timed test and sees the result", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, accounts.experienced, "/tests");
    await expect(page.getByTestId("test-card").first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto("/tests/aptitude-quick-test");
    const resume = page.getByRole("link", { name: "Resume test" });
    const start = page.getByTestId("start-test");
    await expect(start.or(resume)).toBeVisible();
    if (await resume.isVisible()) {
      await resume.click();
    } else {
      await page.getByLabel(/I've read the instructions/).check();
      await page.getByTestId("start-test").click();
    }
    await expect(page).toHaveURL(/\/exam\//);
    const runner = page.getByTestId("exam-runner");
    await expect(runner).toBeVisible();
    await expect(page.getByTestId("exam-timer")).toHaveText(/\d\d:\d\d/);
    await expectNoHorizontalScroll(page);

    // Answer every question (A, or 42 for numeric ones); mark the first for review.
    for (let i = 0; i < 20; i++) {
      const numeric = page.getByLabel("Your answer");
      const option = page.getByTestId("option-A");
      await expect(numeric.or(option)).toBeVisible();
      if (await numeric.isVisible()) {
        await numeric.fill("42");
      } else {
        await option.click();
        await expect(option).toHaveAttribute("aria-checked", "true");
      }
      if (i === 0) {
        await page.getByTestId("mark-review").click();
        continue;
      }
      const next = page.getByTestId("next-question");
      if (!(await next.isVisible())) break;
      await next.click();
    }

    await page.getByTestId("submit-test").click();
    await expect(page.getByRole("dialog")).toContainText("Submit the test?");
    await page.getByTestId("confirm-submit").click();

    await expect(page).toHaveURL(/\/tests\/results\//, { timeout: 30_000 });
    await expect(page.getByTestId("result-summary")).toContainText("Score");
    await expect(page.getByRole("heading", { name: "Solutions" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto("/tests");
    await expect(page.getByRole("heading", { name: "Your recent tests" })).toBeVisible();
  });
});

test.describe("admin", () => {
  test("sees problems checked in the judge, tests and the job monitor", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "admin screens are checked on desktop");
    // Searched, because problems made by earlier runs push it off the first page.
    await signInAs(page, accounts.admin, "/admin/problems?q=Pair%20With%20Target%20Sum");
    await expect(page.getByRole("row", { name: /Pair With Target Sum/ })).toContainText("Passed");
    await page.getByRole("link", { name: "Pair With Target Sum" }).click();
    await expect(page.getByTestId("judge-check")).toContainText("✓ reference (python)");

    await page.goto("/admin/tests");
    await expect(page.getByRole("link", { name: "Aptitude quick test" })).toBeVisible();
    await page.getByRole("link", { name: /Acme.*mock test/ }).click();
    await expect(page.getByTestId("blueprint-section").first()).toBeVisible();

    await page.goto("/admin/jobs");
    await expect(page.getByText("code.judge")).toBeVisible();
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { level: 1, name: "Content analytics" })).toBeVisible();
  });
});
