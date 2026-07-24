import { evaluateAttempt } from "../../domain/practice/evaluateAttempt";
import type { PracticeAttempt } from "../../domain/practice/PracticeAttempt";
import { createInitialReviewState, applyEvaluationToReviewState } from "../../domain/review/reviewScheduler";
import type { AnswerEvaluation } from "../../domain/practice/AnswerEvaluation";
import { buildAttemptPreview } from "../../domain/practice/buildAttemptPreview";
import type { ReviewState } from "../../domain/review/ReviewState";
import type { TrainingRepository } from "../ports/TrainingRepository";
import { createLocalId } from "../createLocalId";

export interface SubmitPracticeAttemptResult {
  evaluation: AnswerEvaluation;
  reviewState: ReviewState;
}

export async function submitPracticeAttempt(
  repository: TrainingRepository,
  attempt: PracticeAttempt,
  now: Date,
): Promise<SubmitPracticeAttemptResult> {
  const card = await repository.getSentenceCard(attempt.cardId);

  if (!card) {
    throw new Error(`SentenceCard not found: ${attempt.cardId}`);
  }

  if (!buildAttemptPreview(card, attempt.answer).isComplete) {
    throw new Error("Attempt is incomplete.");
  }

  const evaluation = evaluateAttempt(card, attempt);
  const currentReviewState = (await repository.getReviewState(card.id)) ?? createInitialReviewState(card.id, now);
  const reviewState = applyEvaluationToReviewState(currentReviewState, evaluation, now, attempt);

  await repository.savePracticeResult(reviewState, {
    id: createLocalId("attempt"),
    cardId: card.id,
    submittedAt: attempt.submittedAt,
    answer: attempt.answer,
    outcome: evaluation.outcome,
    accuracy: evaluation.accuracy,
    answerWasRevealed: attempt.answerWasRevealed,
    hadEdits: attempt.hadEdits,
    audioPlayCount: attempt.audioPlayCount,
    durationMs: attempt.durationMs,
  });

  return {
    evaluation,
    reviewState,
  };
}
