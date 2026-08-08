import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  expect,
  expectAppReady,
  STARTER_LESSON_URL,
  openReadyApp,
  readUtterLoopIndexedDbRecord,
  seedUtterLoopIndexedDb,
  test,
} from "./fixtures";

async function enterStandardStarterRecall(page: Page): Promise<void> {
  await openReadyApp(page, STARTER_LESSON_URL);
  await expect(page.getByLabel("Quick Start, step 1 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Skip Quick Start" }).click();
  await expect(page.getByLabel(/Quick Start, step/)).toHaveCount(0);
  await page.getByRole("button", { name: "Start recall" }).click();
  await expect(page.getByLabel("First exposure")).toHaveCount(0);
}

const STARTER_COURSE_REPLAY_URL =
  "/?view=practice&scope=course&practiceCourse=starter-foundations";

const PRACTICE_SCOPE_DEEP_LINKS = [
  {
    label: "Lesson",
    path: STARTER_LESSON_URL,
    marker: "Starter Foundations · Meet Someone New",
  },
  {
    label: "Review",
    path: "/?view=practice&scope=review",
    marker: "Review complete",
  },
  {
    label: "Vocabulary",
    path: "/?view=practice&scope=vocabulary",
    marker: "Vocabulary is empty",
  },
  {
    label: "Course",
    path: STARTER_COURSE_REPLAY_URL,
    marker: "Starter Foundations · Meet Someone New",
  },
] as const;

const RESPONSIVE_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
] as const;

const PRACTICE_FIT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
] as const;

const RESPONSIVE_ROUTES = [
  STARTER_LESSON_URL,
  "/?view=courses",
  "/?view=courses&course=starter-foundations",
  "/?view=review",
  "/?view=progress",
  "/?view=settings",
] as const;

async function expectNoHorizontalPageOverflow(page: Page, context: string): Promise<void> {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));

  expect(overflow, `${context} should not overflow horizontally`).toBeLessThanOrEqual(1);
}

test("starts locally without browser errors or failed local assets", async ({ page }) => {
  const diagnostics: string[] = [];
  const localOrigin = "http://127.0.0.1:4173";

  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.push(`console: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(localOrigin)) {
      diagnostics.push(`requestfailed: ${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.url().startsWith(localOrigin) && response.status() >= 400) {
      diagnostics.push(`response: ${response.status()} ${response.url()}`);
    }
  });

  await openReadyApp(page);
  await expect(page.getByRole("heading", { name: "Practice session" })).toHaveClass(/sr-only/);
  await expect(page.locator(".workspace-practice > .workspace-header")).toHaveCount(0);
  expect(diagnostics).toEqual([]);
});

test("keeps the five Practice shortcut hints in the Julebu-compatible order", async ({ page }) => {
  await openReadyApp(page, STARTER_LESSON_URL);

  const shortcutButtons = page
    .getByLabel("Practice shortcuts")
    .getByRole("button");

  await expect(shortcutButtons).toHaveCount(5);
  expect(await shortcutButtons.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  )).toEqual([
    "Play audio, shortcut Control plus Quote",
    "Master, shortcut Control plus M",
    "Save vocabulary, shortcut Control plus N",
    "Check, shortcut Enter",
    "Show answer, shortcut Control plus Semicolon",
  ]);
});

