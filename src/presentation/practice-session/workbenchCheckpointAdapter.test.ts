import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { Course } from "../../domain/curriculum/Course";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import { createPracticeTurn } from "../../domain/practice/PracticeTurn";
import type { PracticeSessionItem, PracticeScope } from "../../application/use-cases/buildPracticeSession";
import { validatePracticeSessionCheckpoint, type PracticeSessionCatalog } from ".";
import {
  createWorkbenchPracticeSessionCheckpoint,
  createWorkbenchPracticeSessionCheckpointSeed,
  practiceLogEntriesToDurableEvidence,
  restoreWorkbenchPracticeSessionCheckpoint,
} from "./workbenchCheckpointAdapter";

describe("createWorkbenchPracticeSessionCheckpoint", () => {
  it("creates a v2 lifecycle seed with queue context and target-free round identity sets", () => {
    const items = sessionItems();
    items[0] = {
      ...items[0],
      queueReason: "due-review",
      scheduledReviewDueAt: "2026-07-31T07:00:00.000Z",
    };
    const seed = createWorkbenchPracticeSessionCheckpointSeed({
      scope: { kind: "review" },
      items,
      currentIndex: 0,
      draft: "learner draft",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-active", "card-1", "review-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: { ...workbenchStats(), attempts: 0, perfect: 0, great: 0 },
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    expect(seed).not.toHaveProperty("schemaVersion");
    expect(seed).not.toHaveProperty("sessionId");
    expect(seed.itinerary[0]).toMatchObject({
      queueReason: "due-review",
      scheduledReviewDueAt: "2026-07-31T07:00:00.000Z",
    });
    expect(seed.round).toMatchObject({
      initialOccurrenceIds: seed.itinerary.map((occurrence) => occurrence.id),
      scheduledOccurrenceIds: seed.itinerary.map((occurrence) => occurrence.id),
      remainingOccurrenceIds: seed.itinerary.map((occurrence) => occurrence.id),
      dueReviewScheduledOccurrenceIds: [seed.itinerary[0].id],
    });
    expect(JSON.stringify({ ...seed, draft: "" })).not.toContain("Target sentence one.");
  });

  it("creates a schema-valid target-free checkpoint for the active Workbench turn", () => {
    const checkpoint = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: sessionItems(),
      currentIndex: 0,
      draft: "partial learner draft",
      selectionStart: 3,
      selectionEnd: 7,
      practiceTurn: createPracticeTurn("turn-active", "card-1", "guided-recall", 2, ["keywords"]),
      submissionIndex: 1,
      elapsedSeconds: 42,
      itemElapsedSeconds: 12,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    expect(validatePracticeSessionCheckpoint(checkpoint)).toMatchObject({ ok: true });
    expect(checkpoint.turn).toEqual({
      turnId: "turn-active",
      phase: "guided-recall",
      supportLevelUsed: 2,
      supportKindsUsed: ["keywords"],
      receivedCorrection: false,
      reviewFailureRecorded: false,
      submissionIndex: 1,
    });
    expect(JSON.stringify({ ...checkpoint, draft: "" })).not.toContain("Target sentence one.");
    expect(JSON.stringify({ ...checkpoint, draft: "" })).not.toContain("Prompt one.");
  });

  it("gives repeated Workbench items stable return identities while preserving item-level context", () => {
    const baseItems = sessionItems();
    const items = [baseItems[0], baseItems[1], baseItems[0]];
    const input = {
      scope,
      items,
      currentIndex: 2,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-return", "card-1", "independent-recall"),
      submissionIndex: 0,
      elapsedSeconds: 60,
      itemElapsedSeconds: 4,
      stats: workbenchStats(),
      returnCounts: { "card-1": 1 },
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    } as const;

    const first = createWorkbenchPracticeSessionCheckpoint(input);
    const second = createWorkbenchPracticeSessionCheckpoint(input);

    expect(first.itinerary[0]).toMatchObject({
      cardId: "card-1",
      originalIndex: 0,
      returnIndex: 0,
      courseId: "course-1",
      unitId: "unit-1",
      lessonId: "lesson-1",
    });
    expect(first.itinerary[2]).toMatchObject({
      cardId: "card-1",
      originalIndex: 0,
      returnIndex: 1,
      courseId: "course-1",
      unitId: "unit-1",
      lessonId: "lesson-1",
    });
    expect(second.itinerary.map((occurrence) => occurrence.id)).toEqual(
      first.itinerary.map((occurrence) => occurrence.id),
    );
  });

  it("preserves the Quick Start phase plan across repeated card occurrences", () => {
    const base = sessionItems()[0];
    const items: PracticeSessionItem[] = [
      { ...base, initialPhase: "first-exposure" },
      {
        ...base,
        initialPhase: "guided-recall",
        initialSupportLevel: 0,
        initialSupportKinds: [],
      },
      { ...base, initialPhase: "independent-recall" },
    ];
    const seed = createWorkbenchPracticeSessionCheckpointSeed({
      scope,
      items,
      currentIndex: 0,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-first-exposure", "card-1", "first-exposure"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: { ...workbenchStats(), attempts: 0, perfect: 0, great: 0 },
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-08-01T08:00:00.000Z",
    });

    expect(seed.itinerary.map((occurrence) => occurrence.turn.phase)).toEqual([
      "first-exposure",
      "guided-recall",
      "independent-recall",
    ]);
    expect(seed.itinerary.map((occurrence) => occurrence.returnIndex)).toEqual([0, 1, 2]);
    expect(seed.itinerary[1].turn).toMatchObject({
      supportLevelUsed: 0,
      supportKindsUsed: [],
    });
  });

  it("does not count an in-round return as a second scheduled due Review", () => {
    const dueItem: PracticeSessionItem = {
      ...sessionItems()[0],
      queueReason: "due-review",
      scheduledReviewDueAt: "2026-08-01T07:00:00.000Z",
    };
    const seed = createWorkbenchPracticeSessionCheckpointSeed({
      scope: { kind: "review" },
      items: [dueItem, dueItem],
      currentIndex: 0,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-due", "card-1", "review-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: { ...workbenchStats(), attempts: 0, perfect: 0, great: 0 },
      returnCounts: { "card-1": 1 },
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-08-01T08:00:00.000Z",
    });

    expect(seed.round.dueReviewScheduledOccurrenceIds).toEqual([
      seed.itinerary[0].id,
    ]);
  });

  it("keeps later base occurrence IDs stable when a return is inserted before them", () => {
    const baseItems = sessionItems();
    const beforeInsertion = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: baseItems,
      currentIndex: 0,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-card-1", "card-1", "guided-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });
    const afterInsertion = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: [baseItems[0], baseItems[0], baseItems[1]],
      currentIndex: 0,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-card-1", "card-1", "guided-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: { "card-1": 1 },
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:01.000Z",
    });

    expect(afterInsertion.itinerary[2].cardId).toBe("card-2");
    expect(afterInsertion.itinerary[2].id).toBe(beforeInsertion.itinerary[1].id);
    expect(afterInsertion.itinerary[2].originalIndex).toBe(1);
  });

  it("encodes aggregate pending returns as explicit target-free occurrences instead of losing them", () => {
    const checkpoint = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: sessionItems(),
      currentIndex: 1,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-card-2", "card-2", "guided-recall", 1, ["pattern"]),
      submissionIndex: 1,
      elapsedSeconds: 20,
      itemElapsedSeconds: 8,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 1,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    expect(checkpoint.stats.pendingReturns).toHaveLength(1);
    expect(checkpoint.stats.pendingReturns[0]).toMatchObject({
      occurrence: {
        cardId: "card-2",
        originalIndex: 1,
        returnIndex: 1,
        courseId: "course-1",
        unitId: "unit-1",
        lessonId: "lesson-1",
        turn: { phase: "independent-recall" },
      },
    });
    expect(checkpoint.stats.returnCounts).toEqual({ "card-2": 1 });
    expect(JSON.stringify(checkpoint.stats.pendingReturns)).not.toContain("Target sentence two.");
  });

  it("normalizes selection bounds and rejects missing catalog cards or unrepresentable pending returns", () => {
    const bounded = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: sessionItems(),
      currentIndex: 0,
      draft: "short",
      selectionStart: 99,
      selectionEnd: -4,
      practiceTurn: createPracticeTurn("turn-active", "card-1", "guided-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });
    expect([bounded.selectionStart, bounded.selectionEnd]).toEqual([0, 5]);

    const missingCardItems = [item(card("missing-card", "Missing target.", "Missing prompt."))];
    expect(() => createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: missingCardItems,
      currentIndex: 0,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-missing", "missing-card", "guided-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    })).toThrow("missing SentenceCard: missing-card");

    expect(() => createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: [sessionItems()[0]],
      currentIndex: 0,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-cap", "card-1", "guided-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: { "card-1": 2 },
      pendingReturnCount: 1,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    })).toThrow("cannot be represented");
  });
});

