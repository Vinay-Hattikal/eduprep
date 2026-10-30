import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, BadgeCheck, CheckCircle2, ExternalLink } from "lucide-react";
import { companyStatusAction, verifyCompanyAction } from "@/app/admin/companies/actions";
import { CompanyForm } from "@/app/admin/companies/company-form";
import { CompanyMocks } from "@/app/admin/companies/[slug]/company-mocks";
import { ChangeButton, HiringProcess } from "@/app/admin/companies/[slug]/hiring-process";
import { LinkedContent } from "@/app/admin/companies/[slug]/linked-content";
import { CompanyOverview, CompanyProgress, tabHref } from "@/app/admin/companies/[slug]/overview";
import { SourceForm } from "@/app/admin/companies/hiring-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPANY_ACTION_LABELS, STALE_AFTER_MONTHS } from "@/lib/content/companies";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { todayUtc } from "@/server/imports/definitions/companies";
import { companyActions, getCompanyBySlug } from "@/server/services/companies";
import { companyPublishPlan } from "@/server/services/company-publish";
import { companyReadiness } from "@/server/services/company-readiness";
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
  const tab = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "overview";
  // The topic tree is only needed by the hiring-process editors.
  const [company, taxonomy] = await Promise.all([
    getCompanyBySlug(slug),
    tab === "process" ? getTaxonomyTree() : [],
  ]);
  if (!company) notFound();
  // The checklist drives the progress bar on every tab; the publish plan only the Overview.
  const [readiness, plan] = await Promise.all([
    companyReadiness(company),
    tab === "overview" ? companyPublishPlan(company.id) : null,
  ]);
  const publishedAll =
    typeof query.published_all === "string" ? query.published_all.split(".").map(Number) : null;
  const publishNotes = typeof query.notes === "string" ? query.notes.split("\n") : [];
  const actions = companyActions(company.status, user.roles);
  const error = typeof query.error === "string" ? query.error : null;
  const today = todayUtc().toISOString().slice(0, 10);
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
      {publishedAll ? (
        <Alert data-testid="published-all">
          <CheckCircle2 />
          <AlertTitle>Published what was ready</AlertTitle>
          <AlertDescription>
            {publishedAll[0]} questions, {publishedAll[1]} coding problems, {publishedAll[2]} mock
            tests{publishedAll[3] ? " and the company" : ""}.
            {publishNotes.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {publishNotes.map((note, i) => (
                  <li key={i} className="break-words">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
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

      <CompanyProgress slug={company.slug} readiness={readiness} />

      <nav aria-label="Company sections" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b px-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={tabHref(company.slug, t.key)}
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
                {t.key === "questions" ? <TabCount n={company.questionCount} /> : null}
                {t.key === "coding" ? <TabCount n={company.problemCount} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" && plan ? (
        <CompanyOverview
          company={company}
          readiness={readiness}
          plan={plan}
          canPublish={can(user.roles, "companies.publish") && company.status !== "ARCHIVED"}
        />
      ) : null}

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
        <HiringProcess
          company={company}
          canEdit={canEdit}
          topics={topics}
          coverage={readiness.coverage}
        />
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
        <LinkedContent kind="question" company={company} canEdit={canEdit} query={query} />
      ) : null}
      {tab === "coding" ? (
        <LinkedContent kind="problem" company={company} canEdit={canEdit} query={query} />
      ) : null}
      {tab === "mocks" ? (
        <CompanyMocks
          company={company}
          hasTestSections={company.rounds.some((r) => r.sections.length > 0)}
        />
      ) : null}
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "profile", label: "Profile" },
  { key: "process", label: "Hiring process" },
  { key: "sources", label: "Sources" },
  { key: "questions", label: "MCQ questions" },
  { key: "coding", label: "Coding" },
  { key: "mocks", label: "Mock tests" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function TabCount({ n }: { n: number }) {
  return (
    <span className="tabular rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{n}</span>
  );
}
