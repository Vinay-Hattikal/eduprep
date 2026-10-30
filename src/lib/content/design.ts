// Design and interview question kinds (D-067). Pure, so the editor (client), the admin and
// student pages share one list.

import type { DesignKind, RoundType } from "@/generated/prisma/enums";

export const DESIGN_KIND_LABELS: Record<DesignKind, string> = {
  SYSTEM_DESIGN: "System design",
  LOW_LEVEL_DESIGN: "Low-level design",
  TECHNICAL: "Technical interview",
  HR: "HR / behavioural",
};

export const DESIGN_KINDS = Object.keys(DESIGN_KIND_LABELS) as DesignKind[];

/** Kinds asked in interview rounds; the editor labels their fields for interviews. */
export const INTERVIEW_KINDS: readonly DesignKind[] = ["TECHNICAL", "HR"];

/** The kind of question a company's interview round mostly asks. */
export const kindForRound = (type: RoundType): DesignKind =>
  type === "HR_INTERVIEW" ? "HR" : "TECHNICAL";
