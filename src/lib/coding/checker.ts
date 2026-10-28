// Compares a program's output with the expected output (data-import.md 4.4 `checker`).
//   exact              line by line; trailing spaces and trailing blank lines ignored
//   ignore_whitespace  token by token; any whitespace is equal
//   float:<eps>        token by token; numbers equal within an absolute/relative eps

export type CheckerSpec = "exact" | "ignore_whitespace" | `float:${string}`;

export function isValidChecker(spec: string): spec is CheckerSpec {
  if (spec === "exact" || spec === "ignore_whitespace") return true;
  const match = /^float:(.+)$/.exec(spec);
  return Boolean(match && Number(match[1]) > 0 && Number(match[1]) < 1);
}

function normalizeLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function tokens(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function outputsMatch(expected: string, actual: string, checker: string): boolean {
  if (checker === "ignore_whitespace") {
    const a = tokens(expected);
    const b = tokens(actual);
    return a.length === b.length && a.every((token, i) => token === b[i]);
  }

  const float = /^float:(.+)$/.exec(checker);
  if (float) {
    const eps = Number(float[1]);
    const a = tokens(expected);
    const b = tokens(actual);
    if (a.length !== b.length) return false;
    return a.every((token, i) => {
      const x = Number(token);
      const y = Number(b[i]);
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        /^[-+.\deE]+$/.test(token) &&
        /^[-+.\deE]+$/.test(b[i]!)
      ) {
        return Math.abs(x - y) <= eps * Math.max(1, Math.abs(x));
      }
      return token === b[i];
    });
  }

  const a = normalizeLines(expected);
  const b = normalizeLines(actual);
  return a.length === b.length && a.every((line, i) => line === b[i]);
}
