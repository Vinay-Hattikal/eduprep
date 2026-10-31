import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgeCheck, Building2, Search } from "lucide-react";
import { RequestCompanyForm } from "@/app/(public)/companies/client-forms";
import { CompanyMark } from "@/components/shared/company-mark";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { siteConfig } from "@/config/site";
import { CATEGORY_LABELS } from "@/lib/content/companies";
import { formatDate } from "@/lib/format";
import { getPublishedCompanies } from "@/server/services/public-companies";

export const metadata: Metadata = {
  title: "Company hiring patterns, syllabus and eligibility",
  description: `Rounds, test sections, syllabus and eligibility for each company, with sources and a last-verified date. Prepare company by company on ${siteConfig.name}.`,
  alternates: { canonical: "/companies" },
};

export default function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:py-14">
      <div className="max-w-2xl space-y-3">
        <h1 className="title-display">Companies</h1>
        <p className="text-lg text-muted-foreground">
          Each company&apos;s rounds, test sections and eligibility, with the sources we checked and
          when.
        </p>
      </div>
      <Suspense fallback={<DirectorySkeleton />}>
        <Directory searchParams={searchParams} />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle>Can&apos;t find your company?</CardTitle>
          <CardDescription>Tell us. The most-requested companies are added first.</CardDescription>
        </CardHeader>
        <CardContent>
          <RequestCompanyForm />
        </CardContent>
      </Card>
    </main>
  );
}

function DirectorySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

async function Directory({
  searchParams,
}: {
  searchParams: PageProps<"/companies">["searchParams"];
}) {
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase().slice(0, 60) : "";
  const category =
    typeof query.category === "string" && query.category in CATEGORY_LABELS ? query.category : "";
  const hiring = query.hiring === "FRESHER" || query.hiring === "EXPERIENCED" ? query.hiring : "";

  const all = await getPublishedCompanies();
  const companies = all.filter(
    (c) =>
      (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q)) &&
      (!category || c.category === category) &&
      (!hiring || c.hiringFor.includes(hiring)),
  );

  return (
    <div className="space-y-6">
      <form className="flex flex-wrap gap-2" role="search" aria-label="Find a company">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search companies"
            aria-label="Search companies"
            className="pl-8"
          />
        </div>
        <NativeSelect name="category" defaultValue={category} aria-label="Company type">
          <NativeSelectOption value="">All types</NativeSelectOption>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="hiring" defaultValue={hiring} aria-label="Hiring for">
          <NativeSelectOption value="">Freshers and experienced</NativeSelectOption>
          <NativeSelectOption value="FRESHER">Hiring freshers</NativeSelectOption>
          <NativeSelectOption value="EXPERIENCED">Hiring experienced</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies match"
          description="Try a different search, or request the company below."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <li key={company.id}>
              <Link
                href={`/companies/${company.slug}`}
                className="group block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="h-full card-lift">
                  <CardHeader>
                    <CardTitle className="flex items-start gap-3">
                      <CompanyMark
                        name={company.name}
                        className="transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                      />
                      <span className="flex-1 pt-0.5">{company.name}</span>
                      {company.level === "FULL" ? (
                        <BadgeCheck
                          className="size-5 shrink-0 text-primary"
                          aria-label="Verified pattern"
                        />
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      {CATEGORY_LABELS[company.category]} ·{" "}
                      {company.hiringFor
                        .map((h) => (h === "FRESHER" ? "Freshers" : "Experienced"))
                        .join(" & ")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      {company.ctcFresher ? (
                        <Badge variant="secondary">Freshers {company.ctcFresher}</Badge>
                      ) : null}
                      <Badge variant="outline">{company._count.rounds} rounds</Badge>
                      {company._count.items ? (
                        <Badge variant="outline">{company._count.items} questions</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Verified {formatDate(company.lastVerifiedAt)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
