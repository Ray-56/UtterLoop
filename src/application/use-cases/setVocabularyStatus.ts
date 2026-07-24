import type { SentenceCardId } from "../../domain/content/SentenceCard";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";
import type { TrainingRepository } from "../ports/TrainingRepository";

export async function setVocabularyStatus(
  repository: TrainingRepository,
  cardId: SentenceCardId,
  isSaved: boolean,
  now: Date,
): Promise<VocabularyEntry | null> {
  if (!isSaved) {
    await repository.deleteVocabularyEntry(cardId);
    return null;
  }

  const card = await repository.getSentenceCard(cardId);

  if (!card) {
    throw new Error(`SentenceCard not found: ${cardId}`);
  }

  const existing = await repository.getVocabularyEntry(cardId);
  const entry = existing ?? {
    cardId,
    savedAt: now.toISOString(),
  };
  await repository.saveVocabularyEntry(entry);
  return entry;
}
