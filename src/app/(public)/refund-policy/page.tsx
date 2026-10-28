import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Refund policy",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund and cancellation policy"
      updated="20 October 2026"
      body={`## Plans and packs
If you haven't used a plan or company pack, write to ${siteConfig.supportEmail} within 7 days of purchase for a full refund to the original payment method.

## Mock interviews
- You can move or cancel a booking free of charge up to 12 hours before it starts; the interview credit returns to your account.
- Later cancellations and missed interviews aren't refunded.
- If the interviewer doesn't join, your credit is returned in full.
- Unused interview credits can be refunded on request.

## How refunds are paid
Refunds go back to the original payment method, usually within 5-7 working days after we approve them.`}
    />
  );
}
