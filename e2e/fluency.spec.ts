import type { Page } from "@playwright/test";
import { expect, expectAppReady, openReadyApp, readUtterLoopIndexedDbRecord, seedUtterLoopIndexedDb, STARTER_LESSON_URL, test } from "./fixtures";

const target = "Hello, my name is Emma.";
const captureLabel = "Type the visible sentence for a Fluency Pass";

async function prepareFluency(page: Page) {
  await openReadyApp(page, "/?view=settings");
  const before = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await seedUtterLoopIndexedDb(page, {
    sentenceLearningStates: ["sf-001", "sf-002"].map((cardId) => ({
      cardId, introducedAt: before, firstPassedAt: before, firstPassSource: "independent-recall",
    })),
    reviewStates: ["sf-001", "sf-002"].map((cardId) => ({
      cardId, stage: 2, dueAt: future, streak: 2, lapseCount: 0,
    })),
    appPreferences: [{ id: "device", theme: "light", speechVoiceUri: null, keySoundMuted: true,
      fingerGuideMode: "auto", quickStart: null }],
  });
  await page.goto("/?view=practice&studio=fluency");
  await expectAppReady(page);
  await expect(page.getByRole("heading", { name: "Fluency progress", exact: true })).toBeVisible();
  await expect(page.getByText(target, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Start typing pass", exact: true }).first().click();
  await expect(page.getByLabel("Visible typing target")).toHaveText(target);
  const capture = page.getByLabel(captureLabel);
  await expect(capture).toBeAttached();
  return capture;
}

async function readStudio(page: Page): Promise<{ fluencyResults: Array<Record<string, unknown>> } | undefined> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("utterloop-courses");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<{ fluencyResults: Array<Record<string, unknown>> } | undefined>((resolve, reject) => {
        const request = database.transaction("learningStudio").objectStore("learningStudio").get("local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally { database.close(); }
  });
}

test("visible-target typing persists separate evidence, key counts, and history without rescheduling language", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const capture = await prepareFluency(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const learningBefore = await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "sf-001");
  const reviewBefore = await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001");
  await capture.press("x");
  expect(await page.locator(".fluency-word-active").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await capture.press("Backspace");
  await capture.pressSequentially(target, { delay: 4 });
  await page.screenshot({ path: test.info().outputPath("fluency-mobile-input.png") });
  await capture.press("Enter");
  const resultPanel = page.locator(".fluency-result");
  await expect(resultPanel.getByRole("button", { name: "Return to learning", exact: true })).toBeEnabled();
  await expect(resultPanel).toContainText("100%");
  await expect(page.getByLabel("X: 1 presses, 1 mismatches")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("fluency-mobile-result.png") });
  const studioDocument = await readStudio(page);
  expect(studioDocument?.fluencyResults).toHaveLength(1);
  expect(studioDocument?.fluencyResults[0]).toMatchObject({ sourceCardId: "sf-001", source: "learned",
    characterAccuracy: 1, backspaces: 1, uncorrectedErrors: 0 });
  expect(studioDocument?.fluencyResults[0]).not.toHaveProperty("target");
  expect(studioDocument?.fluencyResults[0]).not.toHaveProperty("answer");
  expect(await readUtterLoopIndexedDbRecord(page, "sentenceLearningStates", "sf-001")).toEqual(learningBefore);
  expect(await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001")).toEqual(reviewBefore);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await resultPanel.getByRole("button", { name: "Return to learning", exact: true }).click();
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator(".fluency-progress")).toContainText("1 pass · 1 sentence");
  await expect(page.getByText(target, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("composition Enter cannot submit and paused or pre-input time cannot inflate the measurement", async ({ page }) => {
  const capture = await prepareFluency(page);
  // Advance the typing measurement clock while ownership's wall clock and renewal timers keep running normally.
  const typingClock = await page.evaluateHandle(() => {
    const nativeNow = performance.now.bind(performance);
    const clock = { elapsedMs: 0 };
    Object.defineProperty(performance, "now", { configurable: true, value: () => nativeNow() + clock.elapsedMs });
    return clock;
  });
  await typingClock.evaluate((clock) => { clock.elapsedMs += 60_000; });
  await capture.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    setValue.call(input, "H");
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "H", inputType: "insertCompositionText", isComposing: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true,
      key: "Enter", code: "Enter", isComposing: true }));
  });
  await expect(page.getByRole("heading", { name: "Typing result", exact: true })).toHaveCount(0);
  await expect(page.getByText("Timer starts with your first character", { exact: true })).toBeVisible();
  await capture.dispatchEvent("compositionend", { bubbles: true, data: "H" });
  await typingClock.evaluate((clock) => { clock.elapsedMs += 1_000; });
  await capture.pressSequentially(target.slice(1));
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("button", { name: "Resume typing", exact: true })).toBeVisible();
  await expect(capture).not.toBeEditable();
  await typingClock.evaluate((clock) => { clock.elapsedMs += 120_000; });
  await page.getByRole("button", { name: "Resume typing", exact: true }).click();
  await capture.press("Enter");
  await expect(page.locator(".fluency-result").getByRole("button", { name: "Return to learning", exact: true })).toBeEnabled();
  const measured = (await readStudio(page))!.fluencyResults[0];
  expect(measured.characterAccuracy).toBe(1);
  expect(measured.activeDurationMs).toBeGreaterThanOrEqual(1_000);
  expect(measured.activeDurationMs).toBeLessThan(10_000);
  expect(Date.parse(measured.completedAt as string) - Date.parse(measured.startedAt as string)).toBeGreaterThan(120_000);
  await typingClock.dispose();
});

