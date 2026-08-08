import type { SentenceLearningState } from "../../../domain/learning/SentenceLearningState";
import type { PracticeLogEntry } from "../../../domain/practice/PracticeLogEntry";
import type { EvaluationOutcome } from "../../../domain/practice/AnswerEvaluation";

export interface LegacyPracticeLogRow {
  id: string;
  cardId: string;
  submittedAt: string;
  answer: string;
  outcome: EvaluationOutcome | "revealed" | "skipped";
  accuracy: number;
  answerWasRevealed?: boolean;
  hadEdits?: boolean;
  audioPlayCount?: number;
  durationMs?: number;
}

export interface LegacyReviewStateRow {
  cardId: string;
  stage: number;
  lastReviewedAt?: string;
  learningStatus?: "new" | "mastered";
}

interface MigrateLegacyV3DataInput {
  logs: LegacyPracticeLogRow[];
  reviewStates: LegacyReviewStateRow[];
  migrationAt: string;
}

export function migrateLegacyV3Data(input: MigrateLegacyV3DataInput): {
  logs: PracticeLogEntry[];
  learningStates: SentenceLearningState[];
} {
  const learningByCardId = new Map<string, SentenceLearningState>();
  const qualifyingPerfects = input.logs
    .filter((row) => row.outcome === "perfect" && !row.answerWasRevealed)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));

  for (const row of qualifyingPerfects) {
    if (!learningByCardId.has(row.cardId)) {
      learningByCardId.set(row.cardId, {
        cardId: row.cardId,
        introducedAt: row.submittedAt,
        firstPassedAt: row.submittedAt,
        firstPassSource: "legacy",
      });
    }
  }

  for (const reviewState of input.reviewStates) {
    if (learningByCardId.has(reviewState.cardId)) continue;
    if (reviewState.learningStatus === "mastered") {
      const at = reviewState.lastReviewedAt ?? input.migrationAt;
      learningByCardId.set(reviewState.cardId, {
        cardId: reviewState.cardId,
        introducedAt: at,
        firstPassedAt: at,
        firstPassSource: "explicit-mastery",
      });
    } else if (reviewState.stage >= 1) {
      const at = reviewState.lastReviewedAt ?? input.migrationAt;
      learningByCardId.set(reviewState.cardId, {
        cardId: reviewState.cardId,
        introducedAt: at,
        firstPassedAt: at,
        firstPassSource: "legacy",
      });
    }
  }

  return {
    learningStates: [...learningByCardId.values()],
    logs: input.logs.map(normalizeLegacyLog),
  };
}

function normalizeLegacyLog(row: LegacyPracticeLogRow): PracticeLogEntry {
  const turnId = `legacy:${row.id}`;
  const answerWasRevealed = Boolean(row.answerWasRevealed);
  const evidence = {
    answerWasRevealed,
    hadEdits: Boolean(row.hadEdits),
    audioPlayCount: row.audioPlayCount ?? 0,
    durationMs: row.durationMs ?? 0,
    supportLevelUsed: answerWasRevealed ? 4 as const : 0 as const,
    supportKindsUsed: answerWasRevealed ? ["answer" as const] : [],
    receivedCorrection: false,
  };

  if (row.outcome === "revealed" || row.outcome === "skipped") {
    return {
      kind: "signal",
      id: `turn-signal:${turnId}`,
      turnId,
      cardId: row.cardId,
      phase: "legacy",
      submittedAt: row.submittedAt,
      updatedAt: row.submittedAt,
      signalKinds: [row.outcome],
      reviewFailureRecorded: true,
      answer: "",
      accuracy: 0,
      ...evidence,
    };
  }

  return {
    kind: "attempt",
    id: `turn-attempt:${turnId}:0`,
    turnId,
    cardId: row.cardId,
    phase: "legacy",
    submittedAt: row.submittedAt,
    submissionIndex: 0,
    answer: row.answer,
    outcome: row.outcome,
    accuracy: row.accuracy,
    ...evidence,
  };
}
