"use client";

import { Loader2, Lock, Tag } from "lucide-react";
import { useState, useTransition } from "react";
import { placeOrderAction, quoteAction, type QuoteView } from "@/app/(student)/checkout/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Request = {
  kind: "PRO" | "COMPANY_PACK" | "INTERVIEW_CREDITS";
  ref: string;
  quantity?: number;
};

/** Order summary with an optional coupon or referral code. The server prices everything. */
export function ReviewOrder({
  request,
  initial,
}: {
  request: Request;
  initial: Extract<QuoteView, { ok: true }>;
}) {
  const [quoteView, setQuote] = useState(initial);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [paying, startPay] = useTransition();

  const applyCode = () =>
    startCheck(async () => {
      setCodeError(null);
      const result = await quoteAction({ ...request, code: code || null });
      if (result.ok) setQuote(result);
      else setCodeError(result.error);
    });

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>
          <h2>{quoteView.label}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Price</dt>
            <dd className="tabular-nums">{quoteView.list}</dd>
          </div>
          {quoteView.discount ? (
            <div className="flex justify-between text-success">
              <dt>Discount{quoteView.codeLabel ? `: ${quoteView.codeLabel}` : ""}</dt>
              <dd className="tabular-nums">−{quoteView.discount}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total (incl. GST)</dt>
            <dd className="tabular-nums" data-testid="order-total">
              {quoteView.total}
            </dd>
          </div>
        </dl>

        <div className="space-y-1.5">
          <Label htmlFor="code">Coupon or referral code</Label>
          <div className="flex gap-2">
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? "code-error" : undefined}
              className="font-mono uppercase"
            />
            <Button
              type="button"
              variant="outline"
              onClick={applyCode}
              disabled={!code || checking}
            >
              {checking ? <Loader2 className="animate-spin" /> : <Tag />} Apply
            </Button>
          </div>
          {codeError ? (
            <p id="code-error" className="text-xs font-medium text-destructive">
              {codeError}
            </p>
          ) : null}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={paying}
          data-testid="place-order"
          onClick={() =>
            startPay(async () => {
              const result = await placeOrderAction({
                ...request,
                code: quoteView.codeLabel ? code : null,
              });
              if (result?.error) setError(result.error);
            })
          }
        >
          <Lock /> {paying ? "Opening payment…" : `Pay ${quoteView.total}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          UPI, cards and net banking. Access starts as soon as the payment is confirmed.
        </p>
      </CardContent>
    </Card>
  );
}
