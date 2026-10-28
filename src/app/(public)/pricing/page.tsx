import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, Check, Sparkles, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { formatRupees } from "@/lib/commerce/pricing";
import { db } from "@/server/db";
import { getCatalog } from "@/server/services/commerce";
import { getSetting } from "@/server/services/settings";

export const metadata: Metadata = {
  title: "Plans and pricing",
  description: `Free practice every day. ${siteConfig.name} Pro unlocks everything; company packs and 1:1 mock interviews with engineers from top companies.`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-12 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Simple plans, priced for students
        </h1>
        <p className="text-pretty text-muted-foreground">
          Start free. Upgrade when your drive is close. Prices include GST; no auto-renewal.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-xl" />}>
        <Plans />
      </Suspense>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

async function Plans() {
  const [catalog, mcq, coding, mocks, windowHours, companies] = await Promise.all([
    getCatalog(),
    getSetting("limits.freeMcqPerDay"),
    getSetting("limits.freeCodingProblems"),
    getSetting("limits.freeMocksPerCompany"),
    getSetting("interviews.rescheduleHours"),
    db.company.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);
  const perMonth = Math.round(catalog.pro.halfYearly / 6 / 100) * 100;

  return (
    <div className="space-y-12">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>
              <h2>Free</h2>
            </CardTitle>
            <CardDescription>Everything you need to start.</CardDescription>
            <p className="pt-2 text-3xl font-semibold">₹0</p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <ul className="space-y-2">
              <Feature>All company pages, patterns and eligibility</Feature>
              <Feature>{mcq} practice questions a day, with explanations</Feature>
              <Feature>{coding} coding problems with a real judge</Feature>
              <Feature>{mocks} full mock test per company, plus topic tests</Feature>
              <Feature>Readiness score, streaks and mistake notebook</Feature>
            </ul>
            <Button asChild variant="outline" className="mt-auto">
              <Link href="/sign-up">Start free</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col border-primary shadow-md">
          <CardHeader>
            <Badge className="w-fit">Most popular</Badge>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" aria-hidden="true" /> Pro
              </h2>
            </CardTitle>
            <CardDescription>Everything except 1:1 interviews.</CardDescription>
            <p className="pt-2 text-3xl font-semibold">
              {formatRupees(catalog.pro.monthly)}
              <span className="text-base font-normal text-muted-foreground"> / month</span>
            </p>
            <p className="text-sm text-muted-foreground">
              or {formatRupees(catalog.pro.halfYearly)} for 6 months ({formatRupees(perMonth)}
              /month)
            </p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <ul className="space-y-2">
              <Feature>Unlimited practice in every subject</Feature>
              <Feature>Every coding problem and online assessment</Feature>
              <Feature>Unlimited company mocks in the real exam format</Feature>
              <Feature>Career tracks and system design question bank</Feature>
            </ul>
            <div className="mt-auto grid gap-2">
              <Button asChild data-testid="buy-pro-monthly">
                <Link href="/checkout?kind=PRO&ref=monthly">Get Pro for 1 month</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/checkout?kind=PRO&ref=half-yearly">Get 6 months</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" aria-hidden="true" /> Company pack
              </h2>
            </CardTitle>
            <CardDescription>One company, everything, for 6 months.</CardDescription>
            <p className="pt-2 text-3xl font-semibold">{formatRupees(catalog.companyPack)}</p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <ul className="space-y-2">
              <Feature>All mocks for that company</Feature>
              <Feature>Its questions and coding problems, unlimited</Feature>
              <Feature>Online assessment simulations</Feature>
            </ul>
            {companies.length ? (
              <form action="/checkout" className="mt-auto grid gap-2">
                <input type="hidden" name="kind" value="COMPANY_PACK" />
                <NativeSelect
                  name="ref"
                  aria-label="Company"
                  className="w-full"
                  required
                  defaultValue=""
                >
                  <NativeSelectOption value="" disabled>
                    Choose a company
                  </NativeSelectOption>
                  {companies.map((c) => (
                    <NativeSelectOption key={c.slug} value={c.slug}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button type="submit" variant="outline">
                  Get the pack
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4" aria-labelledby="interviews-heading">
        <div className="space-y-1">
          <h2 id="interviews-heading" className="flex items-center gap-2 text-2xl font-semibold">
            <Video className="size-6 text-primary" aria-hidden="true" /> 1:1 mock interviews
          </h2>
          <p className="text-sm text-muted-foreground">
            With working engineers on Google Meet, with a written scorecard. Save with bundles of 3
            ({catalog.bundlePercent(3)}% off) or 5 ({catalog.bundlePercent(5)}% off).
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Mock interview prices</caption>
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Interview</th>
                {catalog.interviews[0]?.bundles.map((b) => (
                  <th key={b.quantity} className="px-4 py-3 font-medium">
                    {b.quantity === 1 ? "Single" : `${b.quantity} interviews`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {catalog.interviews.map((type) => (
                <tr key={type.id}>
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {type.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {type.durationMin} minutes
                    </span>
                  </th>
                  {type.bundles.map((b) => (
                    <td key={b.quantity} className="px-4 py-3">
                      <Link
                        href={`/checkout?kind=INTERVIEW_CREDITS&ref=${type.slug}&qty=${b.quantity}`}
                        className="font-semibold text-primary tabular-nums hover:underline"
                      >
                        {formatRupees(b.totalPaise)}
                      </Link>
                      {b.bundleDiscountPaise ? (
                        <span className="block text-xs text-muted-foreground line-through">
                          {formatRupees(b.listPaise)}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2" aria-label="Questions">
        {[
          [
            "Does anything renew automatically?",
            "No. Plans end on their date; you buy again only if you want to. Buying again before the end extends your plan.",
          ],
          [
            "Can I get a refund?",
            `Unused purchases can be refunded: ask support from your account page. Interview bookings can be moved or cancelled for a credit up to ${windowHours} hours before the slot.`,
          ],
          [
            "Is GST included?",
            `Yes, prices include ${catalog.gstPercent}% GST. Every purchase comes with a GST invoice.`,
          ],
          [
            "What if the interviewer doesn't turn up?",
            "You get your credit back to book again, and we follow up with the interviewer.",
          ],
        ].map(([q, a]) => (
          <div key={q} className="space-y-1">
            <h3 className="font-medium">{q}</h3>
            <p className="text-sm text-muted-foreground">{a}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
