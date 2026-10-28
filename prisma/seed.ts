// Development seed: one user per role (for dev login) and default settings (D-026).
// Safe to run repeatedly: users are matched by email, settings are only created when missing.
// All people here are fictional.

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";
import { SETTING_KEYS, SETTINGS } from "../src/server/services/settings/registry";
import { DEFAULT_RUBRICS } from "../src/lib/interviews/policies";

dotenv.config({ quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const users: Prisma.UserCreateInput[] = [
  // One admin does everything (D-056).
  {
    name: "Asha Admin",
    email: "admin@example.com",
    roles: ["ADMIN"],
    onboardedAt: new Date(),
  },
  {
    name: "Priya Sharma",
    email: "fresher@example.com",
    roles: ["STUDENT"],
    profileType: "FRESHER",
    onboardedAt: new Date(),
    fresherProfile: {
      create: {
        college: "Example Institute of Technology",
        degree: "B.Tech",
        branch: "CSE",
        gradYear: 2027,
        cgpaBand: "7.0–7.9",
      },
    },
  },
  {
    name: "Rahul Verma",
    email: "experienced@example.com",
    roles: ["STUDENT"],
    profileType: "EXPERIENCED",
    onboardedAt: new Date(),
    experiencedProfile: {
      create: {
        currentRole: "Software Engineer",
        yearsExperience: 3,
        techStack: ["Java", "Spring Boot", "SQL"],
        targetRoles: ["SDE-2", "Backend Engineer"],
      },
    },
  },
  { name: "Neha New", email: "new-student@example.com", roles: ["STUDENT"] },
  {
    name: "Ananya Iyer",
    email: "interviewer@example.com",
    roles: ["INTERVIEWER"],
    onboardedAt: new Date(),
  },
];

const INTERVIEW_TYPES = [
  {
    slug: "hr",
    name: "HR / behavioural",
    description:
      "Tell me about yourself, strengths, conflicts, why this company. Structured feedback on your stories.",
    audience: "BOTH",
    durationMin: 45,
    priceSetting: "interviews.hr",
  },
  {
    slug: "technical-fresher",
    name: "Technical (fresher)",
    description: "Coding and CS fundamentals at the level of campus placements.",
    audience: "FRESHER",
    durationMin: 60,
    priceSetting: "interviews.technicalFresher",
  },
  {
    slug: "company-specific",
    name: "Company-specific",
    description: "A mock of one company's interview: its format, its favourite topics.",
    audience: "BOTH",
    durationMin: 60,
    priceSetting: "interviews.companySpecific",
  },
  {
    slug: "sde-experienced",
    name: "SDE / DSA (experienced)",
    description:
      "Medium-hard DSA, code quality and depth in your stack, as in product company loops.",
    audience: "EXPERIENCED",
    durationMin: 60,
    priceSetting: "interviews.sdeExperienced",
  },
  {
    slug: "system-design",
    name: "System design",
    description:
      "Design a real system end to end: requirements, architecture, trade-offs, deep dives.",
    audience: "EXPERIENCED",
    durationMin: 60,
    priceSetting: "interviews.systemDesign",
  },
] as const;

async function main() {
  for (const user of users) {
    await db.user.upsert({
      where: { email: user.email! },
      create: user,
      update: { name: user.name, roles: user.roles },
    });
  }

  for (const key of SETTING_KEYS) {
    await db.setting.upsert({
      where: { key },
      create: { key, value: SETTINGS[key].defaultValue },
      update: {},
    });
  }

  // Interview types (PRD 8.7). Prices come from settings; rubrics can be edited later.
  for (const [order, type] of INTERVIEW_TYPES.entries()) {
    await db.interviewType.upsert({
      where: { slug: type.slug },
      create: { ...type, order, rubric: DEFAULT_RUBRICS[type.slug]! },
      update: { name: type.name, description: type.description, order },
    });
  }

  // The seeded interviewer is approved, offers every type and works evenings and weekends (IST).
  const interviewer = await db.user.findUniqueOrThrow({
    where: { email: "interviewer@example.com" },
  });
  const existing = await db.interviewer.findUnique({ where: { userId: interviewer.id } });
  if (!existing) {
    await db.interviewer.create({
      data: {
        userId: interviewer.id,
        status: "APPROVED",
        approvedAt: new Date(),
        headline: "SDE-2 at a product company, ex-service company",
        currentCompany: "Example Product Co.",
        currentRole: "Software Engineer II",
        yearsExperience: 6,
        pastCompanies: ["acme-tech"],
        languages: ["English", "Hindi", "Tamil"],
        linkedinUrl: "https://www.linkedin.com/in/example",
        bio: "I've taken 200+ interviews for freshers and experienced engineers. I focus on problem solving, clear communication and honest feedback.",
        types: {
          connect: (await db.interviewType.findMany({ select: { id: true } })).map(({ id }) => ({
            id,
          })),
        },
        rules: {
          create: [
            ...[1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              startMinute: 18 * 60,
              endMinute: 22 * 60,
            })),
            ...[0, 6].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
          ],
        },
      },
    });
  }

  console.log(
    `Seeded ${users.length} users, ${SETTING_KEYS.length} settings and ${INTERVIEW_TYPES.length} interview types.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
