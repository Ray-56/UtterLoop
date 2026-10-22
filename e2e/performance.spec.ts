import { arch, platform, release } from "node:os";
import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, expectAppReady, readUtterLoopIndexedDbRecord, test } from "./fixtures";

const enabled = process.env.UTTERLOOP_BROWSER_PERFORMANCE === "1";
const target = "Hello, my name is Emma.";

for (const count of [10_000, 100_000]) {
  test(`real Chrome measures ${count.toLocaleString()} durable synthetic events`, async ({ page, browser }, testInfo) => {
    test.skip(!enabled, "Opt in with UTTERLOOP_BROWSER_PERFORMANCE=1 and the performance config.");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("?view=settings");
    await expectAppReady(page);
    const seeded = await seedHistory(page, count);

    // A full navigation exercises production startup against an existing local profile.
    await page.goto("./");
    await expectAppReady(page);
    const capture = page.getByLabel("Type the target sentence", { exact: true });
    await expect(capture).toBeEditable();
    await expect(capture).toBeFocused();
    const startup = await sample(page);
    await expect(page).toHaveURL(/view=practice.*scope=review/);
    await expect(page.getByText("你好，我叫艾玛。", { exact: true })).toBeVisible();
    await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.turn)
      .toMatchObject({ phase: "review-recall", submissionIndex: 0 });
    const checkpoint = await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active");
    const turn = checkpoint!.turn as { turnId: string };
    const logId = `turn-attempt:${turn.turnId}:0`;
    expect(await readUtterLoopIndexedDbRecord(page, "practiceLog", logId)).toBeUndefined();
    await capture.pressSequentially(target);
    await capture.evaluate((input: HTMLInputElement) => input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") performance.mark("performance-submit");
    }, { once: true }));
    await capture.press("Enter");
    await expect(page.getByRole("button", { name: "Next, shortcut Enter" })).toBeVisible();
    const submitted = await readUtterLoopIndexedDbRecord(page, "practiceLog", logId);
    expect(submitted).toMatchObject({ kind: "attempt", cardId: "sf-001", phase: "review-recall",
      submissionIndex: 0, answer: target, outcome: "perfect", supportLevelUsed: 0,
      answerWasRevealed: false, receivedCorrection: false,
      context: { queueReason: "due-review", scheduledReviewDueAt: seeded.dueAt } });
    const review = await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001");
    expect(review).toMatchObject({ stage: 2, streak: 2, lapseCount: 0 });
    expect(Date.parse(String(review!.dueAt))).toBeGreaterThan(Date.now());
    const submission = await sample(page, "performance-submit");
    await page.getByRole("button", { name: "Next, shortcut Enter" }).click();
    await expect(page.getByText("Review complete", { exact: true })).toBeVisible();

    // This navigation must await the deferred complete history and Beta projection.
    await page.getByRole("button", { name: "Progress", exact: true }).evaluate((button) => {
      button.addEventListener("click", () => performance.mark("performance-analytics"), { once: true });
    });
    await page.getByRole("button", { name: "Progress", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recall growth, without the guesswork" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recall beyond the first pass" })).toBeVisible();
    await expect(page.locator(".progress-subpanel").filter({ has: page.getByRole("heading", { name: "Recall outcomes", exact: true }) }))
      .toContainText(`Latest 500 of ${(count + 1).toLocaleString("en-US")} events`);
    const outcomes = page.locator(".all-time-statistics");
    await expect(outcomes.locator("div").filter({ has: page.getByText("Retrieval checks", { exact: true }) }).locator("dd"))
      .toHaveText((count / 2 + 1).toLocaleString("en-US"));
    await expect(outcomes.locator("div").filter({ has: page.getByText("Perfect recalls", { exact: true }) }).locator("dd"))
      .toHaveText((count * 0.4 + 1).toLocaleString("en-US"));
    const weekly = page.locator(".beta-readiness-card").filter({ hasText: "Weekly retained independent sentences" });
    await expect(weekly.locator("strong")).toHaveText("1");
    await expect(weekly).toContainText("1 of 1 eligible sentences");
    const completion = page.locator(".beta-readiness-card").filter({ hasText: "Due Review completion" });
    await expect(completion).toContainText("1 of 1 occurrences");
    const analytics = await sample(page, "performance-analytics");
    await page.getByText("Beta Inspector", { exact: true }).click();
    await expect(page.locator(".beta-evidence-coverage")).toContainText(`${seeded.recentLegacy.toLocaleString("en-US")} legacy rows excluded`);
    await expect(page.locator(".beta-evidence-coverage")).toContainText(`${seeded.recentPreContext.toLocaleString("en-US")} pre-context rows excluded`);
    await expect(page.getByRole("heading", { name: "Session outcomes" }).locator("..")).toContainText("1 completed · 0 abandoned · 0 inferred");
    const durableCount = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("utterloop-courses");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<number>((resolve, reject) => {
          const request = database.transaction("practiceLog").objectStore("practiceLog").count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally { database.close(); }
    });
    expect(durableCount).toBe(count + 1);
    expect(errors).toEqual([]);
    const result = {
      count, durableCount, measuredAt: new Date().toISOString(), browser: browser.version(),
      mainScript: await page.locator('script[type="module"][src]').first().getAttribute("src"),
      userAgent: await page.evaluate(() => navigator.userAgent),
      timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      host: `${platform()} ${release()} ${arch()}`, node: process.version,
      startupMs: startup.elapsedMs, submitDurableAndVisibleMs: submission.elapsedMs,
      completeAnalyticsMs: analytics.elapsedMs,
      heapBytes: { startup: startup.heapBytes, afterSubmit: submission.heapBytes, afterAnalytics: analytics.heapBytes },
      seeded, checked: { scheduledStage: review!.stage, weeklyRetained: "1 of 1 contextual sentences",
        dueReviewCompletion: "1 of 1 actual occurrences", allHistoryRetrievalChecks: count / 2 + 1,
        allHistoryPerfectRecalls: count * 0.4 + 1 },
    };
    console.info(`BROWSER_PERFORMANCE ${JSON.stringify(result)}`);
    const resultPath = testInfo.outputPath(`chrome-${count}-performance.json`);
    await writeFile(resultPath, JSON.stringify(result, null, 2));
    await testInfo.attach(`chrome-${count}-performance.json`, { path: resultPath, contentType: "application/json" });
  });
}

