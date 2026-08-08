import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONALIZATION_PREFERENCES,
  listEnglishSpeechVoices,
  parsePersonalizationPreferences,
  readPersonalizationPreferences,
  resolvePreferredSpeechVoice,
  resolveEffectiveTheme,
  serializePersonalizationPreferences,
  writePersonalizationPreferences,
} from "./personalizationPreferences";

describe("personalization preferences", () => {
  it("round-trips versioned preferences and falls back safely for unreadable values", () => {
    const preferences = {
      fingerGuideMode: "full",
      theme: "dark",
      speechVoiceUri: "com.example.english-voice",
    } as const;

    expect(serializePersonalizationPreferences(preferences)).toBe(
      '{"version":1,"fingerGuideMode":"full","theme":"dark","speechVoiceUri":"com.example.english-voice"}',
    );
    expect(parsePersonalizationPreferences(serializePersonalizationPreferences(preferences))).toEqual(preferences);
    expect(parsePersonalizationPreferences(null)).toEqual(DEFAULT_PERSONALIZATION_PREFERENCES);
    expect(parsePersonalizationPreferences("not json")).toEqual(DEFAULT_PERSONALIZATION_PREFERENCES);
    expect(parsePersonalizationPreferences('{"version":2,"theme":"dark"}')).toEqual(
      DEFAULT_PERSONALIZATION_PREFERENCES,
    );
  });

  it("keeps valid fields when another stored preference is damaged", () => {
    expect(
      parsePersonalizationPreferences('{"version":1,"theme":"dark","speechVoiceUri":42}'),
    ).toEqual({ fingerGuideMode: "auto", theme: "dark", speechVoiceUri: null });
    expect(
      parsePersonalizationPreferences('{"version":1,"theme":"neon","speechVoiceUri":"voice-1"}'),
    ).toEqual({ fingerGuideMode: "auto", theme: "system", speechVoiceUri: "voice-1" });
  });

  it("uses the system color scheme only when the theme preference follows the system", () => {
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
    expect(resolveEffectiveTheme("system", false)).toBe("light");
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
  });

  it("persists through a key-value store and tolerates unavailable browser storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const preferences = {
      fingerGuideMode: "compact",
      theme: "light",
      speechVoiceUri: "voice-1",
    } as const;

    writePersonalizationPreferences(storage, preferences);
    expect(readPersonalizationPreferences(storage)).toEqual(preferences);

    const unavailableStorage = {
      getItem: () => {
        throw new Error("Storage is blocked");
      },
      setItem: () => {
        throw new Error("Storage is blocked");
      },
    };

    expect(readPersonalizationPreferences(unavailableStorage)).toEqual(DEFAULT_PERSONALIZATION_PREFERENCES);
    expect(() => writePersonalizationPreferences(unavailableStorage, preferences)).not.toThrow();
  });

  it("lists English voices with the system default first and resolves a saved voice safely", () => {
    const voices = [
      { voiceURI: "fr-1", name: "Amélie", lang: "fr-FR", default: false },
      { voiceURI: "en-gb-1", name: "Serena", lang: "en-GB", default: false },
      { voiceURI: "en-us-2", name: "Ava", lang: "en-US", default: false },
      { voiceURI: "en-us-1", name: "System English", lang: "en-US", default: true },
    ];

    const englishVoices = listEnglishSpeechVoices(voices);

    expect(englishVoices.map((voice) => voice.voiceURI)).toEqual([
      "en-us-1",
      "en-gb-1",
      "en-us-2",
    ]);
    expect(resolvePreferredSpeechVoice(englishVoices, "en-gb-1")).toBe(voices[1]);
    expect(resolvePreferredSpeechVoice(englishVoices, "missing-voice")).toBeNull();
    expect(resolvePreferredSpeechVoice(englishVoices, null)).toBeNull();
  });
});
