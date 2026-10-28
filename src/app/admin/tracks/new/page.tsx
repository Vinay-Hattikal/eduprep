import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { TrackForm } from "@/app/admin/tracks/track-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { trackFormOptions } from "@/server/services/role-tracks";

export const metadata: Metadata = { title: "New role track" };

export default function NewTrackPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/tracks">
          <ArrowLeft /> Role tracks
        </Link>
      </Button>
      <PageHeader title="New role track" />
      <Suspense fallback={<PageSkeleton />}>
        <NewTrack />
      </Suspense>
    </div>
  );
}

async function NewTrack() {
  await requirePermission("taxonomy.manage");
  return (
    <Card>
      <CardContent>
        <TrackForm
          canEdit
          options={await trackFormOptions()}
          values={{
            slug: "",
            name: "",
            description: "",
            roadmap: "",
            audience: "EXPERIENCED",
            order: 0,
            topicIds: [],
            interviewTypes: [],
          }}
        />
      </CardContent>
    </Card>
  );
}
