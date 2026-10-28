// Stops the local PostgreSQL started by scripts/with-db.mjs, e.g. after a terminal was closed
// without Ctrl+C and Postgres kept running. Uses the pg_ctl binary shipped with embedded-postgres.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(".data/postgres");

const platform = process.platform === "win32" ? "windows" : process.platform;
const { pg_ctl: pgCtl } = await import(`@embedded-postgres/${platform}-${process.arch}`);

function isRunning() {
  if (!existsSync(path.join(DATA_DIR, "postmaster.pid"))) return false;
  try {
    // Exits non-zero when no server is running (a stale postmaster.pid is left after a hard kill).
    execFileSync(pgCtl, ["status", "-D", DATA_DIR], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!isRunning()) {
  console.log("[db] Local PostgreSQL is not running.");
  process.exit(0);
}

execFileSync(pgCtl, ["stop", "-D", DATA_DIR, "-m", "fast"], { stdio: "inherit" });
console.log("[db] Local PostgreSQL stopped.");
