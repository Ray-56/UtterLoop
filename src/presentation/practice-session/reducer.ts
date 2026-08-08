import type {
  PracticePhase,
  RecallSupportKind,
  RecallSupportLevel,
} from "../../domain/practice/PracticeTurn";
import {
  EMPTY_SESSION_STATS,
  type PracticeCommandKind,
  type PracticeSessionCheckpoint,
  type PracticeSessionScope,
  type PracticeSessionState,
  type PracticeTurnCheckpoint,
  type ResolvedPracticeOccurrence,
} from "./model";
import { createReturnOccurrence } from "./occurrence";
import { practiceScopeKey } from "./practiceScopeKey";

const MINIMUM_SUPPORT_LEVEL: Record<RecallSupportKind, RecallSupportLevel> = {
  pattern: 1,
  keywords: 2,
  frame: 3,
  pronunciation: 3,
  audio: 3,
  grammar: 1,
  "copy-target": 4,
  answer: 4,
  correction: 0,
};

export interface CreatePracticeSessionStateInput {
  scope: PracticeSessionScope;
  catalogFingerprint: string;
  itinerary: ResolvedPracticeOccurrence[];
  updatedAt: string;
}

export type PracticeSessionEvent =
  | { type: "draft-changed"; draft: string; selectionStart: number; selectionEnd: number; at?: string }
  | { type: "navigate"; occurrenceId: string; at?: string }
  | { type: "support-used"; kind: RecallSupportKind; level: RecallSupportLevel; at?: string }
  | { type: "phase-changed"; phase: PracticePhase; at?: string }
  | { type: "correction-received"; at?: string }
  | { type: "review-failure-recorded"; at?: string }
  | { type: "queue-independent-return"; at?: string }
  | { type: "append-occurrence"; occurrence: ResolvedPracticeOccurrence; at?: string }
  | { type: "complete-occurrence"; outcome: "perfect" | "close" | "retry"; scoreDelta?: number; at?: string }
  | { type: "skip-occurrence"; at?: string }
  | { type: "tick"; elapsedSeconds: number; itemElapsedSeconds?: number; at?: string }
  | { type: "command-started"; commandKind: PracticeCommandKind; commandId?: string; at?: string }
  | { type: "command-succeeded"; evidenceId?: string; at?: string }
  | { type: "command-failed"; message: string; at?: string }
  | { type: "command-retry"; at?: string };

export function createPracticeSessionState(input: CreatePracticeSessionStateInput): PracticeSessionState {
  if (input.itinerary.length === 0) throw new Error("A resumable Practice session needs at least one occurrence.");
  assertUniqueOccurrenceIds(input.itinerary);
  const current = input.itinerary[0];
  return {
    id: "active",
    schemaVersion: 1,
    scope: structuredClone(input.scope),
    scopeKey: practiceScopeKey(input.scope),
    catalogFingerprint: input.catalogFingerprint,
    itinerary: structuredClone(input.itinerary),
    currentOccurrenceId: current.id,
    draft: "",
    selectionStart: 0,
    selectionEnd: 0,
    turn: structuredClone(current.turn),
    elapsedSeconds: 0,
    itemElapsedSeconds: 0,
    stats: structuredClone(EMPTY_SESSION_STATS),
    updatedAt: input.updatedAt,
    commandRecovery: { status: "idle" },
  };
}

