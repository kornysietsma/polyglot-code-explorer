import { defineConfig, devices } from "@playwright/test";

// The data file is baked in at build time (`__EXPLORER_DATA__`), so covering two layouts means
// two dev servers rather than one server and a runtime switch - which keeps the app free of a
// code path that only tests use. Each project's shots go to their own snapshot directory, named
// after the spec file.
const CHROME = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1600, height: 1000 },
};

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  // The 2% tolerance stops GPU/antialiasing noise reporting a diff on every run - but it also
  // lets `--update-snapshots` leave a stale-but-still-passing baseline in place, which has caught
  // us out twice (see CLAUDE.md). `npm run e2e:strict` drops it to zero so a re-baseline can be
  // proved to have actually moved the pixels.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: process.env.STRICT_SCREENSHOTS ? 0 : 0.02,
    },
  },
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // anchored to a path separator, or it would match nested-screenshots.spec.ts too
      testMatch: /[\\/]screenshots\.spec\.ts$/,
      use: { ...CHROME, baseURL: "http://localhost:5173" },
    },
    {
      name: "chromium-nested",
      testMatch: /[\\/]nested-screenshots\.spec\.ts$/,
      use: { ...CHROME, baseURL: "http://localhost:5174" },
    },
  ],
  webServer: [
    {
      command: "EXPLORER_DATA=explorertest npm run dev -- --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "EXPLORER_DATA=explorernested npm run dev -- --port 5174",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
