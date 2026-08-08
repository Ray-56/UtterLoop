import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { Course } from "../../domain/curriculum/Course";
import {
  catalogFingerprint,
  createPracticeSessionState,
  createResolvedPracticeOccurrence,
  practiceOccurrenceId,
  practiceScopeKey,
  reducePracticeSession,
  resolvePracticeSessionCheckpoint,
  toPracticeSessionCheckpoint,
  validatePracticeSessionCheckpoint,
  type PracticeSessionCatalog,
  type PracticeSessionCheckpoint,
  type PracticeSessionScope,
} from ".";

const now = "2026-07-31T08:00:00.000Z";
const scope: PracticeSessionScope = {
  kind: "lesson",
  courseId: "course-1",
  lessonId: "lesson-1",
  mode: "learn",
};

describe("practice session identity", () => {
  it("canonicalizes every scope without learner or target data", () => {
    expect(practiceScopeKey(scope)).toBe("lesson:course-1:lesson-1:learn");
    expect(practiceScopeKey({ kind: "review" })).toBe("review:all");
    expect(practiceScopeKey({ kind: "review", courseId: "course-1" })).toBe("review:course-1");
    expect(practiceScopeKey({ kind: "course", courseId: "course-1" })).toBe("course:course-1");
    expect(practiceScopeKey({ kind: "vocabulary", cardId: "card-1" })).toBe("vocabulary:card:card-1");
    expect(practiceScopeKey({ kind: "vocabulary", courseId: "course-1" })).toBe("vocabulary:course:course-1");
    expect(practiceScopeKey({ kind: "vocabulary", courseId: "course-1", cardId: "card-1" }))
      .toBe("vocabulary:course:course-1:card:card-1");
    expect(practiceScopeKey({ kind: "vocabulary" })).toBe("vocabulary:all");
    expect(practiceScopeKey({ kind: "focused", cardId: "card-1" }))
      .toBe("focused:card:card-1");
  });

  it("makes stable occurrence IDs unique per original position and return", () => {
    const first = practiceOccurrenceId(scope, "card-1", 0, 0);
    expect(practiceOccurrenceId(scope, "card-1", 0, 0)).toBe(first);
    expect(practiceOccurrenceId(scope, "card-1", 1, 0)).not.toBe(first);
    expect(practiceOccurrenceId(scope, "card-1", 0, 1)).not.toBe(first);
  });

  it("fingerprints only revision, canonical order, IDs, and updatedAt", () => {
    const original = catalog();
    const fingerprint = catalogFingerprint(scope, original);
    const changedTarget = catalog({ cardEnglish: "A secret replacement target." });
    const changedPrompt = catalog({ cardPrompt: "A changed prompt." });
    const changedRevision = catalog({ revision: 2 });
    const changedOrder = catalog({ cardOrder: ["card-2", "card-1", "card-3"] });
    const changedUpdatedAt = catalog({ cardUpdatedAt: "2026-08-01T00:00:00.000Z" });

    expect(catalogFingerprint(scope, changedTarget)).toBe(fingerprint);
    expect(catalogFingerprint(scope, changedPrompt)).toBe(fingerprint);
    expect(catalogFingerprint(scope, changedRevision)).not.toBe(fingerprint);
    expect(catalogFingerprint(scope, changedOrder)).not.toBe(fingerprint);
    expect(catalogFingerprint(scope, changedUpdatedAt)).not.toBe(fingerprint);
    expect(fingerprint).not.toContain(original.cards[0].english);

    const focusedScope = { kind: "focused", cardId: "card-1" } as const;
    const focusedFingerprint = catalogFingerprint(focusedScope, original);
    expect(catalogFingerprint(focusedScope, changedRevision)).toBe(focusedFingerprint);
    expect(catalogFingerprint(focusedScope, changedUpdatedAt)).not.toBe(focusedFingerprint);
  });
});

