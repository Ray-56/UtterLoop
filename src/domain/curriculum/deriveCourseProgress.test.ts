import { describe, expect, it } from "vitest";
import type { Course } from "./Course";
import { deriveCourseProgress } from "./deriveCourseProgress";

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
          objective: "Pass two cards.",
          cardIds: ["card-1", "card-2"],
        },
        {
          id: "lesson-2",
          title: "Lesson Two",
          objective: "Pass one card.",
          cardIds: ["card-3"],
        },
      ],
    },
  ],
};

describe("deriveCourseProgress", () => {
  it("recommends the first lesson when a course has not been started", () => {
    const progress = deriveCourseProgress(course, []);

    expect(progress).toMatchObject({
      courseId: "course-1",
      status: "not-started",
      passedCards: 0,
      totalCards: 3,
      recommendedLessonId: "lesson-1",
    });
    expect(progress.units[0].lessons[0].status).toBe("not-started");
  });

  it("completes a lesson only after every card has passed", () => {
    const progress = deriveCourseProgress(course, [
      learningState("card-1", true),
      learningState("card-2", false),
    ]);

    expect(progress.units[0].lessons[0]).toMatchObject({
      status: "in-progress",
      attemptedCards: 2,
      passedCards: 1,
      totalCards: 2,
    });
    expect(progress.recommendedLessonId).toBe("lesson-1");
  });

  it("moves the recommendation after a lesson is complete", () => {
    const progress = deriveCourseProgress(course, [
      learningState("card-1", true),
      learningState("card-2", true),
    ]);

    expect(progress.units[0].lessons[0].status).toBe("completed");
    expect(progress.recommendedLessonId).toBe("lesson-2");
  });

  it("counts explicit mastery First Pass evidence as passed", () => {
    const progress = deriveCourseProgress(course, [
      learningState("card-1", true, "explicit-mastery"),
      learningState("card-2", true),
      learningState("card-3", true),
    ]);

    expect(progress).toMatchObject({
      status: "completed",
      passedCards: 3,
      recommendedLessonId: null,
    });
  });

  it("keeps completion after a later ReviewState lapse because coverage reads only First Pass", () => {
    const progress = deriveCourseProgress(course, [
      learningState("card-1", true),
      learningState("card-2", true),
      learningState("card-3", true),
    ]);

    expect(progress.status).toBe("completed");
  });
});

function learningState(cardId: string, passed: boolean, source: "independent-recall" | "explicit-mastery" = "independent-recall") {
  return passed ? {
    cardId,
    introducedAt: "2026-07-19T00:00:00.000Z",
    firstPassedAt: "2026-07-20T00:00:00.000Z",
    firstPassSource: source,
  } : {
    cardId,
    introducedAt: "2026-07-19T00:00:00.000Z",
    acquisitionStatus: "needs-guided" as const,
  };
}
