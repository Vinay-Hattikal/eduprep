import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { ResetPasswordForm } from "@/app/(auth)/forms";
import { Skeleton } from "@/components/ui/skeleton";
import { isValidEmail, maskEmail, normalizeEmail } from "@/lib/auth/credentials";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Reset searchParams={searchParams} />
    </Suspense>
  );
}

async function Reset({
  searchParams,
}: {
  searchParams: PageProps<"/reset-password">["searchParams"];
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? normalizeEmail(params.email) : "";
  if (!isValidEmail(email)) {
    return (
      <AuthShell title="Set a new password">
        <Link href="/forgot-password" className="text-primary underline">
          Start again
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Set a new password"
      description={`If ${maskEmail(email)} has an account, we've sent it a 6-digit code. Setting a new password signs you out on every other device.`}
      footer={
        <Link href="/forgot-password" className="hover:underline">
          Didn&apos;t get it? Send again
        </Link>
      }
    >
      <ResetPasswordForm email={email} />
    </AuthShell>
  );
}
