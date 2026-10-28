import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="20 October 2026"
      body={`## Your account
You must give accurate details and keep your password and phone secure. One account per person. You're responsible for what happens under your account.

## What you can use
Practice questions, tests, coding problems and other content are for your own preparation. Don't copy, resell or publish them, scrape the site, or share paid access.

## Fair use of tests and interviews
Don't misuse the platform: no cheating tools, no harassment of interviewers or students, no sharing of confidential questions from real company tests.

## Payments
Prices include GST. Plans don't renew automatically. Refunds follow the [refund policy](/refund-policy).

## Content accuracy
We work hard to keep company information current, but hiring patterns change. Always check the official company announcement before applying.

## Changes and contact
We may update these terms and will tell you about important changes. Questions: ${siteConfig.supportEmail}.`}
    />
  );
}
