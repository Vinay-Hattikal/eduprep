import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { HoldForm } from "@/app/(student)/interviews/book/[type]/[interviewer]/hold-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRupees } from "@/lib/commerce/pricing";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { getSlots, listInterviewers } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Pick a time" };

export default function PickTimePage({
  params,
}: PageProps<"/interviews/book/[type]/[interviewer]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PickTime params={params} />
    </Suspense>
  );
}

async function PickTime({
  params,
}: {
  params: PageProps<"/interviews/book/[type]/[interviewer]">["params"];
}) {
  await requirePermission("student.access");
  const { type: typeSlug, interviewer: interviewerId } = await params;
  const [list, slots, companies] = await Promise.all([
    listInterviewers(typeSlug),
    getSlots(interviewerId, typeSlug),
    db.company.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const interviewer = list?.interviewers.find((i) => i.id === interviewerId);
  if (!list || !interviewer) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/interviews/book/${typeSlug}`}>
          <ArrowLeft /> Interviewers
        </Link>
      </Button>
      <PageHeader
        title={`${list.type.name} with ${interviewer.name}`}
        description={`${interviewer.currentRole} at ${interviewer.currentCompany} · ${list.type.durationMin} minutes · ${formatRupees(list.type.pricePaise)}`}
      />
      <Card>
        <CardContent className="pt-6">
          <HoldForm
            interviewerId={interviewerId}
            typeSlug={typeSlug}
            slots={slots.map((s) => s.toISOString())}
            companies={companies}
          />
        </CardContent>
      </Card>
    </div>
  );
}
