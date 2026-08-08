import { describe, expect, it } from "vitest";
import {
  createPersonalizationSaveState,
  transitionPersonalizationSaveState,
} from "./usePersonalizationPreferences";

describe("personalization preference saving", () => {
  it("restores the latest persisted preferences and keeps the failed command for retry", () => {
    const initial = createPersonalizationSaveState({
      fingerGuideMode: "auto",
      theme: "light",
      speechVoiceUri: "voice-a",
    });
    const saving = transitionPersonalizationSaveState(initial, {
      type: "save-started",
      update: { theme: "dark" },
    });
    const withNewerPersistedVoice = transitionPersonalizationSaveState(saving, {
      type: "durable-preferences-received",
      preferences: { fingerGuideMode: "auto", theme: "light", speechVoiceUri: "voice-b" },
    });

    const failed = transitionPersonalizationSaveState(withNewerPersistedVoice, {
      type: "save-failed",
      error: "Theme could not be saved. Your previous setting was restored.",
    });

    expect(failed.preferences).toEqual({ fingerGuideMode: "auto", theme: "light", speechVoiceUri: "voice-b" });
    expect(failed.retryUpdate).toEqual({ theme: "dark" });
    expect(failed.error).toBe("Theme could not be saved. Your previous setting was restored.");
    expect(failed.pendingUpdate).toBeNull();
  });

  it("commits a retried command only after persistence succeeds", () => {
    const initial = createPersonalizationSaveState({
      fingerGuideMode: "auto",
      theme: "system",
      speechVoiceUri: null,
    });
    const firstSave = transitionPersonalizationSaveState(initial, {
      type: "save-started",
      update: { speechVoiceUri: "voice-b" },
    });
    const failed = transitionPersonalizationSaveState(firstSave, {
      type: "save-failed",
      error: "Pronunciation voice could not be saved.",
    });
    const retrying = transitionPersonalizationSaveState(failed, {
      type: "save-started",
      update: failed.retryUpdate!,
    });

    const saved = transitionPersonalizationSaveState(retrying, {
      type: "save-succeeded",
      preferences: { fingerGuideMode: "auto", theme: "system", speechVoiceUri: "voice-b" },
    });

    expect(saved.preferences).toEqual({
      fingerGuideMode: "auto",
      theme: "system",
      speechVoiceUri: "voice-b",
    });
    expect(saved.persistedPreferences).toEqual(saved.preferences);
    expect(saved.pendingUpdate).toBeNull();
    expect(saved.retryUpdate).toBeNull();
    expect(saved.error).toBeNull();
  });
});
