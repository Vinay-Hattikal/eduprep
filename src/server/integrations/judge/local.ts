// Local judge for development and tests (D-033): compiles and runs code with the machine's
// real toolchains (gcc, g++, javac/java, python, node), so verdicts match an online judge.
// It is NOT a sandbox: code runs as the current user. It refuses to run in production;
// production uses Judge0 (judge0.ts) in its own isolated server.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CODING_LANGUAGES, effectiveTimeLimit, type CodingLanguage } from "@/lib/coding/languages";
import {
  MAX_OUTPUT_BYTES,
  type CompileResult,
  type Judge,
  type Limits,
  type RunResult,
} from "@/server/integrations/judge/types";

const isWindows = process.platform === "win32";
const exe = (name: string) => (isWindows ? `${name}.exe` : name);
const COMPILE_TIMEOUT_MS = 30_000;

function findJavaHome(): string | null {
  const configured = process.env.JUDGE_JAVA_HOME || process.env.JAVA_HOME;
  if (configured && existsSync(path.join(/*turbopackIgnore: true*/ configured, "bin", exe("java"))))
    return configured;
  if (isWindows) {
    const root = "C:\\Program Files\\Java";
    if (existsSync(/*turbopackIgnore: true*/ root)) {
      const jdks = readdirSync(/*turbopackIgnore: true*/ root)
        .filter((name) => /^jdk/i.test(name))
        .sort()
        .reverse();
      for (const jdk of jdks) {
        if (existsSync(path.join(/*turbopackIgnore: true*/ root, jdk, "bin", "javac.exe")))
          return path.join(/*turbopackIgnore: true*/ root, jdk);
      }
    }
  }
  return null;
}

let toolchainCache: Record<string, string> | null = null;

function toolchain() {
  if (toolchainCache) return toolchainCache;
  const javaHome = findJavaHome();
  toolchainCache = {
    gcc: process.env.JUDGE_GCC || "gcc",
    gpp: process.env.JUDGE_GPP || "g++",
    python: process.env.JUDGE_PYTHON || (isWindows ? "python" : "python3"),
    node: process.execPath,
    java: javaHome ? path.join(/*turbopackIgnore: true*/ javaHome, "bin", exe("java")) : "java",
    javac: javaHome ? path.join(/*turbopackIgnore: true*/ javaHome, "bin", exe("javac")) : "javac",
  };
  return toolchainCache;
}

type ProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timeMs: number;
  timedOut: boolean;
  outputExceeded: boolean;
  spawnError?: string;
};

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; input?: string; timeoutMs: number },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let started = performance.now();
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true, stdio: "pipe" });
    const kill = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already exited
      }
    };
    // Start the clock once the process exists: creating it (and an antivirus scan of a freshly
    // compiled binary on Windows) isn't the program's running time.
    child.once("spawn", () => {
      started = performance.now();
      timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, options.timeoutMs);
    });

    const collect = (target: "stdout" | "stderr") => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        outputExceeded = true;
        kill();
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.stdin.on("error", () => {}); // program exited without reading all input

    const finish = (result: Partial<ProcessResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: null,
        stdout,
        stderr,
        timeMs: Math.round(performance.now() - started),
        timedOut,
        outputExceeded,
        ...result,
      });
    };
    child.on("error", (error) => finish({ spawnError: error.message }));
    child.on("close", (code) => finish({ code }));

    child.stdin.end(options.input ?? "");
  });
}

function tail(text: string, max = 4000): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

/** Hides the temp folder from compiler messages. */
function clean(text: string, dir: string): string {
  return tail(
    text
      .split(dir + path.sep)
      .join("")
      .split(dir)
      .join(""),
  );
}

export function createLocalJudge(): Judge {
  if (process.env.APP_ENV === "production") {
    throw new Error(
      "The local judge isn't sandboxed and can't run in production. Set JUDGE_DRIVER=judge0.",
    );
  }

  return {
    name: "local",
    async compile(language: CodingLanguage, code: string, limits: Limits): Promise<CompileResult> {
      const dir = path.join(/*turbopackIgnore: true*/ os.tmpdir(), "code-judge", randomUUID());
      await mkdir(dir, { recursive: true });
      const file = CODING_LANGUAGES[language].file;
      await writeFile(path.join(/*turbopackIgnore: true*/ dir, file), code, "utf8");
      const tools = toolchain();
      const dispose = () => rm(dir, { recursive: true, force: true }).catch(() => {});

      const compileSteps: Record<CodingLanguage, [string, string[]] | null> = {
        c: [tools.gcc, [file, "-O2", "-std=gnu11", "-o", exe("main"), "-lm"]],
        cpp: [tools.gpp, [file, "-O2", "-std=gnu++17", "-o", exe("main")]],
        java: [tools.javac, ["-encoding", "UTF-8", file]],
        python: [tools.python, ["-m", "py_compile", file]],
        javascript: [tools.node, ["--check", file]],
      };
      const step = compileSteps[language];
      if (step) {
        const result = await runProcess(step[0], step[1], {
          cwd: dir,
          timeoutMs: COMPILE_TIMEOUT_MS,
        });
        if (result.spawnError) {
          await dispose();
          return {
            ok: false,
            internal: true,
            error: `The ${language} toolchain isn't available: ${result.spawnError}`,
          };
        }
        if (result.timedOut || result.code !== 0) {
          await dispose();
          return {
            ok: false,
            error: clean(result.stderr || result.stdout || "Compilation timed out.", dir),
          };
        }
      }

      const runCommand: Record<CodingLanguage, [string, string[]]> = {
        c: [path.join(/*turbopackIgnore: true*/ dir, exe("main")), []],
        cpp: [path.join(/*turbopackIgnore: true*/ dir, exe("main")), []],
        java: [
          tools.java,
          [`-Xmx${limits.memoryLimitMb}m`, "-Xss64m", "-XX:+UseSerialGC", "-cp", ".", "Main"],
        ],
        python: [tools.python, ["-I", "-B", file]],
        javascript: [
          tools.node,
          [`--max-old-space-size=${limits.memoryLimitMb}`, "--stack-size=65500", file],
        ],
      };
      const [command, args] = runCommand[language];
      const timeoutMs = effectiveTimeLimit(language, limits.timeLimitMs);

      return {
        ok: true,
        program: {
          async run(input: string): Promise<RunResult> {
            const result = await runProcess(command, args, { cwd: dir, input, timeoutMs });
            // Windows text-mode stdout writes \r\n; judges on Linux (Judge0) never see \r.
            const stdout = isWindows ? result.stdout.replace(/\r\n/g, "\n") : result.stdout;
            const base = { stdout, stderr: clean(result.stderr, dir), timeMs: result.timeMs };
            if (result.spawnError)
              return { ...base, status: "INTERNAL_ERROR", stderr: result.spawnError };
            if (result.timedOut) return { ...base, status: "TIME_LIMIT" };
            if (result.outputExceeded)
              return { ...base, status: "RUNTIME_ERROR", stderr: "Output limit exceeded (1 MB)." };
            if (/OutOfMemoryError|heap out of memory|MemoryError/.test(result.stderr)) {
              return { ...base, status: "MEMORY_LIMIT" };
            }
            if (result.code !== 0) return { ...base, status: "RUNTIME_ERROR" };
            return { ...base, status: "OK" };
          },
          dispose,
        },
      };
    },
  };
}
