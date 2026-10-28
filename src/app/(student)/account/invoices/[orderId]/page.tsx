import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/app/(student)/account/invoices/[orderId]/print-button";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { getInvoice } from "@/server/services/commerce";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

export default function InvoicePage({ params }: PageProps<"/account/invoices/[orderId]">) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/account">
            <ArrowLeft /> Account
          </Link>
        </Button>
        <PrintButton />
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Invoice params={params} />
      </Suspense>
    </div>
  );
}

async function Invoice({ params }: { params: PageProps<"/account/invoices/[orderId]">["params"] }) {
  const user = await requirePermission("student.access");
  const { orderId } = await params;
  const invoice = await getInvoice(orderId, can(user.roles, "users.view") ? null : user.id);
  if (!invoice) notFound();
  const { order, gst } = invoice;
  const half = Math.round(gst.gstPaise / 2);

  return (
    <article
      className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-6 sm:p-10 print:border-0 print:p-0"
      data-testid="invoice"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xl font-semibold">{siteConfig.name}</p>
          <p className="text-sm text-muted-foreground">{siteConfig.supportEmail}</p>
          {/* GSTIN and registered address are added with the company's registration (Phase 6). */}
        </div>
        <div className="text-right">
          <h1 className="text-lg font-semibold">Tax invoice</h1>
          <p className="font-mono text-sm">{order.invoiceNo}</p>
          <p className="text-sm text-muted-foreground">{formatDate(order.paidAt!)}</p>
        </div>
      </header>
      <div className="text-sm">
        <p className="text-muted-foreground">Billed to</p>
        <p className="font-medium">{order.user.name}</p>
        {order.user.email ? <p>{order.user.email}</p> : null}
      </div>
      <table className="w-full text-sm">
        <thead className="border-b text-left">
          <tr>
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr>
            <td className="py-2">{order.label}</td>
            <td className="py-2 text-right tabular-nums">{formatRupees(order.listPaise)}</td>
          </tr>
          {order.discountPaise ? (
            <tr>
              <td className="py-2">Discount</td>
              <td className="py-2 text-right tabular-nums">−{formatRupees(order.discountPaise)}</td>
            </tr>
          ) : null}
          <tr>
            <td className="py-2 text-muted-foreground">Taxable value</td>
            <td className="py-2 text-right tabular-nums">{formatRupees(gst.taxablePaise)}</td>
          </tr>
          <tr>
            <td className="py-2 text-muted-foreground">CGST {gst.percent / 2}%</td>
            <td className="py-2 text-right tabular-nums">{formatRupees(half)}</td>
          </tr>
          <tr>
            <td className="py-2 text-muted-foreground">SGST {gst.percent / 2}%</td>
            <td className="py-2 text-right tabular-nums">{formatRupees(gst.gstPaise - half)}</td>
          </tr>
        </tbody>
        <tfoot className="border-t font-semibold">
          <tr>
            <td className="py-2">Total paid</td>
            <td className="py-2 text-right tabular-nums">{formatRupees(order.totalPaise)}</td>
          </tr>
        </tfoot>
      </table>
      {order.status === "REFUNDED" ? (
        <p className="text-sm font-medium text-destructive">
          Refunded {formatRupees(order.refundPaise ?? order.totalPaise)} on{" "}
          {formatDate(order.refundedAt!)}.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Payment reference: {order.providerPaymentId}</p>
    </article>
  );
}
