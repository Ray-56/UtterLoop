import { expect, test } from "@playwright/test";

test("serves a direct Settings URL and every asset below the GitHub Pages base path", async ({ page }) => {
  const assetPaths: string[] = [];
  const diagnostics: string[] = [];

  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    diagnostics.push(`requestfailed: ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes("/assets/")) assetPaths.push(url.pathname);
    if (response.status() >= 400) diagnostics.push(`response: ${response.status()} ${url.pathname}`);
  });

  await page.goto("/UtterLoop/?view=settings");

  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preferences & data" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/UtterLoop/");
  expect(assetPaths.length).toBeGreaterThanOrEqual(2);
  expect(assetPaths.every((path) => path.startsWith("/UtterLoop/assets/"))).toBe(true);
  expect(diagnostics).toEqual([]);
});
