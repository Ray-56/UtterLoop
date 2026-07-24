import { describe, expect, it } from "vitest";
import type { CourseProgress } from "./deriveCourseProgress";
import type { CefrLevel, Course, CourseCategory } from "./Course";
import type { CourseCatalogItem } from "./buildCourseCatalogItems";
import {
  DEFAULT_COURSE_CATALOG_QUERY,
  queryCourseCatalog,
  type CourseCatalogQuery,
} from "./queryCourseCatalog";

const everyday: CourseCategory = {
  id: "everyday",
  title: "Everyday Communication",
  description: "Daily English.",
  sortOrder: 0,
};
const work: CourseCategory = {
  id: "work",
  title: "Work & Study",
  description: "Professional English.",
  sortOrder: 1,
};

const items: CourseCatalogItem[] = [
  item({
    id: "cafe-speaking",
    title: "Café Speaking",
    description: "Order drinks politely.",
    category: everyday,
    tags: ["conversation", "food"],
    level: ["A1", "A2"],
    provider: "Open Lessons",
    status: "in-progress",
    passedCards: 3,
    totalCards: 4,
    recommendationRank: 1,
  }),
  item({
    id: "meeting-basics",
    title: "Meeting Basics",
    description: "Give project updates.",
    category: work,
    tags: ["speaking", "updates"],
    level: ["A2", "B1"],
    provider: "VOA Learning English",
    status: "in-progress",
    passedCards: 1,
    totalCards: 4,
    recommendationRank: 0,
  }),
  item({
    id: "email-basics",
    title: "Email Basics",
    description: "Write a clear message.",
    category: work,
    tags: ["writing", "requests"],
    level: ["B1", "B2"],
    provider: "UtterLoop Original",
    status: "not-started",
    passedCards: 0,
    totalCards: 5,
    recommendationRank: null,
  }),
  item({
    id: "daily-routines",
    title: "Daily Routines",
    description: "Recall a complete day.",
    category: everyday,
    tags: ["habits", "time"],
    level: ["A1", "A1"],
    provider: "UtterLoop Original",
    status: "completed",
    passedCards: 5,
    totalCards: 5,
    recommendationRank: null,
  }),
];

describe("queryCourseCatalog", () => {
  it.each([
    ["  CAFE   speaking ", ["cafe-speaking"]],
    ["project updates", ["meeting-basics"]],
    ["work study", ["meeting-basics", "email-basics"]],
    ["voa", ["meeting-basics"]],
    ["beginner", ["meeting-basics", "cafe-speaking", "daily-routines"]],
  ])("normalizes and searches all discovery fields for %j", (text, expectedIds) => {
    expect(run({ text }).map((item) => item.course.id)).toEqual(expectedIds);
  });

  it("combines text, category, CEFR, and status filters with AND semantics", () => {
    expect(
      run({
        text: "speaking",
        categoryId: "work",
        cefr: "B1",
        status: "in-progress",
      }).map((item) => item.course.id),
    ).toEqual(["meeting-basics"]);
  });

  it("matches a selected CEFR level inside the inclusive course range", () => {
    expect(run({ cefr: "A2" }).map((item) => item.course.id)).toEqual([
      "meeting-basics",
      "cafe-speaking",
    ]);
    expect(run({ cefr: "B2" }).map((item) => item.course.id)).toEqual(["email-basics"]);
  });

  it("sorts recommendations by path rank before category and title", () => {
    expect(run().map((item) => item.course.id)).toEqual([
      "meeting-basics",
      "cafe-speaking",
      "daily-routines",
      "email-basics",
    ]);
  });

  it("sorts titles A-Z with a deterministic ID fallback", () => {
    const duplicateTitle = item({
      id: "email-advanced",
      title: "Email Basics",
      description: "More email practice.",
      category: work,
      tags: ["writing"],
      level: ["B2", "C1"],
      provider: "Open Lessons",
      status: "not-started",
      passedCards: 0,
      totalCards: 4,
      recommendationRank: null,
    });

    const result = queryCourseCatalog([...items, duplicateTitle], {
      ...DEFAULT_COURSE_CATALOG_QUERY,
      sort: "title",
    });

    expect(result.map((catalogItem) => catalogItem.course.id)).toEqual([
      "cafe-speaking",
      "daily-routines",
      "email-advanced",
      "email-basics",
      "meeting-basics",
    ]);
  });

  it("sorts in-progress courses by highest passed ratio before not-started and completed", () => {
    expect(run({ sort: "progress" }).map((item) => item.course.id)).toEqual([
      "cafe-speaking",
      "meeting-basics",
      "email-basics",
      "daily-routines",
    ]);
  });

  it("does not mutate the supplied items", () => {
    const originalOrder = items.map((item) => item.course.id);

    queryCourseCatalog(items, { ...DEFAULT_COURSE_CATALOG_QUERY, sort: "title" });

    expect(items.map((item) => item.course.id)).toEqual(originalOrder);
  });
});

function run(overrides: Partial<CourseCatalogQuery> = {}): CourseCatalogItem[] {
  return queryCourseCatalog(items, {
    ...DEFAULT_COURSE_CATALOG_QUERY,
    ...overrides,
  });
}

function item(input: {
  id: string;
  title: string;
  description: string;
  category: CourseCategory;
  tags: string[];
  level: [CefrLevel, CefrLevel];
  provider: string;
  status: CourseProgress["status"];
  passedCards: number;
  totalCards: number;
  recommendationRank: number | null;
}): CourseCatalogItem {
  const course: Course = {
    id: input.id,
    title: input.title,
    description: input.description,
    categoryId: input.category.id,
    tags: input.tags,
    level: {
      label: `${input.level[0] === "A1" || input.level[0] === "A2" ? "Beginner" : "Intermediate"} · ${input.level[0] === input.level[1] ? input.level[0] : input.level.join("–")}`,
      cefrFrom: input.level[0],
      cefrTo: input.level[1],
    },
    provider: { kind: "original", name: input.provider },
    revision: 1,
    license: {
      name: "CC0 1.0",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      attribution: "No attribution required.",
    },
    units: [],
  };
  const progress: CourseProgress = {
    courseId: input.id,
    status: input.status,
    attemptedCards: input.status === "not-started" ? 0 : input.passedCards,
    passedCards: input.passedCards,
    totalCards: input.totalCards,
    recommendedLessonId: null,
    units: [],
  };

  return {
    course,
    category: input.category,
    progress,
    pathIds: input.recommendationRank === null ? [] : ["path-one"],
    unitCount: 0,
    lessonCount: 0,
    cardCount: input.totalCards,
    recommendationRank: input.recommendationRank,
  };
}
