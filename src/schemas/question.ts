// Question editor form (admin). Field rules live in src/lib/content/question-rules.ts; this
// schema only turns FormData into typed values.

import { z } from "zod";
import { OPTION_LETTERS } from "@/lib/content/question-rules";

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.replace(/^\s+|\s+$/g, "") : null));

const optionalNumber = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value || !value.trim()) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) {
      ctx.addIssue({ code: "custom", message: "Enter a number." });
      return z.NEVER;
    }
    return number;
  });

export const questionFormSchema = z.object({
  id: z.string().optional(),
  externalId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/, "Use letters, digits and hyphens (max 64)."),
  subjectId: z.string().min(1, "Choose a subject."),
  topicId: z.string().min(1, "Choose a topic."),
  subtopicId: optionalText,
  type: z.enum(["SINGLE", "MULTIPLE", "NUMERIC"]),
  text: z.string().default(""),
  code: optionalText,
  codeLanguage: optionalText,
  options: z.array(z.string()).length(OPTION_LETTERS.length),
  correctOptions: z.array(z.enum(OPTION_LETTERS)),
  numericAnswer: optionalNumber,
  tolerance: optionalNumber,
  explanation: z.string().default(""),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  expectedTimeSec: z.coerce
    .number({ message: "Enter a number of seconds." })
    .int("Use whole seconds."),
  passageExternalId: optionalText,
  tags: z
    .string()
    .optional()
    .transform((value) => [
      ...new Set(
        (value ?? "")
          .split(/[,|]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ]),
  source: z.enum(["ORIGINAL", "MEMORY_BASED"]),
});

export type QuestionFormValues = z.infer<typeof questionFormSchema>;

export function questionFormFromData(formData: FormData) {
  return questionFormSchema.safeParse({
    id: formData.get("id") || undefined,
    externalId: formData.get("externalId") ?? "",
    subjectId: formData.get("subjectId") ?? "",
    topicId: formData.get("topicId") ?? "",
    subtopicId: formData.get("subtopicId") ?? undefined,
    type: formData.get("type"),
    text: formData.get("text") ?? "",
    code: formData.get("code") ?? undefined,
    codeLanguage: formData.get("codeLanguage") ?? undefined,
    options: OPTION_LETTERS.map((letter) => String(formData.get(`option_${letter}`) ?? "")),
    correctOptions: formData.getAll("correct"),
    numericAnswer: formData.get("numericAnswer") ?? undefined,
    tolerance: formData.get("tolerance") ?? undefined,
    explanation: formData.get("explanation") ?? "",
    difficulty: formData.get("difficulty"),
    expectedTimeSec: formData.get("expectedTimeSec") ?? "",
    passageExternalId: formData.get("passageExternalId") ?? undefined,
    tags: formData.get("tags") ?? undefined,
    source: formData.get("source"),
  });
}
