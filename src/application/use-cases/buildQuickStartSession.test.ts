import { describe, expect, it } from "vitest";
import { originalCourseCards, originalCourses } from "../seed/originalCourses";
import { buildQuickStartSession } from "./buildQuickStartSession";

describe("buildQuickStartSession", () => {
  it("uses the first three real Starter cards in the approved instructional itinerary", () => {
    const session = buildQuickStartSession({
      courses: originalCourses,
      cards: originalCourseCards,
    });

    expect(session.scope).toEqual({
      kind: "lesson",
      courseId: "starter-foundations",
      lessonId: "sf-u1-l1",
      mode: "learn",
    });
    expect(session.cardIds).toEqual(["sf-001", "sf-002", "sf-003"]);
    expect(session.itinerary.map((step) => [step.id, step.kind, step.cardId])).toEqual([
      ["expose-card-1", "first-exposure", "sf-001"],
      ["copy-card-1", "recall", "sf-001"],
      ["expose-card-2", "first-exposure", "sf-002"],
      ["guide-card-2", "recall", "sf-002"],
      ["expose-card-3", "first-exposure", "sf-003"],
      ["guide-card-3", "recall", "sf-003"],
      ["return-card-1", "recall", "sf-001"],
      ["return-card-2", "recall", "sf-002"],
      ["return-card-3", "recall", "sf-003"],
      ["explain-review", "explanation", null],
    ]);
  });

  it("keeps every Guided Recall blank until the learner explicitly asks for support", () => {
    const session = buildQuickStartSession({
      courses: originalCourses,
      cards: originalCourseCards,
    });
    const exposures = session.itinerary.filter((step) => step.kind === "first-exposure");
    const recalls = session.itinerary.filter((step) => step.kind === "recall");

    expect(exposures.map((step) => [
      step.cardId,
      step.exposureStyle,
      step.createsAttempt,
      step.guideStep,
    ])).toEqual([
      ["sf-001", "full", false, 1],
      ["sf-002", "abbreviated", false, 3],
      ["sf-003", "abbreviated", false, 4],
    ]);
    expect(recalls.map((step) => ({
      cardId: step.cardId,
      purpose: step.purpose,
      phase: step.phase,
      supportLevel: step.initialSupportLevel,
      supportKinds: step.initialSupportKinds,
      targetVisible: step.targetVisible,
      answerWasRevealed: step.answerWasRevealed,
      firstPassEligible: step.firstPassEligible,
      guideStep: step.guideStep,
    }))).toEqual([
      {
        cardId: "sf-001",
        purpose: "guided",
        phase: "guided-recall",
        supportLevel: 0,
        supportKinds: [],
        targetVisible: false,
        answerWasRevealed: false,
        firstPassEligible: false,
        guideStep: 2,
      },
      {
        cardId: "sf-002",
        purpose: "guided",
        phase: "guided-recall",
        supportLevel: 0,
        supportKinds: [],
        targetVisible: false,
        answerWasRevealed: false,
        firstPassEligible: false,
        guideStep: 3,
      },
      {
        cardId: "sf-003",
        purpose: "guided",
        phase: "guided-recall",
        supportLevel: 0,
        supportKinds: [],
        targetVisible: false,
        answerWasRevealed: false,
        firstPassEligible: false,
        guideStep: 4,
      },
      ...["sf-001", "sf-002", "sf-003"].map((cardId) => ({
        cardId,
        purpose: "independent-return",
        phase: "independent-recall",
        supportLevel: 0,
        supportKinds: [],
        targetVisible: false,
        answerWasRevealed: false,
        firstPassEligible: true,
        guideStep: 5,
      })),
    ]);
  });

  it("spaces each level-zero return behind two other recall turns", () => {
    const session = buildQuickStartSession({
      courses: originalCourses,
      cards: originalCourseCards,
    });
    const recalls = session.itinerary.filter((step) => step.kind === "recall");

    expect(recalls.map((step) => step.cardId)).toEqual([
      "sf-001",
      "sf-002",
      "sf-003",
      "sf-001",
      "sf-002",
      "sf-003",
    ]);
    expect(recalls.slice(3).map((step) => step.minimumInterveningRecallTurns)).toEqual([2, 2, 2]);
  });

  it("ends by explaining spaced Review and that support remains available", () => {
    const session = buildQuickStartSession({
      courses: originalCourses,
      cards: originalCourseCards,
    });
    const explanation = session.itinerary.at(-1);

    expect(explanation).toEqual({
      id: "explain-review",
      kind: "explanation",
      cardId: null,
      guideStep: 6,
      topics: ["spaced-review", "support-available"],
      completesQuickStart: true,
    });
  });
});
