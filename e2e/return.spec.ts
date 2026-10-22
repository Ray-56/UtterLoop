import { expect, expectAppReady, openReadyApp, readUtterLoopIndexedDbRecord, seedUtterLoopIndexedDb, test } from "./fixtures";

async function prepareReturn(page: Parameters<typeof openReadyApp>[0], due = false) {
  await openReadyApp(page, "/?view=settings");
  await seedUtterLoopIndexedDb(page, {
    appPreferences: [{ id: "device", theme: "system", speechVoiceUri: null, keySoundMuted: true, fingerGuideMode: "off", quickStart: { version: 1, status: "dismissed" } }],
    ...(due ? {
      sentenceLearningStates: ["sf-001", "sf-002", "sf-003", "sf-004"].map((cardId) => ({ cardId, introducedAt: "2026-07-01T00:00:00.000Z", firstPassedAt: "2026-07-01T00:10:00.000Z", firstPassSource: "independent-recall" })),
      reviewStates: ["sf-001", "sf-002", "sf-003", "sf-004"].map((cardId, index) => ({ cardId, stage: 1, dueAt: `200${index}-01-01T00:00:00.000Z`, lastReviewedAt: "2026-07-01T00:10:00.000Z", streak: 1, lapseCount: 0 })),
    } : {}),
  });
}

async function checkAndNext(page: Parameters<typeof openReadyApp>[0], answer: string) {
  const capture = page.getByLabel("Type the target sentence");
  await capture.fill(answer);
  await capture.press("Enter");
  await page.getByRole("button", { name: "Next, shortcut Enter", exact: true }).click();
}

test("Return freezes three oldest due cards across reload and leaves other due dates intact", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepareReturn(page, true);
  await openReadyApp(page, "/?view=practice&scope=return&minutes=3");
  await expect(page.getByRole("note", { name: "Bounded return plan" })).toContainText("3 sentences");
  await expect(page.locator("body")).not.toContainText("Hello, my name is Emma.");
  await checkAndNext(page, "Hello, my name is Emma.");
  await page.getByLabel("Type the target sentence").fill("I'm new");
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.draft).toBe("I'm new");
  const saved = await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active");
  await page.reload();
  await expectAppReady(page);
  await expect(page.getByLabel("Type the target sentence")).toHaveValue("I'm new");
  await expect(page.getByRole("note", { name: "Bounded return plan" })).toContainText("3 sentences");
  await checkAndNext(page, "I'm new to this class.");
  await checkAndNext(page, "I live near the river.");
  await expect(page.locator(".session-summary")).toBeVisible();
  await expect.poll(async () => await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")).toBeUndefined();
  expect(await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-004")).toMatchObject({ dueAt: "2003-01-01T00:00:00.000Z", stage: 1 });
  const evidence = await readUtterLoopIndexedDbRecord(page, "practiceSessionEvidence", String(saved?.sessionId));
  expect(evidence?.scope).toEqual({ kind: "return", minutes: 3 });
  expect((evidence?.round as { dueReviewCompletedOccurrenceIds: string[] }).dueReviewCompletedOccurrenceIds).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("Return teaches one new sentence before recall and ends without extending its itinerary", async ({ page }) => {
  await prepareReturn(page);
  await openReadyApp(page, "/?view=practice&scope=return&minutes=8");
  await expect(page.getByLabel("First exposure", { exact: true })).toBeVisible();
  await expect(page.getByRole("note", { name: "Bounded return plan" })).toContainText("1 sentence");
  await page.getByLabel("Type the target sentence").press("Enter");
  await expect(page.getByLabel("First exposure", { exact: true })).toHaveCount(0);
  await checkAndNext(page, "Hello, my name is Emma.");
  await expect(page.locator(".session-summary")).toBeVisible();
  await expect(page.locator(".session-summary")).toContainText("bounded plan is complete");
  expect(await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "sf-001")).not.toHaveProperty("firstPassedAt");
});

test("an empty three-minute Return plan has a useful endpoint", async ({ page }) => {
  await prepareReturn(page);
  await openReadyApp(page, "/?view=practice&scope=return&minutes=3");
  await expect(page.getByRole("heading", { name: "Return plan complete" })).toBeVisible();
  await expect(page.getByText(/No eligible sentences remain for this budget/)).toBeVisible();
  await expect(page.getByLabel("Type the target sentence")).toHaveCount(0);
});
