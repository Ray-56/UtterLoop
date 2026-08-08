import type { SentenceCard, SentenceCardId } from "../../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../../domain/review/ReviewState";
import type { TrainingRepository } from "../../../application/ports/TrainingRepository";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../../domain/curriculum/Course";
import type { CourseCatalog } from "../../../domain/curriculum/validateCourseCatalog";
import type { VocabularyEntry } from "../../../domain/vocabulary/VocabularyEntry";
import { utterLoopDatabase, type UtterLoopDatabase } from "./UtterLoopDatabase";
import type { SentenceLearningState } from "../../../domain/learning/SentenceLearningState";
import type {
  AtomicPracticeWrite,
  AtomicPracticeWriteResult,
  RecentPracticeActivity,
} from "../../../application/ports/TrainingRepository";
import { RECENT_PRACTICE_LOG_LIMIT } from "../../../application/ports/TrainingRepository";
import type {
  AppPreferences,
  UtterLoopFullBackupV2,
} from "../../../domain/backup/UtterLoopFullBackup";
import {
  FULL_BACKUP_DATABASE_SCHEMA_VERSION,
  FULL_BACKUP_SCHEMA_VERSION,
  normalizeAppPreferences,
} from "../../../domain/backup/UtterLoopFullBackup";
import {
  createPracticeStatisticsState,
  finalizePracticeStatistics,
  reducePracticeStatistics,
  type PracticeStatistics,
} from "../../../domain/progress/practiceStatistics";
import type { PracticeSessionCheckpoint } from "../../../application/practice-session/PracticeSessionCheckpoint";
import type {
  PracticeSessionCheckpointCommitResult,
  PracticeSessionStore,
  PracticeSessionTerminalCommit,
  PracticeSessionTerminalCommitResult,
  RevisionedPracticeSessionCheckpoint,
} from "../../../application/ports/PracticeSessionStore";
import type { PracticeSessionEvidence } from "../../../domain/practice/PracticeSessionEvidence";