for (const viewport of PRACTICE_FIT_VIEWPORTS) {
  test(`keeps ordinary Practice controls in one ${viewport.width}x${viewport.height} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enterStandardStarterRecall(page);

    const board = page.getByLabel("Sentence recall practice");
    const wordTrack = board.getByLabel("Sentence word track");
    const shortcuts = board.getByLabel("Practice shortcuts");
    await expect(board).toBeVisible();
    await expect(wordTrack).toBeVisible();
    await expect(shortcuts).toBeVisible();

    const fit = await page.evaluate(() => {
      const boardElement = document.querySelector<HTMLElement>('[aria-label="Sentence recall practice"]');
      const shortcutElement = document.querySelector<HTMLElement>('[aria-label="Practice shortcuts"]');
      return {
        boardBottom: boardElement?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
        pageOverflow: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ) - window.innerHeight,
        shortcutBottom: shortcutElement?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      };
    });

    expect(fit.pageOverflow).toBeLessThanOrEqual(1);
    expect(fit.boardBottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(fit.shortcutBottom).toBeLessThanOrEqual(viewport.height + 1);
  });
}

test("keeps First Exposure as one grammar row plus its required start action", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openReadyApp(page, STARTER_LESSON_URL);
  await page.getByRole("button", { name: "Skip Quick Start" }).click();

  const panel = page.getByLabel("First exposure");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".learning-support-body > *")).toHaveCount(1);
  await expect(panel.locator(".sentence-grammar-map")).toBeVisible();
  await expect(panel.locator(".learning-support-context")).toHaveCount(0);
  await expect(panel.locator(".learning-support-pattern")).toHaveCount(0);
  await expect(panel.locator(".learning-support-keywords")).toHaveCount(0);
  await expect(panel.locator(".learning-support-target-form")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Sentence structure map" })).toBeVisible();
  await expect(page.locator(".sentence-grammar-map").getByText("你好", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recall" })).toBeVisible();
  await expect(page.getByLabel("Practice shortcuts")).toBeVisible();
  await expectNoHorizontalPageOverflow(page, "First Exposure grammar map");
  expect(await page.evaluate(() => Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  ) - window.innerHeight)).toBeLessThanOrEqual(1);
});

for (const scope of PRACTICE_SCOPE_DEEP_LINKS) {
  test(`opens a ${scope.label} Practice deep link and Back returns to Courses`, async ({ page }) => {
    await openReadyApp(page, "/?view=courses");
    await openReadyApp(page, scope.path);

    await expect(page).toHaveURL(/view=practice/);
    await expect(page).toHaveURL(new RegExp(`scope=${scope.label.toLowerCase()}`));
    await expect(page.getByText(scope.marker, { exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/view=courses/);
    await expect(page.getByRole("heading", { name: "Courses & learning path" })).toBeVisible();
  });
}

test("Course replay keeps its URL while the breadcrumb crosses Lesson boundaries", async ({ page }) => {
  await openReadyApp(page, STARTER_COURSE_REPLAY_URL);

  await expect(page).toHaveURL(/scope=course/);
  await expect(page).toHaveURL(/practiceCourse=starter-foundations/);
  await expect(page.getByText("Starter Foundations · Meet Someone New", { exact: true })).toBeVisible();

  const skip = page.getByRole("button", {
    name: "Skip sentence, shortcut Shift plus Right Arrow",
  });
  for (let index = 0; index < 5; index += 1) {
    await skip.click();
  }

  await expect(page.getByText(
    "Starter Foundations · A Simple Daily Routine",
    { exact: true },
  )).toBeVisible();
  await expect(page).toHaveURL(/scope=course/);
  await expect(page).not.toHaveURL(/practiceLesson=/);
});

test("sidebar navigation, Course detail, and browser Back preserve the catalog route", async ({ page }) => {
  await openReadyApp(page, STARTER_LESSON_URL);

  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Courses & learning path" })).toBeVisible();
  await expect(page).toHaveURL(/view=courses/);

  await page.getByRole("button", { name: "View course Starter Foundations" }).click();
  await expect(page.getByRole("heading", { name: "Starter Foundations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All courses" })).toBeVisible();
  await expect(page).toHaveURL(/course=starter-foundations/);

  await page.goBack();
  await expect(page.getByRole("heading", { name: /courses?$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "View course Starter Foundations" })).toBeVisible();
  await expect(page).not.toHaveURL(/course=starter-foundations/);
});

test("Review initial DOM never exposes known Starter target sentences", async ({ page }) => {
  await openReadyApp(page, "/?view=review");

  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Hello, my name is Emma.");
  await expect(page.locator("body")).not.toContainText("I'm new to this class.");
  await expect(page.locator("body")).not.toContainText("I live near the river.");
});

test("unsafe stored Prompts stay target-free across Review, Progress, and Practice quarantine", async ({ page }) => {
  await openReadyApp(page, "/?view=courses");
  const storedUnsafeCard = await readUtterLoopIndexedDbRecord(page, "sentenceCards", "sf-001");
  if (!storedUnsafeCard) throw new Error("Starter card sf-001 was not installed.");
  const unsafeTarget = String(storedUnsafeCard.english);
  const unsafePrompt = `Legacy Prompt leaked ${unsafeTarget}`;

  await seedUtterLoopIndexedDb(page, {
    appPreferences: [{
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      quickStart: { version: 1, status: "dismissed" },
    }],
    sentenceCards: [{ ...storedUnsafeCard, prompt: unsafePrompt }],
    sentenceLearningStates: [{
      cardId: "sf-001",
      introducedAt: "2026-07-01T00:00:00.000Z",
      firstPassedAt: "2026-07-01T00:10:00.000Z",
      firstPassSource: "independent-recall",
    }],
    reviewStates: [{
      cardId: "sf-001",
      stage: 1,
      dueAt: "2000-01-01T00:00:00.000Z",
      lastReviewedAt: "2026-07-20T00:00:00.000Z",
      streak: 1,
      lapseCount: 1,
    }],
  });

  await openReadyApp(page, "/?view=review");
  await expect(page.getByText(
    "Prompt unavailable — replace or re-import this content.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByText(
    "Content blocked · replace or re-import this content.",
    { exact: true },
  )).toBeVisible();
  await expect(page.locator("body")).not.toContainText(unsafeTarget);
  await expect(page.locator("body")).not.toContainText(unsafePrompt);

  await openReadyApp(page, "/?view=progress");
  await expect(page.getByText(
    "Prompt unavailable — replace or re-import this content.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByText(
    "Content blocked · replace or re-import this content.",
    { exact: true },
  )).toBeVisible();
  await expect(page.locator("body")).not.toContainText(unsafeTarget);
  await expect(page.locator("body")).not.toContainText(unsafePrompt);

  await openReadyApp(page, "/?view=practice&scope=review");
  await expect(page.getByRole("heading", { name: "Content unavailable" })).toBeVisible();
  await expect(page.getByText(
    "This content cannot be practiced safely; replace or re-import it before trying again.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Browse courses" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(unsafeTarget);
  await expect(page.locator("body")).not.toContainText(unsafePrompt);

  await seedUtterLoopIndexedDb(page, {
    sentenceLearningStates: [{
      cardId: "sf-002",
      introducedAt: "2026-07-01T00:00:00.000Z",
      firstPassedAt: "2026-07-01T00:10:00.000Z",
      firstPassSource: "independent-recall",
    }],
    reviewStates: [{
      cardId: "sf-002",
      stage: 1,
      dueAt: "2000-01-01T00:00:00.000Z",
      lastReviewedAt: "2026-07-20T00:00:00.000Z",
      streak: 1,
      lapseCount: 0,
    }],
  });
  await openReadyApp(page, "/?view=practice&scope=review");

  const quarantineBanner = page.getByRole("status").filter({
    hasText: "1 sentence was quarantined",
  });
  await expect(quarantineBanner).toBeVisible();
  await expect(quarantineBanner).toContainText(
    "Unsafe recall content was removed from this queue without showing its prompt or target.",
  );
  await expect(quarantineBanner).not.toContainText("sf-001");
  await expect(quarantineBanner).not.toContainText(unsafeTarget);
  await expect(quarantineBanner).not.toContainText(unsafePrompt);
  await expect(page.getByText("我是这个班的新同学。", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(unsafeTarget);
  await expect(page.locator("body")).not.toContainText(unsafePrompt);
});

test("a future-due Independent return ends the Lesson round without repeating immediately", async ({ page }) => {
  await openReadyApp(page, "/?view=courses");
  const passedAt = "2026-07-30T00:00:00.000Z";
  await seedUtterLoopIndexedDb(page, {
    appPreferences: [{
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      quickStart: { version: 1, status: "dismissed" },
    }],
    sentenceLearningStates: [
      {
        cardId: "sf-001",
        introducedAt: passedAt,
        acquisitionStatus: "ready-independent",
      },
      ...["sf-002", "sf-003", "sf-005", "sf-004"].map((cardId) => ({
        cardId,
        introducedAt: passedAt,
        firstPassedAt: passedAt,
        firstPassSource: "independent-recall",
      })),
    ],
    reviewStates: [{
      cardId: "sf-001",
      stage: 0,
      dueAt: "2099-01-01T00:00:00.000Z",
      lastReviewedAt: passedAt,
      streak: 0,
      lapseCount: 0,
    }],
  });

  await openReadyApp(page, STARTER_LESSON_URL);
  await expect(page.getByRole("heading", { name: "Round complete" })).toBeVisible();
  await expect(page.getByText(
    "1 sentence still needs another Independent Recall. Review will show it when it is due.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toHaveCount(0);

  await page.getByRole("button", { name: "Review when ready" }).click();
  await expect(page).toHaveURL(/view=review.*reviewCourse=starter-foundations/);
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
});

test("Review management updates mastered and Vocabulary rows with a stable focus handoff", async ({ page }) => {
  await openReadyApp(page);
  await seedUtterLoopIndexedDb(page, {
    reviewStates: [
      {
        cardId: "sf-001",
        stage: 6,
        dueAt: "2026-08-10T00:00:00.000Z",
        lastReviewedAt: "2026-08-01T00:00:00.000Z",
        streak: 6,
        lapseCount: 0,
        learningStatus: "mastered",
      },
      {
        cardId: "sf-002",
        stage: 1,
        dueAt: "2026-08-10T00:00:00.000Z",
        lastReviewedAt: "2026-08-01T00:00:00.000Z",
        streak: 1,
        lapseCount: 0,
        learningStatus: "new",
      },
    ],
    vocabularyEntries: [
      { cardId: "sf-001", savedAt: "2026-08-01T02:00:00.000Z" },
      { cardId: "sf-002", savedAt: "2026-08-01T01:00:00.000Z" },
    ],
  });
  await openReadyApp(page, "/?view=review");

  const mastered = page.getByRole("region", { name: "Mastered sentences · 1" });
  await expect(mastered).toBeVisible();
  await mastered.getByRole("button", { name: "Return sf-001 to new" }).click();
  await expect(page.getByRole("heading", { name: "Mastered sentences · 0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 saved sentences · 2 active" })).toBeVisible();

  const vocabulary = page.getByRole("region", { name: "2 saved sentences · 2 active" });
  await vocabulary.getByRole("button", { name: "Remove sf-001 from Vocabulary" }).click();

  await expect(page.getByRole("heading", { name: "1 saved sentences · 1 active" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice sf-002" })).toBeFocused();
});

test("Progress and full backup keep all 650 events beyond the recent 500 window", async ({ page }) => {
  await openReadyApp(page);
  const newestAt = Date.now();
  const practiceLog = Array.from({ length: 650 }, (_, index) => ({
    kind: "attempt",
    id: `e2e-attempt-${index}`,
    turnId: `e2e-turn-${index}`,
    cardId: "sf-001",
    phase: "independent-recall",
    submissionIndex: 0,
    submittedAt: new Date(newestAt - index * 1_000).toISOString(),
    answer: "Hello, my name is Emma.",
    outcome: "perfect",
    accuracy: 1,
    answerWasRevealed: false,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 1_000,
    supportLevelUsed: 0,
    supportKindsUsed: [],
    receivedCorrection: false,
  }));
  await seedUtterLoopIndexedDb(page, { practiceLog });
  await openReadyApp(page, "/?view=progress");

  const outcomes = page.getByRole("region", { name: "Recall outcomes" });
  await expect(outcomes.getByText("Latest 500 of 650 events", { exact: true })).toBeVisible();
  await expect(outcomes.getByText("Retrieval checks").locator("..")).toContainText("650");
  await expect(outcomes.getByText("Perfect recalls").locator("..")).toContainText("650");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const backup = page.getByRole("region", { name: "Full local backup" });
  const downloadPromise = page.waitForEvent("download");
  await backup.getByRole("button", { name: "Export full backup" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath!, "utf8")) as {
    learning: { practiceLog: unknown[] };
  };
  expect(exported.learning.practiceLog).toHaveLength(650);
});

test("a Progress weak card opens Focused voluntary practice without changing Review scheduling", async ({ page }) => {
  await openReadyApp(page, "/?view=courses");
  const dueAt = "2099-05-10T12:00:00.000Z";
  await seedUtterLoopIndexedDb(page, {
    sentenceLearningStates: [{
      cardId: "sf-001",
      introducedAt: "2026-07-01T00:00:00.000Z",
      firstPassedAt: "2026-07-01T00:10:00.000Z",
      firstPassSource: "independent-recall",
    }],
    reviewStates: [{
      cardId: "sf-001",
      stage: 3,
      dueAt,
      lastReviewedAt: "2026-07-20T00:00:00.000Z",
      streak: 2,
      lapseCount: 1,
    }],
  });
  await openReadyApp(page, "/?view=progress");

  const weakCard = page.getByRole("listitem").filter({ hasText: "你好，我叫艾玛。" });
  await expect(weakCard).toBeVisible();
  await weakCard.getByRole("button", { name: "Practice this card" }).click();

  await expect(page).toHaveURL(/view=practice.*scope=focused.*practiceCard=sf-001/);
  const board = page.getByLabel("Sentence recall practice");
  await expect(board.getByText("Focused Practice", { exact: true })).toBeVisible();
  await expect(board.getByText("Voluntary practice", { exact: true }).first()).toBeVisible();

  const capture = page.getByLabel("Type the target sentence");
  await capture.fill("Hello, my name is Emma.");
  await capture.press("Enter");
  await expect(page.getByRole("button", { name: "Next, shortcut Enter" })).toBeVisible();

  const persistedReview = await readUtterLoopIndexedDbRecord(page, "reviewStates", "sf-001");
  expect(persistedReview).toMatchObject({ stage: 3, dueAt });
});

test("Progress presents strict weekly retention and its Beta Inspector coverage", async ({ page }) => {
  await openReadyApp(page, "/?view=courses");
  const now = Date.now();
  const submittedAt = new Date(now - 2 * 60_000).toISOString();
  const endedAt = new Date(now - 60_000).toISOString();
  const scheduledReviewDueAt = new Date(now - 60 * 60_000).toISOString();
  const measurementEpoch = new Date(now - 8 * 24 * 60 * 60_000).toISOString();
  const sessionId = "e2e-retention-session";
  const roundId = "e2e-retention-round";
  const occurrenceId = "e2e-retention-occurrence";

  await seedUtterLoopIndexedDb(page, {
    appMetadata: [{ id: "device", measurementEpoch }],
    practiceLog: [{
      kind: "attempt",
      id: "turn-attempt:e2e-retention:0",
      turnId: "e2e-retention",
      cardId: "sf-001",
      phase: "review-recall",
      submissionIndex: 0,
      submittedAt,
      answer: "Hello, my name is Emma.",
      outcome: "perfect",
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 2_000,
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
      context: {
        sessionId,
        roundId,
        occurrenceId,
        queueReason: "due-review",
        scheduledReviewDueAt,
      },
    }],
    practiceSessionEvidence: [{
      schemaVersion: 1,
      sessionId,
      roundId,
      scope: { kind: "review" },
      entryPoint: "standard",
      startedAt: new Date(now - 4 * 60_000).toISOString(),
      engagedAt: new Date(now - 3 * 60_000).toISOString(),
      endedAt,
      terminal: { kind: "completed", reason: "scope-complete" },
      round: {
        initialOccurrenceIds: [occurrenceId],
        scheduledOccurrenceIds: [occurrenceId],
        attemptedOccurrenceIds: [occurrenceId],
        completedOccurrenceIds: [occurrenceId],
        skippedOccurrenceIds: [],
        remainingOccurrenceIds: [],
        dueReviewScheduledOccurrenceIds: [occurrenceId],
        dueReviewCompletedOccurrenceIds: [occurrenceId],
        introducedCardIds: [],
        firstPassCardIds: [],
        requeue: {
          insertedReturnOccurrenceIds: [],
          deferredNoRoomCardIds: [],
          capReachedCardIds: [],
        },
      },
    }],
  });
  await openReadyApp(page, "/?view=progress");

  const weekly = page.getByText(
    "Weekly retained independent sentences",
    { exact: true },
  ).locator("..");
  await expect(weekly.locator("strong")).toHaveText("1");
  await expect(weekly.locator("small")).toHaveText("1 of 1 eligible sentences");

  await page.getByText("Beta Inspector", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evidence coverage" })).toBeVisible();
  const weeklyCoverage = page.getByText("Weekly retained coverage", { exact: true }).locator("..");
  await expect(weeklyCoverage).toContainText("1 / 1 contextual · 0 legacy · 0 pre-context");
});

test("switches between explicit light and dark themes", async ({ page }) => {
  await openReadyApp(page, "/?view=settings");

  await page.getByRole("radio", { name: /Light/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: /Light/ })).toBeChecked();

  await page.getByRole("radio", { name: /Dark/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: /Dark/ })).toBeChecked();
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} theme has no horizontal overflow across supported viewports`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openReadyApp(page, "/?view=settings");

    const themeRadio = page.getByRole("radio", {
      name: theme === "light" ? /Light/ : /Dark/,
    });
    await themeRadio.check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(themeRadio).toBeEnabled();

    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const route of RESPONSIVE_ROUTES) {
        await openReadyApp(page, route);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectNoHorizontalPageOverflow(
          page,
          `${theme} ${viewport.width}px ${route}`,
        );
      }
    }
  });
}

