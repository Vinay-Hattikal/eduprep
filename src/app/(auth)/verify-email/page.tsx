import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { VerifyEmailForm } from "@/app/(auth)/forms";
import { Skeleton } from "@/components/ui/skeleton";
import { isValidEmail, maskEmail, normalizeEmail } from "@/lib/auth/credentials";
import { safeRedirectPath } from "@/lib/permissions";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Verify searchParams={searchParams} />
    </Suspense>
  );
}

async function Verify({
  searchParams,
}: {
  searchParams: PageProps<"/verify-email">["searchParams"];
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? normalizeEmail(params.email) : "";
  if (!isValidEmail(email)) {
    return (
      <AuthShell title="Confirm your email" description="This link is missing the email address.">
        <Link href="/sign-in" className="text-primary underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Check your email"
      description={`We sent a 6-digit code to ${maskEmail(email)}. It expires in 10 minutes. Check spam if you don't see it.`}
      footer={
        <Link href="/sign-up" className="hover:underline">
          Used the wrong email? Start again
        </Link>
      }
    >
      <VerifyEmailForm email={email} next={safeRedirectPath(params.next)} />
    </AuthShell>
  );
}
