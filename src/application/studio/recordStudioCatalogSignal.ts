import type { StudioCheckpoint } from "../../domain/studio/LearningStudio";
import type { TrainingRepository } from "../ports/TrainingRepository";
import { revealPracticeAnswer } from "../use-cases/revealPracticeAnswer";
import { skipPracticeCard } from "../use-cases/skipPracticeCard";

/** Linked contextual cues keep the original sentence's support consequences. */
export async function recordStudioCatalogSignal(
  repository: TrainingRepository,
  checkpoint: StudioCheckpoint,
  exerciseId: string,
  sourceCardId: string,
  kind: "revealed" | "skipped",
  now = new Date(),
) {
  const review = await repository.getReviewState(sourceCardId);
  const evidence = {
    answerWasRevealed: checkpoint.answerWasRevealed || kind === "revealed",
    hadEdits: false, audioPlayCount: 0, durationMs: 0,
    receivedCorrection: checkpoint.submissionCount > 0,
  };
  const context = {
    turnId: `${checkpoint.sessionId}:${exerciseId}`,
    phase: review && Date.parse(review.dueAt) > now.getTime()
      ? "voluntary-practice" as const : "review-recall" as const,
    receivedCorrection: checkpoint.submissionCount > 0,
  };
  return kind === "revealed"
    ? revealPracticeAnswer(repository, sourceCardId, evidence, now, context)
    : skipPracticeCard(repository, sourceCardId, evidence, now, context);
}
