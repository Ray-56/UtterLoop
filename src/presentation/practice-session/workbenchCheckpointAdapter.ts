import type {
  PracticeScope,
  PracticeSessionItem,
} from "../../application/use-cases/buildPracticeSession";
import type { PracticeTurn } from "../../domain/practice/PracticeTurn";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import type { PracticeSessionCheckpointSeed } from "../../application/practice-session/PracticeSessionLifecycle";
import {
  catalogFingerprint,
  createResolvedPracticeOccurrence,
  practiceScopeKey,
  resolvePracticeSessionCheckpoint,
  validatePracticeSessionCheckpoint,
  type CheckpointDiscardReason,
  type DurablePracticeEvidence,
  type PersistedSessionStats,
  type PracticeSessionCatalog,
  type PracticeSessionCheckpoint,
  type PracticeTurnCheckpoint,
  type ResolvedPracticeOccurrence,
} from ".";

/** The structural subset of PracticeWorkbench's private SessionStats contract. */
export interface WorkbenchCheckpointStats {
  score: number;
  combo: number;
  maxCombo: number;
  attempts: number;
  perfect: number;
  great: number;
  audioPlays: number;
  revealed: number;
  skipped: number;
  accuracyTotal: number;
}

export interface CreateWorkbenchPracticeSessionCheckpointInput {
  scope: PracticeScope;
  items: readonly PracticeSessionItem[];
  currentIndex: number;
  draft: string;
  selectionStart: number;
  selectionEnd: number;
  practiceTurn: PracticeTurn;
  submissionIndex: number;
  elapsedSeconds: number;
  itemElapsedSeconds: number;
  stats: WorkbenchCheckpointStats;
  returnCounts: Readonly<Record<string, number>>;
  pendingReturnCount: number;
  catalog: PracticeSessionCatalog;
  updatedAt: string;
}

export const PENDING_RETURN_RECOVERY_STRATEGY = "reconstructed-from-recent-occurrences" as const;

export interface RestoreWorkbenchPracticeSessionCheckpointInput {
  checkpoint: unknown;
  scope: PracticeScope;
  items: readonly PracticeSessionItem[];
  catalog: PracticeSessionCatalog;
  masteredCardIds: readonly string[];
  durableEvidence: readonly DurablePracticeEvidence[];
  now: Date;
}

export interface WorkbenchPendingReturnState {
  cardId: string;
  originalIndex: number;
  returnIndex: number;
  courseId?: string;
  unitId?: string;
  lessonId?: string;
  eligibleAfterCompletedCount: number;
}

export interface RestoredWorkbenchPracticeViewState {
  itinerary: PracticeSessionItem[];
  occurrenceIds: string[];
  currentIndex: number;
  currentOccurrenceId: string;
  draft: string;
  selectionStart: number;
  selectionEnd: number;
  practiceTurn: PracticeTurn;
  submissionIndex: number;
  elapsedSeconds: number;
  itemElapsedSeconds: number;
  stats: WorkbenchCheckpointStats;
  returnCounts: Record<string, number>;
  pendingReturnCount: number;
  pendingReturns: WorkbenchPendingReturnState[];
  pendingReturnStrategy: typeof PENDING_RETURN_RECOVERY_STRATEGY;
}

export type RestoreWorkbenchPracticeSessionCheckpointResult =
  | {
      status: "resume";
      viewState: RestoredWorkbenchPracticeViewState;
      recoveredCommand: { kind: "submission"; evidenceId: string } | null;
    }
  | {
      status: "discard";
      reason: CheckpointDiscardReason | "session-item-missing";
      message: string;
    };

