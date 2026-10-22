import { expect, openReadyApp, readUtterLoopIndexedDbRecord, seedUtterLoopIndexedDb, test } from "./fixtures";

test("Work & Study authored support teaches aligned words and stays hidden during recall", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openReadyApp(page, "/?view=settings");
  await seedUtterLoopIndexedDb(page, { appPreferences: [{ id: "device", theme: "system", speechVoiceUri: null, keySoundMuted: true, fingerGuideMode: "off", quickStart: { version: 1, status: "dismissed" } }] });
  await openReadyApp(page, "/?view=practice&scope=lesson&practiceCourse=work-study-essentials&practiceLesson=wse-u1-l1&practiceMode=learn");
  const exposure = page.getByLabel("First exposure", { exact: true });
  await expect(exposure).toBeVisible();
  const tokens = exposure.locator(".sentence-grammar-token");
  await expect(tokens).toHaveCount(7);
  expect(await tokens.locator("strong").allTextContents()).toEqual(["I", "finished", "the", "first", "draft", "this", "morning."]);
  await expect(exposure.getByLabel("Sentence structure map")).toBeVisible();
  await expect(exposure.locator(".sentence-grammar-token-ipa")).toHaveCount(7);
  await expect(exposure.locator(".sentence-grammar-token-gloss")).toHaveCount(7);
  await page.getByLabel("Type the target sentence").press("Enter");
  await expect(exposure).toHaveCount(0);
  await expect(page.getByLabel("Sentence grammar", { exact: true })).toHaveCount(0);
  await page.getByLabel("Type the target sentence").fill("I finished the first draft this morning.");
  await page.getByLabel("Type the target sentence").press("Enter");
  await expect(page.getByRole("button", { name: "Next, shortcut Enter", exact: true })).toBeVisible();
  expect(await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "wse-001")).toMatchObject({ acquisitionStatus: "ready-independent" });
  expect(await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "wse-001")).not.toHaveProperty("firstPassedAt");
  expect(errors).toEqual([]);
});
