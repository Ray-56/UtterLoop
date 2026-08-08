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

test("system theme follows live operating-system color-scheme changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openReadyApp(page, "/?view=settings");

  await expect(page.getByRole("radio", { name: /System/ })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("reduced motion removes tactile key animation while preserving accepted input", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterStarterRecall(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

  const capture = page.getByLabel("Type the target sentence");
  await capture.press("h");
  await expect(capture).toHaveValue("h");

  const activeKey = page.locator(".finger-guide-active-key");
  await expect(activeKey).toHaveText("H");
  const motion = await activeKey.evaluate((element) => {
    const style = getComputedStyle(element);
    return { animationName: style.animationName, transitionDuration: style.transitionDuration };
  });
  expect(motion.animationName).toBe("none");
  expect(motion.transitionDuration.split(",").every((value) => parseFloat(value) <= 0.001)).toBe(true);
});

test("Finger Guide honors the mobile boundary and keeps the full map optional", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await enterStarterRecall(page);
  const guide = page.locator(".finger-guide");

  await expect(guide).toBeHidden();
  await page.setViewportSize({ width: 701, height: 800 });
  await expect(guide).toBeVisible();
  await expect(page.locator(".finger-guide-compact")).toBeVisible();
  await expect(page.locator(".finger-guide-full")).toHaveCount(0);

  await page.setViewportSize({ width: 900, height: 700 });
  await expect(guide).toBeVisible();
  await page.getByRole("button", { name: "Show full finger guide" }).click();
  await expect(page.locator(".finger-guide-full")).toBeVisible();
  await expect(page.locator('.finger-guide-key[data-code="KeyA"]')).toBeVisible();

  await page.setViewportSize({ width: 900, height: 470 });
  await expect(guide).toBeHidden();
});

test("Finger Guide mode persists from Settings into Practice", async ({ page }) => {
  await openReadyApp(page, "/?view=settings");
  await page.getByRole("radio", { name: /Full/ }).check();
  await expect(page.getByRole("radio", { name: /Full/ })).toBeChecked();

  await enterStarterRecall(page);
  await expect(page.locator(".finger-guide-full")).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse full finger guide" })).toBeVisible();
});

test("Answer and Learning Support share a stable slot without moving the word track", async ({ page }) => {
  await enterStarterRecall(page);
  const capture = page.getByLabel("Type the target sentence");
  const wordStage = page.getByLabel("Sentence word track");
  const supportSlot = page.locator(".practice-support-slot");
  const before = await wordStage.boundingBox();
  await expect(supportSlot).toHaveClass(/is-empty/);
  await expect(page.locator(".learning-support-recall")).toHaveCount(0);
  await expect(page.locator(".sentence-grammar-map")).toHaveCount(0);
  await expect(page.getByText("Hello, my name is Emma.", { exact: true })).toHaveCount(0);

  await capture.press("Control+;");
  const combinedPanel = page.getByLabel("Guided recall · level 4");
  const grammarMap = combinedPanel.locator(".sentence-grammar-map");
  await expect(combinedPanel).toBeVisible();
  await expect(grammarMap).toBeVisible();
  await expect(grammarMap.getByRole("list", { name: "Sentence structure map" })).toBeVisible();
  await expect(grammarMap.getByText("Hello,", { exact: true })).toBeVisible();
  await expect(grammarMap.getByText("/həˈloʊ/", { exact: true })).toBeVisible();
  await expect(grammarMap.getByText("你好", { exact: true })).toBeVisible();
  await expect(grammarMap.getByText("感叹词", { exact: true })).toBeVisible();
  await expect(grammarMap.locator('[aria-label^="问候语:"]')).toHaveCount(1);
  await expect(combinedPanel.locator(".learning-support-body > *")).toHaveCount(1);
  await expect(combinedPanel.locator(".learning-support-actions")).toHaveCount(0);
  await expect(combinedPanel.locator(".learning-support-context")).toHaveCount(0);
  await expect(combinedPanel.locator(".learning-support-pattern")).toHaveCount(0);
  await expect(combinedPanel.locator(".learning-support-keywords")).toHaveCount(0);
  await expect(combinedPanel.locator(".learning-support-target-form")).toHaveCount(0);
  await expect(supportSlot).not.toHaveClass(/is-empty/);
  const revealed = await wordStage.boundingBox();

  await capture.press("Control+;");
  await expect(page.getByText("Answer", { exact: true })).toHaveCount(0);
  await expect(page.locator(".learning-support-recall")).toHaveCount(0);
  await expect(page.locator(".sentence-grammar-map")).toHaveCount(0);
  await expect(supportSlot).toHaveClass(/is-empty/);
  await expect(page.getByText("Hello, my name is Emma.", { exact: true })).toHaveCount(0);
  const hidden = await wordStage.boundingBox();

  expect(revealed?.y).toBeCloseTo(before?.y ?? 0, 0);
  expect(hidden?.y).toBeCloseTo(before?.y ?? 0, 0);

  await page.waitForTimeout(350);
  await page.reload();
  await expectAppReady(page);
  await expect(supportSlot).toHaveClass(/is-empty/);
  await expect(page.locator(".learning-support-recall")).toHaveCount(0);
  await expect(page.locator(".sentence-grammar-map")).toHaveCount(0);
  await expect(page.getByText("Hello, my name is Emma.", { exact: true })).toHaveCount(0);

  await capture.press("Control+;");
  await expect(page.getByLabel("Guided recall · level 4")).toBeVisible();
  await expect(page.locator(".sentence-grammar-map")).toBeVisible();
  await expect(page.locator(".sentence-grammar-map").getByText("Emma.", { exact: true })).toBeVisible();
});

test("keeps the token grammar map inside the Practice surface on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterStarterRecall(page);

  const capture = page.getByLabel("Type the target sentence");
  await capture.press("Control+;");

  const map = page.locator(".sentence-grammar-map");
  const track = map.getByRole("list", { name: "Sentence structure map" });
  await expect(map).toBeVisible();
  await expect(track).toBeVisible();
  await expect(page.getByLabel("Practice shortcuts")).toBeVisible();

  const layout = await page.evaluate(() => {
    const grammarTrack = document.querySelector<HTMLElement>(".sentence-grammar-track");
    const grammarMap = document.querySelector<HTMLElement>(".sentence-grammar-map");
    const firstPartOfSpeech = document.querySelector<HTMLElement>(".sentence-grammar-token-pos");
    const supportSlot = document.querySelector<HTMLElement>(".practice-support-slot");
    return {
      mapBottom: grammarMap?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      pageHorizontalOverflow: Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.body.scrollWidth - document.body.clientWidth,
      ),
      pageVerticalOverflow: Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ) - window.innerHeight,
      partOfSpeechBottom:
        firstPartOfSpeech?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      supportSlotBottom:
        supportSlot?.getBoundingClientRect().bottom ?? Number.NEGATIVE_INFINITY,
      trackClientHeight: grammarTrack?.clientHeight ?? 0,
      trackClientWidth: grammarTrack?.clientWidth ?? 0,
      trackOverflowX: grammarTrack ? getComputedStyle(grammarTrack).overflowX : "",
      trackScrollWidth: grammarTrack?.scrollWidth ?? 0,
    };
  });

  expect(layout.pageHorizontalOverflow).toBeLessThanOrEqual(1);
  expect(layout.pageVerticalOverflow).toBeLessThanOrEqual(1);
  expect(layout.mapBottom).toBeLessThanOrEqual(layout.supportSlotBottom + 1);
  expect(layout.partOfSpeechBottom).toBeLessThanOrEqual(layout.supportSlotBottom + 1);
  expect(layout.trackOverflowX).toBe("auto");
  expect(layout.trackClientHeight).toBeGreaterThanOrEqual(70);
  expect(layout.trackScrollWidth).toBeGreaterThanOrEqual(layout.trackClientWidth);
});

