import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import type { Course, LearningPath } from "../curriculum/Course";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import type { ReviewState } from "../review/ReviewState";
import {
  createPracticeStatisticsState,
  finalizePracticeStatistics,
  reducePracticeStatistics,
  type ProgressPracticeLogEntry,
} from "./practiceStatistics";
import { deriveProgressDashboard } from "./deriveProgressDashboard";

const cards: SentenceCard[] = Array.from({ length: 10 }, (_, index) => ({
  id: `card-${index}`,
  english: `Target ${index}`,
  prompt: `Prompt ${index}`,
  source: "Test",
  tags: [],
  acceptableAnswers: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}));

const course: Course = {
  id: "course-1",
  title: "Course One",
  description: "Test course",
  categoryId: "test",
  tags: [],
  level: { label: "A1", cefrFrom: "A1", cefrTo: "A1" },
  provider: { kind: "original", name: "Test" },
  revision: 1,
  license: { name: "Original", url: "https://example.com", attribution: "Test" },
  units: [
    {
      id: "unit-1",
      title: "Unit One",
      description: "Test unit",
      lessons: [
        {
          id: "lesson-1",
          title: "Lesson One",
          objective: "Test",
          cardIds: cards.slice(0, 5).map((card) => card.id),
        },
        {
          id: "lesson-2",
          title: "Lesson Two",
          objective: "Test",
          cardIds: cards.slice(5).map((card) => card.id),
        },
      ],
    },
  ],
};

const path: LearningPath = {
  id: "path-1",
  title: "Path One",
  description: "Test path",
  courseIds: [course.id],
};

const now = new Date("2026-07-31T12:00:00.000Z");

function statistics(logs: ProgressPracticeLogEntry[] = [], timeZone = "UTC") {
  return finalizePracticeStatistics(
    logs.reduce(reducePracticeStatistics, createPracticeStatisticsState(now, timeZone)),
    14,
  );
}

function learning(cardId: string, firstPassedAt?: string): SentenceLearningState {
  return firstPassedAt
    ? { cardId, introducedAt: firstPassedAt, firstPassedAt, firstPassSource: "independent-recall" }
    : { cardId, introducedAt: "2026-07-01T00:00:00.000Z", acquisitionStatus: "needs-guided" };
}

function review(cardId: string, stage: ReviewState["stage"], overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId,
    stage,
    dueAt: "2026-07-30T00:00:00.000Z",
    streak: 0,
    lapseCount: 0,
    learningStatus: "new",
    ...overrides,
  };
}

function retrieval(
  id: string,
  cardId: string,
  submittedAt: string,
  outcome: "perfect" | "close" | "retry" = "perfect",
  accuracy = outcome === "perfect" ? 1 : 0.5,
): ProgressPracticeLogEntry {
  return {
    id,
    kind: "attempt",
    cardId,
    phase: "review-recall",
    submissionIndex: 0,
    submittedAt,
    outcome,
    accuracy,
  };
}

