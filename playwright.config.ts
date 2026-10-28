import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests against a production build, on desktop and a 360 px phone (rules.md section 6).
 * The web server migrates and seeds the local database first; dev login must be enabled.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Database + build + web server + background worker (imports run in the worker).
    command: `node scripts/with-db.mjs "node scripts/e2e-server.mjs"`,
    // End-to-end tests cover real sign-in codes and payments, whatever the local .env says.
    env: { E2E_PORT: String(PORT), TEST_MODE: "false" },
    url: baseURL,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
