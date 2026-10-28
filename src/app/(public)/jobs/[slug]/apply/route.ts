// "Apply" on a job: counts the click and sends the student to the employer's application page
// (D-050). A plain link target, never prefetched; robots.ts keeps crawlers out.

import { NextResponse } from "next/server";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/server/auth";
import { recordApplyClick } from "@/server/services/job-postings";

export async function GET(_request: Request, { params }: RouteContext<"/jobs/[slug]/apply">) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const target = await recordApplyClick(slug.slice(0, 120), user?.id ?? null);
  const location = target ?? `${siteConfig.url}/jobs/${encodeURIComponent(slug)}?closed=1`;
  return NextResponse.redirect(location, {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "origin" },
  });
}
