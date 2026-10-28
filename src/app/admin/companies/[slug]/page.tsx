import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, BadgeCheck, CheckCircle2, ExternalLink } from "lucide-react";
import { companyStatusAction, verifyCompanyAction } from "@/app/admin/companies/actions";
import { CompanyForm } from "@/app/admin/companies/company-form";
import { ChangeButton, HiringProcess } from "@/app/admin/companies/[slug]/hiring-process";
import { SourceForm } from "@/app/admin/companies/hiring-forms";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPANY_ACTION_LABELS, STALE_AFTER_MONTHS } from "@/lib/content/companies";
import { formatDate, plainExcerpt } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { todayUtc } from "@/server/imports/definitions/companies";
import { companyActions, getCompanyBySlug } from "@/server/services/companies";
import { getTaxonomyTree } from "@/server/services/questions";

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
  const [company, taxonomy] = await Promise.all([getCompanyBySlug(slug), getTaxonomyTree()]);
  if (!company) notFound();
  const actions = companyActions(company.status, user.roles);
  const error = typeof query.error === "string" ? query.error : null;
  const today = todayUtc().toISOString().slice(0, 10);
  const tab = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "profile";
  const canEdit = can(user.roles, "companies.manage") && company.status !== "ARCHIVED";
  const topics = taxonomy.map((s) => ({
    name: s.name,
    topics: s.topics.map((t) => ({ id: t.id, name: t.name })),
  }));

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
          <AlertTitle>
            {query.published
              ? "Saved and published"
              : query.saved === "round"
                ? "Round saved"
                : query.saved === "section"
                  ? "Section saved"
                  : query.saved === "source"
                    ? "Source added"
                    : "Saved"}
          </AlertTitle>
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

      <nav aria-label="Company sections" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b px-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={`/admin/companies/${company.slug}${t.key === "profile" ? "" : `?tab=${t.key}`}`}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.key === "process" ? <TabCount n={company.rounds.length} /> : null}
                {t.key === "sources" ? <TabCount n={company.sources.length} /> : null}
                {t.key === "questions" ? <TabCount n={company.items.length} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "profile" ? (
        <CompanyForm
          canEdit={canEdit}
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
      ) : null}

      {tab === "process" ? (
        <HiringProcess company={company} canEdit={canEdit} topics={topics} />
      ) : null}

      {tab === "sources" ? (
        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>
              Where the hiring facts come from. A company can be published only with at least one
              source.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {company.sources.length ? (
              <ul className="divide-y rounded-lg border">
                {company.sources.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                    >
                      <span className="truncate">{s.label}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                    </a>
                    <span className="text-muted-foreground">checked {formatDate(s.checkedOn)}</span>
                    {canEdit ? (
                      <ChangeButton
                        slug={company.slug}
                        op="source-delete"
                        id={s.id}
                        label={`Delete source ${s.label}`}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No sources yet" description="Add the first one below." />
            )}
            {canEdit ? (
              <div className="rounded-lg border border-dashed p-4">
                <SourceForm companyId={company.id} today={today} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "questions" ? (
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
      ) : null}
    </div>
  );
}

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "process", label: "Hiring process" },
  { key: "sources", label: "Sources" },
  { key: "questions", label: "Questions" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function TabCount({ n }: { n: number }) {
  return (
    <span className="tabular rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{n}</span>
  );
}