export function createWorkbenchPracticeSessionCheckpoint(
  input: CreateWorkbenchPracticeSessionCheckpointInput,
): PracticeSessionCheckpoint {
  if (input.items.length === 0) {
    throw new Error("A Workbench checkpoint needs at least one Practice occurrence.");
  }
  if (!Number.isSafeInteger(input.currentIndex) || input.currentIndex < 0 || input.currentIndex >= input.items.length) {
    throw new Error("Workbench currentIndex must reference an itinerary item.");
  }

  const catalogCardIds = new Set(input.catalog.cards.map((card) => card.id));
  const missingCard = input.items.find((item) => !catalogCardIds.has(item.card.id));
  if (missingCard) {
    throw new Error(`Workbench itinerary references missing SentenceCard: ${missingCard.card.id}`);
  }

  const firstOccurrenceByContext = new Map<string, { originalIndex: number; nextReturnIndex: number }>();
  let nextOriginalIndex = 0;
  const itinerary = input.items.map((item, itemIndex) => {
    const context = item.occurrenceContext;
    const signature = occurrenceContextKey(item);
    const firstOccurrence = firstOccurrenceByContext.get(signature);
    const originalIndex = firstOccurrence?.originalIndex ?? nextOriginalIndex;
    const returnIndex = firstOccurrence?.nextReturnIndex ?? 0;
    if (firstOccurrence) {
      firstOccurrence.nextReturnIndex += 1;
    } else {
      firstOccurrenceByContext.set(signature, { originalIndex, nextReturnIndex: 1 });
      nextOriginalIndex += 1;
    }
    const occurrence = createResolvedPracticeOccurrence({
      scope: input.scope,
      cardId: item.card.id,
      originalIndex,
      returnIndex,
      phase: item.initialPhase
        ?? (returnIndex > 0 ? "independent-recall" : defaultPhase(input.scope)),
      courseId: context?.courseId,
      unitId: context?.unitId,
      lessonId: context?.lessonId,
    });
    return {
      ...occurrence,
      status: itemIndex < input.currentIndex ? "completed" as const : "ready" as const,
      turn: {
        ...occurrence.turn,
        supportLevelUsed: item.initialSupportLevel ?? 0,
        supportKindsUsed: [...(item.initialSupportKinds ?? [])],
      },
    };
  });
  const current = itinerary[input.currentIndex];
  if (input.practiceTurn.cardId !== current.cardId) {
    throw new Error(`Active PracticeTurn belongs to ${input.practiceTurn.cardId}, not ${current.cardId}.`);
  }

  const turn = toTurnCheckpoint(input.practiceTurn, input.submissionIndex);
  itinerary[input.currentIndex] = { ...current, turn };
  const selectionStart = clampSelection(input.selectionStart, input.draft.length);
  const selectionEnd = clampSelection(input.selectionEnd, input.draft.length);
  const checkpoint: PracticeSessionCheckpoint = {
    id: "active",
    schemaVersion: 1,
    scope: structuredClone(input.scope),
    scopeKey: practiceScopeKey(input.scope),
    catalogFingerprint: catalogFingerprint(input.scope, input.catalog),
    itinerary,
    currentOccurrenceId: itinerary[input.currentIndex].id,
    draft: input.draft,
    selectionStart: Math.min(selectionStart, selectionEnd),
    selectionEnd: Math.max(selectionStart, selectionEnd),
    turn,
    elapsedSeconds: nonNegative(input.elapsedSeconds, "elapsedSeconds"),
    itemElapsedSeconds: nonNegative(input.itemElapsedSeconds, "itemElapsedSeconds"),
    stats: toPersistedStats(input, itinerary),
    updatedAt: input.updatedAt,
  };

  const validation = validatePracticeSessionCheckpoint(checkpoint);
  if (!validation.ok) {
    throw new Error(`Workbench checkpoint is invalid: ${validation.detail}`);
  }
  return validation.checkpoint;
}

export function createWorkbenchPracticeSessionCheckpointSeed(
  input: CreateWorkbenchPracticeSessionCheckpointInput,
): PracticeSessionCheckpointSeed {
  const legacy = createWorkbenchPracticeSessionCheckpoint(input);
  if (legacy.schemaVersion !== 1) {
    throw new Error("Workbench lifecycle seed requires a schema-v1 checkpoint template.");
  }
  const itinerary = legacy.itinerary.map((occurrence, index) => withQueueContext(
    occurrence,
    input.items[index],
  ));
  const pendingReturns = legacy.stats.pendingReturns.map((pending) => ({
    ...structuredClone(pending),
    occurrence: withQueueContext(
      pending.occurrence,
      input.items.find((item) => item.card.id === pending.occurrence.cardId),
    ),
  }));
  const completedOccurrenceIds = itinerary
    .filter((occurrence) => occurrence.status === "completed")
    .map((occurrence) => occurrence.id);
  const skippedOccurrenceIds = itinerary
    .filter((occurrence) => occurrence.status === "skipped")
    .map((occurrence) => occurrence.id);
  const remainingOccurrenceIds = itinerary
    .filter((occurrence) => occurrence.status === "ready")
    .map((occurrence) => occurrence.id);
  const dueReviewOccurrences = itinerary.filter(
    (occurrence) => occurrence.queueReason === "due-review" && occurrence.returnIndex === 0,
  );
  const {
    schemaVersion: _schemaVersion,
    updatedAt: _updatedAt,
    ...checkpoint
  } = legacy;

  return {
    ...checkpoint,
    itinerary,
    stats: { ...structuredClone(legacy.stats), pendingReturns },
    round: {
      initialOccurrenceIds: itinerary.map((occurrence) => occurrence.id),
      scheduledOccurrenceIds: itinerary.map((occurrence) => occurrence.id),
      attemptedOccurrenceIds: [...completedOccurrenceIds],
      completedOccurrenceIds,
      skippedOccurrenceIds,
      remainingOccurrenceIds,
      dueReviewScheduledOccurrenceIds: dueReviewOccurrences.map((occurrence) => occurrence.id),
      dueReviewCompletedOccurrenceIds: dueReviewOccurrences
        .filter((occurrence) => occurrence.status === "completed")
        .map((occurrence) => occurrence.id),
      introducedCardIds: [],
      firstPassCardIds: [],
      requeue: {
        insertedReturnOccurrenceIds: [],
        deferredNoRoomCardIds: [...new Set(
          pendingReturns.map((pending) => pending.occurrence.cardId),
        )],
        capReachedCardIds: Object.entries(legacy.stats.returnCounts)
          .filter(([, count]) => count >= 2)
          .map(([cardId]) => cardId),
      },
    },
  };
}

