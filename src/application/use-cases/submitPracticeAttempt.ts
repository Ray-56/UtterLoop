import { buildAttemptPreview } from "../../domain/practice/buildAttemptPreview";
import { evaluateAttempt } from "../../domain/practice/evaluateAttempt";
import type { AnswerEvaluation } from "../../domain/practice/AnswerEvaluation";
import type { PracticeAttempt } from "../../domain/practice/PracticeAttempt";
import {
  createPracticeAttemptLogEntry,
  normalizeAttemptEvidence,
  type PracticeAttemptLogEntry,
} from "../../domain/practice/PracticeLogEntry";
import {
  createPracticeTurn,
  enterCorrectivePractice,
  resolveInitialPracticeTurn,
  type PracticeTurn,
} from "../../domain/practice/PracticeTurn";
import type { ReviewState } from "../../domain/review/ReviewState";
import { createInitialReviewState } from "../../domain/review/reviewScheduler";
import {
  completeFirstExposure,
  type SentenceLearningState,
} from "../../domain/learning/SentenceLearningState";
import { applyPracticeAttemptPolicy } from "../../domain/learning/learningAndReviewPolicy";
import type { TrainingRepository } from "../ports/TrainingRepository";
import { createLocalId } from "../createLocalId";
import type { SentenceCard } from "../../domain/content/SentenceCard";

export interface SubmitPracticeAttemptResult {
  evaluation: AnswerEvaluation;
  reviewState: ReviewState;
  learningState: SentenceLearningState | undefined;
  turn: PracticeTurn;
  logEntry: PracticeAttemptLogEntry;
  shouldRequeue: boolean;
  firstPassCreated: boolean;
}

export async function submitPracticeAttempt(
  repository: TrainingRepository,
  attempt: PracticeAttempt,
  now: Date,
): Promise<SubmitPracticeAttemptResult> {
  const card = await repository.getSentenceCard(attempt.cardId);
  if (!card) throw new Error(`SentenceCard not found: ${attempt.cardId}`);
  if (!buildAttemptPreview(card, attempt.answer).isComplete) throw new Error("Attempt is incomplete.");

  const turnId = attempt.turnId ?? createLocalId("turn");
  const submissionIndex = attempt.submissionIndex ?? 0;
  const attemptId = `turn-attempt:${turnId}:${submissionIndex}`;
  const existingAttempt = await repository.getPracticeLogEntry(attemptId);
  if (existingAttempt?.kind === "attempt") {
    return persistedAttemptResult(repository, card, existingAttempt);
  }

  let learningState = await repository.getSentenceLearningState(card.id);
  let phase = attempt.phase;
  if (!phase) {
    if (!learningState?.introducedAt) {
      learningState = completeFirstExposure(learningState, card.id, now.toISOString());
      phase = "guided-recall";
    } else {
      phase = resolveInitialPracticeTurn({
        id: turnId,
        cardId: card.id,
        learningState,
        isReviewScope: false,
      }).phase;
    }
  }

  const normalizedEvidence = normalizeAttemptEvidence(attempt);
  if (
    normalizedEvidence.supportLevelUsed > 0
    && phase !== "voluntary-practice"
    && phase !== "corrective-practice"
  ) {
    phase = "guided-recall";
  }

  const signal = await repository.getPracticeLogEntry(`turn-signal:${turnId}`);
  const turn = {
    ...createPracticeTurn(
      turnId,
      card.id,
      phase,
      normalizedEvidence.supportLevelUsed,
      normalizedEvidence.supportKindsUsed,
    ),
    answerWasRevealed: normalizedEvidence.answerWasRevealed,
    receivedCorrection: normalizedEvidence.receivedCorrection,
    reviewFailureRecorded:
      Boolean(attempt.reviewFailureRecorded)
      || (signal?.kind === "signal" && signal.reviewFailureRecorded),
  };
  const evaluation = evaluateAttempt(card, attempt);
  const currentReviewState = (await repository.getReviewState(card.id))
    ?? createInitialReviewState(card.id, now);
  const decision = applyPracticeAttemptPolicy({
    learningState,
    reviewState: currentReviewState,
    turn,
    evaluation,
    submissionIndex,
    now,
    hadEdits: normalizedEvidence.hadEdits,
  });
  const logEntry = createPracticeAttemptLogEntry({
    turnId,
    cardId: card.id,
    // The log describes the submission that was evaluated. A non-perfect
    // retrieval transitions the returned turn into Corrective Practice only
    // after this row has been classified.
    phase: turn.phase,
    submissionIndex,
    submittedAt: attempt.submittedAt,
    answer: attempt.answer,
    outcome: evaluation.outcome,
    accuracy: evaluation.accuracy,
    evidence: normalizedEvidence,
    context: attempt.context,
  });
  const persisted = await repository.savePracticeWrite({
    learningState: decision.learningState,
    reviewState: decision.reviewState,
    logEntry,
  });

  if (!persisted.created && persisted.entry.kind === "attempt") {
    return persistedAttemptResult(repository, card, persisted.entry);
  }

  return {
    evaluation,
    reviewState: decision.reviewState,
    learningState: decision.learningState,
    turn: decision.turn,
    logEntry,
    shouldRequeue: decision.shouldRequeue,
    firstPassCreated: decision.firstPassCreated,
  };
}

