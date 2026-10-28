import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PassageForm } from "@/app/admin/passages/passage-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "New passage" };

export default function NewPassagePage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/passages">
          <ArrowLeft /> Passages
        </Link>
      </Button>
      <PageHeader
        title="New passage"
        description="Then link questions to it by entering its ID in the question editor."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewPassage />
      </Suspense>
    </div>
  );
}

async function NewPassage() {
  await requirePermission("content.edit");
  return (
    <Card>
      <CardContent>
        <PassageForm canEdit liveQuestions={0} values={{ externalId: "", title: "", body: "" }} />
      </CardContent>
    </Card>
  );
}
