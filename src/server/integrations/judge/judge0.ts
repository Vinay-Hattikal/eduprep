// Judge0 driver (D-006). Each run is a Judge0 submission with wait=true; Judge0 isolates and
// limits the program. Used in production (Phase 6); configured with JUDGE0_URL / JUDGE0_TOKEN.

import { effectiveTimeLimit, type CodingLanguage } from "@/lib/coding/languages";
import type {
  CompileResult,
  Judge,
  Limits,
  RunResult,
  RunStatus,
} from "@/server/integrations/judge/types";

/** Judge0 CE language ids. */
export const JUDGE0_LANGUAGE_IDS: Record<CodingLanguage, number> = {
  c: 50,
  cpp: 54,
  java: 62,
  python: 71,
  javascript: 63,
};

type Judge0Response = {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  status: { id: number; description: string };
};

/** Maps a Judge0 status id to our run status. 6 (compilation error) is handled separately. */
export function mapJudge0Status(id: number): RunStatus {
  if (id === 3) return "OK";
  if (id === 5) return "TIME_LIMIT";
  if (id >= 7 && id <= 12) return "RUNTIME_ERROR";
  return "INTERNAL_ERROR"; // 13 internal error, 14 exec format error, anything unexpected
}

const decode = (value: string | null) =>
  value ? Buffer.from(value, "base64").toString("utf8") : "";
const encode = (value: string) => Buffer.from(value, "utf8").toString("base64");

export function createJudge0(baseUrl: string, token?: string): Judge {
  async function submit(language: CodingLanguage, code: string, input: string, limits: Limits) {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/submissions?base64_encoded=true&wait=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Auth-Token": token } : {}),
        },
        body: JSON.stringify({
          language_id: JUDGE0_LANGUAGE_IDS[language],
          source_code: encode(code),
          stdin: encode(input),
          cpu_time_limit: effectiveTimeLimit(language, limits.timeLimitMs) / 1000,
          memory_limit: limits.memoryLimitMb * 1024,
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) throw new Error(`Judge0 responded ${response.status}`);
    return (await response.json()) as Judge0Response;
  }

  return {
    name: "judge0",
    async compile(language, code, limits): Promise<CompileResult> {
      // Judge0 compiles per submission; one empty run surfaces compilation errors up front.
      let probe: Judge0Response;
      try {
        probe = await submit(language, code, "", limits);
      } catch (error) {
        return {
          ok: false,
          internal: true,
          error: error instanceof Error ? error.message : "Judge0 unavailable",
        };
      }
      if (probe.status.id === 6) return { ok: false, error: decode(probe.compile_output) };

      return {
        ok: true,
        program: {
          async run(input: string): Promise<RunResult> {
            try {
              const result = await submit(language, code, input, limits);
              return {
                status: mapJudge0Status(result.status.id),
                stdout: decode(result.stdout),
                stderr: decode(result.stderr) || decode(result.message),
                timeMs: Math.round(Number(result.time ?? 0) * 1000),
              };
            } catch (error) {
              return { status: "INTERNAL_ERROR", stdout: "", stderr: String(error), timeMs: 0 };
            }
          },
          async dispose() {},
        },
      };
    },
  };
}
