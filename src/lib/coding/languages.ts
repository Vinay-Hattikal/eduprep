// Languages the coding platform supports (PRD 4.5).

export const CODING_LANGUAGES = {
  c: { label: "C", file: "main.c" },
  cpp: { label: "C++", file: "main.cpp" },
  java: { label: "Java", file: "Main.java" },
  python: { label: "Python 3", file: "main.py" },
  javascript: { label: "JavaScript (Node.js)", file: "main.js" },
} as const;

export type CodingLanguage = keyof typeof CODING_LANGUAGES;

export const CODING_LANGUAGE_IDS = Object.keys(CODING_LANGUAGES) as CodingLanguage[];

export function isCodingLanguage(value: string): value is CodingLanguage {
  return Object.hasOwn(CODING_LANGUAGES, value);
}

/**
 * Time limits are set for C/C++. Slower runtimes get the usual judge allowances:
 * a multiplier, plus process start-up time (large for the JVM).
 */
export const TIME_FACTORS: Record<CodingLanguage, { multiplier: number; startupMs: number }> = {
  c: { multiplier: 1, startupMs: 150 },
  cpp: { multiplier: 1, startupMs: 150 },
  java: { multiplier: 2, startupMs: 1200 },
  python: { multiplier: 3, startupMs: 400 },
  javascript: { multiplier: 2, startupMs: 400 },
};

export function effectiveTimeLimit(language: CodingLanguage, timeLimitMs: number): number {
  const factor = TIME_FACTORS[language];
  return timeLimitMs * factor.multiplier + factor.startupMs;
}

/** Java programs must declare `public class Main` (like most online judges). */
export const JAVA_CLASS_NOTE = "Java code must use `public class Main`.";

export const VERDICT_LABELS = {
  PENDING: "Queued",
  RUNNING: "Running",
  ACCEPTED: "Accepted",
  WRONG_ANSWER: "Wrong answer",
  TIME_LIMIT: "Time limit exceeded",
  MEMORY_LIMIT: "Memory limit exceeded",
  RUNTIME_ERROR: "Runtime error",
  COMPILATION_ERROR: "Compilation error",
  INTERNAL_ERROR: "Judge error",
} as const;

export type VerdictName = keyof typeof VERDICT_LABELS;

/** Editor starting point when a problem has no starter code for the language. */
export const DEFAULT_STARTERS: Record<CodingLanguage, string> = {
  c: `#include <stdio.h>

int main(void) {
    // Read from stdin, write to stdout.
    return 0;
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // Read from stdin, write to stdout.
    return 0;
}
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // Read from stdin, write to stdout.
    }
}
`,
  python: `import sys


def main():
    data = sys.stdin.read().split()
    # Read from stdin, write to stdout.


main()
`,
  javascript: `const data = require("fs").readFileSync(0, "utf8").trim().split(/\\s+/);
// Read from stdin, write to stdout.
`,
};
