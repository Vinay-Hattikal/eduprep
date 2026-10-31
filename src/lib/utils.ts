export { cn } from "cn";

/** "Time & Work!" → "time-work": lower-case letters, digits and single hyphens. */
export function slugify(text: string, max = 60): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

/** A search param when it's one of `allowed`'s keys, else undefined. */
export const pick = <T extends string>(
  value: unknown,
  allowed: Record<T, unknown>,
): T | undefined => (typeof value === "string" && value in allowed ? (value as T) : undefined);
