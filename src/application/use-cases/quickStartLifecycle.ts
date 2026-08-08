import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type { PracticeSessionEntryPoint } from "../../domain/practice/PracticeSessionEvidence";
import {
  QUICK_START_VERSION,
  quickStartLessonScope,
  type QuickStartSession,
} from "./buildQuickStartSession";

export type QuickStartStatus = "completed" | "dismissed";

export interface StoredQuickStartPreference {
  version: number;
  status: QuickStartStatus;
}

export interface CurrentQuickStartPreference extends StoredQuickStartPreference {
  version: typeof QUICK_START_VERSION;
}

export interface QuickStartLifecycleResult {
  preference: CurrentQuickStartPreference;
  nextPracticeScope: QuickStartSession["scope"];
}

export interface ResolveQuickStartEligibilityInput {
  activeEntryPoint?: PracticeSessionEntryPoint | null;
  learningStates: readonly SentenceLearningState[];
  preference: StoredQuickStartPreference | null;
}

export type QuickStartEligibility =
  | { eligible: true; version: typeof QUICK_START_VERSION }
  | { eligible: false; reason: "learning-already-started" | "current-version-recorded" };

export function resolveQuickStartEligibility(
  input: ResolveQuickStartEligibilityInput,
): QuickStartEligibility {
  if (input.preference?.version === QUICK_START_VERSION) {
    return { eligible: false, reason: "current-version-recorded" };
  }
  if (input.activeEntryPoint === "quick-start-v1") {
    return { eligible: true, version: QUICK_START_VERSION };
  }
  if (input.learningStates.length > 0) {
    return { eligible: false, reason: "learning-already-started" };
  }

  return { eligible: true, version: QUICK_START_VERSION };
}

export function completeQuickStart(): QuickStartLifecycleResult {
  return finishQuickStart("completed");
}

export function dismissQuickStart(): QuickStartLifecycleResult {
  return finishQuickStart("dismissed");
}

function finishQuickStart(status: QuickStartStatus): QuickStartLifecycleResult {
  return {
    preference: { version: QUICK_START_VERSION, status },
    nextPracticeScope: quickStartLessonScope(),
  };
}
