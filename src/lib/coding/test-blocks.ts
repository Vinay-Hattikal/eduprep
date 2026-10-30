// "Paste several tests" in the problem editor (D-067). Pure, so the format is unit-tested.
//
//   input of test 1          A line with only === separates a test's input from its output.
//   ===                      A line with only --- separates one test from the next.
//   expected output 1
//   ---
//   input of test 2
//   ===
//   expected output 2

export const MAX_PASTED_TESTS = 100;
const MAX_FIELD_CHARS = 100_000;

export type PastedTest = { input: string; output: string };

const trimBlankLines = (text: string) => text.replace(/^\n+|\n+$/g, "");

export function parseTestBlocks(text: string): { tests: PastedTest[] } | { error: string } {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/^---[ \t]*$/m)
    .map(trimBlankLines)
    .filter(Boolean);
  if (!blocks.length) return { error: "Paste at least one test." };
  if (blocks.length > MAX_PASTED_TESTS)
    return { error: `At most ${MAX_PASTED_TESTS} tests at once. For more, import a ZIP package.` };
  const tests: PastedTest[] = [];
  for (const [i, block] of blocks.entries()) {
    const parts = block.split(/^===[ \t]*$/m);
    if (parts.length !== 2)
      return { error: `Test ${i + 1}: put a line with only === between the input and the output.` };
    const [input, output] = parts.map(trimBlankLines) as [string, string];
    if (!output) return { error: `Test ${i + 1}: the expected output is empty.` };
    if (input.length > MAX_FIELD_CHARS || output.length > MAX_FIELD_CHARS)
      return { error: `Test ${i + 1} is over 100 KB. Import a ZIP package for big tests.` };
    tests.push({ input, output });
  }
  return { tests };
}
