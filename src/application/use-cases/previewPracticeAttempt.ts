import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { AttemptPreview } from "../../domain/practice/AttemptPreview";
import { buildAttemptPreview } from "../../domain/practice/buildAttemptPreview";

export function previewPracticeAttempt(card: SentenceCard, answer: string): AttemptPreview {
  return buildAttemptPreview(card, answer);
}
