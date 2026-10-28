import { expect, test } from "@playwright/test";
import { accounts, expectNoHorizontalScroll, signInAs } from "./helpers";

// Runs against the published sample content and freshly reset students (scripts/e2e-server.mjs).

test.describe("student learning", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Flows run once, on desktop");

  test("a new student is onboarded before anything else", async ({ page }) => {
    await signInAs(page, "new-student@example.com");
    await expect(page).toHaveURL("/onboarding");
    await expect(
      page.getByRole("heading", { name: "Let's set up your preparation" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle"); // let the form hydrate before typing

    await page.getByLabel("College").fill("Example Institute of Technology");
    await page.getByLabel("Degree").selectOption("B.Tech");
    await page.getByLabel("Branch").selectOption("CSE");
    await page.getByLabel("Graduation year").selectOption({ index: 3 });
    await page.getByLabel("CGPA").selectOption("8.0–8.9");
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByLabel("Company 1", { exact: true })
      .selectOption({ label: "Acme Technologies (EXAMPLE - not real data)" });
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByText("Python", { exact: true }).click();
    await page.getByTestId("finish-onboarding").click();

    await expect(page).toHaveURL("/dashboard?welcome=1");
    await expect(page.getByText("You're all set")).toBeVisible();
    await expect(page.getByRole("meter", { name: /Readiness for Acme/ })).toBeVisible();
  });

  test("practice: a correct answer shows the explanation and raises mastery", async ({ page }) => {
    await signInAs(page, accounts.fresher, "/practice");
    await page.getByRole("link", { name: /Quantitative Aptitude/ }).click();
    await page.getByRole("link", { name: "Practise Percentages" }).click();

    await expect(page.getByText("The price of an item rises by 20%")).toBeVisible();
    await page.getByRole("radio", { name: /4% decrease/ }).click();
    await page.getByTestId("check-answer").click();

    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await expect(page.getByText("Explanation", { exact: true })).toBeVisible();
    await expect(page.getByText(/Percentages: 0% → 33%/)).toBeVisible();
  });

  test("practice: a wrong answer becomes a mistake you can retry", async ({ page }) => {
    await signInAs(page, accounts.fresher, "/practice/session?topic=averages");
    await expect(page.getByText(/average of 5 numbers is 18/)).toBeVisible();
    await page.getByLabel("Your answer").fill("25");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Not quite")).toBeVisible();
    await expect(page.getByText("Correct answer:")).toContainText("26");

    await page.getByTestId("bookmark").click();
    await expect(page.getByTestId("bookmark")).toHaveAttribute("aria-pressed", "true");

    await page.goto("/practice");
    await expect(page.getByTestId("mistakes-link")).toContainText("1 to retry");
    await page.getByTestId("mistakes-link").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Retry your mistakes" }),
    ).toBeVisible();
    await page.getByLabel("Your answer").fill("26");
    await page.getByTestId("check-answer").click();
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  });

  test("practice: reporting a problem reaches the admin, and the reply reaches the student", async ({
    page,
  }) => {
    await signInAs(page, accounts.fresher, "/practice/session?topic=time-work");
    await page.getByRole("button", { name: "Report" }).click();
    await page.getByLabel("What's wrong?").selectOption("TYPO");
    await page.getByLabel("Details").fill("Option D should read 12.5 days, not 12.5.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("We'll check it and reply on your dashboard")).toBeVisible();

    await page.context().clearCookies();
    await signInAs(page, accounts.admin, "/admin/reports");
    const report = page.getByRole("listitem").filter({ hasText: "Option D should read 12.5 days" });
    await report.getByLabel("Reply to the student").fill("Thanks! We've clarified option D.");
    await report.getByRole("button", { name: "Fixed" }).click();
    // Closed reports leave the "Open" list straight away.
    await expect(report).toHaveCount(0);

    await page.context().clearCookies();
    await signInAs(page, accounts.fresher, "/dashboard");
    await expect(page.getByText("Thanks! We've clarified option D.")).toBeVisible();
  });

  test("the question of the day and the dashboard reflect practice", async ({ page }) => {
    await signInAs(page, accounts.fresher, "/practice/daily");
    await expect(
      page.getByRole("heading", { level: 1, name: "Question of the day" }),
    ).toBeVisible();
    const numeric = page.getByLabel("Your answer");
    if (await numeric.isVisible()) await numeric.fill("1");
    else
      await page
        .getByRole("group")
        .or(page.getByRole("radiogroup"))
        .locator("button")
        .first()
        .click();
    await page.getByTestId("check-answer").click();
    await expect(page.getByText(/^(Correct|Not quite)$/)).toBeVisible();

    await page.goto("/dashboard");
    await expect(
      page.getByText("days in a row · best 1").or(page.getByText("day in a row · best 1")),
    ).toBeVisible();
    await expect(page.getByRole("meter", { name: /Readiness for Acme/ })).toHaveAttribute(
      "aria-valuenow",
      /\d+/,
    );
  });

  test("progress shows charts with a table view and topic mastery", async ({ page }) => {
    await signInAs(page, accounts.fresher, "/progress");
    await expect(page.getByText("Questions answered per day, last 30 days")).toBeVisible();
    await page.getByText("Show as table").first().click();
    await expect(page.getByRole("columnheader", { name: "Answered" })).toBeVisible();
    await expect(page.getByRole("meter", { name: "Percentages mastery" })).toBeVisible();
  });

  test("a signed-in fresher sees their eligibility on a company page", async ({ page }) => {
    await signInAs(page, accounts.fresher, "/companies/acme-tech");
    await expect(page.getByTestId("eligibility")).toContainText("You're eligible");
    await expect(page.getByRole("button", { name: "In your targets" })).toBeVisible();
  });
});

test.describe("public company pages", () => {
  test("the directory and a company page work for guests", async ({ page }) => {
    await page.goto("/companies");
    await expect(page.getByRole("heading", { level: 1, name: "Companies" })).toBeVisible();
    await page.getByRole("link", { name: /Acme Technologies/ }).click();

    await expect(page).toHaveURL("/companies/acme-tech");
    await expect(page.getByRole("heading", { level: 1, name: /Acme Technologies/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hiring process" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Online Assessment sections" })).toContainText(
      "Numerical Ability",
    );
    await expect(page.getByText("Sign in to check your eligibility")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in to prepare" })).toBeVisible();
    await expect(page).toHaveTitle(/Acme Technologies.*hiring process/);
    await expectNoHorizontalScroll(page);

    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(jsonLd!)["@graph"][0]).toMatchObject({ "@type": "Organization" });
  });

  test("search filters the directory", async ({ page }) => {
    await page.goto("/companies?q=zzzz-no-match");
    await expect(page.getByText("No companies match")).toBeVisible();
  });

  test("sitemap and robots are served", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain("/companies/acme-tech");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/admin/);
  });
});

test("practice and company pages fit a 360 px phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-360", "Phone layout check");
  await signInAs(page, accounts.experienced);
  for (const route of [
    "/dashboard",
    "/practice",
    "/practice/quantitative-aptitude",
    "/practice/session?topic=percentages",
    "/progress",
    "/companies/acme-tech",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
