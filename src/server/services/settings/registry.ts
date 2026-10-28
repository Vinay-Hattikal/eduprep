// Every admin-editable setting: its key, shape and default (D-026 placeholder prices).
// Pure module (no DB), shared by the settings service, the seed script and tests.
// Never hard-code these numbers elsewhere; read them with getSetting().

import { z } from "zod";

export type SettingKind = "money" | "integer" | "percent";

type Definition = {
  group: SettingGroup;
  label: string;
  description: string;
  kind: SettingKind;
  /** Money is stored in paise (integer). */
  defaultValue: number;
};

export const SETTING_GROUPS = {
  pricing: "Pricing",
  interviews: "Mock interview prices",
  limits: "Free plan limits",
  payouts: "Interviewer payouts",
  policies: "Interview policies",
  growth: "Taxes, referrals and points",
  engagement: "Streaks and discussions",
} as const;

export type SettingGroup = keyof typeof SETTING_GROUPS;

const rupees = (amount: number) => amount * 100;

export const SETTINGS = {
  "pricing.companyPack": {
    group: "pricing",
    label: "Company pack (6 months)",
    description: "All mocks, questions and OA simulations for one company.",
    kind: "money",
    defaultValue: rupees(199),
  },
  "pricing.proMonthly": {
    group: "pricing",
    label: "Pro, monthly",
    description: "Everything except human mock interviews, billed monthly.",
    kind: "money",
    defaultValue: rupees(299),
  },
  "pricing.proHalfYearly": {
    group: "pricing",
    label: "Pro, 6 months",
    description: "Everything except human mock interviews, for 6 months.",
    kind: "money",
    defaultValue: rupees(1499),
  },
  "interviews.hr": {
    group: "interviews",
    label: "HR / behavioural",
    description: "Price of one HR or behavioural mock interview.",
    kind: "money",
    defaultValue: rupees(399),
  },
  "interviews.technicalFresher": {
    group: "interviews",
    label: "Technical (fresher)",
    description: "Price of one technical mock interview for freshers.",
    kind: "money",
    defaultValue: rupees(699),
  },
  "interviews.companySpecific": {
    group: "interviews",
    label: "Company-specific",
    description: "Price of one mock interview modelled on a specific company.",
    kind: "money",
    defaultValue: rupees(999),
  },
  "interviews.sdeExperienced": {
    group: "interviews",
    label: "SDE / DSA (experienced)",
    description: "Price of one SDE or DSA mock interview for experienced candidates.",
    kind: "money",
    defaultValue: rupees(1799),
  },
  "interviews.systemDesign": {
    group: "interviews",
    label: "System design",
    description: "Price of one system design mock interview.",
    kind: "money",
    defaultValue: rupees(2499),
  },
  "interviews.bundle3DiscountPercent": {
    group: "interviews",
    label: "Bundle of 3: discount",
    description: "Discount when buying 3 interviews together.",
    kind: "percent",
    defaultValue: 10,
  },
  "interviews.bundle5DiscountPercent": {
    group: "interviews",
    label: "Bundle of 5: discount",
    description: "Discount when buying 5 interviews together.",
    kind: "percent",
    defaultValue: 15,
  },
  "limits.freeMcqPerDay": {
    group: "limits",
    label: "MCQs per day",
    description: "Practice questions a free user can answer each day.",
    kind: "integer",
    defaultValue: 25,
  },
  "limits.freeCodingProblems": {
    group: "limits",
    label: "Coding problems",
    description: "Coding problems available to free users.",
    kind: "integer",
    defaultValue: 20,
  },
  "limits.freeMocksPerCompany": {
    group: "limits",
    label: "Mock tests per company",
    description: "Full company mock tests a free user can take per company.",
    kind: "integer",
    defaultValue: 1,
  },
  "payouts.interviewerSharePercent": {
    group: "payouts",
    label: "Interviewer share",
    description: "Share of the interview price paid to the interviewer.",
    kind: "percent",
    defaultValue: 70,
  },
  "interviews.rescheduleHours": {
    group: "policies",
    label: "Free reschedule window (hours)",
    description:
      "Candidates can reschedule or cancel for a credit up to this many hours before the start.",
    kind: "integer",
    defaultValue: 12,
  },
  "interviews.minLeadHours": {
    group: "policies",
    label: "Minimum notice (hours)",
    description: "The earliest bookable slot is this many hours from now.",
    kind: "integer",
    defaultValue: 6,
  },
  "interviews.holdMinutes": {
    group: "policies",
    label: "Slot hold (minutes)",
    description: "How long a chosen slot is held while the candidate pays.",
    kind: "integer",
    defaultValue: 10,
  },
  "interviews.scorecardDueHours": {
    group: "policies",
    label: "Scorecard due (hours)",
    description: "Interviewers submit the scorecard within this many hours of the interview's end.",
    kind: "integer",
    defaultValue: 24,
  },
  "interviews.noShowPenaltyPercent": {
    group: "policies",
    label: "Interviewer no-show penalty",
    description: "Deducted from the interviewer's balance, as a share of their usual earning.",
    kind: "percent",
    defaultValue: 50,
  },
  "interviews.reviewBelowRatingPercent": {
    group: "policies",
    label: "Review interviewers rated below",
    description:
      "Average rating as a share of 5 stars (70% = 3.5 stars), after at least 5 ratings.",
    kind: "percent",
    defaultValue: 70,
  },
  "pricing.gstPercent": {
    group: "growth",
    label: "GST",
    description: "Prices include GST at this rate; invoices show the split.",
    kind: "percent",
    defaultValue: 18,
  },
  "referrals.discountPercent": {
    group: "growth",
    label: "Referral discount",
    description: "Discount for a buyer who uses someone's referral code.",
    kind: "percent",
    defaultValue: 10,
  },
  "referrals.rewardPoints": {
    group: "growth",
    label: "Referral reward (points)",
    description: "Points for the code's owner when a referred purchase is paid.",
    kind: "integer",
    defaultValue: 50,
  },
  "points.experienceApproved": {
    group: "growth",
    label: "Interview experience (points)",
    description: "Points for a contributor when their interview experience is approved.",
    kind: "integer",
    defaultValue: 20,
  },
  "points.driveReportApproved": {
    group: "growth",
    label: "Drive report (points)",
    description: 'Points for a contributor when their "asked today" drive report is approved.',
    kind: "integer",
    defaultValue: 10,
  },
  "streak.freezeEveryDays": {
    group: "engagement",
    label: "Earn a streak freeze every (days)",
    description:
      "Students earn one streak freeze each time their streak reaches a multiple of this. 0 turns earning off.",
    kind: "integer",
    defaultValue: 7,
  },
  "streak.maxFreezes": {
    group: "engagement",
    label: "Streak freezes held at most",
    description: "A student can hold this many freezes at once. Each covers one missed day.",
    kind: "integer",
    defaultValue: 2,
  },
  "streak.freezePointsCost": {
    group: "engagement",
    label: "Streak freeze price (points)",
    description: "Points a student spends to buy one streak freeze. 0 turns buying off.",
    kind: "integer",
    defaultValue: 50,
  },
  "discussion.autoHideFlags": {
    group: "engagement",
    label: "Hide a comment after (flags)",
    description: "A discussion comment is hidden for review once this many students flag it.",
    kind: "integer",
    defaultValue: 3,
  },
} as const satisfies Record<string, Definition>;

