// Share cards (D-053): what a card shows and the links that share it. Pure.

import type { ShareKind } from "@/generated/prisma/enums";

/** Frozen into ShareCard.data when the card is created. */
export type ShareCardData = {
  name: string; // the student's first name
  title: string; // "Weekly All-India Mock #12", "Exam ready"
  headline: string; // "Rank 128 of 4,210", "78 / 100"
  detail: string | null; // "99.12 percentile", "Finish 10 mock tests."
  date: string; // ISO date of the achievement
};

export const SHARE_KIND_LABELS: Record<ShareKind, string> = {
  TEST_RESULT: "Mock test result",
  CONTEST: "All-India mock test",
  BADGE: "Badge",
};

export function shareText(data: ShareCardData, siteName: string): string {
  return `${data.title}: ${data.headline}${data.detail ? ` (${data.detail})` : ""} on ${siteName}.`;
}

export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/** LinkedIn's share dialog reads the page's Open Graph tags; only the URL is passed. */
export function linkedinShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

/** Share ids: 12 URL-safe characters from 9 random bytes, unguessable. */
export const SHARE_ID = /^[A-Za-z0-9_-]{12}$/;
