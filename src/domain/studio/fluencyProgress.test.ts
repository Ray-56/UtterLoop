import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import type { FluencyResult } from "./LearningStudio";
import { deriveFluencyProgress } from "./fluencyProgress";

const card = (id: string, english = "Can you send it?"): SentenceCard => ({
  id, english, prompt: "礼貌地提出一个请求。", source: "Test", tags: [], acceptableAnswers: [],
  createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z",
});
const result = (id: string, sourceCardId = "one"): FluencyResult => ({
  id, sourceCardId, source: "learned", startedAt: "2026-10-22T00:00:00.000Z",
  completedAt: "2026-10-22T00:01:00.000Z", activeDurationMs: 60_000,
  committedCharacters: 10, correctCharacters: 9, uncorrectedErrors: 1,
  backspaces: 1, pauseCount: 2, longestPauseMs: 3_000, netWpm: 30,
  characterAccuracy: 0.9, physicalKeys: [{ code: "KeyC", presses: 3, mismatches: 1 }],
});

describe("Fluency progress", () => {
  it("keeps typing summaries separate and counts stable result IDs once", () => {
    const progress = deriveFluencyProgress([result("one"), result("one")], []);
    expect(progress).toMatchObject({ passes: 1, distinctSentences: 1, medianNetWpm: 30,
      medianCharacterAccuracy: 0.9, backspaces: 1, pauseCount: 2 });
    expect(progress.physicalKeys).toEqual([{ code: "KeyC", presses: 3, mismatches: 1 }]);
    expect(progress).not.toHaveProperty("languageScore");
  });

  it("prefers a different acquired sentence that has not been repeatedly typed", () => {
    const progress = deriveFluencyProgress([result("one")], [card("one"), card("two"), card("three", "Go now.")], "one");
    expect(progress.recommendations[0]).toMatchObject({ card: { id: "two" },
      isNewMaterial: true, matchingWeakKeys: ["KeyC"] });
    expect(progress.recommendations.some((item) => item.card.id === "one")).toBe(false);
  });

  it("does not invent weak keys from unsampled or single-press evidence", () => {
    const pass = { ...result("one"), physicalKeys: [{ code: "KeyC", presses: 1, mismatches: 1 }] };
    expect(deriveFluencyProgress([pass], []).weakKeys).toEqual([]);
    expect(deriveFluencyProgress([], []).medianNetWpm).toBeNull();
  });

  it("excludes unsafe content and never recommends outside the supplied acquired set", () => {
    const unsafe = { ...card("unsafe"), prompt: "Can you send it?" };
    const progress = deriveFluencyProgress([result("one")], [card("two"), unsafe]);
    expect(progress.recommendations.map((item) => item.card.id)).toEqual(["two"]);
  });
});
