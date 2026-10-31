import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandColors } from "@/config/brand-colors";

// Colour contrast gate (R.10, D-068): every text-on-background pair the UI uses must meet WCAG AA
// (4.5:1 for normal text) in both themes, read straight from the tokens in globals.css.

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g))
    out[name!] = value!.toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [text, background] token pairs, as the components use them. */
const PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["card-foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "surface"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary", "background"],
  ["primary", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["highlight-foreground", "highlight"],
  ["inverse-foreground", "inverse"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["success", "card"],
  ["success-foreground", "success"],
  ["warning", "card"],
  ["warning-foreground", "warning"],
  ["info-foreground", "info"],
  ["difficulty-easy", "card"],
  ["difficulty-medium", "card"],
  ["difficulty-hard", "card"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  // Exam palette numbers, the last-minute timer, and green text on the ink band.
  ["palette-foreground", "palette-answered"],
  ["palette-foreground", "palette-not-answered"],
  ["palette-foreground", "palette-review"],
  ["foreground", "palette-not-visited"],
  ["destructive-foreground", "destructive"],
  ["success-on-inverse", "inverse"],
];

/** Which CSS token each brand colour mirrors; null = no token (checked for contrast instead). */
const MIRRORS: Record<keyof typeof brandColors, [":root" | ".dark", string] | null> = {
  paper: [":root", "background"],
  paperDark: [".dark", "background"],
  ink: [":root", "foreground"],
  muted: [":root", "muted-foreground"],
  teal: [":root", "primary"],
  saffronText: null,
};

describe("brand colours outside CSS", () => {
  it.each(Object.entries(MIRRORS).filter(([, m]) => m))("%s matches its token", (key, mirror) => {
    const [selector, token] = mirror!;
    expect(brandColors[key as keyof typeof brandColors]).toBe(tokens(selector)[token]);
  });

  it("social-card saffron is readable on paper", () => {
    // Only used for 40 px bold text on social cards: large text, so AA is 3:1.
    expect(contrast(brandColors.saffronText, brandColors.paper)).toBeGreaterThanOrEqual(3);
  });
});

describe.each([":root", ".dark"] as const)("contrast in %s", (selector) => {
  const t = tokens(selector);
  it.each(PAIRS)("%s on %s meets AA", (text, background) => {
    expect(t[text], `--${text}`).toBeDefined();
    expect(t[background], `--${background}`).toBeDefined();
    expect(contrast(t[text]!, t[background]!)).toBeGreaterThanOrEqual(4.5);
  });
});
