import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCatalog } from "../../../application/seed/defaultCatalog";
import { DexieTrainingRepository } from "./DexieTrainingRepository";
import { utterLoopDatabase } from "./UtterLoopDatabase";
import type {
  AppPreferences,
  UtterLoopFullBackupV2,
} from "../../../domain/backup/UtterLoopFullBackup";
import type { PracticeSessionCheckpoint } from "../../../application/practice-session/PracticeSessionCheckpoint";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieTrainingRepository", () => {
  it("atomically writes learning, review, and deterministic Attempt evidence", async () => {
    const transaction = mockTransactionExecution();
    const learningState = {
      cardId: "card-1",
      introducedAt: "2026-07-23T00:00:00.000Z",
      firstPassedAt: "2026-07-23T00:00:00.000Z",
      firstPassSource: "independent-recall" as const,
    };
    const reviewState = {
      cardId: "card-1",
      stage: 1 as const,
      dueAt: "2026-07-23T08:00:00.000Z",
      streak: 1,
      lapseCount: 0,
    };
    const entry = {
      kind: "attempt" as const,
      id: "turn-attempt:turn-1:0",
      turnId: "turn-1",
      cardId: "card-1",
      phase: "independent-recall" as const,
      submittedAt: "2026-07-23T00:00:00.000Z",
      submissionIndex: 0,
      answer: "Sentence.",
      outcome: "perfect" as const,
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
      supportLevelUsed: 0 as const,
      supportKindsUsed: [],
      receivedCorrection: false,
    };
    vi.spyOn(utterLoopDatabase.practiceLog, "get").mockResolvedValue(undefined);
    const saveLearning = vi.spyOn(utterLoopDatabase.sentenceLearningStates, "put").mockResolvedValue("card-1");
    const saveReview = vi.spyOn(utterLoopDatabase.reviewStates, "put").mockResolvedValue("card-1");
    const saveLog = vi.spyOn(utterLoopDatabase.practiceLog, "put").mockResolvedValue(entry.id);

    await expect(new DexieTrainingRepository().savePracticeWrite({
      learningState,
      reviewState,
      logEntry: entry,
    })).resolves.toEqual({ entry, created: true });

    expect(transaction).toHaveBeenCalledWith(
      "rw",
      [
        utterLoopDatabase.sentenceLearningStates,
        utterLoopDatabase.reviewStates,
        utterLoopDatabase.practiceLog,
      ],
      expect.any(Function),
    );
    expect(saveLearning).toHaveBeenCalledWith(learningState);
    expect(saveReview).toHaveBeenCalledWith(reviewState);
    expect(saveLog).toHaveBeenCalledWith(entry);
  });

  it("does not apply an indexed Attempt write twice", async () => {
    const transaction = mockTransactionExecution();
    const entry = {
      kind: "attempt" as const,
      id: "turn-attempt:turn-1:0",
      turnId: "turn-1",
      cardId: "card-1",
      phase: "independent-recall" as const,
      submittedAt: "2026-07-23T00:00:00.000Z",
      submissionIndex: 0,
      answer: "Sentence.",
      outcome: "perfect" as const,
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
      supportLevelUsed: 0 as const,
      supportKindsUsed: [],
      receivedCorrection: false,
    };
    vi.spyOn(utterLoopDatabase.practiceLog, "get").mockResolvedValue(entry);
    const saveLearning = vi.spyOn(utterLoopDatabase.sentenceLearningStates, "put").mockResolvedValue("card-1");
    const saveReview = vi.spyOn(utterLoopDatabase.reviewStates, "put").mockResolvedValue("card-1");
    const saveLog = vi.spyOn(utterLoopDatabase.practiceLog, "put").mockResolvedValue(entry.id);

    await expect(new DexieTrainingRepository().savePracticeWrite({
      learningState: {
        cardId: "card-1",
        introducedAt: entry.submittedAt,
        firstPassedAt: entry.submittedAt,
        firstPassSource: "independent-recall",
      },
      reviewState: {
        cardId: "card-1",
        stage: 1,
        dueAt: "2026-07-23T08:00:00.000Z",
        streak: 1,
        lapseCount: 0,
      },
      logEntry: entry,
    })).resolves.toEqual({ entry, created: false });

    expect(transaction).toHaveBeenCalledOnce();
    expect(saveLearning).not.toHaveBeenCalled();
    expect(saveReview).not.toHaveBeenCalled();
    expect(saveLog).not.toHaveBeenCalled();
  });

  it("clears learning, review, and logs while retaining Vocabulary", async () => {
    const transaction = mockTransactionExecution();
    const clearLearning = vi.spyOn(utterLoopDatabase.sentenceLearningStates, "clear").mockResolvedValue();
    const clearReview = vi.spyOn(utterLoopDatabase.reviewStates, "clear").mockResolvedValue();
    const clearLog = vi.spyOn(utterLoopDatabase.practiceLog, "clear").mockResolvedValue();
    const clearEvidence = vi.spyOn(utterLoopDatabase.practiceSessionEvidence, "clear").mockResolvedValue();
    const clearVocabulary = vi.spyOn(utterLoopDatabase.vocabularyEntries, "clear").mockResolvedValue();
    const clearCheckpoint = vi.spyOn(utterLoopDatabase.practiceSessionCheckpoints, "clear").mockResolvedValue();

    await new DexieTrainingRepository().clearLearningProgress();

    expect(transaction).toHaveBeenCalledWith(
      "rw",
      [
        utterLoopDatabase.sentenceLearningStates,
        utterLoopDatabase.reviewStates,
        utterLoopDatabase.practiceLog,
        utterLoopDatabase.practiceSessionEvidence,
        utterLoopDatabase.practiceSessionCheckpoints,
      ],
      expect.any(Function),
    );
    expect(clearLearning).toHaveBeenCalledOnce();
    expect(clearReview).toHaveBeenCalledOnce();
    expect(clearLog).toHaveBeenCalledOnce();
    expect(clearEvidence).toHaveBeenCalledOnce();
    expect(clearCheckpoint).toHaveBeenCalledOnce();
    expect(clearVocabulary).not.toHaveBeenCalled();
  });

  it("round-trips the one device preference row and active Practice checkpoint", async () => {
    const preferences: AppPreferences = {
      id: "device",
      theme: "dark",
      speechVoiceUri: "voice-1",
      keySoundMuted: true,
      fingerGuideMode: "full",
      quickStart: { version: 1, status: "completed" },
    };
    const checkpoint = { id: "active", updatedAt: "2026-07-31T12:00:00.000Z" } as PracticeSessionCheckpoint;
    vi.spyOn(utterLoopDatabase.appPreferences, "get").mockResolvedValue(preferences);
    const savePreferences = vi.spyOn(utterLoopDatabase.appPreferences, "put").mockResolvedValue("device");
    vi.spyOn(utterLoopDatabase.practiceSessionCheckpoints, "get").mockResolvedValue(checkpoint);
    const saveCheckpoint = vi.spyOn(utterLoopDatabase.practiceSessionCheckpoints, "put").mockResolvedValue("active");
    const clearCheckpoint = vi.spyOn(utterLoopDatabase.practiceSessionCheckpoints, "delete").mockResolvedValue();
    const repository = new DexieTrainingRepository();

    await expect(repository.getAppPreferences()).resolves.toEqual(preferences);
    await repository.saveAppPreferences(preferences);
    await expect(repository.getPracticeSessionCheckpoint()).resolves.toEqual(checkpoint);
    await repository.savePracticeSessionCheckpoint(checkpoint);
    await repository.deletePracticeSessionCheckpoint();

    expect(savePreferences).toHaveBeenCalledWith(preferences);
    expect(saveCheckpoint).toHaveBeenCalledWith(checkpoint);
    expect(clearCheckpoint).toHaveBeenCalledWith("active");
  });

  it("returns exactly the newest requested activity with complete count metadata", async () => {
    mockTransactionExecution();
    const entries = Array.from({ length: 500 }, (_, index) => ({
      id: `entry-${index + 151}`,
      submittedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    })) as never[];
    const toArray = vi.fn().mockResolvedValue(entries);
    const limit = vi.fn().mockReturnValue({ toArray });
    const reverse = vi.fn().mockReturnValue({ limit });
    vi.spyOn(utterLoopDatabase.practiceLog, "orderBy").mockReturnValue({ reverse } as never);
    vi.spyOn(utterLoopDatabase.practiceLog, "count").mockResolvedValue(650);

    await expect(new DexieTrainingRepository().listRecentPracticeActivity()).resolves.toEqual({
      entries,
      limit: 500,
      totalEntries: 650,
      isTruncated: true,
    });
    expect(limit).toHaveBeenCalledWith(500);
  });

  it("streams every log row through the public statistics reducer seam", async () => {
    mockTransactionExecution();
    const oldEntries = Array.from({ length: 150 }, (_, index) => practiceAttempt(
      `old-${index}`,
      "older-card",
      new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    ));
    const recentEntries = Array.from({ length: 500 }, (_, index) => practiceAttempt(
      `recent-${index}`,
      "recent-card",
      new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    ));
    const each = vi.fn(async (visitor: (entry: ReturnType<typeof practiceAttempt>) => void) => {
      [...oldEntries, ...recentEntries].forEach(visitor);
    });
    vi.spyOn(utterLoopDatabase.practiceLog, "orderBy").mockReturnValue({ each } as never);

    const result = await new DexieTrainingRepository().getPracticeStatistics(
      new Date("2026-07-31T12:00:00.000Z"),
      14,
      "UTC",
    );

    expect(result.allTime.totalEvents).toBe(650);
    expect(result.byCard.find((card) => card.cardId === "older-card")?.retrievalChecks).toBe(150);
    expect(result.daily).toHaveLength(14);
  });

  it("reads a consistent full backup including every log row and excluding checkpoints", async () => {
    const transaction = mockTransactionExecution();
    const preferences = {
      id: "device",
      theme: "dark",
      speechVoiceUri: null,
      keySoundMuted: false,
      quickStart: { version: 1, status: "dismissed" },
    } as unknown as AppPreferences;
    const allLogs = Array.from({ length: 501 }, (_, index) => practiceAttempt(
      `backup-${index}`,
      "sf-001",
      new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    ));
    vi.spyOn(utterLoopDatabase.courseCategories, "toArray").mockResolvedValue(defaultCatalog.categories);
    vi.spyOn(utterLoopDatabase.learningPaths, "toArray").mockResolvedValue(defaultCatalog.learningPaths);
    vi.spyOn(utterLoopDatabase.courses, "toArray").mockResolvedValue(defaultCatalog.courses);
    vi.spyOn(utterLoopDatabase.sentenceCards, "toArray").mockResolvedValue(defaultCatalog.cards);
    vi.spyOn(utterLoopDatabase.sentenceLearningStates, "toArray").mockResolvedValue([]);
    vi.spyOn(utterLoopDatabase.reviewStates, "toArray").mockResolvedValue([]);
    vi.spyOn(utterLoopDatabase.practiceLog, "toArray").mockResolvedValue(allLogs);
    vi.spyOn(utterLoopDatabase.vocabularyEntries, "toArray").mockResolvedValue([]);
    vi.spyOn(utterLoopDatabase.appPreferences, "get").mockResolvedValue(preferences);
    vi.spyOn(utterLoopDatabase.appMetadata, "get").mockResolvedValue({
      id: "device",
      measurementEpoch: "2026-07-31T00:00:00.000Z",
    });
    vi.spyOn(utterLoopDatabase.practiceSessionEvidence, "toArray").mockResolvedValue([]);

    const backup = await new DexieTrainingRepository().readFullBackup("2026-07-31T12:00:00.000Z");

    expect(backup.learning.practiceLog).toHaveLength(501);
    expect(backup.preferences).toEqual({ ...preferences, fingerGuideMode: "auto" });
    expect(backup).toMatchObject({
      schemaVersion: 2,
      databaseSchemaVersion: 6,
      learning: {
        measurementEpoch: "2026-07-31T00:00:00.000Z",
        practiceSessionEvidence: [],
      },
    });
    expect(transaction).toHaveBeenCalledWith(
      "r",
      expect.arrayContaining([
        utterLoopDatabase.courseCategories,
        utterLoopDatabase.practiceLog,
        utterLoopDatabase.appPreferences,
      ]),
      expect.any(Function),
    );
    expect(transaction.mock.calls[0]?.[1]).not.toContain(utterLoopDatabase.practiceSessionCheckpoints);
  });

  it("replaces every durable v6 table and clears the active checkpoint in one transaction", async () => {
    const transaction = mockTransactionExecution();
    const backup = fullBackupFixture();
    const clearSpies = durableTables().map((table) => vi.spyOn(table, "clear").mockResolvedValue());
    const savePreferences = vi.spyOn(utterLoopDatabase.appPreferences, "put").mockResolvedValue("device");
    vi.spyOn(utterLoopDatabase.appMetadata, "put").mockResolvedValue("device");
    vi.spyOn(utterLoopDatabase.courseCategories, "bulkPut").mockResolvedValue("x");
    vi.spyOn(utterLoopDatabase.learningPaths, "bulkPut").mockResolvedValue("x");
    vi.spyOn(utterLoopDatabase.courses, "bulkPut").mockResolvedValue("x");
    vi.spyOn(utterLoopDatabase.sentenceCards, "bulkPut").mockResolvedValue("x");

    await new DexieTrainingRepository().replaceAllData(backup);

    expect(transaction).toHaveBeenCalledWith("rw", durableTables(), expect.any(Function));
    clearSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(savePreferences).toHaveBeenCalledWith(backup.preferences);
  });

  it("rejects a failed replacement from inside the single transaction before later writes", async () => {
    mockTransactionExecution();
    const backup = fullBackupFixture();
    durableTables().forEach((table) => vi.spyOn(table, "clear").mockResolvedValue());
    vi.spyOn(utterLoopDatabase.courseCategories, "bulkPut").mockRejectedValue(new Error("injected write failure"));
    const savePreferences = vi.spyOn(utterLoopDatabase.appPreferences, "put").mockResolvedValue("device");
    vi.spyOn(utterLoopDatabase.appMetadata, "put").mockResolvedValue("device");

    await expect(new DexieTrainingRepository().replaceAllData(backup)).rejects.toThrow("injected write failure");

    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("reads and writes course categories", async () => {
    const categories = defaultCatalog.categories;
    vi.spyOn(utterLoopDatabase.courseCategories, "toArray").mockResolvedValue(categories);
    const bulkPut = vi
      .spyOn(utterLoopDatabase.courseCategories, "bulkPut")
      .mockResolvedValue("everyday-communication");
    const repository = new DexieTrainingRepository();

    await expect(repository.listCourseCategories()).resolves.toEqual(categories);
    await repository.saveCourseCategories(categories);

    expect(bulkPut).toHaveBeenCalledWith(categories);
  });

  it("saves categories and course content in one transaction", async () => {
    const transaction = mockTransactionExecution();
    const saveCategories = vi
      .spyOn(utterLoopDatabase.courseCategories, "bulkPut")
      .mockResolvedValue("work-study");
    const savePaths = vi
      .spyOn(utterLoopDatabase.learningPaths, "bulkPut")
      .mockResolvedValue("utterloop-core-path");
    const saveCourses = vi
      .spyOn(utterLoopDatabase.courses, "bulkPut")
      .mockResolvedValue("work-study-essentials");
    const saveCards = vi
      .spyOn(utterLoopDatabase.sentenceCards, "bulkPut")
      .mockResolvedValue("wse-020");

    await new DexieTrainingRepository().saveCourseCatalog(defaultCatalog);

    expect(transaction).toHaveBeenCalledWith(
      "rw",
      utterLoopDatabase.courseCategories,
      utterLoopDatabase.learningPaths,
      utterLoopDatabase.courses,
      utterLoopDatabase.sentenceCards,
      expect.any(Function),
    );
    expect(saveCategories).toHaveBeenCalledWith(defaultCatalog.categories);
    expect(savePaths).toHaveBeenCalledWith(defaultCatalog.learningPaths);
    expect(saveCourses).toHaveBeenCalledWith(defaultCatalog.courses);
    expect(saveCards).toHaveBeenCalledWith(defaultCatalog.cards);
  });

  it("clears categories with all other stored data in one transaction", async () => {
    const transaction = mockTransactionExecution();
    const clearCategories = vi
      .spyOn(utterLoopDatabase.courseCategories, "clear")
      .mockResolvedValue();
    vi.spyOn(utterLoopDatabase.learningPaths, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.courses, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.sentenceCards, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.reviewStates, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.sentenceLearningStates, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.practiceLog, "clear").mockResolvedValue();
    const clearVocabulary = vi.spyOn(utterLoopDatabase.vocabularyEntries, "clear").mockResolvedValue();
    const clearPreferences = vi.spyOn(utterLoopDatabase.appPreferences, "clear").mockResolvedValue();
    const clearMetadata = vi.spyOn(utterLoopDatabase.appMetadata, "clear").mockResolvedValue();
    const saveMetadata = vi.spyOn(utterLoopDatabase.appMetadata, "put").mockResolvedValue("device");
    const clearEvidence = vi.spyOn(utterLoopDatabase.practiceSessionEvidence, "clear").mockResolvedValue();
    const clearCheckpoint = vi.spyOn(utterLoopDatabase.practiceSessionCheckpoints, "clear").mockResolvedValue();

    await new DexieTrainingRepository(
      utterLoopDatabase,
      () => new Date("2026-08-02T00:00:00.000Z"),
    ).clearAll();

    expect(transaction).toHaveBeenCalledWith(
      "rw",
      [
        utterLoopDatabase.courseCategories,
        utterLoopDatabase.learningPaths,
        utterLoopDatabase.courses,
        utterLoopDatabase.sentenceCards,
        utterLoopDatabase.sentenceLearningStates,
        utterLoopDatabase.reviewStates,
        utterLoopDatabase.practiceLog,
        utterLoopDatabase.vocabularyEntries,
        utterLoopDatabase.appPreferences,
        utterLoopDatabase.appMetadata,
        utterLoopDatabase.practiceSessionEvidence,
        utterLoopDatabase.practiceSessionCheckpoints,
      ],
      expect.any(Function),
    );
    expect(clearCategories).toHaveBeenCalledOnce();
    expect(clearVocabulary).toHaveBeenCalledOnce();
    expect(clearPreferences).toHaveBeenCalledOnce();
    expect(clearMetadata).toHaveBeenCalledOnce();
    expect(saveMetadata).toHaveBeenCalledWith({
      id: "device",
      measurementEpoch: "2026-08-02T00:00:00.000Z",
    });
    expect(clearEvidence).toHaveBeenCalledOnce();
    expect(clearCheckpoint).toHaveBeenCalledOnce();
  });

  it("stores review state and practice evidence in one transaction", async () => {
    const transaction = mockTransactionExecution();
    const reviewState = {
      cardId: "card-1",
      stage: 0 as const,
      dueAt: "2026-07-23T00:10:00.000Z",
      streak: 0,
      lapseCount: 1,
    };
    const entry = {
      kind: "signal" as const,
      id: "turn-signal:turn-1",
      turnId: "turn-1",
      cardId: "card-1",
      phase: "guided-recall" as const,
      submittedAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
      signalKinds: ["skipped" as const],
      reviewFailureRecorded: true,
      answer: "" as const,
      accuracy: 0 as const,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 0,
      supportLevelUsed: 0 as const,
      supportKindsUsed: [],
      receivedCorrection: false,
    };
    const saveReview = vi.spyOn(utterLoopDatabase.reviewStates, "put").mockResolvedValue("card-1");
    const saveLog = vi.spyOn(utterLoopDatabase.practiceLog, "put").mockResolvedValue(entry.id);

    await new DexieTrainingRepository().savePracticeResult(reviewState, entry);

    expect(transaction).toHaveBeenCalledWith(
      "rw",
      utterLoopDatabase.reviewStates,
      utterLoopDatabase.practiceLog,
      expect.any(Function),
    );
    expect(saveReview).toHaveBeenCalledWith(reviewState);
    expect(saveLog).toHaveBeenCalledWith(entry);
  });
});

