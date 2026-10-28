import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Search by name, email or phone. Open a user to see purchases, grant access or refund."
      />
      <Suspense fallback={<TableSkeleton />}>
        <UsersTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function UsersTable({
  searchParams,
}: {
  searchParams: PageProps<"/admin/users">["searchParams"];
}) {
  // Contact details are visible only to support and super admins (PRD section 11).
  await requirePermission("users.view");
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 100) : "";

  const users = await db.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phoneNumber: { contains: q } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      roles: true,
      profileType: true,
      createdAt: true,
      entitlements: {
        where: { revokedAt: null, endsAt: { gt: new Date() }, kind: "PRO" },
        select: { id: true },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-4">
      <form className="flex gap-2" role="search" aria-label="Search users">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Name, email or phone"
            aria-label="Search"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <DataTable
        caption="Users"
        rows={users}
        rowKey={(user) => user.id}
        emptyTitle="No users found"
        columns={[
          {
            key: "name",
            header: "Name",
            cell: (user) => (
              <div className="min-w-0">
                <Link
                  href={`/admin/users/${user.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {user.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{user.email ?? "No email"}</p>
              </div>
            ),
          },
          {
            key: "roles",
            header: "Roles",
            cell: (user) => (
              <div className="flex flex-wrap gap-1">
                {user.roles.map((role) => (
                  <Badge key={role} variant={role === "STUDENT" ? "outline" : "secondary"}>
                    {ROLE_LABELS[role]}
                  </Badge>
                ))}
                {user.entitlements.length ? <Badge>Pro</Badge> : null}
              </div>
            ),
          },
          {
            key: "track",
            header: "Track",
            hideOnMobile: true,
            cell: (user) =>
              user.profileType === "FRESHER"
                ? "Fresher"
                : user.profileType === "EXPERIENCED"
                  ? "Experienced"
                  : "—",
          },
          {
            key: "joined",
            header: "Joined",
            hideOnMobile: true,
            className: "whitespace-nowrap",
            cell: (user) => formatDate(user.createdAt),
          },
        ]}
      />
    </div>
  );
}
