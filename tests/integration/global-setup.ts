// Creates the test database (if missing) and applies migrations once per test run.

import { execSync } from "node:child_process";
import pg from "pg";

export default async function setup() {
  const testUrl = process.env.DATABASE_URL;
  if (!testUrl || !/_test(\?|$)/.test(new URL(testUrl).pathname + "?")) {
    throw new Error("Integration tests must run against a *_test database.");
  }

  const url = new URL(testUrl);
  const name = url.pathname.replace(/^\//, "");
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const existing = await admin.query(
    "SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = $1",
    [name],
  );
  // The test database is disposable: recreate it if it isn't UTF-8.
  if (existing.rows[0] && existing.rows[0].encoding !== "UTF8") {
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  if (!existing.rows[0] || existing.rows[0].encoding !== "UTF8") {
    await admin.query(
      `CREATE DATABASE "${name}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
    );
  }
  await admin.end();

  execSync("npx prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
