// Picks the judge from JUDGE_DRIVER: "local" (default; development and tests) or "judge0".

import { createJudge0 } from "@/server/integrations/judge/judge0";
import { createLocalJudge } from "@/server/integrations/judge/local";
import type { Judge } from "@/server/integrations/judge/types";

let judge: Judge | null = null;

export function getJudge(): Judge {
  if (judge) return judge;
  if (process.env.JUDGE_DRIVER === "judge0") {
    const url = process.env.JUDGE0_URL;
    if (!url) throw new Error("JUDGE0_URL is required when JUDGE_DRIVER=judge0");
    judge = createJudge0(url, process.env.JUDGE0_TOKEN);
  } else {
    judge = createLocalJudge();
  }
  return judge;
}

export type { CompiledProgram, Judge, Limits, RunResult } from "@/server/integrations/judge/types";
