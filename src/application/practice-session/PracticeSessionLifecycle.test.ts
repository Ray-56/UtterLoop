import { describe, expect, it } from "vitest";
import type {
  PracticeSessionCheckpointCommitResult,
  PracticeSessionStore,
  PracticeSessionTerminalCommit,
  PracticeSessionTerminalCommitResult,
  RevisionedPracticeSessionCheckpoint,
} from "../ports/PracticeSessionStore";
import type { PracticeSessionEvidence } from "../../domain/practice/PracticeSessionEvidence";
import {
  PracticeSessionLifecycle,
  type PracticeSessionCheckpointSeed,
} from "./PracticeSessionLifecycle";
import type { PracticeSessionCheckpoint } from "./PracticeSessionCheckpoint";
import type { PracticeSessionCheckpointV1 } from "./PracticeSessionCheckpoint";

describe("PracticeSessionLifecycle.open", () => {
  it("opens a new revisioned session with stable identities and occurrence context", async () => {
    const store = new MemoryPracticeSessionStore();
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T08:00:00.000Z"),
      createId: (kind) => kind === "session" ? "session-1" : "round-1",
    });

    const result = await lifecycle.open({
      checkpoint: checkpointSeed(),
      entryPoint: "standard",
    });

    expect(result.status).toBe("opened");
    expect(result.checkpoint).toMatchObject({
      schemaVersion: 2,
      sessionId: "session-1",
      roundId: "round-1",
      entryPoint: "standard",
      startedAt: "2026-08-01T08:00:00.000Z",
      engagedAt: null,
      revision: 0,
    });
    expect(result.contextByOccurrenceId).toEqual({
      "occurrence-1": {
        sessionId: "session-1",
        roundId: "round-1",
        occurrenceId: "occurrence-1",
        queueReason: "due-review",
        scheduledReviewDueAt: "2026-08-01T07:00:00.000Z",
      },
    });
    expect(store.activeCheckpoint).toEqual(result.checkpoint);
  });

  it("resumes a compatible v2 checkpoint without changing its identity", async () => {
    const store = new MemoryPracticeSessionStore();
    const first = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T08:00:00.000Z"),
      createId: (kind) => kind === "session" ? "session-stable" : "round-stable",
    });
    const opened = await first.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    const resumed = await new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: () => {
        throw new Error("resume must not allocate identity");
      },
    }).open({ checkpoint: checkpointSeed(), entryPoint: "standard" });

    expect(resumed.status).toBe("resumed");
    expect(resumed.checkpoint).toEqual(opened.checkpoint);
    expect(resumed.contextByOccurrenceId["occurrence-1"]).toMatchObject({
      sessionId: "session-stable",
      roundId: "round-stable",
    });
  });

  it("validates and upgrades a compatible v1 checkpoint before allocating durable identity", async () => {
    const store = new MemoryPracticeSessionStore();
    store.activeCheckpoint = legacyCheckpoint();
    const allocated: string[] = [];
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => {
        allocated.push(kind);
        return kind === "session" ? "session-upgraded" : "round-upgraded";
      },
    });

    const result = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });

    expect(result.status).toBe("upgraded");
    expect(allocated).toEqual(["session", "round"]);
    expect(result.checkpoint).toMatchObject({
      schemaVersion: 2,
      sessionId: "session-upgraded",
      roundId: "round-upgraded",
      revision: 0,
      itinerary: [{
        id: "occurrence-1",
        queueReason: "due-review",
        scheduledReviewDueAt: "2026-08-01T07:00:00.000Z",
      }],
    });
    expect(store.activeCheckpoint).toEqual(result.checkpoint);
  });

  it("upgrades a valid v1 checkpoint that already contains an in-round return", async () => {
    const legacy = legacyCheckpoint();
    legacy.itinerary.push({
      ...structuredClone(legacy.itinerary[0]),
      id: "occurrence-return",
      returnIndex: 1,
      status: "ready",
      turn: {
        ...structuredClone(legacy.itinerary[0].turn),
        turnId: "turn-return",
        phase: "independent-recall",
      },
    });
    const store = new MemoryPracticeSessionStore();
    store.activeCheckpoint = legacy;
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => `${kind}-upgraded-return`,
    });

    const result = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });

    expect(result.status).toBe("upgraded");
    expect(result.checkpoint.itinerary.map((occurrence) => occurrence.id)).toEqual([
      "occurrence-1",
      "occurrence-return",
    ]);
    expect(result.checkpoint.round.scheduledOccurrenceIds).toEqual([
      "occurrence-1",
      "occurrence-return",
    ]);
  });

  it("discards an invalid legacy checkpoint without attributing historical identity", async () => {
    const store = new MemoryPracticeSessionStore();
    store.activeCheckpoint = {
      ...legacyCheckpoint(),
      currentOccurrenceId: "missing-occurrence",
    };
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => kind === "session" ? "session-fresh" : "round-fresh",
    });

    const result = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });

    expect(result.status).toBe("opened");
    expect(result.checkpoint).toMatchObject({
      sessionId: "session-fresh",
      startedAt: "2026-08-01T09:00:00.000Z",
      engagedAt: null,
    });
    expect(store.discardCount).toBe(1);
    expect(store.evidence.size).toBe(0);
  });

  it("requires explicit replacement before an engaged different-scope session can be opened", async () => {
    const store = new MemoryPracticeSessionStore();
    let allocation = 0;
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => `${kind}-${++allocation}`,
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    const engaged = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "text-input",
    });

    const replacement = await lifecycle.open({
      checkpoint: focusedCheckpointSeed(),
      entryPoint: "standard",
    });

    expect(replacement.status).toBe("replacement-required");
    expect(replacement.checkpoint.sessionId).toBe(engaged.checkpoint.sessionId);
    expect(allocation).toBe(2);
    expect(store.activeCheckpoint).toEqual(engaged.checkpoint);
  });

  it("opens the requested scope only after the caller explicitly commits replacement", async () => {
    const store = new MemoryPracticeSessionStore();
    let allocation = 0;
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => `${kind}-replacement-${++allocation}`,
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    const engaged = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "text-input",
    });
    const blocked = await lifecycle.open({
      checkpoint: focusedCheckpointSeed(),
      entryPoint: "standard",
    });

    expect(blocked.status).toBe("replacement-required");
    expect(store.evidence.size).toBe(0);
    await lifecycle.commit({
      kind: "terminal",
      checkpoint: blocked.checkpoint,
      terminal: { kind: "abandoned", reason: "replaced" },
    });
    const replacement = await lifecycle.open({
      checkpoint: focusedCheckpointSeed(),
      entryPoint: "standard",
    });

    expect(replacement.status).toBe("opened");
    expect(replacement.checkpoint.sessionId).not.toBe(engaged.checkpoint.sessionId);
    expect(store.evidence.get(engaged.checkpoint.sessionId)?.terminal).toEqual({
      kind: "abandoned",
      reason: "replaced",
    });
  });

  it("does not resume an engaged Quick Start as a standard session with the same scope", async () => {
    const store = new MemoryPracticeSessionStore();
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => `${kind}-entry-point`,
    });
    const opened = await lifecycle.open({
      checkpoint: checkpointSeed(),
      entryPoint: "quick-start-v1",
    });
    await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "first-exposure",
    });

    const replacement = await lifecycle.open({
      checkpoint: checkpointSeed(),
      entryPoint: "standard",
    });

    expect(replacement.status).toBe("replacement-required");
    expect(replacement.checkpoint.entryPoint).toBe("quick-start-v1");
  });

  it("discards a corrupt v2 row before deriving occurrence context", async () => {
    const store = new MemoryPracticeSessionStore();
    let allocation = 0;
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => `${kind}-fresh-${++allocation}`,
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    store.activeCheckpoint = {
      ...opened.checkpoint,
      itinerary: opened.checkpoint.itinerary.map((occurrence) => ({
        ...occurrence,
        queueReason: undefined,
      })),
    };

    const recovered = await lifecycle.open({
      checkpoint: checkpointSeed(),
      entryPoint: "standard",
    });

    expect(recovered.status).toBe("opened");
    expect(recovered.checkpoint.sessionId).not.toBe(opened.checkpoint.sessionId);
    expect(store.discardCount).toBe(1);
  });

  it("invalidates a catalog-mismatched active session before opening the requested scope", async () => {
    const store = new MemoryPracticeSessionStore();
    let now = "2026-08-01T08:00:00.000Z";
    let allocation = 0;
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date(now),
      createId: (kind) => `${kind}-catalog-${++allocation}`,
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    const engaged = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "text-input",
    });
    now = "2026-08-01T09:00:00.000Z";

    const recovered = await lifecycle.open({
      checkpoint: focusedCheckpointSeed(),
      entryPoint: "standard",
      catalogFingerprintForScope: () => "changed-catalog",
    });

    expect(recovered.status).toBe("opened");
    expect(store.evidence.get(engaged.checkpoint.sessionId)?.terminal).toEqual({
      kind: "invalidated",
      reason: "catalog-mismatch",
    });
  });

  it("expires an engaged checkpoint after the durable resume window", async () => {
    const store = new MemoryPracticeSessionStore();
    let now = "2026-06-01T08:00:00.000Z";
    let allocation = 0;
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date(now),
      createId: (kind) => `${kind}-expiry-${++allocation}`,
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    const engaged = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "text-input",
    });
    now = "2026-08-01T09:00:00.000Z";

    const recovered = await lifecycle.open({
      checkpoint: focusedCheckpointSeed(),
      entryPoint: "standard",
    });

    expect(recovered.status).toBe("opened");
    expect(store.evidence.get(engaged.checkpoint.sessionId)?.terminal).toEqual({
      kind: "abandoned",
      reason: "expired",
    });
  });

  it("invalidates an active session containing a newly mastered occurrence", async () => {
    const store = new MemoryPracticeSessionStore();
    let allocation = 0;
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T09:00:00.000Z"),
      createId: (kind) => `${kind}-mastered-${++allocation}`,
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    const engaged = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "text-input",
    });

    const recovered = await lifecycle.open({
      checkpoint: focusedCardTwoCheckpointSeed(),
      entryPoint: "standard",
      masteredCardIds: ["card-1"],
    });

    expect(recovered.status).toBe("opened");
    expect(recovered.checkpoint.scope).toEqual({ kind: "focused", cardId: "card-2" });
    expect(store.evidence.get(engaged.checkpoint.sessionId)?.terminal).toEqual({
      kind: "invalidated",
      reason: "corrupt",
    });
  });
});

