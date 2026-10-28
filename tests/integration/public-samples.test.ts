// Public sample questions and sitemap dates (D-058).

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { saveRound } from "@/server/services/company-hiring";
import { linkToCompany } from "@/server/services/company-links";
import { bulkPublicSample, setPublicSample, transitionQuestion } from "@/server/services/questions";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let admin: { id: string; roles: "ADMIN"[] };

beforeAll(async () => {
  await resetDatabase();
  admin = { id: (await createUser(["ADMIN"], "admin@test.example")).id, roles: ["ADMIN"] };
  for (const [type, file] of [
    ["TAXONOMY", "taxonomy.csv"],
    ["COMPANIES", "companies/companies.csv"],
    ["MCQ", "mcq/quantitative-aptitude.csv"],
  ] as const) {
    await importFile(type, file, await template(file), admin.id);
  }
});

/** Three valid draft questions in one topic, created once. */
const drafts: { id: string }[] = [];
async function draftsInOneTopic() {
  if (!drafts.length) {
    const topic = await db.topic.findUniqueOrThrow({ where: { slug: "averages" } });
    for (const n of [1, 2, 3]) {
      drafts.push(
        await db.question.create({
          data: {
            externalId: `QA-AVG-SAMPLE-${n}`,
            subjectId: topic.subjectId,
            topicId: topic.id,
            type: "SINGLE",
            text: `What is the average of ${n}, ${n + 2} and ${n + 4}?`,
            options: [String(n + 1), String(n + 2), String(n + 3)],
            correctOptions: ["B"],
            explanation: "The middle number of an evenly spaced list is its average.",
            difficulty: "EASY",
            expectedTimeSec: 30,
          },
        }),
      );
    }
  }
  return { questions: drafts };
}

describe("public samples", () => {
  it("marks newly published questions until the topic has enough, then stops", async () => {
    const { questions } = await draftsInOneTopic();
    expect(questions.length).toBeGreaterThanOrEqual(2);
    await db.setting.upsert({
      where: { key: "seo.publicSamplesPerTopic" },
      create: { key: "seo.publicSamplesPerTopic", value: 1 },
      update: { value: 1 },
    });

    const [first, second] = questions;
    expect(await transitionQuestion(first!.id, "publish", admin)).toEqual({ ok: true });
    expect(await transitionQuestion(second!.id, "publish", admin)).toEqual({ ok: true });
    const after = await db.question.findMany({
      where: { id: { in: [first!.id, second!.id] } },
      orderBy: { externalId: "asc" },
    });
    expect(after.map((q) => q.publicSample)).toEqual([true, false]);
  });

  it("can be switched by hand, one or many, and is audited", async () => {
    const { questions } = await draftsInOneTopic();
    const second = questions[1]!;
    expect(await setPublicSample(second.id, true, admin)).toBe(true);
    expect(await setPublicSample(second.id, true, admin)).toBe(false); // no change
    expect(await bulkPublicSample([questions[0]!.id, second.id], false, admin)).toBe(2);
    expect(await db.question.count({ where: { publicSample: true } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: { action: { in: ["question.public_sample", "question.private_answer"] } },
      }),
    ).toBe(3);
  });

  it("turns off the automatic choice with 0", async () => {
    await db.setting.update({ where: { key: "seo.publicSamplesPerTopic" }, data: { value: 0 } });
    const { questions } = await draftsInOneTopic();
    const third =
      questions[2] ?? (await db.question.findFirstOrThrow({ where: { status: "DRAFT" } }));
    await transitionQuestion(third.id, "publish", admin);
    expect((await db.question.findUniqueOrThrow({ where: { id: third.id } })).publicSample).toBe(
      false,
    );
  });
});

describe("company sitemap date", () => {
  it("moves when the hiring process, links or listed questions change", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: "acme-tech" } });
    const stamp = async () =>
      (await db.company.findUniqueOrThrow({ where: { id: company.id } })).updatedAt.getTime();
    const old = new Date("2020-01-01T00:00:00Z");
    const reset = () => db.company.update({ where: { id: company.id }, data: { updatedAt: old } });

    await reset();
    await saveRound(
      {
        companyId: company.id,
        name: "Extra round",
        type: "HR_INTERVIEW",
        platform: null,
        durationMin: null,
        isElimination: null,
        description: null,
      },
      admin,
    );
    expect(await stamp()).toBeGreaterThan(old.getTime());

    await reset();
    const question = await db.question.findFirstOrThrow({
      where: { status: "DRAFT", companies: { none: { companyId: company.id } } },
    });
    await linkToCompany(company.id, { questionId: question.id }, admin);
    expect(await stamp()).toBeGreaterThan(old.getTime());

    await reset();
    await transitionQuestion(question.id, "publish", admin);
    expect(await stamp()).toBeGreaterThan(old.getTime());
  });
});