test("Reset learning progress can be cancelled and restores focus to its opener", async ({ page }) => {
  await openReadyApp(page, "/?view=settings");

  const reset = page.getByRole("button", { name: "Reset learning progress" });
  await reset.click();

  const dialog = page.getByRole("dialog", { name: "Reset learning progress?" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Keep courses, Vocabulary, and device preferences");
  await expect(cancel).toBeFocused();

  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(reset).toBeFocused();
});

test("Full backup selection is summarized and requires replacement confirmation", async ({ page }) => {
  await openReadyApp(page, "/?view=settings");

  const backup = page.getByRole("region", { name: "Full local backup" });
  const downloadPromise = page.waitForEvent("download");
  await backup.getByRole("button", { name: "Export full backup" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(downloadPath).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/^utterloop-full-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const fileName = download.suggestedFilename();
  await backup.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/json",
    buffer: await readFile(downloadPath!),
  });

  await expect(backup.getByText(`${fileName} is valid and ready to review.`, { exact: true })).toBeVisible();
  await expect(backup.getByText(fileName, { exact: true })).toBeVisible();
  await expect(backup.getByText("Course", { exact: true })).toBeVisible();
  await expect(backup.getByText("Card", { exact: true })).toBeVisible();

  const reviewReplacement = backup.getByRole("button", { name: "Review replacement" });
  await reviewReplacement.click();
  const dialog = page.getByRole("dialog", { name: "Restore full backup?" });
  await expect(dialog).toContainText(fileName);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reviewReplacement).toBeFocused();

  await reviewReplacement.click();
  await dialog.getByRole("button", { name: "Replace with backup" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(
    "Restored 6 courses, 120 cards, and 0 learning events.",
    { exact: true },
  )).toBeVisible();
});

test("restores the same Practice sentence, draft, and caret after refresh", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) => (
      nativeSetInterval(handler, timeout === 1_000 ? 50 : timeout, ...arguments_)
    )) as typeof window.setInterval;
  });
  await enterStandardStarterRecall(page);

  const capture = page.getByLabel("Type the target sentence");
  const draft = "Hello Em";
  const caret = 5;
  const scopeUrl = page.url();

  await expect(page.getByText("你好，我叫艾玛。", { exact: true })).toBeVisible();
  await capture.focus();
  await page.keyboard.type(draft);
  await expect(capture).toHaveValue(draft);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => capture.evaluate((element) => [
    (element as HTMLInputElement).selectionStart,
    (element as HTMLInputElement).selectionEnd,
  ])).toEqual([caret, caret]);

  // Stress the session timer while the 200 ms draft checkpoint debounce is
  // pending. Unrelated timer renders must not cancel the draft save.
  await page.waitForTimeout(350);
  const persistedCheckpoint = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("utterloop-courses");
      request.onerror = () => reject(request.error ?? new Error("Could not open the test database."));
      request.onsuccess = () => resolve(request.result);
    });

    try {
      return await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = database
          .transaction("practiceSessionCheckpoints", "readonly")
          .objectStore("practiceSessionCheckpoints")
          .get("active");
        request.onerror = () => reject(request.error ?? new Error("Could not read the Practice checkpoint."));
        request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
      });
    } finally {
      database.close();
    }
  });
  expect(persistedCheckpoint).toMatchObject({
    draft,
    selectionStart: caret,
    selectionEnd: caret,
  });
  await page.reload();
  await expectAppReady(page);

  await expect(page).toHaveURL(scopeUrl);
  await expect(page.getByText("你好，我叫艾玛。", { exact: true })).toBeVisible();
  await expect(capture).toHaveValue(draft);
  await expect(page.getByText(
    "Practice restored. Your draft and recall turn are ready.",
    { exact: true },
  )).toBeVisible();
  await expect.poll(() => capture.evaluate((element) => [
    (element as HTMLInputElement).selectionStart,
    (element as HTMLInputElement).selectionEnd,
  ])).toEqual([caret, caret]);
});

