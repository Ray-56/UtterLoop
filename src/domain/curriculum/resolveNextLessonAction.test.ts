import { describe, expect, it } from "vitest";
import type { Course, LearningPath } from "./Course";
import type { CourseProgress } from "./deriveCourseProgress";
import { resolveNextLessonAction } from "./resolveNextLessonAction";

const courses = [
  course("course-a", "Course Alpha", [
    ["unit-a", "Unit A", [["lesson-a1", "Alpha One"], ["lesson-a2", "Alpha Two"]]],
  ]),
  course("course-b", "Course Beta", [
    ["unit-b", "Unit B", [["lesson-b1", "Beta One"], ["lesson-b2", "Beta Two"]]],
  ]),
];
const learningPaths: LearningPath[] = [{
  id: "path-1",
  title: "Path One",
  description: "Alpha then Beta.",
  courseIds: ["course-a", "course-b"],
}];

describe("resolveNextLessonAction", () => {
  it("returns the post-write LearningPath recommendation after in-order completion", () => {
    const action = resolveNextLessonAction({
      completedCourseId: "course-a",
      completedLessonId: "lesson-a1",
      learningPaths,
      courses,
      courseProgress: [
        progress(courses[0], ["lesson-a1"]),
        progress(courses[1], []),
      ],
    });

    expect(action).toEqual({
      courseId: "course-a",
      courseTitle: "Course Alpha",
      lessonId: "lesson-a2",
      lessonTitle: "Alpha Two",
      scope: {
        kind: "lesson",
        courseId: "course-a",
        lessonId: "lesson-a2",
        mode: "learn",
      },
    });
  });

  it("recovers the earliest incomplete LearningPath Lesson after out-of-order study", () => {
    const action = resolveNextLessonAction({
      completedCourseId: "course-a",
      completedLessonId: "lesson-a2",
      learningPaths,
      courses,
      courseProgress: [
        progress(courses[0], ["lesson-a2"]),
        progress(courses[1], []),
      ],
    });

    expect(action?.lessonId).toBe("lesson-a1");
    expect(action?.scope).toEqual({
      kind: "lesson",
      courseId: "course-a",
      lessonId: "lesson-a1",
      mode: "learn",
    });
  });

  it("crosses to the earliest incomplete Course in LearningPath order", () => {
    const action = resolveNextLessonAction({
      completedCourseId: "course-a",
      completedLessonId: "lesson-a2",
      learningPaths,
      courses,
      courseProgress: [
        progress(courses[0], ["lesson-a1", "lesson-a2"]),
        progress(courses[1], []),
      ],
    });

    expect(action).toMatchObject({
      courseId: "course-b",
      courseTitle: "Course Beta",
      lessonId: "lesson-b1",
      lessonTitle: "Beta One",
    });
  });

  it("recommends the first later incomplete Lesson for a standalone Course", () => {
    const action = resolveNextLessonAction({
      completedCourseId: "course-a",
      completedLessonId: "lesson-a1",
      learningPaths: [],
      courses,
      courseProgress: [progress(courses[0], ["lesson-a1"])],
    });

    expect(action).toMatchObject({
      courseId: "course-a",
      lessonId: "lesson-a2",
      scope: {
        kind: "lesson",
        courseId: "course-a",
        lessonId: "lesson-a2",
        mode: "learn",
      },
    });
  });

  it("wraps to the first earlier incomplete Lesson for out-of-order standalone study", () => {
    const action = resolveNextLessonAction({
      completedCourseId: "course-a",
      completedLessonId: "lesson-a2",
      learningPaths: [],
      courses,
      courseProgress: [progress(courses[0], ["lesson-a2"])],
    });

    expect(action?.lessonId).toBe("lesson-a1");
  });

  it("returns null when every eligible Lesson is complete", () => {
    const completedProgress = [
      progress(courses[0], ["lesson-a1", "lesson-a2"]),
      progress(courses[1], ["lesson-b1", "lesson-b2"]),
    ];

    expect(resolveNextLessonAction({
      completedCourseId: "course-a",
      completedLessonId: "lesson-a2",
      learningPaths,
      courses,
      courseProgress: completedProgress,
    })).toBeNull();
    expect(resolveNextLessonAction({
      completedCourseId: "course-a",
      completedLessonId: "lesson-a2",
      learningPaths: [],
      courses,
      courseProgress: completedProgress,
    })).toBeNull();
  });
});

type UnitFixture = [unitId: string, unitTitle: string, lessons: LessonFixture[]];
type LessonFixture = [lessonId: string, lessonTitle: string];

function course(id: string, title: string, units: UnitFixture[]): Course {
  return {
    id,
    title,
    description: `${title} description.`,
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
    units: units.map(([unitId, unitTitle, lessons]) => ({
      id: unitId,
      title: unitTitle,
      description: `${unitTitle} description.`,
      lessons: lessons.map(([lessonId, lessonTitle]) => ({
        id: lessonId,
        title: lessonTitle,
        objective: `Complete ${lessonTitle}.`,
        cardIds: [`${lessonId}-card`],
      })),
    })),
  };
}

function progress(courseValue: Course, completedLessonIds: string[]): CourseProgress {
  const completed = new Set(completedLessonIds);
  const units = courseValue.units.map((unit) => {
    const lessons = unit.lessons.map((lesson) => ({
      lessonId: lesson.id,
      status: completed.has(lesson.id) ? "completed" as const : "not-started" as const,
      attemptedCards: completed.has(lesson.id) ? lesson.cardIds.length : 0,
      passedCards: completed.has(lesson.id) ? lesson.cardIds.length : 0,
      totalCards: lesson.cardIds.length,
    }));
    const passedCards = lessons.reduce((sum, lesson) => sum + lesson.passedCards, 0);
    const totalCards = lessons.reduce((sum, lesson) => sum + lesson.totalCards, 0);

    return {
      unitId: unit.id,
      status: passedCards === totalCards ? "completed" as const : passedCards > 0 ? "in-progress" as const : "not-started" as const,
      attemptedCards: passedCards,
      passedCards,
      totalCards,
      lessons,
    };
  });
  const passedCards = units.reduce((sum, unit) => sum + unit.passedCards, 0);
  const totalCards = units.reduce((sum, unit) => sum + unit.totalCards, 0);

  return {
    courseId: courseValue.id,
    status: passedCards === totalCards ? "completed" : passedCards > 0 ? "in-progress" : "not-started",
    attemptedCards: passedCards,
    passedCards,
    totalCards,
    recommendedLessonId: courseValue.units
      .flatMap((unit) => unit.lessons)
      .find((lesson) => !completed.has(lesson.id))?.id ?? null,
    units,
  };
}
