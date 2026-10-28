import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="20 October 2026"
      body={`This policy explains what personal data we collect and why, in line with India's Digital Personal Data Protection Act, 2023.

## What we collect
- **Account:** name, email and/or mobile number, a hashed password if you set one.
- **Profile:** college, degree, branch, graduation year, experience, target companies (you choose what to share).
- **Activity:** answers, test results, code you submit, interview bookings and scorecards.
- **Payments:** order details and invoices. Card and UPI details are handled by our payment partner and never reach us.
- **Technical:** device and browser type and IP address for security, such as stopping abuse of sign-in codes.

## Why we use it
To run your account, personalise practice and readiness scores, run interviews and payments, send messages you need (codes, bookings, receipts) and keep the platform secure. With your consent we may send tips and offers; you can turn these off in your account.

## Who sees it
Interviewers see a short summary of the candidates they interview. Service providers that host, email, text or take payments for us process data on our instructions. We don't sell personal data.

## Your choices
You can see and update your details, turn off marketing messages, and ask us to delete your account by writing to ${siteConfig.supportEmail}. We keep invoices as the law requires.

## Security
Passwords are hashed, sign-in codes expire quickly, and access to personal data inside our team is limited and logged.`}
    />
  );
}
