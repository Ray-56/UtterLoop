import type { SentenceCardId } from "../../domain/content/SentenceCard";
import type { LearningStatus, ReviewState } from "../../domain/review/ReviewState";
import { applyReviewLearningStatus, createInitialReviewState } from "../../domain/review/reviewScheduler";
import type { TrainingRepository } from "../ports/TrainingRepository";
import { recordFirstPass } from "../../domain/learning/SentenceLearningState";

export async function setReviewLearningStatus(
  repository: TrainingRepository,
  cardId: SentenceCardId,
  status: LearningStatus,
  now: Date,
): Promise<ReviewState> {
  const current = (await repository.getReviewState(cardId)) ?? createInitialReviewState(cardId, now);
  const next = applyReviewLearningStatus(current, status, now);
  if (status === "mastered") {
    const currentLearning = await repository.getSentenceLearningState(cardId);
    const learningState = recordFirstPass(
      currentLearning,
      cardId,
      "explicit-mastery",
      now.toISOString(),
    );
    await repository.saveLearningAndReviewState(learningState, next);
  } else {
    await repository.saveReviewState(next);
  }
  return next;
}
