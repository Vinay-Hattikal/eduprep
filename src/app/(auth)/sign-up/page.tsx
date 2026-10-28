import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { SignUpForm } from "@/app/(auth)/forms";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { homePathFor } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { env } from "@/server/env";

export const metadata: Metadata = {
  title: "Create your account",
  alternates: { canonical: "/sign-up" },
};

export default function SignUpPage() {
  const testMode = env().TEST_MODE;
  return (
    <AuthShell
      title={`Join ${siteConfig.name}`}
      description={
        testMode
          ? "Free to start."
          : "Free to start. We'll email you a code to confirm your address."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
          {testMode ? null : (
            <span className="mt-2 block">
              Prefer your phone?{" "}
              <Link href="/sign-in" className="text-primary hover:underline">
                Sign in with an OTP
              </Link>{" "}
              and we&apos;ll create your account.
            </span>
          )}
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <Form />
      </Suspense>
    </AuthShell>
  );
}

async function Form() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.roles));
  return <SignUpForm />;
}
