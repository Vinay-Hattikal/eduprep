// The code judge behind one interface (D-006, D-033). Callers compile once, then run each test.

import type { CodingLanguage } from "@/lib/coding/languages";

export type RunStatus = "OK" | "RUNTIME_ERROR" | "TIME_LIMIT" | "MEMORY_LIMIT" | "INTERNAL_ERROR";

export type RunResult = {
  status: RunStatus;
  stdout: string;
  stderr: string;
  timeMs: number;
};

export type Limits = { timeLimitMs: number; memoryLimitMb: number };

export interface CompiledProgram {
  run(input: string): Promise<RunResult>;
  dispose(): Promise<void>;
}

export type CompileResult =
  { ok: true; program: CompiledProgram } | { ok: false; error: string; internal?: boolean };

export interface Judge {
  readonly name: string;
  compile(language: CodingLanguage, code: string, limits: Limits): Promise<CompileResult>;
}

/** Output kept per run, so a runaway print loop can't exhaust memory. */
export const MAX_OUTPUT_BYTES = 1024 * 1024;
