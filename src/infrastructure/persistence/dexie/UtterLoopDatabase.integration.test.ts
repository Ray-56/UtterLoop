import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UtterLoopDatabase } from "./UtterLoopDatabase";
import { DexieTrainingRepository } from "./DexieTrainingRepository";
import { defaultCatalog } from "../../../application/seed/defaultCatalog";
import { ensureDefaultCatalog } from "../../../application/seed/ensureDefaultCatalog";
import {
  DEFAULT_APP_PREFERENCES,
  getTrainingSnapshot,
} from "../../../application/use-cases/getTrainingSnapshot";
import type { UtterLoopFullBackupV2 } from "../../../domain/backup/UtterLoopFullBackup";
import type { PracticeSessionEvidence } from "../../../domain/practice/PracticeSessionEvidence";

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("UtterLoopDatabase v6 persistence", () => {
  it("preserves the guided-learning migration while opening the latest schema", async () => {
    const name = isolatedName("upgrade");
    const v4 = new Dexie(name);
    v4.version(4).stores(v4Stores());
    await v4.open();
    const learningState = {
      cardId: "card-1",
      introducedAt: "2026-07-30T00:00:00.000Z",
      firstPassedAt: "2026-07-30T00:01:00.000Z",
      firstPassSource: "independent-recall",
    };
    const practiceEntry = {
      kind: "attempt",
      id: "turn-attempt:turn-1:0",
      turnId: "turn-1",
      cardId: "card-1",
      phase: "independent-recall",
      submittedAt: "2026-07-30T00:01:00.000Z",
      submissionIndex: 0,
      answer: "Stored evidence.",
      outcome: "perfect",
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 500,
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
    };
    await v4.table("sentenceLearningStates").put(learningState);
    await v4.table("practiceLog").put(practiceEntry);
    v4.close();

    const v5 = new UtterLoopDatabase(name);
    await v5.open();

    expect(v5.verno).toBe(6);
    await expect(v5.sentenceLearningStates.get("card-1")).resolves.toEqual(learningState);
    await expect(v5.practiceLog.get(practiceEntry.id)).resolves.toEqual(practiceEntry);
    expect(v5.appPreferences.schema.primKey.name).toBe("id");
    expect(v5.practiceSessionCheckpoints.schema.indexes.map((index) => index.name)).toContain("updatedAt");
    await expect(v5.practiceSessionEvidence.count()).resolves.toBe(0);
    await expect(v5.appMetadata.get("device")).resolves.toMatchObject({
      id: "device",
      measurementEpoch: expect.any(String),
    });
    v5.close();
  });

  it("upgrades v5 additively without fabricating historical sessions", async () => {
    const name = isolatedName("v5-to-v6");
    const v5 = new Dexie(name);
    v5.version(5).stores(v5Stores());
    await v5.open();
    await v5.table("practiceSessionCheckpoints").put({
      id: "active",
      schemaVersion: 1,
      updatedAt: "2026-07-31T23:59:00.000Z",
    });
    await v5.table("practiceLog").put({
      id: "legacy-log",
      cardId: "removed-card",
      submittedAt: "2026-07-01T00:00:00.000Z",
    });
    v5.close();

    const v6 = new UtterLoopDatabase(
      name,
      () => new Date("2026-08-01T00:00:00.000Z"),
    );
    await v6.open();

    expect(v6.verno).toBe(6);
    await expect(v6.practiceSessionEvidence.toArray()).resolves.toEqual([]);
    await expect(v6.appMetadata.get("device")).resolves.toEqual({
      id: "device",
      measurementEpoch: "2026-08-01T00:00:00.000Z",
    });
    await expect(v6.practiceSessionCheckpoints.get("active")).resolves.toMatchObject({
      schemaVersion: 1,
    });
    await expect(v6.practiceLog.get("legacy-log")).resolves.toBeDefined();
    v6.close();
  });

  it("rolls back every cleared v6 table when full replacement fails", async () => {
    const name = isolatedName("rollback");
    const database = new UtterLoopDatabase(name);
    await database.open();
    const oldCard = {
      id: "old-card",
      english: "Keep the current data.",
      prompt: "保留当前数据。",
      source: "Integration fixture",
      tags: [],
      acceptableAnswers: [],
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    };
    const oldPreferences = {
      id: "device" as const,
      theme: "dark" as const,
      speechVoiceUri: null,
      keySoundMuted: true,
      fingerGuideMode: "auto" as const,
      quickStart: null,
    };
    await database.sentenceCards.put(oldCard);
    await database.appPreferences.put(oldPreferences);
    const oldEvidence = sessionEvidence("old-session");
    await database.practiceSessionEvidence.put(oldEvidence);
    await database.practiceSessionCheckpoints.put({
      id: "active",
      updatedAt: "2026-07-31T12:00:00.000Z",
    } as never);
    const failedWrite = vi.spyOn(database.courseCategories, "bulkPut")
      .mockRejectedValue(new Error("injected transaction failure"));

    await expect(new DexieTrainingRepository(database).replaceAllData(backupFixture()))
      .rejects.toThrow("injected transaction failure");

    failedWrite.mockRestore();
    await expect(database.sentenceCards.get("old-card")).resolves.toEqual(oldCard);
    await expect(database.appPreferences.get("device")).resolves.toEqual(oldPreferences);
    await expect(database.practiceSessionEvidence.get("old-session")).resolves.toEqual(oldEvidence);
    await expect(database.appMetadata.get("device")).resolves.toBeDefined();
    await expect(database.practiceSessionCheckpoints.get("active")).resolves.toMatchObject({ id: "active" });
    database.close();
  });

  it("replaces session evidence and measurement epoch while never restoring an active checkpoint", async () => {
    const name = isolatedName("replace-session-evidence");
    const database = new UtterLoopDatabase(name);
    await database.open();
    await database.practiceSessionEvidence.put(sessionEvidence("old-session"));
    await database.practiceSessionCheckpoints.put({
      id: "active",
      schemaVersion: 1,
      updatedAt: "2026-07-31T12:00:00.000Z",
    } as never);
    const backup = backupFixture();
    const restoredEvidence = sessionEvidence("restored-session");
    backup.learning.practiceSessionEvidence = [restoredEvidence];
    backup.learning.measurementEpoch = "2026-07-01T00:00:00.000Z";

    await new DexieTrainingRepository(database).replaceAllData(backup);

    await expect(database.practiceSessionEvidence.toArray()).resolves.toEqual([restoredEvidence]);
    await expect(database.appMetadata.get("device")).resolves.toEqual({
      id: "device",
      measurementEpoch: "2026-07-01T00:00:00.000Z",
    });
    await expect(database.practiceSessionCheckpoints.count()).resolves.toBe(0);
    database.close();
  });

  it("reset clears only learning evidence and checkpoint while preserving catalog, Vocabulary, and preferences", async () => {
    const name = isolatedName("reset-matrix");
    const database = new UtterLoopDatabase(name);
    await database.open();
    await seedPreservationMatrix(database);

    await new DexieTrainingRepository(database).clearLearningProgress();

    await expect(database.sentenceCards.count()).resolves.toBe(1);
    await expect(database.vocabularyEntries.count()).resolves.toBe(1);
    await expect(database.appPreferences.count()).resolves.toBe(1);
    await expect(database.sentenceLearningStates.count()).resolves.toBe(0);
    await expect(database.reviewStates.count()).resolves.toBe(0);
    await expect(database.practiceLog.count()).resolves.toBe(0);
    await expect(database.practiceSessionEvidence.count()).resolves.toBe(0);
    await expect(database.practiceSessionCheckpoints.count()).resolves.toBe(0);
    await expect(database.appMetadata.count()).resolves.toBe(1);
    database.close();
  });

  it("rolls back every learning clear when reset fails", async () => {
    const name = isolatedName("reset-rollback");
    const database = new UtterLoopDatabase(name);
    await database.open();
    await seedPreservationMatrix(database);
    const failedClear = vi.spyOn(database.practiceLog, "clear")
      .mockRejectedValueOnce(new Error("injected reset failure"));

    await expect(new DexieTrainingRepository(database).clearLearningProgress())
      .rejects.toThrow("injected reset failure");

    failedClear.mockRestore();
    await expect(database.sentenceLearningStates.count()).resolves.toBe(1);
    await expect(database.reviewStates.count()).resolves.toBe(1);
    await expect(database.practiceLog.count()).resolves.toBe(1);
    await expect(database.practiceSessionEvidence.count()).resolves.toBe(1);
    await expect(database.practiceSessionCheckpoints.count()).resolves.toBe(1);
    await expect(database.vocabularyEntries.count()).resolves.toBe(1);
    await expect(database.appPreferences.count()).resolves.toBe(1);
    database.close();
  });

  it("clear this device removes user data while retaining fresh measurement metadata", async () => {
    const name = isolatedName("clear-matrix");
    const database = new UtterLoopDatabase(name);
    await database.open();
    await seedPreservationMatrix(database);

    await new DexieTrainingRepository(database).clearAll();

    await expect(Promise.all(database.tables.map((table) => table.count())))
      .resolves.toEqual(database.tables.map((table) => table.name === "appMetadata" ? 1 : 0));
    database.close();
  });

  it("starts a fresh measurement epoch and keeps snapshot refresh available after this device is cleared", async () => {
    const name = isolatedName("clear-measurement-epoch");
    const database = new UtterLoopDatabase(
      name,
      () => new Date("2026-08-01T00:00:00.000Z"),
    );
    await database.open();
    const repository = new DexieTrainingRepository(
      database,
      () => new Date("2026-08-02T00:00:00.000Z"),
    );

    await repository.clearAll();

    await expect(repository.getMeasurementEpoch())
      .resolves.toBe("2026-08-02T00:00:00.000Z");
    await repository.saveAppPreferences({ ...DEFAULT_APP_PREFERENCES });
    await ensureDefaultCatalog(repository);
    const snapshot = await getTrainingSnapshot(
      repository,
      new Date("2026-08-02T00:00:00.000Z"),
    );
    expect(snapshot.betaReadiness?.activation.quickStartDisposition.coverage.measurementEpoch)
      .toBe("2026-08-02T00:00:00.000Z");
    database.close();
  });

  it("caps recent activity at newest 500 while complete cursor statistics include older rows", async () => {
    const name = isolatedName("complete-statistics");
    const database = new UtterLoopDatabase(name);
    await database.open();
    const logs = Array.from({ length: 650 }, (_, index) => ({
      kind: "attempt" as const,
      id: `turn-attempt:stats-${index}:0`,
      turnId: `stats-${index}`,
      cardId: index < 150 ? "older-card" : "recent-card",
      phase: "independent-recall" as const,
      submittedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      submissionIndex: 0,
      answer: "Complete history.",
      outcome: "perfect" as const,
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 100,
      supportLevelUsed: 0 as const,
      supportKindsUsed: [],
      receivedCorrection: false,
    }));
    await database.practiceLog.bulkPut(logs);
    const repository = new DexieTrainingRepository(database);

    const recent = await repository.listRecentPracticeActivity();
    const statistics = await repository.getPracticeStatistics(
      new Date("2026-07-31T12:00:00.000Z"),
      14,
      "UTC",
    );

    expect(recent.entries).toHaveLength(500);
    expect(recent.totalEntries).toBe(650);
    expect(recent.isTruncated).toBe(true);
    expect(recent.entries[0]?.id).toBe("turn-attempt:stats-649:0");
    expect(statistics.allTime.totalEvents).toBe(650);
    expect(statistics.byCard.find((card) => card.cardId === "older-card")?.retrievalChecks).toBe(150);
    database.close();
  });

  it("routes catalog and atomic Practice writes through the injected database instance", async () => {
    const name = isolatedName("repository-injection");
    const database = new UtterLoopDatabase(name);
    await database.open();
    const repository = new DexieTrainingRepository(database);
    await repository.saveCourseCatalog(defaultCatalog);
    const learningState = {
      cardId: "sf-001",
      introducedAt: "2026-07-31T00:00:00.000Z",
      firstPassedAt: "2026-07-31T00:01:00.000Z",
      firstPassSource: "independent-recall" as const,
    };
    const reviewState = {
      cardId: "sf-001",
      stage: 1 as const,
      dueAt: "2026-07-31T08:01:00.000Z",
      streak: 1,
      lapseCount: 0,
    };
    const logEntry = {
      kind: "attempt" as const,
      id: "turn-attempt:injected-turn:0",
      turnId: "injected-turn",
      cardId: "sf-001",
      phase: "independent-recall" as const,
      submittedAt: "2026-07-31T00:01:00.000Z",
      submissionIndex: 0,
      answer: "Could I get a cup of water, please?",
      outcome: "perfect" as const,
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 500,
      supportLevelUsed: 0 as const,
      supportKindsUsed: [],
      receivedCorrection: false,
    };

    await repository.savePracticeWrite({ learningState, reviewState, logEntry });

    await expect(database.courseCategories.count()).resolves.toBe(defaultCatalog.categories.length);
    await expect(database.sentenceCards.count()).resolves.toBe(defaultCatalog.cards.length);
    await expect(database.sentenceLearningStates.get("sf-001")).resolves.toEqual(learningState);
    await expect(database.reviewStates.get("sf-001")).resolves.toEqual(reviewState);
    await expect(database.practiceLog.get(logEntry.id)).resolves.toEqual(logEntry);
    database.close();
  });
});

