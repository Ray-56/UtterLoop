import type { PracticeScope } from "../application/use-cases/buildPracticeSession";

const PRACTICE_KINDS = new Set<PracticeScope["kind"]>([
  "lesson",
  "review",
  "vocabulary",
  "course",
  "focused",
]);

export function parsePracticeScopeUrl(search: string): PracticeScope | null {
  const parameters = new URLSearchParams(search);
  const kindValue = parameters.get("practice");
  const kind = kindValue && PRACTICE_KINDS.has(kindValue as PracticeScope["kind"])
    ? kindValue as PracticeScope["kind"]
    : null;

  if (!kind) {
    return null;
  }

  const courseId = textOrNull(parameters.get("practiceCourse"));

  if (kind === "lesson") {
    const lessonId = textOrNull(parameters.get("practiceLesson"));
    const mode = parameters.get("practiceMode");
    return courseId && lessonId && (mode === "learn" || mode === "replay")
      ? { kind, courseId, lessonId, mode }
      : null;
  }

  if (kind === "review") {
    return courseId ? { kind, courseId } : { kind };
  }

  if (kind === "course") {
    return courseId ? { kind, courseId } : null;
  }

  if (kind === "focused") {
    const cardId = textOrNull(parameters.get("practiceCard"));
    return cardId ? { kind, cardId } : null;
  }

  return { kind: "vocabulary" };
}

export function buildPracticeScopeUrl(scope: PracticeScope): string {
  const parameters = new URLSearchParams();
  parameters.set("view", "practice");
  parameters.set("practice", scope.kind);

  if (scope.kind === "lesson") {
    parameters.set("practiceCourse", scope.courseId);
    parameters.set("practiceLesson", scope.lessonId);
    parameters.set("practiceMode", scope.mode);
  } else if (scope.kind === "course") {
    parameters.set("practiceCourse", scope.courseId);
  } else if (scope.kind === "review" && scope.courseId) {
    parameters.set("practiceCourse", scope.courseId);
  } else if (scope.kind === "focused") {
    parameters.set("practiceCard", scope.cardId);
  }

  return `?${parameters.toString()}`;
}

export function removePracticeScopeFromUrl(search: string): string {
  const parameters = new URLSearchParams(search);
  parameters.delete("practice");
  parameters.delete("practiceCourse");
  parameters.delete("practiceLesson");
  parameters.delete("practiceMode");
  parameters.delete("practiceCard");
  return `?${parameters.toString()}`;
}

function textOrNull(value: string | null): string | null {
  return value?.trim() || null;
}
