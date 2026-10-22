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
import { utterLoopDatabase, type UtterLoopDatabase, type LearningStudioStateRecord } from "./UtterLoopDatabase";
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
  UtterLoopFullBackupV3,
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
import type { Table } from "dexie";
import type { AppMetadata } from "./UtterLoopDatabase";
import {
  LocalDataChangedError,
  PRACTICE_OWNERSHIP_LEASE_MS,
  PracticeOwnershipLostError,
  type PracticeOwnershipLease,
  type PracticeOwnershipResult,
} from "../../../application/ports/LocalDataAccess";
import { createLocalId } from "../../../application/createLocalId";
import { emptyLearningStudio, type LearningStudioDocument } from "../../../domain/studio/LearningStudio";
import { portableLearningStudio, validateLearningStudio, validateStudioCheckpoint } from "../../../domain/studio/validateLearningStudio";
import { LearningStudioConflictError, type LearningStudioStore } from "../../../application/ports/LearningStudioStore";
import { validateFullBackup } from "../../../domain/backup/validateFullBackup";
import { completeFirstExposure } from "../../../domain/learning/SentenceLearningState";
import { createInitialReviewState } from "../../../domain/review/reviewScheduler";
import { exactKeys, literal, pathError, record, safeInteger } from "../../../domain/backup/validateLearningRecords";

export class DexieTrainingRepository implements TrainingRepository, PracticeSessionStore, LearningStudioStore {
  private readonly ownerId = createLocalId("tab");
  private dataGeneration: number | undefined;
  private leaseToken: string | undefined;
  private practiceOwnershipEpoch: number | undefined;
  private releaseBrowserLock: (() => void) | undefined;
  private browserLockAcquisition: Promise<boolean | null> | undefined;
  private studioContentCache: { generation: number; document: LearningStudioDocument } | undefined;

  constructor(
    private readonly database: UtterLoopDatabase = utterLoopDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async initializeDataAccess(): Promise<number> {
    const metadata = await this.database.appMetadata.get("device");
    if (!metadata) throw new Error("Local data metadata is unavailable. Reload before continuing.");
    const generation = metadata.dataGeneration ?? 0;
    if (this.dataGeneration !== undefined && this.dataGeneration !== generation) {
      throw new LocalDataChangedError();
    }
    this.dataGeneration = generation;
    return generation;
  }

  async readLearningStudio(): Promise<LearningStudioDocument> {
    if (this.dataGeneration === undefined) await this.initializeDataAccess();
    return this.database.transaction("r", [this.database.appMetadata, this.database.learningStudio], async () => {
      const [metadata, storedState] = await Promise.all([
        this.database.appMetadata.get("device"), this.database.learningStudio.get("state"),
      ]);
      if (!metadata) throw new Error("Local data metadata is unavailable.");
      const state = storedState === undefined ? undefined : validateStudioState(storedState);
      const content = await this.readStudioContent(metadata.dataGeneration ?? 0, state?.contentRevision);
      return studioWithState(content, state);
    });
  }

  private async readStudioContent(generation: number, expectedRevision?: number): Promise<LearningStudioDocument> {
    const cached = this.studioContentCache;
    if (cached?.generation === generation
      && (expectedRevision === undefined || cached.document.revision === expectedRevision)) return cached.document;
    const stored = await this.database.learningStudio.get("local");
    const document = stored === undefined ? emptyLearningStudio() : validateLearningStudio(stored);
    if (expectedRevision !== undefined && document.revision !== expectedRevision) {
      throw new Error("Learning Studio content does not match its saved revision.");
    }
    this.studioContentCache = { generation, document: freezeStudioContent(document) };
    return this.studioContentCache.document;
  }

  async saveLearningStudio(
    document: LearningStudioDocument,
    expectedRevision: number,
  ): Promise<LearningStudioDocument> {
    const cached = this.studioContentCache;
    const checkpointOnly = cached !== undefined && cached.generation === this.dataGeneration
      && isCheckpointOnlyChange(document, cached.document);
    const candidate = checkpointOnly ? {
      ...document,
      checkpoint: document.checkpoint === null ? null : validateStudioCheckpoint(document.checkpoint),
    } : validateLearningStudio(document);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
      || expectedRevision >= Number.MAX_SAFE_INTEGER
      || candidate.revision !== expectedRevision) throw new LearningStudioConflictError();
    let changedContent: LearningStudioDocument | undefined;
    const saved = await this.write([this.database.learningStudio], async (metadata) => {
      const storedState = await this.database.learningStudio.get("state");
      const state = storedState === undefined ? undefined : validateStudioState(storedState);
      const content = await this.readStudioContent(metadata.dataGeneration ?? 0, state?.contentRevision);
      const current = studioWithState(content, state);
      if (current.revision !== expectedRevision
        || (current.closedSessionIds !== candidate.closedSessionIds
          && current.closedSessionIds.some((id) => !candidate.closedSessionIds.includes(id)))
        || (candidate.checkpoint && candidate.closedSessionIds.includes(candidate.checkpoint.sessionId))
        || (current.checkpoint && candidate.checkpoint
          && current.checkpoint.sessionId === candidate.checkpoint.sessionId
          && candidate.checkpoint.revision < current.checkpoint.revision)) {
        throw new LearningStudioConflictError();
      }
      const next = { ...candidate, revision: expectedRevision + 1 };
      if (!checkpointOnly || state === undefined) {
        const durable = checkpointOnly ? { ...content, checkpoint: null } : { ...next, checkpoint: null };
        await this.database.learningStudio.put(durable);
        changedContent = durable;
      }
      await this.database.learningStudio.put({
        id: "state", revision: next.revision,
        contentRevision: checkpointOnly ? content.revision : next.revision,
        checkpoint: next.checkpoint,
      });
      return next;
    }, true);
    if (changedContent) {
      this.studioContentCache = { generation: this.dataGeneration!, document: freezeStudioContent(changedContent) };
    }
    return saved;
  }

