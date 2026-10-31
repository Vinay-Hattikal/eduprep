// Fails if the product name is hard-coded outside the brand config (D-021).
// Renaming the product must stay a config change.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Both names: the old one must not come back, the new one must come from siteConfig (D-068).
const NAME = /eduprep|anyprep/i;
const ROOT = path.resolve("src");
const ALLOWED = new Set([path.join(ROOT, "config", "site.ts")]);
const SKIP_DIRS = new Set([path.join(ROOT, "generated")]);
const EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs", ".js", ".json"]);

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(full)) yield* files(full);
    } else if (EXTENSIONS.has(path.extname(full))) {
      yield full;
    }
  }
}

const offenders = [];
for (const file of files(ROOT)) {
  if (ALLOWED.has(file)) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (NAME.test(line))
        offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
    });
}

if (offenders.length > 0) {
  console.error(
    "The product name must come from siteConfig (src/config/site.ts), not be hard-coded:",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}
console.log("Brand check passed: product name only in src/config/site.ts.");
