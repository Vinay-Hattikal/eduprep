// Company display and freshness rules. Pure; shared by admin and (Phase 3) public pages.

import type { CompanyCategory, CompanyLevel, RoundType } from "@/generated/prisma/enums";

/** PRD 5.7: warn when a company page hasn't been verified for 6 months. */
export const STALE_AFTER_MONTHS = 6;

export function isStale(lastVerifiedAt: Date, now: Date): boolean {
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() - STALE_AFTER_MONTHS);
  return lastVerifiedAt < limit;
}

export const LEVEL_LABELS: Record<CompanyLevel, string> = {
  FULL: "Full",
  STANDARD: "Standard",
  GENERIC: "Generic track",
};

export const CATEGORY_LABELS: Record<CompanyCategory, string> = {
  SERVICE: "Service",
  PRODUCT: "Product",
  CONSULTING: "Consulting",
  STARTUP: "Startup",
  OTHER: "Other",
};

export const ROUND_TYPE_LABELS: Record<RoundType, string> = {
  ONLINE_TEST: "Online test",
  CODING_TEST: "Coding test",
  GROUP_DISCUSSION: "Group discussion",
  TECHNICAL_INTERVIEW: "Technical interview",
  HR_INTERVIEW: "HR interview",
  MANAGERIAL_INTERVIEW: "Managerial interview",
};

export type CompanyStatusAction = "publish" | "unpublish" | "archive" | "restore";

export const COMPANY_ACTION_LABELS: Record<CompanyStatusAction, string> = {
  publish: "Publish",
  unpublish: "Unpublish",
  archive: "Archive",
  restore: "Restore to draft",
};

/** A tab of a company's admin workspace (D-057, D-067); "overview" is the default tab. */
export const companyTabHref = (slug: string, tab: string = "overview") =>
  `/admin/companies/${slug}${tab === "overview" ? "" : `?tab=${tab}`}`;

/** Rounds where interview questions are asked (the Interview questions tab, D-067). */
export const INTERVIEW_ROUND_TYPES: readonly RoundType[] = [
  "TECHNICAL_INTERVIEW",
  "HR_INTERVIEW",
  "MANAGERIAL_INTERVIEW",
  "GROUP_DISCUSSION",
];

/** The imports page for one company ("Import for this company", D-067). */
export const companyImportHref = (slug: string) => `/admin/imports?company=${slug}`;
