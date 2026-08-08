import Dexie, { type Table } from "dexie";
import type { SentenceCard } from "../../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../../domain/review/ReviewState";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../../domain/curriculum/Course";
import type { VocabularyEntry } from "../../../domain/vocabulary/VocabularyEntry";
import type { SentenceLearningState } from "../../../domain/learning/SentenceLearningState";
import type { AppPreferences } from "../../../domain/backup/UtterLoopFullBackup";
import type { PracticeSessionCheckpoint } from "../../../application/practice-session/PracticeSessionCheckpoint";
import type { RevisionedPracticeSessionCheckpoint } from "../../../application/ports/PracticeSessionStore";
import type { PracticeSessionEvidence } from "../../../domain/practice/PracticeSessionEvidence";
import {
  migrateLegacyV3Data,
  type LegacyPracticeLogRow,
  type LegacyReviewStateRow,
} from "./migrateLegacyV3Data";

export class UtterLoopDatabase extends Dexie {
  courseCategories!: Table<CourseCategory, string>;
  learningPaths!: Table<LearningPath, string>;
  courses!: Table<Course, string>;
  sentenceCards!: Table<SentenceCard, string>;
  reviewStates!: Table<ReviewState, string>;
  practiceLog!: Table<PracticeLogEntry, string>;
  vocabularyEntries!: Table<VocabularyEntry, string>;
  sentenceLearningStates!: Table<SentenceLearningState, string>;
  appPreferences!: Table<AppPreferences, "device">;
  appMetadata!: Table<AppMetadata, "device">;
  practiceSessionCheckpoints!: Table<
    PracticeSessionCheckpoint | RevisionedPracticeSessionCheckpoint,
    "active"
  >;
  practiceSessionEvidence!: Table<PracticeSessionEvidence, string>;

  constructor(
    name = "utterloop-courses",
    now: () => Date = () => new Date(),
  ) {
    super(name);

    this.version(1).stores({
      learningPaths: "id",
      courses: "id, revision",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome",
    });

    this.version(2).stores({
      courseCategories: "id, sortOrder",
      learningPaths: "id",
      courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome",
    });

    this.version(3).stores({
      courseCategories: "id, sortOrder",
      learningPaths: "id",
      courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome",
      vocabularyEntries: "cardId, savedAt",
    });

    this.version(4).stores({
      courseCategories: "id, sortOrder",
      learningPaths: "id",
      courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome, kind, turnId",
      vocabularyEntries: "cardId, savedAt",
      sentenceLearningStates: "cardId",
    }).upgrade(async (transaction) => {
      const [logs, reviewStates] = await Promise.all([
        transaction.table("practiceLog").toArray() as Promise<LegacyPracticeLogRow[]>,
        transaction.table("reviewStates").toArray() as Promise<LegacyReviewStateRow[]>,
      ]);
      const migrated = migrateLegacyV3Data({
        logs,
        reviewStates,
        migrationAt: new Date().toISOString(),
      });
      const practiceLog = transaction.table("practiceLog");
      await practiceLog.clear();
      if (migrated.logs.length > 0) await practiceLog.bulkPut(migrated.logs);
      if (migrated.learningStates.length > 0) {
        await transaction.table("sentenceLearningStates").bulkPut(migrated.learningStates);
      }
    });

    // Version 5 is intentionally layered after the guided-learning v4
    // migration. Adding the two stores does not rewrite any v4 evidence.
    this.version(5).stores({
      courseCategories: "id, sortOrder",
      learningPaths: "id",
      courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome, kind, turnId",
      vocabularyEntries: "cardId, savedAt",
      sentenceLearningStates: "cardId",
      appPreferences: "id",
      practiceSessionCheckpoints: "id, updatedAt",
    });

    this.version(6).stores({
      courseCategories: "id, sortOrder",
      learningPaths: "id",
      courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome, kind, turnId",
      vocabularyEntries: "cardId, savedAt",
      sentenceLearningStates: "cardId",
      appPreferences: "id",
      appMetadata: "id, measurementEpoch",
      practiceSessionCheckpoints: "id, updatedAt",
      practiceSessionEvidence: "sessionId, roundId, endedAt, terminal.kind, entryPoint",
    }).upgrade(async (transaction) => {
      await transaction.table("appMetadata").put(measurementMetadata(now()));
    });

    this.on("populate", (transaction) => (
      transaction.table("appMetadata").put(measurementMetadata(now()))
    ));
  }
}

export interface AppMetadata {
  id: "device";
  measurementEpoch: string;
}

function measurementMetadata(now: Date): AppMetadata {
  return {
    id: "device",
    measurementEpoch: now.toISOString(),
  };
}

export const utterLoopDatabase = new UtterLoopDatabase();