describe("restoreWorkbenchPracticeSessionCheckpoint", () => {
  it("reconstructs inserted duplicate items and the active Workbench view state", () => {
    const baseItems = sessionItems();
    const checkpoint = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: [baseItems[0], baseItems[1], baseItems[0]],
      currentIndex: 2,
      draft: "partial answer",
      selectionStart: 2,
      selectionEnd: 8,
      practiceTurn: createPracticeTurn("turn-return", "card-1", "independent-recall", 4, ["answer"]),
      submissionIndex: 2,
      elapsedSeconds: 91,
      itemElapsedSeconds: 11,
      stats: workbenchStats(),
      returnCounts: { "card-1": 1 },
      pendingReturnCount: 1,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    const restored = restoreWorkbenchPracticeSessionCheckpoint({
      checkpoint,
      scope,
      items: baseItems,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [0, 1].map((submissionIndex) => ({
        kind: "attempt" as const,
        id: `turn-attempt:turn-return:${submissionIndex}`,
        turnId: "turn-return",
        cardId: "card-1",
        submissionIndex,
        phase: "independent-recall" as const,
        supportLevelUsed: 4 as const,
        supportKindsUsed: ["answer" as const],
        receivedCorrection: false,
      })),
      now: new Date("2026-07-31T08:05:00.000Z"),
    });

    expect(restored.status).toBe("resume");
    if (restored.status === "resume") {
      expect(restored.viewState.itinerary.map((item) => item.card.id)).toEqual([
        "card-1",
        "card-2",
        "card-1",
      ]);
      expect(restored.viewState.currentIndex).toBe(2);
      expect(restored.viewState.draft).toBe("partial answer");
      expect([restored.viewState.selectionStart, restored.viewState.selectionEnd]).toEqual([2, 8]);
      expect(restored.viewState.practiceTurn).toMatchObject({
        id: "turn-return",
        cardId: "card-1",
        phase: "independent-recall",
        answerWasRevealed: true,
        supportLevelUsed: 4,
        supportKindsUsed: ["answer"],
      });
      expect(restored.viewState.submissionIndex).toBe(2);
      expect(restored.viewState.elapsedSeconds).toBe(91);
      expect(restored.viewState.itemElapsedSeconds).toBe(11);
      expect(restored.viewState.returnCounts).toEqual({ "card-1": 1, "card-2": 1 });
      expect(restored.viewState.pendingReturnCount).toBe(1);
      expect(restored.viewState.pendingReturnStrategy).toBe("reconstructed-from-recent-occurrences");
      expect(restored.viewState.stats).toMatchObject({
        score: 750,
        combo: 2,
        maxCombo: 3,
        attempts: 4,
        perfect: 1,
        great: 1,
        audioPlays: 2,
        revealed: 1,
        skipped: 0,
        accuracyTotal: 3.4,
      });
    }
  });

  it("restores the remaining Lesson card when First Pass removes completed predecessors from the rebuilt queue", () => {
    const baseItems = sessionItems();
    const checkpoint = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: baseItems,
      currentIndex: 1,
      draft: "remaining draft",
      selectionStart: 3,
      selectionEnd: 9,
      practiceTurn: createPracticeTurn("turn-card-2", "card-2", "guided-recall", 1, ["pattern"]),
      submissionIndex: 0,
      elapsedSeconds: 45,
      itemElapsedSeconds: 7,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    const restored = restoreWorkbenchPracticeSessionCheckpoint({
      checkpoint,
      scope,
      // card-1 received First Pass before the checkpoint was reloaded, so a
      // fresh Lesson Learn queue now begins at the still-active card-2.
      items: [baseItems[1]],
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date("2026-07-31T08:05:00.000Z"),
    });

    expect(restored.status).toBe("resume");
    if (restored.status === "resume") {
      expect(restored.viewState.itinerary.map((item) => item.card.id)).toEqual(["card-2"]);
      expect(restored.viewState.currentIndex).toBe(0);
      expect(restored.viewState.currentOccurrenceId).toBe(checkpoint.currentOccurrenceId);
      expect(restored.viewState.draft).toBe("remaining draft");
      expect([restored.viewState.selectionStart, restored.viewState.selectionEnd]).toEqual([3, 9]);
      expect(restored.viewState.practiceTurn).toMatchObject({
        id: "turn-card-2",
        cardId: "card-2",
        phase: "guided-recall",
      });
    }
  });

  it("returns a typed discard when the current session can no longer resolve a saved item", () => {
    const checkpoint = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: sessionItems(),
      currentIndex: 0,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-active", "card-1", "guided-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    const restored = restoreWorkbenchPracticeSessionCheckpoint({
      checkpoint,
      scope,
      items: [sessionItems()[0]],
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date("2026-07-31T08:05:00.000Z"),
    });

    expect(restored).toMatchObject({
      status: "discard",
      reason: "session-item-missing",
      message: expect.stringContaining("card-2"),
    });
  });

  it("still discards when the rebuilt Lesson queue is missing the current occurrence", () => {
    const baseItems = sessionItems();
    const checkpoint = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items: baseItems,
      currentIndex: 1,
      draft: "current draft",
      selectionStart: 2,
      selectionEnd: 5,
      practiceTurn: createPracticeTurn("turn-current", "card-2", "guided-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: {},
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    const restored = restoreWorkbenchPracticeSessionCheckpoint({
      checkpoint,
      scope,
      items: [baseItems[0]],
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date("2026-07-31T08:05:00.000Z"),
    });

    expect(restored).toMatchObject({
      status: "discard",
      reason: "session-item-missing",
      message: expect.stringContaining("card-2"),
    });
  });

  it("matches repeated contextual items by occurrence ordinal when the rebuilt itinerary contains them", () => {
    const baseItems = sessionItems();
    const firstVariant = { ...baseItems[0], variant: "first-exposure" };
    const returnVariant = { ...baseItems[0], variant: "independent-return" };
    const items = [firstVariant, baseItems[1], returnVariant];
    const checkpoint = createWorkbenchPracticeSessionCheckpoint({
      scope,
      items,
      currentIndex: 2,
      draft: "",
      selectionStart: 0,
      selectionEnd: 0,
      practiceTurn: createPracticeTurn("turn-return", "card-1", "independent-recall"),
      submissionIndex: 0,
      elapsedSeconds: 0,
      itemElapsedSeconds: 0,
      stats: workbenchStats(),
      returnCounts: { "card-1": 1 },
      pendingReturnCount: 0,
      catalog: catalog(),
      updatedAt: "2026-07-31T08:00:00.000Z",
    });

    const restored = restoreWorkbenchPracticeSessionCheckpoint({
      checkpoint,
      scope,
      items,
      catalog: catalog(),
      masteredCardIds: [],
      durableEvidence: [],
      now: new Date("2026-07-31T08:05:00.000Z"),
    });

    expect(restored.status).toBe("resume");
    if (restored.status === "resume") {
      expect(restored.viewState.itinerary[0]).toBe(firstVariant);
      expect(restored.viewState.itinerary[2]).toBe(returnVariant);
    }
  });
});

describe("practiceLogEntriesToDurableEvidence", () => {
  it("projects attempt and signal logs to the target-free reconciliation evidence contract", () => {
    const logs: PracticeLogEntry[] = [{
      kind: "attempt",
      id: "turn-attempt:turn-1:0",
      turnId: "turn-1",
      cardId: "card-1",
      phase: "independent-recall",
      submissionIndex: 0,
      submittedAt: "2026-07-31T08:00:00.000Z",
      answer: "The learner's private answer.",
      outcome: "perfect",
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 4000,
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
    }, {
      kind: "signal",
      id: "turn-signal:turn-2",
      turnId: "turn-2",
      cardId: "card-2",
      phase: "guided-recall",
      submittedAt: "2026-07-31T08:01:00.000Z",
      updatedAt: "2026-07-31T08:01:01.000Z",
      signalKinds: ["revealed"],
      reviewFailureRecorded: true,
      answer: "",
      accuracy: 0,
      answerWasRevealed: true,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
      supportLevelUsed: 4,
      supportKindsUsed: ["answer"],
      receivedCorrection: false,
    }];

    const evidence = practiceLogEntriesToDurableEvidence(logs);

    expect(evidence).toEqual([{
      kind: "attempt",
      id: "turn-attempt:turn-1:0",
      turnId: "turn-1",
      cardId: "card-1",
      submissionIndex: 0,
      phase: "independent-recall",
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
    }, {
      kind: "signal",
      id: "turn-signal:turn-2",
      turnId: "turn-2",
      cardId: "card-2",
      supportLevelUsed: 4,
      supportKindsUsed: ["answer"],
      reviewFailureRecorded: true,
    }]);
    expect(JSON.stringify(evidence)).not.toContain("private answer");
  });
});

const scope: PracticeScope = {
  kind: "lesson",
  courseId: "course-1",
  lessonId: "lesson-1",
  mode: "learn",
};

function workbenchStats() {
  return {
    score: 750,
    combo: 2,
    maxCombo: 3,
    attempts: 4,
    perfect: 1,
    great: 1,
    audioPlays: 2,
    revealed: 1,
    skipped: 0,
    accuracyTotal: 3.4,
  };
}

function sessionItems(): PracticeSessionItem[] {
  return [item(card("card-1", "Target sentence one.", "Prompt one.")), item(card("card-2", "Target sentence two.", "Prompt two."))];
}

function item(sentenceCard: SentenceCard): PracticeSessionItem {
  return {
    card: sentenceCard,
    isDue: false,
    queueReason: "new-learning",
    reviewState: {
      cardId: sentenceCard.id,
      dueAt: "2026-07-31T00:00:00.000Z",
      stage: 0,
      streak: 0,
      lapseCount: 0,
      learningStatus: "new",
    },
    occurrenceContext: {
      courseId: "course-1",
      courseTitle: "Course",
      unitId: "unit-1",
      unitTitle: "Unit",
      lessonId: "lesson-1",
      lessonTitle: "Lesson",
      objective: "Recall both sentences.",
    },
  };
}

function catalog(): PracticeSessionCatalog {
  const cards = [
    card("card-1", "Target sentence one.", "Prompt one."),
    card("card-2", "Target sentence two.", "Prompt two."),
  ];
  const course: Course = {
    id: "course-1",
    title: "Course",
    description: "Description",
    categoryId: "category",
    tags: [],
    level: { label: "A1", cefrFrom: "A1", cefrTo: "A1" },
    provider: { kind: "original", name: "Test" },
    revision: 1,
    license: { name: "CC0", url: "https://example.com", attribution: "None" },
    units: [{
      id: "unit-1",
      title: "Unit",
      description: "Description",
      lessons: [{
        id: "lesson-1",
        title: "Lesson",
        objective: "Recall both sentences.",
        cardIds: cards.map((candidate) => candidate.id),
      }],
    }],
  };
  return { courses: [course], cards };
}

function card(id: string, english: string, prompt: string): SentenceCard {
  return {
    id,
    english,
    prompt,
    source: "Test",
    tags: [],
    acceptableAnswers: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
}
