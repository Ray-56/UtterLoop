import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import type { ReviewState } from "../review/ReviewState";
import { buildPracticeQueue } from "./buildPracticeQueue";

const now = new Date("2026-07-19T00:00:00.000Z");
const cards = [card("card-1"), card("card-2")];

describe("buildPracticeQueue", () => {
  it("keeps untouched course cards out of review", () => {
    const queue = buildPracticeQueue(cards, [], now);

    expect(queue.due).toEqual([]);
    expect(queue.upcoming).toEqual([]);
  });

  it("includes attempted cards and preserves due scheduling", () => {
    const queue = buildPracticeQueue(cards, [reviewState("card-1", "2026-07-18T00:00:00.000Z")], now);

    expect(queue.due.map((item) => item.card.id)).toEqual(["card-1"]);
  });

  it("includes explicitly new cards and excludes mastered cards", () => {
    const reviewStates: ReviewState[] = [
      { ...reviewState("card-1", now.toISOString()), lastReviewedAt: undefined, learningStatus: "new" },
      { ...reviewState("card-2", now.toISOString()), learningStatus: "mastered" },
    ];

    const queue = buildPracticeQueue(cards, reviewStates, now);

    expect(queue.due.map((item) => item.card.id)).toEqual(["card-1"]);
  });
});

function card(id: string): SentenceCard {
  return {
    id,
    english: `Sentence for ${id}.`,
    prompt: `${id} 的提示。`,
    source: "Test",
    tags: ["test"],
    acceptableAnswers: [],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function reviewState(cardId: string, dueAt: string): ReviewState {
  return {
    cardId,
    stage: 0,
    dueAt,
    lastReviewedAt: "2026-07-18T00:00:00.000Z",
    streak: 0,
    lapseCount: 0,
  };
}
