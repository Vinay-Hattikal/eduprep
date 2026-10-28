import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, BadgeCheck, CheckCircle2, ExternalLink } from "lucide-react";
import { companyStatusAction, verifyCompanyAction } from "@/app/admin/companies/actions";
import { CompanyForm } from "@/app/admin/companies/company-form";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMPANY_ACTION_LABELS,
  ROUND_TYPE_LABELS,
  STALE_AFTER_MONTHS,
} from "@/lib/content/companies";
import { formatDate, plainExcerpt } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { companyActions, getCompanyBySlug } from "@/server/services/companies";

export const metadata: Metadata = { title: "Company" };

export default function CompanyPage({
  params,
  searchParams,
}: PageProps<"/admin/companies/[slug]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/companies">
          <ArrowLeft /> Companies
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <CompanyDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const asText = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

async function CompanyDetail({ params, searchParams }: PageProps<"/admin/companies/[slug]">) {
  const user = await requirePermission("companies.manage");
  const { slug } = await params;
  const query = await searchParams;
  const company = await getCompanyBySlug(slug);
  if (!company) notFound();
  const actions = companyActions(company.status, user.roles);
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={`/${company.slug} · last verified ${formatDate(company.lastVerifiedAt)}`}
        actions={<ContentStatusBadge status={company.status} />}
      />

      {query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Saved</AlertTitle>
        </Alert>
      ) : null}
      {query.verified ? (
        <Alert>
          <BadgeCheck />
          <AlertTitle>Marked as verified today</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {company.stale ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Not verified for over {STALE_AFTER_MONTHS} months</AlertTitle>
          <AlertDescription>
            Check the hiring pattern against the sources, then mark it verified.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <form key={action} action={companyStatusAction}>
            <input type="hidden" name="id" value={company.id} />
            <input type="hidden" name="slug" value={company.slug} />
            <input type="hidden" name="action" value={action} />
            <Button
              type="submit"
              variant={
                action === "publish" ? "default" : action === "archive" ? "destructive" : "outline"
              }
            >
              {COMPANY_ACTION_LABELS[action]}
            </Button>
          </form>
        ))}
        <form action={verifyCompanyAction}>
          <input type="hidden" name="id" value={company.id} />
          <input type="hidden" name="slug" value={company.slug} />
          <Button type="submit" variant="outline">
            <BadgeCheck /> Mark verified today
          </Button>
        </form>
      </div>

      <CompanyForm
        canEdit={can(user.roles, "companies.manage") && company.status !== "ARCHIVED"}
        values={{
          id: company.id,
          slug: company.slug,
          name: company.name,
          level: company.level,
          category: company.category,
          hiringFor: company.hiringFor,
          overview: company.overview,
          website: asText(company.website),
          careersUrl: asText(company.careersUrl),
          ctcFresher: asText(company.ctcFresher),
          ctcExperienced: asText(company.ctcExperienced),
          minCgpa: asText(company.minCgpa),
          min10thPercent: asText(company.min10thPercent),
          min12thPercent: asText(company.min12thPercent),
          maxBacklogs: asText(company.maxBacklogs),
          maxGapYears: asText(company.maxGapYears),
          branches: company.branches.length ? company.branches.join(", ") : "ANY",
          gradYears: company.gradYears.join(", "),
          lastVerifiedAt: company.lastVerifiedAt.toISOString().slice(0, 10),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Hiring process</CardTitle>
          <CardDescription>
            From company-rounds.csv and company-sections.csv. Edit them with Imports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {company.rounds.length === 0 ? (
            <EmptyState
              title="No rounds yet"
              description="Import company-rounds.csv for this company."
            />
          ) : (
            <ol className="space-y-4">
              {company.rounds.map((round) => (
                <li key={round.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {round.order}
                    </span>
                    <span className="font-medium">{round.name}</span>
                    <Badge variant="secondary">{ROUND_TYPE_LABELS[round.type]}</Badge>
                    {round.platform ? <Badge variant="outline">{round.platform}</Badge> : null}
                    {round.durationMin ? (
                      <span className="text-sm text-muted-foreground">{round.durationMin} min</span>
                    ) : null}
                  </div>
                  {round.sections.length ? (
                    <ul className="mt-3 space-y-1 text-sm">
                      {round.sections.map((section) => (
                        <li
                          key={section.id}
                          className="flex flex-wrap gap-x-2 text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">{section.name}</span>
                          <span className="tabular">
                            {section.questionCount}{" "}
                            {section.type === "CODING" ? "problems" : "questions"} ·{" "}
                            {section.minutes} min
                            {section.negativeMarks ? ` · −${section.negativeMarks}` : ""}
                            {section.canGoBack ? "" : " · no going back"}
                          </span>
                          <span className="w-full text-xs">
                            {section.topics.map((t) => t.name).join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>
            A company can be published only with at least one source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Sources"
            rows={company.sources}
            rowKey={(s) => s.id}
            emptyTitle="No sources yet"
            emptyDescription="Import company-sources.csv for this company."
            columns={[
              {
                key: "label",
                header: "Source",
                cell: (s) => (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {s.label} <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ),
              },
              {
                key: "checked",
                header: "Checked",
                className: "whitespace-nowrap text-muted-foreground",
                cell: (s) => formatDate(s.checkedOn),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked questions</CardTitle>
          <CardDescription>
            From company-question-map.csv. The same question can be linked to many companies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Linked questions"
            rows={company.items}
            rowKey={(item) => item.id}
            emptyTitle="No questions linked yet"
            columns={[
              {
                key: "question",
                header: "Question",
                cell: (item) =>
                  item.question ? (
                    <div className="max-w-xl">
                      <Link
                        href={`/admin/questions/${item.question.id}`}
                        className="font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {item.question.externalId}
                      </Link>
                      <p className="line-clamp-1">{plainExcerpt(item.question.text, 120)}</p>
                    </div>
                  ) : item.problem ? (
                    <div className="max-w-xl">
                      <Link
                        href={`/admin/problems/${item.problem.id}`}
                        className="font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {item.problem.externalId}
                      </Link>
                      <p className="line-clamp-1">Coding · {item.problem.title}</p>
                    </div>
                  ) : null,
              },
              {
                key: "status",
                header: "Status",
                hideOnMobile: true,
                cell: (item) => {
                  const status = item.question?.status ?? item.problem?.status;
                  return status ? <ContentStatusBadge status={status} /> : null;
                },
              },
              {
                key: "asked",
                header: "Asked in",
                hideOnMobile: true,
                cell: (item) => (item.askedIn.length ? item.askedIn.join(", ") : "—"),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
