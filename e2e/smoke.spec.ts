import type { Page } from "@playwright/test";
import {
  expect,
  expectAppReady,
  openReadyApp,
  STARTER_LESSON_URL,
  seedUtterLoopIndexedDb,
  readUtterLoopIndexedDbRecord,
  test,
} from "./fixtures";

async function enterStarterRecall(page: Page): Promise<void> {
  await openReadyApp(page, STARTER_LESSON_URL);
  await page.getByRole("button", { name: "Skip Quick Start" }).click();
  await expect(page.getByLabel(/Quick Start, step/)).toHaveCount(0);
  await page.getByLabel("Type the target sentence").press("Enter");
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
  await expect(page.getByRole("heading", { name: "Practice session", exact: true })).toHaveClass(/sr-only/);
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

  const capture = page.getByLabel("Type the target sentence");
  await capture.press("H");
  await expect(page.getByLabel("Quick Start, step 2 of 6")).toBeVisible();
  await expect(capture).toHaveValue("H");

  await capture.fill("Hello, my name is Emma.");
  await capture.press("Enter");
  await page.getByRole("button", { name: "Next, shortcut Enter" }).click();

  const step3 = page.getByLabel("Quick Start, step 3 of 6");
  await expect(step3).toBeVisible();
  await expect(step3).toContainText("Type, press Enter, or tap the word track");
  await expect(step3).not.toContainText("in your own typing");
  await expect(page.getByText("我是这个班的新同学。", { exact: true })).toBeVisible();

  await capture.press("i");
  await page.keyboard.type("'m");

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

smokeTest("runs an authored Studio recall without exposing its answer before checking", async ({ page }) => {
  await openReadyApp(page, "/?view=practice&studio=family");
  await page.getByRole("button", { name: "Learn 3 variants", exact: true }).first().click();
  await expect(page.locator(".studio-answer")).toContainText("Could you send me the file?");
  await page.getByRole("button", { name: "Start recall", exact: true }).click();
  await expect(page.locator(".studio-answer")).toBeEmpty();
  await expect(page.getByText("Could you send me the file?", { exact: true })).toHaveCount(0);
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await input.focus(); await input.pressSequentially("Could you send me the file?"); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Expression recalled.");
  const document = await readUtterLoopIndexedDbRecord(page, "learningStudio", "local");
  expect(document?.attempts).toHaveLength(1);
});

smokeTest("loads optional typing and persists a separate pass", async ({ page }) => {
  await openReadyApp(page, "/?view=settings");
  const at = new Date(Date.now() - 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, { sentenceLearningStates: [{ cardId: "sf-001", introducedAt: at,
    firstPassedAt: at, firstPassSource: "independent-recall" }] });
  await page.goto("/?view=practice&studio=fluency"); await expectAppReady(page);
  await page.getByRole("button", { name: "Start typing pass", exact: true }).first().click();
  const input = page.getByLabel("Type the visible sentence for a Fluency Pass");
  await input.focus(); await input.pressSequentially("Hello, my name is Emma."); await input.press("Enter");
  await expect(page.locator(".fluency-result").getByRole("button", { name: "Return to learning", exact: true })).toBeEnabled();
  const document = await readUtterLoopIndexedDbRecord(page, "learningStudio", "local");
  expect(document?.fluencyResults).toHaveLength(1);
});
