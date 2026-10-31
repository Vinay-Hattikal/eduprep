import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Compass, PencilRuler } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUDIENCE_LABELS } from "@/lib/interviews/labels";
import { requirePermission } from "@/server/auth";
import { listTracks } from "@/server/services/tracks";

export const metadata: Metadata = { title: "Career tracks" };

export default function TracksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Career tracks"
        description="Role-based plans for experienced engineers: what to practise, in what order, and which interviews to take."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/design">
              <PencilRuler /> Design question bank
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Tracks />
      </Suspense>
    </div>
  );
}

async function Tracks() {
  await requirePermission("student.access");
  const tracks = await listTracks();
  if (!tracks.length) return <EmptyState icon={Compass} title="Tracks are on their way" />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tracks.map((t) => (
        <Card key={t.id} className="flex flex-col" data-testid="track-card">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              {AUDIENCE_LABELS[t.audience]}
            </Badge>
            <CardTitle>
              <h2 className="text-base">{t.name}</h2>
            </CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t._count.topics} topics</span>
            <Button asChild size="sm">
              <Link href={`/tracks/${t.slug}`}>
                Open <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
