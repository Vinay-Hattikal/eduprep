// Hiring process and sources edited in the admin panel (D-057).

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  addSource,
  deleteRound,
  deleteSection,
  deleteSource,
  moveRound,
  moveSection,
  saveRound,
  saveSection,
} from "@/server/services/company-hiring";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let actor: { id: string };
let companyId: string;
let topicId: string;

const round = (name: string) => ({
  companyId,
  name,
  type: "ONLINE_TEST" as const,
  platform: null,
  durationMin: 90,
  isElimination: true,
  description: null,
});

const section = (roundId: string, name: string) => ({
  roundId,
  name,
  type: "MCQ" as const,
  questionCount: 20,
  minutes: 25,
  negativeMarks: 0.25,
  canGoBack: false,
  topicIds: [topicId],
});

async function rounds() {
  return db.companyRound.findMany({
    where: { companyId },
    orderBy: { order: "asc" },
    include: { sections: { orderBy: { order: "asc" }, include: { topics: true } } },
  });
}

beforeAll(async () => {
  await resetDatabase();
  actor = { id: (await createUser(["ADMIN"], "admin@test.example")).id };
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), actor.id);
  const company = await db.company.create({
    data: {
      slug: "hiring-co",
      name: "Hiring Co",
      level: "STANDARD",
      category: "SERVICE",
      hiringFor: ["FRESHER"],
      overview: "A test company.",
      lastVerifiedAt: new Date("2026-10-01"),
    },
  });
  companyId = company.id;
  topicId = (await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } })).id;
});

describe("rounds", () => {
  it("adds rounds at the end, edits, reorders and renumbers after a delete", async () => {
    expect(await saveRound(round("Aptitude"), actor)).toEqual({ ok: true, slug: "hiring-co" });
    await saveRound(round("Coding"), actor);
    await saveRound({ ...round("HR"), type: "HR_INTERVIEW" }, actor);
    expect((await rounds()).map((r) => [r.order, r.name])).toEqual([
      [1, "Aptitude"],
      [2, "Coding"],
      [3, "HR"],
    ]);

    const [aptitude, coding, hr] = await rounds();
    await saveRound(
      { ...round("Aptitude test"), roundId: aptitude!.id, platform: "tcs-ion" },
      actor,
    );
    expect(
      await saveRound({ ...round("x"), roundId: aptitude!.id, platform: "nope" }, actor),
    ).toMatchObject({ ok: false, field: "platform" });

    await moveRound(hr!.id, "up", actor);
    expect((await rounds()).map((r) => r.name)).toEqual(["Aptitude test", "HR", "Coding"]);
    await moveRound(aptitude!.id, "up", actor); // already first: no change
    expect((await rounds())[0]!.platform).toBe("tcs-ion");

    await deleteRound(hr!.id, actor);
    expect((await rounds()).map((r) => [r.order, r.name])).toEqual([
      [1, "Aptitude test"],
      [2, "Coding"],
    ]);
    expect(coding).toBeDefined();
  });
});

describe("sections", () => {
  it("adds, edits topics, reorders and deletes sections", async () => {
    const [aptitude] = await rounds();
    await saveSection(section(aptitude!.id, "Quant"), actor);
    await saveSection(section(aptitude!.id, "Verbal"), actor);
    let [first] = await rounds();
    expect(first!.sections.map((s) => [s.order, s.name, s.canGoBack, s.negativeMarks])).toEqual([
      [1, "Quant", false, 0.25],
      [2, "Verbal", false, 0.25],
    ]);

    const other = await db.topic.findUniqueOrThrow({ where: { slug: "averages" } });
    const verbal = first!.sections[1]!;
    await saveSection(
      { ...section(aptitude!.id, "Verbal ability"), sectionId: verbal.id, topicIds: [other.id] },
      actor,
    );
    await moveSection(verbal.id, "up", actor);
    [first] = await rounds();
    expect(first!.sections.map((s) => s.name)).toEqual(["Verbal ability", "Quant"]);
    expect(first!.sections[0]!.topics.map((t) => t.slug)).toEqual(["averages"]);

    expect(
      await saveSection({ ...section(aptitude!.id, "Bad"), topicIds: ["missing"] }, actor),
    ).toMatchObject({ ok: false, field: "topicIds" });

    await deleteSection(verbal.id, actor);
    [first] = await rounds();
    expect(first!.sections.map((s) => [s.order, s.name])).toEqual([[1, "Quant"]]);
  });
});

describe("sources", () => {
  it("adds sources, refuses duplicates, and keeps one on a published company", async () => {
    const checkedOn = new Date("2026-10-01T00:00:00Z");
    const url = "https://example.com/careers";
    expect(await addSource({ companyId, label: "Careers", url, checkedOn }, actor)).toMatchObject({
      ok: true,
    });
    expect(await addSource({ companyId, label: "Again", url, checkedOn }, actor)).toMatchObject({
      ok: false,
      field: "url",
    });

    await db.company.update({ where: { id: companyId }, data: { status: "PUBLISHED" } });
    const only = await db.companySource.findFirstOrThrow({ where: { companyId } });
    expect(await deleteSource(only.id, actor)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at least one source/),
    });
    await addSource(
      { companyId, label: "News", url: "https://example.com/news", checkedOn },
      actor,
    );
    expect(await deleteSource(only.id, actor)).toMatchObject({ ok: true });
    expect(await db.companySource.count({ where: { companyId } })).toBe(1);

    const actions = (
      await db.auditLog.findMany({ where: { entityId: companyId }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "company.round_add",
        "company.round_move",
        "company.round_delete",
        "company.section_add",
        "company.section_update",
        "company.source_add",
        "company.source_delete",
      ]),
    );
  });
});
