import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/shared/json-ld";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  GraduationCap,
  IndianRupee,
  MapPin,
  XCircle,
} from "lucide-react";
import { SaveJobButton } from "@/app/(public)/jobs/save-button";
import { postedLabel } from "@/components/jobs/job-card";
import { Markdown } from "@/components/shared/markdown";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { formatDate, plainExcerpt } from "@/lib/format";
import { JOB_TYPE_LABELS, WORK_MODE_LABELS, experienceLabel } from "@/lib/jobs/postings";
import { checkEligibility, overallEligibility } from "@/lib/learning/eligibility";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getJob, jobMarks } from "@/server/services/job-postings";

export async function generateMetadata({ params }: PageProps<"/jobs/[slug]">): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) return { title: "Job not found", robots: { index: false } };
  return {
    title: `${job.title} at ${job.companyName}`,
    description: plainExcerpt(job.description, 160),
    alternates: { canonical: `/jobs/${job.slug}` },
    openGraph: { title: `${job.title} at ${job.companyName}`, url: `/jobs/${job.slug}` },
    ...(job.open ? {} : { robots: { index: false } }),
  };
}

export default function JobPage({ params, searchParams }: PageProps<"/jobs/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<PageSkeleton />}>
        <JobDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const EMPLOYMENT_TYPES = { FULL_TIME: "FULL_TIME", INTERNSHIP: "INTERN", CONTRACT: "CONTRACTOR" };

async function JobDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/jobs/[slug]">["params"];
  searchParams: PageProps<"/jobs/[slug]">["searchParams"];
}) {
  await connection();
  const { slug } = await params;
  const { closed } = await searchParams;
  const job = await getJob(slug);
  if (!job) notFound();
  const experience = experienceLabel(job.minExperience, job.maxExperience);

  // Google for Jobs (schema.org JobPosting).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: (job.publishedAt ?? job.createdAt).toISOString(),
    ...(job.applyBy && {
      validThrough: `${job.applyBy.toISOString().slice(0, 10)}T23:59:59+05:30`,
    }),
    employmentType: EMPLOYMENT_TYPES[job.jobType],
    hiringOrganization: { "@type": "Organization", name: job.companyName },
    ...(job.workMode === "REMOTE"
      ? {
          jobLocationType: "TELECOMMUTE",
          applicantLocationRequirements: { "@type": "Country", name: "India" },
        }
      : {
          jobLocation: (job.locations.length ? job.locations : ["India"]).map((city) => ({
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "IN" },
          })),
        }),
    url: `${siteConfig.url}/jobs/${job.slug}`,
  };

  return (
    <article className="space-y-8">
      {job.open ? <JsonLd data={jsonLd} /> : null}

      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/jobs" className="hover:text-foreground">
          Jobs
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span aria-current="page" className="truncate text-foreground">
          {job.title}
        </span>
      </nav>

      {!job.open || closed ? (
        <Alert>
          <CircleAlert />
          <AlertDescription>
            This job is no longer taking applications.{" "}
            <Link href="/jobs" className="text-primary hover:underline">
              See open jobs
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{JOB_TYPE_LABELS[job.jobType]}</Badge>
            <Badge variant="outline">{WORK_MODE_LABELS[job.workMode]}</Badge>
            {job.audience.map((a) => (
              <Badge key={a} variant="outline">
                {a === "FRESHER" ? "Freshers" : "Experienced"}
              </Badge>
            ))}
          </div>
          <h1 className="title-display">{job.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-lg">
            {job.company ? (
              <Link href={`/companies/${job.company.slug}`} className="font-medium hover:underline">
                {job.companyName}
              </Link>
            ) : (
              <span className="font-medium">{job.companyName}</span>
            )}
            <span className="text-sm text-muted-foreground">· {postedLabel(job.publishedAt)}</span>
          </p>
        </div>
        <Suspense fallback={null}>
          <ApplyBar jobId={job.id} slug={job.slug} open={job.open} />
        </Suspense>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>About the role</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Markdown>{job.description}</Markdown>
            </CardContent>
          </Card>
          {job.skills.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Skills</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {job.skills.map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {job.company ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Prepare for {job.company.name}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/companies/${job.company.slug}`}>
                    <Building2 /> Hiring process and syllabus
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/practice/session?company=${job.company.slug}`}>
                    Practise their questions
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>At a glance</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <Fact icon={MapPin} label="Location">
                  {job.workMode === "REMOTE"
                    ? "Remote (India)"
                    : job.locations.join(", ") || "India"}
                </Fact>
                {experience ? (
                  <Fact icon={Briefcase} label="Experience">
                    {experience}
                  </Fact>
                ) : null}
                {job.salary ? (
                  <Fact icon={IndianRupee} label="Pay">
                    {job.salary}
                  </Fact>
                ) : null}
                {job.applyBy ? (
                  <Fact icon={CalendarClock} label="Apply by">
                    {formatDate(job.applyBy)}
                  </Fact>
                ) : null}
                {job.gradYears.length || job.branches.length ? (
                  <Fact icon={GraduationCap} label="Who can apply">
                    {[
                      job.gradYears.length ? `Batch ${job.gradYears.join(", ")}` : null,
                      job.branches.length ? job.branches.join(", ") : null,
                      job.minCgpa !== null ? `CGPA ${job.minCgpa}+` : null,
                      job.maxBacklogs === 0 ? "no active backlogs" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Fact>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <Suspense fallback={null}>
            <PersonalEligibility
              rules={{
                minCgpa: job.minCgpa,
                maxBacklogs: job.maxBacklogs,
                branches: job.branches,
                gradYears: job.gradYears,
              }}
            />
          </Suspense>
          <p className="text-xs text-muted-foreground">
            You apply on {job.companyName}&apos;s own site. {siteConfig.name} never charges for job
            applications; report any job that asks you for money.
          </p>
        </aside>
      </div>
    </article>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

/** Reads the session, so it streams in after the page. */
async function ApplyBar({ jobId, slug, open }: { jobId: string; slug: string; open: boolean }) {
  const user = await getCurrentUser();
  const student = user && can(user.roles, "student.access") ? user : null;
  const marks = student ? await jobMarks(student.id, [jobId]) : null;
  const applied = marks?.applied.get(jobId);
  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Button asChild size="lg">
            {/* A plain link (not prefetched): the click is counted on the way out. */}
            <a
              href={`/jobs/${slug}/apply`}
              target="_blank"
              rel="nofollow noopener noreferrer"
              data-testid="apply-job"
            >
              Apply on company site <ExternalLink />
            </a>
          </Button>
        ) : null}
        {student ? <SaveJobButton jobId={jobId} saved={marks!.saved.has(jobId)} label /> : null}
      </div>
      {applied ? (
        <p className="inline-flex items-center gap-1 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" /> You opened the application on{" "}
          {formatDate(applied)}
        </p>
      ) : null}
    </div>
  );
}

const STATUS = {
  ok: { icon: CheckCircle2, className: "text-success", label: "You meet this" },
  fail: { icon: XCircle, className: "text-destructive", label: "You don't meet this" },
  unknown: { icon: CircleHelp, className: "text-warning", label: "Check this" },
} as const;

async function PersonalEligibility({ rules }: { rules: Parameters<typeof checkEligibility>[1] }) {
  const hasRules =
    rules.minCgpa !== null ||
    rules.maxBacklogs !== null ||
    rules.branches.length ||
    rules.gradYears.length;
  if (!hasRules) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await db.fresherProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return null;
  const checks = checkEligibility(profile, rules);
  const overall = overallEligibility(checks);
  return (
    <Card data-testid="job-eligibility">
      <CardHeader>
        <CardTitle>
          <h2 className={cn(STATUS[overall].className)}>
            {overall === "ok"
              ? "You're eligible"
              : overall === "fail"
                ? "You may not be eligible"
                : "Check your eligibility"}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {checks.map((check) => {
            const style = STATUS[check.status];
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
      </CardContent>
    </Card>
  );
}
