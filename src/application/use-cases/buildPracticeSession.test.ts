import { describe, expect, it } from "vitest";
import type { Course } from "../../domain/curriculum/Course";
import { buildPracticeSession } from "./buildPracticeSession";

const now = new Date("2026-07-19T00:00:00.000Z");
const course: Course = {
  id: "course-1",
  title: "Course One",
  description: "A test course.",
  categoryId: "category-1",
  tags: ["test"],
  level: {
    label: "Starter · A1",
    cefrFrom: "A1",
    cefrTo: "A1",
  },
  provider: {
    kind: "original",
    name: "Test",
  },
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
      description: "A test unit.",
      lessons: [
        {
          id: "lesson-1",
          title: "Lesson One",
          objective: "Pass both cards.",
          cardIds: ["card-1", "card-2"],
        },
      ],
    },
  ],
};
const cards = [card("card-1"), card("card-2")];

describe("buildPracticeSession", () => {
  it("resolves lesson context and keeps a failed future-due card active", () => {
    const session = buildPracticeSession({
      scope: { kind: "lesson", courseId: "course-1", lessonId: "lesson-1", mode: "learn" },
      courses: [course],
      cards,
      reviewStates: [reviewState("card-1", 0, "2026-07-20T00:00:00.000Z"), reviewState("card-2", 1, now.toISOString())],
      vocabularyEntries: [],
      now,
    });

    expect(session.items.map((item) => item.card.id)).toEqual(["card-1"]);
    expect(session.context).toMatchObject({
      courseId: "course-1",
      courseTitle: "Course One",
      unitTitle: "Unit One",
      lessonId: "lesson-1",
      lessonTitle: "Lesson One",
      totalCards: 2,
      passedCards: 1,
    });
    expect(session.completed).toBe(false);
  });

  it("builds review only from attempted due cards", () => {
    const session = buildPracticeSession({
      scope: { kind: "review" },
      courses: [course],
      cards,
      reviewStates: [reviewState("card-2", 0, "2026-07-18T00:00:00.000Z")],
      vocabularyEntries: [],
      now,
    });

    expect(session.items.map((item) => item.card.id)).toEqual(["card-2"]);
    expect(session.context).toBeNull();
  });

  it("builds a vocabulary round from saved cards and excludes mastered cards", () => {
    const session = buildPracticeSession({
      scope: { kind: "vocabulary" },
      courses: [course],
      cards,
      reviewStates: [
        reviewState("card-1", 0, now.toISOString()),
        { ...reviewState("card-2", 1, now.toISOString()), learningStatus: "mastered" },
      ],
      vocabularyEntries: [
        { cardId: "card-1", savedAt: now.toISOString() },
        { cardId: "card-2", savedAt: now.toISOString() },
      ],
      now,
    });

    expect(session.items.map((item) => item.card.id)).toEqual(["card-1"]);
  });

  it("excludes mastered cards from replay and course rounds", () => {
    const reviewStates = [
      reviewState("card-1", 1, now.toISOString()),
      { ...reviewState("card-2", 1, now.toISOString()), learningStatus: "mastered" as const },
    ];
    const replay = buildPracticeSession({
      scope: { kind: "lesson", courseId: "course-1", lessonId: "lesson-1", mode: "replay" },
      courses: [course],
      cards,
      reviewStates,
      vocabularyEntries: [],
      now,
    });
    const courseRound = buildPracticeSession({
      scope: { kind: "course", courseId: "course-1" },
      courses: [course],
      cards,
      reviewStates,
      vocabularyEntries: [],
      now,
    });

    expect(replay.items.map((item) => item.card.id)).toEqual(["card-1"]);
    expect(courseRound.items.map((item) => item.card.id)).toEqual(["card-1"]);
  });
});

function card(id: string) {
  return {
    id,
    english: `This is ${id}.`,
    prompt: `这是 ${id}。`,
    source: "Test",
    tags: ["test"],
    acceptableAnswers: [],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function reviewState(cardId: string, stage: 0 | 1, dueAt: string) {
  return {
    cardId,
    stage,
    dueAt,
    lastReviewedAt: "2026-07-18T00:00:00.000Z",
    streak: stage,
    lapseCount: 0,
  };
}
