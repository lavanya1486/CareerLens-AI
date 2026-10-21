import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a fully running stack (PostgreSQL, AI service, backend, frontend).
 * Start the stack first (see README), then: E2E_BASE_URL=http://localhost:4173 npm run e2e
 * Set SCREENSHOTS_DIR to also save real screenshots of each step.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
    launchOptions: { args: ["--disable-dev-shm-usage"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
});
