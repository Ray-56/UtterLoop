import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RevisionedPracticeSessionCheckpoint,
} from "../../../application/ports/PracticeSessionStore";
import type { PracticeSessionEvidence } from "../../../domain/practice/PracticeSessionEvidence";
import { DexieTrainingRepository } from "./DexieTrainingRepository";
import { UtterLoopDatabase } from "./UtterLoopDatabase";
import {
  LocalDataChangedError,
  PracticeOwnershipLostError,
} from "../../../application/ports/LocalDataAccess";

const databaseNames: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("Dexie PracticeSessionStore", () => {
  it("guards Vocabulary changes from a taken-over page without blocking explicit Review management", async () => {
    const database = await openDatabase("vocabulary-owner-epoch");
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(database);
    const initial = await first.acquirePracticeOwnership();
    if (initial.status !== "owned") throw new Error("Expected initial ownership");
    const entry = { cardId: "card-1", savedAt: "2026-08-01T00:00:00.000Z" };
    await first.saveVocabularyEntry(entry);
    const replacement = await second.acquirePracticeOwnership({ takeOver: true });
    if (replacement.status !== "owned") throw new Error("Expected takeover ownership");
    await expect(first.deleteVocabularyEntry("card-1")).rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(first.saveVocabularyEntry({ ...entry, cardId: "card-2" })).rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await first.releasePracticeOwnership(initial.token);
    await second.releasePracticeOwnership(replacement.token);
    await expect(first.deleteVocabularyEntry("card-1")).rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(first.saveVocabularyEntry({ ...entry, cardId: "card-2" })).rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(database.vocabularyEntries.toArray()).resolves.toEqual([entry]);
    const management = new DexieTrainingRepository(database);
    await management.deleteVocabularyEntry("card-1");
    await management.saveVocabularyEntry({ ...entry, cardId: "card-2" });
    await expect(database.vocabularyEntries.toArray()).resolves.toEqual([{ ...entry, cardId: "card-2" }]);
    expect((await database.appMetadata.get("device"))?.practiceLease).toBeUndefined();
    database.close();
  });

  it("allows Review management after Practice releases ownership, while rejecting changes under another active writer", async () => {
    const database = await openDatabase("review-management-ownership");
    const practice = new DexieTrainingRepository(database);
    const management = new DexieTrainingRepository(database);
    const lease = await practice.acquirePracticeOwnership();
    if (lease.status !== "owned") throw new Error("Expected Practice ownership");
    const review = { cardId: "card-1", stage: 0 as const, dueAt: "2026-08-01T00:00:00.000Z", streak: 0, lapseCount: 0 };
    await expect(management.saveReviewState(review)).rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(database.reviewStates.count()).resolves.toBe(0);
    await practice.releasePracticeOwnership(lease.token);
    await management.saveReviewState(review);
    await expect(database.reviewStates.get("card-1")).resolves.toEqual(review);
    expect((await database.appMetadata.get("device"))?.practiceLease).toBeUndefined();
    await management.saveLearningAndReviewState({ cardId: "card-1", introducedAt: review.dueAt,
      firstPassedAt: review.dueAt, firstPassSource: "explicit-mastery" },
    { ...review, stage: 6, learningStatus: "mastered" });
    await expect(database.sentenceLearningStates.get("card-1")).resolves.toMatchObject({ firstPassSource: "explicit-mastery" });
    await expect(database.reviewStates.get("card-1")).resolves.toMatchObject({ stage: 6, learningStatus: "mastered" });
    expect((await database.appMetadata.get("device"))?.practiceLease).toBeUndefined();
    await expect(practice.acquirePracticeOwnership()).resolves.toMatchObject({ status: "owned" });
    database.close();
  });

  it("allows only one tab to own Practice and keeps a conflicting tab's checkpoint out", async () => {
    const database = await openDatabase("two-tab-ownership");
    const secondDatabase = new UtterLoopDatabase(database.name);
    await secondDatabase.open();
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(secondDatabase);
    await Promise.all([first.initializeDataAccess(), second.initializeDataAccess()]);

    const ownership = await Promise.all([
      first.acquirePracticeOwnership(),
      second.acquirePracticeOwnership(),
    ]);
    expect(ownership.map((result) => result.status).sort()).toEqual(["in-use", "owned"]);
    const winner = ownership[0].status === "owned" ? first : second;
    const loser = winner === first ? second : first;
    await winner.commitCheckpoint(checkpoint("winner", 0, "keep this draft"));
    await expect(loser.commitCheckpoint(checkpoint("loser", 0)))
      .rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(winner.loadActiveCheckpoint()).resolves.toMatchObject({
      sessionId: "winner",
      draft: "keep this draft",
    });
    database.close();
    secondDatabase.close();
  });

  it("requires explicit takeover and rejects the previous owner's writes and late release", async () => {
    const database = await openDatabase("explicit-takeover");
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(database);
    const firstLease = await first.acquirePracticeOwnership();
    if (firstLease.status !== "owned") throw new Error("Expected initial ownership");
    await first.commitCheckpoint(checkpoint("shared-session", 0));
    await expect(second.acquirePracticeOwnership()).resolves.toMatchObject({ status: "in-use" });

    const secondLease = await second.acquirePracticeOwnership({ takeOver: true });
    if (secondLease.status !== "owned") throw new Error("Expected takeover ownership");
    await expect(first.commitCheckpoint(checkpoint("shared-session", 1, "stale draft")))
      .rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await first.releasePracticeOwnership(firstLease.token);
    await expect(second.renewPracticeOwnership(secondLease.token)).resolves.toMatchObject({
      token: secondLease.token,
    });
    await second.commitCheckpoint(checkpoint("shared-session", 1, "new owner draft"));
    await expect(second.loadActiveCheckpoint()).resolves.toMatchObject({ draft: "new owner draft" });
    database.close();
  });

  it("invalidates both old tabs after reset so drafts, learning writes, and terminals cannot return", async () => {
    const database = await openDatabase("reset-stale-tabs");
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(database);
    await Promise.all([first.initializeDataAccess(), second.initializeDataAccess()]);
    await first.commitCheckpoint(checkpoint("before-reset", 0));
    await first.clearLearningProgress();

    await expect(second.commitCheckpoint(checkpoint("before-reset", 2)))
      .rejects.toBeInstanceOf(LocalDataChangedError);
    await expect(first.commitCheckpoint(checkpoint("before-reset", 1)))
      .rejects.toBeInstanceOf(LocalDataChangedError);
    await expect(second.saveReviewState({
      cardId: "card-1", stage: 1, dueAt: "2026-08-02T00:00:00.000Z", streak: 1, lapseCount: 0,
    })).rejects.toBeInstanceOf(LocalDataChangedError);
    await expect(second.commitTerminal({
      evidence: sessionEvidence("before-reset", "2026-08-01T00:05:00.000Z"),
    })).rejects.toBeInstanceOf(LocalDataChangedError);
    await expect(database.practiceSessionCheckpoints.count()).resolves.toBe(0);
    await expect(database.reviewStates.count()).resolves.toBe(0);
    await expect(database.practiceSessionEvidence.count()).resolves.toBe(0);
    const fresh = new DexieTrainingRepository(database);
    await expect(fresh.acquirePracticeOwnership()).resolves.toMatchObject({ status: "owned" });
    await expect(fresh.commitCheckpoint(checkpoint("after-reset", 0))).resolves.toBe("stored");
    database.close();
  });

  it("does not let a different session overwrite the unique active checkpoint", async () => {
    const database = await openDatabase("different-sessions");
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(database);
    await first.commitCheckpoint(checkpoint("session-a", 0));
    await expect(second.commitCheckpoint(checkpoint("session-b", 0))).resolves.toBe("conflict");
    await expect(second.loadActiveCheckpoint()).resolves.toMatchObject({ sessionId: "session-a" });
    database.close();
  });

  it("rejects stale learning writes after restore and never imports a page lease", async () => {
    const database = await openDatabase("restore-generation");
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(database);
    await database.appPreferences.put({
      id: "device", theme: "system", speechVoiceUri: null, keySoundMuted: false,
      fingerGuideMode: "auto", quickStart: null,
    });
    await Promise.all([first.initializeDataAccess(), second.initializeDataAccess()]);
    await second.acquirePracticeOwnership();
    expect((await database.appMetadata.get("device"))?.practiceOwnershipEpoch).toBe(1);
    const backup = await first.readFullBackup("2026-08-01T00:00:00.000Z");
    expect(backup.learning).not.toHaveProperty("dataGeneration");
    expect(backup.learning).not.toHaveProperty("practiceLease");
    expect(JSON.stringify(backup)).not.toContain("practiceOwnershipEpoch");
    await first.replaceAllData(backup);

    await expect(second.saveSentenceLearningState({
      cardId: "old-card", introducedAt: "2026-08-01T00:00:00.000Z", acquisitionStatus: "needs-guided",
    })).rejects.toBeInstanceOf(LocalDataChangedError);
    await expect(second.savePracticeWrite({
      logEntry: {
        kind: "attempt", id: "turn-attempt:stale:0", turnId: "stale", cardId: "old-card",
        phase: "independent-recall", submissionIndex: 0, submittedAt: "2026-08-01T00:02:00.000Z",
        answer: "Old answer.", outcome: "perfect", accuracy: 1, answerWasRevealed: false,
        hadEdits: false, audioPlayCount: 0, durationMs: 1, supportLevelUsed: 0,
        supportKindsUsed: [], receivedCorrection: false,
      },
    })).rejects.toBeInstanceOf(LocalDataChangedError);
    await expect(database.sentenceLearningStates.count()).resolves.toBe(0);
    await expect(database.practiceLog.count()).resolves.toBe(0);
    await expect(database.appMetadata.get("device")).resolves.toMatchObject({ dataGeneration: 1 });
    expect((await database.appMetadata.get("device"))?.practiceLease).toBeUndefined();
    expect((await database.appMetadata.get("device"))?.practiceOwnershipEpoch).toBeUndefined();
    database.close();
  });

  it("allows a fresh tab to recover an expired lease while rejecting the expired owner", async () => {
    const database = await openDatabase("expired-lease");
    let now = new Date("2026-08-01T00:00:00.000Z");
    const first = new DexieTrainingRepository(database, () => now);
    const second = new DexieTrainingRepository(database, () => now);
    const firstLease = await first.acquirePracticeOwnership();
    if (firstLease.status !== "owned") throw new Error("Expected ownership");
    await first.commitCheckpoint(checkpoint("resumable", 0));
    now = new Date(now.getTime() + 30_001);
    const replacementLease = await second.acquirePracticeOwnership();
    expect(replacementLease.status).toBe("owned");
    await expect(first.renewPracticeOwnership(firstLease.token))
      .rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(first.commitCheckpoint(checkpoint("resumable", 1)))
      .rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(second.loadActiveCheckpoint()).resolves.toMatchObject({ sessionId: "resumable", revision: 0 });
    database.close();
  });

  it("rolls back reset generation and ownership together when clearing fails", async () => {
    const database = await openDatabase("reset-generation-rollback");
    const store = new DexieTrainingRepository(database);
    const lease = await store.acquirePracticeOwnership();
    if (lease.status !== "owned") throw new Error("Expected ownership");
    await store.commitCheckpoint(checkpoint("keep-session", 0));
    const failedClear = vi.spyOn(database.practiceLog, "clear")
      .mockRejectedValueOnce(new Error("injected reset failure"));
    await expect(store.clearLearningProgress()).rejects.toThrow("injected reset failure");
    failedClear.mockRestore();
    await expect(store.renewPracticeOwnership(lease.token)).resolves.toMatchObject({ token: lease.token });
    await expect(store.commitCheckpoint(checkpoint("keep-session", 1))).resolves.toBe("stored");
    expect((await database.appMetadata.get("device"))?.dataGeneration ?? 0).toBe(0);
    database.close();
  });

  it("creates one measurement epoch for a new local database", async () => {
    const database = await openDatabase("measurement-epoch");

    await expect(new DexieTrainingRepository(database).getMeasurementEpoch())
      .resolves.toBe("2026-08-01T00:00:00.000Z");
    await expect(database.appMetadata.count()).resolves.toBe(1);
    database.close();
  });

  it("stores one checkpoint revision, ignores the same revision, and rejects a lower revision", async () => {
    const database = await openDatabase("checkpoint-revisions");
    const store = new DexieTrainingRepository(database);
    const revisionTwo = checkpoint("session-1", 2, "original draft");

    await expect(store.commitCheckpoint({ ...revisionTwo, revision: -1 }))
      .resolves.toBe("stale");
    await expect(store.loadActiveCheckpoint()).resolves.toBeUndefined();
    await expect(store.commitCheckpoint(revisionTwo)).resolves.toBe("stored");
    await expect(store.commitCheckpoint({
      ...revisionTwo,
      draft: "must not replace the stored revision",
    })).resolves.toBe("unchanged");
    await expect(store.commitCheckpoint({
      ...revisionTwo,
      revision: 1,
    })).resolves.toBe("stale");

    await expect(store.loadActiveCheckpoint()).resolves.toMatchObject({
      sessionId: "session-1",
      revision: 2,
      draft: "original draft",
    });
    database.close();
  });

  it("discards a legacy checkpoint unconditionally and a revisioned checkpoint only by matching session", async () => {
    const database = await openDatabase("discard-checkpoint");
    const store = new DexieTrainingRepository(database);
    await database.practiceSessionCheckpoints.put({
      id: "active",
      schemaVersion: 1,
      updatedAt: "2026-08-01T00:00:00.000Z",
    } as never);

    await expect(store.discardActiveCheckpoint()).resolves.toBe(true);
    await expect(store.discardActiveCheckpoint()).resolves.toBe(false);

    await store.commitCheckpoint(checkpoint("session-1", 1));
    await expect(store.discardActiveCheckpoint("another-session")).resolves.toBe(false);
    await expect(store.loadActiveCheckpoint()).resolves.toMatchObject({ sessionId: "session-1" });
    await expect(store.discardActiveCheckpoint("session-1")).resolves.toBe(true);
    await expect(store.loadActiveCheckpoint()).resolves.toBeUndefined();
    database.close();
  });

  it("atomically commits terminal evidence, removes only its matching checkpoint, and updates Quick Start", async () => {
    const database = await openDatabase("terminal-commit");
    const store = new DexieTrainingRepository(database);
    await database.appPreferences.put({
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: null,
    });
    await store.commitCheckpoint(checkpoint("quick-start-session", 3));
    const evidence = sessionEvidence("quick-start-session", "2026-08-01T00:05:00.000Z", {
      kind: "completed",
      reason: "quick-start-complete",
    }, "quick-start-v1");

    await expect(store.commitTerminal({
      evidence,
      quickStartPreference: { version: 1, status: "completed" },
    })).resolves.toBe("created");
    await expect(store.getEvidence(evidence.sessionId)).resolves.toEqual(evidence);
    await expect(store.loadActiveCheckpoint()).resolves.toBeUndefined();
    await expect(database.appPreferences.get("device")).resolves.toMatchObject({
      quickStart: { version: 1, status: "completed" },
    });

    await expect(store.commitTerminal({
      evidence,
      quickStartPreference: { version: 1, status: "completed" },
    })).resolves.toBe("existing");
    await expect(store.commitCheckpoint(checkpoint("quick-start-session", 4)))
      .resolves.toBe("terminal");
    database.close();
  });

  it("keeps the original terminal record when a retry conflicts", async () => {
    const database = await openDatabase("terminal-conflict");
    const store = new DexieTrainingRepository(database);
    const evidence = sessionEvidence("session-1", "2026-08-01T00:05:00.000Z");
    await store.commitTerminal({ evidence });

    await expect(store.commitTerminal({
      evidence: {
        ...evidence,
        terminal: { kind: "abandoned", reason: "start-over" },
      },
    })).resolves.toBe("conflict");
    await expect(store.getEvidence("session-1")).resolves.toEqual(evidence);
    database.close();
  });

  it("rolls back evidence and checkpoint deletion when the optional preference update fails", async () => {
    const database = await openDatabase("terminal-rollback");
    const store = new DexieTrainingRepository(database);
    await database.appPreferences.put({
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: null,
    });
    await store.commitCheckpoint(checkpoint("session-1", 1));
    const evidence = sessionEvidence("session-1", "2026-08-01T00:05:00.000Z");
    vi.spyOn(database.appPreferences, "put").mockRejectedValueOnce(new Error("injected failure"));

    await expect(store.commitTerminal({
      evidence,
      quickStartPreference: { version: 1, status: "completed" },
    })).rejects.toThrow("injected failure");

    await expect(store.getEvidence("session-1")).resolves.toBeUndefined();
    await expect(store.loadActiveCheckpoint()).resolves.toMatchObject({ sessionId: "session-1" });
    database.close();
  });

  it("lists historical evidence even when its catalog identifiers are dangling", async () => {
    const database = await openDatabase("evidence-history");
    const store = new DexieTrainingRepository(database);
    const later = sessionEvidence("later", "2026-08-02T00:05:00.000Z");
    const earlier = {
      ...sessionEvidence("earlier", "2026-08-01T00:05:00.000Z"),
      scope: { kind: "lesson", courseId: "removed-course", lessonId: "removed-lesson", mode: "learn" },
    } satisfies PracticeSessionEvidence;
    await store.commitTerminal({ evidence: later });
    await store.commitTerminal({ evidence: earlier });

    await expect(store.listEvidence()).resolves.toEqual([earlier, later]);
    database.close();
  });
});

