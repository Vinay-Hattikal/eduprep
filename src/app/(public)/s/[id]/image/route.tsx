// The share card as an image (1200×630): the Open Graph image for WhatsApp and LinkedIn
// previews, and the "download" for the student (D-053). Rendered from the frozen card data.

import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { SHARE_KIND_LABELS } from "@/lib/engagement/share";
import { getShareCard } from "@/server/services/share-cards";

const PRIMARY = "#4f46e5";
const HIGHLIGHT = "#f59e0b";

export async function GET(_request: Request, { params }: RouteContext<"/s/[id]/image">) {
  await connection();
  const { id } = await params;
  const card = await getShareCard(id);
  if (!card) return new Response("Not found", { status: 404 });
  const { data } = card;
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${data.date}T12:00:00Z`));

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
          {SHARE_KIND_LABELS[card.kind]}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 34, color: "#475569" }}>{data.title}</div>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
          {data.headline}
        </div>
        {data.detail ? (
          <div style={{ fontSize: 40, fontWeight: 700, color: HIGHLIGHT }}>{data.detail}</div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          fontSize: 26,
          color: "#475569",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
          <div>{date}</div>
        </div>
        <div>{siteConfig.url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
