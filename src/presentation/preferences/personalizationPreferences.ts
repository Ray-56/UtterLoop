import {
  isFingerGuideMode,
  type FingerGuideMode,
} from "../../domain/backup/UtterLoopFullBackup";

export { isFingerGuideMode } from "../../domain/backup/UtterLoopFullBackup";
export type { FingerGuideMode } from "../../domain/backup/UtterLoopFullBackup";
export type ThemePreference = "system" | "light" | "dark";

export interface PersonalizationPreferences {
  fingerGuideMode: FingerGuideMode;
  theme: ThemePreference;
  speechVoiceUri: string | null;
}

export interface SpeechVoiceDescriptor {
  voiceURI: string;
  name: string;
  lang: string;
  default: boolean;
}

interface StoredPersonalizationPreferences extends PersonalizationPreferences {
  version: 1;
}

export interface PersonalizationPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

export const PERSONALIZATION_PREFERENCES_KEY = "utterloop:personalization:v1";

export const DEFAULT_PERSONALIZATION_PREFERENCES: PersonalizationPreferences = {
  fingerGuideMode: "auto",
  theme: "system",
  speechVoiceUri: null,
};

export function parsePersonalizationPreferences(raw: string | null): PersonalizationPreferences {
  if (!raw) {
    return DEFAULT_PERSONALIZATION_PREFERENCES;
  }

  try {
    const stored = JSON.parse(raw) as Partial<StoredPersonalizationPreferences>;

    if (stored.version !== 1) {
      return DEFAULT_PERSONALIZATION_PREFERENCES;
    }

    return {
      fingerGuideMode: isFingerGuideMode(stored.fingerGuideMode)
        ? stored.fingerGuideMode
        : "auto",
      theme: isThemePreference(stored.theme) ? stored.theme : "system",
      speechVoiceUri: typeof stored.speechVoiceUri === "string" ? stored.speechVoiceUri : null,
    };
  } catch {
    return DEFAULT_PERSONALIZATION_PREFERENCES;
  }
}

export function serializePersonalizationPreferences(preferences: PersonalizationPreferences): string {
  return JSON.stringify({ version: 1, ...preferences } satisfies StoredPersonalizationPreferences);
}

export function readPersonalizationPreferences(
  storage: PersonalizationPreferenceStorage,
): PersonalizationPreferences {
  try {
    return parsePersonalizationPreferences(storage.getItem(PERSONALIZATION_PREFERENCES_KEY));
  } catch {
    return DEFAULT_PERSONALIZATION_PREFERENCES;
  }
}

export function writePersonalizationPreferences(
  storage: PersonalizationPreferenceStorage,
  preferences: PersonalizationPreferences,
): void {
  try {
    storage.setItem(PERSONALIZATION_PREFERENCES_KEY, serializePersonalizationPreferences(preferences));
  } catch {
    // The preference remains active for this session when browser storage is unavailable.
  }
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): Exclude<ThemePreference, "system"> {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

export function listEnglishSpeechVoices<T extends SpeechVoiceDescriptor>(voices: readonly T[]): T[] {
  return voices
    .filter((voice) => /^en(?:-|$)/i.test(voice.lang))
    .sort((left, right) => {
      if (left.default !== right.default) {
        return left.default ? -1 : 1;
      }

      return left.lang.localeCompare(right.lang) || left.name.localeCompare(right.name);
    });
}

export function resolvePreferredSpeechVoice<T extends SpeechVoiceDescriptor>(
  voices: readonly T[],
  preferredVoiceUri: string | null,
): T | null {
  if (!preferredVoiceUri) {
    return null;
  }

  return voices.find((voice) => voice.voiceURI === preferredVoiceUri) ?? null;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}
