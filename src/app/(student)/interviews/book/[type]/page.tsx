import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Briefcase, Languages, Star, UserRound } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { listInterviewers } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Choose an interviewer" };

export default function ChooseInterviewerPage({ params }: PageProps<"/interviews/book/[type]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/interviews">
          <ArrowLeft /> Mock interviews
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Interviewers params={params} />
      </Suspense>
    </div>
  );
}

async function Interviewers({
  params,
}: {
  params: PageProps<"/interviews/book/[type]">["params"];
}) {
  await requirePermission("student.access");
  const { type: slug } = await params;
  const result = await listInterviewers(slug);
  if (!result) notFound();
  const { type, interviewers } = result;

  return (
    <div className="space-y-6">
      <PageHeader
        title={type.name}
        description={`${type.durationMin} minutes · ${formatRupees(type.pricePaise)} · ${type.description}`}
      />
      {interviewers.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No interviewers yet"
          description="We're onboarding interviewers for this type. Check back soon."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {interviewers.map((i) => (
            <li key={i.id}>
              <Card className="h-full" data-testid="interviewer-card">
                <CardContent className="flex h-full flex-col gap-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{i.name}</p>
                      <p className="text-sm text-muted-foreground">{i.headline}</p>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 text-sm"
                      aria-label={i.rating ? `Rated ${i.rating} of 5` : "New interviewer"}
                    >
                      <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                      {i.rating ? `${i.rating} (${i.ratingCount})` : "New"}
                    </span>
                  </div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Briefcase className="size-4" aria-hidden="true" /> {i.currentRole} at{" "}
                      {i.currentCompany} · {i.yearsExperience} yrs
                    </li>
                    <li className="flex items-center gap-2">
                      <Languages className="size-4" aria-hidden="true" /> {i.languages.join(", ")}
                    </li>
                  </ul>
                  <p className="line-clamp-3 text-sm">{i.bio}</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {i.nextSlot
                        ? `Next free: ${formatSlot(i.nextSlot)} IST`
                        : "No free times in the next 2 weeks"}
                    </span>
                    <Button asChild size="sm" disabled={!i.nextSlot}>
                      <Link href={`/interviews/book/${type.slug}/${i.id}`}>See times</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