describe("practice session reducer", () => {
  it("round-trips draft, caret, navigation, phase, support, returns, and stats deterministically", () => {
    let state = stateWithThreeOccurrences();
    state = reducePracticeSession(state, {
      type: "draft-changed",
      draft: "partial answer",
      selectionStart: 4,
      selectionEnd: 9,
    });
    state = reducePracticeSession(state, { type: "support-used", kind: "keywords", level: 2 });
    state = reducePracticeSession(state, { type: "support-used", kind: "pattern", level: 1 });
    state = reducePracticeSession(state, { type: "phase-changed", phase: "guided-recall" });
    state = reducePracticeSession(state, { type: "queue-independent-return" });
    state = reducePracticeSession(state, { type: "command-started", commandKind: "submit" });
    state = reducePracticeSession(state, { type: "command-failed", message: "Storage unavailable" });

    expect(state.draft).toBe("partial answer");
    expect([state.selectionStart, state.selectionEnd]).toEqual([4, 9]);
    expect(state.turn.supportLevelUsed).toBe(2);
    expect(state.turn.supportKindsUsed).toEqual(["keywords", "pattern"]);
    expect(state.stats.returnCounts["card-1"]).toBe(1);
    expect(state.itinerary).toHaveLength(4);
    expect(state.commandRecovery).toMatchObject({ status: "recoverable-error", message: "Storage unavailable" });

    const checkpoint = toPracticeSessionCheckpoint(state);
    expect(checkpoint).not.toHaveProperty("commandRecovery");
    const roundTrip = JSON.parse(JSON.stringify(checkpoint)) as PracticeSessionCheckpoint;
    const resolved = resolvePracticeSessionCheckpoint({
      checkpoint: roundTrip,
      expectedScope: scope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date(now),
    });

    expect(resolved.status).toBe("resume");
    if (resolved.status === "resume") {
      expect(resolved.checkpoint.draft).toBe("partial answer");
      expect(resolved.checkpoint.selectionStart).toBe(4);
      expect(resolved.checkpoint.turn.supportLevelUsed).toBe(2);
      expect(resolved.checkpoint.stats.returnCounts["card-1"]).toBe(1);
    }
  });

  it("keeps support and correction evidence monotonic across previous navigation", () => {
    let state = stateWithThreeOccurrences();
    state = reducePracticeSession(state, { type: "support-used", kind: "answer", level: 1 });
    state = reducePracticeSession(state, { type: "support-used", kind: "pattern", level: 1 });
    state = reducePracticeSession(state, { type: "correction-received" });
    state = reducePracticeSession(state, { type: "navigate", occurrenceId: state.itinerary[1].id });
    state = reducePracticeSession(state, { type: "navigate", occurrenceId: state.itinerary[0].id });

    expect(state.turn.supportLevelUsed).toBe(4);
    expect(state.turn.supportKindsUsed).toEqual(["answer", "pattern", "correction"]);
    expect(state.turn.receivedCorrection).toBe(true);
    expect(state.turn.phase).toBe("corrective-practice");
  });

  it("keeps early schema-v1 checkpoints valid when newer aggregate stats are absent", () => {
    const checkpoint = toPracticeSessionCheckpoint(stateWithThreeOccurrences());
    const {
      audioPlays: _audioPlays,
      revealed: _revealed,
      accuracyTotal: _accuracyTotal,
      ...legacyStats
    } = checkpoint.stats;

    const validation = validatePracticeSessionCheckpoint({
      ...checkpoint,
      stats: legacyStats,
    });

    expect(validation).toMatchObject({
      ok: true,
      checkpoint: {
        stats: {
          audioPlays: 0,
          revealed: 0,
          accuracyTotal: 0,
        },
      },
    });
  });

  it("can inspect a completed previous occurrence without losing its turn evidence or double-counting it", () => {
    let state = stateWithThreeOccurrences();
    const firstOccurrenceId = state.currentOccurrenceId;
    state = reducePracticeSession(state, { type: "support-used", kind: "keywords", level: 2 });
    state = reducePracticeSession(state, { type: "complete-occurrence", outcome: "perfect" });
    expect(state.stats.completedCount).toBe(1);

    state = reducePracticeSession(state, { type: "navigate", occurrenceId: firstOccurrenceId });
    expect(state.turn).toMatchObject({ phase: "guided-recall", supportLevelUsed: 2 });
    state = reducePracticeSession(state, { type: "complete-occurrence", outcome: "perfect" });
    expect(state.stats.completedCount).toBe(1);
  });

  it("keeps a return pending when two intervening turns are unavailable and promotes it after spacing", () => {
    const occurrence = createResolvedPracticeOccurrence({
      scope,
      cardId: "card-1",
      originalIndex: 0,
      phase: "guided-recall",
    });
    let state = createPracticeSessionState({
      scope,
      catalogFingerprint: catalogFingerprint(scope, catalog()),
      itinerary: [occurrence],
      updatedAt: now,
    });

    state = reducePracticeSession(state, { type: "queue-independent-return" });
    expect(state.stats.pendingReturns).toHaveLength(1);
    expect(state.itinerary).toHaveLength(1);

    state = reducePracticeSession(state, { type: "append-occurrence", occurrence: createResolvedPracticeOccurrence({ scope, cardId: "card-2", originalIndex: 1, phase: "guided-recall" }) });
    state = reducePracticeSession(state, { type: "append-occurrence", occurrence: createResolvedPracticeOccurrence({ scope, cardId: "card-3", originalIndex: 2, phase: "guided-recall" }) });
    state = reducePracticeSession(state, { type: "complete-occurrence", outcome: "perfect" });
    state = reducePracticeSession(state, { type: "complete-occurrence", outcome: "perfect" });
    state = reducePracticeSession(state, { type: "complete-occurrence", outcome: "perfect" });

    expect(state.stats.pendingReturns).toEqual([]);
    expect(state.itinerary.at(-1)).toMatchObject({ cardId: "card-1", returnIndex: 1 });
  });
});

