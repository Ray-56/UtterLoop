import { test, expect, openReadyApp, expectAppReady, seedUtterLoopIndexedDb } from "./fixtures";

test("a failed Studio check clears only mismatches and keeps its retry supported", async ({ page }) => {
  await openReadyApp(page, "/?view=practice&studio=family");
  await page.getByRole("button", { name: "Learn 3 variants", exact: true }).first().click();
  await page.getByRole("button", { name: "Start recall", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await input.focus(); await input.pressSequentially("Could you send me a link?"); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Check the reference");
  await page.locator(".studio-primary-key").click();
  await expect(page.locator(".studio-answer")).toBeEmpty();
  await expect(page.locator(".studio-word-matched")).toHaveCount(4);
  await input.pressSequentially("the"); await input.press("Space"); await input.pressSequentially("file"); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Expression recalled.");
  await expect(page.locator(".studio-result")).toContainText("Supported or repeated");
});

test("a delayed retry frame cannot replace characters already typed into a cleared slot", async ({ page }) => {
  await openReadyApp(page, "/?view=practice&studio=family");
  await page.getByRole("button", { name: "Learn 3 variants", exact: true }).first().click();
  await page.getByRole("button", { name: "Start recall", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await expect(input).toBeEditable();
  await input.pressSequentially("Could you send me a link?"); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Check the reference");
  await page.evaluate(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let id = 0;
    window.requestAnimationFrame = (callback) => { pending.set(--id, callback); return id; };
    window.cancelAnimationFrame = (frame) => { if (!pending.delete(frame)) cancel(frame); };
    window.addEventListener("release-studio-frames", () => {
      window.requestAnimationFrame = request; window.cancelAnimationFrame = cancel;
      for (const callback of pending.values()) callback(performance.now());
      pending.clear();
    }, { once: true });
  });
  await page.locator(".studio-primary-key").click();
  await expect(input).toBeEditable();
  await input.pressSequentially("t");
  await page.evaluate(() => window.dispatchEvent(new Event("release-studio-frames")));
  await input.pressSequentially("he");
  await expect(input).toHaveValue("could you send me the \u2063");
  await input.press("Space"); await input.pressSequentially("file"); await input.press("Enter");
  await expect(page.locator(".studio-result")).toContainText("Expression recalled.");
  await expect(page.locator(".studio-result")).toContainText("Supported or repeated");
});

test("Studio retains a visible direct-input stage and five ordered hints across themes and viewports", async ({ page }, testInfo) => {
  await openReadyApp(page, "/?view=settings");
  await seedUtterLoopIndexedDb(page, { appPreferences: [{ id: "device", theme: "light", speechVoiceUri: null,
    keySoundMuted: true, fingerGuideMode: "auto", quickStart: null }] });
  await page.goto("/?view=practice&studio=home"); await expectAppReady(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".learning-studio").getByRole("heading", { name: "Learning Studio", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("studio-home-1440.png") });
  await page.goto("/?view=practice&studio=family"); await expectAppReady(page);
  await page.getByRole("button", { name: "Learn 3 variants", exact: true }).first().click();
  await page.getByRole("button", { name: "Start recall", exact: true }).click();
  const input = page.getByLabel("Studio sentence input", { exact: true });
  await input.focus(); await input.pressSequentially("Could you");
  await input.press("Control+Slash");
  await expect(page.locator(".studio-answer")).toBeEmpty();
  await input.press("Control+p");
  await expect(input).not.toBeEditable();
  await page.keyboard.press("Control+Semicolon");
  await expect(page.locator(".studio-answer")).toBeEmpty();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(input).toBeEditable();
  const viewports = [{ width: 375, height: 812 }, { width: 768, height: 1024 },
    { width: 1024, height: 768 }, { width: 1440, height: 1000 }, { width: 844, height: 390 }];
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("radio", { name: /Dark/ }).check();
      await page.goto("/?view=practice&studio=family"); await expectAppReady(page);
      await page.getByRole("button", { name: "Resume Studio session", exact: true }).click();
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const shortcuts = page.getByLabel("Practice shortcuts", { exact: true });
      await expect(shortcuts.getByRole("button")).toHaveCount(5);
      expect(await shortcuts.locator("kbd").allTextContents()).toEqual(["Ctrl+'", "Ctrl+M", "Ctrl+N", "Enter", "Ctrl+;"]);
      const bounds = await shortcuts.boundingBox(); expect(bounds).not.toBeNull();
      expect(bounds!.y + bounds!.height, `${theme} ${viewport.width}×${viewport.height} shortcut row`).toBeLessThanOrEqual(viewport.height + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const inputBounds = await input.boundingBox();
      expect(inputBounds!.width).toBeLessThanOrEqual(1); expect(inputBounds!.height).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`studio-${theme}-${viewport.width}x${viewport.height}.png`) });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" }); await input.focus(); await input.press("Space");
  await expect(page.locator(".studio-word-active").first()).toHaveCSS("animation-name", "none");
});
