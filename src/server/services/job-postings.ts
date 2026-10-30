import "server-only";

// Jobs board (D-050): the team posts jobs; students find them here and apply on the employer's
// site. Apply clicks are counted so the team can see what students act on.

import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { JobType, ProfileType, WorkMode } from "@/generated/prisma/enums";
import { istDay } from "@/lib/learning/dates";
import { isAcceptingApplications, jobSlug } from "@/lib/jobs/postings";
import type { JobPostingInput } from "@/schemas/job-posting";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

export const JOBS_PAGE_SIZE = 20;

export type JobFilter = {
  q?: string;
  type?: JobType;
  mode?: WorkMode;
  audience?: ProfileType;
  location?: string;
  page?: number;
};

/** Published postings still taking applications. */
function openWhere(today: Date): Prisma.JobPostingWhereInput {
  return { status: "PUBLISHED", OR: [{ applyBy: null }, { applyBy: { gte: today } }] };
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  companyName: true,
  company: { select: { slug: true, name: true } },
  locations: true,
  workMode: true,
  jobType: true,
  audience: true,
  minExperience: true,
  maxExperience: true,
  salary: true,
  skills: true,
  applyBy: true,
  publishedAt: true,
} satisfies Prisma.JobPostingSelect;

export type JobCard = Prisma.JobPostingGetPayload<{ select: typeof cardSelect }>;

export async function listOpenJobs(filter: JobFilter, today = istDay()) {
  const q = filter.q?.trim();
  const where: Prisma.JobPostingWhereInput = {
    AND: [
      openWhere(today),
      ...(q
        ? [
            {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { companyName: { contains: q, mode: "insensitive" as const } },
                { skills: { has: q } },
              ],
            },
          ]
        : []),
      ...(filter.type ? [{ jobType: filter.type }] : []),
      ...(filter.mode ? [{ workMode: filter.mode }] : []),
      ...(filter.audience ? [{ audience: { has: filter.audience } }] : []),
      ...(filter.location?.trim()
        ? [
            {
              OR: [
                { locations: { has: filter.location.trim() } },
                ...(filter.location.trim().toLowerCase() === "remote"
                  ? [{ workMode: "REMOTE" as const }]
                  : []),
              ],
            },
          ]
        : []),
    ],
  };
  const page = Math.max(1, filter.page ?? 1);
  const [jobs, total] = await Promise.all([
    db.jobPosting.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * JOBS_PAGE_SIZE,
      take: JOBS_PAGE_SIZE,
      select: cardSelect,
    }),
    db.jobPosting.count({ where }),
  ]);
  return { jobs, total, page, pages: Math.max(1, Math.ceil(total / JOBS_PAGE_SIZE)) };
}

/** Every open job's slug, for the sitemap. */
export async function openJobSlugs(today = istDay()) {
  return db.jobPosting.findMany({
    where: openWhere(today),
    orderBy: { publishedAt: "desc" },
    take: 5000,
    select: { slug: true, updatedAt: true },
  });
}

/** Locations used by open jobs, most common first, for the filter. */
export async function openJobLocations(today = istDay()): Promise<string[]> {
  const rows = await db.jobPosting.findMany({
    where: openWhere(today),
    select: { locations: true },
  });
  const counts = new Map<string, number>();
  for (const location of rows.flatMap((r) => r.locations))
    counts.set(location, (counts.get(location) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([location]) => location)
    .slice(0, 30);
}

/** A posting for its public page: published or closed (closed ones say so). */
export async function getJob(slug: string) {
  const job = await db.jobPosting.findFirst({
    where: { slug, status: { in: ["PUBLISHED", "CLOSED"] } },
    include: { company: { select: { slug: true, name: true, status: true } } },
  });
  if (!job) return null;
  return {
    ...job,
    company: job.company?.status === "PUBLISHED" ? job.company : null,
    open: isAcceptingApplications(job, istDay()),
  };
}

/** Open jobs from the same company, for its company page and "more jobs" lists. */
export async function companyJobs(companyId: string, take = 5) {
  return db.jobPosting.findMany({
    where: { ...openWhere(istDay()), companyId },
    orderBy: { publishedAt: "desc" },
    take,
    select: cardSelect,
  });
}

/** The student's saved and applied jobs among `jobIds`. */
export async function jobMarks(userId: string, jobIds: string[]) {
  const [saved, applied] = await Promise.all([
    db.jobSave.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true } }),
    db.jobApplyClick.findMany({
      where: { userId, jobId: { in: jobIds } },
      select: { jobId: true, createdAt: true },
    }),
  ]);
  return {
    saved: new Set(saved.map((s) => s.jobId)),
    applied: new Map(applied.map((a) => [a.jobId, a.createdAt])),
  };
}

