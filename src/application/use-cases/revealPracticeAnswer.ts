import type { SentenceCardId } from "../../domain/content/SentenceCard";
import type { AttemptEvidence } from "../../domain/practice/PracticeAttempt";
import {
  applyAnswerReveal,
  createInitialReviewState,
} from "../../domain/review/reviewScheduler";
import type { ReviewState } from "../../domain/review/ReviewState";
import { createLocalId } from "../createLocalId";
import type { TrainingRepository } from "../ports/TrainingRepository";

export async function revealPracticeAnswer(
  repository: TrainingRepository,
  cardId: SentenceCardId,
  evidence: AttemptEvidence,
  now: Date,
): Promise<ReviewState> {
  const card = await repository.getSentenceCard(cardId);

  if (!card) {
    throw new Error(`SentenceCard not found: ${cardId}`);
  }

  const currentReviewState = (await repository.getReviewState(cardId))
    ?? createInitialReviewState(cardId, now);
  const reviewState = applyAnswerReveal(currentReviewState, now);

  await repository.savePracticeResult(reviewState, {
    id: createLocalId("reveal"),
    cardId,
    submittedAt: now.toISOString(),
    answer: "",
    outcome: "revealed",
    accuracy: 0,
    ...evidence,
    answerWasRevealed: true,
  });

  return reviewState;
}
