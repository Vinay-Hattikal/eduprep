import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, CircleAlert, FlaskConical } from "lucide-react";
import { simulatePaymentAction } from "@/app/(student)/checkout/actions";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupees } from "@/lib/commerce/pricing";
import { RazorpayButton } from "@/app/(student)/checkout/[orderId]/razorpay-button";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { siteConfig } from "@/config/site";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { getPaymentProvider } from "@/server/integrations/payments";
import { getOrder } from "@/server/services/commerce";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };

export default function PaymentPage({ params, searchParams }: PageProps<"/checkout/[orderId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payment params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Payment({ params, searchParams }: PageProps<"/checkout/[orderId]">) {
  const user = await requirePermission("student.access");
  const { orderId } = await params;
  const { processing } = await searchParams;
  const order = await getOrder(user.id, orderId);
  if (!order) notFound();

  if (order.status === "PAID") {
    const next = order.booking
      ? { href: `/interviews/${order.booking.id}`, label: "See your booking" }
      : order.kind === "INTERVIEW_CREDITS"
        ? { href: "/interviews", label: "Book your interview" }
        : order.kind === "PRO"
          ? { href: "/dashboard", label: "Start practising" }
          : { href: "/tests", label: "Take a company mock" };
    return (
      <Card className="mx-auto max-w-lg text-center" data-testid="payment-success">
        <CardHeader>
          <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
          <CardTitle>
            <h1 className="text-xl">Payment received</h1>
          </CardTitle>
          <CardDescription>
            {order.label} is active on your account. Invoice {order.invoiceNo} is in your account
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={next.href}>{next.label}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/account/invoices/${order.id}`}>View invoice</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (order.status === "REFUNDED") {
    return (
      <Alert className="mx-auto max-w-lg">
        <AlertTitle>This order was refunded</AlertTitle>
        <AlertDescription>
          <Link href="/account" className="underline">
            Back to your account
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const checkout = getPaymentProvider().clientCheckout(order);
  const contact =
    checkout.kind === "razorpay"
      ? await db.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { email: true, phoneNumber: true },
        })
      : null;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      {processing && order.status === "CREATED" ? (
        <Alert role="status">
          <AutoRefresh intervalMs={3000} />
          <AlertTitle>Confirming your payment</AlertTitle>
          <AlertDescription>
            If money left your account, it&apos;s safe: this page updates as soon as the bank
            confirms (usually within a minute).
          </AlertDescription>
        </Alert>
      ) : null}
      {order.status === "FAILED" ? (
        <Alert variant="destructive" data-testid="payment-failed">
          <CircleAlert />
          <AlertTitle>The payment didn&apos;t go through</AlertTitle>
          <AlertDescription>
            {order.failureReason ?? "Try again, or use another payment method."} Nothing was
            charged.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Pay {formatRupees(order.totalPaise)}</h1>
          </CardTitle>
          <CardDescription>{order.label}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkout.kind === "mock" ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <p>
                  <strong>Test payment.</strong> No money moves. Real payments (UPI, cards, net
                  banking) are switched on at launch. Choose what the bank should do:
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={simulatePaymentAction.bind(null, order.id, "success")}>
                  <Button type="submit" data-testid="simulate-success">
                    Pay successfully
                  </Button>
                </form>
                <form action={simulatePaymentAction.bind(null, order.id, "failure")}>
                  <Button type="submit" variant="outline" data-testid="simulate-failure">
                    Simulate a failed payment
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <RazorpayButton
              orderId={order.id}
              keyId={checkout.keyId}
              providerOrderId={checkout.providerOrderId}
              amountPaise={checkout.amountPaise}
              label={order.label}
              appName={siteConfig.name}
              prefill={{
                name: user.name,
                email: contact?.email ?? null,
                contact: contact?.phoneNumber ?? null,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