test("Quick Start restores its step, sentence, and draft, then wins root routing over due Review", async ({ page }) => {
  await openReadyApp(page, "/?view=courses");
  await seedUtterLoopIndexedDb(page, {
    reviewStates: [{
      cardId: "sf-010",
      stage: 1,
      dueAt: "2000-01-01T00:00:00.000Z",
      lastReviewedAt: "2000-01-01T00:00:00.000Z",
      streak: 1,
      lapseCount: 0,
    }],
  });
  await openReadyApp(page, STARTER_LESSON_URL);

  await expect(page.getByLabel("Quick Start, step 1 of 6")).toBeVisible();
  await expect(page.getByLabel("First exposure")).toBeVisible();
  await page.getByRole("button", { name: "Start recall" }).click();

  await page.reload();
  await expectAppReady(page);

  await expect(page.getByLabel("Quick Start, step 2 of 6")).toBeVisible();
  await expect(page.getByLabel("Quick Start, step 1 of 6")).toHaveCount(0);
  await expect(page.getByLabel("First exposure")).toHaveCount(0);
  await expect(page.getByText("Try the recall", { exact: true })).toBeVisible();
  await expect(page.locator(".practice-support-slot")).toHaveClass(/is-empty/);
  await expect(page.locator(".learning-support-recall")).toHaveCount(0);
  await expect(page.getByText("Hello, my name is Emma.", { exact: true })).toHaveCount(0);
  const capture = page.getByLabel("Type the target sentence");
  const draft = "Hello Em";
  await capture.fill(draft);
  await expect.poll(async () => (
    await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")
  )?.draft).toBe(draft);

  await page.reload();
  await expectAppReady(page);
  await expect(page.getByLabel("Quick Start, step 2 of 6")).toBeVisible();
  await expect(page.getByText("你好，我叫艾玛。", { exact: true })).toBeVisible();
  await expect(capture).toHaveValue(draft);
  await expect(page.getByText(
    "Practice restored. Your draft and recall turn are ready.",
    { exact: true },
  )).toBeVisible();

  await openReadyApp(page, "/");
  await expect(page).toHaveURL(/view=practice.*scope=lesson/);
  await expect(page).toHaveURL(/practiceCourse=starter-foundations/);
  await expect(page).toHaveURL(/practiceLesson=sf-u1-l1/);
  await expect(page).not.toHaveURL(/scope=review/);
  await expect(page.getByLabel("Quick Start, step 2 of 6")).toBeVisible();
  await expect(page.getByText("你好，我叫艾玛。", { exact: true })).toBeVisible();
  await expect(capture).toHaveValue(draft);
});

