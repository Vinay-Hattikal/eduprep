// Company-wise content entry (D-057): "Asked at" links, link and unlink from a company, next ID
// suggestions and "+ New topic".

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  linkToCompany,
  searchLinkable,
  setCompanyLinks,
  suggestNextQuestionId,
  unlinkFromCompany,
} from "@/server/services/company-links";
import { transitionQuestion } from "@/server/services/questions";
import { quickCreateTopic, slugifyName } from "@/server/services/taxonomy";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let admin: { id: string; roles: "ADMIN"[] };
let acme: string;
let globex: string;
let questionId: string;

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
  acme = (await db.company.findUniqueOrThrow({ where: { slug: "acme-tech" } })).id;
  globex = (
    await db.company.create({
      data: {
        slug: "globex",
        name: "Globex",
        level: "STANDARD",
        category: "PRODUCT",
        hiringFor: ["FRESHER"],
        overview: "Test.",
        lastVerifiedAt: new Date("2026-10-01"),
      },
    })
  ).id;
  questionId = (await db.question.findFirstOrThrow({ orderBy: { externalId: "asc" } })).id;
});

describe("asked at", () => {
  it("replaces the company list, keeps report counts, and doesn't unpublish", async () => {
    await transitionQuestion(questionId, "publish", admin);
    await setCompanyLinks({ questionId }, [{ companyId: acme, askedIn: ["2026-08"] }], admin);
    await db.companyItem.updateMany({
      where: { questionId, companyId: acme },
      data: { reportCount: 3 },
    });

    const both = [
      { companyId: acme, askedIn: ["2026-09", "2026-08"] },
      { companyId: globex, askedIn: [] },
    ];
    expect(await setCompanyLinks({ questionId }, both, admin)).toBe(true);
    const links = await db.companyItem.findMany({ where: { questionId } });
    expect(links).toHaveLength(2);
    expect(links.find((l) => l.companyId === acme)).toMatchObject({
      askedIn: ["2026-09", "2026-08"],
      reportCount: 3,
    });
    expect((await db.question.findUniqueOrThrow({ where: { id: questionId } })).status).toBe(
      "PUBLISHED",
    );

    // The same list again: nothing to do.
    expect(await setCompanyLinks({ questionId }, both, admin)).toBe(false);

    await setCompanyLinks({ questionId }, [{ companyId: globex, askedIn: [] }], admin);
    expect(await db.companyItem.count({ where: { questionId } })).toBe(1);
  });
});

describe("link and unlink from a company", () => {
  it("finds questions not yet linked, links once, unlinks without deleting", async () => {
    const question = await db.question.findUniqueOrThrow({ where: { id: questionId } });
    const found = await searchLinkable(acme, "question", question.externalId);
    expect(found.map((q) => q.id)).toContain(questionId);

    await linkToCompany(acme, { questionId }, admin);
    await linkToCompany(acme, { questionId }, admin); // twice is fine
    expect(await db.companyItem.count({ where: { questionId, companyId: acme } })).toBe(1);
    const again = await searchLinkable(acme, "question", question.externalId);
    expect(again.map((q) => q.id)).not.toContain(questionId);

    const link = await db.companyItem.findFirstOrThrow({
      where: { questionId, companyId: acme },
    });
    expect(await unlinkFromCompany(link.id, admin)).toBe(acme);
    expect(await db.question.count({ where: { id: questionId } })).toBe(1);
    expect(await searchLinkable(acme, "question", "")).toEqual([]);
  });
});

describe("next question ID", () => {
  it("skips IDs already in use", async () => {
    const ids = (await db.question.findMany({ select: { externalId: true } })).map(
      (q) => q.externalId,
    );
    const next = await suggestNextQuestionId([...ids].sort()[0]!);
    expect(next).not.toBe("");
    expect(ids).not.toContain(next);
  });
});

describe("+ New topic", () => {
  it("creates a topic with a unique slug and refuses duplicates", async () => {
    const quant = await db.subject.findUniqueOrThrow({ where: { slug: "quantitative-aptitude" } });
    const created = await quickCreateTopic(quant.id, "  Pipes   and Tanks Test ", admin.id);
    if (!created.ok) throw new Error(created.error);
    const topic = await db.topic.findUniqueOrThrow({ where: { id: created.topic.id } });
    expect(topic).toMatchObject({ name: "Pipes and Tanks Test", subjectId: quant.id });
    expect(topic.slug).toBe("pipes-and-tanks-test");

    expect(await quickCreateTopic(quant.id, "pipes and tanks test", admin.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already has/),
    });

    // "Percentages" is taken by the quant subject, so another subject's slug gets a prefix.
    const lr = await db.subject.findUniqueOrThrow({ where: { slug: "logical-reasoning" } });
    const other = await quickCreateTopic(lr.id, "Percentages", admin.id);
    if (!other.ok) throw new Error(other.error);
    expect((await db.topic.findUniqueOrThrow({ where: { id: other.topic.id } })).slug).toBe(
      "logical-reasoning-percentages",
    );
    expect(slugifyName("Time & Work!")).toBe("time-work");
  });
});
