import type { SentenceCardId } from "../content/SentenceCard";
import type { EvaluationOutcome } from "./AnswerEvaluation";

export type PracticeLogOutcome = EvaluationOutcome | "revealed" | "skipped";

export interface PracticeLogEntry {
  id: string;
  cardId: SentenceCardId;
  submittedAt: string;
  answer: string;
  outcome: PracticeLogOutcome;
  accuracy: number;
  answerWasRevealed: boolean;
  hadEdits: boolean;
  audioPlayCount: number;
  durationMs: number;
}
