// Integration tests: real PostgreSQL (separate *_test database), real queue, real storage folder.
// Run with `npm run test:integration` (starts the local database if needed).

import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

dotenv.config({ quiet: true });

const base = process.env.DATABASE_URL;
if (!base) throw new Error("DATABASE_URL is not set");
const url = new URL(base);
if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;

// Set here (not in test.env) so global setup and every worker see the test database.
Object.assign(process.env, {
  DATABASE_URL: url.toString(),
  STORAGE_DIR: path.resolve(import.meta.dirname, ".data/test-storage"),
  MAIL_DIR: path.resolve(import.meta.dirname, ".data/test-mail"),
  AUTH_SECRET: process.env.AUTH_SECRET || "integration-test-secret-0123456789abcdef",
  APP_ENV: "test",
  // Tests check real sign-in codes and the paywall, whatever the local .env says.
  TEST_MODE: "false",
});

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
