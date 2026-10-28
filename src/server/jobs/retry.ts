// Retry timing for background jobs. Pure, so it is unit-tested without a database.

const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** A RUNNING job whose worker hasn't finished within this time is assumed dead and retried. */
export const STALE_LOCK_MS = 15 * 60 * 1000;

/** Delay before retry number `attempt` (1-based): 2s, 4s, 8s... capped at 5 minutes. */
export function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);
}
