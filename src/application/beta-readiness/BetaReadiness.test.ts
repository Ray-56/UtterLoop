import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import type {
  ContextualPracticeLogEntry,
  PracticeRoundSummary,
  PracticeSessionEvidence,
} from "../../domain/practice/PracticeSessionEvidence";
import { BetaReadiness } from "./BetaReadiness";

const AS_OF = new Date("2026-08-01T12:00:00.000Z");
const TIME_ZONE = "Asia/Shanghai";

describe("BetaReadiness.measure", () => {
  it("counts distinct strictly retained cards and reports context-free history as excluded coverage", () => {
    const result = BetaReadiness.measure({
      asOf: AS_OF,
      timeZone: TIME_ZONE,
      sessionWindowDays: 14,
      inactivityThresholdMs: 30 * 60_000,
      measurementEpoch: "2026-07-25T00:00:00.000Z",
      activeCheckpoint: null,
      cards: [card("qualified"), card("assisted"), card("legacy")],
      learningStates: [],
      reviewStates: [],
      sessionEvidence: [],
      practiceLog: [
        attempt("qualified-1", "qualified", {
          submittedAt: "2026-07-26T01:00:00.000Z",
          context: reviewContext("qualified", "2026-07-26T00:59:00.000Z"),
        }),
        attempt("qualified-2", "qualified", {
          submittedAt: "2026-07-31T01:00:00.000Z",
          context: reviewContext("qualified-return", "2026-07-31T00:59:00.000Z"),
        }),
        attempt("assisted", "assisted", {
          submittedAt: "2026-07-30T01:00:00.000Z",
          supportLevelUsed: 2,
          supportKindsUsed: ["keywords"],
          context: reviewContext("assisted", "2026-07-30T00:59:00.000Z"),
        }),
        attempt("legacy", "legacy", {
          phase: "legacy",
          submittedAt: "2026-07-29T01:00:00.000Z",
        }),
      ],
    });

    expect(result.retention.weeklyRetainedIndependentSentences).toEqual({
      numerator: 1,
      denominator: 2,
      availability: { status: "available" },
      coverage: {
        eligibleRows: 4,
        contextBearingRows: 3,
        excludedLegacyRows: 1,
        excludedPreContextRows: 0,
        measurementEpoch: "2026-07-25T00:00:00.000Z",
        containsInferred: false,
      },
    });
  });

  it.each([
    ["target-bearing support", { supportLevelUsed: 2, supportKindsUsed: ["keywords"] }, 1, 0],
    ["Answer Reveal", { answerWasRevealed: true, supportLevelUsed: 4, supportKindsUsed: ["answer"] }, 1, 0],
    ["prior correction", { receivedCorrection: true, supportKindsUsed: ["correction"] }, 1, 0],
    ["non-perfect outcome", { outcome: "retry", accuracy: 0.2 }, 1, 0],
    ["later submission", { submissionIndex: 1 }, 0, 0],
    ["non-Review phase", { phase: "independent-recall" }, 0, 0],
    ["not-yet-due context", { context: reviewContext("case", "2026-07-31T02:00:00.000Z") }, 0, 0],
    ["context-free row", { context: undefined }, 0, 0],
    ["legacy phase", { phase: "legacy" }, 0, 0],
  ] as const)("strict WRI excludes %s", (_label, overrides, denominator, numerator) => {
    const log = attempt("case", "case", {
      submittedAt: "2026-07-31T01:00:00.000Z",
      context: reviewContext("case", "2026-07-31T00:00:00.000Z"),
      ...overrides,
    } as Partial<ContextualPracticeLogEntry>);
    const result = BetaReadiness.measure(emptyInput({ cards: [card("case")], practiceLog: [log] }));

    expect(result.retention.weeklyRetainedIndependentSentences).toMatchObject({
      numerator,
      denominator,
    });
  });

  it("uses seven local calendar days and never counts future activity on the as-of day", () => {
    const result = BetaReadiness.measure(emptyInput({
      cards: [card("before"), card("boundary"), card("future")],
      practiceLog: [
        attempt("before", "before", {
          submittedAt: "2026-07-25T15:59:59.999Z",
          context: reviewContext("before", "2026-07-25T15:00:00.000Z"),
        }),
        attempt("boundary", "boundary", {
          submittedAt: "2026-07-25T16:00:00.000Z",
          context: reviewContext("boundary", "2026-07-25T15:00:00.000Z"),
        }),
        attempt("future", "future", {
          submittedAt: "2026-08-01T13:00:00.000Z",
          context: reviewContext("future", "2026-08-01T12:30:00.000Z"),
        }),
      ],
    }));

    expect(result.retention.weeklyRetainedIndependentSentences).toMatchObject({
      numerator: 1,
      denominator: 1,
    });
  });

  it("separates engaged completion, abandonment, Quick Start disposition, and acquisition time", () => {
    const result = BetaReadiness.measure({
      asOf: AS_OF,
      timeZone: TIME_ZONE,
      sessionWindowDays: 14,
      inactivityThresholdMs: 30 * 60_000,
      measurementEpoch: "2026-07-25T00:00:00.000Z",
      activeCheckpoint: {
        sessionId: "interrupted",
        roundId: "round-interrupted",
        entryPoint: "standard",
        startedAt: "2026-07-31T00:50:00.000Z",
        engagedAt: "2026-07-31T01:00:00.000Z",
        updatedAt: "2026-08-01T11:00:00.000Z",
      },
      cards: [card("ten-minutes"), card("twenty-minutes"), card("legacy"), card("mastered")],
      learningStates: [
        {
          cardId: "ten-minutes",
          introducedAt: "2026-07-28T00:00:00.000Z",
          firstPassedAt: "2026-07-28T00:10:00.000Z",
          firstPassSource: "independent-recall",
        },
        {
          cardId: "twenty-minutes",
          introducedAt: "2026-07-29T00:00:00.000Z",
          firstPassedAt: "2026-07-29T00:20:00.000Z",
          firstPassSource: "independent-recall",
        },
        {
          cardId: "legacy",
          introducedAt: "2026-07-27T00:00:00.000Z",
          firstPassedAt: "2026-07-27T00:00:00.000Z",
          firstPassSource: "legacy",
        },
        {
          cardId: "mastered",
          introducedAt: "2026-07-30T00:00:00.000Z",
          firstPassedAt: "2026-07-30T00:00:00.000Z",
          firstPassSource: "explicit-mastery",
        },
      ],
      reviewStates: [],
      practiceLog: [],
      sessionEvidence: [
        session("completed", "2026-07-27T01:00:00.000Z", { kind: "completed", reason: "scope-complete" }),
        session("abandoned", "2026-07-28T01:00:00.000Z", { kind: "abandoned", reason: "start-over" }),
        session("quick-complete", "2026-07-29T01:00:00.000Z", { kind: "completed", reason: "quick-start-complete" }, "quick-start-v1"),
        session("quick-dismiss", null, { kind: "dismissed", reason: "quick-start-dismissed" }, "quick-start-v1"),
        session("unengaged", null, { kind: "abandoned", reason: "replaced" }),
        session("invalid", "2026-07-30T01:00:00.000Z", { kind: "invalidated", reason: "stale" }),
      ],
    });

    expect(result.activation).toEqual({
      firstEngagedSessionCompletion: expect.objectContaining({
        numerator: 1,
        denominator: 1,
        availability: { status: "available" },
      }),
      quickStartDisposition: {
        completed: 1,
        dismissed: 1,
        availability: { status: "available" },
        coverage: {
          eligibleRows: 2,
          contextBearingRows: 2,
          excludedLegacyRows: 0,
          excludedPreContextRows: 0,
          measurementEpoch: "2026-07-25T00:00:00.000Z",
          containsInferred: false,
        },
      },
      timeToFirstPass: {
        medianMs: 600_000,
        sampleSize: 3,
        availability: { status: "available" },
        coverage: {
          eligibleRows: 4,
          contextBearingRows: 3,
          excludedLegacyRows: 1,
          excludedPreContextRows: 0,
          measurementEpoch: "2026-07-25T00:00:00.000Z",
          containsInferred: false,
        },
      },
    });
    expect(result.habit.sessions).toMatchObject({
      completed: 2,
      abandoned: 2,
      presumedAbandoned: 1,
      interrupted: 0,
      invalidated: 1,
      completion: {
        numerator: 2,
        denominator: 4,
        availability: { status: "available" },
        coverage: { containsInferred: true },
      },
      coverage: { containsInferred: true },
    });
  });

  it("keeps a recently updated engaged checkpoint reversible and outside completion denominator", () => {
    const result = BetaReadiness.measure(emptyInput({
      activeCheckpoint: {
        sessionId: "young-interruption",
        roundId: "round-young-interruption",
        entryPoint: "standard",
        startedAt: "2026-08-01T11:20:00.000Z",
        engagedAt: "2026-08-01T11:30:00.000Z",
        updatedAt: "2026-08-01T11:50:00.000Z",
      },
    }));

    expect(result.habit.sessions).toMatchObject({
      completed: 0,
      abandoned: 0,
      presumedAbandoned: 0,
      interrupted: 1,
      completion: {
        numerator: 0,
        denominator: 0,
        availability: { status: "unavailable", reason: "no-evidence" },
        coverage: { containsInferred: false },
      },
      coverage: { containsInferred: false },
    });
  });

  it("does not project a terminal session outcome before that terminal existed", () => {
    const futureTerminal = {
      ...session(
        "future-terminal",
        "2026-08-01T11:00:00.000Z",
        { kind: "completed", reason: "scope-complete" },
      ),
      endedAt: "2026-08-01T12:01:00.000Z",
    };
    const result = BetaReadiness.measure(emptyInput({
      sessionEvidence: [futureTerminal],
    }));

    expect(result.activation.firstEngagedSessionCompletion).toMatchObject({
      numerator: 0,
      denominator: 0,
      availability: { status: "unavailable", reason: "no-evidence" },
    });
    expect(result.habit.sessions).toMatchObject({
      completed: 0,
      abandoned: 0,
      completion: {
        numerator: 0,
        denominator: 0,
      },
    });
  });

  it("measures same-round acquisition, support, Reveal, Skip, and repeated requeue caps from complete context", () => {
    const result = BetaReadiness.measure({
      asOf: AS_OF,
      timeZone: TIME_ZONE,
      sessionWindowDays: 14,
      inactivityThresholdMs: 30 * 60_000,
      measurementEpoch: "2026-07-25T00:00:00.000Z",
      activeCheckpoint: null,
      cards: ["a", "b", "c", "d", "legacy"].map(card),
      learningStates: [
        learning("a", "2026-07-26T00:00:00.000Z", "2026-07-26T01:00:00.000Z"),
        learning("b", "2026-07-27T00:00:00.000Z"),
        learning("c", "2026-07-28T00:00:00.000Z", "2026-07-30T00:00:00.000Z"),
        learning("d", "2026-07-29T00:00:00.000Z"),
        {
          cardId: "legacy",
          introducedAt: "2026-07-26T00:00:00.000Z",
          firstPassedAt: "2026-07-26T00:00:00.000Z",
          firstPassSource: "legacy",
        },
      ],
      reviewStates: [],
      sessionEvidence: [
        session("round-one", "2026-07-26T00:00:00.000Z", { kind: "completed", reason: "round-complete" }, "standard", {
          introducedCardIds: ["a", "b"],
          firstPassCardIds: ["a"],
          requeue: {
            insertedReturnOccurrenceIds: [],
            deferredNoRoomCardIds: [],
            capReachedCardIds: ["a", "b"],
          },
        }),
        session("round-two", "2026-07-28T00:00:00.000Z", { kind: "completed", reason: "round-complete" }, "standard", {
          introducedCardIds: ["c", "d"],
          firstPassCardIds: ["c"],
          requeue: {
            insertedReturnOccurrenceIds: [],
            deferredNoRoomCardIds: [],
            capReachedCardIds: ["a"],
          },
        }),
      ],
      practiceLog: [
        signal("a-reveal", "a", "2026-07-26T00:30:00.000Z", ["support-used", "revealed"], 4, ["answer"], learningContext("round-one", "a")),
        attempt("b-guided", "b", {
          phase: "guided-recall",
          submittedAt: "2026-07-27T00:30:00.000Z",
          context: learningContext("round-one", "b"),
        }),
        signal("c-skip", "c", "2026-07-29T00:30:00.000Z", ["support-used", "skipped"], 1, ["pattern"], learningContext("round-two", "c")),
        attempt("d-guided", "d", {
          phase: "guided-recall",
          submittedAt: "2026-07-29T01:00:00.000Z",
          supportLevelUsed: 3,
          supportKindsUsed: ["audio"],
          context: learningContext("round-two", "d"),
        }),
        attempt("legacy-support", "a", {
          phase: "legacy",
          submittedAt: "2026-07-26T00:00:00.000Z",
          supportLevelUsed: 4,
          supportKindsUsed: ["answer"],
          answerWasRevealed: true,
        }),
      ],
    });

    expect(result.acquisition.sameRoundIndependentFirstPass).toMatchObject({
      numerator: 2,
      denominator: 4,
      availability: { status: "available" },
    });
    expect(result.acquisition.highestSupportBeforeFirstPass).toMatchObject({
      denominator: 4,
      levels: { 0: 1, 1: 1, 2: 0, 3: 1, 4: 1 },
      coverage: { excludedLegacyRows: 1 },
    });
    expect(result.acquisition.revealBeforeFirstPass).toMatchObject({ numerator: 1, denominator: 4 });
    expect(result.acquisition.skipBeforeFirstPass).toMatchObject({ numerator: 1, denominator: 4 });
    expect(result.acquisition.requeueCap).toMatchObject({
      cardRoundPairs: 3,
      distinctCards: 2,
      repeatedCards: 1,
      availability: { status: "available" },
    });
  });

  it("scopes acquisition coverage to diagnostic-card rows between introduction and First Pass", () => {
    const result = BetaReadiness.measure(emptyInput({
      cards: [card("diagnostic"), card("unrelated")],
      learningStates: [
        learning("diagnostic", "2026-07-30T00:00:00.000Z", "2026-07-31T00:00:00.000Z"),
        learning("unrelated", "2026-07-01T00:00:00.000Z"),
      ],
      sessionEvidence: [session(
        "diagnostic-round",
        "2026-07-30T00:00:00.000Z",
        { kind: "completed", reason: "round-complete" },
        "standard",
        {
          introducedCardIds: ["diagnostic"],
          firstPassCardIds: ["diagnostic"],
        },
      )],
      practiceLog: [
        attempt("diagnostic-context", "diagnostic", {
          phase: "guided-recall",
          submittedAt: "2026-07-30T01:00:00.000Z",
          supportLevelUsed: 2,
          supportKindsUsed: ["keywords"],
          context: learningContext("diagnostic-round", "context"),
        }),
        attempt("diagnostic-context-free", "diagnostic", {
          phase: "guided-recall",
          submittedAt: "2026-07-30T02:00:00.000Z",
          supportLevelUsed: 4,
          supportKindsUsed: ["answer"],
          context: undefined,
        }),
        attempt("diagnostic-legacy", "diagnostic", {
          phase: "legacy",
          submittedAt: "2026-07-30T03:00:00.000Z",
        }),
        attempt("diagnostic-before-introduction", "diagnostic", {
          phase: "legacy",
          submittedAt: "2026-07-29T23:00:00.000Z",
        }),
        signal(
          "diagnostic-after-pass",
          "diagnostic",
          "2026-07-31T01:00:00.000Z",
          ["revealed"],
          4,
          ["answer"],
          learningContext("diagnostic-round", "after-pass"),
        ),
        signal(
          "diagnostic-future",
          "diagnostic",
          "2026-08-01T13:00:00.000Z",
          ["skipped"],
          0,
          [],
          learningContext("diagnostic-round", "future"),
        ),
        attempt("unrelated-legacy", "unrelated", {
          phase: "legacy",
          submittedAt: "2026-07-30T04:00:00.000Z",
        }),
      ],
    }));

    expect(result.acquisition.highestSupportBeforeFirstPass).toEqual({
      denominator: 1,
      levels: { 0: 0, 1: 0, 2: 1, 3: 0, 4: 0 },
      availability: { status: "available" },
      coverage: {
        eligibleRows: 3,
        contextBearingRows: 1,
        excludedLegacyRows: 1,
        excludedPreContextRows: 1,
        measurementEpoch: "2026-07-25T00:00:00.000Z",
        containsInferred: false,
      },
    });
    expect(result.acquisition.revealBeforeFirstPass).toMatchObject({ numerator: 0, denominator: 1 });
    expect(result.acquisition.skipBeforeFirstPass).toMatchObject({ numerator: 0, denominator: 1 });
  });

  it("measures due completion, only matured retention cohorts, active local days, and current backlog", () => {
    const firstPasses = [
      learning("next-success", "2026-07-29T23:00:00.000Z", "2026-07-30T00:00:00.000Z"),
      learning("next-failure", "2026-07-28T23:00:00.000Z", "2026-07-29T00:00:00.000Z"),
      learning("next-immature", "2026-07-30T23:00:00.000Z", "2026-07-31T00:00:00.000Z"),
      learning("day7-success", "2026-07-21T23:00:00.000Z", "2026-07-22T00:00:00.000Z"),
      learning("day7-failure", "2026-07-20T23:00:00.000Z", "2026-07-21T00:00:00.000Z"),
      learning("day30-success", "2026-06-26T23:00:00.000Z", "2026-06-27T00:00:00.000Z"),
      learning("day30-immature", "2026-06-27T23:00:00.000Z", "2026-06-28T00:00:00.000Z"),
      {
        cardId: "legacy",
        introducedAt: "2026-06-01T00:00:00.000Z",
        firstPassedAt: "2026-06-01T00:00:00.000Z",
        firstPassSource: "legacy" as const,
      },
    ];
    const ids = [...firstPasses.map((state) => state.cardId), "due-1", "due-2", "future", "mastered"];
    const result = BetaReadiness.measure({
      asOf: AS_OF,
      timeZone: TIME_ZONE,
      sessionWindowDays: 14,
      inactivityThresholdMs: 30 * 60_000,
      measurementEpoch: "2026-06-01T00:00:00.000Z",
      activeCheckpoint: {
        sessionId: "active",
        roundId: "round-active",
        entryPoint: "standard",
        startedAt: "2026-07-31T01:00:00.000Z",
        engagedAt: "2026-07-31T01:05:00.000Z",
        updatedAt: "2026-08-01T11:50:00.000Z",
      },
      cards: ids.map(card),
      learningStates: firstPasses,
      reviewStates: [
        review("due-1", "2026-08-01T10:00:00.000Z"),
        review("due-2", "2026-08-01T11:00:00.000Z"),
        review("future", "2026-08-02T00:00:00.000Z"),
        { ...review("mastered", "2026-07-01T00:00:00.000Z"), learningStatus: "mastered" },
      ],
      sessionEvidence: [
        session("due-round", "2026-07-28T00:00:00.000Z", { kind: "completed", reason: "scope-complete" }, "standard", {
          initialOccurrenceIds: ["o1", "o2", "o3"],
          scheduledOccurrenceIds: ["o1", "o2", "o3"],
          attemptedOccurrenceIds: ["o1"],
          completedOccurrenceIds: ["o1", "o2"],
          skippedOccurrenceIds: ["o3"],
          dueReviewScheduledOccurrenceIds: ["o1", "o2", "o3"],
          dueReviewCompletedOccurrenceIds: ["o1"],
        }),
      ],
      practiceLog: [
        attempt("due-o1", "next-success", {
          submittedAt: "2026-07-28T00:05:00.000Z",
          context: dueContext("due-round", "o1", "2026-07-28T00:00:00.000Z"),
        }),
        signal("due-o2", "next-failure", "2026-07-28T00:06:00.000Z", ["revealed"], 4, ["answer"], dueContext("due-round", "o2", "2026-07-28T00:00:00.000Z")),
        attempt("next-success-review", "next-success", {
          submittedAt: "2026-07-31T06:00:00.000Z",
          context: dueContext("cohort-next", "next-success", "2026-07-31T05:00:00.000Z"),
        }),
        attempt("day7-success-review", "day7-success", {
          submittedAt: "2026-07-29T00:00:00.000Z",
          context: dueContext("cohort-7", "day7-success", "2026-07-28T00:00:00.000Z"),
        }),
        attempt("day30-success-review", "day30-success", {
          submittedAt: "2026-07-27T00:00:00.000Z",
          context: dueContext("cohort-30", "day30-success", "2026-07-26T00:00:00.000Z"),
        }),
        attempt("legacy-review", "legacy", {
          phase: "legacy",
          submittedAt: "2026-07-31T00:00:00.000Z",
        }),
      ],
    });

    expect(result.retention.dueReviewCompletion).toMatchObject({ numerator: 1, denominator: 3 });
    expect(result.retention.cohorts).toMatchObject({
      nextDay: { numerator: 1, denominator: 6, availability: { status: "available" } },
      day7: { numerator: 1, denominator: 4, availability: { status: "available" } },
      day30: { numerator: 1, denominator: 1, availability: { status: "available" } },
    });
    expect(result.habit.activePracticeDays).toMatchObject({ numerator: 4, denominator: 14 });
    expect(result.retention.dueBacklog).toMatchObject({ count: 2 });
    expect(result.retention.cohorts.nextDay.coverage.excludedLegacyRows).toBe(1);
  });

  it("counts a Due Review occurrence only when its matching Attempt existed by round end and as-of", () => {
    const result = BetaReadiness.measure(emptyInput({
      sessionEvidence: [session(
        "bounded-due-round",
        "2026-07-31T01:00:00.000Z",
        { kind: "completed", reason: "scope-complete" },
        "standard",
        {
          initialOccurrenceIds: ["valid", "after-terminal", "future"],
          scheduledOccurrenceIds: ["valid", "after-terminal", "future"],
          attemptedOccurrenceIds: ["valid", "after-terminal", "future"],
          completedOccurrenceIds: ["valid", "after-terminal", "future"],
          dueReviewScheduledOccurrenceIds: ["valid", "after-terminal", "future"],
          dueReviewCompletedOccurrenceIds: ["valid", "after-terminal", "future"],
        },
      )],
      practiceLog: [
        attempt("valid-due-attempt", "valid-card", {
          submittedAt: "2026-07-31T01:05:00.000Z",
          context: dueContext("bounded-due-round", "valid", "2026-07-31T00:00:00.000Z"),
        }),
        attempt("after-terminal-attempt", "late-card", {
          submittedAt: "2026-07-31T01:11:00.000Z",
          context: dueContext("bounded-due-round", "after-terminal", "2026-07-31T00:00:00.000Z"),
        }),
        attempt("future-attempt", "future-card", {
          submittedAt: "2026-08-01T12:01:00.000Z",
          context: dueContext("bounded-due-round", "future", "2026-07-31T00:00:00.000Z"),
        }),
      ],
    }));

    expect(result.retention.dueReviewCompletion).toMatchObject({
      numerator: 1,
      denominator: 3,
    });
  });

  it("reports an immature cohort as unavailable instead of a zero-percent failure", () => {
    const result = BetaReadiness.measure(emptyInput({
      cards: [card("recent")],
      learningStates: [learning(
        "recent",
        "2026-07-31T00:00:00.000Z",
        "2026-07-31T12:00:00.000Z",
      )],
    }));

    expect(result.retention.cohorts.nextDay).toMatchObject({
      numerator: 0,
      denominator: 0,
      availability: { status: "unavailable", reason: "immature-cohort" },
    });
  });

  it("reports cohort retrieval coverage without reading future observation rows", () => {
    const result = BetaReadiness.measure(emptyInput({
      cards: [card("matured"), card("recent")],
      learningStates: [
        learning("matured", "2026-07-28T23:00:00.000Z", "2026-07-29T00:00:00.000Z"),
        learning("recent", "2026-07-31T11:00:00.000Z", "2026-07-31T12:00:00.000Z"),
      ],
      practiceLog: [
        attempt("matured-strict", "matured", {
          submittedAt: "2026-07-30T00:00:00.000Z",
          context: dueContext("matured-strict", "strict", "2026-07-29T23:00:00.000Z"),
        }),
        attempt("matured-legacy", "matured", {
          phase: "legacy",
          submittedAt: "2026-07-30T01:00:00.000Z",
        }),
        attempt("matured-context-free", "matured", {
          submittedAt: "2026-07-30T02:00:00.000Z",
          context: undefined,
        }),
        attempt("recent-future", "recent", {
          submittedAt: "2026-08-01T13:00:00.000Z",
          context: dueContext("recent-future", "future", "2026-08-01T12:30:00.000Z"),
        }),
      ],
    }));

    expect(result.retention.cohorts.nextDay).toEqual({
      numerator: 1,
      denominator: 1,
      availability: { status: "available" },
      coverage: {
        eligibleRows: 5,
        contextBearingRows: 3,
        excludedLegacyRows: 1,
        excludedPreContextRows: 1,
        measurementEpoch: "2026-07-25T00:00:00.000Z",
        containsInferred: false,
      },
    });
  });

  it("reports snapshot backlog and observable active days without requiring a measurement epoch", () => {
    const result = BetaReadiness.measure(emptyInput({
      measurementEpoch: null,
      cards: [card("due")],
      reviewStates: [review("due", "2026-08-01T10:00:00.000Z")],
      practiceLog: [attempt("active", "due", {
        submittedAt: "2026-08-01T11:00:00.000Z",
        context: undefined,
      })],
    }));

    expect(result.retention.dueBacklog).toMatchObject({
      count: 1,
      availability: { status: "available" },
    });
    expect(result.habit.activePracticeDays).toMatchObject({
      numerator: 1,
      denominator: 14,
      availability: { status: "available" },
    });
  });
});