describe("checkpoint compatibility and durable reconciliation", () => {
  it("validates and resumes a target-free schema-v2 checkpoint", () => {
    const checkpoint = revisionedCheckpoint();

    expect(validatePracticeSessionCheckpoint(checkpoint)).toMatchObject({
      ok: true,
      checkpoint: {
        schemaVersion: 2,
        sessionId: "session-v2",
        roundId: "round-v2",
        revision: 3,
      },
    });
    expect(resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: scope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date(now),
    })).toMatchObject({ status: "resume", checkpoint: { sessionId: "session-v2" } });
    expect(JSON.stringify({ ...checkpoint, draft: "" })).not.toContain("Target card one.");
  });

  it("resumes a one-card Focused Practice scope as voluntary practice", () => {
    const focusedScope = { kind: "focused", cardId: "card-1" } as const;
    const occurrence = createResolvedPracticeOccurrence({
      scope: focusedScope,
      cardId: "card-1",
      originalIndex: 0,
      phase: "voluntary-practice",
    });
    const checkpoint = toPracticeSessionCheckpoint(createPracticeSessionState({
      scope: focusedScope,
      catalogFingerprint: catalogFingerprint(focusedScope, catalog()),
      itinerary: [occurrence],
      updatedAt: now,
    }));

    expect(resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: focusedScope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date(now),
    })).toMatchObject({
      status: "resume",
      checkpoint: { turn: { phase: "voluntary-practice" } },
    });
  });

  it("resumes a one-card Vocabulary scope that retains its Review Course context", () => {
    const vocabularyScope = {
      kind: "vocabulary",
      courseId: "course-1",
      cardId: "card-1",
    } as const;
    const occurrence = createResolvedPracticeOccurrence({
      scope: vocabularyScope,
      cardId: "card-1",
      originalIndex: 0,
      phase: "voluntary-practice",
    });
    const checkpoint = toPracticeSessionCheckpoint(createPracticeSessionState({
      scope: vocabularyScope,
      catalogFingerprint: catalogFingerprint(vocabularyScope, catalog()),
      itinerary: [occurrence],
      updatedAt: now,
    }));

    expect(resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: vocabularyScope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date(now),
    })).toMatchObject({ status: "resume" });
  });

  it.each([
    ["schema", (checkpoint: PracticeSessionCheckpoint) => ({ ...checkpoint, schemaVersion: 3 }), "unsupported-schema"],
    ["scope", (checkpoint: PracticeSessionCheckpoint) => checkpoint, "scope-mismatch"],
    ["fingerprint", (checkpoint: PracticeSessionCheckpoint) => ({ ...checkpoint, catalogFingerprint: "v1-wrong" }), "catalog-changed"],
    ["stale", (checkpoint: PracticeSessionCheckpoint) => ({ ...checkpoint, updatedAt: "2026-06-01T00:00:00.000Z" }), "stale"],
    ["occurrence", (checkpoint: PracticeSessionCheckpoint) => ({ ...checkpoint, currentOccurrenceId: "missing" }), "unknown-occurrence"],
  ])("discards an incompatible %s checkpoint with a recoverable reason", (_label, mutate, reason) => {
    const checkpoint = mutate(stateWithThreeOccurrences());
    const expectedScope = reason === "scope-mismatch" ? { kind: "review" } as const : scope;
    const result = resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date(now),
    });

    expect(result).toMatchObject({ status: "discard", reason });
  });

  it("discards removed and mastered cards without mutating durable evidence", () => {
    const checkpoint = stateWithThreeOccurrences();
    const removed = resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: scope,
      catalog: { ...catalog(), cards: catalog().cards.filter((card) => card.id !== "card-1") },
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date(now),
    });
    const mastered = resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: scope,
      catalog: catalog(),
      masteredCardIds: ["card-1"],
      durableEvidence: [],
      now: new Date(now),
    });

    expect(removed).toMatchObject({ status: "discard", reason: "card-removed" });
    expect(mastered).toMatchObject({ status: "discard", reason: "card-mastered" });
  });

  it("reconciles an attempt committed before its response was lost", () => {
    const checkpoint = reducePracticeSession(
      stateWithThreeOccurrences(),
      { type: "support-used", kind: "frame", level: 3 },
    );
    const attemptId = `turn-attempt:${checkpoint.turn.turnId}:0`;
    const result = resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: scope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [{
        kind: "attempt",
        id: attemptId,
        turnId: checkpoint.turn.turnId,
        cardId: "card-1",
        submissionIndex: 0,
        phase: "guided-recall",
        supportLevelUsed: 3,
        supportKindsUsed: ["frame"],
        receivedCorrection: false,
      }],
      now: new Date(now),
    });

    expect(result.status).toBe("resume");
    if (result.status === "resume") {
      expect(result.recoveredCommand).toEqual({ kind: "submission", evidenceId: attemptId });
      expect(result.checkpoint.turn.submissionIndex).toBe(1);
      expect(result.checkpoint.turn.supportLevelUsed).toBe(3);
    }
  });

  it("restores monotonic signal evidence without applying another learning consequence", () => {
    const checkpoint = stateWithThreeOccurrences();
    const result = resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: scope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [{
        kind: "signal",
        id: `turn-signal:${checkpoint.turn.turnId}`,
        turnId: checkpoint.turn.turnId,
        cardId: "card-1",
        supportLevelUsed: 4,
        supportKindsUsed: ["answer"],
        reviewFailureRecorded: true,
      }],
      now: new Date(now),
    });

    expect(result.status).toBe("resume");
    if (result.status === "resume") {
      expect(result.recoveredCommand).toBeNull();
      expect(result.checkpoint.turn).toMatchObject({
        phase: "guided-recall",
        supportLevelUsed: 4,
        supportKindsUsed: ["answer"],
        reviewFailureRecorded: true,
        submissionIndex: 0,
      });
    }
  });

  it("discards contradictory submission indexes instead of risking a duplicate write", () => {
    const checkpoint = stateWithThreeOccurrences();
    const result = resolvePracticeSessionCheckpoint({
      checkpoint,
      expectedScope: scope,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [{
        kind: "attempt",
        id: `turn-attempt:${checkpoint.turn.turnId}:2`,
        turnId: checkpoint.turn.turnId,
        cardId: "card-1",
        submissionIndex: 2,
        phase: "guided-recall",
        supportLevelUsed: 0,
        supportKindsUsed: [],
        receivedCorrection: false,
      }],
      now: new Date(now),
    });

    expect(result).toMatchObject({ status: "discard", reason: "submission-conflict" });
  });

  it("stores no target text in checkpoint metadata other than the learner draft", () => {
    const checkpoint = stateWithThreeOccurrences();
    checkpoint.draft = "This learner draft may equal a target.";
    const serializedWithoutDraft = JSON.stringify({ ...checkpoint, draft: "" });

    expect(serializedWithoutDraft).not.toContain("Target card one.");
    expect(serializedWithoutDraft).not.toContain("Target card two.");
    expect(serializedWithoutDraft).not.toContain("Prompt card one.");
  });
});

