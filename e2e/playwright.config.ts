import { defineConfig, devices } from "@playwright/test";
import { FRONTEND_URL } from "./env";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  // Retries stay off: a first-failure trace is the only reliable debugging
  // artifact in CI, and retries would just mask flakes.
  retries: 0,
  // Serial in CI so concurrent tests never collide on the shared e2e
  // database; locally Playwright may fan out once isolation is by naming.
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ],
  use: {
    baseURL: FRONTEND_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
