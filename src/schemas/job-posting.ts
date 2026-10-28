// Job posting form (admin, D-050).

import { z } from "zod";
import { isSafeApplyUrl } from "@/lib/jobs/postings";
import { list, optionalNumber, optionalText } from "@/schemas/company";

export const jobPostingFormSchema = z
  .object({
    id: z.string().max(40).optional(),
    title: z.string().trim().min(3, "Required.").max(140),
    companyId: optionalText,
    companyName: z.string().trim().min(1, "Required.").max(140),
    locations: list.transform((items) => items.slice(0, 15)),
    workMode: z.enum(["ONSITE", "HYBRID", "REMOTE"]),
    jobType: z.enum(["FULL_TIME", "INTERNSHIP", "CONTRACT"]),
    audience: z.array(z.enum(["FRESHER", "EXPERIENCED"])).min(1, "Choose at least one."),
    minExperience: optionalNumber(0, 40, true),
    maxExperience: optionalNumber(0, 40, true),
    salary: optionalText.refine((v) => v === null || v.length <= 80, "Keep it short."),
    skills: list.transform((items) => items.slice(0, 20)),
    description: z.string().trim().min(30, "Describe the role (30+ characters).").max(20_000),
    branches: list.transform((items) => {
      const upper = items.map((b) => b.toUpperCase());
      return upper.includes("ANY") ? [] : upper;
    }),
    gradYears: list.transform((items, ctx) => {
      const years = items.map(Number);
      if (years.some((year) => !Number.isInteger(year) || year < 2000 || year > 2100)) {
        ctx.addIssue({ code: "custom", message: "Use 4-digit years, e.g. 2026, 2027." });
        return z.NEVER;
      }
      return [...new Set(years)].sort();
    }),
    minCgpa: optionalNumber(0, 10, false),
    maxBacklogs: optionalNumber(0, 50, true),
    applyUrl: z
      .string()
      .trim()
      .max(2000)
      .refine(isSafeApplyUrl, "Enter the full link to the application page (https://…)."),
    applyBy: optionalText.transform((value, ctx) => {
      if (value === null) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Use YYYY-MM-DD." });
        return z.NEVER;
      }
      return new Date(`${value}T00:00:00Z`);
    }),
  })
  .superRefine((value, ctx) => {
    if (
      value.minExperience !== null &&
      value.maxExperience !== null &&
      value.maxExperience < value.minExperience
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["maxExperience"],
        message: "Must be at least the minimum.",
      });
    }
  });

export type JobPostingInput = z.infer<typeof jobPostingFormSchema>;

export function jobPostingFromData(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  return jobPostingFormSchema.safeParse({
    id: get("id") || undefined,
    title: get("title") ?? "",
    companyId: get("companyId"),
    companyName: get("companyName") ?? "",
    locations: get("locations"),
    workMode: get("workMode"),
    jobType: get("jobType"),
    audience: formData.getAll("audience"),
    minExperience: get("minExperience"),
    maxExperience: get("maxExperience"),
    salary: get("salary"),
    skills: get("skills"),
    description: get("description") ?? "",
    branches: get("branches"),
    gradYears: get("gradYears"),
    minCgpa: get("minCgpa"),
    maxBacklogs: get("maxBacklogs"),
    applyUrl: get("applyUrl") ?? "",
    applyBy: get("applyBy"),
  });
}
