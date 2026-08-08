import type { Page } from "@playwright/test";
import {
  expect,
  expectAppReady,
  openReadyApp,
  STARTER_LESSON_URL,
  test,
} from "./fixtures";

async function enterStarterRecall(page: Page): Promise<void> {
  await openReadyApp(page, STARTER_LESSON_URL);
  await page.getByRole("button", { name: "Skip Quick Start" }).click();
  await page.getByRole("button", { name: "Start recall" }).click();
  await expect(page.getByLabel("First exposure")).toHaveCount(0);
}

function observeBrowserDiagnostics(page: Page): string[] {
  const diagnostics: string[] = [];
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    diagnostics.push(`requestfailed: ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  return diagnostics;
}

const smokeTest = test.extend<{ browserDiagnostics: string[] }>({
  browserDiagnostics: [async ({ page }, use) => {
    const diagnostics = observeBrowserDiagnostics(page);
    await use(diagnostics);
    expect(diagnostics).toEqual([]);
  }, { auto: true }],
});

smokeTest("cross-browser smoke runs only in Firefox and WebKit", ({ browserName }) => {
  expect(["firefox", "webkit"]).toContain(browserName);
});

smokeTest("starts without console, page, request, or asset errors", async ({ page }) => {
  await openReadyApp(page);
  await expect(page.getByRole("heading", { name: "Practice session" })).toHaveClass(/sr-only/);
  await expect(page.locator(".workspace-practice > .workspace-header")).toHaveCount(0);
});

smokeTest("navigates through the catalog and preserves browser Back", async ({ page }) => {
  await openReadyApp(page);

  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Courses & learning path" })).toBeVisible();
  await page.getByRole("button", { name: "View course Starter Foundations" }).click();
  await expect(page.getByRole("heading", { name: "Starter Foundations" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Courses & learning path" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View course Starter Foundations" })).toBeVisible();
});

smokeTest("submits one sentence recall through the real Practice surface", async ({ page }) => {
  await enterStarterRecall(page);

  const capture = page.getByLabel("Type the target sentence");
  await capture.fill("Hello, my name is Emma.");
  await capture.press("Enter");

  await expect(page.getByRole("button", { name: "Next, shortcut Enter" })).toBeVisible();
  await expect(page.getByLabel("Sentence recall practice").getByText("Guided", { exact: true })).toBeVisible();
});

smokeTest("accepts immediate contraction input when Quick Start begins recall", async ({ page }) => {
  await openReadyApp(page, STARTER_LESSON_URL);
  await expect(page.getByLabel("Quick Start, step 1 of 6")).toBeVisible();

  await page.getByRole("button", { name: "Start recall" }).click();
  await expect(page.getByLabel("Quick Start, step 2 of 6")).toBeVisible();

  const capture = page.getByLabel("Type the target sentence");
  await capture.fill("Hello, my name is Emma.");
  await capture.press("Enter");
  await page.getByRole("button", { name: "Next, shortcut Enter" }).click();

  const step3 = page.getByLabel("Quick Start, step 3 of 6");
  await expect(step3).toBeVisible();
  await expect(step3).toContainText("Start recall when you're ready");
  await expect(step3).not.toContainText("in your own typing");
  await expect(page.getByText("我是这个班的新同学。", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start recall" }).click();
  await page.keyboard.type("i'm");

  await expect(capture).toHaveValue("i'm");
  await expect(page.getByRole("button", { name: "Edit word 1" })).toContainText("i'm");
  await expect(page.locator(".practice-support-slot")).toHaveClass(/is-empty/);
  await expect(page.locator(".learning-support-recall")).toHaveCount(0);
  await expect(step3).toContainText("Recall the next sentence");
});

smokeTest("recovers the active sentence and draft after reload", async ({ page }) => {
  await enterStarterRecall(page);
  const capture = page.getByLabel("Type the target sentence");

  await capture.fill("Hello Em");
  await page.waitForTimeout(350);
  await page.reload();

  await expectAppReady(page);
  await expect(page.getByText("你好，我叫艾玛。", { exact: true })).toBeVisible();
  await expect(capture).toHaveValue("Hello Em");
  await expect(page.getByText(
    "Practice restored. Your draft and recall turn are ready.",
    { exact: true },
  )).toBeVisible();
});
