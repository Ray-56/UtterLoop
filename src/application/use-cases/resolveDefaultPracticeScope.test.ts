import { describe, expect, it } from "vitest";
import type { Course } from "../../domain/curriculum/Course";
import { resolveDefaultPracticeScope } from "./resolveDefaultPracticeScope";

describe("resolveDefaultPracticeScope", () => {
  it("resumes a compatible active Practice Session before due Review or new learning", () => {
    const activeScope = {
      kind: "lesson",
      courseId: "course-1",
      lessonId: "lesson-1",
      mode: "replay",
    } as const;

    expect(resolveDefaultPracticeScope({
      explicitScope: null,
      activeScope,
      reviewStates: [{
        cardId: "due-card",
        stage: 1,
        dueAt: "2026-07-31T23:59:59.000Z",
        streak: 1,
        lapseCount: 0,
      }],
      pathProgress: [{
        recommendedCourseId: "starter-foundations",
        recommendedLessonId: "sf-u1-l1",
      }],
      courses: [],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })).toEqual(activeScope);
  });

  it("puts due Review ahead of the recommended Lesson", () => {
    expect(resolveDefaultPracticeScope({
      explicitScope: null,
      reviewStates: [{
        cardId: "due-card",
        stage: 1,
        dueAt: "2026-07-31T23:59:59.000Z",
        streak: 1,
        lapseCount: 0,
      }],
      pathProgress: [{
        recommendedCourseId: "starter-foundations",
        recommendedLessonId: "sf-u1-l1",
      }],
      courses: [],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })).toEqual({ kind: "review" });
  });

  it("ignores mastered due cards and keeps the recommended Lesson", () => {
    expect(resolveDefaultPracticeScope({
      explicitScope: null,
      reviewStates: [{
        cardId: "mastered-card",
        stage: 6,
        dueAt: "2026-07-01T00:00:00.000Z",
        streak: 8,
        lapseCount: 0,
        learningStatus: "mastered",
      }],
      pathProgress: [{
        recommendedCourseId: "starter-foundations",
        recommendedLessonId: "sf-u1-l1",
      }],
      courses: [],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })).toEqual({
      kind: "lesson",
      courseId: "starter-foundations",
      lessonId: "sf-u1-l1",
      mode: "learn",
    });
  });

  it("preserves an explicit URL scope even when Review is due", () => {
    const explicitScope = { kind: "focused", cardId: "weak-card" } as const;

    expect(resolveDefaultPracticeScope({
      explicitScope,
      activeScope: {
        kind: "lesson",
        courseId: "course-1",
        lessonId: "lesson-1",
        mode: "replay",
      },
      reviewStates: [{
        cardId: "due-card",
        stage: 1,
        dueAt: "2026-07-01T00:00:00.000Z",
        streak: 1,
        lapseCount: 0,
      }],
      pathProgress: [{
        recommendedCourseId: "starter-foundations",
        recommendedLessonId: "sf-u1-l1",
      }],
      courses: [],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })).toEqual(explicitScope);
  });

  it("keeps the first Lesson replay fallback when no recommendation exists", () => {
    expect(resolveDefaultPracticeScope({
      explicitScope: null,
      reviewStates: [],
      pathProgress: [],
      courses: [course],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })).toEqual({
      kind: "lesson",
      courseId: "course-1",
      lessonId: "lesson-1",
      mode: "replay",
    });
  });
});

const course: Course = {
  id: "course-1",
  title: "Course One",
  description: "A test course.",
  categoryId: "category-1",
  tags: [],
  level: { label: "A1", cefrFrom: "A1", cefrTo: "A1" },
  provider: { kind: "original", name: "Test" },
  revision: 1,
  license: { name: "Test", url: "https://example.com", attribution: "Test" },
  units: [{
    id: "unit-1",
    title: "Unit One",
    description: "A unit.",
    lessons: [{
      id: "lesson-1",
      title: "Lesson One",
      objective: "Practice one card.",
      cardIds: ["card-1"],
    }],
  }],
};
