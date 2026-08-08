import type { SentenceCardId } from "../content/SentenceCard";
import type { EvaluationOutcome } from "./AnswerEvaluation";
import type { AttemptEvidence } from "./PracticeAttempt";
import {
  type PersistedPracticePhase,
  type PracticeSignalKind,
  type RecallSupportKind,
  type RecallSupportLevel,
} from "./PracticeTurn";
import type { PracticeLogContext } from "./PracticeSessionEvidence";

export type PracticeLogOutcome = EvaluationOutcome | "revealed" | "skipped";

export interface PersistedAttemptEvidence {
  answerWasRevealed: boolean;
  hadEdits: boolean;
  audioPlayCount: number;
  durationMs: number;
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: RecallSupportKind[];
  receivedCorrection: boolean;
}

export interface PracticeLogBase {
  id: string;
  turnId: string;
  cardId: SentenceCardId;
  phase: PersistedPracticePhase;
  submittedAt: string;
  context?: PracticeLogContext;
}

export interface PracticeAttemptLogEntry extends PracticeLogBase, PersistedAttemptEvidence {
  kind: "attempt";
  submissionIndex: number;
  answer: string;
  outcome: EvaluationOutcome;
  accuracy: number;
}

export interface PracticeSignalLogEntry extends PracticeLogBase, PersistedAttemptEvidence {
  kind: "signal";
  updatedAt: string;
  signalKinds: PracticeSignalKind[];
  reviewFailureRecorded: boolean;
  answer: "";
  accuracy: 0;
}

export type PracticeLogEntry = PracticeAttemptLogEntry | PracticeSignalLogEntry;

interface CreatePracticeAttemptLogEntryInput {
  turnId: string;
  cardId: SentenceCardId;
  phase: PersistedPracticePhase;
  submissionIndex: number;
  submittedAt: string;
  answer: string;
  outcome: EvaluationOutcome;
  accuracy: number;
  evidence: AttemptEvidence;
  context?: PracticeLogContext;
}

interface MergePracticeSignalLogEntryInput {
  turnId: string;
  cardId: SentenceCardId;
  phase: PersistedPracticePhase;
  at: string;
  signalKind: PracticeSignalKind;
  reviewFailureRecorded: boolean;
  evidence: AttemptEvidence;
  context?: PracticeLogContext;
}

export function createPracticeAttemptLogEntry(
  input: CreatePracticeAttemptLogEntryInput,
): PracticeAttemptLogEntry {
  return {
    kind: "attempt",
    id: `turn-attempt:${input.turnId}:${input.submissionIndex}`,
    turnId: input.turnId,
    cardId: input.cardId,
    phase: input.phase,
    submissionIndex: input.submissionIndex,
    submittedAt: input.submittedAt,
    answer: input.answer,
    outcome: input.outcome,
    accuracy: input.accuracy,
    ...(input.context ? { context: structuredClone(input.context) } : {}),
    ...normalizeAttemptEvidence(input.evidence),
  };
}

export function mergePracticeSignalLogEntry(
  current: PracticeSignalLogEntry | undefined,
  input: MergePracticeSignalLogEntryInput,
): PracticeSignalLogEntry {
  if (current && (current.turnId !== input.turnId || current.cardId !== input.cardId)) {
    throw new Error(`Practice signal ${current.id} does not belong to turn ${input.turnId}.`);
  }

  const incoming = normalizeAttemptEvidence(input.evidence);
  const supportKindsUsed = uniqueKinds([
    ...(current?.supportKindsUsed ?? []),
    ...incoming.supportKindsUsed,
  ]);
  const answerWasRevealed = supportKindsUsed.includes("answer");
  const context = mergePracticeLogContext(current?.context, input.context);

  return {
    kind: "signal",
    id: `turn-signal:${input.turnId}`,
    turnId: input.turnId,
    cardId: input.cardId,
    phase: input.phase,
    submittedAt: current?.submittedAt ?? input.at,
    updatedAt: input.at,
    signalKinds: uniqueSignals([...(current?.signalKinds ?? []), input.signalKind]),
    reviewFailureRecorded: Boolean(current?.reviewFailureRecorded || input.reviewFailureRecorded),
    answer: "",
    accuracy: 0,
    ...(context ? { context } : {}),
    answerWasRevealed,
    hadEdits: Boolean(current?.hadEdits || incoming.hadEdits),
    audioPlayCount: Math.max(current?.audioPlayCount ?? 0, incoming.audioPlayCount),
    durationMs: Math.max(current?.durationMs ?? 0, incoming.durationMs),
    supportLevelUsed: Math.max(
      current?.supportLevelUsed ?? 0,
      incoming.supportLevelUsed,
    ) as RecallSupportLevel,
    supportKindsUsed,
    receivedCorrection: Boolean(current?.receivedCorrection || incoming.receivedCorrection),
  };
}

function mergePracticeLogContext(
  current: PracticeLogContext | undefined,
  incoming: PracticeLogContext | undefined,
): PracticeLogContext | undefined {
  if (current && incoming && JSON.stringify(current) !== JSON.stringify(incoming)) {
    throw new Error("Practice signal context cannot change within one turn.");
  }
  const context = current ?? incoming;
  return context ? structuredClone(context) : undefined;
}

export function normalizeAttemptEvidence(evidence: AttemptEvidence): PersistedAttemptEvidence {
  const inferredKinds: RecallSupportKind[] = [
    ...(evidence.supportKindsUsed ?? []),
    ...(evidence.audioPlayCount > 0 ? ["audio" as const] : []),
    ...(evidence.answerWasRevealed ? ["answer" as const] : []),
  ];
  const supportKindsUsed = uniqueKinds(inferredKinds);
  const inferredLevel = supportKindsUsed.reduce<RecallSupportLevel>(
    (highest, kind) => Math.max(highest, supportLevelForKind(kind)) as RecallSupportLevel,
    0,
  );

  return {
    answerWasRevealed: supportKindsUsed.includes("answer"),
    hadEdits: evidence.hadEdits,
    audioPlayCount: evidence.audioPlayCount,
    durationMs: evidence.durationMs,
    supportLevelUsed: Math.max(evidence.supportLevelUsed ?? 0, inferredLevel) as RecallSupportLevel,
    supportKindsUsed,
    receivedCorrection: evidence.receivedCorrection ?? false,
  };
}

function supportLevelForKind(kind: RecallSupportKind): RecallSupportLevel {
  switch (kind) {
    case "pattern": return 1;
    case "keywords": return 2;
    case "frame":
    case "pronunciation":
    case "audio": return 3;
    case "grammar": return 1;
    case "copy-target":
    case "answer": return 4;
    case "correction": return 0;
  }
}

function uniqueKinds(kinds: RecallSupportKind[]): RecallSupportKind[] {
  return [...new Set(kinds)];
}

function uniqueSignals(kinds: PracticeSignalKind[]): PracticeSignalKind[] {
  return [...new Set(kinds)];
}
