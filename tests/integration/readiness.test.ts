// Readiness counts coding sections, weighted by test time (D-060).

import { beforeAll, expect, it } from "vitest";
import { db } from "@/server/db";
import { getTargetReadiness } from "@/server/services/learning";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let studentId: string;

beforeAll(async () => {
  await resetDatabase();
  const admin = await createUser(["ADMIN"], "admin@test.example");
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), admin.id);
  studentId = (await createUser(["STUDENT"], "student@test.example")).id;
});

it("gives credit for coding topics once the company has a coding section", async () => {
  const [quant, arrays] = await Promise.all(
    ["percentages", "arrays"].map((slug) => db.topic.findUniqueOrThrow({ where: { slug } })),
  );
  const company = await db.company.create({
    data: {
      slug: "codeco",
      name: "CodeCo",
      level: "STANDARD",
      category: "PRODUCT",
      hiringFor: ["FRESHER"],
      overview: "A test company.",
      lastVerifiedAt: new Date("2026-10-01"),
      status: "PUBLISHED",
      rounds: {
        create: {
          order: 1,
          name: "Online test",
          type: "ONLINE_TEST",
          sections: {
            create: [
              {
                order: 1,
                name: "Aptitude",
                type: "MCQ",
                questionCount: 30,
                minutes: 40,
                topics: { connect: { id: quant!.id } },
              },
              {
                order: 2,
                name: "Coding",
                type: "CODING",
                questionCount: 2,
                minutes: 40,
                topics: { connect: { id: arrays!.id } },
              },
            ],
          },
        },
      },
    },
  });
  await db.targetCompany.create({ data: { userId: studentId, companyId: company.id } });

  // Full DSA mastery from coding practice, nothing in aptitude yet: half ready.
  await db.mastery.create({
    data: { userId: studentId, topicId: arrays!.id, score: 100, attempts: 3, correct: 3 },
  });
  const [readiness] = await getTargetReadiness(studentId);
  expect(readiness).toMatchObject({ slug: "codeco", score: 50 });
  expect(readiness!.focus.map((f) => f.topicSlug)).toEqual(["percentages"]);
});