test("an incomplete Focused Practice link stays unavailable instead of choosing active or due work", async ({ page }) => {
  await enterStandardStarterRecall(page);
  await expect.poll(async () => (
    await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")
  )?.schemaVersion).toBe(2);
  await openReadyApp(page, "/?view=courses");
  const activeCheckpoint = await readUtterLoopIndexedDbRecord(
    page,
    "practiceSessionCheckpoints",
    "active",
  );
  if (!activeCheckpoint) throw new Error("Expected a durable active Practice checkpoint.");

  await seedUtterLoopIndexedDb(page, {
    sentenceLearningStates: [{
      cardId: "sf-010",
      introducedAt: "2026-06-01T00:00:00.000Z",
      firstPassedAt: "2026-06-01T00:10:00.000Z",
      firstPassSource: "independent-recall",
    }],
    reviewStates: [{
      cardId: "sf-010",
      stage: 1,
      dueAt: "2000-01-01T00:00:00.000Z",
      lastReviewedAt: "2026-06-01T00:10:00.000Z",
      streak: 1,
      lapseCount: 0,
    }],
  });

  await openReadyApp(page, "/?view=practice&scope=focused");

  await expect(page).toHaveURL(/\?view=practice&scope=focused$/);
  await expect(page.getByRole("heading", {
    name: "Practice link is no longer available",
  })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue recommended" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Browse courses" })).toBeVisible();
  await expect(page.getByLabel("Sentence recall practice")).toHaveCount(0);
  await expect(page).not.toHaveURL(/scope=review|scope=lesson/);

  const unchangedCheckpoint = await readUtterLoopIndexedDbRecord(
    page,
    "practiceSessionCheckpoints",
    "active",
  );
  expect(unchangedCheckpoint?.sessionId).toBe(activeCheckpoint.sessionId);
});

