// Job alerts and contest reminders (D-059).

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  scheduleContestReminder,
  scheduleJobDigest,
  sendContestReminder,
  sendJobDigest,
} from "@/server/services/alerts";
import { resetDatabase } from "./helpers";

let eligible: string;
let wrongBranch: string;
let optedOut: string;

async function student(email: string, branch: string, alertsOptIn = true) {
  const user = await db.user.create({
    data: {
      name: email.split("@")[0]!,
      email,
      roles: ["STUDENT"],
      profileType: "FRESHER",
      onboardedAt: new Date(),
      alertsOptIn,
      fresherProfile: { create: { branch, gradYear: 2026, cgpaBand: "8.0–8.9" } },
    },
  });
  return user.id;
}

const messages = (userId: string, template: string) =>
  db.notification.findMany({ where: { userId, template } });

beforeAll(async () => {
  await resetDatabase();
  eligible = await student("asha@test.example", "CSE");
  wrongBranch = await student("ravi@test.example", "MECH");
  optedOut = await student("meera@test.example", "CSE", false);
});

describe("daily job digest", () => {
  it("sends each opted-in student the new jobs they match, then queues the next digest", async () => {
    const base = {
      companyName: "Acme",
      locations: ["Pune"],
      workMode: "ONSITE" as const,
      jobType: "FULL_TIME" as const,
      audience: ["FRESHER" as const],
      description: "Build things.",
      applyUrl: "https://example.com/apply",
      status: "PUBLISHED" as const,
      branches: ["CSE"],
      gradYears: [2026],
    };
    await db.jobPosting.create({
      data: { ...base, slug: "acme-dev-1", title: "Developer", publishedAt: new Date() },
    });
    // Published before the digest window: not in this digest.
    await db.jobPosting.create({
      data: {
        ...base,
        slug: "acme-old-1",
        title: "Old role",
        publishedAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });

    await sendJobDigest(new Date(Date.now() - 86_400_000).toISOString());

    const sent = await messages(eligible, "jobs.digest");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]!.body).toContain("Developer at Acme");
    expect(sent[0]!.body).not.toContain("Old role");
    expect(await messages(wrongBranch, "jobs.digest")).toHaveLength(0);
    expect(await messages(optedOut, "jobs.digest")).toHaveLength(0);

    // Exactly one next digest is queued, however often scheduling is asked for.
    await scheduleJobDigest();
    expect(await db.job.count({ where: { type: "jobs.digest", status: "QUEUED" } })).toBe(1);
  });
});

describe("contest reminders", () => {
  it("queues a reminder on publish and sends it, unless the contest moved", async () => {
    const blueprint = await db.testBlueprint.create({
      data: { slug: "aim-format", title: "Format", kind: "COMPANY_MOCK", status: "PUBLISHED" },
    });
    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    const contest = await db.contest.create({
      data: {
        slug: "aim-week-1",
        title: "All-India mock, week 1",
        blueprintId: blueprint.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 86_400_000),
        status: "PUBLISHED",
      },
    });

    await scheduleContestReminder(contest.id, startsAt);
    const job = await db.job.findFirstOrThrow({ where: { type: "contest.reminder" } });
    expect(job.runAt.getTime()).toBe(startsAt.getTime() - 86_400_000);

    await sendContestReminder(contest.id, new Date(startsAt.getTime() + 60_000).toISOString());
    expect(await messages(eligible, "contest.reminder")).toHaveLength(0); // moved: skipped

    await sendContestReminder(contest.id, startsAt.toISOString());
    expect(await messages(eligible, "contest.reminder")).not.toHaveLength(0);
    expect(await messages(wrongBranch, "contest.reminder")).not.toHaveLength(0);
    expect(await messages(optedOut, "contest.reminder")).toHaveLength(0);
  });
});