describe("PracticeSessionLifecycle.commit", () => {
  it("marks the first accepted engagement and advances checkpoint revisions monotonically", async () => {
    const store = new MemoryPracticeSessionStore();
    let now = "2026-08-01T08:00:00.000Z";
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date(now),
      createId: (kind) => kind === "session" ? "session-commit" : "round-commit",
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });

    now = "2026-08-01T08:01:00.000Z";
    const engaged = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "text-input",
    });
    now = "2026-08-01T08:02:00.000Z";
    const autosaved = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: engaged.checkpoint,
    });

    expect(engaged).toMatchObject({
      status: "stored",
      checkpoint: {
        revision: 1,
        engagedAt: "2026-08-01T08:01:00.000Z",
        updatedAt: "2026-08-01T08:01:00.000Z",
      },
    });
    expect(autosaved).toMatchObject({
      status: "stored",
      checkpoint: {
        revision: 2,
        engagedAt: "2026-08-01T08:01:00.000Z",
        updatedAt: "2026-08-01T08:02:00.000Z",
      },
    });
    expect(store.activeCheckpoint).toEqual(autosaved.checkpoint);
  });

  it("records an attempted and completed due Review occurrence in the active round", async () => {
    const store = new MemoryPracticeSessionStore();
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T08:01:00.000Z"),
      createId: (kind) => kind === "session" ? "session-round" : "round-round",
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });

    const committed = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "submission",
      roundEvents: [
        { kind: "attempted", occurrenceId: "occurrence-1" },
        { kind: "completed", occurrenceId: "occurrence-1" },
      ],
    });

    expect(committed.checkpoint.round).toMatchObject({
      attemptedOccurrenceIds: ["occurrence-1"],
      completedOccurrenceIds: ["occurrence-1"],
      skippedOccurrenceIds: [],
      remainingOccurrenceIds: [],
      dueReviewScheduledOccurrenceIds: ["occurrence-1"],
      dueReviewCompletedOccurrenceIds: ["occurrence-1"],
    });
  });

  it("records First Exposure, First Pass, skip, and discriminated requeue evidence", async () => {
    const store = new MemoryPracticeSessionStore();
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date("2026-08-01T08:01:00.000Z"),
      createId: (kind) => kind === "session" ? "session-events" : "round-events",
    });
    const seed = checkpointSeed();
    seed.itinerary.push({
      ...structuredClone(seed.itinerary[0]),
      id: "occurrence-return",
      returnIndex: 1,
      status: "ready",
      turn: {
        ...structuredClone(seed.itinerary[0].turn),
        turnId: "turn-return",
        phase: "independent-recall",
      },
    });
    seed.round.scheduledOccurrenceIds.push("occurrence-return");
    seed.round.remainingOccurrenceIds.push("occurrence-return");
    const opened = await lifecycle.open({ checkpoint: seed, entryPoint: "standard" });

    const committed = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "first-exposure",
      roundEvents: [
        { kind: "first-exposure", cardId: "card-1" },
        { kind: "first-pass", cardId: "card-1" },
        { kind: "skipped", occurrenceId: "occurrence-1" },
        { kind: "requeue-inserted", occurrenceId: "occurrence-return" },
        { kind: "requeue-deferred-no-room", cardId: "card-2" },
        { kind: "requeue-cap-reached", cardId: "card-3" },
      ],
    });

    expect(committed.checkpoint.round).toMatchObject({
      scheduledOccurrenceIds: ["occurrence-1", "occurrence-return"],
      skippedOccurrenceIds: ["occurrence-1"],
      remainingOccurrenceIds: ["occurrence-return"],
      introducedCardIds: ["card-1"],
      firstPassCardIds: ["card-1"],
      requeue: {
        insertedReturnOccurrenceIds: ["occurrence-return"],
        deferredNoRoomCardIds: ["card-2"],
        capReachedCardIds: ["card-3"],
      },
    });
  });

  it("atomically commits immutable target-free terminal evidence for a completed round", async () => {
    const store = new MemoryPracticeSessionStore();
    let now = "2026-08-01T08:00:00.000Z";
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date(now),
      createId: (kind) => kind === "session" ? "session-terminal" : "round-terminal",
    });
    const opened = await lifecycle.open({
      checkpoint: { ...checkpointSeed(), draft: "learner draft must not escape" },
      entryPoint: "standard",
    });
    now = "2026-08-01T08:01:00.000Z";
    const active = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: opened.checkpoint,
      engagement: "submission",
      roundEvents: [
        { kind: "attempted", occurrenceId: "occurrence-1" },
        { kind: "completed", occurrenceId: "occurrence-1" },
      ],
    });
    now = "2026-08-01T08:02:00.000Z";

    const terminal = await lifecycle.commit({
      kind: "terminal",
      checkpoint: active.checkpoint,
      terminal: { kind: "completed", reason: "round-complete" },
    });

    expect(terminal.status).toBe("created");
    expect(terminal.evidence).toEqual({
      schemaVersion: 1,
      sessionId: "session-terminal",
      roundId: "round-terminal",
      scope: { kind: "review" },
      entryPoint: "standard",
      startedAt: "2026-08-01T08:00:00.000Z",
      engagedAt: "2026-08-01T08:01:00.000Z",
      endedAt: "2026-08-01T08:02:00.000Z",
      terminal: { kind: "completed", reason: "round-complete" },
      round: active.checkpoint.round,
    });
    expect(Object.isFrozen(terminal.evidence)).toBe(true);
    expect(JSON.stringify(terminal.evidence)).not.toContain("learner draft must not escape");
    expect(store.activeCheckpoint).toBeUndefined();
  });

  it("keeps terminal commits idempotent, reports conflicts, and rejects late checkpoint saves", async () => {
    const store = new MemoryPracticeSessionStore();
    let now = "2026-08-01T08:00:00.000Z";
    const lifecycle = new PracticeSessionLifecycle(store, {
      now: () => new Date(now),
      createId: (kind) => kind === "session" ? "session-idempotent" : "round-idempotent",
    });
    const opened = await lifecycle.open({ checkpoint: checkpointSeed(), entryPoint: "standard" });
    const completedCheckpoint = {
      ...opened.checkpoint,
      round: {
        ...opened.checkpoint.round,
        completedOccurrenceIds: ["occurrence-1"],
        remainingOccurrenceIds: [],
      },
    };
    now = "2026-08-01T08:05:00.000Z";
    const first = await lifecycle.commit({
      kind: "terminal",
      checkpoint: completedCheckpoint,
      terminal: { kind: "completed", reason: "scope-complete" },
    });
    const duplicate = await lifecycle.commit({
      kind: "terminal",
      checkpoint: completedCheckpoint,
      terminal: { kind: "completed", reason: "scope-complete" },
    });
    const conflict = await lifecycle.commit({
      kind: "terminal",
      checkpoint: completedCheckpoint,
      terminal: { kind: "abandoned", reason: "replaced" },
    });
    const lateSave = await lifecycle.commit({
      kind: "checkpoint",
      checkpoint: completedCheckpoint,
    });

    expect(first.status).toBe("created");
    expect(duplicate.status).toBe("existing");
    expect(conflict.status).toBe("conflict");
    expect(lateSave.status).toBe("terminal");
    expect(store.activeCheckpoint).toBeUndefined();
  });
});

