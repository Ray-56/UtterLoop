import type { SentenceCardId } from "../content/SentenceCard";

export interface AttemptEvidence {
  answerWasRevealed: boolean;
  hadEdits: boolean;
  audioPlayCount: number;
  durationMs: number;
}

export interface PracticeAttempt extends AttemptEvidence {
  cardId: SentenceCardId;
  answer: string;
  submittedAt: string;
}
