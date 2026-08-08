import type {
  PracticePhase,
  RecallSupportKind,
  RecallSupportLevel,
} from "../../domain/practice/PracticeTurn";
import type {
  PracticeLogContext,
  PracticeQueueReason,
  PracticeRoundSummary,
  PracticeSessionEntryPoint,
} from "../../domain/practice/PracticeSessionEvidence";

/**
 * Persistence-safe scope for an in-progress practice session.
 *
 * This contract belongs to the application boundary so persistence adapters do
 * not depend on presentation state in order to store an active checkpoint.
 */
export type PracticeSessionScope =
  | { kind: "lesson"; courseId: string; lessonId: string; mode: "learn" | "replay" }
  | { kind: "review"; courseId?: string }
  | { kind: "vocabulary"; cardId?: string; courseId?: string }
  | { kind: "course"; courseId: string }
  | { kind: "focused"; cardId: string };

export interface PracticeTurnCheckpoint {
  turnId: string;
  phase: PracticePhase;
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: RecallSupportKind[];
  receivedCorrection: boolean;
  reviewFailureRecorded: boolean;
  submissionIndex: number;
}

export type PracticeOccurrenceStatus = "ready" | "completed" | "skipped";

/**
 * A target-free, persistence-safe itinerary item. The original index and return
 * index are the complete stable identity inputs; presentation labels can be
 * resolved again from the catalog after resume.
 */
export interface ResolvedPracticeOccurrence {
  id: string;
  cardId: string;
  originalIndex: number;
  returnIndex: number;
  courseId?: string;
  unitId?: string;
  lessonId?: string;
  queueReason?: PracticeQueueReason;
  scheduledReviewDueAt?: string;
  status: PracticeOccurrenceStatus;
  turn: PracticeTurnCheckpoint;
}

export interface PendingPracticeReturn {
  occurrence: ResolvedPracticeOccurrence;
  eligibleAfterCompletedCount: number;
}

export interface PersistedSessionStats {
  completedCount: number;
  perfectCount: number;
  closeCount: number;
  retryCount: number;
  skippedCount: number;
  score: number;
  combo: number;
  bestCombo: number;
  audioPlays: number;
  revealed: number;
  accuracyTotal: number;
  returnCounts: Record<string, number>;
  pendingReturns: PendingPracticeReturn[];
}

interface PracticeSessionCheckpointBase {
  id: "active";
  scope: PracticeSessionScope;
  scopeKey: string;
  catalogFingerprint: string;
  itinerary: ResolvedPracticeOccurrence[];
  currentOccurrenceId: string;
  draft: string;
  selectionStart: number;
  selectionEnd: number;
  turn: PracticeTurnCheckpoint;
  elapsedSeconds: number;
  itemElapsedSeconds: number;
  stats: PersistedSessionStats;
  updatedAt: string;
}

export interface PracticeSessionCheckpointV1 extends PracticeSessionCheckpointBase {
  schemaVersion: 1;
}

export interface PracticeSessionCheckpointV2 extends PracticeSessionCheckpointBase {
  schemaVersion: 2;
  sessionId: string;
  roundId: string;
  entryPoint: PracticeSessionEntryPoint;
  startedAt: string;
  engagedAt: string | null;
  revision: number;
  round: PracticeRoundSummary;
}

export type PracticeSessionCheckpoint =
  | PracticeSessionCheckpointV1
  | PracticeSessionCheckpointV2;

export function practiceLogContextForOccurrence(
  checkpoint: PracticeSessionCheckpointV2,
  occurrenceId: string,
): PracticeLogContext {
  const occurrence = checkpoint.itinerary.find((candidate) => candidate.id === occurrenceId)
    ?? checkpoint.stats.pendingReturns
      .map((pending) => pending.occurrence)
      .find((candidate) => candidate.id === occurrenceId);
  if (!occurrence?.queueReason) {
    throw new Error(`Practice occurrence context is unavailable: ${occurrenceId}`);
  }
  return {
    sessionId: checkpoint.sessionId,
    roundId: checkpoint.roundId,
    occurrenceId,
    queueReason: occurrence.queueReason,
    ...(occurrence.scheduledReviewDueAt
      ? { scheduledReviewDueAt: occurrence.scheduledReviewDueAt }
      : {}),
  };
}

export const EMPTY_SESSION_STATS: PersistedSessionStats = {
  completedCount: 0,
  perfectCount: 0,
  closeCount: 0,
  retryCount: 0,
  skippedCount: 0,
  score: 0,
  combo: 0,
  bestCombo: 0,
  audioPlays: 0,
  revealed: 0,
  accuracyTotal: 0,
  returnCounts: {},
  pendingReturns: [],
};
