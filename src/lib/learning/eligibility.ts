// Compares a fresher's profile with a company's eligibility rules (PRD 4.7, 8.2).
// "unknown" means we can't tell (missing profile data or a CGPA band that straddles the cut-off).

export const CGPA_BANDS = ["Below 6.0", "6.0–6.9", "7.0–7.9", "8.0–8.9", "9.0 and above"] as const;
export type CgpaBand = (typeof CGPA_BANDS)[number];

const BAND_RANGES: Record<CgpaBand, [number, number]> = {
  "Below 6.0": [0, 5.99],
  "6.0–6.9": [6, 6.99],
  "7.0–7.9": [7, 7.99],
  "8.0–8.9": [8, 8.99],
  "9.0 and above": [9, 10],
};

export type EligibilityStatus = "ok" | "fail" | "unknown";
export type EligibilityCheck = { criterion: string; status: EligibilityStatus; detail: string };

export type StudentProfile = {
  branch: string | null;
  gradYear: number | null;
  cgpaBand: string | null;
  hasBacklogs: boolean;
};

export type CompanyRules = {
  minCgpa: number | null;
  maxBacklogs: number | null;
  branches: string[];
  gradYears: number[];
};

export function checkEligibility(profile: StudentProfile, rules: CompanyRules): EligibilityCheck[] {
  const checks: EligibilityCheck[] = [];

  if (rules.minCgpa !== null) {
    const range = profile.cgpaBand ? BAND_RANGES[profile.cgpaBand as CgpaBand] : undefined;
    if (!range) {
      checks.push({
        criterion: "CGPA",
        status: "unknown",
        detail: `Needs ${rules.minCgpa}+. Add your CGPA to your profile.`,
      });
    } else if (range[0] >= rules.minCgpa) {
      checks.push({
        criterion: "CGPA",
        status: "ok",
        detail: `Needs ${rules.minCgpa}+, you have ${profile.cgpaBand}.`,
      });
    } else if (range[1] < rules.minCgpa) {
      checks.push({
        criterion: "CGPA",
        status: "fail",
        detail: `Needs ${rules.minCgpa}+, you have ${profile.cgpaBand}.`,
      });
    } else {
      checks.push({
        criterion: "CGPA",
        status: "unknown",
        detail: `Needs ${rules.minCgpa}+. Check your exact CGPA.`,
      });
    }
  }

  if (rules.maxBacklogs !== null) {
    const fail = profile.hasBacklogs && rules.maxBacklogs === 0;
    checks.push({
      criterion: "Backlogs",
      status: fail ? "fail" : profile.hasBacklogs ? "unknown" : "ok",
      detail:
        rules.maxBacklogs === 0
          ? `No active backlogs allowed${profile.hasBacklogs ? "; you have some." : "."}`
          : `Up to ${rules.maxBacklogs} active backlog${rules.maxBacklogs === 1 ? "" : "s"} allowed.`,
    });
  }

  if (rules.branches.length > 0) {
    const branch = profile.branch?.toUpperCase() ?? null;
    checks.push({
      criterion: "Branch",
      status: !branch ? "unknown" : rules.branches.includes(branch) ? "ok" : "fail",
      detail: `Open to ${rules.branches.join(", ")}${branch ? `; you're in ${branch}.` : "."}`,
    });
  }

  if (rules.gradYears.length > 0) {
    checks.push({
      criterion: "Graduation year",
      status: !profile.gradYear
        ? "unknown"
        : rules.gradYears.includes(profile.gradYear)
          ? "ok"
          : "fail",
      detail: `Batches ${rules.gradYears.join(", ")}${profile.gradYear ? `; you graduate in ${profile.gradYear}.` : "."}`,
    });
  }

  return checks;
}

export function overallEligibility(checks: EligibilityCheck[]): EligibilityStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "unknown")) return "unknown";
  return "ok";
}