export function reducePracticeSession(
  state: PracticeSessionState,
  event: PracticeSessionEvent,
): PracticeSessionState {
  switch (event.type) {
    case "draft-changed": {
      const selectionStart = clampCaret(event.selectionStart, event.draft.length);
      const selectionEnd = clampCaret(event.selectionEnd, event.draft.length);
      return touched({
        ...state,
        draft: event.draft,
        selectionStart: Math.min(selectionStart, selectionEnd),
        selectionEnd: Math.max(selectionStart, selectionEnd),
      }, event.at);
    }
    case "navigate": {
      const occurrence = state.itinerary.find((candidate) => candidate.id === event.occurrenceId);
      if (!occurrence || occurrence.status === "skipped") return state;
      return touched({
        ...state,
        currentOccurrenceId: occurrence.id,
        turn: structuredClone(occurrence.turn),
        draft: "",
        selectionStart: 0,
        selectionEnd: 0,
        itemElapsedSeconds: 0,
        commandRecovery: { status: "idle" },
      }, event.at);
    }
    case "support-used": {
      const supportLevelUsed = Math.max(
        state.turn.supportLevelUsed,
        event.level,
        MINIMUM_SUPPORT_LEVEL[event.kind],
      ) as RecallSupportLevel;
      const targetBearing = supportLevelUsed > 0;
      const phase = targetBearing
        && state.turn.phase !== "first-exposure"
        && state.turn.phase !== "voluntary-practice"
        ? "guided-recall"
        : state.turn.phase;
      return withTurn(state, {
        ...state.turn,
        phase,
        supportLevelUsed,
        supportKindsUsed: unique([...state.turn.supportKindsUsed, event.kind]),
      }, event.at);
    }
    case "phase-changed":
      return withTurn(state, { ...state.turn, phase: event.phase }, event.at);
    case "correction-received":
      return withTurn(state, {
        ...state.turn,
        phase: "corrective-practice",
        receivedCorrection: true,
        supportKindsUsed: unique([...state.turn.supportKindsUsed, "correction"]),
      }, event.at);
    case "review-failure-recorded":
      return withTurn(state, { ...state.turn, reviewFailureRecorded: true }, event.at);
    case "queue-independent-return":
      return queueIndependentReturn(state, event.at);
    case "append-occurrence": {
      if (state.itinerary.some((occurrence) => occurrence.id === event.occurrence.id)) return state;
      const appended = { ...state, itinerary: [...state.itinerary, structuredClone(event.occurrence)] };
      return touched(promotePendingReturns(appended), event.at);
    }
    case "complete-occurrence":
      return completeCurrent(state, event.outcome, event.scoreDelta, event.at);
    case "skip-occurrence":
      return skipCurrent(state, event.at);
    case "tick":
      return touched({
        ...state,
        elapsedSeconds: nonNegative(event.elapsedSeconds),
        itemElapsedSeconds: nonNegative(event.itemElapsedSeconds ?? state.itemElapsedSeconds),
      }, event.at);
    case "command-started": {
      const commandId = event.commandId ?? deterministicCommandId(state.turn, event.commandKind);
      return touched({
        ...state,
        commandRecovery: { status: "pending", commandKind: event.commandKind, commandId },
      }, event.at);
    }
    case "command-succeeded": {
      if (state.commandRecovery.status !== "pending") return state;
      const isSubmission = state.commandRecovery.commandKind === "submit";
      const next = isSubmission
        ? withTurn(state, { ...state.turn, submissionIndex: state.turn.submissionIndex + 1 }, event.at)
        : state;
      return touched({
        ...next,
        commandRecovery: event.evidenceId
          ? {
              status: "recovered",
              commandKind: state.commandRecovery.commandKind,
              commandId: state.commandRecovery.commandId,
              evidenceId: event.evidenceId,
            }
          : { status: "idle" },
      }, event.at);
    }
    case "command-failed": {
      if (state.commandRecovery.status !== "pending") return state;
      return touched({
        ...state,
        commandRecovery: {
          status: "recoverable-error",
          commandKind: state.commandRecovery.commandKind,
          commandId: state.commandRecovery.commandId,
          message: event.message,
        },
      }, event.at);
    }
    case "command-retry": {
      if (state.commandRecovery.status !== "recoverable-error") return state;
      return touched({
        ...state,
        commandRecovery: {
          status: "pending",
          commandKind: state.commandRecovery.commandKind,
          commandId: state.commandRecovery.commandId,
        },
      }, event.at);
    }
  }
}

export function toPracticeSessionCheckpoint(state: PracticeSessionState): PracticeSessionCheckpoint {
  const { commandRecovery: _commandRecovery, ...checkpoint } = state;
  return structuredClone(checkpoint);
}

function queueIndependentReturn(state: PracticeSessionState, at?: string): PracticeSessionState {
  const source = currentOccurrence(state);
  const priorReturnCount = state.stats.returnCounts[source.cardId] ?? 0;
  if (priorReturnCount >= 2) return state;

  const returnIndex = priorReturnCount + 1;
  const occurrence = createReturnOccurrence(state.scope, source, returnIndex);
  const remaining = state.itinerary.filter((candidate) => candidate.status === "ready" && candidate.id !== source.id);
  const stats = {
    ...state.stats,
    returnCounts: { ...state.stats.returnCounts, [source.cardId]: returnIndex },
  };

  if (remaining.length >= 2) {
    const secondInterveningIndex = state.itinerary.findIndex((candidate) => candidate.id === remaining[1].id);
    const itinerary = [...state.itinerary];
    itinerary.splice(secondInterveningIndex + 1, 0, occurrence);
    return touched({ ...state, itinerary, stats }, at);
  }

  return touched({
    ...state,
    stats: {
      ...stats,
      pendingReturns: [...stats.pendingReturns, {
        occurrence,
        // The current instructional occurrence has not been marked complete yet;
        // add it plus the two required intervening turns.
        eligibleAfterCompletedCount: stats.completedCount + 3,
      }],
    },
  }, at);
}

