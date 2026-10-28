import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Markdown } from "@/components/shared/markdown";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { db } from "@/server/db";
import {
  experienceFacets,
  listCompanyExperiences,
  RESULT_LABELS,
} from "@/server/services/experiences";

export async function generateMetadata({
  params,
}: PageProps<"/companies/[slug]/experiences">): Promise<Metadata> {
  const { slug } = await params;
  const company = await db.company.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { name: true },
  });
  return company
    ? {
        title: `${company.name} interview experiences`,
        alternates: { canonical: `/companies/${slug}/experiences` },
      }
    : { title: "Interview experiences" };
}

export default function ExperiencesPage({
  params,
  searchParams,
}: PageProps<"/companies/[slug]/experiences">) {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <Experiences params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Experiences({ params, searchParams }: PageProps<"/companies/[slug]/experiences">) {
  const { slug } = await params;
  const query = await searchParams;
  const company = await db.company.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true, name: true, slug: true },
  });
  if (!company) notFound();
  const filter = {
    role: typeof query.role === "string" ? query.role.slice(0, 80) || undefined : undefined,
    profileType: query.type === "FRESHER" || query.type === "EXPERIENCED" ? query.type : undefined,
    year: Number(query.year) || undefined,
  } as const;
  const [rows, facets] = await Promise.all([
    listCompanyExperiences(company.id, filter),
    experienceFacets(company.id),
  ]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/companies/${company.slug}`}>
          <ArrowLeft /> {company.name}
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {company.name} interview experiences
          </h1>
          <p className="text-sm text-muted-foreground">
            Shared by candidates and checked by our team. {facets.total} so far.
          </p>
        </div>
        <Button asChild>
          <Link href={`/experiences/new?company=${company.slug}`}>Share yours</Link>
        </Button>
      </div>

      {facets.total ? (
        <form className="flex flex-wrap gap-2" aria-label="Filter experiences">
          <NativeSelect name="type" defaultValue={filter.profileType ?? ""} aria-label="Candidate">
            <NativeSelectOption value="">Freshers and experienced</NativeSelectOption>
            <NativeSelectOption value="FRESHER">Freshers</NativeSelectOption>
            <NativeSelectOption value="EXPERIENCED">Experienced</NativeSelectOption>
          </NativeSelect>
          <NativeSelect name="role" defaultValue={filter.role ?? ""} aria-label="Role">
            <NativeSelectOption value="">All roles</NativeSelectOption>
            {facets.roles.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {r}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            name="year"
            defaultValue={filter.year ? String(filter.year) : ""}
            aria-label="Year"
          >
            <NativeSelectOption value="">Any year</NativeSelectOption>
            {facets.years.map((y) => (
              <NativeSelectOption key={y} value={String(y)}>
                {y}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No experiences yet"
          description={`Interviewed at ${company.name}? Be the first to share.`}
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((x) => (
            <li key={x.id}>
              <Card data-testid="experience">
                <CardHeader>
                  <CardTitle>
                    <h2 className="text-base">
                      {x.role} · {x.year}
                    </h2>
                  </CardTitle>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">
                      {x.profileType === "EXPERIENCED"
                        ? `Experienced${x.yearsExperience ? `, ${x.yearsExperience} yrs` : ""}`
                        : "Fresher"}
                    </Badge>
                    <Badge variant="outline">{RESULT_LABELS[x.result]}</Badge>
                    <span className="text-muted-foreground">{x.author ?? "Anonymous"}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <section className="space-y-1">
                    <h3 className="text-sm font-semibold">Rounds</h3>
                    <Markdown className="text-base">{x.rounds}</Markdown>
                  </section>
                  <section className="space-y-1">
                    <h3 className="text-sm font-semibold">Questions</h3>
                    <Markdown className="text-base">{x.questions}</Markdown>
                  </section>
                  {x.tips ? (
                    <section className="space-y-1">
                      <h3 className="text-sm font-semibold">Tips</h3>
                      <Markdown className="text-base">{x.tips}</Markdown>
                    </section>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