describe("deriveProgressDashboard", () => {
  it("keeps First Pass coverage monotonic while retention reflects a later lapse", () => {
    const learningStates = cards.slice(0, 5).map((card) =>
      learning(card.id, "2026-07-01T00:00:00.000Z"),
    );
    const reviewStates = learningStates.map((state, index) =>
      review(state.cardId, index === 0 ? 0 : 3, { lapseCount: index === 0 ? 2 : 0 }),
    );

    const result = deriveProgressDashboard(
      { cards, courses: [course], learningPaths: [path], learningStates, reviewStates, statistics: statistics() },
      now,
      "UTC",
    );

    expect(result.overview).toMatchObject({ firstPassed: 5, totalCards: 10, dueNow: 5 });
    expect(result.coverage.courses[0]).toMatchObject({ passedCards: 5, totalCards: 10 });
    expect(result.coverage.courses[0]?.units[0]?.lessons[0]).toMatchObject({
      passedCards: 5,
      totalCards: 5,
    });
    expect(result.retention.masteryDistribution.stage0FocusedReview).toBe(1);
    expect(result.retention.masteryDistribution.stage3).toBe(4);
  });

  it("derives mutually exclusive mastery groups and reports missing review evidence", () => {
    const learningStates = [
      learning("card-1"),
      learning("card-2", "2026-07-01T00:00:00.000Z"),
      learning("card-3", "2026-07-01T00:00:00.000Z"),
      learning("card-4", "2026-07-01T00:00:00.000Z"),
      learning("card-5", "2026-07-01T00:00:00.000Z"),
    ];
    const reviewStates = [
      review("card-2", 0),
      review("card-3", 1),
      review("card-4", 6),
      review("card-5", 6, { learningStatus: "mastered" }),
    ];

    const result = deriveProgressDashboard(
      { cards, courses: [course], learningPaths: [path], learningStates, reviewStates, statistics: statistics() },
      now,
      "UTC",
    );

    expect(result.retention.masteryDistribution).toEqual({
      untouched: 5,
      acquiring: 1,
      stage0FocusedReview: 1,
      stage1: 1,
      stage2: 0,
      stage3: 0,
      stage4: 0,
      stage5: 0,
      stage6: 1,
      mastered: 1,
    });
    expect(result.integrityWarnings).toEqual([]);

    const missingReview = deriveProgressDashboard(
      {
        cards,
        courses: [course],
        learningPaths: [path],
        learningStates: [...learningStates, learning("card-6", "2026-07-01T00:00:00.000Z")],
        reviewStates,
        statistics: statistics(),
      },
      now,
      "UTC",
    );
    expect(missingReview.integrityWarnings).toContain("First-passed Card card-6 is missing ReviewState.");
  });

  it("emits 14-day First Pass buckets and explicit local-day streaks across boundaries", () => {
    const logs = [
      retrieval("a", "card-1", "2026-07-31T15:30:00.000Z"), // Jul 31 in New York
      retrieval("b", "card-1", "2026-07-30T15:30:00.000Z"),
      retrieval("c", "card-1", "2026-07-29T15:30:00.000Z"),
      retrieval("old", "card-1", "2025-12-31T23:30:00.000Z"),
      retrieval("new-year", "card-1", "2026-01-01T23:30:00.000Z"),
    ];
    const learningStates = [learning("card-1", "2026-07-30T20:00:00.000Z")];

    const result = deriveProgressDashboard(
      {
        cards,
        courses: [course],
        learningPaths: [path],
        learningStates,
        reviewStates: [review("card-1", 2)],
        statistics: statistics(logs, "America/New_York"),
      },
      new Date("2026-08-01T02:00:00.000Z"), // Jul 31 local
      "America/New_York",
    );

    expect(result.overview.currentStreak).toBe(3);
    expect(result.retention.longestStreak).toBe(3);
    expect(result.retention.trend).toHaveLength(14);
    expect(result.retention.trend.find((day) => day.date === "2026-07-30")?.firstPassCount).toBe(1);
    expect(result.timeZone).toBe("America/New_York");
  });

  it("uses local calendar dates across daylight-saving changes and allows a streak to end yesterday", () => {
    const dstNow = new Date("2026-03-10T03:00:00.000Z"); // Mar 9, 23:00 in New York
    const logs = [
      retrieval("mar-7", "card-1", "2026-03-08T04:30:00.000Z"), // Mar 7, EST
      retrieval("mar-8", "card-1", "2026-03-09T03:30:00.000Z"), // Mar 8, EDT
    ];
    const dstStatistics = finalizePracticeStatistics(
      logs.reduce(
        reducePracticeStatistics,
        createPracticeStatisticsState(dstNow, "America/New_York"),
      ),
      14,
    );

    const result = deriveProgressDashboard(
      {
        cards,
        courses: [course],
        learningPaths: [path],
        learningStates: [],
        reviewStates: [],
        statistics: dstStatistics,
      },
      dstNow,
      "America/New_York",
    );

    expect(dstStatistics.qualifyingPracticeDates).toEqual(["2026-03-07", "2026-03-08"]);
    expect(result.overview.currentStreak).toBe(2);
    expect(result.retention.longestStreak).toBe(2);
  });

  it("ranks at most eight weak cards without exposing target sentences", () => {
    const learningStates = cards.map((card) => learning(card.id, "2026-07-01T00:00:00.000Z"));
    const reviewStates = cards.map((card, index) =>
      review(card.id, (index % 6) as ReviewState["stage"], { lapseCount: index === 0 ? 4 : 1 }),
    );
    const logs = cards.flatMap((card, index) => [
      retrieval(`retry-${index}`, card.id, `2026-07-${String(30 - index).padStart(2, "0")}T12:00:00.000Z`, "retry", 0.3),
      retrieval(`close-${index}`, card.id, `2026-07-${String(29 - index).padStart(2, "0")}T12:00:00.000Z`, "close", 0.7),
    ]);

    const result = deriveProgressDashboard(
      { cards, courses: [course], learningPaths: [path], learningStates, reviewStates, statistics: statistics(logs) },
      now,
      "UTC",
    );

    expect(result.needsAttention.weakCards).toHaveLength(8);
    expect(result.needsAttention.weakCards[0]).toMatchObject({
      cardId: "card-0",
      prompt: "Prompt 0",
      courseTitle: "Course One",
      lapseCount: 4,
      recentNonPerfectChecks: 2,
    });
    expect(JSON.stringify(result.needsAttention.weakCards)).not.toContain("Target");
  });

  it("quarantines a target-bearing stored Prompt in the weak-card projection", () => {
    const unsafeCards = cards.map((card) => card.id === "card-0"
      ? { ...card, prompt: `旧提示：${card.english}` }
      : card);
    const result = deriveProgressDashboard(
      {
        cards: unsafeCards,
        courses: [course],
        learningPaths: [path],
        learningStates: [learning("card-0", "2026-07-01T00:00:00.000Z")],
        reviewStates: [review("card-0", 0, { lapseCount: 2 })],
        statistics: statistics(),
      },
      now,
      "UTC",
    );

    expect(result.needsAttention.weakCards[0]).toMatchObject({
      cardId: "card-0",
      prompt: "Prompt unavailable — replace or re-import this content.",
      contentSafety: "blocked-content",
    });
    expect(JSON.stringify(result)).not.toContain("旧提示：Target 0");
  });

  it("returns honest nullable metrics and empty-state flags with no data", () => {
    const result = deriveProgressDashboard(
      { cards, courses: [course], learningPaths: [path], learningStates: [], reviewStates: [], statistics: statistics() },
      now,
      "UTC",
    );

    expect(result.overview).toMatchObject({
      firstPassed: 0,
      totalCards: 10,
      dueNow: 0,
      independentAccuracy: null,
      currentStreak: 0,
    });
    expect(result.retention.trend.every((day) => day.retrievalChecks === 0)).toBe(true);
    expect(result.needsAttention).toEqual({ weakCards: [], isEmpty: true });
    expect(result.hasPracticeData).toBe(false);
  });
});
