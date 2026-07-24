import type { SentenceCardId } from "../../domain/content/SentenceCard";
import { createInitialReviewState, applySkippedReview } from "../../domain/review/reviewScheduler";
import type { ReviewState } from "../../domain/review/ReviewState";
import type { TrainingRepository } from "../ports/TrainingRepository";
import type { AttemptEvidence } from "../../domain/practice/PracticeAttempt";
import { createLocalId } from "../createLocalId";

export async function skipPracticeCard(
  repository: TrainingRepository,
  cardId: SentenceCardId,
  evidence: AttemptEvidence,
  now: Date,
): Promise<ReviewState> {
  const card = await repository.getSentenceCard(cardId);

  if (!card) {
    throw new Error(`SentenceCard not found: ${cardId}`);
  }

  const currentReviewState = (await repository.getReviewState(cardId)) ?? createInitialReviewState(cardId, now);
  const reviewState = applySkippedReview(currentReviewState, now, evidence.answerWasRevealed);
  await repository.savePracticeResult(reviewState, {
    id: createLocalId("skip"),
    cardId,
    submittedAt: now.toISOString(),
    answer: "",
    outcome: "skipped",
    accuracy: 0,
    ...evidence,
  });
  return reviewState;
}
