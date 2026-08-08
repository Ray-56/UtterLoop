import type { SentenceCardId } from "../content/SentenceCard";
import type {
  PracticePhase,
  RecallSupportKind,
  RecallSupportLevel,
} from "./PracticeTurn";
import type { PracticeLogContext } from "./PracticeSessionEvidence";

export interface AttemptEvidence {
  answerWasRevealed: boolean;
  hadEdits: boolean;
  audioPlayCount: number;
  durationMs: number;
  supportLevelUsed?: RecallSupportLevel;
  supportKindsUsed?: RecallSupportKind[];
  receivedCorrection?: boolean;
}

export interface PracticeAttempt extends AttemptEvidence {
  cardId: SentenceCardId;
  answer: string;
  submittedAt: string;
  turnId?: string;
  phase?: PracticePhase;
  submissionIndex?: number;
  reviewFailureRecorded?: boolean;
  context?: PracticeLogContext;
}
