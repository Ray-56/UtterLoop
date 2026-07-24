import type { SentenceCardId } from "../content/SentenceCard";
import type { AnswerEvaluation } from "../practice/AnswerEvaluation";
import type { AttemptEvidence } from "../practice/PracticeAttempt";
import type { LearningStatus, MasteryStage, ReviewState } from "./ReviewState";

const PERFECT_INTERVALS_IN_MINUTES = [60 * 8, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 14, 60 * 24 * 30];
const RETRY_INTERVAL_IN_MINUTES = 10;

export function createInitialReviewState(cardId: SentenceCardId, now: Date): ReviewState {
  return {
    cardId,
    stage: 0,
    dueAt: now.toISOString(),
    streak: 0,
    lapseCount: 0,
  };
}

export function applyEvaluationToReviewState(
  current: ReviewState,
  evaluation: AnswerEvaluation,
  now: Date,
  evidence: Pick<AttemptEvidence, "answerWasRevealed" | "hadEdits"> = {
    answerWasRevealed: false,
    hadEdits: false,
  },
): ReviewState {
  if (evidence.answerWasRevealed) {
    return keepInFocusedReview(current, now);
  }

  if (evaluation.outcome === "perfect") {
    const nextStage = clampStage(current.stage + 1);
    const interval = PERFECT_INTERVALS_IN_MINUTES[nextStage - 1] ?? PERFECT_INTERVALS_IN_MINUTES[0];

    return {
      ...current,
      stage: nextStage,
      dueAt: addMinutes(now, evidence.hadEdits ? Math.round(interval / 2) : interval),
      lastReviewedAt: now.toISOString(),
      streak: current.streak + 1,
    };
  }

  if (evaluation.outcome === "close") {
    return {
      ...current,
      dueAt: addMinutes(now, 60 * 6),
      lastReviewedAt: now.toISOString(),
      streak: current.streak,
    };
  }

  return applyFailedRecall(current, now);
}

export function applyAnswerReveal(current: ReviewState, now: Date): ReviewState {
  return applyFailedRecall(current, now);
}

export function applySkippedReview(
  current: ReviewState,
  now: Date,
  answerWasAlreadyRevealed = false,
): ReviewState {
  return answerWasAlreadyRevealed
    ? keepInFocusedReview(current, now)
    : applyFailedRecall(current, now);
}

export function isReviewDue(reviewState: ReviewState, now: Date): boolean {
  return new Date(reviewState.dueAt).getTime() <= now.getTime();
}

export function applyReviewLearningStatus(
  current: ReviewState,
  status: LearningStatus,
  now: Date,
): ReviewState {
  if (status === "mastered") {
    return {
      ...current,
      learningStatus: "mastered",
      stage: 6,
      lastReviewedAt: now.toISOString(),
    };
  }

  return {
    ...current,
    learningStatus: "new",
    stage: 0,
    dueAt: now.toISOString(),
    streak: 0,
  };
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function applyFailedRecall(current: ReviewState, now: Date): ReviewState {
  return {
    ...keepInFocusedReview(current, now),
    lapseCount: current.lapseCount + 1,
  };
}

function keepInFocusedReview(current: ReviewState, now: Date): ReviewState {
  return {
    ...current,
    stage: 0,
    dueAt: addMinutes(now, RETRY_INTERVAL_IN_MINUTES),
    lastReviewedAt: now.toISOString(),
    streak: 0,
  };
}

function clampStage(stage: number): MasteryStage {
  return Math.min(Math.max(stage, 0), 6) as MasteryStage;
}
