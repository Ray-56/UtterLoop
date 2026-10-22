import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import { createPracticeAttemptLogEntry } from "../practice/PracticeLogEntry";
import { buildWeaknessExercises, deriveLanguagePatterns } from "./weaknessPractice";

const now = new Date("2026-10-22T04:00:00.000Z");
function card(id: string, english: string): SentenceCard {
  return { id, english, prompt: "练习这条已学表达。", acceptableAnswers: [], source: "test", tags: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
}
function log(cardId: string, answer: string, turnId = cardId) {
  return createPracticeAttemptLogEntry({ turnId, cardId, phase: "independent-recall", submissionIndex: 0,
    submittedAt: now.toISOString(), answer, outcome: "close", accuracy: 0.8,
    evidence: { answerWasRevealed: false, hadEdits: false, audioPlayCount: 0, durationMs: 1_000 },
  });
}

describe("observed cross-sentence patterns", () => {
  it("requires two distinct sentences, not repeated retries on one sentence", () => {
    const cards = [card("a", "I need a pen."), card("b", "Please open the window.")];
    expect(deriveLanguagePatterns(cards, [log("a", "I need pen"), log("a", "I need pen", "again")], now)).toEqual([]);
    const patterns = deriveLanguagePatterns(cards, [log("a", "I need pen"), log("b", "Please open window")], now);
    expect(patterns[0]).toMatchObject({ id: "articles", distinctCards: 2, observations: 2 });
    expect(JSON.stringify(patterns)).not.toContain("I need a pen");
  });

  it("excludes help, correction, legacy, future and old evidence and simple letter typos", () => {
    const cards = [card("a", "I need a pen."), card("b", "Please open the window.")];
    const helped = { ...log("b", "Please open window"), supportLevelUsed: 4 as const };
    const corrected = { ...log("b", "Please open window"), submissionIndex: 1 };
    const legacy = { ...log("b", "Please open window"), phase: "legacy" as const };
    const future = { ...log("b", "Please open window"), submittedAt: "2026-10-23T00:00:00.000Z" };
    const old = { ...log("b", "Please open window"), submittedAt: "2026-01-01T00:00:00.000Z" };
    for (const excluded of [helped, corrected, legacy, future, old, log("b", "Please open teh window")]) {
      expect(deriveLanguagePatterns(cards, [log("a", "I need pen"), excluded], now)).toEqual([]);
    }
  });

  it("recognizes bounded substitutions and supplies safe authored contrast practice", () => {
    const cards = [card("a", "I've lived here for two years."), card("b", "I've worked here since Monday.")];
    expect(deriveLanguagePatterns(cards, [log("a", "I've lived here since two years"), log("b", "I've worked here for Monday")], now)[0].id).toBe("for-since");
    expect(buildWeaknessExercises("for-since")).toHaveLength(3);
    expect(buildWeaknessExercises("articles").every((exercise) => !exercise.prompt.includes(exercise.target))).toBe(true);
    const beCards = [card("a", "The file is ready."), card("b", "The files are ready.")];
    expect(deriveLanguagePatterns(beCards, [log("a", "The file are ready"), log("b", "The files is ready")], now)[0].id).toBe("be-agreement");
  });
});
