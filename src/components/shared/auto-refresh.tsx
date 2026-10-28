"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page's server data every few seconds while a background job runs. */
export function AutoRefresh({ intervalMs = 1500 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
