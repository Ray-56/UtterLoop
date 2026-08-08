import { describe, expect, it } from "vitest";
import { createInitialReviewState } from "../review/reviewScheduler";
import { createPracticeTurn, type PracticePhase, type RecallSupportLevel } from "../practice/PracticeTurn";
import {
  completeFirstExposure,
  markInstructionalCompletion,
  recordFirstPass,
} from "./SentenceLearningState";
import {
  applyPracticeAttemptPolicy,
  applyPracticeSignalPolicy,
} from "./learningAndReviewPolicy";
import type { AnswerEvaluation } from "../practice/AnswerEvaluation";

const now = new Date("2026-07-31T12:00:00.000Z");

describe("learning and review policy", () => {
  it.each([
    ["guided-recall", 0, false],
    ["independent-recall", 1, false],
    ["review-recall", 0, false],
    ["corrective-practice", 0, false],
    ["voluntary-practice", 0, false],
    ["independent-recall", 0, true],
  ] as const)(
    "creates First Pass only for a perfect first independent submission (%s, level %s)",
    (phase, supportLevel, expectedFirstPass) => {
      const learningState = markInstructionalCompletion(
        completeFirstExposure(undefined, "card-1", "2026-07-31T10:00:00.000Z"),
      );
      const decision = applyPracticeAttemptPolicy({
        learningState,
        reviewState: createInitialReviewState("card-1", now),
        turn: createPracticeTurn("turn-1", "card-1", phase as PracticePhase, supportLevel as RecallSupportLevel),
        evaluation: evaluation("perfect"),
        submissionIndex: 0,
        now,
      });

      expect(Boolean(decision.learningState?.firstPassedAt)).toBe(expectedFirstPass);
      expect(decision.reviewState.stage).toBe(expectedFirstPass ? 1 : 0);
    },
  );

  it.each(["close", "retry"] as const)(
    "keeps acquisition failures in focused review without counting a lapse (%s)",
    (outcome) => {
      const learningState = markInstructionalCompletion(
        completeFirstExposure(undefined, "card-1", "2026-07-31T10:00:00.000Z"),
      );
      const decision = applyPracticeAttemptPolicy({
        learningState,
        reviewState: { ...createInitialReviewState("card-1", now), lapseCount: 2 },
        turn: createPracticeTurn("turn-1", "card-1", "independent-recall"),
        evaluation: evaluation(outcome),
        submissionIndex: 0,
        now,
      });

      expect(decision.learningState?.acquisitionStatus).toBe("needs-guided");
      expect(decision.reviewState).toMatchObject({
        stage: 0,
        dueAt: "2026-07-31T12:10:00.000Z",
        lapseCount: 2,
      });
      expect(decision.turn.phase).toBe("corrective-practice");
      expect(decision.shouldRequeue).toBe(false);
    },
  );

  it("lets corrected exact text prepare another independent turn without overwriting the first result schedule", () => {
    const learningState = completeFirstExposure(undefined, "card-1", "2026-07-31T10:00:00.000Z");
    const reviewState = {
      ...createInitialReviewState("card-1", now),
      dueAt: "2026-07-31T12:10:00.000Z",
      lastReviewedAt: "2026-07-31T12:00:00.000Z",
    };
    const correctiveTurn = {
      ...createPracticeTurn("turn-1", "card-1", "corrective-practice"),
      receivedCorrection: true,
    };
    const decision = applyPracticeAttemptPolicy({
      learningState,
      reviewState,
      turn: correctiveTurn,
      evaluation: evaluation("perfect"),
      submissionIndex: 1,
      now: new Date("2026-07-31T12:03:00.000Z"),
    });

    expect(decision.learningState?.acquisitionStatus).toBe("ready-independent");
    expect(decision.learningState?.firstPassedAt).toBeUndefined();
    expect(decision.reviewState).toEqual(reviewState);
    expect(decision.shouldRequeue).toBe(true);
    expect(decision.scheduleChanged).toBe(false);
  });

  it("advances an already-passed card after an unsupported Review perfect", () => {
    const learningState = recordFirstPass(undefined, "card-1", "legacy", "2026-07-01T00:00:00.000Z");
    const decision = applyPracticeAttemptPolicy({
      learningState,
      reviewState: { ...createInitialReviewState("card-1", now), stage: 2, streak: 2 },
      turn: createPracticeTurn("turn-1", "card-1", "review-recall"),
      evaluation: evaluation("perfect"),
      submissionIndex: 0,
      now,
      hadEdits: true,
    });

    expect(decision.learningState).toEqual(learningState);
    expect(decision.reviewState).toMatchObject({
      stage: 3,
      dueAt: "2026-08-02T00:00:00.000Z",
      streak: 3,
    });
    expect(decision.scheduleChanged).toBe(true);
  });

  it.each([
    ["close", 3, 4, "2026-07-31T18:00:00.000Z"],
    ["retry", 0, 5, "2026-07-31T12:10:00.000Z"],
  ] as const)(
    "keeps distinct post-pass %s scheduling policy",
    (outcome, expectedStage, expectedLapses, expectedDueAt) => {
      const learningState = recordFirstPass(undefined, "card-1", "legacy", "2026-07-01T00:00:00.000Z");
      const decision = applyPracticeAttemptPolicy({
        learningState,
        reviewState: {
          ...createInitialReviewState("card-1", now),
          stage: 3,
          streak: 4,
          lapseCount: 4,
        },
        turn: createPracticeTurn("turn-1", "card-1", "review-recall"),
        evaluation: evaluation(outcome),
        submissionIndex: 0,
        now,
      });

      expect(decision.reviewState).toMatchObject({
        stage: expectedStage,
        dueAt: expectedDueAt,
        lapseCount: expectedLapses,
      });
      expect(decision.turn.phase).toBe("corrective-practice");
      expect(decision.turn.reviewFailureRecorded).toBe(true);
    },
  );

  it("counts target-bearing support as a lapse at most once after First Pass", () => {
    const learningState = recordFirstPass(undefined, "card-1", "legacy", "2026-07-01T00:00:00.000Z");
    const initial = {
      ...createInitialReviewState("card-1", now),
      stage: 3 as const,
      streak: 4,
      lapseCount: 4,
    };
    const first = applyPracticeSignalPolicy({
      learningState,
      reviewState: initial,
      turn: createPracticeTurn("turn-1", "card-1", "review-recall"),
      signalKind: "support-used",
      now,
    });
    const second = applyPracticeSignalPolicy({
      learningState,
      reviewState: first.reviewState,
      turn: first.turn,
      signalKind: "revealed",
      now,
    });

    expect(first.reviewState).toMatchObject({ stage: 0, lapseCount: 5 });
    expect(first.turn.reviewFailureRecorded).toBe(true);
    expect(second.reviewState).toEqual(first.reviewState);
  });

  it("treats acquisition support as teaching difficulty rather than a lapse", () => {
    const learningState = markInstructionalCompletion(
      completeFirstExposure(undefined, "card-1", "2026-07-31T10:00:00.000Z"),
    );
    const decision = applyPracticeSignalPolicy({
      learningState,
      reviewState: { ...createInitialReviewState("card-1", now), lapseCount: 2 },
      turn: createPracticeTurn("turn-1", "card-1", "independent-recall"),
      signalKind: "revealed",
      now,
    });

    expect(decision.learningState?.acquisitionStatus).toBe("needs-guided");
    expect(decision.reviewState).toMatchObject({
      dueAt: "2026-07-31T12:10:00.000Z",
      lapseCount: 2,
    });
    expect(decision.turn.reviewFailureRecorded).toBe(false);
  });

  it("never lets a signal or submission in voluntary practice mutate learning or review state", () => {
    const learningState = recordFirstPass(undefined, "card-1", "legacy", "2026-07-01T00:00:00.000Z");
    const reviewState = { ...createInitialReviewState("card-1", now), stage: 3 as const, lapseCount: 2 };
    const turn = createPracticeTurn("turn-1", "card-1", "voluntary-practice");

    const signal = applyPracticeSignalPolicy({
      learningState,
      reviewState,
      turn,
      signalKind: "skipped",
      now,
    });
    const attempt = applyPracticeAttemptPolicy({
      learningState,
      reviewState,
      turn,
      evaluation: evaluation("retry"),
      submissionIndex: 0,
      now,
    });

    expect(signal.learningState).toEqual(learningState);
    expect(signal.reviewState).toEqual(reviewState);
    expect(attempt.learningState).toEqual(learningState);
    expect(attempt.reviewState).toEqual(reviewState);
  });

  it("defensively records focused review when an assisted post-pass submission arrives before its signal", () => {
    const learningState = recordFirstPass(undefined, "card-1", "legacy", "2026-07-01T00:00:00.000Z");
    const decision = applyPracticeAttemptPolicy({
      learningState,
      reviewState: {
        ...createInitialReviewState("card-1", now),
        stage: 3,
        streak: 4,
        lapseCount: 2,
      },
      turn: createPracticeTurn("turn-1", "card-1", "guided-recall", 3, ["audio"]),
      evaluation: evaluation("perfect"),
      submissionIndex: 0,
      now,
    });

    expect(decision.reviewState).toMatchObject({ stage: 0, lapseCount: 3 });
    expect(decision.turn.reviewFailureRecorded).toBe(true);
    expect(decision.learningState).toEqual(learningState);
  });
});

function evaluation(outcome: "perfect" | "close" | "retry"): AnswerEvaluation {
  return {
    outcome,
    accuracy: outcome === "perfect" ? 1 : outcome === "close" ? 0.8 : 0.2,
    matchedWords: outcome === "retry" ? 0 : 1,
    totalWords: 1,
    expectedWords: [{ value: "Sentence", status: outcome === "retry" ? "missing" : "matched" }],
    extraWords: [],
    acceptedAnswer: "Sentence",
    normalizedAttempt: outcome === "perfect" ? "sentence" : "",
    normalizedExpected: "sentence",
    message: outcome,
  };
}
