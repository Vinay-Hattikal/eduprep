import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { SHARE_KIND_LABELS } from "@/lib/engagement/share";
import { formatDate } from "@/lib/format";
import { getShareCard } from "@/server/services/share-cards";

export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  const card = await getShareCard(id);
  if (!card) return { title: "Link turned off", robots: { index: false } };
  const title = `${card.data.name}: ${card.data.headline}`;
  const description = `${card.data.title}${card.data.detail ? ` · ${card.data.detail}` : ""} on ${siteConfig.name}.`;
  const image = { url: `/s/${card.id}/image`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, url: `/s/${card.id}`, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function SharePage({ params }: PageProps<"/s/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-6 lg:py-14">
      <Suspense fallback={<PageSkeleton />}>
        <Card params={params} />
      </Suspense>
    </main>
  );
}

async function Card({ params }: { params: PageProps<"/s/[id]">["params"] }) {
  const { id } = await params;
  const card = await getShareCard(id);
  if (!card) notFound();
  return (
    <div className="space-y-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated image, not optimisable */}
      <img
        src={`/s/${card.id}/image`}
        alt={`${card.data.name}: ${card.data.title}, ${card.data.headline}`}
        width={1200}
        height={630}
        className="aspect-[1200/630] w-full rounded-2xl border shadow-sm"
      />
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-success" aria-hidden="true" />
        {SHARE_KIND_LABELS[card.kind]} verified by {siteConfig.name} ·{" "}
        {formatDate(new Date(`${card.data.date}T12:00:00Z`))}
      </p>
      <div className="space-y-3">
        <h1 className="title-app">Prepare for placements like {card.data.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">
          Company-wise practice, real exam-style mock tests and a weekly All-India mock with live
          ranks.
        </p>
        <Button asChild size="lg">
          <Link href="/sign-up">Start free</Link>
        </Button>
      </div>
    </div>
  );
}
