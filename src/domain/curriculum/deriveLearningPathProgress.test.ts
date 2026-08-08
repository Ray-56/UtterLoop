import { describe, expect, it } from "vitest";
import type { Course } from "./Course";
import { deriveLearningPathProgress } from "./deriveLearningPathProgress";

const license = {
  name: "CC0 1.0",
  url: "https://creativecommons.org/publicdomain/zero/1.0/",
  attribution: "No attribution required.",
};

const path = {
  id: "path-1",
  title: "Path One",
  description: "A test path.",
  courseIds: ["course-1", "course-2"],
};

const courses = [course("course-1", "lesson-1", "card-1"), course("course-2", "lesson-2", "card-2")];

describe("deriveLearningPathProgress", () => {
  it("recommends the first incomplete course and lesson in path order", () => {
    const progress = deriveLearningPathProgress(path, courses, [learningState("card-1")]);

    expect(progress).toMatchObject({
      pathId: "path-1",
      status: "in-progress",
      completedCourses: 1,
      totalCourses: 2,
      recommendedCourseId: "course-2",
      recommendedLessonId: "lesson-2",
    });
  });

  it("has no recommendation after the path is complete", () => {
    const progress = deriveLearningPathProgress(path, courses, [
      learningState("card-1"),
      learningState("card-2"),
    ]);

    expect(progress).toMatchObject({
      status: "completed",
      completedCourses: 2,
      recommendedCourseId: null,
      recommendedLessonId: null,
    });
  });
});

function course(id: string, lessonId: string, cardId: string): Course {
  return {
    id,
    title: id,
    description: `${id} description`,
    categoryId: "test-category",
    tags: ["test"],
    level: { label: "Starter", cefrFrom: "A1", cefrTo: "A1" },
    provider: { kind: "original", name: "Test provider" },
    revision: 1,
    license,
    units: [
      {
        id: `${id}-unit`,
        title: "Unit",
        description: "Unit description",
        lessons: [
          {
            id: lessonId,
            title: "Lesson",
            objective: "Pass the card.",
            cardIds: [cardId],
          },
        ],
      },
    ],
  };
}

function learningState(cardId: string) {
  return {
    cardId,
    introducedAt: "2026-07-19T00:00:00.000Z",
    firstPassedAt: "2026-07-20T00:00:00.000Z",
    firstPassSource: "independent-recall" as const,
  };
}
