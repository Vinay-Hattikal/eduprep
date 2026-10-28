"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry is wired up in Phase 6; until then, log for local debugging.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <ErrorState className="w-full max-w-lg" onRetry={reset} />
    </main>
  );
}
