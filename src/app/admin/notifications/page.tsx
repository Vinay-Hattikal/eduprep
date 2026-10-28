import type { Metadata } from "next";
import { Suspense } from "react";
import { Mail, MessageCircle, Search } from "lucide-react";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listNotifications } from "@/server/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Every email and WhatsApp message the platform sends. In development they go to the outbox (.data/mail) instead of real inboxes."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Outbox searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Outbox({
  searchParams,
}: {
  searchParams: PageProps<"/admin/notifications">["searchParams"];
}) {
  await requirePermission("notifications.view");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const rows = await listNotifications({ q: query || undefined });

  return (
    <div className="space-y-4">
      <AutoRefresh intervalMs={5000} />
      <form className="flex gap-2" role="search" aria-label="Search messages">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Recipient or subject"
            aria-label="Search"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={Mail} title="No messages yet" />
      ) : (
        <ul className="space-y-2" data-testid="outbox">
          {rows.map((n) => (
            <li key={n.id}>
              <details className="rounded-lg border bg-card">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  {n.channel === "EMAIL" ? (
                    <Mail className="size-4 text-muted-foreground" aria-label="Email" />
                  ) : (
                    <MessageCircle className="size-4 text-muted-foreground" aria-label="WhatsApp" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{n.subject}</span>
                  <span className="text-muted-foreground">{n.to}</span>
                  <Badge variant="outline">{n.status.toLowerCase()}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(n.createdAt)}
                  </span>
                </summary>
                <pre className="border-t px-4 py-3 font-sans text-sm whitespace-pre-wrap">
                  {n.body}
                </pre>
                {n.error ? (
                  <p className="border-t px-4 py-2 text-xs text-destructive">{n.error}</p>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
