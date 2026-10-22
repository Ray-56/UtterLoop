import { describe, expect, it } from "vitest";
import { resolvePracticeTurnForScope } from "./resolvePracticeTurnForScope";

describe("resolvePracticeTurnForScope", () => {
  it("moves a Return first exposure into guided recall once introduction is saved", () => {
    const turn = resolvePracticeTurnForScope({
      id: "turn-return", scope: { kind: "return", minutes: 8 },
      card: { id: "new", english: "A target sentence.", prompt: "一个提示。", source: "Test", tags: [], acceptableAnswers: [], createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z" },
      learningState: { cardId: "new", introducedAt: "2026-10-22T00:00:00.000Z", acquisitionStatus: "needs-guided" },
      initialPhase: "first-exposure",
    });
    expect(turn.phase).toBe("guided-recall");
  });
  it("starts Focused Practice as voluntary practice", () => {
    const turn = resolvePracticeTurnForScope({
      id: "turn-focused",
      scope: { kind: "focused", cardId: "card-1" },
      card: {
        id: "card-1",
        english: "A target sentence.",
        prompt: "一个提示。",
        source: "Test",
        tags: [],
        acceptableAnswers: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      learningState: {
        cardId: "card-1",
        introducedAt: "2026-07-01T00:00:00.000Z",
        firstPassedAt: "2026-07-02T00:00:00.000Z",
        firstPassSource: "independent-recall",
      },
    });

    expect(turn).toMatchObject({
      id: "turn-focused",
      cardId: "card-1",
      phase: "voluntary-practice",
    });
  });
});