async function persistedAttemptResult(
  repository: TrainingRepository,
  card: SentenceCard,
  entry: PracticeAttemptLogEntry,
): Promise<SubmitPracticeAttemptResult> {
  const evaluation = evaluateAttempt(card, {
    cardId: card.id,
    answer: entry.answer,
    submittedAt: entry.submittedAt,
    answerWasRevealed: entry.answerWasRevealed,
    hadEdits: entry.hadEdits,
    audioPlayCount: entry.audioPlayCount,
    durationMs: entry.durationMs,
    supportLevelUsed: entry.supportLevelUsed,
    supportKindsUsed: entry.supportKindsUsed,
    receivedCorrection: entry.receivedCorrection,
  });
  const reviewState = await repository.getReviewState(card.id);
  if (!reviewState) throw new Error(`ReviewState missing for persisted Attempt: ${entry.id}`);
  const learningState = await repository.getSentenceLearningState(card.id);
  const signal = await repository.getPracticeLogEntry(`turn-signal:${entry.turnId}`);
  const hadFirstPassAtSubmission = Boolean(
    learningState?.firstPassedAt
    && Date.parse(learningState.firstPassedAt) <= Date.parse(entry.submittedAt),
  );
  const shouldRequeue =
    entry.outcome === "perfect"
    && entry.phase !== "legacy"
    && entry.phase !== "voluntary-practice"
    && !learningState?.firstPassedAt;
  const firstPassCreated =
    entry.phase === "independent-recall"
    && entry.submissionIndex === 0
    && entry.outcome === "perfect"
    && entry.supportLevelUsed === 0
    && !entry.receivedCorrection
    && learningState?.firstPassSource === "independent-recall"
    && learningState.firstPassedAt === reviewState.lastReviewedAt;
  const submittedTurn = {
    ...createPracticeTurn(
      entry.turnId,
      entry.cardId,
      entry.phase === "legacy" ? "independent-recall" : entry.phase,
      entry.supportLevelUsed,
      entry.supportKindsUsed,
    ),
    answerWasRevealed: entry.answerWasRevealed,
    receivedCorrection: entry.receivedCorrection,
    reviewFailureRecorded:
      (signal?.kind === "signal" && signal.reviewFailureRecorded)
      || (hadFirstPassAtSubmission && entry.phase !== "voluntary-practice" && (
        entry.outcome !== "perfect" || entry.supportLevelUsed > 0
      )),
  };
  const turn = entry.outcome !== "perfect" && entry.phase !== "voluntary-practice"
    ? enterCorrectivePractice(submittedTurn)
    : submittedTurn;
  return {
    evaluation,
    reviewState,
    learningState,
    turn,
    logEntry: entry,
    shouldRequeue,
    firstPassCreated,
  };
}