function withQueueContext(
  occurrence: ResolvedPracticeOccurrence,
  item: PracticeSessionItem | undefined,
): ResolvedPracticeOccurrence {
  const queueReason = item?.queueReason ?? "voluntary-practice";
  return {
    ...structuredClone(occurrence),
    queueReason,
    ...(queueReason === "due-review" && item?.scheduledReviewDueAt
      ? { scheduledReviewDueAt: item.scheduledReviewDueAt }
      : {}),
  };
}

export function restoreWorkbenchPracticeSessionCheckpoint(
  input: RestoreWorkbenchPracticeSessionCheckpointInput,
): RestoreWorkbenchPracticeSessionCheckpointResult {
  const resolved = resolvePracticeSessionCheckpoint({
    checkpoint: input.checkpoint,
    expectedScope: input.scope,
    catalog: input.catalog,
    masteredCardIds: input.masteredCardIds,
    durableEvidence: input.durableEvidence,
    now: input.now,
  });
  if (resolved.status === "discard") return resolved;

  const savedCurrentIndex = resolved.checkpoint.itinerary.findIndex(
    (occurrence) => occurrence.id === resolved.checkpoint.currentOccurrenceId,
  );

  const itemsByContext = new Map<string, PracticeSessionItem[]>();
  for (const item of input.items) {
    const key = occurrenceContextKey(item);
    itemsByContext.set(key, [...(itemsByContext.get(key) ?? []), item]);
  }
  const itinerary: PracticeSessionItem[] = [];
  const restoredOccurrences: ResolvedPracticeOccurrence[] = [];
  for (const [occurrenceIndex, occurrence] of resolved.checkpoint.itinerary.entries()) {
    const candidates = itemsByContext.get(occurrenceKey(occurrence)) ?? [];
    const item = candidates[Math.min(occurrence.returnIndex, candidates.length - 1)];
    if (!item) {
      if (canOmitCompletedLessonPredecessor(
        input.scope,
        occurrence,
        occurrenceIndex,
        savedCurrentIndex,
      )) {
        continue;
      }
      return {
        status: "discard",
        reason: "session-item-missing",
        message: `Saved Practice occurrence cannot be resolved to the current session item: ${occurrence.cardId}`,
      };
    }
    itinerary.push(item);
    restoredOccurrences.push(occurrence);
  }

  const currentIndex = restoredOccurrences.findIndex(
    (occurrence) => occurrence.id === resolved.checkpoint.currentOccurrenceId,
  );
  if (currentIndex < 0) {
    return {
      status: "discard",
      reason: "session-item-missing",
      message: "Saved Practice current occurrence cannot be restored.",
    };
  }
  const currentOccurrence = restoredOccurrences[currentIndex];
  const turn = resolved.checkpoint.turn;

  return {
    status: "resume",
    recoveredCommand: resolved.recoveredCommand,
    viewState: {
      itinerary,
      occurrenceIds: restoredOccurrences.map((occurrence) => occurrence.id),
      currentIndex,
      currentOccurrenceId: resolved.checkpoint.currentOccurrenceId,
      draft: resolved.checkpoint.draft,
      selectionStart: resolved.checkpoint.selectionStart,
      selectionEnd: resolved.checkpoint.selectionEnd,
      practiceTurn: {
        id: turn.turnId,
        cardId: currentOccurrence.cardId,
        phase: turn.phase,
        supportLevelUsed: turn.supportLevelUsed,
        supportKindsUsed: [...turn.supportKindsUsed],
        answerWasRevealed: turn.supportKindsUsed.includes("answer"),
        receivedCorrection: turn.receivedCorrection,
        reviewFailureRecorded: turn.reviewFailureRecorded,
      },
      submissionIndex: turn.submissionIndex,
      elapsedSeconds: resolved.checkpoint.elapsedSeconds,
      itemElapsedSeconds: resolved.checkpoint.itemElapsedSeconds,
      stats: fromPersistedStats(resolved.checkpoint.stats),
      returnCounts: { ...resolved.checkpoint.stats.returnCounts },
      pendingReturnCount: resolved.checkpoint.stats.pendingReturns.length,
      pendingReturns: resolved.checkpoint.stats.pendingReturns.map(({ occurrence, eligibleAfterCompletedCount }) => ({
        cardId: occurrence.cardId,
        originalIndex: occurrence.originalIndex,
        returnIndex: occurrence.returnIndex,
        ...(occurrence.courseId ? { courseId: occurrence.courseId } : {}),
        ...(occurrence.unitId ? { unitId: occurrence.unitId } : {}),
        ...(occurrence.lessonId ? { lessonId: occurrence.lessonId } : {}),
        eligibleAfterCompletedCount,
      })),
      pendingReturnStrategy: PENDING_RETURN_RECOVERY_STRATEGY,
    },
  };
}

