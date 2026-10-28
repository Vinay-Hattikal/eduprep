// What a user may use (PRD 8.13, D-040). Pure: entitlements in, access out. The server
// checks it in practice, coding, tests and interviews; the UI only mirrors it.

export type EntitlementRow = {
  kind: "PRO" | "COMPANY_PACK";
  companyId: string | null;
  startsAt: Date;
  endsAt: Date;
  revokedAt: Date | null;
};

export type Access = {
  /** Pro until this date, or null. */
  proUntil: Date | null;
  /** Company id → pack valid until. */
  packs: Map<string, Date>;
  /** Admins previewing the student app aren't limited. */
  unlimited: boolean;
};

export const NO_ACCESS: Access = { proUntil: null, packs: new Map(), unlimited: false };

export function accessFrom(rows: readonly EntitlementRow[], now: Date, unlimited = false): Access {
  let proUntil: Date | null = null;
  const packs = new Map<string, Date>();
  for (const row of rows) {
    if (row.revokedAt || row.startsAt > now || row.endsAt <= now) continue;
    if (row.kind === "PRO") {
      if (!proUntil || row.endsAt > proUntil) proUntil = row.endsAt;
    } else if (row.companyId) {
      const current = packs.get(row.companyId);
      if (!current || row.endsAt > current) packs.set(row.companyId, row.endsAt);
    }
  }
  return { proUntil, packs, unlimited };
}

export function isPro(access: Access): boolean {
  return access.unlimited || access.proUntil !== null;
}

/** Pro covers everything; a company pack covers that company's questions, problems and mocks. */
export function coversCompany(access: Access, companyIds: readonly string[]): boolean {
  return isPro(access) || companyIds.some((id) => access.packs.has(id));
}

/**
 * When a new period of access starts: right after the current one ends, so buying again
 * extends instead of overlapping.
 */
export function nextPeriod(
  existingEnds: readonly Date[],
  now: Date,
  days: number,
): { startsAt: Date; endsAt: Date } {
  const latest = existingEnds.reduce((max, d) => (d > max ? d : max), now);
  return { startsAt: latest, endsAt: new Date(latest.getTime() + days * 86_400_000) };
}
