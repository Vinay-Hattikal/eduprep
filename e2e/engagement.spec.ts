import { expect, test, type Page } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

// Phase 7: jobs board, All-India mocks, discussions, drive reports, badges and sharing.
// Every test runs on desktop and on a phone against the same database, so each one copes with
// what the other project already did (a contest can only be taken once).

/** Answers whatever question is showing. */
async function answerCurrent(page: Page) {
  const numeric = page.getByLabel("Your answer");
  if (await numeric.isVisible()) await numeric.fill("1");
  else
    await page
      .getByRole("group")
      .or(page.getByRole("radiogroup"))
      .locator("button")
      .first()
      .click();
}

test.describe("jobs board", () => {
  test("finds a job, applies on the company site and saves it", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: "Graduate Engineer Trainee" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Graduate Engineer Trainee" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    // "Apply" counts the click and sends the student to the employer.
    const href = await page.getByTestId("apply-job").getAttribute("href");
    const response = await page.request.get(href!, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe("https://example.com/careers/get");

    await signInAs(page, accounts.fresher, "/jobs");
    const card = page.getByTestId("job-card").filter({ hasText: "Graduate Engineer Trainee" });
    const save = card.getByTestId("save-job");
    if ((await save.getAttribute("aria-pressed")) !== "true") await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await page.goto("/jobs?saved=1");
    await expect(
      page.getByTestId("job-card").filter({ hasText: "Graduate Engineer Trainee" }),
    ).toBeVisible();
  });

  test("an admin posts a job and it goes live", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "admin screens are checked on desktop");
    // "E2E " postings are removed when the test students are reset (load-sample-content.ts).
    const title = `E2E Associate Engineer ${Date.now()}`;
    await signInAs(page, accounts.admin, "/admin/postings/new");
    await page.getByLabel("Job title").fill(title);
    await page.getByLabel("Employer").fill("Initech (EXAMPLE)");
    await page.getByLabel("Application link").fill("https://example.com/careers/associate");
    await page.getByLabel("Locations").fill("Chennai");
    await page
      .getByLabel("Description")
      .fill("Work on internal platforms with a mentor. Training in the first month.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/admin\/postings\/[^/]+\?saved=1/);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Status updated.")).toBeVisible();

    await page.goto(`/jobs?q=${encodeURIComponent(title)}`);
    await expect(page.getByTestId("job-card").filter({ hasText: title })).toBeVisible();
  });
});

test.describe("All-India mock", () => {
  test("takes the test once and sees a live rank", async ({ page }) => {
    test.setTimeout(150_000);
    await signInAs(page, accounts.experienced, "/contests");
    await expect(page.getByTestId("contest-card").first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto("/contests/all-india-mock-sample");
    const start = page.getByTestId("start-contest");
    const resume = page.getByRole("link", { name: "Resume" });
    const standing = page.getByTestId("contest-standing");
    await expect(start.or(resume).or(standing)).toBeVisible();

    if (!(await standing.isVisible())) {
      await ((await start.isVisible()) ? start : resume).click();
      await expect(page).toHaveURL(/\/exam\//);
      await expect(page.getByTestId("exam-runner")).toBeVisible();
      for (let i = 0; i < 20; i++) {
        const numeric = page.getByLabel("Your answer");
        const option = page.getByTestId("option-A");
        await expect(numeric.or(option)).toBeVisible();
        if (await numeric.isVisible()) await numeric.fill("42");
        else await option.click();
        const next = page.getByTestId("next-question");
        if (!(await next.isVisible())) break;
        await next.click();
      }
      await page.getByTestId("submit-test").click();
      await page.getByTestId("confirm-submit").click();
      await expect(page).toHaveURL(/\/tests\/results\//, { timeout: 30_000 });
      // Others are still taking it: no answers yet.
      await expect(page.getByTestId("solutions-hidden")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.goto("/contests/all-india-mock-sample");
    }

    await expect(standing).toContainText("Rank so far");
    await expect(page.getByTestId("leaderboard")).toContainText("(you)");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("discussions", () => {
  test("opens after answering and takes a comment", async ({ page }) => {
    const comment = `Base 100 makes this quick (${Date.now()})`;
    await signInAs(page, accounts.experienced, "/practice/session?topic=percentages");
    await answerCurrent(page);
    await page.getByTestId("check-answer").click();
    await expect(page.getByText(/^(Correct|Not quite)$/)).toBeVisible();

    await page.getByTestId("discussion-toggle").click();
    await page.getByTestId("comment-input").fill(comment);
    await page.getByRole("button", { name: "Post" }).click();
    await expect(page.getByTestId("comment").filter({ hasText: comment })).toBeVisible();
    await expect(page.getByTestId("comment").filter({ hasText: comment })).toContainText("You");
    await expectNoHorizontalScroll(page);
  });

  test("moderators see the queue", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "admin screens are checked on desktop");
    await signInAs(page, accounts.admin, "/admin/discussions?tab=recent");
    await expect(page.getByRole("heading", { level: 1, name: "Discussions" })).toBeVisible();
    await expect(page.getByTestId("moderation-comment").first()).toBeVisible();
  });
});

test.describe("asked today", () => {
  test("a drive report goes live on the company page once approved", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "moderation is checked on desktop");
    const question = `A boat goes 12 km upstream in 3 hours; find its speed (${Date.now()})`;
    await signInAs(page, accounts.fresher, "/asked/new?company=acme-tech");
    await page.getByLabel("What was asked?").fill(question);
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByTestId("drive-report-sent")).toBeVisible();

    await signInAs(page, accounts.admin, "/admin/drive-reports");
    const card = page.getByTestId("pending-drive-report").filter({ hasText: question });
    await card.getByTestId("approve-drive-report").click();
    await expect(card).toHaveCount(0);

    await page.goto("/companies/acme-tech");
    await expect(page.getByTestId("recent-drives")).toContainText(question);
  });

  test("the form fits a phone", async ({ page }) => {
    await signInAs(page, accounts.fresher, "/asked/new");
    await expect(page.getByLabel("What was asked?")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("achievements", () => {
  test("shows badges and shares one publicly", async ({ page, browser }, info) => {
    // The experienced student has finished tests by now (mock tests and the All-India mock).
    await signInAs(page, accounts.experienced, "/achievements");
    await expect(page.getByTestId("badge-earned").first()).toBeVisible();
    await expect(page.getByTestId("freeze-count")).toBeVisible();
    await expectNoHorizontalScroll(page);
    // Phones may open the system share sheet instead of the dialog; the link is checked on desktop.
    test.skip(info.project.name !== "desktop", "share dialog is checked on desktop");

    await page.getByTestId("badge-earned").first().getByTestId("share-button").click();
    const url = await page.getByTestId("share-url").inputValue();
    expect(url).toMatch(/\/s\/[A-Za-z0-9_-]{12}$/);

    const visitor = await browser.newContext();
    const publicPage = await visitor.newPage();
    const path = new URL(url).pathname;
    await publicPage.goto(path);
    await expect(
      publicPage.getByRole("heading", { name: /Prepare for placements like/ }),
    ).toBeVisible();
    const image = await publicPage.request.get(`${path}/image`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    await visitor.close();
  });
});
