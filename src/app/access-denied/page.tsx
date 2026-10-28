import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access denied", robots: { index: false } };

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="size-7" aria-hidden="true" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          You don&apos;t have access to this page
        </h1>
        <p className="text-muted-foreground">
          Your account doesn&apos;t include the role this page needs. If you think that&apos;s a
          mistake, ask an admin.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Switch account</Link>
        </Button>
      </div>
    </main>
  );
}
