import {
  DEFAULT_FINGER_GUIDE_MODE,
  normalizeAppPreferences,
  type AppPreferences,
  type LegacyAppPreferencesRow,
} from "../../../domain/backup/UtterLoopFullBackup";

export const LEGACY_PERSONALIZATION_KEY = "utterloop:personalization:v1";
export const LEGACY_KEY_SOUND_KEY = "utterloop:key-sound";
export const LEGACY_QUICK_START_KEY = "utterloop.quick-start";

const recognizedKeys = [
  LEGACY_PERSONALIZATION_KEY,
  LEGACY_KEY_SOUND_KEY,
  LEGACY_QUICK_START_KEY,
] as const;

export interface LegacyPreferenceStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface LegacyAppPreferencesMigration {
  storage: LegacyPreferenceStorage;
  load(): Promise<LegacyAppPreferencesRow | undefined>;
  save(preferences: AppPreferences): Promise<void>;
}

export async function migrateLegacyAppPreferences(
  migration: LegacyAppPreferencesMigration,
): Promise<AppPreferences> {
  const existing = await migration.load();
  if (existing) {
    const normalized = normalizeAppPreferences(existing);
    if (existing.fingerGuideMode !== normalized.fingerGuideMode) {
      await migration.save(normalized);
    }
    removePresentRecognizedKeys(migration.storage);
    return normalized;
  }

  const preferences = readLegacyAppPreferences(migration.storage);
  await migration.save(preferences);
  // Cleanup deliberately follows the successful durable write. If the write
  // rejects, legacy values remain available for the next startup attempt.
  removePresentRecognizedKeys(migration.storage);
  return preferences;
}

export function readLegacyAppPreferences(storage: LegacyPreferenceStorage): AppPreferences {
  const personalization = parseJson(storage.getItem(LEGACY_PERSONALIZATION_KEY));
  const versionedPersonalization = isRecord(personalization) && personalization.version === 1
    ? personalization
    : null;
  const quickStart = parseJson(storage.getItem(LEGACY_QUICK_START_KEY));
  const keySound = storage.getItem(LEGACY_KEY_SOUND_KEY);

  return {
    id: "device",
    theme: versionedPersonalization && isTheme(versionedPersonalization.theme)
      ? versionedPersonalization.theme
      : "system",
    speechVoiceUri: versionedPersonalization && typeof versionedPersonalization.speechVoiceUri === "string"
      ? versionedPersonalization.speechVoiceUri
      : null,
    keySoundMuted: keySound === "off",
    fingerGuideMode: DEFAULT_FINGER_GUIDE_MODE,
    quickStart: isRecord(quickStart)
      && quickStart.version === 1
      && (quickStart.status === "completed" || quickStart.status === "dismissed")
      ? { version: 1, status: quickStart.status }
      : null,
  };
}

function removePresentRecognizedKeys(storage: LegacyPreferenceStorage): void {
  for (const key of recognizedKeys) {
    if (storage.getItem(key) !== null) storage.removeItem(key);
  }
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTheme(value: unknown): value is AppPreferences["theme"] {
  return value === "system" || value === "light" || value === "dark";
}
