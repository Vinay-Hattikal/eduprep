// Publishing in bulk (D-064): "Publish after import" and the bulk action follow the same rules
// as publishing one question, in a few queries per 500 questions.

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { publishQuestions } from "@/server/services/questions";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let admin: { id: string; roles: "ADMIN"[] };
const COUNT = 1_200;

beforeAll(async () => {
  await resetDatabase();
  admin = { id: (await createUser(["ADMIN"], "admin@test.example")).id, roles: ["ADMIN"] };
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), admin.id);
  await db.setting.upsert({
    where: { key: "seo.publicSamplesPerTopic" },
    create: { key: "seo.publicSamplesPerTopic", value: 3 },
    update: { value: 3 },
  });
});

async function drafts(prefix: string, count: number, valid = true) {
  const topic = await db.topic.findUniqueOrThrow({ where: { slug: "averages" } });
  await db.question.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      externalId: `${prefix}-${String(i).padStart(5, "0")}`,
      subjectId: topic.subjectId,
      topicId: topic.id,
      type: "SINGLE" as const,
      text: `What is the average of ${i}, ${i + 2} and ${i + 4}?`,
      options: [String(i + 1), String(i + 2), String(i + 3)],
      correctOptions: valid ? ["B"] : [],
      explanation: "The middle number of an evenly spaced list is its average.",
      difficulty: "EASY" as const,
      expectedTimeSec: 30,
    })),
  });
  return (
    await db.question.findMany({
      where: { externalId: { startsWith: prefix } },
      select: { id: true },
    })
  ).map((q) => q.id);
}

describe("publishQuestions", () => {
  it("publishes a large batch quickly, with history, audit and the sample limit", async () => {
    const ids = await drafts("QA-BULK", COUNT);
    const [broken] = await drafts("QA-BROKEN", 1, false);

    const started = performance.now();
    const result = await publishQuestions([...ids, broken!, "missing-id"], admin);
    const seconds = (performance.now() - started) / 1000;

    expect(result.done).toBe(COUNT);
    expect(result.errors).toEqual([
      "1 question(s) no longer exist.",
      "QA-BROKEN-00000 fails the automatic checks. Open it and fix the errors.",
    ]);
    console.log(`Published ${COUNT} questions in ${seconds.toFixed(1)} s`);
    expect(seconds).toBeLessThan(20);

    expect(await db.question.count({ where: { id: { in: ids }, status: "PUBLISHED" } })).toBe(
      COUNT,
    );
    expect(await db.question.count({ where: { id: broken, status: "DRAFT" } })).toBe(1);
    // The first three by ID become public samples; the topic is then full.
    const samples = await db.question.findMany({
      where: { publicSample: true },
      select: { externalId: true },
      orderBy: { externalId: "asc" },
    });
    expect(samples.map((q) => q.externalId)).toEqual([
      "QA-BULK-00000",
      "QA-BULK-00001",
      "QA-BULK-00002",
    ]);
    expect(
      await db.contentVersion.count({ where: { entityId: { in: ids }, reason: "published" } }),
    ).toBe(COUNT);
    expect(await db.auditLog.count({ where: { action: "question.publish" } })).toBe(COUNT);
  });

  it("skips questions that are already published and leaves their sample flag alone", async () => {
    const ids = await drafts("QA-AGAIN", 2);
    const first = await publishQuestions(ids, admin);
    expect(first).toEqual({ done: 2, errors: [] });
    const again = await publishQuestions(ids, admin);
    expect(again.done).toBe(0);
    expect(again.errors).toHaveLength(2);
    // The topic already had its three samples, so neither became one.
    expect(await db.question.count({ where: { id: { in: ids }, publicSample: true } })).toBe(0);
  });
});