function canOmitCompletedLessonPredecessor(
  scope: PracticeScope,
  occurrence: ResolvedPracticeOccurrence,
  occurrenceIndex: number,
  currentIndex: number,
): boolean {
  return scope.kind === "lesson"
    && scope.mode === "learn"
    && occurrenceIndex < currentIndex
    && occurrence.status === "completed";
}

export function practiceLogEntriesToDurableEvidence(
  entries: readonly PracticeLogEntry[],
): DurablePracticeEvidence[] {
  return entries.map((entry) => entry.kind === "attempt"
    ? {
        kind: "attempt",
        id: entry.id,
        turnId: entry.turnId,
        cardId: entry.cardId,
        submissionIndex: entry.submissionIndex,
        phase: entry.phase,
        supportLevelUsed: entry.supportLevelUsed,
        supportKindsUsed: [...entry.supportKindsUsed],
        receivedCorrection: entry.receivedCorrection,
      }
    : {
        kind: "signal",
        id: entry.id,
        turnId: entry.turnId,
        cardId: entry.cardId,
        supportLevelUsed: entry.supportLevelUsed,
        supportKindsUsed: [...entry.supportKindsUsed],
        reviewFailureRecorded: entry.reviewFailureRecorded,
      });
}

function toTurnCheckpoint(turn: PracticeTurn, submissionIndex: number): PracticeTurnCheckpoint {
  return {
    turnId: turn.id,
    phase: turn.phase,
    supportLevelUsed: turn.supportLevelUsed,
    supportKindsUsed: [...turn.supportKindsUsed],
    receivedCorrection: turn.receivedCorrection,
    reviewFailureRecorded: turn.reviewFailureRecorded,
    submissionIndex: safeInteger(submissionIndex, "submissionIndex"),
  };
}

function toPersistedStats(
  input: CreateWorkbenchPracticeSessionCheckpointInput,
  itinerary: ResolvedPracticeOccurrence[],
): PersistedSessionStats {
  const attempts = safeInteger(input.stats.attempts, "stats.attempts");
  const perfect = Math.min(safeInteger(input.stats.perfect, "stats.perfect"), attempts);
  const great = Math.min(safeInteger(input.stats.great, "stats.great"), attempts - perfect);
  const returnCounts = Object.fromEntries(Object.entries(input.returnCounts).map(([cardId, count]) => [
    cardId,
    cappedReturnCount(count, `returnCounts.${cardId}`),
  ]));
  const stats: PersistedSessionStats = {
    completedCount: attempts,
    perfectCount: perfect,
    closeCount: great,
    retryCount: attempts - perfect - great,
    skippedCount: safeInteger(input.stats.skipped, "stats.skipped"),
    score: nonNegative(input.stats.score, "stats.score"),
    combo: safeInteger(input.stats.combo, "stats.combo"),
    bestCombo: safeInteger(input.stats.maxCombo, "stats.maxCombo"),
    audioPlays: safeInteger(input.stats.audioPlays, "stats.audioPlays"),
    revealed: safeInteger(input.stats.revealed, "stats.revealed"),
    accuracyTotal: nonNegative(input.stats.accuracyTotal, "stats.accuracyTotal"),
    returnCounts,
    pendingReturns: [],
  };
  stats.pendingReturns = reconstructPendingReturns(
    safeInteger(input.pendingReturnCount, "pendingReturnCount"),
    itinerary,
    input.currentIndex,
    input.scope,
    stats,
  );
  return stats;
}

