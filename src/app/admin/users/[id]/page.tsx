import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert } from "lucide-react";
import {
  grantAction,
  refundAction,
  revokeAction,
  setAdminAccessAction,
} from "@/app/admin/users/actions";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatDate } from "@/lib/format";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "User" };

const DONE = {
  granted: "Access granted.",
  refunded: "Refunded. What the order bought was revoked.",
  revoked: "Access revoked.",
  roles: "Admin access changed. It applies on the user's next page load.",
} as const;

export default function UserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/users">
          <ArrowLeft /> Users
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <User params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function User({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const actor = await requirePermission("users.view");
  const { id } = await params;
  const query = await searchParams;
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id },
    include: {
      stats: true,
      orders: { orderBy: { createdAt: "desc" } },
      entitlements: {
        orderBy: { endsAt: "desc" },
        include: { company: { select: { name: true } } },
      },
      credits: { include: { type: { select: { name: true } } } },
      _count: { select: { attempts: true, bookings: true, sittings: true, submissions: true } },
    },
  });
  if (!user) notFound();
  const [companies, types] = await Promise.all([
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.interviewType.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);
  const canGrant = can(actor.roles, "users.grant");
  const canRefund = can(actor.roles, "payments.refund");
  const canSetRoles = can(actor.roles, "users.roles");
  const credits = user.credits.filter((c) => c.status === "AVAILABLE");
  const done =
    typeof query.done === "string" && query.done in DONE
      ? DONE[query.done as keyof typeof DONE]
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.name}
        description={[user.email, user.phoneNumber, `joined ${formatDate(user.createdAt)}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {ROLE_LABELS[r]}
              </Badge>
            ))}
          </div>
        }
      />
      {done ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{done}</AlertDescription>
        </Alert>
      ) : null}
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Questions answered" value={user._count.attempts} />
        <StatCard label="Mock tests" value={user._count.sittings} />
        <StatCard label="Code submissions" value={user._count.submissions} />
        <StatCard
          label="Interviews booked"
          value={user._count.bookings}
          hint={`${credits.length} credits unused`}
        />
      </div>

      {canSetRoles ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Admin access</h2>
            </CardTitle>
            <CardDescription>
              Admins can use every part of the admin panel. Interviewer access is given by approving
              an application on the Interviewers page.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {user.roles.includes("ADMIN")
                ? "This person is an admin."
                : "This person is not an admin."}
            </p>
            <form action={setAdminAccessAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input
                type="hidden"
                name="admin"
                value={user.roles.includes("ADMIN") ? "off" : "on"}
              />
              <Button
                type="submit"
                variant={user.roles.includes("ADMIN") ? "outline" : "secondary"}
                data-testid="toggle-admin"
              >
                {user.roles.includes("ADMIN") ? "Remove admin access" : "Make admin"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Access</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user.entitlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Free plan.</p>
          ) : null}
          <ul className="divide-y">
            {user.entitlements.map((e) => {
              const active = !e.revokedAt && e.endsAt > now;
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">
                    {e.kind === "PRO" ? "Pro" : `${e.company?.name} pack`}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(e.startsAt)} to {formatDate(e.endsAt)}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                  <Badge variant={active ? "secondary" : "outline"}>
                    {e.revokedAt ? "revoked" : active ? "active" : "ended"}
                  </Badge>
                  {active && canGrant ? (
                    <form action={revokeAction} className="ml-auto">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="entitlementId" value={e.id} />
                      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                        Revoke
                      </Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {credits.length ? (
            <p className="text-sm">
              Unused interview credits:{" "}
              {Object.entries(Object.groupBy(credits, (c) => c.type.name))
                .map(([name, list]) => `${name} × ${list!.length}`)
                .join(", ")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canGrant ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Grant access</h2>
            </CardTitle>
            <CardDescription>
              For goodwill, partner colleges or fixing a problem. Recorded in the audit log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={grantAction}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <input type="hidden" name="userId" value={user.id} />
              <div className="space-y-1.5">
                <Label htmlFor="kind">What</Label>
                <NativeSelect id="kind" name="kind" className="w-full" defaultValue="PRO">
                  <NativeSelectOption value="PRO">Pro (days)</NativeSelectOption>
                  <NativeSelectOption value="COMPANY_PACK">Company pack (days)</NativeSelectOption>
                  <NativeSelectOption value="CREDITS">Interview credits (count)</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Days or credits</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min={1}
                  max={366}
                  defaultValue={30}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyId">Company (for a pack)</Label>
                <NativeSelect id="companyId" name="companyId" className="w-full">
                  {companies.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="typeId">Interview type (for credits)</Label>
                <NativeSelect id="typeId" name="typeId" className="w-full">
                  {types.map((t) => (
                    <NativeSelectOption key={t.id} value={t.id}>
                      {t.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="note">Why</Label>
                <Input id="note" name="note" required maxLength={200} />
              </div>
              <div>
                <Button type="submit" data-testid="grant-access">
                  Grant
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Orders</h2>
        <DataTable
          caption="Orders"
          rows={user.orders}
          rowKey={(o) => o.id}
          emptyTitle="No orders"
          columns={[
            { key: "date", header: "Date", cell: (o) => formatDate(o.createdAt) },
            { key: "item", header: "Item", cell: (o) => o.label },
            { key: "total", header: "Total", cell: (o) => formatRupees(o.totalPaise) },
            {
              key: "status",
              header: "Status",
              cell: (o) => <Badge variant="outline">{o.status.toLowerCase()}</Badge>,
            },
            {
              key: "actions",
              header: "",
              cell: (o) => (
                <div className="flex flex-wrap items-center gap-2">
                  {o.invoiceNo ? (
                    <Link
                      href={`/account/invoices/${o.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {o.invoiceNo}
                    </Link>
                  ) : null}
                  {o.status === "PAID" && canRefund ? (
                    <form action={refundAction} className="flex gap-1">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="orderId" value={o.id} />
                      <Input
                        name="reason"
                        placeholder="Reason"
                        className="h-7 w-32"
                        maxLength={200}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Refund
                      </Button>
                    </form>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
