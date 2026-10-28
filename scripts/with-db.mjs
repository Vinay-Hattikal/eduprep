// Runs a command with a local PostgreSQL available, without Docker (D-027).
//
//   node scripts/with-db.mjs next dev     start Postgres if needed, run the command, stop Postgres after
//   node scripts/with-db.mjs              start Postgres and keep it running until Ctrl+C
//
// If something already listens on the DATABASE_URL port (another terminal, CI service container),
// or DATABASE_URL points to a remote host, the command runs against that database as-is.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import dotenv from "dotenv";
import EmbeddedPostgres from "embedded-postgres";

dotenv.config({ quiet: true });

const DATA_DIR = path.resolve(".data/postgres");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[db] DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const url = new URL(databaseUrl);
const port = Number(url.port || 5432);
const databaseName = url.pathname.replace(/^\//, "") || "postgres";
// One argument is a full shell command ("npx prisma migrate dev"). Several arguments are joined,
// quoting those with spaces, so `with-db.mjs concurrently "next dev" "npm run worker"` works.
const args = process.argv.slice(2);
const command =
  args.length === 1 ? args[0] : args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");

function isPortOpen(portToCheck) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: portToCheck });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function run(cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: "inherit", env: process.env });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** UTF-8 regardless of the cluster's default (template0 allows any encoding with the C locale). */
const UTF8_DATABASE = "ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0";

async function startEmbedded() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: decodeURIComponent(url.username || "postgres"),
    password: decodeURIComponent(url.password || "postgres"),
    port,
    persistent: true,
    // UTF-8 everywhere; Windows would otherwise default to the ANSI code page (e.g. WIN1252),
    // which can't store characters like ₹, → or Hindi text.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log(`[db] Creating a local PostgreSQL cluster in ${DATA_DIR}`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const { rows } = await client.query(
    "SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = $1",
    [databaseName],
  );
  if (!rows.length) {
    await client.query(`CREATE DATABASE "${databaseName}" ${UTF8_DATABASE}`);
    console.log(`[db] Created database "${databaseName}"`);
  } else if (rows[0].encoding !== "UTF8") {
    console.warn(
      `[db] Warning: database "${databaseName}" uses ${rows[0].encoding}, not UTF8, so non-English ` +
        `text fails to save. Rename or drop it and run this again to recreate it as UTF8.`,
    );
  }
  await client.end();

  console.log(`[db] PostgreSQL running on port ${port}`);
  return pg;
}

async function main() {
  const external = !LOCAL_HOSTS.has(url.hostname) || (await isPortOpen(port));
  if (external) {
    if (!command) {
      console.log(`[db] A database is already reachable at ${url.hostname}:${port}.`);
      return;
    }
    process.exit(await run(command));
  }

  const pg = await startEmbedded();
  let stopping = false;
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    await pg.stop().catch(() => {});
    process.exit(code);
  };
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));

  if (!command) {
    console.log("[db] Press Ctrl+C to stop.");
    return;
  }
  await stop(await run(command));
}

main().catch((error) => {
  console.error("[db]", error);
  process.exit(1);
});
