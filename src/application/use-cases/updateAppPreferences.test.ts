import { describe, expect, it, vi } from "vitest";
import type { AppPreferences } from "../../domain/backup/UtterLoopFullBackup";
import { updateAppPreferences } from "./updateAppPreferences";

describe("updateAppPreferences", () => {
  it("shallow-merges a patch while preserving untouched persisted fields", async () => {
    const existing: AppPreferences = {
      id: "device",
      theme: "light",
      speechVoiceUri: "voice-en-gb",
      keySoundMuted: true,
      fingerGuideMode: "compact",
      quickStart: { version: 1, status: "completed" },
    };
    const saveAppPreferences = vi.fn(async (_preferences: AppPreferences) => undefined);

    const result = await updateAppPreferences(
      {
        getAppPreferences: async () => existing,
        saveAppPreferences,
      },
      {
        id: "another-device",
        theme: "dark",
        quickStart: null,
      } as unknown as Partial<AppPreferences>,
    );

    expect(result).toEqual({
      id: "device",
      theme: "dark",
      speechVoiceUri: "voice-en-gb",
      keySoundMuted: true,
      fingerGuideMode: "compact",
      quickStart: null,
    });
    expect(saveAppPreferences).toHaveBeenCalledTimes(1);
    expect(saveAppPreferences).toHaveBeenCalledWith(result);
  });

  it("starts from explicit device defaults when no preference row exists", async () => {
    const saveAppPreferences = vi.fn(async (_preferences: AppPreferences) => undefined);

    const result = await updateAppPreferences(
      {
        getAppPreferences: async () => undefined,
        saveAppPreferences,
      },
      { keySoundMuted: true },
    );

    expect(result).toEqual({
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: true,
      fingerGuideMode: "auto",
      quickStart: null,
    });
  });

  it("normalizes an older row before applying and saving a patch", async () => {
    const legacy = {
      id: "device",
      theme: "light",
      speechVoiceUri: null,
      keySoundMuted: false,
      quickStart: null,
    } as unknown as AppPreferences;
    const saveAppPreferences = vi.fn(async (_preferences: AppPreferences) => undefined);

    const result = await updateAppPreferences(
      {
        getAppPreferences: async () => legacy,
        saveAppPreferences,
      },
      { theme: "dark" },
    );

    expect(result).toEqual({
      id: "device",
      theme: "dark",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: null,
    });
    expect(saveAppPreferences).toHaveBeenCalledWith(result);
  });
});
