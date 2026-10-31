// Brand colours for places that can't read CSS variables: social cards, emails and the browser
// theme colour (D-068). They mirror tokens in src/app/globals.css; tests/unit/contrast.test.ts
// fails if the two drift apart.

export const brandColors = {
  /** --background (light) */
  paper: "#faf8f4",
  /** --background (dark) */
  paperDark: "#0f1214",
  /** --foreground (light) */
  ink: "#15171c",
  /** --muted-foreground (light) */
  muted: "#5d6470",
  /** --primary (light) */
  teal: "#0f6e6a",
  /** Saffron for large text on paper (social cards only; 3:1, AA large). */
  saffronText: "#c2650f",
} as const;
