import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RevisionedPracticeSessionCheckpoint,
} from "../../../application/ports/PracticeSessionStore";
import type { PracticeSessionEvidence } from "../../../domain/practice/PracticeSessionEvidence";
import { DexieTrainingRepository } from "./DexieTrainingRepository";
import { UtterLoopDatabase } from "./UtterLoopDatabase";

const databaseNames: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("Dexie PracticeSessionStore", () => {
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
