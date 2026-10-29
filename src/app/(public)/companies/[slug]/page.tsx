import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  History,
  Megaphone,
  Timer,
  Video,
  XCircle,
} from "lucide-react";
import { AddTargetButton } from "@/app/(public)/companies/client-forms";
import { PublicQuestionCard } from "@/components/content/public-question-card";
import { Markdown } from "@/components/shared/markdown";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { CATEGORY_LABELS, LEVEL_LABELS, ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { questionUrl } from "@/lib/content/public-question";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { formatDate, plainExcerpt } from "@/lib/format";
import { checkEligibility, overallEligibility } from "@/lib/learning/eligibility";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { recentDriveReports } from "@/server/services/drive-reports";
import { companyJobs } from "@/server/services/job-postings";
import { getPublishedCompany } from "@/server/services/public-companies";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export async function generateMetadata({
  params,
}: PageProps<"/companies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const company = await getPublishedCompany(slug);
  if (!company) return { title: "Company not found", robots: { index: false } };
  const year = company.lastVerifiedAt.getUTCFullYear();
  return {
    title: `${company.name} hiring process, syllabus and eligibility (${year})`,
    description: `${company.name} recruitment: ${company.rounds.length} rounds, test sections and topics, eligibility and recently asked questions. Verified ${formatDate(company.lastVerifiedAt)}.`,
    alternates: { canonical: `/companies/${company.slug}` },
    openGraph: {
      title: `${company.name} placement preparation`,
      url: `/companies/${company.slug}`,
    },
  };
}

export default function CompanyPage({ params }: PageProps<"/companies/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<PageSkeleton />}>
        <CompanyDetail params={params} />
      </Suspense>
    </main>
  );
}