function stateWithThreeOccurrences() {
  const itinerary = ["card-1", "card-2", "card-3"].map((cardId, originalIndex) => createResolvedPracticeOccurrence({
    scope,
    cardId,
    originalIndex,
    phase: originalIndex === 0 ? "independent-recall" : "guided-recall",
  }));
  return createPracticeSessionState({
    scope,
    catalogFingerprint: catalogFingerprint(scope, catalog()),
    itinerary,
    updatedAt: now,
  });
}

function revisionedCheckpoint(): PracticeSessionCheckpoint {
  const legacy = toPracticeSessionCheckpoint(stateWithThreeOccurrences());
  const itinerary = legacy.itinerary.map((occurrence) => ({
    ...occurrence,
    queueReason: "new-learning" as const,
  }));
  return {
    ...legacy,
    schemaVersion: 2,
    sessionId: "session-v2",
    roundId: "round-v2",
    entryPoint: "standard",
    startedAt: "2026-07-31T07:55:00.000Z",
    engagedAt: "2026-07-31T07:56:00.000Z",
    revision: 3,
    itinerary,
    round: {
      initialOccurrenceIds: itinerary.map((occurrence) => occurrence.id),
      scheduledOccurrenceIds: itinerary.map((occurrence) => occurrence.id),
      attemptedOccurrenceIds: [],
      completedOccurrenceIds: [],
      skippedOccurrenceIds: [],
      remainingOccurrenceIds: itinerary.map((occurrence) => occurrence.id),
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

function catalog(overrides: {
  revision?: number;
  cardOrder?: string[];
  cardUpdatedAt?: string;
  cardEnglish?: string;
  cardPrompt?: string;
} = {}): PracticeSessionCatalog {
  const cards = [
    card("card-1", overrides.cardEnglish ?? "Target card one.", overrides.cardPrompt ?? "Prompt card one.", overrides.cardUpdatedAt),
    card("card-2", "Target card two.", "Prompt card two."),
    card("card-3", "Target card three.", "Prompt card three."),
  ];
  const course: Course = {
    id: "course-1",
    title: "Course",
    description: "Description",
    categoryId: "category",
    tags: [],
    level: { label: "A1", cefrFrom: "A1", cefrTo: "A1" },
    provider: { kind: "original", name: "Test" },
    revision: overrides.revision ?? 1,
    license: { name: "CC0", url: "https://example.com", attribution: "None" },
    units: [{
      id: "unit-1",
      title: "Unit",
      description: "Description",
      lessons: [{
        id: "lesson-1",
        title: "Lesson",
        objective: "Objective",
        cardIds: overrides.cardOrder ?? ["card-1", "card-2", "card-3"],
      }],
    }],
  };
  return { courses: [course], cards };
}

function card(id: string, english: string, prompt: string, updatedAt = "2026-07-30T00:00:00.000Z"): SentenceCard {
  return {
    id,
    english,
    prompt,
    source: "Test",
    tags: [],
    acceptableAnswers: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt,
  };
}