  async acquirePracticeOwnership(
    options: { takeOver?: boolean } = {},
  ): Promise<PracticeOwnershipResult> {
    const browserLock = await this.acquireBrowserLock(options.takeOver === true);
    try {
      return await this.write([], async (metadata) => {
        const current = metadata.practiceLease;
        const now = this.now().getTime();
        if (browserLock === false || (browserLock !== true
          && current && current.ownerId !== this.ownerId && current.expiresAt > now
          && !options.takeOver)) {
          return { status: "in-use", expiresAt: current?.expiresAt ?? now + PRACTICE_OWNERSHIP_LEASE_MS };
        }
        const lease = {
          ownerId: this.ownerId,
          token: createLocalId("practice-lease"),
          expiresAt: now + PRACTICE_OWNERSHIP_LEASE_MS,
        };
        const previousEpoch = safeInteger(metadata.practiceOwnershipEpoch ?? 0, "Local Practice ownership epoch", 0);
        if (previousEpoch >= Number.MAX_SAFE_INTEGER) throw new Error("Local Practice ownership epoch is exhausted.");
        const practiceOwnershipEpoch = previousEpoch + 1;
        await this.database.appMetadata.put({ ...metadata, practiceLease: lease, practiceOwnershipEpoch });
        this.leaseToken = lease.token;
        this.practiceOwnershipEpoch = practiceOwnershipEpoch;
        return { status: "owned", token: lease.token, expiresAt: lease.expiresAt };
      });
    } catch (error) {
      this.releaseBrowserLock?.();
      throw error;
    }
  }

