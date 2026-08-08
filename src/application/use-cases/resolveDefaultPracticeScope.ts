import type { Course } from "../../domain/curriculum/Course";
import type { ReviewState } from "../../domain/review/ReviewState";
import type { PracticeScope } from "./buildPracticeSession";

export interface ResolveDefaultPracticeScopeInput {
  explicitScope: PracticeScope | null;
  activeScope?: PracticeScope | null;
  reviewStates: readonly ReviewState[];
  pathProgress: ReadonlyArray<{
    recommendedCourseId: string | null;
    recommendedLessonId: string | null;
  }>;
  courses: readonly Course[];
  now: Date;
}

export function resolveDefaultPracticeScope(
  input: ResolveDefaultPracticeScopeInput,
): PracticeScope | null {
  if (input.explicitScope) {
    return input.explicitScope;
  }

  if (input.activeScope) {
    return input.activeScope;
  }

  const hasDueReview = input.reviewStates.some((state) => (
    state.learningStatus !== "mastered"
    && Date.parse(state.dueAt) <= input.now.getTime()
  ));

  if (hasDueReview) {
    return { kind: "review" };
  }

  const recommendation = input.pathProgress.find((path) => path.recommendedLessonId);
  if (recommendation?.recommendedCourseId && recommendation.recommendedLessonId) {
    return {
      kind: "lesson",
      courseId: recommendation.recommendedCourseId,
      lessonId: recommendation.recommendedLessonId,
      mode: "learn",
    };
  }

  const firstCourse = input.courses[0];
  const firstLesson = firstCourse?.units[0]?.lessons[0];
  return firstCourse && firstLesson
    ? {
        kind: "lesson",
        courseId: firstCourse.id,
        lessonId: firstLesson.id,
        mode: "replay",
      }
    : null;
}
