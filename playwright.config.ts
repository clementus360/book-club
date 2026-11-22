import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL points the suite at an already running app (for example one
// connected to a real Supabase project with email confirmation turned off).
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: external ?? "http://localhost:3199", actionTimeout: 10_000, trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
  webServer: external ? undefined : {
    command: "node tests/support/e2e-stack.mjs",
    url: "http://localhost:3199/privacy",
    timeout: 240_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
