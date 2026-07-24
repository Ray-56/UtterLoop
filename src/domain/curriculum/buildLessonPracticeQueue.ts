import type { SentenceCard } from "../content/SentenceCard";
import type { ReviewState } from "../review/ReviewState";
import { createInitialReviewState, isReviewDue } from "../review/reviewScheduler";
import type { PracticeQueueItem } from "../training/PracticeQueue";
import type { Course } from "./Course";

export type LessonPracticeMode = "learn" | "replay";

export interface LessonPracticeQueue {
  items: PracticeQueueItem[];
  completed: boolean;
}

export function buildLessonPracticeQueue(
  course: Course,
  lessonId: string,
  cards: SentenceCard[],
  reviewStates: ReviewState[],
  now: Date,
  mode: LessonPracticeMode,
): LessonPracticeQueue {
  const lesson = course.units.flatMap((unit) => unit.lessons).find((candidate) => candidate.id === lessonId);

  if (!lesson) {
    throw new Error(`CourseLesson not found: ${lessonId}`);
  }

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const reviewByCardId = new Map(reviewStates.map((reviewState) => [reviewState.cardId, reviewState]));
  const items = lesson.cardIds.map<PracticeQueueItem>((cardId) => {
    const card = cardById.get(cardId);

    if (!card) {
      throw new Error(`SentenceCard not found for CourseLesson ${lessonId}: ${cardId}`);
    }

    const reviewState = reviewByCardId.get(cardId) ?? createInitialReviewState(cardId, now);

    return {
      card,
      reviewState,
      isDue: isReviewDue(reviewState, now),
    };
  });
  const completed = items.every((item) => hasPassed(item.reviewState));

  const activeItems = items.filter((item) => item.reviewState.learningStatus !== "mastered");

  return {
    items: mode === "learn" ? activeItems.filter((item) => !hasPassed(item.reviewState)) : activeItems,
    completed,
  };
}

function hasPassed(reviewState: ReviewState): boolean {
  return reviewState.stage >= 1 || reviewState.learningStatus === "mastered";
}
