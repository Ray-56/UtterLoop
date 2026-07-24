import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { Course } from "../../domain/curriculum/Course";
import { buildLessonPracticeQueue } from "../../domain/curriculum/buildLessonPracticeQueue";
import { deriveCourseProgress } from "../../domain/curriculum/deriveCourseProgress";
import type { ReviewState } from "../../domain/review/ReviewState";
import { createInitialReviewState, isReviewDue } from "../../domain/review/reviewScheduler";
import { buildPracticeQueue } from "../../domain/training/buildPracticeQueue";
import type { PracticeQueueItem } from "../../domain/training/PracticeQueue";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";

export type PracticeScope =
  | { kind: "lesson"; courseId: string; lessonId: string; mode: "learn" | "replay" }
  | { kind: "review"; courseId?: string }
  | { kind: "vocabulary" }
  | { kind: "course"; courseId: string };

export interface PracticeContext {
  courseId: string;
  courseTitle: string;
  unitId?: string;
  unitTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
  objective?: string;
  passedCards: number;
  totalCards: number;
}

export interface PracticeSession {
  scope: PracticeScope;
  items: PracticeQueueItem[];
  context: PracticeContext | null;
  completed: boolean;
}

export interface BuildPracticeSessionInput {
  scope: PracticeScope;
  courses: Course[];
  cards: SentenceCard[];
  reviewStates: ReviewState[];
  vocabularyEntries: VocabularyEntry[];
  now: Date;
}

export function buildPracticeSession(input: BuildPracticeSessionInput): PracticeSession {
  const scope = input.scope;

  if (scope.kind === "review") {
    const scopedCards = scope.courseId
      ? cardsForCourse(findCourse(input.courses, scope.courseId), input.cards)
      : input.cards;
    const queue = buildPracticeQueue(scopedCards, input.reviewStates, input.now);

    return {
      scope,
      items: queue.due,
      context: null,
      completed: queue.due.length === 0,
    };
  }

  if (scope.kind === "vocabulary") {
    const cardById = new Map(input.cards.map((card) => [card.id, card]));
    const reviewByCardId = new Map(input.reviewStates.map((reviewState) => [reviewState.cardId, reviewState]));
    const items = input.vocabularyEntries.flatMap<PracticeQueueItem>((entry) => {
      const card = cardById.get(entry.cardId);

      if (!card) {
        return [];
      }

      const reviewState = reviewByCardId.get(card.id) ?? createInitialReviewState(card.id, input.now);
      return reviewState.learningStatus === "mastered"
        ? []
        : [{
            card,
            reviewState,
            isDue: isReviewDue(reviewState, input.now),
          }];
    });

    return {
      scope,
      items,
      context: null,
      completed: items.length === 0,
    };
  }

  const course = findCourse(input.courses, scope.courseId);

  if (scope.kind === "course") {
    const courseCards = cardsForCourse(course, input.cards);
    const reviewByCardId = new Map(input.reviewStates.map((reviewState) => [reviewState.cardId, reviewState]));
    const items = courseCards.flatMap<PracticeQueueItem>((card) => {
      const reviewState = reviewByCardId.get(card.id) ?? createInitialReviewState(card.id, input.now);

      return reviewState.learningStatus === "mastered"
        ? []
        : [{
            card,
            reviewState,
            isDue: isReviewDue(reviewState, input.now),
          }];
    });
    const progress = deriveCourseProgress(course, input.reviewStates);

    return {
      scope,
      items,
      context: {
        courseId: course.id,
        courseTitle: course.title,
        passedCards: progress.passedCards,
        totalCards: progress.totalCards,
      },
      completed: items.length === 0,
    };
  }

  const unit = course.units.find((candidate) => candidate.lessons.some((lesson) => lesson.id === scope.lessonId));
  const lesson = unit?.lessons.find((candidate) => candidate.id === scope.lessonId);

  if (!unit || !lesson) {
    throw new Error(`CourseLesson not found in Course ${course.id}: ${scope.lessonId}`);
  }

  const queue = buildLessonPracticeQueue(
    course,
    lesson.id,
    input.cards,
    input.reviewStates,
    input.now,
    scope.mode,
  );
  const progress = deriveCourseProgress(course, input.reviewStates);
  const lessonProgress = progress.units
    .flatMap((unitProgress) => unitProgress.lessons)
    .find((candidate) => candidate.lessonId === lesson.id);

  return {
    scope,
    items: queue.items,
    context: {
      courseId: course.id,
      courseTitle: course.title,
      unitId: unit.id,
      unitTitle: unit.title,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      objective: lesson.objective,
      passedCards: lessonProgress?.passedCards ?? 0,
      totalCards: lesson.cardIds.length,
    },
    completed: queue.completed,
  };
}

function findCourse(courses: Course[], courseId: string): Course {
  const course = courses.find((candidate) => candidate.id === courseId);

  if (!course) {
    throw new Error(`Course not found: ${courseId}`);
  }

  return course;
}

function cardsForCourse(course: Course, cards: SentenceCard[]): SentenceCard[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));

  return course.units.flatMap((unit) => unit.lessons).flatMap((lesson) => lesson.cardIds.map((cardId) => {
    const card = cardById.get(cardId);

    if (!card) {
      throw new Error(`Course ${course.id} references unknown SentenceCard: ${cardId}`);
    }

    return card;
  }));
}
