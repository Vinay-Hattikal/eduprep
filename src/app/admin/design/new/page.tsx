import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { DesignForm } from "@/app/admin/design/design-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { designFormOptions } from "@/server/services/design-questions";

export const metadata: Metadata = { title: "New design question" };

export default function NewDesignQuestionPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/design">
          <ArrowLeft /> Design questions
        </Link>
      </Button>
      <PageHeader title="New design question" description="Saved as a draft." />
      <Suspense fallback={<PageSkeleton />}>
        <NewDesignQuestion />
      </Suspense>
    </div>
  );
}

async function NewDesignQuestion() {
  await requirePermission("content.edit");
  const { tracks } = await designFormOptions();
  return (
    <Card>
      <CardContent>
        <DesignForm
          canEdit
          tracks={tracks}
          values={{
            externalId: "",
            slug: "",
            kind: "SYSTEM_DESIGN",
            title: "",
            difficulty: "MEDIUM",
            prompt: "",
            requirements: "",
            approach: "",
            tradeoffs: "",
            followUps: "",
            companies: [],
            tracks: [],
          }}
        />
      </CardContent>
    </Card>
  );
}
