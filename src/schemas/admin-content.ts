// Admin editor forms for content that used to come only from imports: coding problems and their
// solutions, design questions, role tracks, interview types and passages. Each schema mirrors
// the matching CSV columns (data-import.md), so a form and an import accept the same values.

import { z } from "zod";
import { CODING_LANGUAGE_IDS } from "@/lib/coding/languages";

export const SLUG_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EXTERNAL_ID_RULE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const MAX_CODE_LENGTH = 64 * 1024;

export const slugField = z
  .string()
  .trim()
  .min(1, "Required.")
  .max(80, "At most 80 characters.")
  .regex(SLUG_RULE, "Use lowercase letters, digits and hyphens.");

export const externalIdField = z
  .string()
  .trim()
  .regex(EXTERNAL_ID_RULE, "Use letters, digits and hyphens (max 64).");

const markdown = (message = "Required.") => z.string().trim().min(1, message);

const optionalMarkdown = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : null));

const wholeNumber = (min: number, max: number) =>
  z.coerce
    .number({ message: "Enter a number." })
    .int("Enter a whole number.")
    .min(min, `At least ${min}.`)
    .max(max, `At most ${max}.`);

/** "a, b | c" → ["a", "b", "c"], without blanks or repeats. */
export const listField = z
  .string()
  .optional()
  .transform((value) => [
    ...new Set(
      (value ?? "")
        .split(/[,|\n]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ]);

const difficulty = z.enum(["EASY", "MEDIUM", "HARD"]);

/** Collects the first message per field, keyed by the field name. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return errors;
}

// ---------- coding problems ----------

export const problemFormSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  externalId: externalIdField,
  slug: slugField,
  title: z.string().trim().min(3, "Too short.").max(120),
  difficulty,
  topicIds: z.array(z.string().min(1).max(40)).min(1, "Choose at least one DSA topic."),
  languages: z
    .array(z.enum(CODING_LANGUAGE_IDS as [string, ...string[]]))
    .min(1, "Allow at least one language."),
  statement: z.string().trim().min(10, "Write the statement."),
  inputFormat: markdown(),
  outputFormat: markdown(),
  constraints: markdown(),
  timeLimitMs: wholeNumber(200, 10_000),
  memoryLimitMb: wholeNumber(32, 1024),
  scoring: z.enum(["ALL_OR_NOTHING", "PER_TEST"]),
  checker: z.string().trim().min(1, "Required."),
  source: z.enum(["ORIGINAL", "MEMORY_BASED"]),
  hints: z.array(z.string().trim()).max(3),
  editorial: optionalMarkdown,
});

export type ProblemFormInput = z.infer<typeof problemFormSchema>;

export function problemFormFromData(formData: FormData) {
  return problemFormSchema.safeParse({
    id: formData.get("id") || undefined,
    externalId: formData.get("externalId") ?? "",
    slug: formData.get("slug") ?? "",
    title: formData.get("title") ?? "",
    difficulty: formData.get("difficulty"),
    topicIds: formData.getAll("topicIds"),
    languages: formData.getAll("languages"),
    statement: formData.get("statement") ?? "",
    inputFormat: formData.get("inputFormat") ?? "",
    outputFormat: formData.get("outputFormat") ?? "",
    constraints: formData.get("constraints") ?? "",
    timeLimitMs: formData.get("timeLimitMs") ?? "",
    memoryLimitMb: formData.get("memoryLimitMb") ?? "",
    scoring: formData.get("scoring"),
    checker: formData.get("checker") ?? "",
    source: formData.get("source"),
    hints: [1, 2, 3].map((i) => String(formData.get(`hint${i}`) ?? "")),
    editorial: formData.get("editorial") ?? undefined,
  });
}

export const solutionFormSchema = z
  .object({
    problemId: z.string().min(1).max(40),
    kind: z.enum(["REFERENCE", "BRUTE", "STARTER"]),
    language: z.enum(CODING_LANGUAGE_IDS as [string, ...string[]], {
      message: "Choose a language.",
    }),
    code: z
      .string()
      .transform((code) => code.replace(/\r\n/g, "\n"))
      .pipe(
        z
          .string()
          .refine((code) => code.trim().length > 0, "Paste the code.")
          .refine((code) => code.length <= MAX_CODE_LENGTH, "Code over 64 KB."),
      ),
  })
  .refine((s) => s.language !== "java" || /public\s+class\s+Main\b/.test(s.code), {
    path: ["code"],
    message: "Java code must declare public class Main.",
  });

export type SolutionFormInput = z.infer<typeof solutionFormSchema>;

// ---------- design questions ----------

export const designFormSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  externalId: externalIdField,
  slug: slugField,
  kind: z.enum(["SYSTEM_DESIGN", "LOW_LEVEL_DESIGN"]),
  title: z.string().trim().min(3, "Too short.").max(160),
  difficulty,
  prompt: markdown("Write the question."),
  requirements: markdown(),
  approach: markdown(),
  tradeoffs: markdown(),
  followUps: optionalMarkdown,
  companies: listField,
  tracks: z.array(slugField),
});

export type DesignFormInput = z.infer<typeof designFormSchema>;

export function designFormFromData(formData: FormData) {
  return designFormSchema.safeParse({
    id: formData.get("id") || undefined,
    externalId: formData.get("externalId") ?? "",
    slug: formData.get("slug") ?? "",
    kind: formData.get("kind"),
    title: formData.get("title") ?? "",
    difficulty: formData.get("difficulty"),
    prompt: formData.get("prompt") ?? "",
    requirements: formData.get("requirements") ?? "",
    approach: formData.get("approach") ?? "",
    tradeoffs: formData.get("tradeoffs") ?? "",
    followUps: formData.get("followUps") ?? undefined,
    companies: formData.get("companies") ?? undefined,
    tracks: formData.getAll("tracks"),
  });
}

// ---------- role tracks ----------

export const trackFormSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  slug: slugField,
  name: z.string().trim().min(2, "Too short.").max(120),
  description: z.string().trim().min(1, "Required.").max(500),
  roadmap: markdown("Write the roadmap."),
  audience: z.enum(["FRESHER", "EXPERIENCED", "BOTH"]),
  order: wholeNumber(0, 1000),
  topicIds: z.array(z.string().min(1).max(40)).min(1, "Choose at least one topic."),
  interviewTypes: z.array(slugField),
});

export type TrackFormInput = z.infer<typeof trackFormSchema>;

export function trackFormFromData(formData: FormData) {
  return trackFormSchema.safeParse({
    id: formData.get("id") || undefined,
    slug: formData.get("slug") ?? "",
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    roadmap: formData.get("roadmap") ?? "",
    audience: formData.get("audience"),
    order: formData.get("order") || "0",
    topicIds: formData.getAll("topicIds"),
    interviewTypes: formData.getAll("interviewTypes"),
  });
}

// ---------- interview types ----------

export const MAX_RUBRIC_ITEMS = 10;

export const rubricItemSchema = z.object({
  key: slugField,
  label: z.string().trim().min(1, "Name every rubric item.").max(60),
  description: z.string().trim().min(1, "Describe every rubric item.").max(300),
});

export const interviewTypeFormSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  slug: slugField,
  name: z.string().trim().min(2, "Too short.").max(80),
  description: z.string().trim().min(1, "Required.").max(500),
  audience: z.enum(["FRESHER", "EXPERIENCED", "BOTH"]),
  durationMin: wholeNumber(15, 180),
  priceSetting: z.string().min(1, "Choose a price."),
  order: wholeNumber(0, 1000),
  active: z.boolean(),
  rubric: z
    .array(rubricItemSchema)
    .min(1, "Add at least one rubric item.")
    .max(MAX_RUBRIC_ITEMS, `At most ${MAX_RUBRIC_ITEMS} rubric items.`)
    .refine(
      (items) => new Set(items.map((i) => i.key)).size === items.length,
      "Two rubric items have the same key.",
    ),
});

export type InterviewTypeFormInput = z.infer<typeof interviewTypeFormSchema>;

/** "Problem solving" → "problem-solving": the stable key old scorecards are stored under. */
export function rubricKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function interviewTypeFormFromData(formData: FormData) {
  const labels = formData.getAll("rubricLabel").map(String);
  const descriptions = formData.getAll("rubricDescription").map(String);
  const keys = formData.getAll("rubricKey").map(String);
  const rubric = labels
    .map((label, i) => ({
      // Existing items keep their key so old scorecards still line up.
      key: keys[i]?.trim() || rubricKey(label),
      label,
      description: descriptions[i] ?? "",
    }))
    .filter((item) => item.label.trim() || item.description.trim());
  return interviewTypeFormSchema.safeParse({
    id: formData.get("id") || undefined,
    slug: formData.get("slug") ?? "",
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    audience: formData.get("audience"),
    durationMin: formData.get("durationMin") ?? "",
    priceSetting: formData.get("priceSetting") ?? "",
    order: formData.get("order") || "0",
    active: formData.get("active") === "on",
    rubric,
  });
}

// ---------- passages ----------

export const passageFormSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  externalId: externalIdField,
  title: z.string().trim().min(1, "Required.").max(200),
  body: markdown("Write the passage."),
});

export type PassageFormInput = z.infer<typeof passageFormSchema>;

export function passageFormFromData(formData: FormData) {
  return passageFormSchema.safeParse({
    id: formData.get("id") || undefined,
    externalId: formData.get("externalId") ?? "",
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
  });
}

// ---------- admin roles ----------

export const ASSIGNABLE_ROLES = [
  "SUPER_ADMIN",
  "CONTENT_AUTHOR",
  "REVIEWER",
  "OPS_ADMIN",
  "SUPPORT_ADMIN",
] as const;

export const rolesFormSchema = z.object({
  userId: z.string().min(1).max(40),
  roles: z.array(z.enum(ASSIGNABLE_ROLES)),
});
