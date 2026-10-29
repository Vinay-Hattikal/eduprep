// Message templates (PRD 8.14). Pure: data in, subject + plain text out. The same text goes to
// email (wrapped in a simple layout) and WhatsApp. Times are shown in IST unless a zone is given.

import { siteConfig } from "@/config/site";
import { formatSlot } from "@/lib/time/zones";

type Booking = {
  bookingId: string;
  typeName: string;
  startsAt: string; // ISO
  otherName: string;
  meetUrl: string | null;
  timeZone?: string;
};

export type TemplateData = {
  welcome: { name: string };
  "auth.code": { code: string; purpose: "verify" | "reset" | "login"; minutes: number };
  "purchase.receipt": {
    name: string;
    label: string;
    totalRupees: string;
    invoiceNo: string;
    orderId: string;
  };
  "booking.confirmed": Booking & { name: string; role: "candidate" | "interviewer" };
  "booking.rescheduled": Booking & { name: string; role: "candidate" | "interviewer" };
  "booking.cancelled": Booking & {
    name: string;
    role: "candidate" | "interviewer";
    creditReturned: boolean;
    reason: string;
  };
  "booking.reminder": Booking & {
    name: string;
    role: "candidate" | "interviewer";
    when: "24h" | "1h";
  };
  "scorecard.ready": { name: string; bookingId: string; typeName: string; interviewerName: string };
  "scorecard.overdue": { name: string; bookingId: string; candidateName: string; typeName: string };
  "interviewer.decision": { name: string; approved: boolean; note: string | null };
  "experience.decision": {
    name: string;
    company: string;
    approved: boolean;
    points: number;
    note: string | null;
  };
  "drive-report.decision": {
    name: string;
    company: string;
    approved: boolean;
    points: number;
    note: string | null;
  };
  "jobs.digest": {
    name: string;
    jobs: { title: string; company: string; slug: string; applyBy: string | null }[];
  };
  "contest.reminder": { name: string; contest: string; slug: string; startsAt: string };
  "contest.result": {
    name: string;
    contest: string;
    slug: string;
    rank: number;
    total: number;
    percentile: number;
  };
};

export type TemplateName = keyof TemplateData;
export type Rendered = { subject: string; body: string };

const url = (path: string) => `${siteConfig.url}${path}`;
const signOff = `\n\n— Team ${siteConfig.name}`;

function when(b: Booking) {
  return `${formatSlot(new Date(b.startsAt), b.timeZone)} (${b.timeZone ?? "IST"})`;
}

function bookingLink(role: "candidate" | "interviewer", id: string) {
  return role === "candidate" ? url(`/interviews/${id}`) : url(`/interviewer/bookings/${id}`);
}

const CODE_PURPOSES = {
  verify: "confirm your email address",
  reset: "reset your password",
  login: "sign in",
} as const;

