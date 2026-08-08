import type { SentenceCardId } from "../content/SentenceCard";

export type FirstPassSource = "independent-recall" | "explicit-mastery" | "legacy";
export type AcquisitionStatus = "needs-guided" | "ready-independent";

export interface SentenceLearningState {
  cardId: SentenceCardId;
  introducedAt?: string;
  acquisitionStatus?: AcquisitionStatus;
  firstPassedAt?: string;
  firstPassSource?: FirstPassSource;
}

export function completeFirstExposure(
  current: SentenceLearningState | undefined,
  cardId: SentenceCardId,
  at: string,
): SentenceLearningState {
  assertSameCard(current, cardId);
  if (current?.firstPassedAt) {
    return current;
  }

  return {
    ...current,
    cardId,
    introducedAt: current?.introducedAt ?? at,
    acquisitionStatus: current?.acquisitionStatus ?? "needs-guided",
  };
}

export function markInstructionalCompletion(
  current: SentenceLearningState,
): SentenceLearningState {
  assertValidSentenceLearningState(current);
  return current.firstPassedAt
    ? current
    : { ...current, acquisitionStatus: "ready-independent" };
}

export function requireGuidedAcquisition(
  current: SentenceLearningState,
): SentenceLearningState {
  assertValidSentenceLearningState(current);
  return current.firstPassedAt
    ? current
    : { ...current, acquisitionStatus: "needs-guided" };
}

export function recordFirstPass(
  current: SentenceLearningState | undefined,
  cardId: SentenceCardId,
  source: FirstPassSource,
  at: string,
): SentenceLearningState {
  assertSameCard(current, cardId);
  if (current?.firstPassedAt) {
    return current;
  }

  return {
    cardId,
    introducedAt: current?.introducedAt ?? at,
    firstPassedAt: at,
    firstPassSource: source,
  };
}

export function hasFirstPass(state: SentenceLearningState | undefined): boolean {
  return Boolean(state?.firstPassedAt);
}

export function assertValidSentenceLearningState(state: SentenceLearningState): void {
  const hasFirstPass = Boolean(state.firstPassedAt);
  if (hasFirstPass !== Boolean(state.firstPassSource)) {
    throw new Error(`SentenceLearningState ${state.cardId} must keep First Pass timestamp and source together.`);
  }
  if (hasFirstPass && state.acquisitionStatus) {
    throw new Error(`SentenceLearningState ${state.cardId} cannot retain AcquisitionStatus after First Pass.`);
  }
  if (!hasFirstPass && Boolean(state.introducedAt) !== Boolean(state.acquisitionStatus)) {
    throw new Error(`SentenceLearningState ${state.cardId} needs AcquisitionStatus exactly while acquiring.`);
  }
}

function assertSameCard(current: SentenceLearningState | undefined, cardId: SentenceCardId): void {
  if (current && current.cardId !== cardId) {
    throw new Error(`SentenceLearningState belongs to ${current.cardId}, not ${cardId}.`);
  }
}
