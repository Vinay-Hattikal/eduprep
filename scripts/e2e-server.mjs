// Starts what the end-to-end tests need: migrated + seeded database, production build,
// the web server and the background worker. Used by playwright.config.ts through with-db.mjs.

import { spawn, spawnSync } from "node:child_process";

const port = process.env.E2E_PORT || "3200";

function step(command) {
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

step("npx prisma migrate deploy");
step("npx prisma db seed");
// Published sample content and freshly reset test students, so every run starts the same way.
step("npx tsx --conditions=react-server scripts/load-sample-content.ts --publish --reset-students");
if (!process.env.E2E_SKIP_BUILD) step("npx next build");

const children = [
  spawn(`npx next start -p ${port}`, { shell: true, stdio: "inherit" }),
  spawn("npm run worker", { shell: true, stdio: "inherit" }),
];

let exiting = false;
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
for (const child of children) child.on("exit", (code) => shutdown(code ?? 1));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