async function sample(page: Page, mark?: string) {
  return page.evaluate((mark) => {
    const now = performance.now();
    const start = mark ? performance.getEntriesByName(mark).at(-1)?.startTime : 0;
    if (start === undefined) throw new Error(`Missing performance mark ${mark}.`);
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return { elapsedMs: Math.round(now - start), heapBytes: memory?.usedJSHeapSize ?? "unavailable" };
  }, mark);
}

async function seedHistory(page: Page, count: number) {
  return page.evaluate(async (count) => {
    const began = performance.now();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("utterloop-courses");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const cards = await new Promise<Array<{ id: string; english: string }>>((resolve, reject) => {
        const request = database.transaction("sentenceCards").objectStore("sentenceCards").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      const dueAt = new Date(now - 60_000).toISOString();
      const firstPassedAt = new Date(now - 40 * 86_400_000).toISOString();
      let recentLegacy = 0;
      let recentPreContext = 0;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(["practiceLog", "sentenceLearningStates", "reviewStates", "appPreferences"], "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        const history = transaction.objectStore("practiceLog");
        for (let index = 0; index < count; index += 1) {
          const card = cards[index % cards.length];
          const dayAge = index % 365;
          const phase = index % 2 === 0 ? "legacy" : "review-recall";
          // Neither legacy nor context-free synthetic rows may become strict retention evidence.
          const submittedAt = new Date(now - dayAge * 86_400_000).toISOString();
          if (dayAge < 7) {
            if (phase === "legacy") recentLegacy += 1;
            else recentPreContext += 1;
          }
          history.put({ kind: "attempt", id: `browser-performance-${index}`, turnId: `synthetic-${index}`,
            cardId: card.id, phase, submissionIndex: 0, submittedAt, answer: card.english,
            outcome: index % 5 === 0 ? "close" : "perfect", accuracy: index % 5 === 0 ? 0.8 : 1,
            answerWasRevealed: false, hadEdits: false, audioPlayCount: 0, durationMs: 2_000,
            supportLevelUsed: 0, supportKindsUsed: [], receivedCorrection: false });
        }
        for (const card of cards) {
          transaction.objectStore("sentenceLearningStates").put({ cardId: card.id, introducedAt: firstPassedAt,
            firstPassedAt, firstPassSource: "independent-recall" });
          transaction.objectStore("reviewStates").put({ cardId: card.id, stage: 1, streak: 1, lapseCount: 0,
            lastReviewedAt: firstPassedAt, dueAt: card.id === "sf-001" ? dueAt : new Date(now + 7 * 86_400_000).toISOString() });
        }
        transaction.objectStore("appPreferences").put({ id: "device", theme: "light", speechVoiceUri: null,
          keySoundMuted: true, fingerGuideMode: "auto", quickStart: { version: 1, status: "dismissed" } });
      });
      return { seedMs: Math.round(performance.now() - began), cards: cards.length, dueAt, recentLegacy, recentPreContext };
    } finally { database.close(); }
  }, count);
}
