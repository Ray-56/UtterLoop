import { describe, expect, it, vi } from "vitest";
import type {
  AppPreferences,
  LegacyAppPreferencesRow,
} from "../../../domain/backup/UtterLoopFullBackup";
import {
  LEGACY_KEY_SOUND_KEY,
  LEGACY_PERSONALIZATION_KEY,
  LEGACY_QUICK_START_KEY,
  migrateLegacyAppPreferences,
} from "./migrateLegacyAppPreferences";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
}

describe("legacy AppPreferences migration", () => {
  it("validates recognized values, writes one device row, then removes only recognized keys", async () => {
    const storage = new MemoryStorage();
    storage.values.set(LEGACY_PERSONALIZATION_KEY, JSON.stringify({
      version: 1,
      theme: "dark",
      speechVoiceUri: "voice-1",
    }));
    storage.values.set(LEGACY_KEY_SOUND_KEY, "off");
    storage.values.set(LEGACY_QUICK_START_KEY, JSON.stringify({ version: 1, status: "completed" }));
    storage.values.set("unrelated", "keep");
    const save = vi.fn<(preferences: AppPreferences) => Promise<void>>().mockResolvedValue();

    await migrateLegacyAppPreferences({ storage, load: async () => undefined, save });

    expect(save).toHaveBeenCalledWith({
      id: "device",
      theme: "dark",
      speechVoiceUri: "voice-1",
      keySoundMuted: true,
      fingerGuideMode: "auto",
      quickStart: { version: 1, status: "completed" },
    });
    expect([...storage.values]).toEqual([["unrelated", "keep"]]);
  });

  it("leaves every legacy key readable when the durable write fails", async () => {
    const storage = new MemoryStorage();
    storage.values.set(LEGACY_PERSONALIZATION_KEY, JSON.stringify({ version: 1, theme: "light" }));
    storage.values.set(LEGACY_KEY_SOUND_KEY, "on");

    await expect(migrateLegacyAppPreferences({
      storage,
      load: async () => undefined,
      save: async () => { throw new Error("IndexedDB unavailable"); },
    })).rejects.toThrow("IndexedDB unavailable");

    expect(storage.getItem(LEGACY_PERSONALIZATION_KEY)).not.toBeNull();
    expect(storage.getItem(LEGACY_KEY_SOUND_KEY)).toBe("on");
  });

  it("is idempotent and finishes cleanup when a device row already exists", async () => {
    const storage = new MemoryStorage();
    storage.values.set(LEGACY_KEY_SOUND_KEY, "off");
    const existing: AppPreferences = {
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: null,
    };
    const save = vi.fn<(preferences: AppPreferences) => Promise<void>>();

    await migrateLegacyAppPreferences({ storage, load: async () => existing, save });
    await migrateLegacyAppPreferences({ storage, load: async () => existing, save });

    expect(save).not.toHaveBeenCalled();
    expect(storage.getItem(LEGACY_KEY_SOUND_KEY)).toBeNull();
  });

  it("heals an existing durable row that predates Finger Guide modes", async () => {
    const storage = new MemoryStorage();
    const existing: LegacyAppPreferencesRow = {
      id: "device",
      theme: "dark",
      speechVoiceUri: null,
      keySoundMuted: true,
      quickStart: null,
    };
    const save = vi.fn<(preferences: AppPreferences) => Promise<void>>().mockResolvedValue();

    await expect(migrateLegacyAppPreferences({
      storage,
      load: async () => existing,
      save,
    })).resolves.toEqual({ ...existing, fingerGuideMode: "auto" });

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ ...existing, fingerGuideMode: "auto" });
  });

  it("falls back per field for malformed recognized values", async () => {
    const storage = new MemoryStorage();
    storage.values.set(LEGACY_PERSONALIZATION_KEY, '{"version":1,"theme":"neon","speechVoiceUri":42}');
    storage.values.set(LEGACY_KEY_SOUND_KEY, "maybe");
    storage.values.set(LEGACY_QUICK_START_KEY, '{"version":2,"status":"completed"}');
    const save = vi.fn<(preferences: AppPreferences) => Promise<void>>().mockResolvedValue();

    await migrateLegacyAppPreferences({ storage, load: async () => undefined, save });

    expect(save).toHaveBeenCalledWith({
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: null,
    });
  });

  it("does not import fields from an unknown personalization version", async () => {
    const storage = new MemoryStorage();
    storage.values.set(LEGACY_PERSONALIZATION_KEY, JSON.stringify({
      version: 2,
      theme: "dark",
      speechVoiceUri: "voice-from-future",
    }));
    const save = vi.fn<(preferences: AppPreferences) => Promise<void>>().mockResolvedValue();

    await migrateLegacyAppPreferences({ storage, load: async () => undefined, save });

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      theme: "system",
      speechVoiceUri: null,
    }));
  });
});
