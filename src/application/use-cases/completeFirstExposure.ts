import type { SentenceCardId } from "../../domain/content/SentenceCard";
import {
  completeFirstExposure,
  type SentenceLearningState,
} from "../../domain/learning/SentenceLearningState";

interface FirstExposureRepository {
  getSentenceCard(cardId: SentenceCardId): Promise<{ id: SentenceCardId } | undefined>;
  getSentenceLearningState(cardId: SentenceCardId): Promise<SentenceLearningState | undefined>;
  saveSentenceLearningState(state: SentenceLearningState): Promise<void>;
}

export async function completeSentenceFirstExposure(
  repository: FirstExposureRepository,
  cardId: SentenceCardId,
  now: Date,
): Promise<SentenceLearningState> {
  const card = await repository.getSentenceCard(cardId);
  if (!card) {
    throw new Error(`SentenceCard not found: ${cardId}`);
  }

  const current = await repository.getSentenceLearningState(cardId);
  const next = completeFirstExposure(current, cardId, now.toISOString());
  await repository.saveSentenceLearningState(next);
  return next;
}