function completeCurrent(
  state: PracticeSessionState,
  outcome: "perfect" | "close" | "retry",
  scoreDelta = outcome === "perfect" ? 100 : 0,
  at?: string,
): PracticeSessionState {
  if (currentOccurrence(state).status !== "ready") return state;
  const combo = outcome === "perfect" ? state.stats.combo + 1 : 0;
  const itinerary = updateOccurrence(state.itinerary, state.currentOccurrenceId, (occurrence) => ({
    ...occurrence,
    status: "completed",
    turn: structuredClone(state.turn),
  }));
  let next: PracticeSessionState = {
    ...state,
    itinerary,
    stats: {
      ...state.stats,
      completedCount: state.stats.completedCount + 1,
      perfectCount: state.stats.perfectCount + (outcome === "perfect" ? 1 : 0),
      closeCount: state.stats.closeCount + (outcome === "close" ? 1 : 0),
      retryCount: state.stats.retryCount + (outcome === "retry" ? 1 : 0),
      score: Math.max(0, state.stats.score + scoreDelta),
      combo,
      bestCombo: Math.max(state.stats.bestCombo, combo),
    },
    commandRecovery: { status: "idle" },
  };
  next = promotePendingReturns(next);
  return touched(moveToNextReady(next), at);
}

function skipCurrent(state: PracticeSessionState, at?: string): PracticeSessionState {
  if (currentOccurrence(state).status !== "ready") return state;
  const itinerary = updateOccurrence(state.itinerary, state.currentOccurrenceId, (occurrence) => ({
    ...occurrence,
    status: "skipped",
    turn: structuredClone(state.turn),
  }));
  let next: PracticeSessionState = {
    ...state,
    itinerary,
    stats: {
      ...state.stats,
      completedCount: state.stats.completedCount + 1,
      skippedCount: state.stats.skippedCount + 1,
      combo: 0,
    },
    commandRecovery: { status: "idle" },
  };
  next = promotePendingReturns(next);
  return touched(moveToNextReady(next), at);
}

function promotePendingReturns(state: PracticeSessionState): PracticeSessionState {
  const ready = state.stats.pendingReturns.filter((pending) => pending.eligibleAfterCompletedCount <= state.stats.completedCount);
  if (ready.length === 0) return state;
  const existing = new Set(state.itinerary.map((occurrence) => occurrence.id));
  return {
    ...state,
    itinerary: [
      ...state.itinerary,
      ...ready.map((pending) => pending.occurrence).filter((occurrence) => !existing.has(occurrence.id)),
    ],
    stats: {
      ...state.stats,
      pendingReturns: state.stats.pendingReturns.filter((pending) => pending.eligibleAfterCompletedCount > state.stats.completedCount),
    },
  };
}

function moveToNextReady(state: PracticeSessionState): PracticeSessionState {
  const currentIndex = state.itinerary.findIndex((occurrence) => occurrence.id === state.currentOccurrenceId);
  const next = state.itinerary.slice(currentIndex + 1).find((occurrence) => occurrence.status === "ready")
    ?? state.itinerary.find((occurrence) => occurrence.status === "ready");
  if (!next) return { ...state, draft: "", selectionStart: 0, selectionEnd: 0, itemElapsedSeconds: 0 };
  return {
    ...state,
    currentOccurrenceId: next.id,
    turn: structuredClone(next.turn),
    draft: "",
    selectionStart: 0,
    selectionEnd: 0,
    itemElapsedSeconds: 0,
  };
}

function withTurn(state: PracticeSessionState, turn: PracticeTurnCheckpoint, at?: string): PracticeSessionState {
  const itinerary = updateOccurrence(state.itinerary, state.currentOccurrenceId, (occurrence) => ({
    ...occurrence,
    turn: structuredClone(turn),
  }));
  return touched({ ...state, turn, itinerary }, at);
}

function currentOccurrence(state: PracticeSessionState): ResolvedPracticeOccurrence {
  const occurrence = state.itinerary.find((candidate) => candidate.id === state.currentOccurrenceId);
  if (!occurrence) throw new Error(`Current Practice occurrence is missing: ${state.currentOccurrenceId}`);
  return occurrence;
}

function updateOccurrence(
  itinerary: ResolvedPracticeOccurrence[],
  id: string,
  update: (occurrence: ResolvedPracticeOccurrence) => ResolvedPracticeOccurrence,
): ResolvedPracticeOccurrence[] {
  return itinerary.map((occurrence) => occurrence.id === id ? update(occurrence) : occurrence);
}

function deterministicCommandId(turn: PracticeTurnCheckpoint, kind: PracticeCommandKind): string {
  return kind === "submit"
    ? `turn-attempt:${turn.turnId}:${turn.submissionIndex}`
    : `turn-command:${turn.turnId}:${kind}`;
}

function touched<T extends PracticeSessionState>(state: T, at?: string): T {
  return at ? { ...state, updatedAt: at } : state;
}

function clampCaret(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), length);
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertUniqueOccurrenceIds(itinerary: ResolvedPracticeOccurrence[]): void {
  const ids = new Set<string>();
  for (const occurrence of itinerary) {
    if (ids.has(occurrence.id)) throw new Error(`Duplicate Practice occurrence ID: ${occurrence.id}`);
    ids.add(occurrence.id);
  }
}
