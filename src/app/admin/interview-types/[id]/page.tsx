import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { InterviewTypeForm } from "@/app/admin/interview-types/interview-type-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRupees } from "@/lib/commerce/pricing";
import type { RubricItem } from "@/lib/interviews/policies";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { interviewPriceOptions } from "@/server/services/interview-types";

export const metadata: Metadata = { title: "Interview type" };

export default function InterviewTypePage({
  params,
  searchParams,
}: PageProps<"/admin/interview-types/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/interview-types">
          <ArrowLeft /> Interview types
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Detail({ params, searchParams }: PageProps<"/admin/interview-types/[id]">) {
  await requirePermission("interviews.manage");
  const { id } = await params;
  const query = await searchParams;
  const [type, prices] = await Promise.all([
    db.interviewType.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true, interviewers: true } } },
    }),
    interviewPriceOptions(),
  ]);
  if (!type) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={type.name}
        description={`${type._count.interviewers} interviewers offer it · ${type._count.bookings} bookings so far`}
      />
      {query.created || query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{query.created ? "Interview type created" : "Saved"}</AlertTitle>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <InterviewTypeForm
            prices={prices.map((p) => ({
              key: p.key,
              label: `${p.label} · ${formatRupees(p.pricePaise)}`,
            }))}
            values={{
              id: type.id,
              slug: type.slug,
              name: type.name,
              description: type.description,
              audience: type.audience,
              durationMin: type.durationMin,
              priceSetting: type.priceSetting,
              order: type.order,
              active: type.active,
              rubric: type.rubric as RubricItem[],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
