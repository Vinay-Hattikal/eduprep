import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ReviewOrder } from "@/app/(student)/checkout/review-order";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { formatRupees } from "@/lib/commerce/pricing";
import { requirePermission } from "@/server/auth";
import { quoteOrder } from "@/server/services/commerce";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/pricing">
          <ArrowLeft /> Plans and pricing
        </Link>
      </Button>
      <PageHeader
        title="Checkout"
        description="Check your order, add a code if you have one, then pay."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Review searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Review({ searchParams }: { searchParams: PageProps<"/checkout">["searchParams"] }) {
  const user = await requirePermission("student.access");
  const params = await searchParams;
  const kind = params.kind;
  const ref = typeof params.ref === "string" ? params.ref : "";
  const quantity = Number(params.qty) || 1;
  if (kind !== "PRO" && kind !== "COMPANY_PACK" && kind !== "INTERVIEW_CREDITS") {
    return (
      <EmptyState
        title="Nothing to buy here"
        description="Pick a plan on the pricing page."
        action={
          <Button asChild>
            <Link href="/pricing">See plans</Link>
          </Button>
        }
      />
    );
  }
  const request = { kind, ref, quantity } as const;
  const quote = await quoteOrder(user, request);
  if (!quote.ok) {
    return (
      <EmptyState
        title="This product isn't available"
        description={quote.error}
        action={
          <Button asChild>
            <Link href="/pricing">See plans</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ReviewOrder
      request={request}
      initial={{
        ok: true,
        label: quote.product.label,
        list: formatRupees(quote.quote.listPaise),
        discount: quote.quote.discountPaise ? formatRupees(quote.quote.discountPaise) : null,
        total: formatRupees(quote.quote.totalPaise),
        codeLabel: null,
      }}
    />
  );
}
