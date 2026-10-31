import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Bookmark, Briefcase, Search } from "lucide-react";
import { SaveJobButton } from "@/app/(public)/jobs/save-button";
import { JobCard } from "@/components/jobs/job-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { JOB_TYPE_LABELS, WORK_MODE_LABELS } from "@/lib/jobs/postings";
import { can } from "@/lib/permissions";
import { pick } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth";
import {
  jobMarks,
  listOpenJobs,
  openJobLocations,
  savedJobs,
  type JobFilter,
} from "@/server/services/job-postings";

export const metadata: Metadata = {
  title: "Jobs for freshers and experienced engineers",
  description: `Fresher and experienced engineering jobs and internships, checked by the ${siteConfig.name} team. Apply on the company's own site.`,
  alternates: { canonical: "/jobs" },
};

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6 lg:py-14">
      <div className="max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Jobs</h1>
        <p className="text-lg text-muted-foreground">
          Openings for freshers and experienced engineers, checked by our team. You apply on the
          company&apos;s own site.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <JobList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}

async function JobList({ searchParams }: { searchParams: PageProps<"/jobs">["searchParams"] }) {
  // Openness depends on today's date: always render per request.
  await connection();
  const query = await searchParams;
  const user = await getCurrentUser();
  const student = user && can(user.roles, "student.access") ? user : null;
  const showSaved = query.saved === "1";

  const filter: JobFilter = {
    q: typeof query.q === "string" ? query.q.slice(0, 80) : undefined,
    type: pick(query.type, JOB_TYPE_LABELS),
    mode: pick(query.mode, WORK_MODE_LABELS),
    audience: pick(query.for, { FRESHER: "", EXPERIENCED: "" }),
    location: typeof query.location === "string" ? query.location.slice(0, 60) : undefined,
    page: Number(query.page) || 1,
  };

  const [result, locations] = showSaved
    ? [null, []]
    : await Promise.all([listOpenJobs(filter), openJobLocations()]);
  const saved = showSaved && student ? await savedJobs(student.id) : [];
  const jobs = result?.jobs ?? saved;
  const marks = student
    ? await jobMarks(
        student.id,
        jobs.map((j) => j.id),
      )
    : null;
  const audience = filter.audience ?? "";

  return (
    <div className="space-y-6">
      <nav aria-label="Job lists" className="flex gap-2">
        <Button asChild variant={showSaved ? "ghost" : "secondary"} size="sm">
          <Link href="/jobs" aria-current={showSaved ? undefined : "page"}>
            <Briefcase /> All jobs
          </Link>
        </Button>
        <Button asChild variant={showSaved ? "secondary" : "ghost"} size="sm">
          <Link href="/jobs?saved=1" aria-current={showSaved ? "page" : undefined}>
            <Bookmark /> Saved jobs
          </Link>
        </Button>
      </nav>

      {showSaved ? null : (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          role="search"
          aria-label="Find jobs"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              name="q"
              defaultValue={filter.q ?? ""}
              placeholder="Role, company or skill"
              aria-label="Role, company or skill"
              className="pl-8"
            />
          </div>
          <NativeSelect name="location" defaultValue={filter.location ?? ""} aria-label="Location">
            <NativeSelectOption value="">Any location</NativeSelectOption>
            <NativeSelectOption value="Remote">Remote</NativeSelectOption>
            {locations
              .filter((l) => l.toLowerCase() !== "remote")
              .map((location) => (
                <NativeSelectOption key={location} value={location}>
                  {location}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <NativeSelect name="for" defaultValue={audience} aria-label="Experience">
              <NativeSelectOption value="">Freshers and experienced</NativeSelectOption>
              <NativeSelectOption value="FRESHER">For freshers</NativeSelectOption>
              <NativeSelectOption value="EXPERIENCED">For experienced</NativeSelectOption>
            </NativeSelect>
            <NativeSelect name="type" defaultValue={filter.type ?? ""} aria-label="Job type">
              <NativeSelectOption value="">Any type</NativeSelectOption>
              {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="mode" defaultValue={filter.mode ?? ""} aria-label="Work mode">
              <NativeSelectOption value="">On-site, hybrid or remote</NativeSelectOption>
              {Object.entries(WORK_MODE_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </form>
      )}

      {showSaved && !student ? (
        <EmptyState
          icon={Bookmark}
          title="Sign in to see saved jobs"
          description="Save jobs while you browse and come back to them before the deadline."
          action={
            <Button asChild>
              <Link href={`/sign-in?next=${encodeURIComponent("/jobs?saved=1")}`}>Sign in</Link>
            </Button>
          }
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={showSaved ? "No saved jobs yet" : "No jobs match"}
          description={
            showSaved
              ? "Tap the bookmark on any job to keep it here."
              : "Try fewer filters. New jobs are added every week."
          }
        />
      ) : (
        <div className="space-y-3">
          {result ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {result.total.toLocaleString("en-IN")} open job{result.total === 1 ? "" : "s"}
            </p>
          ) : null}
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard
                  job={job}
                  applied={marks?.applied.get(job.id)}
                  actions={
                    student ? (
                      <SaveJobButton jobId={job.id} saved={marks?.saved.has(job.id) ?? false} />
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
          {result ? (
            <Pagination
              page={result.page}
              pageCount={result.pages}
              basePath="/jobs"
              params={{
                q: filter.q,
                location: filter.location,
                for: filter.audience,
                type: filter.type,
                mode: filter.mode,
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
