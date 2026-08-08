import type { Course } from "../domain/curriculum/Course";
import type { PracticeScope } from "../application/use-cases/buildPracticeSession";

export interface RouteCatalog {
  courses: Course[];
  cardIds: ReadonlySet<string>;
}

export type PracticeRouteResolution =
  | { kind: "available" }
  | { kind: "unavailable"; reference: "course" | "lesson" | "card" };

export function resolvePracticeRoute(
  scope: PracticeScope,
  catalog: RouteCatalog,
): PracticeRouteResolution {
  if (scope.kind === "focused") {
    return catalog.cardIds.has(scope.cardId)
      ? { kind: "available" }
      : { kind: "unavailable", reference: "card" };
  }

  if (scope.kind === "vocabulary" && scope.cardId && !catalog.cardIds.has(scope.cardId)) {
    return { kind: "unavailable", reference: "card" };
  }

  if (scope.kind === "vocabulary" && !scope.courseId) {
    return { kind: "available" };
  }

  if (scope.kind === "review" && !scope.courseId) {
    return { kind: "available" };
  }

  const course = catalog.courses.find((candidate) => candidate.id === scope.courseId);

  if (!course) {
    return { kind: "unavailable", reference: "course" };
  }

  if (scope.kind === "vocabulary" && scope.cardId) {
    const cardBelongsToCourse = course.units.some((unit) => unit.lessons.some(
      (lesson) => lesson.cardIds.includes(scope.cardId!),
    ));
    return cardBelongsToCourse
      ? { kind: "available" }
      : { kind: "unavailable", reference: "card" };
  }

  if (scope.kind !== "lesson") {
    return { kind: "available" };
  }

  const hasLesson = course.units.some((unit) =>
    unit.lessons.some((lesson) => lesson.id === scope.lessonId));

  return hasLesson
    ? { kind: "available" }
    : { kind: "unavailable", reference: "lesson" };
}

export function resolveReviewCourseFilter(
  requestedCourseId: string | null,
  courses: Course[],
): { courseId: string | null; wasUnavailable: boolean } {
  if (!requestedCourseId || courses.some((course) => course.id === requestedCourseId)) {
    return { courseId: requestedCourseId, wasUnavailable: false };
  }

  return { courseId: null, wasUnavailable: true };
}
