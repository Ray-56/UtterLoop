import { defineConfig, devices } from "@playwright/test";

const port = 4274;
const origin = `http://127.0.0.1:${port}`;
const baseURL = `${origin}/UtterLoop/`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /preview\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  outputDir: "node_modules/.cache/playwright-preview-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-preview",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx vite build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    env: {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "local/UtterLoop",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