function isolatedName(label: string): string {
  const name = `utterloop-test-${label}-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
}

function v4Stores() {
  return {
    courseCategories: "id, sortOrder",
    learningPaths: "id",
    courses: "id, revision, categoryId, *tags",
    sentenceCards: "id, source, updatedAt, *tags",
    reviewStates: "cardId, dueAt, stage",
    practiceLog: "id, cardId, submittedAt, outcome, kind, turnId",
    vocabularyEntries: "cardId, savedAt",
    sentenceLearningStates: "cardId",
  };
}

function v5Stores() {
  return {
    ...v4Stores(),
    appPreferences: "id",
    practiceSessionCheckpoints: "id, updatedAt",
  };
}

function backupFixture(): UtterLoopFullBackupV2 {
  return {
    format: "utterloop-full-backup",
    schemaVersion: 2,
    databaseSchemaVersion: 6,
    exportedAt: "2026-07-31T12:00:00.000Z",
    catalog: {
      categories: defaultCatalog.categories,
      learningPaths: defaultCatalog.learningPaths,
      courses: defaultCatalog.courses,
      cards: defaultCatalog.cards,
    },
    learning: {
      sentenceLearningStates: [],
      reviewStates: [],
      practiceLog: [],
      vocabularyEntries: [],
      measurementEpoch: "2026-08-01T00:00:00.000Z",
      practiceSessionEvidence: [],
    },
    preferences: {
      id: "device",
      theme: "light",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: { version: 1, status: "completed" },
    },
  };
}

async function seedPreservationMatrix(database: UtterLoopDatabase): Promise<void> {
  const card = {
    id: "matrix-card",
    english: "Preserve or remove me intentionally.",
    prompt: "按矩阵处理。",
    source: "Integration fixture",
    tags: [],
    acceptableAnswers: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
  await database.sentenceCards.put(card);
  await database.vocabularyEntries.put({ cardId: card.id, savedAt: "2026-07-31T00:00:00.000Z" });
  await database.appPreferences.put({
    id: "device",
    theme: "system",
    speechVoiceUri: null,
    keySoundMuted: false,
    fingerGuideMode: "auto",
    quickStart: { version: 1, status: "dismissed" },
  });
  await database.sentenceLearningStates.put({
    cardId: card.id,
    introducedAt: "2026-07-31T00:00:00.000Z",
    acquisitionStatus: "needs-guided",
  });
  await database.reviewStates.put({
    cardId: card.id,
    stage: 0,
    dueAt: "2026-07-31T00:10:00.000Z",
    streak: 0,
    lapseCount: 0,
  });
  await database.practiceLog.put({
    kind: "signal",
    id: "turn-signal:matrix-turn",
    turnId: "matrix-turn",
    cardId: card.id,
    phase: "guided-recall",
    submittedAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    signalKinds: ["support-used"],
    reviewFailureRecorded: false,
    answer: "",
    accuracy: 0,
    answerWasRevealed: false,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 0,
    supportLevelUsed: 1,
    supportKindsUsed: ["pattern"],
    receivedCorrection: false,
  });
  await database.practiceSessionEvidence.put(sessionEvidence("matrix-session"));
  await database.practiceSessionCheckpoints.put({
    id: "active",
    updatedAt: "2026-07-31T00:00:00.000Z",
  } as never);
}

function sessionEvidence(sessionId: string): PracticeSessionEvidence {
  return {
    schemaVersion: 1,
    sessionId,
    roundId: `round-${sessionId}`,
    scope: { kind: "review" },
    entryPoint: "standard",
    startedAt: "2026-07-31T00:00:00.000Z",
    engagedAt: "2026-07-31T00:01:00.000Z",
    endedAt: "2026-07-31T00:05:00.000Z",
    terminal: { kind: "completed", reason: "scope-complete" },
    round: {
      initialOccurrenceIds: [],
      scheduledOccurrenceIds: [],
      attemptedOccurrenceIds: [],
      completedOccurrenceIds: [],
      skippedOccurrenceIds: [],
      remainingOccurrenceIds: [],
      dueReviewScheduledOccurrenceIds: [],
      dueReviewCompletedOccurrenceIds: [],
      introducedCardIds: [],
      firstPassCardIds: [],
      requeue: {
        insertedReturnOccurrenceIds: [],
        deferredNoRoomCardIds: [],
        capReachedCardIds: [],
      },
    },
  };
}
