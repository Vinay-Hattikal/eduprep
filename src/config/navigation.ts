// Navigation for each app area. Icons are referenced by name so the config can cross the
// server/client boundary; src/components/layout/nav-icons.tsx maps names to components.

import type { Permission } from "@/lib/permissions";

export type NavIconName =
  | "dashboard"
  | "practice"
  | "tests"
  | "coding"
  | "interviews"
  | "progress"
  | "companies"
  | "questions"
  | "review"
  | "reports"
  | "taxonomy"
  | "imports"
  | "users"
  | "settings"
  | "audit"
  | "calendar"
  | "scorecards"
  | "earnings"
  | "analytics"
  | "jobs"
  | "tracks"
  | "interviewers"
  | "payouts"
  | "coupons"
  | "notifications"
  | "experiences"
  | "design"
  | "contests"
  | "jobBoard"
  | "achievements"
  | "driveReports"
  | "discussions"
  | "passages"
  | "interviewTypes";

export type NavItem = {
  title: string;
  href: string;
  icon: NavIconName;
  /** Shown only to users with this permission (admin area). */
  permission?: Permission;
};

export type NavSection = { title?: string; items: NavItem[] };

export const studentNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { title: "Practice", href: "/practice", icon: "practice" },
  { title: "Mock tests", href: "/tests", icon: "tests" },
  { title: "Coding", href: "/coding", icon: "coding" },
  { title: "Interviews", href: "/interviews", icon: "interviews" },
  { title: "Career tracks", href: "/tracks", icon: "tracks" },
  { title: "Progress", href: "/progress", icon: "progress" },
  { title: "All-India mocks", href: "/contests", icon: "contests" },
  { title: "Jobs", href: "/jobs", icon: "jobBoard" },
  { title: "Achievements", href: "/achievements", icon: "achievements" },
];

export const adminNav: NavSection[] = [
  {
    items: [{ title: "Overview", href: "/admin", icon: "dashboard", permission: "admin.access" }],
  },
  {
    title: "Content",
    items: [
      {
        title: "Questions",
        href: "/admin/questions",
        icon: "questions",
        permission: "content.view",
      },
      {
        title: "Passages",
        href: "/admin/passages",
        icon: "passages",
        permission: "content.view",
      },
      {
        title: "Review queue",
        href: "/admin/review",
        icon: "review",
        permission: "content.publish",
      },
      {
        title: "Coding problems",
        href: "/admin/problems",
        icon: "coding",
        permission: "content.view",
      },
      { title: "Mock tests", href: "/admin/tests", icon: "tests", permission: "content.view" },
      {
        title: "All-India mocks",
        href: "/admin/contests",
        icon: "contests",
        permission: "contests.manage",
      },
      {
        title: "Design questions",
        href: "/admin/design",
        icon: "design",
        permission: "content.view",
      },
      {
        title: "Role tracks",
        href: "/admin/tracks",
        icon: "tracks",
        permission: "content.view",
      },
      { title: "Imports", href: "/admin/imports", icon: "imports", permission: "imports.view" },
      {
        title: "Error reports",
        href: "/admin/reports",
        icon: "reports",
        permission: "content.edit",
      },
      { title: "Taxonomy", href: "/admin/taxonomy", icon: "taxonomy", permission: "content.view" },
      {
        title: "Companies",
        href: "/admin/companies",
        icon: "companies",
        permission: "companies.manage",
      },
      {
        title: "Experiences",
        href: "/admin/experiences",
        icon: "experiences",
        permission: "experiences.moderate",
      },
      {
        title: "Drive reports",
        href: "/admin/drive-reports",
        icon: "driveReports",
        permission: "experiences.moderate",
      },
      {
        title: "Discussions",
        href: "/admin/discussions",
        icon: "discussions",
        permission: "discussions.moderate",
      },
      {
        title: "Content analytics",
        href: "/admin/analytics",
        icon: "analytics",
        permission: "content.view",
      },
    ],
  },
  {
    title: "Interviews",
    items: [
      {
        title: "Bookings",
        href: "/admin/interviews",
        icon: "interviews",
        permission: "interviews.manage",
      },
      {
        title: "Interviewers",
        href: "/admin/interviewers",
        icon: "interviewers",
        permission: "interviews.manage",
      },
      {
        title: "Interview types",
        href: "/admin/interview-types",
        icon: "interviewTypes",
        permission: "interviews.manage",
      },
      {
        title: "Payouts",
        href: "/admin/payouts",
        icon: "payouts",
        permission: "interviews.manage",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Users", href: "/admin/users", icon: "users", permission: "users.view" },
      { title: "Coupons", href: "/admin/coupons", icon: "coupons", permission: "coupons.manage" },
      {
        title: "Job postings",
        href: "/admin/postings",
        icon: "jobBoard",
        permission: "postings.manage",
      },
      {
        title: "Notifications",
        href: "/admin/notifications",
        icon: "notifications",
        permission: "notifications.view",
      },
      { title: "Jobs and judge", href: "/admin/jobs", icon: "jobs", permission: "jobs.view" },
      { title: "Settings", href: "/admin/settings", icon: "settings", permission: "settings.view" },
      { title: "Audit log", href: "/admin/audit-log", icon: "audit", permission: "audit.view" },
    ],
  },
];

export const interviewerNav: NavItem[] = [
  { title: "Overview", href: "/interviewer", icon: "dashboard" },
  { title: "Availability", href: "/interviewer/availability", icon: "calendar" },
  { title: "Interviews", href: "/interviewer/bookings", icon: "scorecards" },
  { title: "Earnings", href: "/interviewer/earnings", icon: "earnings" },
];

/** Exact match for area roots (/admin), prefix match for everything else. */
export function isActivePath(pathname: string, href: string): boolean {
  const roots = ["/admin", "/interviewer", "/dashboard"];
  if (roots.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