const TEMPLATES: { [K in TemplateName]: (d: TemplateData[K]) => Rendered } = {
  "auth.code": (d) => ({
    subject: `${d.code} is your ${siteConfig.name} code`,
    body: `Your code to ${CODE_PURPOSES[d.purpose]} is ${d.code}. It expires in ${d.minutes} minutes.

If you didn't ask for it, ignore this message; nobody can use it without your ${d.purpose === "login" ? "phone" : "inbox"}.${signOff}`,
  }),
  welcome: (d) => ({
    subject: `Welcome to ${siteConfig.name}`,
    body: `Hi ${d.name},\n\nYour account is ready. Pick your target companies and start with today's practice: ${url("/dashboard")}${signOff}`,
  }),
  "purchase.receipt": (d) => ({
    subject: `Payment received: ${d.label}`,
    body: `Hi ${d.name},\n\nWe received ${d.totalRupees} for ${d.label}. It's active on your account now.\nInvoice ${d.invoiceNo}: ${url(`/account/invoices/${d.orderId}`)}${signOff}`,
  }),
  "booking.confirmed": (d) => ({
    subject: `Mock interview booked: ${d.typeName}, ${formatSlot(new Date(d.startsAt), d.timeZone)}`,
    body: `Hi ${d.name},\n\nYour ${d.typeName} mock interview with ${d.otherName} is confirmed for ${when(d)}.${d.meetUrl ? `\nJoin: ${d.meetUrl}` : ""}\nDetails: ${bookingLink(d.role, d.bookingId)}${signOff}`,
  }),
  "booking.rescheduled": (d) => ({
    subject: `Mock interview moved to ${formatSlot(new Date(d.startsAt), d.timeZone)}`,
    body: `Hi ${d.name},\n\nYour ${d.typeName} mock interview with ${d.otherName} is now at ${when(d)}.${d.meetUrl ? `\nJoin: ${d.meetUrl}` : ""}\nDetails: ${bookingLink(d.role, d.bookingId)}${signOff}`,
  }),
  "booking.cancelled": (d) => ({
    subject: `Mock interview cancelled: ${d.typeName}`,
    body: `Hi ${d.name},\n\nThe ${d.typeName} mock interview with ${d.otherName} at ${when(d)} was cancelled (${d.reason}).${
      d.role === "candidate"
        ? d.creditReturned
          ? "\nYour interview credit is back on your account; book another slot any time."
          : "\nThis was inside the cancellation window, so the credit wasn't returned."
        : ""
    }${signOff}`,
  }),
  "booking.reminder": (d) => ({
    subject: `${d.when === "1h" ? "In 1 hour" : "Tomorrow"}: ${d.typeName} mock interview`,
    body: `Hi ${d.name},\n\nReminder: your ${d.typeName} mock interview with ${d.otherName} starts ${when(d)}.${d.meetUrl ? `\nJoin: ${d.meetUrl}` : ""}${
      d.role === "candidate"
        ? "\nHave a pen and paper ready, and test your camera and microphone."
        : ""
    }${signOff}`,
  }),
  "scorecard.ready": (d) => ({
    subject: `Your ${d.typeName} scorecard is ready`,
    body: `Hi ${d.name},\n\n${d.interviewerName} has shared feedback from your mock interview: scores, strengths, what to improve and topics to practise.\nRead it: ${url(`/interviews/${d.bookingId}`)}${signOff}`,
  }),
  "scorecard.overdue": (d) => ({
    subject: `Scorecard overdue: ${d.candidateName}`,
    body: `Hi ${d.name},\n\nThe scorecard for ${d.candidateName}'s ${d.typeName} interview is overdue. Candidates rely on it, and earnings are released once it's in.\nSubmit it: ${url(`/interviewer/bookings/${d.bookingId}`)}${signOff}`,
  }),
  "interviewer.decision": (d) => ({
    subject: d.approved ? `You're approved as an interviewer` : `Your interviewer application`,
    body: d.approved
      ? `Hi ${d.name},\n\nWelcome aboard. Set your weekly availability so candidates can book you: ${url("/interviewer/availability")}${signOff}`
      : `Hi ${d.name},\n\nThank you for applying. We can't approve your application right now.${d.note ? `\n\n${d.note}` : ""}${signOff}`,
  }),
  "experience.decision": (d) => ({
    subject: d.approved
      ? `Your ${d.company} interview experience is live`
      : `About your ${d.company} interview experience`,
    body: d.approved
      ? `Hi ${d.name},\n\nThanks for sharing your experience. It's now on the ${d.company} page${d.points ? ` and you earned ${d.points} points` : ""}.${signOff}`
      : `Hi ${d.name},\n\nWe couldn't publish your ${d.company} experience.${d.note ? `\n\n${d.note}` : ""}${signOff}`,
  }),
  "drive-report.decision": (d) => ({
    subject: d.approved
      ? `Your ${d.company} drive report is live`
      : `About your ${d.company} drive report`,
    body: d.approved
      ? `Hi ${d.name},\n\nThanks for reporting what ${d.company} asked. It's now on the company page${d.points ? ` and you earned ${d.points} points` : ""}.${signOff}`
      : `Hi ${d.name},\n\nWe couldn't publish your ${d.company} drive report.${d.note ? `\n\n${d.note}` : ""}${signOff}`,
  }),
  "jobs.digest": (d) => ({
    subject:
      d.jobs.length === 1
        ? `New job for you: ${d.jobs[0]!.title} at ${d.jobs[0]!.company}`
        : `${d.jobs.length} new jobs you can apply for`,
    body: `Hi ${d.name},\n\nNew openings that match your profile:\n\n${d.jobs
      .map(
        (j) =>
          `• ${j.title} at ${j.company}${j.applyBy ? ` (apply by ${j.applyBy})` : ""}\n  ${url(`/jobs/${j.slug}`)}`,
      )
      .join(
        "\n",
      )}\n\nAll openings: ${url("/jobs")}\nTurn job alerts off on your account page: ${url("/account")}${signOff}`,
  }),
  "contest.reminder": (d) => ({
    subject: `Tomorrow: ${d.contest}`,
    body: `Hi ${d.name},\n\n${d.contest} opens ${formatSlot(new Date(d.startsAt))} (IST). One attempt, a live leaderboard and your All-India rank.\n\nSee the details and start when it opens: ${url(`/contests/${d.slug}`)}\n\nTurn reminders off on your account page: ${url("/account")}${signOff}`,
  }),
  "contest.result": (d) => ({
    subject: `${d.contest}: you ranked ${d.rank.toLocaleString("en-IN")}`,
    body: `Hi ${d.name},\n\nThe results of ${d.contest} are final. You ranked ${d.rank.toLocaleString("en-IN")} of ${d.total.toLocaleString("en-IN")} (${d.percentile} percentile). Solutions are open now.\n\nYour result and the leaderboard: ${url(`/contests/${d.slug}`)}${signOff}`,
  }),
};

export function renderTemplate<K extends TemplateName>(name: K, data: TemplateData[K]): Rendered {
  return TEMPLATES[name](data);
}

/** Marketing templates respect the user's opt-out; everything above is transactional. */
export const MARKETING_TEMPLATES: readonly TemplateName[] = [];

/** Job alerts and contest reminders respect the user's alerts opt-out (D-059). */
export const ALERT_TEMPLATES: readonly TemplateName[] = ["jobs.digest", "contest.reminder"];

/** Minimal, safe HTML for email from the plain-text body (links made clickable). */
export function emailHtml(subject: string, body: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = escape(body)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(subject)}</title></head><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;margin:24px auto;padding:0 16px">${html}</body></html>`;
}