export class DexieTrainingRepository implements TrainingRepository, PracticeSessionStore {
  constructor(
    private readonly database: UtterLoopDatabase = utterLoopDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCourseCategories(): Promise<CourseCategory[]> {
    return this.database.courseCategories.toArray();
  }

  async saveCourseCategories(categories: CourseCategory[]): Promise<void> {
    await this.database.courseCategories.bulkPut(categories);
  }

  async listLearningPaths(): Promise<LearningPath[]> {
    return this.database.learningPaths.toArray();
  }

  async saveLearningPaths(paths: LearningPath[]): Promise<void> {
    await this.database.learningPaths.bulkPut(paths);
  }

  async listCourses(): Promise<Course[]> {
    return this.database.courses.toArray();
  }

  async getCourse(courseId: string): Promise<Course | undefined> {
    return this.database.courses.get(courseId);
  }

  async saveCourses(courses: Course[]): Promise<void> {
    await this.database.courses.bulkPut(courses);
  }

  async listSentenceCards(): Promise<SentenceCard[]> {
    return this.database.sentenceCards.orderBy("updatedAt").reverse().toArray();
  }

  async getSentenceCard(cardId: SentenceCardId): Promise<SentenceCard | undefined> {
    return this.database.sentenceCards.get(cardId);
  }

  async saveSentenceCards(cards: SentenceCard[]): Promise<void> {
    await this.database.sentenceCards.bulkPut(cards);
  }

  async listReviewStates(): Promise<ReviewState[]> {
    return this.database.reviewStates.toArray();
  }

  async getReviewState(cardId: SentenceCardId): Promise<ReviewState | undefined> {
    return this.database.reviewStates.get(cardId);
  }

  async saveReviewState(reviewState: ReviewState): Promise<void> {
    await this.database.reviewStates.put(reviewState);
  }

  async listSentenceLearningStates(): Promise<SentenceLearningState[]> {
    return this.database.sentenceLearningStates.toArray();
  }

  async getSentenceLearningState(cardId: SentenceCardId): Promise<SentenceLearningState | undefined> {
    return this.database.sentenceLearningStates.get(cardId);
  }

  async saveSentenceLearningState(state: SentenceLearningState): Promise<void> {
    await this.database.sentenceLearningStates.put(state);
  }

  async saveLearningAndReviewState(
    state: SentenceLearningState,
    reviewState: ReviewState,
  ): Promise<void> {
    const database = this.database;
    await database.transaction(
      "rw",
      [database.sentenceLearningStates, database.reviewStates],
      async () => {
        await database.sentenceLearningStates.put(state);
        await database.reviewStates.put(reviewState);
      },
    );
  }

  async getPracticeLogEntry(id: string): Promise<PracticeLogEntry | undefined> {
    return this.database.practiceLog.get(id);
  }

  async savePracticeWrite(write: AtomicPracticeWrite): Promise<AtomicPracticeWriteResult> {
    const database = this.database;
    return database.transaction(
      "rw",
      [
        database.sentenceLearningStates,
        database.reviewStates,
        database.practiceLog,
      ],
      async () => {
        const existing = await database.practiceLog.get(write.logEntry.id);
        if (existing?.kind === "attempt" && write.logEntry.kind === "attempt") {
          return { entry: existing, created: false };
        }

        if (write.learningState) {
          await database.sentenceLearningStates.put(write.learningState);
        }
        if (write.reviewState) {
          await database.reviewStates.put(write.reviewState);
        }
        await database.practiceLog.put(write.logEntry);
        return { entry: write.logEntry, created: !existing };
      },
    );
  }

  async addPracticeLog(entry: PracticeLogEntry): Promise<void> {
    await this.database.practiceLog.put(entry);
  }

  async savePracticeResult(reviewState: ReviewState, entry: PracticeLogEntry): Promise<void> {
    const database = this.database;
    await database.transaction(
      "rw",
      database.reviewStates,
      database.practiceLog,
      async () => {
        await database.reviewStates.put(reviewState);
        await database.practiceLog.put(entry);
      },
    );
  }

  async listPracticeLog(): Promise<PracticeLogEntry[]> {
    return (await this.listRecentPracticeActivity()).entries;
  }

  async listRecentPracticeActivity(
    limit = RECENT_PRACTICE_LOG_LIMIT,
  ): Promise<RecentPracticeActivity> {
    const database = this.database;
    const normalizedLimit = Number.isSafeInteger(limit) && limit > 0
      ? limit
      : RECENT_PRACTICE_LOG_LIMIT;
    return database.transaction("r", database.practiceLog, async () => {
      const [entries, totalEntries] = await Promise.all([
        database.practiceLog.orderBy("submittedAt").reverse().limit(normalizedLimit).toArray(),
        database.practiceLog.count(),
      ]);
      return {
        entries,
        limit: normalizedLimit,
        totalEntries,
        isTruncated: totalEntries > entries.length,
      };
    });
  }

  async getPracticeStatistics(
    now: Date,
    days: number,
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  ): Promise<PracticeStatistics> {
    const database = this.database;
    let state = createPracticeStatisticsState(now, timeZone);
    await database.transaction("r", database.practiceLog, async () => {
      await database.practiceLog.orderBy("submittedAt").each((entry) => {
        state = reducePracticeStatistics(state, entry);
      });
    });
    return finalizePracticeStatistics(state, days);
  }

  async listAllPracticeLog(): Promise<PracticeLogEntry[]> {
    return this.database.practiceLog.orderBy("submittedAt").toArray();
  }

  async listVocabularyEntries(): Promise<VocabularyEntry[]> {
    return this.database.vocabularyEntries.orderBy("savedAt").reverse().toArray();
  }

  async getVocabularyEntry(cardId: SentenceCardId): Promise<VocabularyEntry | undefined> {
    return this.database.vocabularyEntries.get(cardId);
  }

  async saveVocabularyEntry(entry: VocabularyEntry): Promise<void> {
    await this.database.vocabularyEntries.put(entry);
  }

  async deleteVocabularyEntry(cardId: SentenceCardId): Promise<void> {
    await this.database.vocabularyEntries.delete(cardId);
  }

  async saveCourseCatalog(catalog: CourseCatalog): Promise<void> {
    const database = this.database;
    await database.transaction(
      "rw",
      database.courseCategories,
      database.learningPaths,
      database.courses,
      database.sentenceCards,
      async () => {
        await database.courseCategories.bulkPut(catalog.categories);
        await database.learningPaths.bulkPut(catalog.learningPaths);
        await database.courses.bulkPut(catalog.courses);
        await database.sentenceCards.bulkPut(catalog.cards);
      },
    );
  }

  async getAppPreferences(): Promise<AppPreferences | undefined> {
    return this.database.appPreferences.get("device");
  }

  async saveAppPreferences(preferences: AppPreferences): Promise<void> {
    await this.database.appPreferences.put(normalizeAppPreferences(preferences));
  }

  async getPracticeSessionCheckpoint(): Promise<PracticeSessionCheckpoint | undefined> {
    return this.database.practiceSessionCheckpoints.get("active");
  }

  async savePracticeSessionCheckpoint(checkpoint: PracticeSessionCheckpoint): Promise<void> {
    await this.database.practiceSessionCheckpoints.put(checkpoint);
  }

  async deletePracticeSessionCheckpoint(): Promise<void> {
    await this.database.practiceSessionCheckpoints.delete("active");
  }

  async loadActiveCheckpoint(): Promise<PracticeSessionCheckpoint | undefined> {
    return this.database.practiceSessionCheckpoints.get("active");
  }

  async discardActiveCheckpoint(expectedSessionId?: string): Promise<boolean> {
    const database = this.database;
    return database.transaction("rw", database.practiceSessionCheckpoints, async () => {
      const current = await database.practiceSessionCheckpoints.get("active");
      if (!current) return false;
      if (expectedSessionId !== undefined
        && (!isRevisionedCheckpoint(current) || current.sessionId !== expectedSessionId)) {
        return false;
      }
      await database.practiceSessionCheckpoints.delete("active");
      return true;
    });
  }

  async commitCheckpoint(
    checkpoint: RevisionedPracticeSessionCheckpoint,
  ): Promise<PracticeSessionCheckpointCommitResult> {
    if (!Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0) {
      return "stale";
    }
    const database = this.database;
    return database.transaction(
      "rw",
      [database.practiceSessionCheckpoints, database.practiceSessionEvidence],
      async () => {
        if (await database.practiceSessionEvidence.get(checkpoint.sessionId)) {
          return "terminal";
        }
        const current = await database.practiceSessionCheckpoints.get("active");
        if (isRevisionedCheckpoint(current) && current.sessionId === checkpoint.sessionId) {
          if (checkpoint.revision < current.revision) return "stale";
          if (checkpoint.revision === current.revision) return "unchanged";
        }
        await database.practiceSessionCheckpoints.put(checkpoint);
        return "stored";
      },
    );
  }

  async commitTerminal(
    commit: PracticeSessionTerminalCommit,
  ): Promise<PracticeSessionTerminalCommitResult> {
    const database = this.database;
    return database.transaction(
      "rw",
      [
        database.practiceSessionEvidence,
        database.practiceSessionCheckpoints,
        database.appPreferences,
      ],
      async () => {
        const existing = await database.practiceSessionEvidence.get(commit.evidence.sessionId);
        if (existing && canonicalJson(existing) !== canonicalJson(commit.evidence)) {
          return "conflict";
        }

        if (commit.quickStartPreference) {
          const preferences = await database.appPreferences.get("device");
          if (!preferences) {
            throw new Error("Device preferences are unavailable for Quick Start completion.");
          }
          await database.appPreferences.put({
            ...normalizeAppPreferences(preferences),
            quickStart: commit.quickStartPreference,
          });
        }

        if (!existing) {
          await database.practiceSessionEvidence.add(commit.evidence);
        }
        const checkpoint = await database.practiceSessionCheckpoints.get("active");
        if (isRevisionedCheckpoint(checkpoint)
          && checkpoint.sessionId === commit.evidence.sessionId) {
          await database.practiceSessionCheckpoints.delete("active");
        }
        return existing ? "existing" : "created";
      },
    );
  }

  async getEvidence(sessionId: string): Promise<PracticeSessionEvidence | undefined> {
    return this.database.practiceSessionEvidence.get(sessionId);
  }

  async listEvidence(): Promise<PracticeSessionEvidence[]> {
    return this.database.practiceSessionEvidence.orderBy("endedAt").toArray();
  }

  async getMeasurementEpoch(): Promise<string> {
    const metadata = await this.database.appMetadata.get("device");
    if (!metadata) {
      throw new Error("Measurement metadata is unavailable.");
    }
    return metadata.measurementEpoch;
  }

  async readFullBackup(exportedAt: string): Promise<UtterLoopFullBackupV2> {
    const database = this.database;
    const tables = fullBackupReadTables(database);
    return database.transaction("r", tables, async () => {
      const [
        categories,
        learningPaths,
        courses,
        cards,
        sentenceLearningStates,
        reviewStates,
        practiceLog,
        vocabularyEntries,
        preferences,
        metadata,
        practiceSessionEvidence,
      ] = await Promise.all([
        database.courseCategories.toArray(),
        database.learningPaths.toArray(),
        database.courses.toArray(),
        database.sentenceCards.toArray(),
        database.sentenceLearningStates.toArray(),
        database.reviewStates.toArray(),
        database.practiceLog.toArray(),
        database.vocabularyEntries.toArray(),
        database.appPreferences.get("device"),
        database.appMetadata.get("device"),
        database.practiceSessionEvidence.toArray(),
      ]);
      if (!preferences) {
        throw new Error("Device preferences are unavailable for full backup.");
      }
      if (!metadata) {
        throw new Error("Measurement metadata is unavailable for full backup.");
      }
      return {
        format: "utterloop-full-backup",
        schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
        exportedAt,
        databaseSchemaVersion: FULL_BACKUP_DATABASE_SCHEMA_VERSION,
        catalog: { categories, learningPaths, courses, cards },
        learning: {
          sentenceLearningStates,
          reviewStates,
          practiceLog,
          vocabularyEntries,
          measurementEpoch: metadata.measurementEpoch,
          practiceSessionEvidence,
        },
        preferences: normalizeAppPreferences(preferences),
      };
    });
  }

  async replaceAllData(backup: UtterLoopFullBackupV2): Promise<void> {
    const database = this.database;
    const tables = allDurableTables(database);
    await database.transaction("rw", tables, async () => {
      await Promise.all(tables.map((table) => table.clear()));
      await bulkPutIfAny(database.courseCategories, backup.catalog.categories);
      await bulkPutIfAny(database.learningPaths, backup.catalog.learningPaths);
      await bulkPutIfAny(database.courses, backup.catalog.courses);
      await bulkPutIfAny(database.sentenceCards, backup.catalog.cards);
      await bulkPutIfAny(
        database.sentenceLearningStates,
        backup.learning.sentenceLearningStates,
      );
      await bulkPutIfAny(database.reviewStates, backup.learning.reviewStates);
      await bulkPutIfAny(database.practiceLog, backup.learning.practiceLog);
      await bulkPutIfAny(
        database.practiceSessionEvidence,
        backup.learning.practiceSessionEvidence,
      );
      await bulkPutIfAny(
        database.vocabularyEntries,
        backup.learning.vocabularyEntries,
      );
      await database.appPreferences.put(backup.preferences);
      await database.appMetadata.put({
        id: "device",
        measurementEpoch: backup.learning.measurementEpoch,
      });
      // Checkpoints are intentionally never restored.
    });
  }

  async clearLearningProgress(): Promise<void> {
    const database = this.database;
    await database.transaction(
      "rw",
      [
        database.sentenceLearningStates,
        database.reviewStates,
        database.practiceLog,
        database.practiceSessionEvidence,
        database.practiceSessionCheckpoints,
      ],
      async () => {
        await database.sentenceLearningStates.clear();
        await database.reviewStates.clear();
        await database.practiceLog.clear();
        await database.practiceSessionEvidence.clear();
        await database.practiceSessionCheckpoints.clear();
      },
    );
  }

  async clearAll(): Promise<void> {
    const database = this.database;
    const tables = allDurableTables(database);
    const measurementEpoch = this.now().toISOString();
    await database.transaction(
      "rw",
      tables,
      async () => {
        await Promise.all(tables.map((table) => table.clear()));
        await database.appMetadata.put({ id: "device", measurementEpoch });
      },
    );
  }
}

function fullBackupReadTables(database: UtterLoopDatabase = utterLoopDatabase) {
  return [
    database.courseCategories,
    database.learningPaths,
    database.courses,
    database.sentenceCards,
    database.sentenceLearningStates,
    database.reviewStates,
    database.practiceLog,
    database.vocabularyEntries,
    database.appPreferences,
    database.appMetadata,
    database.practiceSessionEvidence,
  ] as const;
}

function allDurableTables(database: UtterLoopDatabase = utterLoopDatabase) {
  return [
    ...fullBackupReadTables(database),
    database.practiceSessionCheckpoints,
  ];
}

async function bulkPutIfAny<T>(
  table: { bulkPut(values: T[]): Promise<unknown> },
  values: T[],
): Promise<void> {
  if (values.length > 0) await table.bulkPut(values);
}

function isRevisionedCheckpoint(
  checkpoint: PracticeSessionCheckpoint | undefined,
): checkpoint is RevisionedPracticeSessionCheckpoint {
  if (!checkpoint || !("sessionId" in checkpoint) || !("revision" in checkpoint)) return false;
  const candidate = checkpoint as PracticeSessionCheckpoint & {
    sessionId?: unknown;
    revision?: unknown;
  };
  return candidate.schemaVersion === 2
    && typeof candidate.sessionId === "string"
    && candidate.sessionId.length > 0
    && typeof candidate.revision === "number"
    && Number.isSafeInteger(candidate.revision)
    && candidate.revision >= 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
