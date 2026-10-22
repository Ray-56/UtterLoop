import { expect, test } from "@playwright/test";
import { expectAppReady, seedUtterLoopIndexedDb } from "./fixtures";

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

test("loads optional Studio and Fluency chunks below the GitHub Pages base path", async ({ page }) => {
  const assetPaths: string[] = [];
  const diagnostics: string[] = [];
  page.on("pageerror", (error) => diagnostics.push(error.message));
  page.on("requestfailed", (request) => diagnostics.push(`requestfailed: ${request.url()}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes("/assets/")) assetPaths.push(url.pathname);
    if (response.status() >= 400) diagnostics.push(`response: ${response.status()} ${url.pathname}`);
  });
  await page.goto("/UtterLoop/?view=settings");
  await expectAppReady(page);
  expect(assetPaths.some((path) => /(?:LearningStudioView|FluencyPass|FluencyProgress)-.*\.js$/.test(path))).toBe(false);
  const before = new Date(Date.now() - 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, {
    sentenceLearningStates: [{ cardId: "sf-001", introducedAt: before,
      firstPassedAt: before, firstPassSource: "independent-recall" }],
  });
  await page.goto("/UtterLoop/?view=practice&studio=fluency");
  await expectAppReady(page);
  await expect(page.getByRole("heading", { name: "Fluency progress", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start typing pass", exact: true }).click();
  await expect(page.getByLabel("Visible typing target")).toHaveText("Hello, my name is Emma.");
  const capture = page.getByLabel("Type the visible sentence for a Fluency Pass");
  await expect(capture).toBeFocused();
  await capture.press("H");
  await expect(capture).toHaveValue("H");
  for (const name of ["LearningStudioView", "FluencyPass", "FluencyProgress"]) {
    expect(assetPaths.some((path) => new RegExp(`${name}-.*\\.js$`).test(path))).toBe(true);
  }
  expect(assetPaths.every((path) => path.startsWith("/UtterLoop/assets/"))).toBe(true);
  expect(diagnostics).toEqual([]);
});
