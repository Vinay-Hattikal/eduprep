import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShareForm } from "@/app/(student)/experiences/new/share-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { listMyExperiences } from "@/server/services/experiences";
import { getSetting } from "@/server/services/settings";

export const metadata: Metadata = { title: "Share an interview experience" };

const STATUS = {
  PENDING: "Waiting for review",
  APPROVED: "Published",
  REJECTED: "Not published",
} as const;

export default function ShareExperiencePage({ searchParams }: PageProps<"/experiences/new">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Share an interview experience"
        description="Help the next batch: what the rounds were like and what was asked."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Share searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Share({
  searchParams,
}: {
  searchParams: PageProps<"/experiences/new">["searchParams"];
}) {
  const user = await requirePermission("student.access");
  const { company } = await searchParams;
  const [companies, mine, points] = await Promise.all([
    db.company.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    listMyExperiences(user.id),
    getSetting("points.experienceApproved"),
  ]);
  const defaultCompany = companies.find((c) => c.slug === company)?.id;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardContent className="pt-6">
          <ShareForm
            companies={companies}
            defaultCompany={defaultCompany}
            profileType={user.profileType}
          />
        </CardContent>
      </Card>
      <aside className="space-y-3">
        <p className="text-sm text-muted-foreground">
          You earn {points} points for each published experience.
        </p>
        {mine.length ? (
          <ul className="space-y-2">
            {mine.map((x) => (
              <li key={x.id} className="rounded-lg border p-3 text-sm">
                <Link
                  href={`/companies/${x.company.slug}/experiences`}
                  className="font-medium hover:underline"
                >
                  {x.company.name}
                </Link>{" "}
                · {x.role}
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{STATUS[x.status]}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(x.createdAt)}</span>
                </div>
                {x.status === "REJECTED" && x.moderatorNote ? (
                  <p className="mt-1 text-xs text-muted-foreground">{x.moderatorNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </div>
  );
}
