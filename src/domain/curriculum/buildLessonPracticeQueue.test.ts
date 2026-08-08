import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import { buildLessonPracticeQueue } from "./buildLessonPracticeQueue";
import type { Course } from "./Course";

const now = new Date("2026-07-19T00:00:00.000Z");
const cards: SentenceCard[] = [card("card-1"), card("card-2"), card("card-3")];
const course: Course = {
  id: "course-1",
  title: "Course One",
  description: "A test course.",
  categoryId: "test-category",
  tags: ["test"],
  level: { label: "Starter", cefrFrom: "A1", cefrTo: "A1" },
  provider: { kind: "original", name: "Test provider" },
  revision: 1,
  license: {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "No attribution required.",
  },
  units: [
    {
      id: "unit-1",
      title: "Unit One",
      description: "The first unit.",
      lessons: [
        {
          id: "lesson-1",
          title: "Lesson One",
          objective: "Practice in order.",
          cardIds: ["card-2", "card-1", "card-3"],
        },
      ],
    },
  ],
};

describe("buildLessonPracticeQueue", () => {
  it("keeps the first failed card in lesson order even when it is not due", () => {
    const queue = buildLessonPracticeQueue(
      course,
      "lesson-1",
      cards,
      [learningState("card-1")],
      [
        reviewState("card-2", 0, "2026-07-20T00:00:00.000Z"),
        reviewState("card-1", 1, "2026-07-20T00:00:00.000Z"),
      ],
      now,
      "learn",
    );

    expect(queue.items.map((item) => item.card.id)).toEqual(["card-2", "card-3"]);
    expect(queue.completed).toBe(false);
  });

  it("returns every lesson card in outline order when replaying", () => {
    const queue = buildLessonPracticeQueue(
      course,
      "lesson-1",
      cards,
      [],
      [reviewState("card-2", 1, "2026-07-20T00:00:00.000Z")],
      now,
      "replay",
    );

    expect(queue.items.map((item) => item.card.id)).toEqual(["card-2", "card-1", "card-3"]);
  });

  it("marks a learn queue complete when every card has passed", () => {
    const queue = buildLessonPracticeQueue(
      course,
      "lesson-1",
      cards,
      cards.map((item) => learningState(item.id)),
      cards.map((item) => reviewState(item.id, 1, "2026-07-20T00:00:00.000Z")),
      now,
      "learn",
    );

    expect(queue.items).toEqual([]);
    expect(queue.completed).toBe(true);
  });

  it("defers a future-due Independent-ready card across rounds without completing the Lesson", () => {
    const queue = buildLessonPracticeQueue(
      course,
      "lesson-1",
      cards,
      [
        readyIndependentState("card-2"),
        learningState("card-1"),
        learningState("card-3"),
      ],
      [reviewState("card-2", 0, "2026-07-19T00:10:00.000Z")],
      now,
      "learn",
    );

    expect(queue).toEqual({ items: [], completed: false });
  });

  it("preserves Lesson order for other acquisition cards while applying the due gate", () => {
    const queue = buildLessonPracticeQueue(
      course,
      "lesson-1",
      cards,
      [
        readyIndependentState("card-2"),
        needsGuidedState("card-1"),
        readyIndependentState("card-3"),
      ],
      [
        reviewState("card-2", 0, "2026-07-19T00:10:00.000Z"),
        reviewState("card-1", 0, "2026-07-19T00:10:00.000Z"),
        reviewState("card-3", 0, now.toISOString()),
      ],
      now,
      "learn",
    );

    expect(queue.items.map((item) => item.card.id)).toEqual(["card-1", "card-3"]);
    expect(queue.completed).toBe(false);
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

function learningState(cardId: string) {
  return {
    cardId,
    introducedAt: "2026-07-19T00:00:00.000Z",
    firstPassedAt: "2026-07-19T01:00:00.000Z",
    firstPassSource: "independent-recall" as const,
  };
}

function readyIndependentState(cardId: string) {
  return {
    cardId,
    introducedAt: "2026-07-18T00:00:00.000Z",
    acquisitionStatus: "ready-independent" as const,
  };
}

function needsGuidedState(cardId: string) {
  return {
    cardId,
    introducedAt: "2026-07-18T00:00:00.000Z",
    acquisitionStatus: "needs-guided" as const,
  };
}

function reviewState(cardId: string, stage: 0 | 1, dueAt: string) {
  return {
    cardId,
    stage,
    dueAt,
    lastReviewedAt: "2026-07-19T00:00:00.000Z",
    streak: stage,
    lapseCount: 0,
  };
}
