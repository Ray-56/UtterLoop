import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect, openReadyApp, expectAppReady, seedUtterLoopIndexedDb, readUtterLoopIndexedDbRecord, readLearningStudioIndexedDbDocument } from "./fixtures";

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
  const before = (await studio(page))?.checkpoint as { index: number };
  await page.locator(".studio-primary-key").click();
  await expect.poll(async () => ((await studio(page))?.checkpoint as { index: number } | null)?.index ?? -1).not.toBe(before.index);
}
async function studio(page: Page) { return readLearningStudioIndexedDbDocument(page); }

test("family instruction unlocks finite new variants, records first encounters, and keeps language evidence separate", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await prepare(page); await page.goto("/?view=practice&studio=family"); await expectAppReady(page);
  const family = page.locator(".studio-panel").filter({ has: page.getByRole("heading", { name: "Make a polite request", exact: true }) });
  await expect(family.getByRole("button", { name: "Check 2 new variants", exact: true })).toBeDisabled();
  await family.getByRole("button", { name: "Learn 3 variants", exact: true }).click();
  for (const answer of ["Could you send me the file?", "Could you send us the link?", "Could you send me the file before Friday?"]) {
    await recall(page, answer); await next(page);
  }
  await page.getByRole("button", { name: "Back to Learning Studio", exact: true }).click();
  await family.getByRole("button", { name: "Check 2 new variants", exact: true }).click();
  await expect(page.getByText("Could you send us the link before Friday?", { exact: true })).toHaveCount(0);
  await expect(page.locator(".studio-answer")).toBeEmpty();
  await recall(page, "Could you send us the link before Friday?", false); await next(page);
  await recall(page, "Could you send me the report tomorrow?", false); await next(page);
  const saved = await studio(page);
  expect(saved?.attempts).toHaveLength(5);
  expect((saved?.attempts as Array<Record<string, unknown>>).filter((attempt) => attempt.stage === "held-out")).toEqual([
    expect.objectContaining({ outcome: "perfect", firstEncounter: true, firstSubmission: true, answerWasRevealed: false }),
    expect.objectContaining({ outcome: "perfect", firstEncounter: true, firstSubmission: true, answerWasRevealed: false }),
  ]);
  expect(await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "sf-001")).toBeUndefined();
  expect(saved?.checkpoint).toBeNull(); expect(saved?.closedSessionIds).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("context recall resumes the same partial draft after reload without exposing the reference", async ({ page }) => {
  await prepare(page); const before = new Date(Date.now() - 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, { sentenceLearningStates: ["sf-019", "sf-020"].map((cardId) => ({ cardId, introducedAt: before, firstPassedAt: before, firstPassSource: "independent-recall" })) });
  await page.goto("/?view=practice&studio=context"); await expectAppReady(page);
  await page.getByRole("button", { name: "Try unfamiliar cues", exact: true }).click();
  await expect(page.locator(".studio-answer")).toBeEmpty();
  await recall(page, "I missed the last few words.", false); await next(page);
  const capture = page.getByLabel("Studio sentence input", { exact: true });
  await expect(capture).toBeEditable();
  await capture.focus(); await capture.pressSequentially("Let me");
  await expect.poll(async () => ((await studio(page))?.checkpoint as Record<string, unknown>)?.draft).toBe("Let me");
  await page.reload(); await expectAppReady(page);
  await page.getByRole("button", { name: "Resume Studio session", exact: true }).click();
  await expect(capture).toHaveValue("Let me");
  await expect(page.getByText("Let me check if I understood correctly.", { exact: true })).toHaveCount(0);
  await capture.pressSequentially(" check if I understood correctly."); await capture.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Expression recalled."); await next(page);
  expect((await studio(page))?.attempts).toHaveLength(2);
});

