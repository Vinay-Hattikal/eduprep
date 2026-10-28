// Test blueprint form (admin). A blueprint says how a test is built: sections, timers and
// "draw N items from this topic" rules. Questions are drawn per student when a sitting starts.

import { z } from "zod";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const blueprintRuleSchema = z.object({
  topicId: z.string().min(1, "Choose a topic."),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
  count: z.number().int().min(1, "At least 1.").max(100, "At most 100."),
});

export const blueprintSectionSchema = z.object({
  name: z.string().trim().min(1, "Name the section.").max(60),
  type: z.enum(["MCQ", "CODING"]),
  minutes: z.number().int().min(1, "At least 1 minute.").max(300, "At most 300 minutes."),
  marksPerItem: z.number().min(0.25).max(100),
  negativeMarks: z.number().min(0).max(100),
  canGoBack: z.boolean(),
  rules: z.array(blueprintRuleSchema).min(1, "Add at least one topic rule.").max(30),
});

export const blueprintFormSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().trim().min(3, "Give the test a title.").max(120),
    slug: z.string().trim().regex(SLUG, "Use lowercase letters, numbers and hyphens."),
    kind: z.enum(["TOPIC", "COMPANY_MOCK", "OA"]),
    platformStyle: z.enum(["GENERIC", "TCS_ION", "HACKERRANK", "AMCAT"]),
    navigation: z.enum(["FREE", "SEQUENTIAL"]),
    description: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v || null),
    instructions: z
      .string()
      .trim()
      .max(5000)
      .transform((v) => v || null),
    companyId: z.string().nullable(),
    sections: z.array(blueprintSectionSchema).min(1, "Add at least one section.").max(10),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "COMPANY_MOCK" && !value.companyId) {
      ctx.addIssue({
        code: "custom",
        path: ["companyId"],
        message: "A company mock needs a company.",
      });
    }
    if (value.sections.some((s) => s.negativeMarks > s.marksPerItem)) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Negative marks can't exceed the marks for a right answer.",
      });
    }
  });

export type BlueprintForm = z.infer<typeof blueprintFormSchema>;
export type BlueprintSectionForm = z.infer<typeof blueprintSectionSchema>;
