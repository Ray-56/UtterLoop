import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { Course } from "../../domain/curriculum/Course";
import type {
  PracticePhase,
  RecallSupportKind,
  RecallSupportLevel,
} from "../../domain/practice/PracticeTurn";
import type { PracticeSessionCheckpoint } from "../../application/practice-session/PracticeSessionCheckpoint";

export {
  EMPTY_SESSION_STATS,
  type PendingPracticeReturn,
  type PersistedSessionStats,
  type PracticeOccurrenceStatus,
  type PracticeSessionCheckpoint,
  type PracticeSessionScope,
  type PracticeTurnCheckpoint,
  type ResolvedPracticeOccurrence,
} from "../../application/practice-session/PracticeSessionCheckpoint";

export interface PracticeSessionCatalog {
  courses: readonly Course[];
  cards: readonly SentenceCard[];
}

export type PracticeCommandKind = "submit" | "support" | "skip" | "mastered" | "vocabulary";

export type PracticeCommandRecovery =
  | { status: "idle" }
  | { status: "pending"; commandKind: PracticeCommandKind; commandId: string }
  | { status: "recoverable-error"; commandKind: PracticeCommandKind; commandId: string; message: string }
  | { status: "recovered"; commandKind: PracticeCommandKind; commandId: string; evidenceId: string };

export type PracticeSessionState = PracticeSessionCheckpoint & {
  commandRecovery: PracticeCommandRecovery;
};

export interface DurableAttemptEvidence {
  kind: "attempt";
  id: string;
  turnId: string;
  cardId: string;
  submissionIndex: number;
  phase: PracticePhase | "legacy";
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: RecallSupportKind[];
  receivedCorrection: boolean;
}

export interface DurableSignalEvidence {
  kind: "signal";
  id: string;
  turnId: string;
  cardId: string;
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: RecallSupportKind[];
  reviewFailureRecorded: boolean;
}

export type DurablePracticeEvidence = DurableAttemptEvidence | DurableSignalEvidence;
