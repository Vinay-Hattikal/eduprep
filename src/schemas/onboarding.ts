// Student onboarding and "edit goals" form (PRD 4.1).

import { z } from "zod";
import { CGPA_BANDS } from "@/lib/learning/eligibility";

export const DEGREES = ["B.Tech", "B.E.", "BCA", "MCA", "M.Tech", "B.Sc", "Other"] as const;
export const BRANCHES = [
  "CSE",
  "IT",
  "ECE",
  "EEE",
  "MECH",
  "CIVIL",
  "AIML",
  "DS",
  "Other",
] as const;
export const LANGUAGES = {
  c: "C",
  cpp: "C++",
  java: "Java",
  python: "Python",
  javascript: "JavaScript",
} as const;
export const MAX_TARGETS = 3;

const list = z
  .string()
  .optional()
  .transform((value) =>
    [
      ...new Set(
        (value ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ].slice(0, 10),
  );

const target = z.object({
  companyId: z.string().min(1),
  targetDate: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Use a valid date." });
        return z.NEVER;
      }
      return new Date(`${value}T00:00:00Z`);
    }),
});

const base = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  preferredLanguage: z.enum(
    Object.keys(LANGUAGES) as [keyof typeof LANGUAGES, ...(keyof typeof LANGUAGES)[]],
    {
      message: "Choose a language.",
    },
  ),
  targets: z.array(target).max(MAX_TARGETS, `Choose up to ${MAX_TARGETS} companies.`),
});

export function onboardingSchema(currentYear: number) {
  const fresher = base.extend({
    profileType: z.literal("FRESHER"),
    college: z.string().trim().min(2, "Enter your college.").max(150),
    degree: z.enum(DEGREES, { message: "Choose your degree." }),
    branch: z.enum(BRANCHES, { message: "Choose your branch." }),
    gradYear: z.coerce
      .number({ message: "Choose your graduation year." })
      .int()
      .min(currentYear - 2, "Choose your graduation year.")
      .max(currentYear + 4, "Choose your graduation year."),
    cgpaBand: z.enum(CGPA_BANDS, { message: "Choose your CGPA range." }),
    hasBacklogs: z.boolean(),
  });
  const experienced = base.extend({
    profileType: z.literal("EXPERIENCED"),
    currentRole: z.string().trim().min(2, "Enter your current role.").max(100),
    yearsExperience: z.coerce
      .number({ message: "Enter your years of experience." })
      .int()
      .min(0)
      .max(40),
    currentCompany: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => v || null),
    techStack: list,
    targetRoles: list,
  });
  return z.discriminatedUnion("profileType", [fresher, experienced]);
}

export type OnboardingValues = z.infer<ReturnType<typeof onboardingSchema>>;

export function onboardingFromData(formData: FormData, currentYear: number) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  const companyIds = formData.getAll("targetCompanyId").map(String);
  const dates = formData.getAll("targetDate").map(String);
  return onboardingSchema(currentYear).safeParse({
    profileType: get("profileType"),
    name: get("name") ?? "",
    preferredLanguage: get("preferredLanguage"),
    targets: companyIds
      .map((companyId, i) => ({ companyId, targetDate: dates[i] || undefined }))
      .filter((t) => t.companyId),
    college: get("college") ?? "",
    degree: get("degree"),
    branch: get("branch"),
    gradYear: get("gradYear") ?? "",
    cgpaBand: get("cgpaBand"),
    hasBacklogs: get("hasBacklogs") === "yes",
    currentRole: get("currentRole") ?? "",
    yearsExperience: get("yearsExperience") ?? "",
    currentCompany: get("currentCompany"),
    techStack: get("techStack"),
    targetRoles: get("targetRoles"),
  });
}
