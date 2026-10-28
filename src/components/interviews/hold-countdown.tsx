"use client";

import { useEffect, useState } from "react";

/** "Slot held for 9:41". After it runs out the server still confirms if nobody took the slot. */
export function HoldCountdown({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return null;
  const left = Math.max(0, new Date(until).getTime() - now);
  if (!left)
    return (
      <p className="text-sm text-warning">
        The hold has ended. You can still confirm if the slot is free.
      </p>
    );
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <p className="text-sm text-muted-foreground" role="timer" aria-live="off">
      Slot held for{" "}
      <span className="font-mono font-medium text-foreground">
        {m}:{String(s).padStart(2, "0")}
      </span>
    </p>
  );
}