export async function savedJobs(userId: string) {
  const rows = await db.jobSave.findMany({
    where: { userId, job: { status: { in: ["PUBLISHED", "CLOSED"] } } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { job: { select: { ...cardSelect, status: true } } },
  });
  return rows.map((r) => r.job);
}

export async function toggleSaveJob(userId: string, jobId: string): Promise<boolean> {
  const key = { userId_jobId: { userId, jobId } };
  if (await db.jobSave.findUnique({ where: key })) {
    await db.jobSave.delete({ where: key });
    return false;
  }
  const exists = await db.jobPosting.count({ where: { id: jobId, status: "PUBLISHED" } });
  if (!exists) return false;
  await db.jobSave.create({ data: { userId, jobId } });
  return true;
}

/**
 * Where "Apply" goes. Counts the click (once per signed-in student; every anonymous click) and
 * returns the employer's link, or null if the job isn't open.
 */
export async function recordApplyClick(slug: string, userId: string | null) {
  const job = await db.jobPosting.findFirst({
    where: { slug },
    select: { id: true, applyUrl: true, status: true, applyBy: true },
  });
  if (!job || !isAcceptingApplications(job, istDay())) return null;
  let first = true;
  if (userId) {
    const created = await db.jobApplyClick.createMany({
      data: [{ userId, jobId: job.id }],
      skipDuplicates: true,
    });
    first = created.count === 1;
  }
  if (first)
    await db.jobPosting.update({
      where: { id: job.id },
      data: { applyClicks: { increment: 1 } },
    });
  return job.applyUrl;
}

// ---------- Admin ----------

export async function listPostingsForAdmin(
  status?: "DRAFT" | "PUBLISHED" | "CLOSED",
  companyId?: string,
) {
  return db.jobPosting.findMany({
    where: { ...(status && { status }), ...(companyId && { companyId }) },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      companyName: true,
      status: true,
      applyBy: true,
      applyClicks: true,
      publishedAt: true,
      updatedAt: true,
      _count: { select: { saves: true } },
    },
  });
}

export async function getPostingForAdmin(id: string) {
  return db.jobPosting.findUnique({
    where: { id },
    include: { _count: { select: { saves: true, applyRecords: true } } },
  });
}

export type SavePostingResult =
  | { ok: true; id: string }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

export async function savePosting(
  input: JobPostingInput,
  actor: Pick<CurrentUser, "id">,
): Promise<SavePostingResult> {
  if (input.companyId) {
    const company = await db.company.findUnique({
      where: { id: input.companyId },
      select: { id: true },
    });
    if (!company) return { ok: false, fieldErrors: { companyId: "Choose a listed company." } };
  }
  const { id, ...data } = input;
  if (id) {
    const before = await db.jobPosting.findUnique({ where: { id } });
    if (!before) return { ok: false, formError: "This posting no longer exists." };
    await db.jobPosting.update({ where: { id }, data });
    await recordAudit({
      actorId: actor.id,
      action: "job-posting.update",
      entityType: "job-posting",
      entityId: id,
      before: { title: before.title, applyUrl: before.applyUrl, status: before.status },
      after: { title: data.title, applyUrl: data.applyUrl },
    });
    return { ok: true, id };
  }
  const created = await db.jobPosting.create({
    data: {
      ...data,
      slug: jobSlug(data.title, data.companyName, randomBytes(3).toString("hex")),
      createdById: actor.id,
    },
    select: { id: true },
  });
  await recordAudit({
    actorId: actor.id,
    action: "job-posting.create",
    entityType: "job-posting",
    entityId: created.id,
    after: { title: data.title, companyName: data.companyName },
  });
  return { ok: true, id: created.id };
}

export type PostingStatusAction = "publish" | "close" | "reopen" | "unpublish";

export async function setPostingStatus(
  id: string,
  action: PostingStatusAction,
  actor: Pick<CurrentUser, "id">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const posting = await db.jobPosting.findUnique({ where: { id } });
  if (!posting) return { ok: false, error: "Not found." };
  const allowed: Record<PostingStatusAction, string[]> = {
    publish: ["DRAFT"],
    close: ["PUBLISHED"],
    reopen: ["CLOSED"],
    unpublish: ["PUBLISHED", "CLOSED"],
  };
  if (!allowed[action].includes(posting.status))
    return { ok: false, error: `Can't ${action} a ${posting.status.toLowerCase()} posting.` };
  if ((action === "publish" || action === "reopen") && posting.applyBy) {
    if (posting.applyBy < istDay())
      return { ok: false, error: "The last day to apply has passed. Change it first." };
  }
  const status = action === "close" ? "CLOSED" : action === "unpublish" ? "DRAFT" : "PUBLISHED";
  await db.jobPosting.update({
    where: { id },
    data: {
      status,
      ...(status === "PUBLISHED" && !posting.publishedAt && { publishedAt: new Date() }),
    },
  });
  await recordAudit({
    actorId: actor.id,
    action: `job-posting.${action}`,
    entityType: "job-posting",
    entityId: id,
    before: { status: posting.status },
    after: { status },
  });
  return { ok: true };
}
