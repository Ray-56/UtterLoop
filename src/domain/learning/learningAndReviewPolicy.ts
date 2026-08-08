import type { AnswerEvaluation } from "../practice/AnswerEvaluation";
import {
  enterCorrectivePractice,
  markReviewFailureRecorded,
  type PracticeSignalKind,
  type PracticeTurn,
} from "../practice/PracticeTurn";
import type { ReviewState } from "../review/ReviewState";
import {
  applyEvaluationToReviewState,
  applyAnswerReveal,
  keepInAcquisitionReview,
} from "../review/reviewScheduler";
import {
  hasFirstPass,
  markInstructionalCompletion,
  recordFirstPass,
  requireGuidedAcquisition,
  type SentenceLearningState,
} from "./SentenceLearningState";

export interface ApplyPracticeAttemptPolicyInput {
  learningState: SentenceLearningState | undefined;
  reviewState: ReviewState;
  turn: PracticeTurn;
  evaluation: AnswerEvaluation;
  submissionIndex: number;
  now: Date;
  hadEdits?: boolean;
}

export interface PracticeAttemptPolicyDecision {
  learningState: SentenceLearningState | undefined;
  reviewState: ReviewState;
  turn: PracticeTurn;
  firstPassCreated: boolean;
  shouldRequeue: boolean;
  scheduleChanged: boolean;
}

export interface ApplyPracticeSignalPolicyInput {
  learningState: SentenceLearningState | undefined;
  reviewState: ReviewState;
  turn: PracticeTurn;
  signalKind: PracticeSignalKind;
  now: Date;
}

export interface PracticeSignalPolicyDecision {
  learningState: SentenceLearningState | undefined;
  reviewState: ReviewState;
  turn: PracticeTurn;
  scheduleChanged: boolean;
  endsTurn: boolean;
}

export function applyPracticeSignalPolicy(
  input: ApplyPracticeSignalPolicyInput,
): PracticeSignalPolicyDecision {
  const endsTurn = input.signalKind === "skipped";
  if (
    input.turn.phase === "voluntary-practice"
    || input.turn.receivedCorrection
    || input.turn.reviewFailureRecorded
  ) {
    return {
      learningState: input.learningState,
      reviewState: input.reviewState,
      turn: input.turn,
      scheduleChanged: false,
      endsTurn,
    };
  }

  if (hasFirstPass(input.learningState)) {
    return {
      learningState: input.learningState,
      reviewState: applyAnswerReveal(input.reviewState, input.now),
      turn: markReviewFailureRecorded(input.turn),
      scheduleChanged: true,
      endsTurn,
    };
  }

  return {
    learningState: input.learningState
      ? requireGuidedAcquisition(input.learningState)
      : input.learningState,
    reviewState: keepInAcquisitionReview(input.reviewState, input.now),
    turn: input.turn,
    scheduleChanged: true,
    endsTurn,
  };
}

export function applyPracticeAttemptPolicy(
  input: ApplyPracticeAttemptPolicyInput,
): PracticeAttemptPolicyDecision {
  const alreadyPassed = hasFirstPass(input.learningState);
  if (input.turn.phase === "first-exposure") {
    throw new Error("First Exposure does not accept Attempts.");
  }

  if (input.turn.phase === "voluntary-practice") {
    return unchanged(input);
  }

  const firstIndependentPerfect =
    !alreadyPassed
    && input.submissionIndex === 0
    && input.turn.phase === "independent-recall"
    && input.turn.supportLevelUsed === 0
    && !input.turn.receivedCorrection
    && input.evaluation.outcome === "perfect";

  if (firstIndependentPerfect) {
    return {
      learningState: recordFirstPass(
        input.learningState,
        input.turn.cardId,
        "independent-recall",
        input.now.toISOString(),
      ),
      reviewState: applyEvaluationToReviewState(input.reviewState, input.evaluation, input.now, {
        answerWasRevealed: false,
        hadEdits: input.hadEdits ?? false,
      }),
      turn: input.turn,
      firstPassCreated: true,
      shouldRequeue: false,
      scheduleChanged: true,
    };
  }

  const isCorrectiveSubmission =
    input.submissionIndex > 0
    || input.turn.receivedCorrection
    || input.turn.phase === "corrective-practice";

  if (!alreadyPassed && input.evaluation.outcome === "perfect" && isCorrectiveSubmission) {
    return {
      learningState: input.learningState
        ? markInstructionalCompletion(input.learningState)
        : input.learningState,
      reviewState: input.reviewState,
      turn: input.turn,
      firstPassCreated: false,
      shouldRequeue: true,
      scheduleChanged: false,
    };
  }

  if (!alreadyPassed && input.evaluation.outcome === "perfect") {
    return {
      learningState: input.learningState
        ? markInstructionalCompletion(input.learningState)
        : input.learningState,
      reviewState: keepInAcquisitionReview(input.reviewState, input.now),
      turn: input.turn,
      firstPassCreated: false,
      shouldRequeue: true,
      scheduleChanged: true,
    };
  }

  if (!alreadyPassed) {
    return {
      learningState: input.learningState
        ? requireGuidedAcquisition(input.learningState)
        : input.learningState,
      reviewState: keepInAcquisitionReview(input.reviewState, input.now),
      turn: enterCorrectivePractice(input.turn),
      firstPassCreated: false,
      shouldRequeue: false,
      scheduleChanged: true,
    };
  }

  const isAssistedPassedSubmission =
    input.submissionIndex === 0
    && !input.turn.receivedCorrection
    && input.turn.supportLevelUsed > 0;

  if (isAssistedPassedSubmission) {
    const scheduleChanged = !input.turn.reviewFailureRecorded;
    const failedTurn = scheduleChanged
      ? markReviewFailureRecorded(input.turn)
      : input.turn;
    return {
      learningState: input.learningState,
      reviewState: scheduleChanged
        ? applyAnswerReveal(input.reviewState, input.now)
        : input.reviewState,
      turn: input.evaluation.outcome === "perfect"
        ? failedTurn
        : enterCorrectivePractice(failedTurn),
      firstPassCreated: false,
      shouldRequeue: false,
      scheduleChanged,
    };
  }

  const isIndependentPassedRecall =
    input.submissionIndex === 0
    && !input.turn.receivedCorrection
    && input.turn.supportLevelUsed === 0
    && (input.turn.phase === "independent-recall" || input.turn.phase === "review-recall");

  if (isIndependentPassedRecall) {
    return {
      learningState: input.learningState,
      reviewState: applyEvaluationToReviewState(input.reviewState, input.evaluation, input.now, {
        answerWasRevealed: false,
        hadEdits: input.hadEdits ?? false,
      }),
      turn: input.evaluation.outcome === "perfect"
        ? input.turn
        : enterCorrectivePractice(markReviewFailureRecorded(input.turn)),
      firstPassCreated: false,
      shouldRequeue: false,
      scheduleChanged: true,
    };
  }

  return {
    ...unchanged(input),
    turn: enterCorrectivePractice(input.turn),
  };
}

function unchanged(input: ApplyPracticeAttemptPolicyInput): PracticeAttemptPolicyDecision {
  return {
    learningState: input.learningState,
    reviewState: input.reviewState,
    turn: input.turn,
    firstPassCreated: false,
    shouldRequeue: false,
    scheduleChanged: false,
  };
}