test("task rehearsal records skip and completion across an interrupted sequence", async ({ page }) => {
  await prepare(page); await page.goto("/?view=practice&studio=mission"); await expectAppReady(page);
  const task = page.locator(".studio-panel").filter({ has: page.getByRole("heading", { name: "Request an extension", exact: true }) });
  await task.getByRole("button", { name: "Rehearse this task", exact: true }).click();
  await recall(page, "I've finished the first draft."); await next(page);
  await page.getByRole("button", { name: "Save and leave", exact: true }).click();
  await page.getByRole("button", { name: "Resume Studio session", exact: true }).click();
  await recall(page, "I'm waiting for the final data."); await next(page);
  await page.getByRole("button", { name: "Skip expression", exact: true }).click();
  await expect(page.locator(".studio-runner-top")).toContainText("4 / 4");
  await recall(page, "I'll send you the report by Friday."); await next(page);
  await expect(page.getByRole("heading", { name: "Studio round complete", exact: true })).toBeVisible();
  const saved = await studio(page);
  expect(saved?.attempts).toHaveLength(3);
  expect(saved?.signals).toEqual([expect.objectContaining({ exerciseId: "extension-3", kind: "skipped" })]);
  expect(saved?.checkpoint).toBeNull();
});

test("personal inbox teaches before independent acquisition and includes private content in full backup", async ({ page }) => {
  await prepare(page); await page.goto("/?view=practice&studio=personal"); await expectAppReady(page);
  await page.getByLabel("Situation or meaning", { exact: true }).fill("在会议里说明日期还没有最终确认。");
  await page.getByLabel("Confirmed English expression", { exact: true }).fill("The date isn't final yet.");
  await page.getByLabel("Where you checked the expression", { exact: true }).fill("Confirmed with a colleague");
  await page.getByRole("button", { name: "Add personal sentence", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("confirm");
  await page.getByLabel("I checked this English expression and want to practise it.", { exact: true }).check();
  await page.getByRole("button", { name: "Add personal sentence", exact: true }).click();
  await expect(page.locator(".studio-personal-list li")).toHaveCount(1);
  await page.getByRole("button", { name: "Practise due personal sentences", exact: true }).click();
  await recall(page, "The date isn't final yet."); await next(page);
  let saved = await studio(page);
  let personal = (saved?.personalSentences as Array<Record<string, unknown>>)[0];
  expect(personal.learningState).not.toHaveProperty("firstPassedAt");
  expect(personal.learningState).toMatchObject({ acquisitionStatus: "ready-independent" });
  await page.getByRole("button", { name: "Back to Learning Studio", exact: true }).click();
  await page.locator(".studio-personal-list").getByRole("button", { name: "Practise", exact: true }).click();
  await expect(page.locator(".studio-answer")).toBeEmpty();
  await recall(page, "The date isn't final yet.", false); await next(page);
  saved = await studio(page); personal = (saved?.personalSentences as Array<Record<string, unknown>>)[0];
  expect(personal.learningState).toHaveProperty("firstPassedAt");
  expect(personal.reviewState).toMatchObject({ stage: 1 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full backup", exact: true }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.schemaVersion).toBe(3);
  expect(backup.learning.studio.personalSentences).toHaveLength(1);
  expect(backup.learning.studio.attempts).toHaveLength(2);
  expect(backup.learning.studio).not.toHaveProperty("checkpoint");
});

test("reliable cross-sentence patterns lead to authored contrast practice", async ({ page }) => {
  await prepare(page); const at = new Date().toISOString();
  await seedUtterLoopIndexedDb(page, { practiceLog: [
    { cardId: "sf-011", answer: "I need glass of water." },
    { cardId: "sf-013", answer: "Could you open window?" },
  ].map((row, index) => ({ ...row, id: `pattern-${index}`, turnId: `pattern-${index}`, kind: "attempt", phase: "independent-recall", submissionIndex: 0,
    outcome: "close", accuracy: 0.8, submittedAt: at, answerWasRevealed: false, hadEdits: false, audioPlayCount: 0, durationMs: 1000,
    supportLevelUsed: 0, supportKindsUsed: [], receivedCorrection: false })) });
  await page.goto("/?view=practice&studio=weakness"); await expectAppReady(page);
  await expect(page.getByRole("heading", { name: "Check articles", exact: true })).toBeVisible();
  await expect(page.getByText("I need a glass of water.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Practise this contrast", exact: true }).click();
  await recall(page, "I need a pen.");
  expect((await studio(page))?.attempts).toEqual([expect.objectContaining({ activity: "weakness", groupId: "articles", outcome: "perfect" })]);
});

test("revisiting a Studio expression preserves its draft and uses a new supported submission", async ({ page }) => {
  await prepare(page); await page.goto("/?view=practice&studio=family"); await expectAppReady(page);
  await page.getByRole("button", { name: "Learn 3 variants", exact: true }).first().click();
  await recall(page, "Could you send me the file?"); await next(page);
  await page.getByRole("button", { name: "Start recall", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await expect(input).toBeEditable(); await input.pressSequentially("Could you send us");
  await input.press("Shift+ArrowLeft");
  await expect(page.locator(".studio-runner-top")).toContainText("1 / 3");
  await expect(input).toHaveValue("Could you send me the file?");
  await next(page);
  await expect(input).toBeEditable(); await expect(input).toHaveValue("Could you send us");
  await page.getByRole("button", { name: "Previous expression, shortcut Shift plus Left Arrow", exact: true }).click();
  await expect(page.locator(".studio-runner-top")).toContainText("1 / 3");
  await page.locator(".studio-shortcuts").getByRole("button", { name: /Try again/ }).click();
  await expect(input).toBeEditable(); await input.pressSequentially("Could you send me the file?"); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Supported or repeated");
  const attempts = (await studio(page))?.attempts as Array<Record<string, unknown>>;
  expect(attempts).toHaveLength(2); expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(2);
  expect(attempts[1]).toMatchObject({ firstSubmission: false, firstEncounter: false, answerWasRevealed: true });
});

test("linked context shortcuts persist Course Vocabulary and Master while excluding mastered sentences", async ({ page }) => {
  await prepare(page); const before = new Date(Date.now() - 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, {
    sentenceLearningStates: ["sf-001", "sf-002", "sf-003"].map((cardId) => ({ cardId, introducedAt: before, firstPassedAt: before, firstPassSource: "independent-recall" })),
    reviewStates: [{ cardId: "sf-003", stage: 6, dueAt: before, streak: 6, lapseCount: 0, learningStatus: "mastered" }],
  });
  await page.goto("/?view=practice&studio=context"); await expectAppReady(page);
  await page.getByRole("button", { name: "Try unfamiliar cues", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true }); await expect(input).toBeEditable();
  await expect(page.locator(".studio-runner-top")).toContainText("1 / 2");
  const vocabulary = page.getByRole("button", { name: "Save Course Vocabulary, shortcut Control plus N", exact: true });
  await input.press("Control+n");
  await expect(page.getByRole("button", { name: "Remove Course Vocabulary, shortcut Control plus N", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await readUtterLoopIndexedDbRecord(page, "vocabularyEntries", "sf-001")).toBeTruthy();
  await expect(input).toBeEditable(); await input.press("Control+n");
  await expect(vocabulary).toHaveAttribute("aria-pressed", "false");
  await expect(input).toBeEditable(); await input.press("Control+m");
  await expect(page.locator(".studio-runner-top")).toContainText("2 / 2");
  expect(await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001")).toMatchObject({ learningStatus: "mastered" });
  await expect(page.getByRole("button", { name: "Previous expression, shortcut Shift plus Left Arrow", exact: true })).toBeDisabled();
  await expect(input).toBeEditable(); await input.press("Control+m");
  await expect(page.getByRole("heading", { name: "Studio round complete", exact: true })).toBeVisible();
  expect((await studio(page))?.attempts).toEqual([]);
  expect((await studio(page))?.checkpoint).toBeNull();
});

test("linked context Answer and skip retain Course acquisition and return due work to focus once", async ({ page }) => {
  await prepare(page); const before = new Date(Date.now() - 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, {
    sentenceLearningStates: [{ cardId: "sf-001", introducedAt: before, firstPassedAt: before, firstPassSource: "independent-recall" }],
    reviewStates: [{ cardId: "sf-001", stage: 3, dueAt: before, streak: 3, lapseCount: 0 }],
  });
  await page.goto("/?view=practice&studio=context"); await expectAppReady(page);
  await page.getByRole("button", { name: "Try unfamiliar cues", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true }); await expect(input).toBeEditable();
  await input.press("Control+Semicolon");
  await expect(page.locator(".studio-answer")).toContainText("Hello, my name is Emma.");
  const focused = await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001");
  expect(focused).toMatchObject({ stage: 0, lapseCount: 1 });
  await expect(page.getByRole("button", { name: "Skip expression", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Skip expression", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Studio round complete", exact: true })).toBeVisible();
  expect(await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001")).toEqual(focused);
  expect(await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "sf-001")).toHaveProperty("firstPassedAt", before);
  expect((await studio(page))?.signals).toEqual([
    expect.objectContaining({ kind: "revealed" }), expect.objectContaining({ kind: "skipped" }),
  ]);
});
