import { expect, test } from "@playwright/test";
import { startBookingNow } from "./db";
import { accounts, expectNoHorizontalScroll, signInAs, signOut } from "./helpers";

// Phase 5 exit criteria with the mock payment provider. Uses the experienced student so the
// fresher's free-plan state (learning.spec.ts) stays untouched.

test.describe("payments", () => {
  test("a failed payment can be retried, and Pro shows on the account", async ({ page }) => {
    await signInAs(page, accounts.experienced, "/pricing");
    await expectNoHorizontalScroll(page);
    await page.getByTestId("buy-pro-monthly").click();
    await expect(page.getByTestId("order-total")).toHaveText("₹299");
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/\/checkout\/[a-z0-9]+$/);

    await page.getByTestId("simulate-failure").click();
    await expect(page.getByTestId("payment-failed")).toBeVisible();
    await page.getByTestId("simulate-success").click();
    await expect(page.getByTestId("payment-success")).toContainText("Payment received");

    await page.getByRole("link", { name: "View invoice" }).click();
    await expect(page.getByTestId("invoice")).toContainText("Tax invoice");
    await expect(page.getByTestId("invoice")).toContainText("₹299");

    await page.goto("/account");
    await expect(page.getByText("Pro is active until")).toBeVisible();
    await expect(page.getByTestId("referral-code")).toHaveText(/^[A-Z2-9]{8}$/);
    await expectNoHorizontalScroll(page);
  });
});

test.describe("mock interviews", () => {
  test("buy a credit, book, interviewer scores, candidate reads and rates", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "the full booking flow runs once, on desktop");
    test.setTimeout(180_000);

    // Candidate buys one HR interview credit.
    await signInAs(page, accounts.experienced, "/checkout?kind=INTERVIEW_CREDITS&ref=hr&qty=1");
    await page.getByTestId("place-order").click();
    await page.getByTestId("simulate-success").click();
    await expect(page.getByTestId("payment-success")).toBeVisible();

    // …and books the seeded interviewer.
    await page.goto("/interviews");
    await page
      .getByTestId("interview-type")
      .filter({ hasText: "HR / behavioural" })
      .getByRole("link")
      .click();
    await expect(page.getByTestId("interviewer-card")).toHaveCount(1);
    await page.getByRole("link", { name: "See times" }).click();
    await page.getByTestId("slot-times").locator("label").first().click();
    await page
      .getByLabel(/What should the interviewer focus on/)
      .fill("Tell me about yourself; conflict stories.");
    await page.getByTestId("hold-slot").click();
    await expect(page).toHaveURL(/\/interviews\/checkout\//);
    await page.getByTestId("use-credit").click();
    await expect(page.getByText("You're booked")).toBeVisible();
    const bookingId = page.url().split("/interviews/")[1]!.split("?")[0]!;

    // The worker creates the meeting; the link appears on the booking.
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId("join-meeting")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await signOut(page);

    // The interviewer sees it, and (time travel) the interview is under way.
    await startBookingNow(bookingId);
    await signInAs(page, accounts.interviewer, `/interviewer/bookings/${bookingId}`);
    await expect(page.getByText("Tell me about yourself; conflict stories.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Join the meeting" })).toBeVisible();
    for (const key of ["communication", "self-awareness", "examples", "attitude"]) {
      await page.getByTestId(`score-${key}-4`).click();
    }
    await page.getByLabel("Strengths").fill("Clear structure and good examples from internships.");
    await page
      .getByLabel("What to work on")
      .fill("Quantify impact and keep answers under two minutes.");
    await page.getByTestId("recommend-BORDERLINE").click();
    await page.getByTestId("submit-scorecard").click();
    await expect(page.getByText("Scorecard sent")).toBeVisible();
    await page.goto("/interviewer/earnings");
    await expect(page.getByText("Balance to be paid")).toBeVisible();
    await signOut(page);

    // The candidate reads the scorecard and rates the interviewer.
    await signInAs(page, accounts.experienced, `/interviews/${bookingId}`);
    await expect(page.getByTestId("scorecard")).toContainText("Borderline");
    await expect(page.getByTestId("scorecard")).toContainText("Quantify impact");
    await page.getByRole("button", { name: "5 stars" }).click();
    await page.getByTestId("submit-rating").click();
    await expect(page.getByText("You rated this interview 5 / 5")).toBeVisible();
    await signOut(page);

    // Every message went to the dev outbox.
    await signInAs(page, accounts.admin, "/admin/notifications");
    await expect(page.getByTestId("outbox")).toContainText("Mock interview booked");
    await expect(page.getByTestId("outbox")).toContainText("scorecard is ready");
  });

  test("interview pages fit a 360 px phone", async ({ page }, info) => {
    test.skip(info.project.name !== "phone-360", "phone layout check");
    await signInAs(page, accounts.experienced);
    for (const route of [
      "/interviews",
      "/interviews/book/hr",
      "/account",
      "/tracks",
      "/tracks/service-to-product",
      "/design",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe("community and experienced track", () => {
  test("share an experience; a moderator publishes it on the company page", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    await signInAs(page, accounts.experienced, "/experiences/new?company=acme-tech");
    await page.getByLabel("Role").fill("Software Engineer");
    await page
      .getByLabel("Rounds")
      .fill(
        "Online test with aptitude and coding, then a technical interview and HR. Each about 45 minutes.",
      );
    await page
      .getByLabel("Questions asked")
      .fill("Reverse a linked list; difference between process and thread.");
    await page.getByTestId("share-experience").click();
    await expect(page.getByTestId("experience-sent")).toBeVisible();
    await signOut(page);

    await signInAs(page, accounts.admin, "/admin/experiences");
    const pending = page.getByTestId("pending-experience");
    await expect(pending.first()).toBeVisible();
    const before = await pending.count();
    await pending.first().getByTestId("approve-experience").click();
    await expect(pending).toHaveCount(before - 1);
    await page.goto("/companies/acme-tech/experiences");
    await expect(page.getByTestId("experience").first()).toContainText("Reverse a linked list");
  });

  test("tracks and the design bank", async ({ page }) => {
    await signInAs(page, accounts.experienced, "/tracks");
    await page
      .getByTestId("track-card")
      .filter({ hasText: "Service to product switch" })
      .getByRole("link")
      .click();
    await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
    await page.getByRole("link", { name: "Design a parking lot" }).click();
    await page.getByTestId("design-approach").locator("summary").click();
    await expect(page.getByTestId("design-approach")).toContainText("PricingStrategy");
  });
});
