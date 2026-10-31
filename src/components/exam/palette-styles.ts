// Question palette chip styles (D-034 meanings). A plain module so server components (the landing
// page's exam preview) and the client palette share one source.

export type PaletteState =
  "answered" | "not-answered" | "review" | "answered-review" | "not-visited";

export const STATE_STYLES: Record<PaletteState, string> = {
  answered: "bg-palette-answered text-palette-foreground border-transparent",
  "not-answered": "bg-palette-not-answered text-palette-foreground border-transparent",
  review: "bg-palette-review text-palette-foreground border-transparent rounded-full",
  "answered-review":
    "bg-palette-review text-palette-foreground border-transparent rounded-full ring-2 ring-palette-answered ring-offset-1 ring-offset-card",
  "not-visited": "bg-card text-foreground border-palette-not-visited",
};
