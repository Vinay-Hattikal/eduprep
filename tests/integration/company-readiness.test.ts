// Company workspace part 2 (D-067): the Overview checklist, section coverage and "Publish
// everything" on a company built by hand.

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { draftFromCompany, saveBlueprint } from "@/server/services/blueprints";
import { getCompanyBySlug } from "@/server/services/companies";
import { companyPublishPlan, publishCompanyContent } from "@/server/services/company-publish";
import { companyReadiness } from "@/server/services/company-readiness";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let admin: { id: string; roles: "ADMIN"[] };
let companyId: string;

async function readiness() {
  return companyReadiness((await getCompanyBySlug("readiness-co"))!);
}

beforeAll(async () => {
  await resetDatabase();
  admin = { id: (await createUser(["ADMIN"], "admin@test.example")).id, roles: ["ADMIN"] };
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), admin.id);
  const topic = await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } });

  const company = await db.company.create({
    data: {
      slug: "readiness-co",
      name: "Readiness Co",
      level: "STANDARD",
      category: "SERVICE",
      hiringFor: ["FRESHER"],
      overview:
        "A services company that hires freshers every year through an online aptitude test and two interviews.",
      lastVerifiedAt: new Date(),
      rounds: {
        create: {
          order: 1,
          name: "Online test",
          type: "ONLINE_TEST",
          sections: {
            create: {
              order: 1,
              name: "Quant",
              type: "MCQ",
              questionCount: 2,
              minutes: 10,
              topics: { connect: { id: topic.id } },
            },
          },
        },
      },
    },
  });
  companyId = company.id;

  // Two good drafts and one that fails the automatic checks (no correct option), all tagged.
  for (const [n, correct] of [
    [1, ["A"]],
    [2, ["B"]],
    [3, []],
  ] as const) {
    await db.question.create({
      data: {
        externalId: `QA-RC-${n}`,
        subjectId: topic.subjectId,
        topicId: topic.id,
        type: "SINGLE",
        text: `What is ${n * 10}% of 100?`,
        options: ["10", "20", "30"],
        correctOptions: [...correct],
        explanation: "Percent means per hundred.",
        difficulty: "EASY",
        expectedTimeSec: 30,
        companies: { create: { companyId } },
      },
    });
  }
  const draft = await draftFromCompany(companyId);
  const saved = await saveBlueprint(draft!, admin);
  if (!saved.ok) throw new Error(JSON.stringify(saved));
});

describe("company readiness", () => {
  it("lists what's missing and points at the next step", async () => {
    const r = await readiness();
    const item = (key: string) => r.items.find((i) => i.key === key)!;
    expect(item("process").done).toBe(true);
    expect(item("sources").done).toBe(false);
    expect(item("questions")).toMatchObject({ done: false, detail: "0 published, 3 draft" });
    expect(item("coding")).toMatchObject({ done: true, detail: "No coding round" });
    expect(item("coverage")).toMatchObject({ done: false, detail: "Short: Percentages 0/2" });
    expect(item("mock")).toMatchObject({ done: false, detail: "Drafted, not published" });
    expect(r.next).toMatchObject({ key: "sources" });
    expect(r.coverage).toEqual([
      expect.objectContaining({ name: "Percentages", need: 2, available: 0, tagged: 0 }),
    ]);
  });

  it("publishes what's ready and explains what stays draft", async () => {
    const before = (await companyPublishPlan(companyId))!;
    expect(before.questions.ready).toHaveLength(2);
    expect(before.questions.failing).toEqual(["QA-RC-3"]);
    expect(before.company.blocker).toMatch(/source/);
    // The mock needs the two questions that are still drafts.
    expect(before.mocks[0]!.blockers.join()).toMatch(/needs 2, only 0/);

    await db.companySource.create({
      data: { companyId, label: "Careers", url: "https://example.com/c", checkedOn: new Date() },
    });
    const result = await publishCompanyContent(companyId, admin);
    if ("error" in result) throw new Error(result.error);
    expect(result).toMatchObject({ questions: 2, problems: 0, mocks: 1, company: true });
    expect(result.notes).toEqual([
      "QA-RC-3 fails the automatic checks. Open it and fix the errors.",
    ]);

    const r = await readiness();
    expect(r.items.filter((i) => !i.done).map((i) => i.key)).toEqual([]);
    expect(r.coverage[0]).toMatchObject({ available: 2, tagged: 2 });
    expect(await db.auditLog.count({ where: { action: "company.publish_all" } })).toBe(1);
  });

  it("refuses an archived company", async () => {
    await db.company.update({ where: { id: companyId }, data: { status: "ARCHIVED" } });
    expect(await companyPublishPlan(companyId)).toBeNull();
    expect(await publishCompanyContent(companyId, admin)).toEqual({
      error: "This company no longer exists or is archived.",
    });
  });
});
