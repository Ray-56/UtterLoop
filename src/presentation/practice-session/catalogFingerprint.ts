import type { Course } from "../../domain/curriculum/Course";
import type { PracticeSessionCatalog, PracticeSessionScope } from "./model";
import { practiceScopeKey } from "./practiceScopeKey";

export function catalogFingerprint(scope: PracticeSessionScope, catalog: PracticeSessionCatalog): string {
  const descriptor = {
    version: 1,
    scope: practiceScopeKey(scope),
    courses: referencedCourses(scope, catalog).map(courseDescriptor),
    cards: referencedCards(scope, catalog).map((card) => [card.id, card.updatedAt]),
  };
  return `v1-${fnv1a(JSON.stringify(descriptor))}`;
}

function referencedCourses(scope: PracticeSessionScope, catalog: PracticeSessionCatalog): Course[] {
  if (scope.kind === "focused") {
    if (!catalog.cards.some((card) => card.id === scope.cardId)) {
      throw new Error(`Practice scope references missing Card: ${scope.cardId}`);
    }
    return [];
  }

  const selectedCourseId = scope.courseId;
  if (selectedCourseId) {
    const course = catalog.courses.find((candidate) => candidate.id === selectedCourseId);
    if (!course) throw new Error(`Practice scope references missing Course: ${selectedCourseId}`);
    if (scope.kind === "lesson" && !course.units.some((unit) => unit.lessons.some((lesson) => lesson.id === scope.lessonId))) {
      throw new Error(`Practice scope references missing Lesson: ${scope.lessonId}`);
    }
    return [course];
  }

  if (scope.kind === "vocabulary" && scope.cardId) {
    if (!catalog.cards.some((card) => card.id === scope.cardId)) {
      throw new Error(`Practice scope references missing Card: ${scope.cardId}`);
    }
    return [...catalog.courses]
      .filter((course) => course.units.some((unit) => unit.lessons.some((lesson) => lesson.cardIds.includes(scope.cardId!))))
      .sort(compareIds);
  }

  return [...catalog.courses].sort(compareIds);
}

function referencedCards(scope: PracticeSessionScope, catalog: PracticeSessionCatalog) {
  const cardById = new Map(catalog.cards.map((card) => [card.id, card]));
  if (scope.kind === "focused") {
    const card = cardById.get(scope.cardId);
    if (!card) throw new Error(`Practice scope references missing Card: ${scope.cardId}`);
    return [card];
  }
  if (scope.kind === "vocabulary" && scope.cardId) {
    const card = cardById.get(scope.cardId);
    if (!card) throw new Error(`Practice scope references missing Card: ${scope.cardId}`);
    return [card];
  }

  const courses = referencedCourses(scope, catalog);
  const orderedIds = courses.flatMap((course) => course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.cardIds)));
  const ids = orderedIds.length > 0 ? orderedIds : catalog.cards.map((card) => card.id).sort();
  return ids.map((id) => {
    const card = cardById.get(id);
    if (!card) throw new Error(`Practice catalog references missing Card: ${id}`);
    return card;
  });
}

function courseDescriptor(course: Course) {
  return {
    id: course.id,
    revision: course.revision,
    units: course.units.map((unit) => ({
      id: unit.id,
      lessons: unit.lessons.map((lesson) => ({ id: lesson.id, cardIds: lesson.cardIds })),
    })),
  };
}

function compareIds(left: Course, right: Course): number {
  return left.id.localeCompare(right.id);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