function fromPersistedStats(stats: PersistedSessionStats): WorkbenchCheckpointStats {
  return {
    score: stats.score,
    combo: stats.combo,
    maxCombo: stats.bestCombo,
    attempts: stats.completedCount,
    perfect: stats.perfectCount,
    great: stats.closeCount,
    audioPlays: stats.audioPlays,
    revealed: stats.revealed,
    skipped: stats.skippedCount,
    accuracyTotal: stats.accuracyTotal,
  };
}

/**
 * PracticeWorkbench currently retains pending returns as an aggregate count.
 * Reconstruct them deterministically from the most recent base occurrences;
 * if the two-return/card cap cannot represent the count, fail loudly instead
 * of silently dropping learner work.
 */
function reconstructPendingReturns(
  pendingReturnCount: number,
  itinerary: ResolvedPracticeOccurrence[],
  currentIndex: number,
  scope: PracticeScope,
  stats: PersistedSessionStats,
) {
  if (pendingReturnCount === 0) return [];
  const candidates = itinerary
    .slice(0, currentIndex + 1)
    .filter((occurrence) => occurrence.returnIndex === 0)
    .reverse();
  const nextReturnIndexByCard = new Map<string, number>();
  for (const occurrence of itinerary) {
    nextReturnIndexByCard.set(
      occurrence.cardId,
      Math.max(nextReturnIndexByCard.get(occurrence.cardId) ?? 0, occurrence.returnIndex),
    );
  }
  for (const [cardId, count] of Object.entries(stats.returnCounts)) {
    nextReturnIndexByCard.set(cardId, Math.max(nextReturnIndexByCard.get(cardId) ?? 0, count));
  }

  const pending: PersistedSessionStats["pendingReturns"] = [];
  let candidateCursor = 0;
  for (let index = 0; index < pendingReturnCount; index += 1) {
    let source: ResolvedPracticeOccurrence | undefined;
    for (let checked = 0; checked < candidates.length; checked += 1) {
      const candidate = candidates[(candidateCursor + checked) % candidates.length];
      if ((nextReturnIndexByCard.get(candidate.cardId) ?? 0) < 2) {
        source = candidate;
        candidateCursor = (candidateCursor + checked + 1) % candidates.length;
        break;
      }
    }
    if (!source) {
      throw new Error(
        `pendingReturnCount ${pendingReturnCount} cannot be represented within the two-return-per-card cap.`,
      );
    }

    const returnIndex = (nextReturnIndexByCard.get(source.cardId) ?? 0) + 1;
    nextReturnIndexByCard.set(source.cardId, returnIndex);
    stats.returnCounts[source.cardId] = returnIndex;
    pending.push({
      occurrence: createResolvedPracticeOccurrence({
        scope,
        cardId: source.cardId,
        originalIndex: source.originalIndex,
        returnIndex,
        phase: "independent-recall",
        courseId: source.courseId,
        unitId: source.unitId,
        lessonId: source.lessonId,
      }),
      eligibleAfterCompletedCount: stats.completedCount + 2 + index,
    });
  }
  return pending;
}

function defaultPhase(scope: PracticeScope) {
  if (scope.kind === "review") return "review-recall" as const;
  if (scope.kind === "focused" || scope.kind === "course" || scope.kind === "vocabulary" || (scope.kind === "lesson" && scope.mode === "replay")) {
    return "voluntary-practice" as const;
  }
  return "guided-recall" as const;
}

function occurrenceContextKey(item: PracticeSessionItem): string {
  const context = item.occurrenceContext;
  return JSON.stringify([
    item.card.id,
    context?.courseId ?? null,
    context?.unitId ?? null,
    context?.lessonId ?? null,
  ]);
}

function occurrenceKey(occurrence: ResolvedPracticeOccurrence): string {
  return JSON.stringify([
    occurrence.cardId,
    occurrence.courseId ?? null,
    occurrence.unitId ?? null,
    occurrence.lessonId ?? null,
  ]);
}

function clampSelection(value: number, draftLength: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), draftLength));
}

function safeInteger(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${path} must be a non-negative safe integer.`);
  return value;
}

function cappedReturnCount(value: number, path: string): number {
  const count = safeInteger(value, path);
  if (count > 2) throw new Error(`${path} exceeds the in-round return cap.`);
  return count;
}

function nonNegative(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${path} must be a finite non-negative number.`);
  return value;
}
