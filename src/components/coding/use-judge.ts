"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResultView } from "@/components/coding/submission-result";

export type SubmitOutcome =
  | { status: "queued"; submissionId: string }
  | { status: "invalid" | "busy"; message: string }
  | { status: "limit" | "not-found" | "closed" };

/**
 * Sends code to the judge and polls until it has a verdict.
 * `submit` queues the run on the server; `poll` reads its current state.
 */
export function useJudge({
  submit,
  poll,
  onDone,
}: {
  submit: (kind: "RUN" | "SUBMIT") => Promise<SubmitOutcome>;
  poll: (id: string) => Promise<ResultView | null>;
  onDone?: (result: ResultView) => void;
}) {
  const [result, setResult] = useState<ResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = useCallback(
    async (kind: "RUN" | "SUBMIT") => {
      setBusy(true);
      setError(null);
      try {
        const outcome = await submit(kind);
        if (outcome.status !== "queued") {
          setBusy(false);
          setError(
            "message" in outcome
              ? outcome.message
              : outcome.status === "limit"
                ? "You've reached the free plan's problem limit."
                : outcome.status === "closed"
                  ? "This section is closed."
                  : "This problem isn't available.",
          );
          return;
        }
        setResult({
          kind,
          verdict: "PENDING",
          testsPassed: 0,
          testsTotal: 0,
          runtimeMs: null,
          compileOutput: null,
          results: [],
          custom: false,
          done: false,
        });
        let delay = 500;
        const tick = async () => {
          const current = await poll(outcome.submissionId).catch(() => null);
          if (current) setResult(current);
          if (current?.done) {
            setBusy(false);
            onDoneRef.current?.(current);
            return;
          }
          delay = Math.min(delay * 1.4, 2500);
          timer.current = setTimeout(tick, delay);
        };
        timer.current = setTimeout(tick, delay);
      } catch {
        setBusy(false);
        setError("Couldn't reach the judge. Check your connection and try again.");
      }
    },
    [submit, poll],
  );

  return { result, error, busy, start };
}
