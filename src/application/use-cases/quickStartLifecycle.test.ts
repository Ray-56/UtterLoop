import { describe, expect, it } from "vitest";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import {
  completeQuickStart,
  dismissQuickStart,
  resolveQuickStartEligibility,
} from "./quickStartLifecycle";

describe("Quick Start eligibility", () => {
  it("resumes an active Quick Start after First Exposure creates learning state", () => {
    expect(resolveQuickStartEligibility({
      activeEntryPoint: "quick-start-v1",
      learningStates: [introduced("sf-001")],
      preference: null,
    })).toEqual({ eligible: true, version: 1 });
  });

  it("offers the current version only before any card-level learning begins", () => {
    expect(resolveQuickStartEligibility({
      learningStates: [],
      preference: null,
    })).toEqual({ eligible: true, version: 1 });

    expect(resolveQuickStartEligibility({
      learningStates: [introduced("sf-001")],
      preference: null,
    })).toEqual({ eligible: false, reason: "learning-already-started" });
  });

  it.each(["completed", "dismissed"] as const)(
    "does not reopen after the current version is %s",
    (status) => {
      expect(resolveQuickStartEligibility({
        learningStates: [],
        preference: { version: 1, status },
      })).toEqual({ eligible: false, reason: "current-version-recorded" });
    },
  );

  it("offers a newer Quick Start version without depending on Course content revision", () => {
    expect(resolveQuickStartEligibility({
      learningStates: [],
      preference: { version: 0, status: "completed" },
    })).toEqual({ eligible: true, version: 1 });
  });
});

describe("Quick Start lifecycle", () => {
  it("dismisses into normal Guided Learn for the same first Lesson without a card-level command", () => {
    const result = dismissQuickStart();

    expect(result).toEqual({
      preference: { version: 1, status: "dismissed" },
      nextPracticeScope: {
        kind: "lesson",
        courseId: "starter-foundations",
        lessonId: "sf-u1-l1",
        mode: "learn",
      },
    });
    expect(Object.keys(result).sort()).toEqual(["nextPracticeScope", "preference"]);
  });

  it("records completion at the current version and continues the same real Lesson", () => {
    expect(completeQuickStart()).toEqual({
      preference: { version: 1, status: "completed" },
      nextPracticeScope: {
        kind: "lesson",
        courseId: "starter-foundations",
        lessonId: "sf-u1-l1",
        mode: "learn",
      },
    });
  });
});

function introduced(cardId: string): SentenceLearningState {
  return {
    cardId,
    introducedAt: "2026-07-31T08:00:00.000Z",
    acquisitionStatus: "needs-guided",
  };
}
