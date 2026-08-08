import { describe, expect, it } from "vitest";
import {
  createPracticeStatisticsState,
  finalizePracticeStatistics,
  reducePracticeStatistics,
  type ProgressPracticeLogEntry,
} from "./practiceStatistics";

function attempt(
  id: string,
  overrides: Partial<ProgressPracticeLogEntry> = {},
): ProgressPracticeLogEntry {
  return {
    id,
    kind: "attempt",
    cardId: "card-1",
    phase: "independent-recall",
    submissionIndex: 0,
    submittedAt: "2026-07-31T02:00:00.000Z",
    outcome: "perfect",
    accuracy: 1,
    ...overrides,
  };
}

describe("practice statistics", () => {
  it("reduces complete history beyond the recent 500-row window", () => {
    const logs = Array.from({ length: 650 }, (_, index) =>
      attempt(`attempt-${index}`, {
        cardId: index < 150 ? "older-card" : "recent-card",
        submittedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      }),
    );

    const result = finalizePracticeStatistics(
      logs.reduce(
        reducePracticeStatistics,
        createPracticeStatisticsState(new Date("2026-07-31T12:00:00.000Z"), "UTC"),
      ),
      14,
    );

    expect(result.allTime.totalEvents).toBe(650);
    expect(result.allTime.retrievalChecks).toBe(650);
    expect(result.byCard.find((card) => card.cardId === "older-card")?.retrievalChecks).toBe(150);
  });

  it("keeps signals, corrections, voluntary practice, and retrieval checks semantically separate", () => {
    const logs: ProgressPracticeLogEntry[] = [
      attempt("independent-perfect", { accuracy: 1, outcome: "perfect" }),
      attempt("review-close", {
        cardId: "card-2",
        phase: "review-recall",
        outcome: "close",
        accuracy: 0.75,
      }),
      attempt("correction-perfect", {
        phase: "corrective-practice",
        submissionIndex: 1,
        outcome: "perfect",
        accuracy: 1,
      }),
      attempt("guided-perfect", {
        phase: "guided-recall",
        outcome: "perfect",
        accuracy: 1,
      }),
      attempt("voluntary-retry", {
        phase: "voluntary-practice",
        outcome: "retry",
        accuracy: 0.1,
      }),
      {
        id: "signal-1",
        kind: "signal",
        cardId: "card-1",
        phase: "guided-recall",
        submittedAt: "2026-07-31T03:00:00.000Z",
        outcome: "revealed",
        accuracy: 0,
        signalKinds: ["support-used", "revealed", "skipped"],
      },
      {
        id: "legacy-retry",
        cardId: "card-3",
        phase: "legacy",
        submittedAt: "2026-07-30T03:00:00.000Z",
        outcome: "retry",
        accuracy: 0.25,
      },
      attempt("revealed-independent", {
        cardId: "card-4",
        answerWasRevealed: true,
      }),
      attempt("supported-review", {
        cardId: "card-5",
        phase: "review-recall",
        supportLevelUsed: 2,
      }),
      attempt("corrected-review", {
        cardId: "card-6",
        phase: "review-recall",
        receivedCorrection: true,
      }),
    ];

    const result = finalizePracticeStatistics(
      logs.reduce(
        reducePracticeStatistics,
        createPracticeStatisticsState(new Date("2026-07-31T12:00:00.000Z"), "UTC"),
      ),
      14,
    );

    expect(result.allTime).toMatchObject({
      totalEvents: 10,
      practiceActivityAttempts: 9,
      submissions: 8,
      retrievalChecks: 2,
      perfectRecallCount: 1,
      closeCount: 1,
      retryCount: 0,
      correctionsCompleted: 1,
      revealCount: 1,
      skipCount: 1,
      independentAccuracy: (1 + 0.75) / 2,
    });
  });

  it("emits fourteen local calendar buckets including empty days", () => {
    const state = [
      attempt("today", { submittedAt: "2026-07-31T02:00:00.000Z" }),
      attempt("three-days-ago", {
        submittedAt: "2026-07-28T02:00:00.000Z",
        outcome: "retry",
        accuracy: 0.2,
      }),
    ].reduce(
      reducePracticeStatistics,
      createPracticeStatisticsState(new Date("2026-07-31T12:00:00.000Z"), "UTC"),
    );

    const result = finalizePracticeStatistics(state, 14);

    expect(result.daily).toHaveLength(14);
    expect(result.daily[0]?.date).toBe("2026-07-18");
    expect(result.daily.at(-1)?.date).toBe("2026-07-31");
    expect(result.daily.find((day) => day.date === "2026-07-29")).toMatchObject({
      retrievalChecks: 0,
      perfectRecalls: 0,
      averageIndependentAccuracy: null,
      practiceAttempts: 0,
    });
  });
});
