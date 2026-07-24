import type { ReviewState } from "../review/ReviewState";
import type { Course } from "./Course";

export interface CourseProgress {
  courseId: string;
  status: "not-started" | "in-progress" | "completed";
  attemptedCards: number;
  passedCards: number;
  totalCards: number;
  recommendedLessonId: string | null;
  units: UnitProgress[];
}

export interface UnitProgress {
  unitId: string;
  status: CourseProgress["status"];
  attemptedCards: number;
  passedCards: number;
  totalCards: number;
  lessons: LessonProgress[];
}

export interface LessonProgress {
  lessonId: string;
  status: CourseProgress["status"];
  attemptedCards: number;
  passedCards: number;
  totalCards: number;
}

export function deriveCourseProgress(course: Course, reviewStates: ReviewState[]): CourseProgress {
  const reviewByCardId = new Map(reviewStates.map((reviewState) => [reviewState.cardId, reviewState]));
  const units = course.units.map<UnitProgress>((unit) => {
    const lessons = unit.lessons.map<LessonProgress>((lesson) => {
      const cardStates = lesson.cardIds.map((cardId) => reviewByCardId.get(cardId));
      const attemptedCards = cardStates.filter(isAttempted).length;
      const passedCards = cardStates.filter(isPassed).length;

      return {
        lessonId: lesson.id,
        status: statusForCounts(attemptedCards, passedCards, lesson.cardIds.length),
        attemptedCards,
        passedCards,
        totalCards: lesson.cardIds.length,
      };
    });
    const totals = sumLessonProgress(lessons);

    return {
      unitId: unit.id,
      status: statusForCounts(totals.attemptedCards, totals.passedCards, totals.totalCards),
      ...totals,
      lessons,
    };
  });
  const totals = units.reduce(
    (sum, unit) => ({
      attemptedCards: sum.attemptedCards + unit.attemptedCards,
      passedCards: sum.passedCards + unit.passedCards,
      totalCards: sum.totalCards + unit.totalCards,
    }),
    { attemptedCards: 0, passedCards: 0, totalCards: 0 },
  );
  const recommendedLessonId = units
    .flatMap((unit) => unit.lessons)
    .find((lesson) => lesson.status !== "completed")?.lessonId ?? null;

  return {
    courseId: course.id,
    status: statusForCounts(totals.attemptedCards, totals.passedCards, totals.totalCards),
    ...totals,
    recommendedLessonId,
    units,
  };
}

function isPassed(reviewState: ReviewState | undefined): boolean {
  return Boolean(reviewState && (reviewState.stage >= 1 || reviewState.learningStatus === "mastered"));
}

function isAttempted(reviewState: ReviewState | undefined): boolean {
  return Boolean(reviewState && (reviewState.lastReviewedAt || isPassed(reviewState)));
}

function statusForCounts(
  attemptedCards: number,
  passedCards: number,
  totalCards: number,
): CourseProgress["status"] {
  if (totalCards > 0 && passedCards === totalCards) {
    return "completed";
  }

  return attemptedCards > 0 || passedCards > 0 ? "in-progress" : "not-started";
}

function sumLessonProgress(lessons: LessonProgress[]) {
  return lessons.reduce(
    (sum, lesson) => ({
      attemptedCards: sum.attemptedCards + lesson.attemptedCards,
      passedCards: sum.passedCards + lesson.passedCards,
      totalCards: sum.totalCards + lesson.totalCards,
    }),
    { attemptedCards: 0, passedCards: 0, totalCards: 0 },
  );
}
