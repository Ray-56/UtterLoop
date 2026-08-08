import { describe, expect, it } from "vitest";
import type { Course } from "../domain/curriculum/Course";
import {
  resolvePracticeRoute,
  resolveReviewCourseFilter,
} from "./routeAvailability";

const courses: Course[] = [{
  id: "course-1",
  title: "Course One",
  description: "A test course.",
  categoryId: "category-1",
  tags: ["test"],
  level: { label: "Beginner", cefrFrom: "A1", cefrTo: "A1" },
  provider: { kind: "original", name: "UtterLoop" },
  revision: 1,
  license: { name: "Original", url: "https://example.com", attribution: "Test" },
  units: [{
    id: "unit-1",
    title: "Unit One",
    description: "A test unit.",
    lessons: [{
      id: "lesson-1",
      title: "Lesson One",
      objective: "Recall one sentence.",
      cardIds: ["card-1"],
    }],
  }],
}];

describe("route availability", () => {
  it("accepts exact lesson, course, review, and vocabulary references", () => {
    const catalog = { courses, cardIds: new Set(["card-1"]) };

    expect(resolvePracticeRoute({
      kind: "lesson",
      courseId: "course-1",
      lessonId: "lesson-1",
      mode: "learn",
    }, catalog)).toEqual({ kind: "available" });
    expect(resolvePracticeRoute({ kind: "course", courseId: "course-1" }, catalog))
      .toEqual({ kind: "available" });
    expect(resolvePracticeRoute({ kind: "review", courseId: "course-1" }, catalog))
      .toEqual({ kind: "available" });
    expect(resolvePracticeRoute({ kind: "vocabulary", cardId: "card-1" }, catalog))
      .toEqual({ kind: "available" });
    expect(resolvePracticeRoute({
      kind: "vocabulary",
      courseId: "course-1",
      cardId: "card-1",
    }, catalog)).toEqual({ kind: "available" });
    expect(resolvePracticeRoute({ kind: "focused", cardId: "card-1" }, catalog))
      .toEqual({ kind: "available" });
  });

  it("reports a copied scope whose referenced content was removed", () => {
    const catalog = { courses, cardIds: new Set(["card-1"]) };

    expect(resolvePracticeRoute({
      kind: "lesson",
      courseId: "course-1",
      lessonId: "removed",
      mode: "learn",
    }, catalog)).toEqual({ kind: "unavailable", reference: "lesson" });
    expect(resolvePracticeRoute({ kind: "course", courseId: "removed" }, catalog))
      .toEqual({ kind: "unavailable", reference: "course" });
    expect(resolvePracticeRoute({ kind: "vocabulary", cardId: "removed" }, catalog))
      .toEqual({ kind: "unavailable", reference: "card" });
    expect(resolvePracticeRoute({
      kind: "vocabulary",
      courseId: "course-1",
      cardId: "outside-course",
    }, { courses, cardIds: new Set(["card-1", "outside-course"]) }))
      .toEqual({ kind: "unavailable", reference: "card" });
    expect(resolvePracticeRoute({ kind: "focused", cardId: "removed" }, catalog))
      .toEqual({ kind: "unavailable", reference: "card" });
  });

  it("falls an invalid Review Course filter back to all courses with a notice", () => {
    expect(resolveReviewCourseFilter("course-1", courses)).toEqual({
      courseId: "course-1",
      wasUnavailable: false,
    });
    expect(resolveReviewCourseFilter("removed", courses)).toEqual({
      courseId: null,
      wasUnavailable: true,
    });
  });
});
