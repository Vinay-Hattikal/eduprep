import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { InterviewTypeForm } from "@/app/admin/interview-types/interview-type-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRupees } from "@/lib/commerce/pricing";
import { requirePermission } from "@/server/auth";
import { interviewPriceOptions } from "@/server/services/interview-types";

export const metadata: Metadata = { title: "New interview type" };

export default function NewInterviewTypePage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/interview-types">
          <ArrowLeft /> Interview types
        </Link>
      </Button>
      <PageHeader
        title="New interview type"
        description="Interviewers choose the types they offer in their profile."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewType />
      </Suspense>
    </div>
  );
}

async function NewType() {
  await requirePermission("interviews.manage");
  const prices = await interviewPriceOptions();
  return (
    <Card>
      <CardContent>
        <InterviewTypeForm
          prices={prices.map((p) => ({
            key: p.key,
            label: `${p.label} · ${formatRupees(p.pricePaise)}`,
          }))}
          values={{
            slug: "",
            name: "",
            description: "",
            audience: "BOTH",
            durationMin: 45,
            priceSetting: "",
            order: 0,
            active: true,
            rubric: [],
          }}
        />
      </CardContent>
    </Card>
  );
}
