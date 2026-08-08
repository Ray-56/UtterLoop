import type { SentenceCardId } from "../content/SentenceCard";
import { hasFirstPass, type SentenceLearningState } from "../learning/SentenceLearningState";

export type RecallSupportLevel = 0 | 1 | 2 | 3 | 4;

export type RecallSupportKind =
  | "pattern"
  | "keywords"
  | "frame"
  | "pronunciation"
  | "audio"
  | "grammar"
  | "copy-target"
  | "answer"
  | "correction";

export type PracticePhase =
  | "first-exposure"
  | "guided-recall"
  | "independent-recall"
  | "corrective-practice"
  | "review-recall"
  | "voluntary-practice";

export type PersistedPracticePhase = PracticePhase | "legacy";
export type PracticeSignalKind = "support-used" | "revealed" | "skipped";

export interface PracticeTurn {
  id: string;
  cardId: SentenceCardId;
  phase: PracticePhase;
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: RecallSupportKind[];
  answerWasRevealed: boolean;
  receivedCorrection: boolean;
  reviewFailureRecorded: boolean;
}

const SUPPORT_LEVELS: Record<RecallSupportKind, RecallSupportLevel> = {
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

export function createPracticeTurn(
  id: string,
  cardId: SentenceCardId,
  phase: PracticePhase,
  initialSupportLevel: RecallSupportLevel = 0,
  initialSupportKinds: RecallSupportKind[] = [],
): PracticeTurn {
  return {
    id,
    cardId,
    phase,
    supportLevelUsed: initialSupportLevel,
    supportKindsUsed: uniqueKinds(initialSupportKinds),
    answerWasRevealed: initialSupportKinds.includes("answer"),
    receivedCorrection: phase === "corrective-practice",
    reviewFailureRecorded: false,
  };
}

export function applyRecallSupport(
  turn: PracticeTurn,
  kind: RecallSupportKind,
  explicitLevel: RecallSupportLevel = SUPPORT_LEVELS[kind],
): PracticeTurn {
  const supportLevelUsed = Math.max(turn.supportLevelUsed, explicitLevel) as RecallSupportLevel;
  const targetBearing = supportLevelUsed > 0;
  const phase = targetBearing && turn.phase !== "voluntary-practice" && turn.phase !== "first-exposure"
    ? "guided-recall"
    : turn.phase;

  return {
    ...turn,
    phase,
    supportLevelUsed,
    supportKindsUsed: uniqueKinds([...turn.supportKindsUsed, kind]),
    answerWasRevealed: turn.answerWasRevealed || kind === "answer",
  };
}

export function enterCorrectivePractice(turn: PracticeTurn): PracticeTurn {
  return {
    ...turn,
    phase: "corrective-practice",
    supportKindsUsed: uniqueKinds([...turn.supportKindsUsed, "correction"]),
    receivedCorrection: true,
  };
}

export function markReviewFailureRecorded(turn: PracticeTurn): PracticeTurn {
  return { ...turn, reviewFailureRecorded: true };
}

interface ResolveInitialPracticeTurnInput {
  id: string;
  cardId: SentenceCardId;
  learningState: SentenceLearningState | undefined;
  isReviewScope: boolean;
}

export function resolveInitialPracticeTurn(input: ResolveInitialPracticeTurnInput): PracticeTurn {
  if (!input.learningState?.introducedAt) {
    return createPracticeTurn(input.id, input.cardId, "first-exposure");
  }

  if (hasFirstPass(input.learningState)) {
    return createPracticeTurn(
      input.id,
      input.cardId,
      input.isReviewScope ? "review-recall" : "independent-recall",
    );
  }

  if (input.learningState.acquisitionStatus === "ready-independent") {
    return createPracticeTurn(input.id, input.cardId, "independent-recall");
  }

  return createPracticeTurn(input.id, input.cardId, "guided-recall");
}

interface PlanIndependentRequeueInput {
  remainingTurns: PracticeTurn[];
  cardId: SentenceCardId;
  newTurnId: string;
  priorReturnCount: number;
}

export interface IndependentRequeuePlan {
  turns: PracticeTurn[];
  inserted: boolean;
  pending: boolean;
}

export function planIndependentRequeue(input: PlanIndependentRequeueInput): IndependentRequeuePlan {
  if (input.priorReturnCount >= 2 || input.remainingTurns.length < 2) {
    return { turns: [...input.remainingTurns], inserted: false, pending: true };
  }

  const turns = [...input.remainingTurns];
  turns.splice(2, 0, createPracticeTurn(input.newTurnId, input.cardId, "independent-recall"));
  return { turns, inserted: true, pending: false };
}

function uniqueKinds(kinds: RecallSupportKind[]): RecallSupportKind[] {
  return [...new Set(kinds)];
}
