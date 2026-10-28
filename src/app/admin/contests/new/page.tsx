import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ContestForm } from "@/app/admin/contests/contest-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { addDays, istDay } from "@/lib/learning/dates";
import { toIstInput } from "@/schemas/contest";
import { requirePermission } from "@/server/auth";
import { contestFormatOptions } from "@/server/services/contests";

export const metadata: Metadata = { title: "New All-India mock" };

export default function NewContestPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/contests">
          <ArrowLeft /> All-India mocks
        </Link>
      </Button>
      <PageHeader
        title="New All-India mock"
        description="Saved as a draft. Publishing draws one question set for everyone."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewContest />
      </Suspense>
    </div>
  );
}

async function NewContest() {
  await requirePermission("contests.manage");
  const blueprints = await contestFormatOptions();
  // Default: next Sunday, 10:00 to 22:00 IST.
  const today = istDay();
  const sunday = addDays(today, (7 - today.getUTCDay()) % 7 || 7);
  const at = (hour: number) => new Date(sunday.getTime() + (hour - 5.5) * 3_600_000);
  return (
    <ContestForm
      blueprints={blueprints}
      values={{
        title: "",
        slug: `all-india-mock-${sunday.toISOString().slice(0, 10)}`,
        description: "",
        blueprintId: "",
        startsAt: toIstInput(at(10)),
        endsAt: toIstInput(at(22)),
      }}
    />
  );
}
