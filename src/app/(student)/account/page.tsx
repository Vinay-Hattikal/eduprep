import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Gift, Receipt, Sparkles, Star, Video } from "lucide-react";
import { setMarketingAction, signOutOthersAction } from "@/app/(student)/account/actions";
import { PasswordForm } from "@/app/(student)/account/security";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatDate } from "@/lib/format";
import { currentSessionId, requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { accountSecurity, listSessions } from "@/server/services/accounts";
import { getAccount } from "@/server/services/commerce";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Account and purchases"
        description="Your plan, interview credits, invoices and referral code."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const user = await requirePermission("student.access");
  const [account, prefs, security, sessions, sessionId] = await Promise.all([
    getAccount(user),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { marketingOptIn: true } }),
    accountSecurity(user.id),
    listSessions(user.id),
    currentSessionId(),
  ]);
  const pro = account.active
    .filter((e) => e.kind === "PRO")
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  const proEnds = [...account.active, ...account.upcoming]
    .filter((e) => e.kind === "PRO")
    .reduce<Date | null>((max, e) => (!max || e.endsAt > max ? e.endsAt : max), null);
  const packs = account.active.filter((e) => e.kind === "COMPANY_PACK");

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Plan"
          value={pro ? "Pro" : "Free"}
          hint={pro && proEnds ? `until ${formatDate(proEnds)}` : "Upgrade any time"}
          icon={Sparkles}
        />
        <StatCard
          label="Interview credits"
          value={account.credits.reduce((n, c) => n + c.available, 0)}
          hint="ready to book"
          icon={Video}
        />
        <StatCard
          label="Points"
          value={account.points}
          hint="from referrals and shared experiences"
          icon={Star}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Access</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {pro ? (
              <p>Pro is active until {formatDate(proEnds!)}.</p>
            ) : (
              <p>You&apos;re on the free plan.</p>
            )}
            {packs.length ? (
              <ul className="space-y-1">
                {packs.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/companies/${p.company?.slug}`}
                      className="font-medium hover:underline"
                    >
                      {p.company?.name}
                    </Link>{" "}
                    pack until {formatDate(p.endsAt)}
                  </li>
                ))}
              </ul>
            ) : null}
            {account.credits.length ? (
              <ul className="space-y-1">
                {account.credits.map((c) => (
                  <li key={c.type.id} className="flex items-center justify-between gap-2">
                    <span>
                      {c.type.name}: <strong>{c.available}</strong> available
                    </span>
                    {c.available ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/interviews/book/${c.type.slug}`}>Book</Link>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild variant={pro ? "outline" : "default"} size="sm">
              <Link href="/pricing">{pro ? "Extend or buy more" : "See plans"}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <Gift className="size-5 text-primary" aria-hidden="true" /> Invite friends
              </h2>
            </CardTitle>
            <CardDescription>
              Friends get {account.referralPercent}% off their first purchase with your code; you
              earn points when they buy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p
              className="inline-block rounded-lg border bg-surface px-4 py-2 font-mono text-lg font-semibold tracking-widest"
              data-testid="referral-code"
            >
              {account.referralCode}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Receipt className="size-5" aria-hidden="true" /> Purchases
        </h2>
        <DataTable
          caption="Purchases"
          rows={account.orders}
          rowKey={(o) => o.id}
          emptyTitle="No purchases yet"
          columns={[
            { key: "date", header: "Date", cell: (o) => formatDate(o.paidAt ?? o.createdAt) },
            { key: "item", header: "Item", cell: (o) => o.label },
            {
              key: "total",
              header: "Total",
              cell: (o) => <span className="tabular-nums">{formatRupees(o.totalPaise)}</span>,
            },
            {
              key: "status",
              header: "Status",
              hideOnMobile: true,
              cell: (o) =>
                o.status === "REFUNDED" ? (
                  <Badge variant="outline">Refunded</Badge>
                ) : (
                  <Badge variant="secondary">Paid</Badge>
                ),
            },
            {
              key: "invoice",
              header: "Invoice",
              cell: (o) =>
                o.invoiceNo ? (
                  <Link href={`/account/invoices/${o.id}`} className="text-primary hover:underline">
                    {o.invoiceNo}
                  </Link>
                ) : null,
            },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Something wrong with a purchase? Write to{" "}
          <a href={`mailto:${siteConfig.supportEmail}`} className="underline">
            {siteConfig.supportEmail}
          </a>{" "}
          with the invoice number.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Sign-in and security</h2>
          </CardTitle>
          <CardDescription>
            {[
              security.email
                ? `${security.email}${security.emailVerified ? " (confirmed)" : ""}`
                : null,
              security.phoneNumber
                ? `${security.phoneNumber}${security.phoneNumberVerified ? " (confirmed)" : ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {security.email ? <PasswordForm hasPassword={security.hasPassword} /> : null}
          <div className="space-y-2">
            <p className="text-sm font-medium">Signed-in devices</p>
            <ul className="divide-y rounded-lg border text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{deviceName(s.userAgent)}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.method === "phone-otp" ? "phone code" : s.method} · since{" "}
                    {formatDate(s.createdAt)}
                  </span>
                  {s.id === sessionId ? <Badge variant="secondary">This device</Badge> : null}
                </li>
              ))}
            </ul>
            {sessions.length > 1 ? (
              <form action={signOutOthersAction}>
                <Button type="submit" size="sm" variant="outline">
                  Sign out of all other devices
                </Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Messages</h2>
          </CardTitle>
          <CardDescription>
            Booking, payment and scorecard messages are always sent. You can turn off tips and
            offers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setMarketingAction} className="flex flex-wrap items-center gap-3 text-sm">
            <span>Tips and offers: {prefs.marketingOptIn ? "on" : "off"}</span>
            <input type="hidden" name="optIn" value={prefs.marketingOptIn ? "no" : "yes"} />
            <Button type="submit" size="sm" variant="outline">
              Turn {prefs.marketingOptIn ? "off" : "on"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function deviceName(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}