test("clipboard paste and dropped text are rejected before timed typing starts", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const capture = await prepareFluency(page);
  await page.evaluate((sentence) => navigator.clipboard.writeText(sentence), target);
  await capture.focus();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+v");
  await expect(capture).toHaveValue("");
  await expect(page.getByRole("status")).toContainText("Paste and text replacement are disabled");
  await capture.dispatchEvent("drop");
  await expect(capture).toHaveValue("");
  expect(await capture.evaluate((input) => input.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true, cancelable: true, inputType: "insertReplacementText", data: "replacement",
  })))).toBe(false);
  await expect(page.getByText("Timer starts with your first character", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel pass", exact: true }).click();
  expect((await readStudio(page))?.fluencyResults ?? []).toEqual([]);
});

test("a failed save retains the measured result and retries the same pass ID exactly once", async ({ page }) => {
  const capture = await prepareFluency(page);
  await page.evaluate(() => {
    const nativePut = IDBObjectStore.prototype.put;
    let shouldFail = true;
    const attempts: unknown[] = [];
    (window as unknown as { fluencySaveAttempts: unknown[] }).fluencySaveAttempts = attempts;
    Object.defineProperty(IDBObjectStore.prototype, "put", {
      configurable: true,
      value: function put(this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
        const value = args[0] as { fluencyResults?: unknown[] };
        if (this.name === "learningStudio" && value.fluencyResults?.length) {
          attempts.push(structuredClone(value.fluencyResults.at(-1)));
          if (shouldFail) { shouldFail = false; throw new DOMException("Forced typing save failure", "QuotaExceededError"); }
        }
        return nativePut.apply(this, args);
      },
    });
  });
  await capture.pressSequentially(target, { delay: 4 });
  await capture.press("Enter");
  await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await expect(page.locator(".fluency-result")).toContainText("100%");
  expect((await readStudio(page))?.fluencyResults ?? []).toEqual([]);
  await page.getByRole("button", { name: "Retry save", exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click(); button.click();
  });
  await expect(page.getByRole("button", { name: "Retry save", exact: true })).toHaveCount(0);
  await expect(page.locator(".fluency-result").getByRole("button", { name: "Return to learning", exact: true })).toBeEnabled();
  const attempts = await page.evaluate(() => (window as unknown as { fluencySaveAttempts: unknown[] }).fluencySaveAttempts);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect((await readStudio(page))?.fluencyResults).toHaveLength(1);
});

