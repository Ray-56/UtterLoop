import type { SentenceCard } from "../content/SentenceCard";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import type { ReviewState } from "../review/ReviewState";
import { createInitialReviewState, isReviewDue } from "../review/reviewScheduler";
import type { PracticeQueueItem } from "../training/PracticeQueue";
import type { Course } from "./Course";

export type CourseReplayEmptyReason = "course-missing" | "no-cards" | "all-mastered";

export interface CourseReplayQueueItem extends PracticeQueueItem {
  courseId: string;
  courseTitle: string;
  unitId: string;
  unitTitle: string;
  lessonId: string;
  lessonTitle: string;
  objective: string;
}

export interface CourseReplayQueue {
  items: CourseReplayQueueItem[];
  emptyReason: CourseReplayEmptyReason | null;
}

export function buildCourseReplayQueue(
  course: Course | undefined,
  cards: SentenceCard[],
  reviewStates: ReviewState[],
  _learningStates: SentenceLearningState[],
  now: Date,
): CourseReplayQueue {
  if (!course) {
    return { items: [], emptyReason: "course-missing" };
  }

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const reviewByCardId = new Map(reviewStates.map((state) => [state.cardId, state]));
  const resolvedItems = course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.cardIds.map((cardId) => {
    const card = cardById.get(cardId);

    if (!card) {
      throw new Error(`Course ${course.id} references unknown SentenceCard: ${cardId}`);
    }

    const reviewState = reviewByCardId.get(cardId) ?? createInitialReviewState(cardId, now);

    return {
      card,
      reviewState,
      isDue: isReviewDue(reviewState, now),
      courseId: course.id,
      courseTitle: course.title,
      unitId: unit.id,
      unitTitle: unit.title,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      objective: lesson.objective,
    };
  })));

  const items = resolvedItems.filter((item) => item.reviewState.learningStatus !== "mastered");

  return {
    items,
    emptyReason: resolvedItems.length === 0
      ? "no-cards"
      : items.length === 0
        ? "all-mastered"
        : null,
  };
}