test("the five visible Practice shortcuts execute their real commands", async ({ page }) => {
  await page.addInitScript(() => {
    let speechCalls = 0;
    Object.defineProperty(window, "__utterLoopSpeechCalls", {
      configurable: true,
      get: () => speechCalls,
    });
    Object.defineProperty(window.speechSynthesis, "cancel", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(window.speechSynthesis, "speak", {
      configurable: true,
      value: () => { speechCalls += 1; },
    });
  });
  await enterStarterRecall(page);
  const capture = page.getByLabel("Type the target sentence");
  await capture.focus();

  await page.keyboard.press("Control+Quote");
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __utterLoopSpeechCalls?: number }
  ).__utterLoopSpeechCalls)).toBe(2);
  await page.waitForTimeout(100);
  await expect(page.getByText("Audio learning record saved.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Playing sentence audio twice.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Audio played twice.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".practice-save-attention")).toHaveCount(0);
  await expect(page.locator(".practice-support-slot")).toHaveClass(/is-empty/);

  await page.keyboard.press("Control+n");
  await expect(page.getByRole("button", {
    name: "Remove vocabulary, shortcut Control plus N",
  })).toBeVisible();

  await page.keyboard.press("Control+;");
  await expect(page.getByRole("button", {
    name: "Hide answer, shortcut Control plus Semicolon",
  })).toHaveAttribute("aria-pressed", "true");

  await capture.fill("Hello, my name is Emma.");
  await capture.press("Enter");
  await expect(page.getByRole("button", { name: "Next, shortcut Enter" })).toBeVisible();
  const resultMap = page.getByLabel("Study the sentence").locator(".sentence-grammar-map");
  await expect(resultMap).toBeVisible();
  await expect(page.getByLabel("Study the sentence").locator(".learning-support-body > *"))
    .toHaveCount(1);
  await expect(page.getByLabel("Study the sentence").locator(".learning-support-actions"))
    .toHaveCount(0);

  await page.keyboard.press("Control+m");
  await expect(page.getByText("我是这个班的新同学。", { exact: true })).toBeVisible();
});

