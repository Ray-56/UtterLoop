import { defineConfig } from "@playwright/test";

const port = 4288;
const baseURL = `http://127.0.0.1:${port}/UtterLoop/`;

// Build separately first: concurrent acceptance builds must not replace these assets.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /performance\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 60_000 },
  reporter: "list",
  outputDir: "node_modules/.cache/playwright-performance-results",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "off",
    viewport: { width: 1280, height: 720 },
    channel: "chrome",
    launchOptions: { args: ["--enable-precise-memory-info"] },
  },
  webServer: {
    command: `npm run preview -- --outDir node_modules/.cache/performance-dist --host 127.0.0.1 --port ${port} --strictPort`,
    env: { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "local/UtterLoop" },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
