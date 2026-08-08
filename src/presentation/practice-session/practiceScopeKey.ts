import type { PracticeSessionScope } from "./model";

export function practiceScopeKey(scope: PracticeSessionScope): string {
  switch (scope.kind) {
    case "lesson":
      return `lesson:${escapePart(scope.courseId)}:${escapePart(scope.lessonId)}:${scope.mode}`;
    case "review":
      return `review:${scope.courseId ? escapePart(scope.courseId) : "all"}`;
    case "course":
      return `course:${escapePart(scope.courseId)}`;
    case "focused":
      return `focused:card:${escapePart(scope.cardId)}`;
    case "vocabulary": {
      if (scope.cardId && scope.courseId) {
        return `vocabulary:course:${escapePart(scope.courseId)}:card:${escapePart(scope.cardId)}`;
      }
      if (scope.cardId) return `vocabulary:card:${escapePart(scope.cardId)}`;
      if (scope.courseId) return `vocabulary:course:${escapePart(scope.courseId)}`;
      return "vocabulary:all";
    }
  }
}

function escapePart(value: string): string {
  return encodeURIComponent(value);
}
