import type { SentenceCardId } from "../../domain/content/SentenceCard";
import { applyPracticeSignalPolicy } from "../../domain/learning/learningAndReviewPolicy";
import { completeFirstExposure } from "../../domain/learning/SentenceLearningState";
import type { AttemptEvidence } from "../../domain/practice/PracticeAttempt";
import {
  mergePracticeSignalLogEntry,
  normalizeAttemptEvidence,
} from "../../domain/practice/PracticeLogEntry";
import { createPracticeTurn } from "../../domain/practice/PracticeTurn";
import { createInitialReviewState } from "../../domain/review/reviewScheduler";
import { createLocalId } from "../createLocalId";
import type { TrainingRepository } from "../ports/TrainingRepository";
import type { PracticeSignalContext } from "./revealPracticeAnswer";

export async function recordPracticeSupport(
  repository: TrainingRepository,
  cardId: SentenceCardId,
  evidence: AttemptEvidence,
  now: Date,
  context: PracticeSignalContext = {},
) {
  const card = await repository.getSentenceCard(cardId);
  if (!card) throw new Error(`SentenceCard not found: ${cardId}`);
  if (context.phase === "first-exposure") {
    throw new Error("Recall Support is not recorded during First Exposure.");
  }

  const normalized = normalizeAttemptEvidence(evidence);
  if (normalized.supportLevelUsed === 0) {
    throw new Error("Recall Support must include target-bearing evidence.");
  }

  const turnId = context.turnId ?? createLocalId("turn");
  const existing = await repository.getPracticeLogEntry(`turn-signal:${turnId}`);
  const currentSignal = existing?.kind === "signal" ? existing : undefined;
  const firstAttempt = await repository.getPracticeLogEntry(`turn-attempt:${turnId}:0`);
  let learningState = await repository.getSentenceLearningState(cardId);
  if (!learningState?.introducedAt) {
    learningState = completeFirstExposure(learningState, cardId, now.toISOString());
  }
  const currentReviewState = (await repository.getReviewState(cardId))
    ?? createInitialReviewState(cardId, now);
  const phase = context.phase === "voluntary-practice" ? context.phase : "guided-recall";
  const turn = {
    ...createPracticeTurn(
      turnId,
      cardId,
      phase,
      normalized.supportLevelUsed,
      normalized.supportKindsUsed,
    ),
    receivedCorrection:
      (context.receivedCorrection ?? normalized.receivedCorrection)
      || (firstAttempt?.kind === "attempt" && firstAttempt.outcome !== "perfect"),
    reviewFailureRecorded:
      Boolean(context.reviewFailureRecorded)
      || Boolean(currentSignal?.reviewFailureRecorded),
  };
  const decision = applyPracticeSignalPolicy({
    learningState,
    reviewState: currentReviewState,
    turn,
    signalKind: "support-used",
    now,
  });
  const logEntry = mergePracticeSignalLogEntry(currentSignal, {
    turnId,
    cardId,
    phase: decision.turn.phase,
    at: now.toISOString(),
    signalKind: "support-used",
    reviewFailureRecorded: decision.turn.reviewFailureRecorded,
    evidence: normalized,
    context: context.practiceLogContext,
  });
  await repository.savePracticeWrite({
    learningState: decision.learningState,
    reviewState: decision.reviewState,
    logEntry,
  });
  return decision.reviewState;
}
