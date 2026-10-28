import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { ForgotPasswordForm } from "@/app/(auth)/forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your account's email. If it's registered, we'll send a code to reset your password."
      footer={
        <Link href="/sign-in" className="hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
