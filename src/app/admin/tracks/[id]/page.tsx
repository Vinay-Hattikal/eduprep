import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { setTrackVisibleAction } from "@/app/admin/tracks/actions";
import { TrackForm } from "@/app/admin/tracks/track-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { getAdminTrack, trackFormOptions } from "@/server/services/role-tracks";

export const metadata: Metadata = { title: "Role track" };

export default function TrackPage({ params, searchParams }: PageProps<"/admin/tracks/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/tracks">
          <ArrowLeft /> Role tracks
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Detail({ params, searchParams }: PageProps<"/admin/tracks/[id]">) {
  const user = await requirePermission("content.view");
  const { id } = await params;
  const query = await searchParams;
  const [track, options] = await Promise.all([getAdminTrack(id), trackFormOptions()]);
  if (!track) notFound();
  const canEdit = can(user.roles, "taxonomy.manage");
  const shown = track.status === "PUBLISHED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={track.name}
        description={shown ? "Shown to students" : "Hidden from students"}
        actions={
          <>
            {canEdit ? (
              <form action={setTrackVisibleAction}>
                <input type="hidden" name="id" value={track.id} />
                <input type="hidden" name="visible" value={shown ? "no" : "yes"} />
                <Button type="submit" variant="outline" size="sm">
                  {shown ? "Hide from students" : "Show to students"}
                </Button>
              </form>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/tracks/${track.slug}`}>
                <ExternalLink /> Open as student
              </Link>
            </Button>
          </>
        }
      />
      {query.created || query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{query.created ? "Track created" : "Saved"}</AlertTitle>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <TrackForm
            canEdit={canEdit}
            options={options}
            values={{
              id: track.id,
              slug: track.slug,
              name: track.name,
              description: track.description,
              roadmap: track.roadmap,
              audience: track.audience,
              order: track.order,
              topicIds: track.topics.map((t) => t.id),
              interviewTypes: track.interviewTypes,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
