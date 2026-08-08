import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import type { Course } from "./Course";
import { buildCourseReplayQueue } from "./buildCourseReplayQueue";

const now = new Date("2026-07-31T00:00:00.000Z");

describe("buildCourseReplayQueue", () => {
  it("walks every Unit, Lesson, and Card in canonical order with occurrence context", () => {
    const course = makeCourse();
    const cards = [card("card-3"), card("card-1"), card("card-4"), card("card-2")];

    const queue = buildCourseReplayQueue(course, cards, [], [], now);

    expect(queue.emptyReason).toBeNull();
    expect(queue.items.map((item) => ({
      cardId: item.card.id,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      unitId: item.unitId,
      unitTitle: item.unitTitle,
      lessonId: item.lessonId,
      lessonTitle: item.lessonTitle,
      objective: item.objective,
    }))).toEqual([
      {
        cardId: "card-2",
        courseId: "course-1",
        courseTitle: "Course One",
        unitId: "unit-1",
        unitTitle: "Unit One",
        lessonId: "lesson-1",
        lessonTitle: "Lesson One",
        objective: "Recall the first pair.",
      },
      {
        cardId: "card-1",
        courseId: "course-1",
        courseTitle: "Course One",
        unitId: "unit-1",
        unitTitle: "Unit One",
        lessonId: "lesson-1",
        lessonTitle: "Lesson One",
        objective: "Recall the first pair.",
      },
      {
        cardId: "card-3",
        courseId: "course-1",
        courseTitle: "Course One",
        unitId: "unit-1",
        unitTitle: "Unit One",
        lessonId: "lesson-2",
        lessonTitle: "Lesson Two",
        objective: "Cross a Lesson boundary.",
      },
      {
        cardId: "card-4",
        courseId: "course-1",
        courseTitle: "Course One",
        unitId: "unit-2",
        unitTitle: "Unit Two",
        lessonId: "lesson-3",
        lessonTitle: "Lesson Three",
        objective: "Cross a Unit boundary.",
      },
    ]);
  });

  it("excludes mastered Cards without disturbing canonical order", () => {
    const course = makeCourse();
    const cards = [card("card-1"), card("card-2"), card("card-3"), card("card-4")];

    const queue = buildCourseReplayQueue(
      course,
      cards,
      [reviewState("card-1", "mastered")],
      [],
      now,
    );

    expect(queue.items.map((item) => item.card.id)).toEqual(["card-2", "card-3", "card-4"]);
    expect(queue.emptyReason).toBeNull();
  });

  it("distinguishes an all-mastered Course from a Course with no Cards", () => {
    const course = makeCourse();
    const cards = [card("card-1"), card("card-2"), card("card-3"), card("card-4")];

    const allMastered = buildCourseReplayQueue(
      course,
      cards,
      cards.map((item) => reviewState(item.id, "mastered")),
      [],
      now,
    );
    const noCards = buildCourseReplayQueue(
      { ...course, units: [{ ...course.units[0], lessons: [] }] },
      cards,
      [],
      [],
      now,
    );

    expect(allMastered).toEqual({ items: [], emptyReason: "all-mastered" });
    expect(noCards).toEqual({ items: [], emptyReason: "no-cards" });
  });

  it("returns an explicit reason when the Course is missing", () => {
    expect(buildCourseReplayQueue(undefined, [], [], [], now)).toEqual({
      items: [],
      emptyReason: "course-missing",
    });
  });

  it("validates every Card reference before returning an active queue", () => {
    const course = makeCourse();

    expect(() => buildCourseReplayQueue(
      course,
      [card("card-1"), card("card-2"), card("card-3")],
      [reviewState("card-2", "mastered")],
      [],
      now,
    )).toThrow("Course course-1 references unknown SentenceCard: card-4");
  });
});

function makeCourse(): Course {
  return {
    id: "course-1",
    title: "Course One",
    description: "A replay fixture.",
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
        description: "First unit.",
        lessons: [
          {
            id: "lesson-1",
            title: "Lesson One",
            objective: "Recall the first pair.",
            cardIds: ["card-2", "card-1"],
          },
          {
            id: "lesson-2",
            title: "Lesson Two",
            objective: "Cross a Lesson boundary.",
            cardIds: ["card-3"],
          },
        ],
      },
      {
        id: "unit-2",
        title: "Unit Two",
        description: "Second unit.",
        lessons: [
          {
            id: "lesson-3",
            title: "Lesson Three",
            objective: "Cross a Unit boundary.",
            cardIds: ["card-4"],
          },
        ],
      },
    ],
  };
}

function card(id: string): SentenceCard {
  return {
    id,
    english: `Sentence for ${id}.`,
    prompt: `${id} prompt.`,
    source: "Test",
    tags: ["test"],
    acceptableAnswers: [],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  };
}

function reviewState(cardId: string, learningStatus?: "new" | "mastered") {
  return {
    cardId,
    stage: 1 as const,
    dueAt: "2026-08-01T00:00:00.000Z",
    lastReviewedAt: "2026-07-31T00:00:00.000Z",
    streak: 1,
    lapseCount: 0,
    learningStatus,
  };
}
