import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { SignInForm } from "@/app/(auth)/forms";
import { Skeleton } from "@/components/ui/skeleton";
import { homePathFor, safeRedirectPath } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/sign-in" } };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in with your email and password, or with a code sent to your phone."
      footer={
        <>
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const next = safeRedirectPath(params.next);
  if (user) redirect(next ?? homePathFor(user.roles));
  return <SignInForm next={next} devLogin={env().AUTH_MODE === "dev"} phone={!env().TEST_MODE} />;
}