test("Escape cancels a typed pass without creating typing evidence", async ({ page }) => {
  const capture = await prepareFluency(page);
  await capture.pressSequentially("Hello");
  await capture.press("Escape");
  await expect(page.getByRole("heading", { name: "Fluency Pass", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Fluency progress", exact: true })).toBeVisible();
  expect((await readStudio(page))?.fluencyResults ?? []).toEqual([]);
});

test("hidden-answer Recall offers a pass only after explicit Answer exposure", async ({ page }) => {
  await page.addInitScript(() => {
    const observation = { retiredCaptureBecameEditable: false };
    (window as unknown as { quickStartTransition: typeof observation }).quickStartTransition = observation;
    let dismissalStarted = false;
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element
        && event.target.closest("button")?.textContent?.trim() === "Skip Quick Start") dismissalStarted = true;
    }, true);
    const observer = new MutationObserver(() => {
      if (!dismissalStarted) return;
      const oldGuide = document.querySelector('[aria-label^="Quick Start, step"]');
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Type the target sentence"]');
      if (oldGuide && input && !input.readOnly) observation.retiredCaptureBecameEditable = true;
      if (!oldGuide && input && !input.readOnly) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true });
  });
  await openReadyApp(page, STARTER_LESSON_URL);
  const skipQuickStart = page.getByRole("button", { name: "Skip Quick Start", exact: true });
  await skipQuickStart.click();
  await expect(page.getByLabel(/Quick Start, step/)).toHaveCount(0);
  const recall = page.getByLabel("Type the target sentence");
  await expect(page.getByLabel("First exposure")).toBeVisible();
  await expect(recall).toBeEditable();
  await expect(recall).toBeFocused();
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")))
    .toMatchObject({ entryPoint: "standard", turn: { phase: "first-exposure" } });
  expect(await page.evaluate(() => (window as unknown as { quickStartTransition: { retiredCaptureBecameEditable: boolean } })
    .quickStartTransition.retiredCaptureBecameEditable)).toBe(false);
  await recall.press("Enter");
  await expect(page.locator(".game-lesson")).toContainText("Guided recall");
  await expect(recall).toBeEditable();
  await expect(page.getByRole("button", { name: "Show answer, shortcut Control plus Semicolon", exact: true })).toBeEnabled();
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.turn)
    .toMatchObject({ phase: "guided-recall" });
  const checkpoint = await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active");
  const turnId = (checkpoint!.turn as { turnId: string }).turnId;
  await expect(page.getByLabel("First exposure")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Optional Fluency Pass", exact: true })).toHaveCount(0);
  await recall.press("Control+Semicolon");
  const optional = page.getByRole("button", { name: "Optional Fluency Pass", exact: true });
  await expect(optional).toBeVisible();
  await expect(optional).toBeEnabled();
  await expect.poll(async () => readUtterLoopIndexedDbRecord(page, "practiceLog", `turn-signal:${turnId}`))
    .toMatchObject({ kind: "signal", cardId: "sf-001", answerWasRevealed: true, signalKinds: ["revealed"] });
  const reviewAfterReveal = await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001");
  expect(reviewAfterReveal).toMatchObject({ cardId: "sf-001", stage: 0 });
  await optional.click();
  await expect(page.getByLabel("Visible typing target")).toHaveText(target);
  const typing = page.getByLabel(captureLabel);
  await typing.pressSequentially(target, { delay: 4 });
  await typing.press("Enter");
  await expect(page.locator(".fluency-result").getByRole("button", { name: "Return to learning", exact: true })).toBeEnabled();
  expect((await readStudio(page))?.fluencyResults[0].source).toBe("revealed");
  expect(await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001")).toEqual(reviewAfterReveal);
});

test("a scope change during First Exposure persistence opens an editable session and ignores the old completion", async ({ page }) => {
  await openReadyApp(page, "/?view=settings");
  await seedUtterLoopIndexedDb(page, { appPreferences: [{ id: "device", theme: "light", speechVoiceUri: null,
    keySoundMuted: true, quickStart: { version: 1, status: "dismissed" } }] });
  const replayUrl = STARTER_LESSON_URL.replace("practiceMode=learn", "practiceMode=replay");
  await page.goto(replayUrl);
  const capture = page.getByLabel("Type the target sentence");
  await expect(capture).toBeEditable();
  await page.evaluate((url) => {
    history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, STARTER_LESSON_URL);
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.scope)
    .toMatchObject({ kind: "lesson", mode: "learn" });
  await expect(page.getByLabel("First exposure")).toBeVisible();
  await expect(capture).toBeEditable();
  await page.evaluate(() => {
    const gate = { held: false, release: () => undefined as void };
    (window as unknown as { firstExposureGate: typeof gate }).firstExposureGate = gate;
    const original = IDBObjectStore.prototype.put;
    let intercepted = false;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === "sentenceLearningStates" && !intercepted) {
        intercepted = true;
        Object.defineProperty(request, "onsuccess", { configurable: true, set(handler: (event: Event) => void) {
          request.addEventListener("success", (event) => {
            gate.held = true;
            gate.release = () => handler.call(request, event);
          }, { once: true });
        } });
      }
      return request;
    };
  });
  await capture.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as unknown as { firstExposureGate: { held: boolean } }).firstExposureGate.held)).toBe(true);
  await page.goBack();
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.scope)
    .toMatchObject({ kind: "lesson", mode: "replay" });
  await expect(capture).toBeEditable();
  await expect(capture).toBeFocused();
  await capture.pressSequentially("Hello");
  await page.evaluate(() => (window as unknown as { firstExposureGate: { release(): void } }).firstExposureGate.release());
  await expect.poll(async () => (await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active"))?.draft).toBe("Hello");
  await expect(capture).toHaveValue("Hello");
  await expect(capture).toBeEditable();
  await expect(page.getByRole("button", { name: "Retry starting recall", exact: true })).toHaveCount(0);
});

test("hidden documents pause typing and keyboard shortcuts require an explicit resume", async ({ page }) => {
  const capture = await prepareFluency(page);
  await capture.pressSequentially("Hello");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Resume typing", exact: true })).toBeVisible();
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(capture).not.toBeEditable();
  await page.getByRole("button", { name: "Resume typing", exact: true }).press("Control+p");
  await expect(capture).toBeEditable();
  await capture.press("Control+p");
  await expect(capture).not.toBeEditable();
  await capture.press("Escape");
  expect((await readStudio(page))?.fluencyResults ?? []).toEqual([]);
});

test("an optional activity load failure offers a working retry without blocking ordinary routes", async ({ page }) => {
  let attempted = 0;
  await page.route("**/src/presentation/components/LearningStudioView.tsx*", async (route) => {
    attempted += 1;
    if (attempted === 1) await route.abort("failed"); else await route.continue();
  });
  await openReadyApp(page, "/?view=settings");
  expect(attempted).toBe(0);
  await page.goto("/?view=practice&studio=home");
  await expectAppReady(page);
  await expect(page.getByRole("heading", { name: "Learning Studio could not be opened", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry loading activity", exact: true }).click();
  await expect(page.locator(".learning-studio").getByRole("heading", { name: "Learning Studio", exact: true })).toBeVisible();
  expect(attempted).toBe(2);
});
