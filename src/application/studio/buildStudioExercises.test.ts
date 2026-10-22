import { describe, expect, it } from "vitest";
import { defaultCatalog } from "../seed/defaultCatalog";
import { emptyLearningStudio } from "../../domain/studio/LearningStudio";
import { SENTENCE_FAMILIES } from "../../domain/studio/studioCatalog";
import { buildStudioExercises, familyTestIsAvailable } from "./buildStudioExercises";

describe("Studio activity eligibility", () => {
  const document = emptyLearningStudio();
  const now = new Date("2026-10-22T04:00:00Z");
  const context = { cards: defaultCatalog.cards, learningStates: [], document, now };
  it("prevents direct entry into held-out family checks before acquisition", () => {
    expect(familyTestIsAvailable(document, "polite-request")).toBe(false);
    expect(() => buildStudioExercises({ activity: "family", groupId: "polite-request", stage: "held-out" }, context)).toThrow("training");
    const trained = { ...document, attempts: SENTENCE_FAMILIES[0].exercises.slice(0, 3).map((exercise, index) => ({
      id: `result-${index}`, sessionId: "training", activity: "family" as const, groupId: "polite-request",
      exerciseId: exercise.id, stage: "training" as const, outcome: "perfect" as const, accuracy: 1,
      submittedAt: now.toISOString(), durationMs: 1_000, answerWasRevealed: false, firstSubmission: true, firstEncounter: true,
    })) };
    expect(familyTestIsAvailable(trained, "polite-request")).toBe(true);
    expect(buildStudioExercises({ activity: "family", groupId: "polite-request", stage: "held-out" }, { ...context, document: trained })).toHaveLength(2);
  });
  it("keeps unlearned contextual recall empty and selects only acquired card cues", () => {
    const selection = { activity: "context", groupId: "all", stage: "held-out" } as const;
    expect(buildStudioExercises(selection, context)).toEqual([]);
    expect(buildStudioExercises(selection, { ...context, learningStates: [{ cardId: "sf-001", firstPassedAt: now.toISOString(), firstPassSource: "independent-recall" }] })).toHaveLength(1);
  });
  it("rejects unknown authored tasks and patterns instead of substituting unrelated practice", () => {
    expect(() => buildStudioExercises({ activity: "mission", groupId: "unknown", stage: "training" }, context)).toThrow("not found");
    expect(() => buildStudioExercises({ activity: "weakness", groupId: "unknown", stage: "training" }, context)).toThrow("Unknown");
  });
});
