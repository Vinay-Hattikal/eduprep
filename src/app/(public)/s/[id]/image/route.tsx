// The share card as an image (1200×630): the Open Graph image for WhatsApp and LinkedIn
// previews, and the "download" for the student (D-053). Rendered from the frozen card data.

import { connection } from "next/server";
import { SHARE_KIND_LABELS } from "@/lib/engagement/share";
import { ogImage } from "@/lib/og-card";
import { getShareCard } from "@/server/services/share-cards";

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

  return ogImage(
    {
      label: SHARE_KIND_LABELS[card.kind],
      eyebrow: data.title,
      title: data.headline,
      detail: data.detail || undefined,
      footer: { strong: data.name, text: date },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