  private async acquireBrowserLock(takeOver: boolean): Promise<boolean | null> {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.locks) return null;
    if (this.releaseBrowserLock) return true;
    if (this.browserLockAcquisition) return this.browserLockAcquisition;
    // The browser releases this lock on reload/crash; a copied tab cannot inherit it.
    this.browserLockAcquisition = new Promise<boolean>((resolve) => {
      let release: () => void;
      const held = new Promise<void>((released) => {
        release = () => {
          if (this.releaseBrowserLock === release) this.releaseBrowserLock = undefined;
          released();
        };
      });
      void navigator.locks.request(
        `utterloop-practice:${this.database.name}`,
        takeOver ? { steal: true } : { ifAvailable: true },
        async (lock) => {
          if (!lock) { resolve(false); return; }
          this.releaseBrowserLock = release;
          resolve(true);
          await held;
        },
      ).catch(() => { release!(); resolve(false); });
    });
    try {
      return await this.browserLockAcquisition;
    } finally {
      this.browserLockAcquisition = undefined;
    }
  }

  async renewPracticeOwnership(token: string): Promise<PracticeOwnershipLease> {
    return this.write([], async (metadata) => {
      const current = metadata.practiceLease;
      if (!current || current.ownerId !== this.ownerId || current.token !== token) {
        this.releaseBrowserLock?.();
        throw new PracticeOwnershipLostError();
      }
      const expiresAt = this.now().getTime() + PRACTICE_OWNERSHIP_LEASE_MS;
      await this.database.appMetadata.put({
        ...metadata,
        practiceLease: { ...current, expiresAt },
      });
      return { token, expiresAt };
    });
  }

  async releasePracticeOwnership(token: string): Promise<void> {
    if (this.leaseToken === token) {
      this.leaseToken = undefined;
      this.releaseBrowserLock?.();
    }
    await this.database.transaction("rw", this.database.appMetadata, async () => {
      const metadata = await this.database.appMetadata.get("device");
      if (metadata?.practiceLease?.ownerId !== this.ownerId
        || metadata.practiceLease.token !== token) return;
      const { practiceLease: _lease, ...remaining } = metadata;
      await this.database.appMetadata.put(remaining);
    });
  }

  private async write<T>(
    tables: readonly Table[],
    operation: (metadata: AppMetadata) => Promise<T>,
    practice = false,
  ): Promise<T> {
    const generation = this.dataGeneration ?? await this.initializeDataAccess();
    return this.database.transaction("rw", [...new Set([this.database.appMetadata, ...tables])], async () => {
      const metadata = await this.database.appMetadata.get("device");
      if (!metadata || (metadata.dataGeneration ?? 0) !== generation) {
        this.releaseBrowserLock?.();
        throw new LocalDataChangedError();
      }
      if (practice) {
        const ownershipEpochChanged = this.practiceOwnershipEpoch !== metadata.practiceOwnershipEpoch;
        const lease = metadata.practiceLease;
        const foreignLease = lease && lease.ownerId !== this.ownerId
          && lease.expiresAt > this.now().getTime();
        const lostLease = this.leaseToken && (!lease || lease.ownerId !== this.ownerId
          || lease.token !== this.leaseToken || lease.expiresAt <= this.now().getTime());
        if (ownershipEpochChanged || foreignLease || lostLease) {
          this.releaseBrowserLock?.();
          throw new PracticeOwnershipLostError();
        }
      }
      return operation(metadata);
    });
  }

  private async writeReviewManagement<T>(
    tables: readonly Table[], operation: (metadata: AppMetadata) => Promise<T>,
  ): Promise<T> {
    if (this.leaseToken || this.practiceOwnershipEpoch !== undefined) return this.write(tables, operation, true);
    // A closed Practice document may leave its durable lease until expiry; the native lock proves it is gone.
    const ownership = await this.acquirePracticeOwnership();
    if (ownership.status !== "owned") throw new PracticeOwnershipLostError();
    try {
      return await this.write(tables, operation, true);
    } finally {
      await this.releasePracticeOwnership(ownership.token);
    }
  }

  async listCourseCategories(): Promise<CourseCategory[]> {
    return this.database.courseCategories.toArray();
  }

  async saveCourseCategories(categories: CourseCategory[]): Promise<void> {
    await this.write([this.database.courseCategories], async () => {
      await this.database.courseCategories.bulkPut(categories);
    });
  }

  async listLearningPaths(): Promise<LearningPath[]> {
    return this.database.learningPaths.toArray();
  }

  async saveLearningPaths(paths: LearningPath[]): Promise<void> {
    await this.write([this.database.learningPaths], async () => {
      await this.database.learningPaths.bulkPut(paths);
    });
  }

  async listCourses(): Promise<Course[]> {
    return this.database.courses.toArray();
  }

  async getCourse(courseId: string): Promise<Course | undefined> {
    return this.database.courses.get(courseId);
  }

  async saveCourses(courses: Course[]): Promise<void> {
    await this.write([this.database.courses], async () => {
      await this.database.courses.bulkPut(courses);
    });
  }

  async listSentenceCards(): Promise<SentenceCard[]> {
    return this.database.sentenceCards.orderBy("updatedAt").reverse().toArray();
  }

  async getSentenceCard(cardId: SentenceCardId): Promise<SentenceCard | undefined> {
    return this.database.sentenceCards.get(cardId);
  }

  async saveSentenceCards(cards: SentenceCard[]): Promise<void> {
    await this.write([this.database.sentenceCards], async () => {
      await this.database.sentenceCards.bulkPut(cards);
    });
  }

  async listReviewStates(): Promise<ReviewState[]> {
    return this.database.reviewStates.toArray();
  }

  async getReviewState(cardId: SentenceCardId): Promise<ReviewState | undefined> {
    return this.database.reviewStates.get(cardId);
  }

  async saveReviewState(reviewState: ReviewState): Promise<void> {
    await this.writeReviewManagement([this.database.reviewStates], async () => {
      await this.database.reviewStates.put(reviewState);
    });
  }

  async listSentenceLearningStates(): Promise<SentenceLearningState[]> {
    return this.database.sentenceLearningStates.toArray();
  }

  async getSentenceLearningState(cardId: SentenceCardId): Promise<SentenceLearningState | undefined> {
    return this.database.sentenceLearningStates.get(cardId);
  }

  async saveSentenceLearningState(state: SentenceLearningState): Promise<void> {
    await this.write([this.database.sentenceLearningStates], async () => {
      await this.database.sentenceLearningStates.put(state);
    }, true);
  }

  async saveLearningAndReviewState(
    state: SentenceLearningState,
    reviewState: ReviewState,
  ): Promise<void> {
    const database = this.database;
    await this.writeReviewManagement(
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
    return this.write(
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
      }, true,
    );
  }

  async addPracticeLog(entry: PracticeLogEntry): Promise<void> {
    await this.write([this.database.practiceLog], async () => {
      await this.database.practiceLog.put(entry);
    }, true);
  }

  async savePracticeResult(reviewState: ReviewState, entry: PracticeLogEntry): Promise<void> {
    const database = this.database;
    await this.write(
      [database.reviewStates, database.practiceLog],
      async () => {
        await database.reviewStates.put(reviewState);
        await database.practiceLog.put(entry);
      }, true,
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

  async listPracticeLogForTurn(turnId: string): Promise<PracticeLogEntry[]> {
    return this.database.practiceLog.where("turnId").equals(turnId).sortBy("submittedAt");
  }

  async listVocabularyEntries(): Promise<VocabularyEntry[]> {
    return this.database.vocabularyEntries.orderBy("savedAt").reverse().toArray();
  }

  async getVocabularyEntry(cardId: SentenceCardId): Promise<VocabularyEntry | undefined> {
    return this.database.vocabularyEntries.get(cardId);
  }

  async saveVocabularyEntry(entry: VocabularyEntry): Promise<void> {
    await this.writeReviewManagement([this.database.vocabularyEntries], async () => {
      await this.database.vocabularyEntries.put(entry);
    });
  }

  async deleteVocabularyEntry(cardId: SentenceCardId): Promise<void> {
    await this.writeReviewManagement([this.database.vocabularyEntries], async () => {
      await this.database.vocabularyEntries.delete(cardId);
    });
  }

  async saveCourseCatalog(catalog: CourseCatalog): Promise<void> {
    const database = this.database;
    await this.write(
      [database.courseCategories, database.learningPaths, database.courses, database.sentenceCards],
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
    await this.write([this.database.appPreferences], async () => {
      await this.database.appPreferences.put(normalizeAppPreferences(preferences));
    });
  }

  async getPracticeSessionCheckpoint(): Promise<PracticeSessionCheckpoint | undefined> {
    return this.database.practiceSessionCheckpoints.get("active");
  }

  async savePracticeSessionCheckpoint(checkpoint: PracticeSessionCheckpoint): Promise<void> {
    if (isRevisionedCheckpoint(checkpoint)) {
      const result = await this.commitCheckpoint(checkpoint);
      if (result !== "stored" && result !== "unchanged") {
        throw new Error(`Practice checkpoint could not be saved: ${result}`);
      }
      return;
    }
    await this.write([this.database.practiceSessionCheckpoints], async () => {
      const current = await this.database.practiceSessionCheckpoints.get("active");
      if (isRevisionedCheckpoint(current)) {
        throw new Error("An active Practice session cannot be replaced by a legacy checkpoint.");
      }
      await this.database.practiceSessionCheckpoints.put(checkpoint);
    }, true);
  }

  async deletePracticeSessionCheckpoint(): Promise<void> {
    await this.write([this.database.practiceSessionCheckpoints], async () => {
      await this.database.practiceSessionCheckpoints.delete("active");
    }, true);
  }

  async loadActiveCheckpoint(): Promise<PracticeSessionCheckpoint | undefined> {
    return this.database.practiceSessionCheckpoints.get("active");
  }

  async discardActiveCheckpoint(expectedSessionId?: string): Promise<boolean> {
    const database = this.database;
    return this.write([database.practiceSessionCheckpoints], async () => {
      const current = await database.practiceSessionCheckpoints.get("active");
      if (!current) return false;
      if (expectedSessionId !== undefined
        && (!isRevisionedCheckpoint(current) || current.sessionId !== expectedSessionId)) {
        return false;
      }
      await database.practiceSessionCheckpoints.delete("active");
      return true;
    }, true);
  }

  async commitCheckpoint(
    checkpoint: RevisionedPracticeSessionCheckpoint,
  ): Promise<PracticeSessionCheckpointCommitResult> {
    if (!Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0) {
      return "stale";
    }
    const database = this.database;
    return this.write(
      [database.practiceSessionCheckpoints, database.practiceSessionEvidence],
      async (metadata) => {
        if (checkpoint.dataGeneration !== undefined
          && checkpoint.dataGeneration !== (metadata.dataGeneration ?? 0)) {
          throw new LocalDataChangedError();
        }
        if (await database.practiceSessionEvidence.get(checkpoint.sessionId)) {
          return "terminal";
        }
        const current = await database.practiceSessionCheckpoints.get("active");
        if (isRevisionedCheckpoint(current) && current.sessionId !== checkpoint.sessionId) {
          return "conflict";
        }
        if (isRevisionedCheckpoint(current) && current.sessionId === checkpoint.sessionId) {
          if (checkpoint.revision < current.revision) return "stale";
          if (checkpoint.revision === current.revision) return "unchanged";
        }
        await database.practiceSessionCheckpoints.put(checkpoint);
        return "stored";
      }, true,
    );
  }

  async commitTerminal(
    commit: PracticeSessionTerminalCommit,
  ): Promise<PracticeSessionTerminalCommitResult> {
    const database = this.database;
    return this.write(
      [
        database.practiceSessionEvidence,
        database.practiceSessionCheckpoints,
        database.appPreferences,
      ],
      async (metadata) => {
        if (commit.dataGeneration !== undefined
          && commit.dataGeneration !== (metadata.dataGeneration ?? 0)) {
          throw new LocalDataChangedError();
        }
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
      }, true,
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

  async readFullBackup(exportedAt: string): Promise<UtterLoopFullBackupV3> {
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
        studio,
        studioState,
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
        database.learningStudio.get("local"),
        database.learningStudio.get("state"),
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
          studio: portableLearningStudio(studioForMaintenance(studio, studioState)),
        },
        preferences: normalizeAppPreferences(preferences),
      };
    });
  }

  async replaceAllData(value: UtterLoopFullBackupV2 | UtterLoopFullBackupV3): Promise<void> {
    const backup = validateFullBackup(value);
    const database = this.database;
    const tables = allDurableTables(database);
    await this.write(tables, async (metadata) => {
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
      await database.learningStudio.put({ ...backup.learning.studio, checkpoint: null });
      await database.learningStudio.put({
        id: "state", revision: backup.learning.studio.revision,
        contentRevision: backup.learning.studio.revision, checkpoint: null,
      });
      await database.appMetadata.put({
        id: "device",
        measurementEpoch: backup.learning.measurementEpoch,
        dataGeneration: (metadata.dataGeneration ?? 0) + 1,
      });
      // Checkpoints are intentionally never restored.
    });
  }

  async clearLearningProgress(): Promise<void> {
    const database = this.database;
    await this.write(
      [
        database.sentenceLearningStates,
        database.reviewStates,
        database.practiceLog,
        database.practiceSessionEvidence,
        database.practiceSessionCheckpoints,
        database.learningStudio,
      ],
      async (metadata) => {
        await database.sentenceLearningStates.clear();
        await database.reviewStates.clear();
        await database.practiceLog.clear();
        await database.practiceSessionEvidence.clear();
        await database.practiceSessionCheckpoints.clear();
        const [storedStudio, storedStudioState] = await Promise.all([
          database.learningStudio.get("local"), database.learningStudio.get("state"),
        ]);
        if (storedStudio !== undefined || storedStudioState !== undefined) {
          const studio = studioForMaintenance(storedStudio, storedStudioState);
          if (studio.revision >= Number.MAX_SAFE_INTEGER) throw new LearningStudioConflictError();
          const resetAt = this.now();
          const resetStudio: LearningStudioDocument = {
            ...studio,
            revision: studio.revision + 1,
            personalSentences: studio.personalSentences.map((sentence) => ({
              ...sentence,
              learningState: completeFirstExposure(undefined, sentence.id, resetAt.toISOString()),
              reviewState: createInitialReviewState(sentence.id, resetAt),
            })),
            attempts: [], signals: [], fluencyResults: [], closedSessionIds: [], checkpoint: null,
          };
          await database.learningStudio.put(resetStudio);
          await database.learningStudio.put({
            id: "state", revision: resetStudio.revision, contentRevision: resetStudio.revision, checkpoint: null,
          });
        }
        await database.appMetadata.put({
          id: "device",
          measurementEpoch: metadata.measurementEpoch,
          dataGeneration: (metadata.dataGeneration ?? 0) + 1,
        });
      },
    );
  }

  async clearAll(): Promise<void> {
    const database = this.database;
    const tables = allDurableTables(database);
    const measurementEpoch = this.now().toISOString();
    await this.write(
      tables,
      async (metadata) => {
        await Promise.all(tables.map((table) => table.clear()));
        await database.appMetadata.put({
          id: "device", measurementEpoch, dataGeneration: (metadata.dataGeneration ?? 0) + 1,
        });
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
    database.learningStudio,
  ] as const;
}

function validateStudioState(value: unknown, includeCheckpoint = true): LearningStudioStateRecord {
  const state = record(value, "Studio local state");
  exactKeys(state, ["id", "revision", "contentRevision", "checkpoint"], "Studio local state");
  const revision = safeInteger(state.revision, "Studio local state.revision", 0);
  const contentRevision = safeInteger(state.contentRevision, "Studio local state.contentRevision", 0);
  if (contentRevision > revision) throw pathError("Studio local state.contentRevision", "cannot exceed its revision");
  return {
    id: literal(state.id, "state", "Studio local state.id"), revision, contentRevision,
    checkpoint: !includeCheckpoint || state.checkpoint === null ? null : validateStudioCheckpoint(state.checkpoint),
  };
}

function studioWithState(content: LearningStudioDocument, state?: LearningStudioStateRecord): LearningStudioDocument {
  const checkpoint = state ? state.checkpoint : content.checkpoint;
  if (checkpoint && content.closedSessionIds.includes(checkpoint.sessionId)) {
    throw new Error("The active Studio checkpoint belongs to a closed session.");
  }
  return { ...content, revision: state?.revision ?? content.revision,
    checkpoint: checkpoint === null ? null : structuredClone(checkpoint) };
}

// Backups and reset intentionally ignore an unfinished private draft, including legacy embedded drafts.
function studioForMaintenance(storedContent: unknown, storedState: unknown): LearningStudioDocument {
  const content = storedContent === undefined ? emptyLearningStudio()
    : validateLearningStudio({ ...record(storedContent, "Learning Studio"), checkpoint: null });
  const state = storedState === undefined ? undefined : validateStudioState(storedState, false);
  if (state && content.revision !== state.contentRevision) {
    throw new Error("Learning Studio content does not match its saved revision.");
  }
  return studioWithState(content, state);
}

function isCheckpointOnlyChange(document: LearningStudioDocument, content: LearningStudioDocument): boolean {
  return document !== null && typeof document === "object"
    && document.id === "local" && document.schemaVersion === 1
    && Object.keys(document).length === 9
    && Object.keys(document).every((key) => key in content)
    && document.personalSentences === content.personalSentences
    && document.attempts === content.attempts
    && document.signals === content.signals
    && document.fluencyResults === content.fluencyResults
    && document.closedSessionIds === content.closedSessionIds;
}

function freezeStudioContent<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeStudioContent);
    Object.freeze(value);
  }
  return value;
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
