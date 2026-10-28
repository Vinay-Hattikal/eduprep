import type { Metadata } from "next";
import { Suspense } from "react";
import { Wallet } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { interviewerEarnings } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Earnings" };

const KIND_LABELS = {
  EARNING: "Interview",
  PENALTY: "No-show penalty",
  ADJUSTMENT: "Adjustment",
  PAYOUT: "Paid to you",
} as const;

export default function EarningsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description="Earnings are added when you submit a scorecard. Payouts go to your bank account."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Earnings />
      </Suspense>
    </div>
  );
}

async function Earnings() {
  const user = await requirePermission("interviewer.access");
  const { entries, balancePaise, payouts } = await interviewerEarnings(user.id);
  const paid = payouts.reduce((n, p) => n + p.amountPaise, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Balance to be paid" value={formatRupees(balancePaise)} icon={Wallet} />
        <StatCard
          label="Paid so far"
          value={formatRupees(paid)}
          hint={`${payouts.length} payouts`}
        />
      </div>
      <DataTable
        caption="Earnings ledger"
        rows={entries}
        rowKey={(e) => e.id}
        emptyTitle="No earnings yet"
        emptyDescription="Your first earning appears after your first scorecard."
        columns={[
          { key: "date", header: "Date", cell: (e) => formatDate(e.createdAt) },
          {
            key: "what",
            header: "What",
            cell: (e) => (
              <span>
                {KIND_LABELS[e.kind]}
                {e.booking ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {e.booking.type.name}, {e.booking.candidate.name}
                  </span>
                ) : null}
                {e.note && e.kind !== "EARNING" ? (
                  <span className="block text-xs text-muted-foreground">{e.note}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            cell: (e) => (
              <span
                className={e.amountPaise < 0 ? "text-destructive tabular-nums" : "tabular-nums"}
              >
                {e.amountPaise < 0 ? "−" : ""}
                {formatRupees(Math.abs(e.amountPaise))}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
