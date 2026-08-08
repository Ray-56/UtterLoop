import type { SentenceCardId } from "../content/SentenceCard";
import type { PracticeLogEntry } from "./PracticeLogEntry";

export const PRACTICE_SESSION_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type PracticeSessionEntryPoint = "standard" | "quick-start-v1";

export type PracticeSessionEvidenceScope =
  | { kind: "lesson"; courseId: string; lessonId: string; mode: "learn" | "replay" }
  | { kind: "review"; courseId?: string }
  | { kind: "vocabulary"; cardId?: SentenceCardId; courseId?: string }
  | { kind: "course"; courseId: string }
  | { kind: "focused"; cardId: SentenceCardId };

export type PracticeSessionTerminal =
  | { kind: "completed"; reason: "scope-complete" | "round-complete" | "quick-start-complete" }
  | { kind: "dismissed"; reason: "quick-start-dismissed" }
  | { kind: "abandoned"; reason: "start-over" | "replaced" | "expired" }
  | {
      kind: "invalidated";
      reason: "stale" | "unsupported" | "corrupt" | "catalog-mismatch";
    };

export interface PracticeRoundRequeueSummary {
  insertedReturnOccurrenceIds: string[];
  deferredNoRoomCardIds: SentenceCardId[];
  capReachedCardIds: SentenceCardId[];
}

export interface PracticeRoundSummary {
  initialOccurrenceIds: string[];
  scheduledOccurrenceIds: string[];
  attemptedOccurrenceIds: string[];
  completedOccurrenceIds: string[];
  skippedOccurrenceIds: string[];
  remainingOccurrenceIds: string[];
  dueReviewScheduledOccurrenceIds: string[];
  dueReviewCompletedOccurrenceIds: string[];
  introducedCardIds: SentenceCardId[];
  firstPassCardIds: SentenceCardId[];
  requeue: PracticeRoundRequeueSummary;
}

/**
 * Durable lifecycle and round evidence. It deliberately contains no Prompt,
 * Target Sentence, learner answer, accepted answer, or audio payload.
 */
export interface PracticeSessionEvidence {
  schemaVersion: typeof PRACTICE_SESSION_EVIDENCE_SCHEMA_VERSION;
  sessionId: string;
  roundId: string;
  scope: PracticeSessionEvidenceScope;
  entryPoint: PracticeSessionEntryPoint;
  startedAt: string;
  engagedAt: string | null;
  endedAt: string;
  terminal: PracticeSessionTerminal;
  round: PracticeRoundSummary;
}

/** The target-free lifecycle fields needed to project an active interruption. */
export interface ActivePracticeSessionCheckpointEvidence {
  sessionId: string;
  roundId: string;
  entryPoint: PracticeSessionEntryPoint;
  startedAt: string;
  engagedAt: string | null;
  updatedAt: string;
}

export type PracticeQueueReason =
  | "new-learning"
  | "due-review"
  | "focused-practice"
  | "voluntary-practice";

export interface PracticeLogContext {
  sessionId: string;
  roundId: string;
  occurrenceId: string;
  queueReason: PracticeQueueReason;
  scheduledReviewDueAt?: string;
}

export type ContextualPracticeLogEntry = PracticeLogEntry & {
  context?: PracticeLogContext;
};