function card(id: string): SentenceCard {
  return {
    id,
    english: `Target ${id}`,
    prompt: `Prompt ${id}`,
    source: "test",
    tags: [],
    acceptableAnswers: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function emptyInput(
  overrides: Partial<Parameters<typeof BetaReadiness.measure>[0]> = {},
): Parameters<typeof BetaReadiness.measure>[0] {
  return {
    asOf: AS_OF,
    timeZone: TIME_ZONE,
    sessionWindowDays: 14,
    inactivityThresholdMs: 30 * 60_000,
    measurementEpoch: "2026-07-25T00:00:00.000Z",
    activeCheckpoint: null,
    cards: [],
    learningStates: [],
    reviewStates: [],
    practiceLog: [],
    sessionEvidence: [],
    ...overrides,
  };
}

function attempt(
  id: string,
  cardId: string,
  overrides: Partial<ContextualPracticeLogEntry> = {},
): ContextualPracticeLogEntry {
  const base: PracticeLogEntry = {
    kind: "attempt",
    id: `turn-attempt:${id}:0`,
    turnId: id,
    cardId,
    phase: "review-recall",
    submissionIndex: 0,
    submittedAt: "2026-07-31T01:00:00.000Z",
    answer: "answer",
    outcome: "perfect",
    accuracy: 1,
    answerWasRevealed: false,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 1_000,
    supportLevelUsed: 0,
    supportKindsUsed: [],
    receivedCorrection: false,
  };
  return { ...base, ...overrides } as ContextualPracticeLogEntry;
}

function reviewContext(occurrenceId: string, scheduledReviewDueAt: string) {
  return {
    sessionId: "session-1",
    roundId: "round-1",
    occurrenceId,
    queueReason: "due-review" as const,
    scheduledReviewDueAt,
  };
}

function learningContext(sessionId: string, occurrenceId: string) {
  return {
    sessionId,
    roundId: `round-${sessionId}`,
    occurrenceId,
    queueReason: "new-learning" as const,
  };
}

function dueContext(sessionId: string, occurrenceId: string, scheduledReviewDueAt: string) {
  return {
    sessionId,
    roundId: `round-${sessionId}`,
    occurrenceId,
    queueReason: "due-review" as const,
    scheduledReviewDueAt,
  };
}

function review(cardId: string, dueAt: string) {
  return { cardId, dueAt, stage: 1 as const, streak: 1, lapseCount: 0 };
}

function session(
  sessionId: string,
  engagedAt: string | null,
  terminal: PracticeSessionEvidence["terminal"],
  entryPoint: PracticeSessionEvidence["entryPoint"] = "standard",
  roundOverrides: Partial<PracticeRoundSummary> = {},
): PracticeSessionEvidence {
  const startedAt = engagedAt ?? "2026-07-29T00:00:00.000Z";
  return {
    schemaVersion: 1,
    sessionId,
    roundId: `round-${sessionId}`,
    scope: { kind: "review" },
    entryPoint,
    startedAt,
    engagedAt,
    endedAt: new Date(Date.parse(startedAt) + 10 * 60_000).toISOString(),
    terminal,
    round: emptyRound(roundOverrides),
  };
}

function learning(cardId: string, introducedAt: string, firstPassedAt?: string) {
  return firstPassedAt
    ? { cardId, introducedAt, firstPassedAt, firstPassSource: "independent-recall" as const }
    : { cardId, introducedAt, acquisitionStatus: "needs-guided" as const };
}

function signal(
  turnId: string,
  cardId: string,
  submittedAt: string,
  signalKinds: Array<"support-used" | "revealed" | "skipped">,
  supportLevelUsed: 0 | 1 | 2 | 3 | 4,
  supportKindsUsed: ContextualPracticeLogEntry["supportKindsUsed"],
  context?: ContextualPracticeLogEntry["context"],
): ContextualPracticeLogEntry {
  return {
    kind: "signal",
    id: `turn-signal:${turnId}`,
    turnId,
    cardId,
    phase: "guided-recall",
    submittedAt,
    updatedAt: submittedAt,
    signalKinds,
    reviewFailureRecorded: false,
    answer: "",
    accuracy: 0,
    answerWasRevealed: signalKinds.includes("revealed"),
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 0,
    supportLevelUsed,
    supportKindsUsed,
    receivedCorrection: false,
    context,
  };
}

function emptyRound(overrides: Partial<PracticeRoundSummary> = {}): PracticeRoundSummary {
  return {
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
    ...overrides,
  };
}
