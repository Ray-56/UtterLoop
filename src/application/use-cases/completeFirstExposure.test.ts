import { describe, expect, it } from "vitest";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import { completeSentenceFirstExposure } from "./completeFirstExposure";

describe("completeSentenceFirstExposure", () => {
  it("persists introduction without creating an Attempt or Review transition", async () => {
    let saved: SentenceLearningState | undefined;
    const repository = {
      getSentenceCard: async (cardId: string) => cardId === "card-1" ? { id: cardId } : undefined,
      getSentenceLearningState: async () => undefined,
      saveSentenceLearningState: async (state: SentenceLearningState) => { saved = state; },
    };

    const result = await completeSentenceFirstExposure(
      repository,
      "card-1",
      new Date("2026-07-31T12:00:00.000Z"),
    );

    expect(result).toEqual({
      cardId: "card-1",
      introducedAt: "2026-07-31T12:00:00.000Z",
      acquisitionStatus: "needs-guided",
    });
    expect(saved).toEqual(result);
  });
});
