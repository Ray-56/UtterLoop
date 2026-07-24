import { describe, expect, it } from "vitest";
import type { ReviewState } from "../review/ReviewState";
import type { Course, CourseCategory, LearningPath } from "./Course";
import { buildCourseCatalogItems } from "./buildCourseCatalogItems";

const categories: CourseCategory[] = [
  {
    id: "everyday",
    title: "Everyday Communication",
    description: "Daily English.",
    sortOrder: 0,
  },
  {
    id: "work",
    title: "Work & Study",
    description: "English for shared work.",
    sortOrder: 1,
  },
];

const courses: Course[] = [
  course("course-a", "everyday", ["a-1", "a-2"], 2),
  course("standalone", "work", ["s-1"], 1),
  course("course-b", "work", ["b-1"], 1),
];

const learningPaths: LearningPath[] = [
  {
    id: "path-one",
    title: "Path One",
    description: "First route.",
    courseIds: ["course-b", "course-a"],
  },
  {
    id: "path-two",
    title: "Path Two",
    description: "Second route.",
    courseIds: ["course-a"],
  },
];

describe("buildCourseCatalogItems", () => {
  it("projects every course once, including a standalone course", () => {
    const items = buildCourseCatalogItems({
      categories,
      courses,
      learningPaths,
      reviewStates: [],
    });

    expect(items.map((item) => item.course.id)).toEqual([
      "course-a",
      "standalone",
      "course-b",
    ]);
    expect(items.filter((item) => item.course.id === "course-a")).toHaveLength(1);
    expect(items.find((item) => item.course.id === "standalone")?.pathIds).toEqual([]);
  });

  it("attaches every path membership but uses the first recommendation position", () => {
    const items = buildCourseCatalogItems({
      categories,
      courses,
      learningPaths,
      reviewStates: [],
    });

    expect(items.find((item) => item.course.id === "course-b")).toMatchObject({
      pathIds: ["path-one"],
      recommendationRank: 0,
    });
    expect(items.find((item) => item.course.id === "course-a")).toMatchObject({
      pathIds: ["path-one", "path-two"],
      recommendationRank: 1,
    });
    expect(items.find((item) => item.course.id === "standalone")?.recommendationRank).toBeNull();
  });

  it("derives category, outline counts, and course progress", () => {
    const reviewStates: ReviewState[] = [reviewState("a-1")];
    const items = buildCourseCatalogItems({
      categories,
      courses,
      learningPaths,
      reviewStates,
    });

    expect(items.find((item) => item.course.id === "course-a")).toMatchObject({
      category: categories[0],
      unitCount: 2,
      lessonCount: 2,
      cardCount: 2,
      progress: {
        status: "in-progress",
        passedCards: 1,
        totalCards: 2,
      },
    });
  });

  it("rejects a course whose category is unavailable", () => {
    expect(() =>
      buildCourseCatalogItems({
        categories: [],
        courses: [courses[0]],
        learningPaths: [],
        reviewStates: [],
      }),
    ).toThrow("everyday");
  });
});

function course(
  id: string,
  categoryId: string,
  cardIds: string[],
  unitCount: number,
): Course {
  return {
    id,
    title: id,
    description: `${id} description`,
    categoryId,
    tags: [categoryId],
    level: { label: "Beginner", cefrFrom: "A1", cefrTo: "A2" },
    provider: { kind: "original", name: "UtterLoop Original" },
    revision: 1,
    license: {
      name: "CC0 1.0",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      attribution: "No attribution required.",
    },
    units: Array.from({ length: unitCount }, (_, index) => ({
      id: `${id}-unit-${index + 1}`,
      title: `Unit ${index + 1}`,
      description: `Unit ${index + 1} description`,
      lessons: [
        {
          id: `${id}-lesson-${index + 1}`,
          title: `Lesson ${index + 1}`,
          objective: `Practice lesson ${index + 1}.`,
          cardIds: cardIds.slice(index, index + 1),
        },
      ],
    })),
  };
}

function reviewState(cardId: string): ReviewState {
  return {
    cardId,
    stage: 1,
    dueAt: "2026-07-20T00:00:00.000Z",
    lastReviewedAt: "2026-07-19T00:00:00.000Z",
    streak: 1,
    lapseCount: 0,
  };
}
