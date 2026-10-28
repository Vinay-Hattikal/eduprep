import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { recordPayoutAction } from "@/app/admin/interviews/actions";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupees } from "@/lib/commerce/pricing";
import { requirePermission } from "@/server/auth";
import { payoutBalances } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Payouts" };

export default function PayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="What each interviewer is owed (earnings minus penalties and past payouts). Record bank transfers here; automatic transfers arrive at launch."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <Balances searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Balances({
  searchParams,
}: {
  searchParams: PageProps<"/admin/payouts">["searchParams"];
}) {
  await requirePermission("interviews.manage");
  const query = await searchParams;
  const balances = await payoutBalances();
  return (
    <div className="space-y-4">
      {query.done ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>Payout recorded.</AlertDescription>
        </Alert>
      ) : null}
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}
      {balances.length === 0 ? (
        <EmptyState
          title="Nothing owed"
          description="Balances appear when interviewers submit scorecards."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {balances.map((b) => (
            <li key={b.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.user.name}</p>
                <p className="text-xs text-muted-foreground">{b.user.email}</p>
              </div>
              <span
                className={
                  b.balancePaise < 0
                    ? "font-semibold text-destructive tabular-nums"
                    : "font-semibold tabular-nums"
                }
              >
                {formatRupees(b.balancePaise)}
              </span>
              {b.balancePaise > 0 ? (
                <form action={recordPayoutAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="interviewerId" value={b.userId} />
                  <Input
                    name="amount"
                    defaultValue={String(b.balancePaise / 100)}
                    aria-label="Amount in rupees"
                    className="h-8 w-28"
                    inputMode="decimal"
                  />
                  <Input
                    name="reference"
                    placeholder="Bank reference (UTR)"
                    aria-label="Bank reference"
                    className="h-8 w-44"
                    required
                    maxLength={100}
                  />
                  <Button type="submit" size="sm">
                    Record payout
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