export type SettingKey = keyof typeof SETTINGS;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

const VALUE_SCHEMAS: Record<SettingKind, z.ZodType<number>> = {
  money: z.number().int().min(0).max(rupees(1_00_000)),
  integer: z.number().int().min(0).max(100_000),
  percent: z.number().int().min(0).max(100),
};

/** Settings an interview type can take its price from. */
export const INTERVIEW_PRICE_KEYS = SETTING_KEYS.filter(
  (key) => SETTINGS[key].group === "interviews" && SETTINGS[key].kind === "money",
);

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(SETTINGS, value);
}

export function valueSchemaFor(key: SettingKey): z.ZodType<number> {
  return VALUE_SCHEMAS[SETTINGS[key].kind];
}

/** Stored value if valid, otherwise the default (so a bad DB row can never break pricing). */
export function resolveSettingValue(key: SettingKey, stored: unknown): number {
  const parsed = valueSchemaFor(key).safeParse(stored);
  return parsed.success ? parsed.data : SETTINGS[key].defaultValue;
}

/**
 * Converts what an admin typed into the stored value: rupees → paise for money.
 * Returns null when the input is not a valid value for this setting.
 */
export function parseSettingInput(key: SettingKey, input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const number = Number(trimmed);
  const value = SETTINGS[key].kind === "money" ? Math.round(number * 100) : number;
  const parsed = valueSchemaFor(key).safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** For form inputs: paise → rupees for money; other kinds as-is. */
export function settingInputValue(key: SettingKey, value: number): string {
  if (SETTINGS[key].kind !== "money") return String(value);
  return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2);
}