test("audio-record save failure stays compact and leaves typing available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window.speechSynthesis, "cancel", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(window.speechSynthesis, "speak", {
      configurable: true,
      value: () => undefined,
    });
  });
  await enterStarterRecall(page);
  await page.evaluate(() => {
    const nativePut = IDBObjectStore.prototype.put;
    let shouldFailAudioWrite = true;

    Object.defineProperty(IDBObjectStore.prototype, "put", {
      configurable: true,
      value: function put(
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (shouldFailAudioWrite && this.name === "practiceLog") {
          shouldFailAudioWrite = false;
          throw new DOMException("Forced audio-record write failure", "UnknownError");
        }
        return nativePut.apply(this, args);
      },
    });
  });

  const capture = page.getByLabel("Type the target sentence");
  await capture.press("Control+Quote");

  const retry = page.getByRole("button", { name: /Retry saving audio record/ });
  await expect(retry).toBeVisible();
  await expect(page.locator(".practice-operation-error")).toHaveCount(0);
  await expect(page.locator(".practice-support-slot")).toHaveClass(/is-empty/);
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(1);

  await capture.press("h");
  await expect(capture).toHaveValue("h");

  await retry.click();
  await expect(retry).toHaveCount(0);
  await expectAppReady(page);
});

test("pause, clear, and skip keyboard commands update the Practice surface", async ({ page }) => {
  await enterStarterRecall(page);
  const capture = page.getByLabel("Type the target sentence");
  await capture.fill("draft");
  await capture.focus();

  await page.keyboard.press("Control+p");
  await expect(page.getByRole("status").filter({ hasText: "Paused" })).toBeVisible();
  await page.keyboard.press("Control+p");
  await expect(page.getByRole("status").filter({ hasText: "Paused" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(capture).toHaveValue("");

  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByText("我是这个班的新同学。", { exact: true })).toBeVisible();
});

test("Escape closes a confirmation dialog and restores focus to its opener", async ({ page }) => {
  await openReadyApp(page, "/?view=settings");
  const opener = page.getByRole("button", { name: "Reset learning progress" });
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Reset learning progress?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await opener.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
});

test("pasting text updates both the native capture and visible word track", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await enterStarterRecall(page);
  await page.evaluate(() => navigator.clipboard.writeText("Hello pasted words"));

  const capture = page.getByLabel("Type the target sentence");
  await capture.focus();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+v");

  await expect(capture).toHaveValue("Hello pasted words");
  await expect(page.getByRole("button", { name: "Edit word 1" })).toContainText("hello");
  await expect(page.getByRole("button", { name: "Edit word 2" })).toContainText("pasted");
});

test("IME composition stays in the draft and composing Enter does not submit", async ({ page }) => {
  await enterStarterRecall(page);
  const capture = page.getByLabel("Type the target sentence");

  await capture.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setValue) throw new Error("Native input value setter is unavailable.");

    input.focus();
    input.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
      data: "",
    }));
    setValue.call(input, "Em");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "Em",
      inputType: "insertCompositionText",
      isComposing: true,
    }));
    input.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      isComposing: true,
      key: "Enter",
    }));
    setValue.call(input, "Emma");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "Emma",
      inputType: "insertCompositionText",
      isComposing: true,
    }));
    input.dispatchEvent(new CompositionEvent("compositionend", {
      bubbles: true,
      data: "Emma",
    }));
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "Emma",
      inputType: "insertText",
      isComposing: false,
    }));
  });

  await expect(capture).toHaveValue("Emma");
  await expect(page.getByRole("button", { name: "Edit word 1" })).toContainText("emma");
  await expect(page.getByRole("button", { name: "Next, shortcut Enter" })).toHaveCount(0);
  await expect(page.getByText("Complete every word slot before checking.", { exact: true })).toHaveCount(0);
});
