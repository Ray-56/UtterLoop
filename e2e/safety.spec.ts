import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  expect, expectAppReady, openReadyApp, readUtterLoopIndexedDbRecord,
  readLearningStudioIndexedDbDocument,
  STARTER_LESSON_URL, test,
} from "./fixtures";

test("a taken-over Studio writer cannot replace the new owner's draft with a higher local revision", async ({ page, context }) => {
  await openReadyApp(page, "/?view=practice&studio=family");
  const family = page.locator(".studio-panel").filter({ has: page.getByRole("heading", { name: "Make a polite request", exact: true }) });
  await family.getByRole("button", { name: "Learn 3 variants", exact: true }).click();
  await page.getByRole("button", { name: "Start recall", exact: true }).click();
  await expect.poll(async () => (await readLearningStudioIndexedDbDocument(page))?.checkpoint?.phase).toBe("recall");
  await page.clock.install();
  const second = await context.newPage();
  await openReadyApp(second, "/?view=practice&studio=family");
  await second.getByRole("button", { name: "Take over Practice here", exact: true }).click();
  await second.getByRole("button", { name: "Resume Studio session", exact: true }).click();
  const newInput = second.getByLabel("Studio sentence input", { exact: true });
  await newInput.fill("new owner draft");
  await expect.poll(async () => (await readLearningStudioIndexedDbDocument(second))?.checkpoint?.draft).toBe("new owner draft");
  const newer = await readLearningStudioIndexedDbDocument(second);
  // Keep the previous document's focus/lease-renewal timer dormant while queued input builds a higher local revision.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Studio sentence input"]');
    if (!input) throw new Error("Expected the prior Studio document to remain mounted before renewal");
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    for (let index = 1; index <= 40; index++) {
      setValue.call(input, "old writer draft ".repeat(index));
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
    }
  });
  await page.clock.runFor(250);
  await expect(page.getByRole("alert")).toContainText("another tab");
  const afterOldAutosave = await readLearningStudioIndexedDbDocument(second);
  expect(afterOldAutosave?.revision).toBe(newer?.revision);
  expect(afterOldAutosave?.checkpoint?.draft).toBe("new owner draft");
  await newInput.press("End");
  await newInput.pressSequentially(" continues");
  await expect.poll(async () => (await readLearningStudioIndexedDbDocument(second))?.checkpoint?.draft).toBe("new owner draft continues");
});

async function beginRecall(page: Page) {
  await openReadyApp(page, STARTER_LESSON_URL);
  const skipQuickStart = page.getByRole("button", { name: "Skip Quick Start" });
  if (await skipQuickStart.isVisible()) await skipQuickStart.click();
  const capture = page.getByLabel("Type the target sentence");
  await expect(capture).toBeEditable();
  await expect(capture).toBeFocused();
  await capture.press("Enter");
  await expect(page.getByLabel("First exposure")).toHaveCount(0);
  return capture;
}

test("two tabs require explicit takeover, preserve the draft, and do not keep takeover permission", async ({ page, context }) => {
  const capture = await beginRecall(page);
  await capture.fill("Hello my");
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.draft)
    .toBe("Hello my");
  const original = await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active");
  await page.reload();
  await expectAppReady(page);
  await expect(page.getByLabel("Type the target sentence")).toHaveValue("Hello my");
  expect((await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.sessionId)
    .toBe(original?.sessionId);
  const second = await context.newPage();
  await openReadyApp(second, STARTER_LESSON_URL);
  await expect(second.getByRole("heading", { name: "Practice is open in another tab" })).toBeVisible();
  await expect(second.getByLabel("Type the target sentence")).toHaveCount(0);
  await second.getByRole("button", { name: "Take over Practice here" }).click();
  await expect(second.getByLabel("Type the target sentence")).toHaveValue("Hello my");
  expect((await readUtterLoopIndexedDbRecord(second, "practiceSessionCheckpoints", "active"))?.sessionId)
    .toBe(original?.sessionId);

  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "Practice is open in another tab" })).toBeVisible({ timeout: 15_000 });
  await second.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Full local backup" })).toBeVisible();
  await page.getByRole("button", { name: "Retry access" }).click();
  await expect(page.getByLabel("Type the target sentence")).toHaveValue("Hello my");
  await second.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Practice is open in another tab" })).toBeVisible();
  await expect(second.getByLabel("Type the target sentence")).toHaveCount(0);
});

test("reset in another tab invalidates the old Practice page and never resurrects its checkpoint", async ({ page, context }) => {
  const capture = await beginRecall(page);
  await capture.fill("Hello my");
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.draft)
    .toBe("Hello my");
  const second = await context.newPage();
  await openReadyApp(second, "/?view=settings");
  await expectAppReady(second);
  await second.getByRole("button", { name: "Reset learning progress", exact: true }).click();
  await second.getByRole("dialog").getByRole("button", { name: /Reset/ }).click();
  await expect(second.getByRole("button", { name: "Reload updated data" })).toBeVisible();

  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "Reload your updated learning data" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Type the target sentence")).toHaveCount(0);
  expect(await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")).toBeUndefined();
  expect(await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "sf-001")).toBeUndefined();
  await page.getByRole("button", { name: "Reload updated data" }).click();
  await expectAppReady(page);
  await expect(page.getByLabel("First exposure")).toBeVisible();
});

test("restore in another tab clears the old draft and prevents stale autosaves from reviving it", async ({ page, context }) => {
  const capture = await beginRecall(page);
  await capture.fill("private unfinished input");
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.draft)
    .toBe("private unfinished input");
  const second = await context.newPage();
  await openReadyApp(second, "/?view=settings");
  const backup = second.getByRole("region", { name: "Full local backup" });
  const downloadPromise = second.waitForEvent("download");
  await backup.getByRole("button", { name: "Export full backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Expected a downloaded local backup");
  const bytes = await readFile(path);
  expect(bytes.toString("utf8")).not.toContain("private unfinished input");
  expect(JSON.parse(bytes.toString("utf8")).schemaVersion).toBe(3);
  await backup.locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(), mimeType: "application/json", buffer: bytes,
  });
  await backup.getByRole("button", { name: "Review replacement" }).click();
  await second.getByRole("dialog").getByRole("button", { name: "Replace with backup" }).click();
  await expect(second.getByRole("button", { name: "Reload updated data" })).toBeVisible();
  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "Reload your updated learning data" })).toBeVisible({ timeout: 15_000 });
  expect(await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")).toBeUndefined();
  await page.getByRole("button", { name: "Reload updated data" }).click();
  await expectAppReady(page);
  await expect(page.getByLabel("Type the target sentence")).toHaveValue("");
});
