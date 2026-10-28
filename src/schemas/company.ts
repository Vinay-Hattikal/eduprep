// Company profile form (admin). Mirrors companies.csv (data-import.md 4.5).

import { z } from "zod";

export const optionalText = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : null));

const optionalUrl = optionalText.refine(
  (value) => value === null || /^https?:\/\/\S+$/i.test(value),
  "Enter an http(s) link.",
);

export const optionalNumber = (min: number, max: number, integer: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const number = Number(value);
      if (
        !Number.isFinite(number) ||
        (integer && !Number.isInteger(number)) ||
        number < min ||
        number > max
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Enter a ${integer ? "whole " : ""}number from ${min} to ${max}.`,
        });
        return z.NEVER;
      }
      return number;
    });

export const list = z
  .string()
  .optional()
  .transform((value) => [
    ...new Set(
      (value ?? "")
        .split(/[,|]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ]);

export const companyFormSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens."),
  name: z.string().trim().min(1, "Required.").max(200),
  level: z.enum(["FULL", "STANDARD", "GENERIC"]),
  category: z.enum(["SERVICE", "PRODUCT", "CONSULTING", "STARTUP", "OTHER"]),
  hiringFor: z.array(z.enum(["FRESHER", "EXPERIENCED"])).min(1, "Choose at least one."),
  overview: z.string().trim().min(1, "Required."),
  website: optionalUrl,
  careersUrl: optionalUrl,
  ctcFresher: optionalText,
  ctcExperienced: optionalText,
  minCgpa: optionalNumber(0, 10, false),
  min10thPercent: optionalNumber(0, 100, true),
  min12thPercent: optionalNumber(0, 100, true),
  maxBacklogs: optionalNumber(0, 50, true),
  maxGapYears: optionalNumber(0, 20, true),
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
  lastVerifiedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .transform((value) => new Date(`${value}T00:00:00Z`)),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

export function companyFormFromData(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  return companyFormSchema.safeParse({
    id: get("id") || undefined,
    slug: get("slug") ?? "",
    name: get("name") ?? "",
    level: get("level"),
    category: get("category"),
    hiringFor: formData.getAll("hiringFor"),
    overview: get("overview") ?? "",
    website: get("website"),
    careersUrl: get("careersUrl"),
    ctcFresher: get("ctcFresher"),
    ctcExperienced: get("ctcExperienced"),
    minCgpa: get("minCgpa"),
    min10thPercent: get("min10thPercent"),
    min12thPercent: get("min12thPercent"),
    maxBacklogs: get("maxBacklogs"),
    maxGapYears: get("maxGapYears"),
    branches: get("branches"),
    gradYears: get("gradYears"),
    lastVerifiedAt: get("lastVerifiedAt") ?? "",
  });
}
