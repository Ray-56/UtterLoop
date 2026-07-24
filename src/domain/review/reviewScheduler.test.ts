import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import { buildPracticeQueue } from "../training/buildPracticeQueue";
import type { ReviewState } from "./ReviewState";
import {
  applyAnswerReveal,
  applyEvaluationToReviewState,
  applyReviewLearningStatus,
  applySkippedReview,
} from "./reviewScheduler";
import type { AnswerEvaluation } from "../practice/AnswerEvaluation";

const now = new Date("2026-07-18T12:00:00.000Z");

function reviewState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId: "card-1",
    stage: 3,
    dueAt: now.toISOString(),
    streak: 4,
    lapseCount: 1,
    ...overrides,
  };
}

function sentenceCard(id: string): SentenceCard {
  return {
    id,
    english: `Sentence ${id}`,
    prompt: `Prompt ${id}`,
    source: "Test",
    tags: [],
    acceptableAnswers: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

describe("review learning status", () => {
  it("moves a mastered sentence out of active review", () => {
    const mastered = applyReviewLearningStatus(reviewState(), "mastered", now);
    const queue = buildPracticeQueue([sentenceCard("card-1")], [mastered], now);

    expect(mastered.learningStatus).toBe("mastered");
    expect(mastered.stage).toBe(6);
    expect(queue.due).toEqual([]);
    expect(queue.upcoming).toEqual([]);
  });

  it("resets a sentence marked as new for immediate focused review", () => {
    const markedNew = applyReviewLearningStatus(reviewState(), "new", now);

    expect(markedNew.learningStatus).toBe("new");
    expect(markedNew.stage).toBe(0);
    expect(markedNew.streak).toBe(0);
    expect(markedNew.dueAt).toBe(now.toISOString());
  });
});

describe("review evidence", () => {
  it("schedules edited recall sooner than clean recall", () => {
    const clean = applyEvaluationToReviewState(reviewState({ stage: 0 }), perfectEvaluation(), now);
    const edited = applyEvaluationToReviewState(reviewState({ stage: 0 }), perfectEvaluation(), now, {
      answerWasRevealed: false,
      hadEdits: true,
    });

    expect(clean.stage).toBe(1);
    expect(edited.stage).toBe(1);
    expect(new Date(edited.dueAt).getTime()).toBeLessThan(new Date(clean.dueAt).getTime());
  });

  it("keeps revealed and skipped cards in short focused review", () => {
    const revealSignal = applyAnswerReveal(reviewState(), now);
    const revealedAttempt = applyEvaluationToReviewState(revealSignal, perfectEvaluation(), now, {
      answerWasRevealed: true,
      hadEdits: false,
    });
    const skipped = applySkippedReview(reviewState(), now);
    const skippedAfterReveal = applySkippedReview(revealSignal, now, true);
    const expectedDueAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    expect(revealSignal).toMatchObject({ stage: 0, dueAt: expectedDueAt, streak: 0, lapseCount: 2 });
    expect(revealedAttempt).toMatchObject({ stage: 0, dueAt: expectedDueAt, streak: 0, lapseCount: 2 });
    expect(skipped).toMatchObject({ stage: 0, dueAt: expectedDueAt, streak: 0, lapseCount: 2 });
    expect(skippedAfterReveal).toMatchObject({ stage: 0, dueAt: expectedDueAt, streak: 0, lapseCount: 2 });
  });
});

function perfectEvaluation(): AnswerEvaluation {
  return {
    outcome: "perfect",
    accuracy: 1,
    matchedWords: 1,
    totalWords: 1,
    expectedWords: [{ value: "Sentence", status: "matched" }],
    extraWords: [],
    acceptedAnswer: "Sentence",
    normalizedAttempt: "sentence",
    normalizedExpected: "sentence",
    message: "Perfect",
  };
}