function checkpointSeed(): PracticeSessionCheckpointSeed {
  return {
    id: "active",
    scope: { kind: "review" },
    scopeKey: "review:all",
    catalogFingerprint: "v1-catalog",
    itinerary: [{
      id: "occurrence-1",
      cardId: "card-1",
      originalIndex: 0,
      returnIndex: 0,
      queueReason: "due-review",
      scheduledReviewDueAt: "2026-08-01T07:00:00.000Z",
      status: "ready",
      turn: {
        turnId: "turn-1",
        phase: "review-recall",
        supportLevelUsed: 0,
        supportKindsUsed: [],
        receivedCorrection: false,
        reviewFailureRecorded: false,
        submissionIndex: 0,
      },
    }],
    currentOccurrenceId: "occurrence-1",
    draft: "",
    selectionStart: 0,
    selectionEnd: 0,
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
      initialOccurrenceIds: ["occurrence-1"],
      scheduledOccurrenceIds: ["occurrence-1"],
      attemptedOccurrenceIds: [],
      completedOccurrenceIds: [],
      skippedOccurrenceIds: [],
      remainingOccurrenceIds: ["occurrence-1"],
      dueReviewScheduledOccurrenceIds: ["occurrence-1"],
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

function focusedCheckpointSeed(): PracticeSessionCheckpointSeed {
  const seed = checkpointSeed();
  return {
    ...seed,
    scope: { kind: "focused", cardId: "card-1" },
    scopeKey: "focused:card:card-1",
    catalogFingerprint: "v1-focused",
    itinerary: seed.itinerary.map((occurrence) => ({
      ...occurrence,
      queueReason: "focused-practice",
      scheduledReviewDueAt: undefined,
    })),
    round: {
      ...seed.round,
      dueReviewScheduledOccurrenceIds: [],
    },
  };
}

function focusedCardTwoCheckpointSeed(): PracticeSessionCheckpointSeed {
  const seed = focusedCheckpointSeed();
  const itinerary = seed.itinerary.map((occurrence) => ({
    ...occurrence,
    id: "occurrence-card-2",
    cardId: "card-2",
    turn: { ...occurrence.turn, turnId: "turn-card-2" },
  }));
  return {
    ...seed,
    scope: { kind: "focused", cardId: "card-2" },
    scopeKey: "focused:card:card-2",
    catalogFingerprint: "v1-focused-card-2",
    itinerary,
    currentOccurrenceId: "occurrence-card-2",
    turn: { ...seed.turn, turnId: "turn-card-2" },
    round: {
      ...seed.round,
      initialOccurrenceIds: ["occurrence-card-2"],
      scheduledOccurrenceIds: ["occurrence-card-2"],
      remainingOccurrenceIds: ["occurrence-card-2"],
    },
  };
}

function legacyCheckpoint(): PracticeSessionCheckpointV1 {
  const seed = checkpointSeed();
  const { round: _round, ...legacy } = structuredClone(seed);
  return {
    ...legacy,
    schemaVersion: 1,
    itinerary: seed.itinerary.map(({ queueReason: _queueReason, scheduledReviewDueAt: _dueAt, ...item }) => item),
    updatedAt: "2026-08-01T07:55:00.000Z",
  };
}

class MemoryPracticeSessionStore implements PracticeSessionStore {
  activeCheckpoint: PracticeSessionCheckpoint | undefined;
  evidence = new Map<string, PracticeSessionEvidence>();
  discardCount = 0;

  async loadActiveCheckpoint() { return this.activeCheckpoint; }
  async discardActiveCheckpoint() {
    const existed = Boolean(this.activeCheckpoint);
    if (existed) this.discardCount += 1;
    this.activeCheckpoint = undefined;
    return existed;
  }
  async commitCheckpoint(checkpoint: RevisionedPracticeSessionCheckpoint): Promise<PracticeSessionCheckpointCommitResult> {
    if (this.evidence.has(checkpoint.sessionId)) return "terminal";
    if (this.activeCheckpoint?.schemaVersion === 2
      && this.activeCheckpoint.sessionId === checkpoint.sessionId) {
      if (checkpoint.revision < this.activeCheckpoint.revision) return "stale";
      if (checkpoint.revision === this.activeCheckpoint.revision) return "unchanged";
    }
    this.activeCheckpoint = structuredClone(checkpoint);
    return "stored";
  }
  async commitTerminal(commit: PracticeSessionTerminalCommit): Promise<PracticeSessionTerminalCommitResult> {
    const existing = this.evidence.get(commit.evidence.sessionId);
    if (existing) {
      return JSON.stringify(existing) === JSON.stringify(commit.evidence) ? "existing" : "conflict";
    }
    this.evidence.set(commit.evidence.sessionId, structuredClone(commit.evidence));
    this.activeCheckpoint = undefined;
    return "created";
  }
  async getEvidence(sessionId: string) { return this.evidence.get(sessionId); }
  async listEvidence() { return [...this.evidence.values()]; }
  async getMeasurementEpoch() { return "2026-08-01T00:00:00.000Z"; }
}
