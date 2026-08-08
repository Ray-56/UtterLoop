import { describe, expect, it } from "vitest";
import { migrateLegacyV3Data } from "./migrateLegacyV3Data";

describe("migrateLegacyV3Data", () => {
  it("backfills First Pass by perfect, mastery, then stage and normalizes every legacy row", () => {
    const result = migrateLegacyV3Data({
      migrationAt: "2026-07-31T12:00:00.000Z",
      logs: [
        legacyLog("later", "card-perfect", "perfect", "2026-07-03T00:00:00.000Z"),
        legacyLog("earlier", "card-perfect", "perfect", "2026-07-02T00:00:00.000Z"),
        { ...legacyLog("revealed-perfect", "card-mastered", "perfect", "2026-07-01T00:00:00.000Z"), answerWasRevealed: true },
        legacyLog("skip", "card-stage", "skipped", "2026-07-04T00:00:00.000Z"),
      ],
      reviewStates: [
        reviewState("card-mastered", 6, "mastered"),
        reviewState("card-stage", 2),
        reviewState("card-untouched", 0),
      ],
    });

    expect(result.learningStates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardId: "card-perfect",
        introducedAt: "2026-07-02T00:00:00.000Z",
        firstPassedAt: "2026-07-02T00:00:00.000Z",
        firstPassSource: "legacy",
      }),
      expect.objectContaining({ cardId: "card-mastered", firstPassSource: "explicit-mastery" }),
      expect.objectContaining({
        cardId: "card-stage",
        firstPassedAt: "2026-07-30T00:00:00.000Z",
        firstPassSource: "legacy",
      }),
    ]));
    expect(result.learningStates.some((state) => state.cardId === "card-untouched")).toBe(false);
    expect(result.logs.find((entry) => entry.turnId === "legacy:earlier")).toMatchObject({
      kind: "attempt",
      id: "turn-attempt:legacy:earlier:0",
      submissionIndex: 0,
      phase: "legacy",
      supportLevelUsed: 0,
    });
    expect(result.logs.find((entry) => entry.turnId === "legacy:skip")).toMatchObject({
      kind: "signal",
      id: "turn-signal:legacy:skip",
      signalKinds: ["skipped"],
      reviewFailureRecorded: true,
    });
  });
});

function legacyLog(id: string, cardId: string, outcome: "perfect" | "skipped", submittedAt: string) {
  return {
    id,
    cardId,
    submittedAt,
    answer: outcome === "perfect" ? "Sentence" : "",
    outcome,
    accuracy: outcome === "perfect" ? 1 : 0,
    answerWasRevealed: false,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 1000,
  };
}

function reviewState(cardId: string, stage: 0 | 2 | 6, learningStatus?: "mastered") {
  return {
    cardId,
    stage,
    dueAt: "2026-07-31T00:00:00.000Z",
    lastReviewedAt: "2026-07-30T00:00:00.000Z",
    streak: stage,
    lapseCount: 0,
    learningStatus,
  };
}
