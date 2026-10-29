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
