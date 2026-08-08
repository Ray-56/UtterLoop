import type { SentenceCard } from "../content/SentenceCard";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../curriculum/Course";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import type { PracticeLogEntry } from "../practice/PracticeLogEntry";
import type { ContextualPracticeLogEntry } from "../practice/PracticeSessionEvidence";
import type { PracticeSessionEvidence } from "../practice/PracticeSessionEvidence";
import type { ReviewState } from "../review/ReviewState";
import type { VocabularyEntry } from "../vocabulary/VocabularyEntry";

export const FULL_BACKUP_SCHEMA_VERSION = 2 as const;
export const FULL_BACKUP_DATABASE_SCHEMA_VERSION = 6 as const;
export const LEGACY_FULL_BACKUP_SCHEMA_VERSION = 1 as const;
export const LEGACY_FULL_BACKUP_DATABASE_SCHEMA_VERSION = 5 as const;

export type ThemePreference = "system" | "light" | "dark";
export type FingerGuideMode = "auto" | "compact" | "full" | "off";
export type QuickStartStatus = "completed" | "dismissed";

export const DEFAULT_FINGER_GUIDE_MODE: FingerGuideMode = "auto";

export interface QuickStartPreference {
  version: 1;
  status: QuickStartStatus;
}

export interface AppPreferences {
  id: "device";
  theme: ThemePreference;
  speechVoiceUri: string | null;
  keySoundMuted: boolean;
  fingerGuideMode: FingerGuideMode;
  quickStart: QuickStartPreference | null;
}

/**
 * Runtime shape accepted from preference rows written before Finger Guide modes existed.
 * IndexedDB does not rewrite value-only fields when its table schema is unchanged.
 */
export type LegacyAppPreferencesRow = Omit<AppPreferences, "fingerGuideMode"> & {
  fingerGuideMode?: unknown;
};

export function normalizeAppPreferences(
  preferences: LegacyAppPreferencesRow,
): AppPreferences {
  return {
    ...preferences,
    id: "device",
    fingerGuideMode: isFingerGuideMode(preferences.fingerGuideMode)
      ? preferences.fingerGuideMode
      : DEFAULT_FINGER_GUIDE_MODE,
  };
}

export function isFingerGuideMode(value: unknown): value is FingerGuideMode {
  return value === "auto" || value === "compact" || value === "full" || value === "off";
}

interface FullBackupCatalog {
  categories: CourseCategory[];
  learningPaths: LearningPath[];
  courses: Course[];
  cards: SentenceCard[];
}

interface FullBackupLearningV1 {
  sentenceLearningStates: SentenceLearningState[];
  reviewStates: ReviewState[];
  practiceLog: PracticeLogEntry[];
  vocabularyEntries: VocabularyEntry[];
}

export interface UtterLoopFullBackupV1 {
  format: "utterloop-full-backup";
  schemaVersion: typeof LEGACY_FULL_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  databaseSchemaVersion: typeof LEGACY_FULL_BACKUP_DATABASE_SCHEMA_VERSION;
  catalog: FullBackupCatalog;
  learning: FullBackupLearningV1;
  preferences: AppPreferences;
}

export interface UtterLoopFullBackupV2 {
  format: "utterloop-full-backup";
  schemaVersion: typeof FULL_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  databaseSchemaVersion: typeof FULL_BACKUP_DATABASE_SCHEMA_VERSION;
  catalog: FullBackupCatalog;
  learning: Omit<FullBackupLearningV1, "practiceLog"> & {
    practiceLog: ContextualPracticeLogEntry[];
    measurementEpoch: string;
    practiceSessionEvidence: PracticeSessionEvidence[];
  };
  preferences: AppPreferences;
}

/** Accepted at file-selection boundaries; validation always normalizes to v2. */
export type UtterLoopFullBackup = UtterLoopFullBackupV1 | UtterLoopFullBackupV2;