function checkpoint(
  sessionId: string,
  revision: number,
  draft = "",
): RevisionedPracticeSessionCheckpoint {
  return {
    id: "active",
    schemaVersion: 2,
    sessionId,
    roundId: `round-${sessionId}`,
    entryPoint: "standard",
    startedAt: "2026-08-01T00:00:00.000Z",
    engagedAt: null,
    revision,
    scope: { kind: "review" },
    scopeKey: "review:all",
    catalogFingerprint: "catalog-v1",
    itinerary: [],
    currentOccurrenceId: "occurrence-1",
    draft,
    selectionStart: draft.length,
    selectionEnd: draft.length,
    turn: {
      turnId: "turn-1",
      phase: "review-recall",
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
      reviewFailureRecorded: false,
      submissionIndex: 0,
    },
    elapsedSeconds: 0,
    itemElapsedSeconds: 0,
    stats: {
      completedCount: 0,
      perfectCount: 0,
      closeCount: 0,
      retryCount: 0,
      skippedCount: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      audioPlays: 0,
      revealed: 0,
      accuracyTotal: 0,
      returnCounts: {},
      pendingReturns: [],
    },
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
    updatedAt: "2026-08-01T00:01:00.000Z",
  };
}

function sessionEvidence(
  sessionId: string,
  endedAt: string,
  terminal: PracticeSessionEvidence["terminal"] = {
    kind: "completed",
    reason: "scope-complete",
  },
  entryPoint: PracticeSessionEvidence["entryPoint"] = "standard",
): PracticeSessionEvidence {
  return {
    schemaVersion: 1,
    sessionId,
    roundId: `round-${sessionId}`,
    scope: { kind: "review" },
    entryPoint,
    startedAt: "2026-08-01T00:00:00.000Z",
    engagedAt: "2026-08-01T00:01:00.000Z",
    endedAt,
    terminal,
    round: {
      initialOccurrenceIds: ["occurrence-1"],
      scheduledOccurrenceIds: ["occurrence-1"],
      attemptedOccurrenceIds: ["occurrence-1"],
      completedOccurrenceIds: ["occurrence-1"],
      skippedOccurrenceIds: [],
      remainingOccurrenceIds: [],
      dueReviewScheduledOccurrenceIds: ["occurrence-1"],
      dueReviewCompletedOccurrenceIds: ["occurrence-1"],
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

async function openDatabase(label: string): Promise<UtterLoopDatabase> {
  const name = `utterloop-session-store-${label}-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const database = new UtterLoopDatabase(name, () => new Date("2026-08-01T00:00:00.000Z"));
  await database.open();
  return database;
}
