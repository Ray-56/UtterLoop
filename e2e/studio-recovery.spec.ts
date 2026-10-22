import type { Page } from "@playwright/test";
import { emptyLearningStudio } from "../src/domain/studio/LearningStudio";
import { createPersonalSentence, recordPersonalRecall } from "../src/domain/studio/studioRules";
import { test, expect, openReadyApp, expectAppReady, seedUtterLoopIndexedDb, readLearningStudioIndexedDbDocument } from "./fixtures";

async function prepare(page: Page) {
  await openReadyApp(page, "/?view=settings");
  await seedUtterLoopIndexedDb(page, { appPreferences: [{ id: "device", theme: "light", speechVoiceUri: null,
    keySoundMuted: true, fingerGuideMode: "auto", quickStart: null }] });
}
async function recall(page: Page, answer: string, instruction = true) {
  if (instruction) await page.getByRole("button", { name: "Start recall", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await expect(input).toBeEditable();
  await input.focus(); await input.pressSequentially(answer, { delay: 1 }); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Expression recalled.");
}
async function next(page: Page) {
  const before = (await studio(page))?.checkpoint as { index: number; exerciseIds: string[] };
  const expectedIndex = before.index + 1 === before.exerciseIds.length ? null : before.index + 1;
  await page.locator(".studio-primary-key").click();
  await expect.poll(async () => {
    const checkpoint = (await studio(page))?.checkpoint as { index: number } | null | undefined;
    return checkpoint === null ? null : checkpoint?.index;
  }).toBe(expectedIndex);
}
async function studio(page: Page) { return readLearningStudioIndexedDbDocument(page); }

test("a personal due round resumes its frozen itinerary after an earlier sentence moves into the future", async ({ page }) => {
  await prepare(page);
  const yesterday = new Date(Date.now() - 86_400_000);
  const personalSentences = [
    { id: "personal-date", prompt: "说明日期尚未最终确定。", english: "The date isn't final yet." },
    { id: "personal-time", prompt: "说明时间尚未最终确定。", english: "The time isn't final yet." },
  ].map((draft) => {
    const created = createPersonalSentence({ ...draft, source: "Confirmed with a colleague", confirmed: true }, yesterday);
    const guided = recordPersonalRecall(created, draft.english, false, yesterday).sentence;
    return recordPersonalRecall(guided, draft.english, false, yesterday).sentence;
  });
  await seedUtterLoopIndexedDb(page, { learningStudio: [{ ...emptyLearningStudio(), personalSentences }] });
  await page.goto("/?view=practice&studio=personal"); await expectAppReady(page);
  await page.getByRole("button", { name: "Practise due personal sentences", exact: true }).click();
  await recall(page, "The date isn't final yet.", false); await next(page);
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await expect(input).toBeEditable();
  await input.pressSequentially("The time");
  await expect.poll(async () => ((await studio(page))?.checkpoint as Record<string, unknown>)?.draft).toBe("The time");
  await page.reload(); await expectAppReady(page);
  await page.getByRole("button", { name: "Resume Studio session", exact: true }).click();
  await expect(input).toHaveValue("The time");
  await expect(page.locator(".studio-runner-top")).toContainText("2 / 2");
  await input.pressSequentially(" isn't final yet."); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Expression recalled."); await next(page);
  expect((await studio(page))?.checkpoint).toBeNull();
});

test("leaving through primary navigation saves the latest draft before the debounce fires", async ({ page }) => {
  await prepare(page);
  const before = new Date(Date.now() - 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, { sentenceLearningStates: [{ cardId: "sf-020", introducedAt: before,
    firstPassedAt: before, firstPassSource: "independent-recall" }] });
  await page.goto("/?view=practice&studio=context"); await expectAppReady(page);
  await page.getByRole("button", { name: "Try unfamiliar cues", exact: true }).click();
  await page.clock.install();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await expect(input).toBeEditable();
  await input.pressSequentially("Let me");
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(input).toHaveCount(0);
  await page.clock.runFor(250);
  await expect.poll(async () => ((await studio(page))?.checkpoint as Record<string, unknown>)?.draft).toBe("Let me");
  await page.goBack();
  await page.getByRole("button", { name: "Resume Studio session", exact: true }).click();
  await expect(input).toHaveValue("Let me");
  await input.pressSequentially(" check if I understood correctly."); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Expression recalled."); await next(page);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await page.clock.runFor(500);
  expect((await studio(page))?.checkpoint).toBeNull();
});

test("audio support locks the input while its learning signal is being saved", async ({ page }) => {
  await prepare(page);
  const before = new Date(Date.now() - 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, { sentenceLearningStates: [{ cardId: "sf-020", introducedAt: before,
    firstPassedAt: before, firstPassSource: "independent-recall" }] });
  await page.goto("/?view=practice&studio=context"); await expectAppReady(page);
  await page.getByRole("button", { name: "Try unfamiliar cues", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await expect(input).toBeEditable();
  await input.pressSequentially("Let me");
  await expect.poll(async () => ((await studio(page))?.checkpoint as Record<string, unknown>)?.draft).toBe("Let me");
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("utterloop-courses");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let holding = true;
    const deadline = performance.now() + 10_000;
    window.addEventListener("studio-write-release", () => { holding = false; }, { once: true });
    const transaction = database.transaction("learningStudio", "readwrite");
    transaction.oncomplete = () => database.close();
    await new Promise<void>((resolve) => {
      function keepAlive() {
        const request = transaction.objectStore("learningStudio").get("local");
        request.onsuccess = () => { resolve(); if (holding && performance.now() < deadline) keepAlive(); };
      }
      keepAlive();
    });
  });
  try {
    await input.press("Control+Quote");
    await expect(input).toBeDisabled({ timeout: 500 });
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event("studio-write-release")));
  }
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("Let me");
  await expect.poll(async () => (await studio(page))?.signals).toEqual([
    expect.objectContaining({ kind: "revealed", exerciseId: "sf-020:context:test" }),
  ]);
});

test("a revealed first transfer check stays in the first-encounter denominator", async ({ page }) => {
  await prepare(page); await page.goto("/?view=practice&studio=family"); await expectAppReady(page);
  const family = page.locator(".studio-panel").filter({ has: page.getByRole("heading", { name: "Make a polite request", exact: true }) });
  await family.getByRole("button", { name: "Learn 3 variants", exact: true }).click();
  for (const answer of ["Could you send me the file?", "Could you send us the link?", "Could you send me the file before Friday?"]) {
    await recall(page, answer); await next(page);
  }
  await page.getByRole("button", { name: "Back to Learning Studio", exact: true }).click();
  await family.getByRole("button", { name: "Check 2 new variants", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await input.press("Control+Semicolon");
  await expect(page.locator(".studio-answer")).toContainText("Could you send us the link before Friday?");
  await recall(page, "Could you send us the link before Friday?", false); await next(page);
  await recall(page, "Could you send me the report tomorrow?", false); await next(page);
  await page.getByRole("button", { name: "Back to Learning Studio", exact: true }).click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(page.getByText("1 of 2 first encounters with test variants were recalled perfectly without reveal.", { exact: true })).toBeVisible();
  const saved = await studio(page);
  expect((saved?.attempts as Array<Record<string, unknown>>).filter((attempt) => attempt.stage === "held-out")).toEqual([
    expect.objectContaining({ firstEncounter: true, firstSubmission: true, answerWasRevealed: true }),
    expect.objectContaining({ firstEncounter: true, firstSubmission: true, answerWasRevealed: false }),
  ]);
});