test("a stale active checkpoint cannot outrank due Review on the bare root", async ({ page }) => {
  await enterStandardStarterRecall(page);
  await expect.poll(async () => (
    await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")
  )?.schemaVersion).toBe(2);
  await openReadyApp(page, "/?view=courses");
  const checkpoint = await readUtterLoopIndexedDbRecord(
    page,
    "practiceSessionCheckpoints",
    "active",
  );
  if (!checkpoint) throw new Error("Expected a durable active Practice checkpoint.");

  const staleUpdatedAt = Date.now() - 31 * 24 * 60 * 60_000;
  await seedUtterLoopIndexedDb(page, {
    practiceSessionCheckpoints: [{
      ...checkpoint,
      startedAt: new Date(staleUpdatedAt - 2 * 60_000).toISOString(),
      engagedAt: new Date(staleUpdatedAt - 60_000).toISOString(),
      updatedAt: new Date(staleUpdatedAt).toISOString(),
    }],
    sentenceLearningStates: [{
      cardId: "sf-010",
      introducedAt: "2026-06-01T00:00:00.000Z",
      firstPassedAt: "2026-06-01T00:10:00.000Z",
      firstPassSource: "independent-recall",
    }],
    reviewStates: [{
      cardId: "sf-010",
      stage: 1,
      dueAt: "2000-01-01T00:00:00.000Z",
      lastReviewedAt: "2026-06-01T00:10:00.000Z",
      streak: 1,
      lapseCount: 0,
    }],
  });

  await openReadyApp(page, "/");

  await expect(page).toHaveURL(/view=practice.*scope=review/);
  await expect(page).not.toHaveURL(/scope=lesson/);
  const board = page.getByLabel("Sentence recall practice");
  await expect(board.getByText("Review", { exact: true })).toBeVisible();
  await expect(board.getByText("Review recall", { exact: true }).first()).toBeVisible();
  await expect.poll(async () => (
    await readUtterLoopIndexedDbRecord(page, "practiceSessionCheckpoints", "active")
  )?.scope).toEqual({ kind: "review" });
});

