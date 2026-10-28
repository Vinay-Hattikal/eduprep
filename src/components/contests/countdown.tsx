"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Counts down to `target`; refreshes the page's server data when it's reached. */
export function Countdown({ target, label }: { target: string; label: string }) {
  const router = useRouter();
  const end = new Date(target).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // The clock only starts in the browser, so server and client render the same (nothing).
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= end) {
        clearInterval(timer);
        router.refresh();
      }
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [end, router]);

  if (now === null) return null;
  const { days, hours, minutes, seconds } = parts(end - now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <p className="text-sm text-muted-foreground" aria-live="off">
      {label}{" "}
      <span className="tabular font-semibold text-foreground">
        {days ? `${days}d ` : ""}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </p>
  );
}