function mockTransactionExecution() {
  return vi
    .spyOn(utterLoopDatabase, "transaction")
    .mockImplementation((async (...args: unknown[]) => {
      const operation = args.at(-1) as () => Promise<void>;
      return await operation();
    }) as never);
}

function devicePreferences(): AppPreferences {
  return {
    id: "device",
    theme: "dark",
    speechVoiceUri: null,
    keySoundMuted: false,
    fingerGuideMode: "compact",
    quickStart: { version: 1, status: "dismissed" },
  };
}

function practiceAttempt(id: string, cardId: string, submittedAt: string) {
  return {
    kind: "attempt" as const,
    id: `turn-attempt:${id}:0`,
    turnId: id,
    cardId,
    phase: "independent-recall" as const,
    submittedAt,
    submissionIndex: 0,
    answer: "Sentence.",
    outcome: "perfect" as const,
    accuracy: 1,
    answerWasRevealed: false,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 1000,
    supportLevelUsed: 0 as const,
    supportKindsUsed: [],
    receivedCorrection: false,
  };
}

function fullBackupFixture(): UtterLoopFullBackupV2 {
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
      measurementEpoch: "2026-07-31T00:00:00.000Z",
      practiceSessionEvidence: [],
    },
    preferences: devicePreferences(),
  };
}

function durableTables() {
  return [
    utterLoopDatabase.courseCategories,
    utterLoopDatabase.learningPaths,
    utterLoopDatabase.courses,
    utterLoopDatabase.sentenceCards,
    utterLoopDatabase.sentenceLearningStates,
    utterLoopDatabase.reviewStates,
    utterLoopDatabase.practiceLog,
    utterLoopDatabase.vocabularyEntries,
    utterLoopDatabase.appPreferences,
    utterLoopDatabase.appMetadata,
    utterLoopDatabase.practiceSessionEvidence,
    utterLoopDatabase.practiceSessionCheckpoints,
  ];
}
