import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import type { ReviewState } from "../review/ReviewState";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import { buildReturnPlan } from "./returnPlan";

const now = new Date("2026-10-22T10:00:00.000Z");
function card(id: string): SentenceCard {
  return { id, english: "Please send me the file.", prompt: "请把文件发给我。", acceptableAnswers: [], tags: [], source: "test", createdAt: now.toISOString(), updatedAt: now.toISOString() };
}
function review(id: string, dueAt: string): ReviewState {
  return { cardId: id, dueAt, stage: 1, streak: 1, lapseCount: 0, lastReviewedAt: "2026-10-01T10:00:00.000Z" };
}
function learned(id: string): SentenceLearningState {
  return { cardId: id, introducedAt: "2026-10-01T10:00:00.000Z", firstPassedAt: "2026-10-01T11:00:00.000Z", firstPassSource: "independent-recall" };
}

describe("bounded return plan", () => {
  it("selects the oldest due work first and leaves unscheduled cards unchanged", () => {
    const ids = ["recent", "oldest", "middle", "fourth"];
    const input = { minutes: 3 as const, cards: ids.map(card), reviewStates: [review("recent", "2026-10-22T09:00:00.000Z"), review("oldest", "2026-10-01T00:00:00.000Z"), review("middle", "2026-10-10T00:00:00.000Z"), review("fourth", "2026-10-21T00:00:00.000Z")], learningStates: ids.map(learned), weakCardIds: new Set(ids), now };
    const before = structuredClone(input.reviewStates);
    const plan = buildReturnPlan(input);
    expect(plan.items.map((item) => item.card.id)).toEqual(["oldest", "middle", "fourth"]);
    expect(plan.items.every((item) => item.queueReason === "due-review" && item.initialPhase === "review-recall")).toBe(true);
    expect(plan).toMatchObject({ minutes: 3, itemLimit: 3, remainingDueCount: 1 });
    expect(plan.items.every((item) => item.explanation.includes("due"))).toBe(true);
    expect(input.reviewStates).toEqual(before);
  });

  it("allows the next oldest due card into a later plan instead of favoring easy cards", () => {
    const ids = ["a", "b", "c", "d"];
    const states = ids.map((id, index) => review(id, `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`));
    const input = { minutes: 3 as const, cards: ids.map(card), reviewStates: states, learningStates: ids.map(learned), now };
    const completed = new Set(buildReturnPlan(input).items.map((item) => item.card.id));
    const next = buildReturnPlan({ ...input, reviewStates: states.map((state) => completed.has(state.cardId) ? { ...state, dueAt: "2026-10-25T00:00:00.000Z" } : state) });
    expect(next.items[0].card.id).toBe("d");
  });

  it.each([{ minutes: 3, itemLimit: 3, newLimit: 0, weakLimit: 1 }, { minutes: 8, itemLimit: 6, newLimit: 1, weakLimit: 1 }, { minutes: 15, itemLimit: 10, newLimit: 2, weakLimit: 2 }] as const)("bounds optional work for a $minutes-minute intention without promising duration", ({ minutes, itemLimit, newLimit, weakLimit }) => {
    const weakIds = ["weak-a", "weak-b", "weak-c"];
    const freshIds = ["new-a", "new-b", "new-c"];
    const plan = buildReturnPlan({ minutes, cards: [...weakIds, ...freshIds].map(card), reviewStates: weakIds.map((id) => review(id, "2026-10-25T00:00:00.000Z")), learningStates: weakIds.map(learned), weakCardIds: new Set(weakIds), now });
    expect(plan.itemLimit).toBe(itemLimit);
    expect(plan.items.filter((item) => item.queueReason === "voluntary-practice")).toHaveLength(weakLimit);
    expect(plan.items.filter((item) => item.queueReason === "new-learning")).toHaveLength(newLimit);
    expect(plan.items.filter((item) => item.queueReason === "new-learning").every((item) => item.initialPhase === "first-exposure")).toBe(true);
    expect(plan.items.filter((item) => item.queueReason === "voluntary-practice").every((item) => item.initialPhase === "voluntary-practice" && !item.scheduledReviewDueAt)).toBe(true);
    expect(plan.description).toContain("pace");
  });

  it("continues acquisition with the correct instructional phase instead of calling it retained Review", () => {
    const plan = buildReturnPlan({ minutes: 15, cards: [card("ready"), card("guided")], reviewStates: [], learningStates: [{ cardId: "ready", introducedAt: "2026-10-20T00:00:00.000Z", acquisitionStatus: "ready-independent" }, { cardId: "guided", introducedAt: "2026-10-20T00:00:00.000Z", acquisitionStatus: "needs-guided" }], now });
    expect(plan.items.map((item) => [item.queueReason, item.initialPhase])).toEqual([["new-learning", "independent-recall"], ["new-learning", "guided-recall"]]);
  });

  it("excludes unsafe and mastered content and reports a truthful empty plan", () => {
    const unsafe = { ...card("unsafe"), prompt: "Please send me the file." };
    const plan = buildReturnPlan({ minutes: 3, cards: [unsafe, card("mastered")], reviewStates: [review("unsafe", now.toISOString()), { ...review("mastered", now.toISOString()), learningStatus: "mastered" }], learningStates: [learned("unsafe"), learned("mastered")], now });
    expect(plan.items).toEqual([]);
    expect(plan.blockedCardIds).toEqual(["unsafe"]);
    expect(plan.remainingDueCount).toBe(0);
  });

  it("rejects unsupported budgets and invalid clocks at the public boundary", () => {
    const input = { minutes: 3 as const, cards: [], reviewStates: [], learningStates: [], now };
    expect(() => buildReturnPlan({ ...input, minutes: 5 as 3 })).toThrow(/3, 8, or 15/);
    expect(() => buildReturnPlan({ ...input, now: new Date("invalid") })).toThrow(/clock/);
  });
});
