import type { SentenceCardId } from "../content/SentenceCard";

export interface VocabularyEntry {
  cardId: SentenceCardId;
  savedAt: string;
}
