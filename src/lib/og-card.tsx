// The 1200×630 preview image shown when a page is shared on WhatsApp, LinkedIn or X: share
// cards (D-053) and the public question, problem, company and mock test pages (D-062).

import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const PRIMARY = "#4f46e5";
const HIGHLIGHT = "#f59e0b";

export type OgCard = {
  /** The pill at the top right, e.g. "Coding problem". */
  label: string;
  /** A short line above the title, e.g. "Arrays · Medium". */
  eyebrow?: string;
  title: string;
  /** A highlighted line under the title. */
  detail?: string;
  /** Bottom left: a bold line and a quieter one. */
  footer?: { strong?: string; text?: string };
};

/** Long titles get smaller type so they still fit in three lines. */
function titleSize(title: string): number {
  if (title.length <= 40) return 72;
  if (title.length <= 80) return 58;
  return 46;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function ogImage(card: OgCard, init?: ResponseInit): ImageResponse {
  const title = clip(card.title, 140);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: "linear-gradient(135deg, #eef2ff 0%, #ffffff 55%, #fff7ed 100%)",
        color: "#0f172a",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: PRIMARY,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          {siteConfig.name.slice(0, 1)}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700 }}>{siteConfig.name}</div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: 22,
            color: PRIMARY,
            border: `2px solid ${PRIMARY}`,
            borderRadius: 999,
            padding: "6px 20px",
          }}
        >
          {card.label}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {card.eyebrow ? (
          <div style={{ fontSize: 34, color: "#475569" }}>{clip(card.eyebrow, 60)}</div>
        ) : null}
        <div
          style={{
            fontSize: titleSize(title),
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        {card.detail ? (
          <div style={{ fontSize: 40, fontWeight: 700, color: HIGHLIGHT }}>
            {clip(card.detail, 50)}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 32,
          fontSize: 26,
          color: "#475569",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {card.footer?.strong ? (
            <div style={{ fontSize: 36, fontWeight: 700, color: "#0f172a" }}>
              {clip(card.footer.strong, 40)}
            </div>
          ) : null}
          {card.footer?.text ? <div>{clip(card.footer.text, 60)}</div> : null}
        </div>
        <div>{siteConfig.url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>,
    { ...OG_SIZE, ...init },
  );
}

/** "Asked at Acme, Globex and 2 more" for the card footer. */
export function askedAt(names: string[]): string | undefined {
  if (!names.length) return undefined;
  const shown = names.slice(0, 2).join(", ");
  return names.length > 2 ? `Asked at ${shown} and ${names.length - 2} more` : `Asked at ${shown}`;
}
