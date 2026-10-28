// All-India mock test form (admin, D-049). Times are entered and shown in IST.

import { z } from "zod";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "2026-10-25T10:00" typed in IST → the instant. */
export function fromIstInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The instant → "2026-10-25T10:00" in IST, for datetime-local inputs. */
export function toIstInput(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

const istDateTime = z.string().transform((value, ctx) => {
  const date = fromIstInput(value);
  if (!date) {
    ctx.addIssue({ code: "custom", message: "Pick a date and time." });
    return z.NEVER;
  }
  return date;
});

export const contestFormSchema = z.object({
  id: z.string().max(40).optional(),
  title: z.string().trim().min(3, "Required.").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens.")
    .max(100),
  description: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => v || null),
  blueprintId: z.string().min(1, "Choose a test format.").max(40),
  startsAt: istDateTime,
  endsAt: istDateTime,
});

export function contestFromData(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return contestFormSchema.safeParse({
    id: get("id") || undefined,
    title: get("title"),
    slug: get("slug"),
    description: get("description"),
    blueprintId: get("blueprintId"),
    startsAt: get("startsAt"),
    endsAt: get("endsAt"),
  });
}