test("root Practice defaults to due Review after Quick Start is dismissed", async ({ page }) => {
  await openReadyApp(page, "/?view=courses");
  await seedUtterLoopIndexedDb(page, {
    appPreferences: [{
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      quickStart: { version: 1, status: "dismissed" },
    }],
    reviewStates: [{
      cardId: "sf-001",
      stage: 1,
      dueAt: "2000-01-01T00:00:00.000Z",
      lastReviewedAt: "2000-01-01T00:00:00.000Z",
      streak: 1,
      lapseCount: 0,
    }],
    sentenceLearningStates: [{
      cardId: "sf-001",
      introducedAt: "1999-12-01T00:00:00.000Z",
      firstPassedAt: "1999-12-01T00:10:00.000Z",
      firstPassSource: "independent-recall",
    }],
  });

  await openReadyApp(page, "/");

  await expect(page).toHaveURL(/view=practice.*scope=review/);
  await expect(page.getByLabel(/Quick Start, step/)).toHaveCount(0);
  const board = page.getByLabel("Sentence recall practice");
  await expect(board.getByText("Review", { exact: true })).toBeVisible();
  await expect(board.getByText("Review recall", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("你好，我叫艾玛。", { exact: true })).toBeVisible();
});

test("Start over asks before discarding a Practice draft", async ({ page }) => {
  await enterStandardStarterRecall(page);

  const capture = page.getByLabel("Type the target sentence");
  const draft = "Hello draft";
  const startOver = page.getByRole("button", { name: "Start this Practice round over" });

  await capture.focus();
  await page.keyboard.type(draft);
  await expect(capture).toHaveValue(draft);
  await startOver.click();

  const dialog = page.getByRole("dialog", { name: "Start this Practice round over?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("This clears the current draft");
  await expect(capture).toHaveValue(draft);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(capture).toHaveValue(draft);

  await startOver.click();
  await dialog.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(capture).toHaveValue("");
  await expect(page.getByText(
    "Practice restarted from the first sentence.",
    { exact: true },
  )).toBeVisible();
});