async function CompanyDetail({ params }: { params: PageProps<"/companies/[slug]">["params"] }) {
  const { slug } = await params;
  const company = await getPublishedCompany(slug);
  if (!company) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: company.name,
        ...(company.website ? { url: company.website } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Companies",
            item: `${siteConfig.url}/companies`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: company.name,
            item: `${siteConfig.url}/companies/${company.slug}`,
          },
        ],
      },
    ],
  };

  return (
    <article className="space-y-8">
      <script
        type="application/ld+json"
        // Escape "<" so content can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/companies" className="hover:text-foreground">
          Companies
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">
          {company.name}
        </span>
      </nav>

      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{CATEGORY_LABELS[company.category]}</Badge>
            {company.level === "FULL" ? (
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                <BadgeCheck /> Verified pattern
              </Badge>
            ) : (
              <Badge variant="outline">{LEVEL_LABELS[company.level]}: reported pattern</Badge>
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {company.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Last verified {formatDate(company.lastVerifiedAt)} · {company.sources.length} source
            {company.sources.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Suspense fallback={<Skeleton className="h-8 w-48" />}>
            <TargetButton companyId={company.id} slug={company.slug} />
          </Suspense>
          {company.questionCount ? (
            <Button asChild variant="outline">
              <Link href={`/practice/session?company=${company.slug}`}>
                Practise {company.questionCount} questions
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Overview</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Markdown>{company.overview}</Markdown>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Hiring process</h2>
              </CardTitle>
              <CardDescription>
                {company.rounds.length} round{company.rounds.length === 1 ? "" : "s"}, in order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-6 border-l pl-6">
                {company.rounds.map((round) => (
                  <li key={round.id} className="relative space-y-2">
                    <span className="tabular absolute top-0 -left-[2.15rem] flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {round.order}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{round.name}</h3>
                      <Badge variant="secondary">{ROUND_TYPE_LABELS[round.type]}</Badge>
                      {round.durationMin ? (
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <Timer className="size-3.5" aria-hidden="true" /> {round.durationMin} min
                        </span>
                      ) : null}
                      {round.isElimination ? <Badge variant="outline">Elimination</Badge> : null}
                    </div>
                    {round.description ? (
                      <p className="text-sm text-muted-foreground">{round.description}</p>
                    ) : null}
                    {round.sections.length ? (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                          <caption className="sr-only">{round.name} sections</caption>
                          <thead className="bg-surface text-left text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">Section</th>
                              <th className="px-3 py-2 font-medium">Questions</th>
                              <th className="px-3 py-2 font-medium">Time</th>
                              <th className="hidden px-3 py-2 font-medium sm:table-cell">Rules</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {round.sections.map((section) => (
                              <tr key={section.id} className="align-top">
                                <td className="px-3 py-2">
                                  <p className="font-medium">{section.name}</p>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {section.topics.map((topic) => (
                                      <Link
                                        key={topic.slug}
                                        href={`/questions/${topic.subject.slug}/${topic.slug}`}
                                        className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                      >
                                        {topic.name}
                                      </Link>
                                    ))}
                                  </div>
                                </td>
                                <td className="tabular px-3 py-2">{section.questionCount}</td>
                                <td className="tabular px-3 py-2 whitespace-nowrap">
                                  {section.minutes} min
                                </td>
                                <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                                  {[
                                    section.negativeMarks
                                      ? `−${section.negativeMarks} per wrong answer`
                                      : "No negative marking",
                                    section.canGoBack ? null : "Can't go back",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {company.sampleQuestions.length ? (
            <section className="space-y-3" aria-labelledby="sample-questions">
              <h2 id="sample-questions" className="text-xl font-semibold">
                Sample questions with answers
              </h2>
              <p className="text-sm text-muted-foreground">
                From {company.name}&apos;s question bank. Open an answer to see how it&apos;s
                solved.
              </p>
              <ol className="space-y-4">
                {company.sampleQuestions.map((q, i) => (
                  <li key={q.externalId}>
                    <PublicQuestionCard
                      question={q}
                      number={i + 1}
                      titleHref={questionUrl(q.externalId)}
                      practiceHref={`/practice/session?company=${company.slug}`}
                      headingLevel="h3"
                    />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {company.mocks.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Mock tests</h2>
                </CardTitle>
                <CardDescription>
                  Practise in {company.name}&apos;s test format: same sections, timers and marking.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {company.mocks.map((m) => (
                    <li key={m.slug} className="py-2.5 first:pt-0 last:pb-0">
                      <Link
                        href={`/mock-tests/${m.slug}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {m.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {company.recentQuestions.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Recently asked</h2>
                </CardTitle>
                <CardDescription>
                  Questions candidates reported from {company.name} tests, rewritten in our own
                  words.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="divide-y">
                  {company.recentQuestions.map((item) => (
                    <li key={item.question.externalId} className="space-y-1 py-3 first:pt-0">
                      <Link
                        href={questionUrl(item.question.externalId)}
                        className="block text-sm hover:text-primary"
                      >
                        {plainExcerpt(item.question.text, 180)}
                      </Link>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{item.question.topic.name}</span>
                        <span className="inline-flex items-center gap-1">
                          <History className="size-3" aria-hidden="true" /> Asked in{" "}
                          {item.askedIn.slice(0, 2).map(monthLabel).join(", ")}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/practice/session?company=${company.slug}`}>
                    Practise these questions
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
            <RecentDrives companyId={company.id} companyName={company.name} slug={company.slug} />
          </Suspense>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Interview experiences</h2>
              </CardTitle>
              <CardDescription>
                What candidates faced in {company.name}&apos;s rounds, checked by our team.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/companies/${company.slug}/experiences`}>Read experiences</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/experiences/new?company=${company.slug}`}>Share yours</Link>
              </Button>
              <Button asChild size="sm" className="sm:ml-auto">
                <Link href={`/checkout?kind=COMPANY_PACK&ref=${company.slug}`}>
                  Get the company pack
                </Link>
              </Button>
            </CardContent>
          </Card>

          {company.codingProblems.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Coding problems</h2>
                </CardTitle>
                <CardDescription>
                  Problems like the ones in {company.name}&apos;s coding round, with an online
                  judge.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {company.codingProblems.map((item) => (
                    <li
                      key={item.problem.slug}
                      className="flex min-w-0 items-center justify-between gap-3 py-2.5 first:pt-0"
                    >
                      <Link
                        href={`/problems/${item.problem.slug}`}
                        className="min-w-0 truncate text-sm font-medium hover:underline"
                      >
                        {item.problem.title}
                      </Link>
                      <Badge variant="outline" className="shrink-0">
                        {DIFFICULTY_LABELS[item.problem.difficulty]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Suspense fallback={null}>
            <OpenJobs companyId={company.id} companyName={company.name} />
          </Suspense>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Eligibility</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="space-y-2">
                {company.minCgpa !== null ? (
                  <Row label="Minimum CGPA" value={String(company.minCgpa)} />
                ) : null}
                {company.min10thPercent !== null ? (
                  <Row label="10th" value={`${company.min10thPercent}%+`} />
                ) : null}
                {company.min12thPercent !== null ? (
                  <Row label="12th" value={`${company.min12thPercent}%+`} />
                ) : null}
                {company.maxBacklogs !== null ? (
                  <Row
                    label="Active backlogs"
                    value={company.maxBacklogs === 0 ? "None" : `Up to ${company.maxBacklogs}`}
                  />
                ) : null}
                {company.maxGapYears !== null ? (
                  <Row
                    label="Education gap"
                    value={`Up to ${company.maxGapYears} year${company.maxGapYears === 1 ? "" : "s"}`}
                  />
                ) : null}
                <Row
                  label="Branches"
                  value={company.branches.length ? company.branches.join(", ") : "Any"}
                />
                {company.gradYears.length ? (
                  <Row label="Batches" value={company.gradYears.join(", ")} />
                ) : null}
              </dl>
              <Suspense fallback={<Skeleton className="h-20 w-full" />}>
                <PersonalEligibility
                  rules={{
                    minCgpa: company.minCgpa,
                    maxBacklogs: company.maxBacklogs,
                    branches: company.branches,
                    gradYears: company.gradYears,
                  }}
                />
              </Suspense>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Pay</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <Row label="Freshers" value={company.ctcFresher ?? "Not published"} />
                <Row label="Experienced" value={company.ctcExperienced ?? "Not published"} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Coming soon</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Timer className="size-4 shrink-0" aria-hidden="true" /> Full {company.name} mock
                test in the real exam format
              </p>
              <p className="flex items-center gap-2">
                <Video className="size-4 shrink-0" aria-hidden="true" /> 1:1 mock interviews for{" "}
                {company.name}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Sources</h2>
              </CardTitle>
              <CardDescription>Where the facts on this page come from.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {company.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {source.label} <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                    <span className="block text-xs text-muted-foreground">
                      Checked {formatDate(source.checkedOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}

/** Fresh "asked today" reports: read per request, so new ones show as soon as they're approved. */
async function RecentDrives({
  companyId,
  companyName,
  slug,
}: {
  companyId: string;
  companyName: string;
  slug: string;
}) {
  await connection();
  const reports = await recentDriveReports(companyId);
  return (
    <Card data-testid="recent-drives">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Megaphone className="size-5 text-highlight" aria-hidden="true" /> Asked in recent
            drives
          </h2>
        </CardTitle>
        <CardDescription>
          Reported by students right after their {companyName} rounds, checked by our team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.length ? (
          <ul className="divide-y">
            {reports.slice(0, 6).map((report) => (
              <li key={report.id} className="space-y-1.5 py-3 first:pt-0">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{ROUND_TYPE_LABELS[report.roundType]}</Badge>
                  <span>{formatDate(report.driveDate)}</span>
                  {report.platform ? <span>· {report.platform}</span> : null}
                  {report.location ? <span>· {report.location}</span> : null}
                  <span>· {DIFFICULTY_LABELS[report.difficulty]}</span>
                </p>
                {report.topics ? <p className="text-sm font-medium">{report.topics}</p> : null}
                <Markdown className="text-sm">{report.questions}</Markdown>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No reports in the last two months yet.</p>
        )}
        <Button asChild variant="outline" size="sm">
          <Link href={`/asked/new?company=${slug}`}>Had this drive? Report it</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

async function OpenJobs({ companyId, companyName }: { companyId: string; companyName: string }) {
  await connection();
  const jobs = await companyJobs(companyId);
  if (!jobs.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Open jobs</h2>
        </CardTitle>
        <CardDescription>{companyName} is hiring.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {jobs.map((job) => (
            <li key={job.id} className="py-2.5 first:pt-0">
              <Link href={`/jobs/${job.slug}`} className="font-medium hover:underline">
                {job.title}
              </Link>
              <p className="text-xs text-muted-foreground">
                {job.workMode === "REMOTE" ? "Remote" : job.locations.slice(0, 2).join(", ")}
                {job.applyBy ? ` · apply by ${formatDate(job.applyBy)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/** Reads the session, so it streams in after the cached page. */
async function TargetButton({ companyId, slug }: { companyId: string; slug: string }) {
  const user = await getCurrentUser();
  if (!user || !can(user.roles, "student.access")) {
    return (
      <Button asChild>
        <Link href={`/sign-in?next=${encodeURIComponent(`/companies/${slug}`)}`}>
          Sign in to prepare
        </Link>
      </Button>
    );
  }
  const target = await db.targetCompany.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
  });
  return <AddTargetButton companyId={companyId} added={Boolean(target)} />;
}

const STATUS_STYLES = {
  ok: { icon: CheckCircle2, className: "text-success", label: "You meet this" },
  fail: { icon: XCircle, className: "text-destructive", label: "You don't meet this" },
  unknown: { icon: CircleHelp, className: "text-warning", label: "Check this" },
} as const;

async function PersonalEligibility({ rules }: { rules: Parameters<typeof checkEligibility>[1] }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">
        Sign in to check your eligibility against your profile.
      </p>
    );
  }
  const profile = await db.fresherProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    return (
      <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">
        Eligibility rules apply to fresher hiring.{" "}
        <Link href="/onboarding" className="text-primary hover:underline">
          Add your education details
        </Link>{" "}
        to check them.
      </p>
    );
  }
  const checks = checkEligibility(profile, rules);
  const overall = overallEligibility(checks);
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="eligibility">
      <p className={cn("font-medium", STATUS_STYLES[overall].className)}>
        {overall === "ok"
          ? "You're eligible"
          : overall === "fail"
            ? "You may not be eligible"
            : "Check a few details"}
      </p>
      <ul className="space-y-1.5">
        {checks.map((check) => {
          const style = STATUS_STYLES[check.status];
          return (
            <li key={check.criterion} className="flex gap-2">
              <style.icon
                className={cn("mt-0.5 size-4 shrink-0", style.className)}
                aria-label={style.label}
              />
              <span>
                <span className="font-medium">{check.criterion}:</span> {check.detail}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
