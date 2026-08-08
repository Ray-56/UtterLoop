import type { SentenceCard } from "../../domain/content/SentenceCard";
import { inspectSentenceCardRecallSafety } from "../../domain/content/inspectSentenceCardRecallSafety";
import type { Course } from "../../domain/curriculum/Course";
import { buildLessonPracticeQueue } from "../../domain/curriculum/buildLessonPracticeQueue";
import { deriveCourseProgress } from "../../domain/curriculum/deriveCourseProgress";
import type { ReviewState } from "../../domain/review/ReviewState";
import { createInitialReviewState, isReviewDue } from "../../domain/review/reviewScheduler";
import { buildPracticeQueue } from "../../domain/training/buildPracticeQueue";
import type { PracticeQueueItem } from "../../domain/training/PracticeQueue";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type {
  PracticePhase,
  RecallSupportKind,
  RecallSupportLevel,
} from "../../domain/practice/PracticeTurn";
import type { PracticeQueueReason } from "../../domain/practice/PracticeSessionEvidence";
import {
  buildCourseReplayQueue,
  type CourseReplayEmptyReason,
} from "../../domain/curriculum/buildCourseReplayQueue";

export type PracticeScope =
  | { kind: "lesson"; courseId: string; lessonId: string; mode: "learn" | "replay" }
  | { kind: "review"; courseId?: string }
  | { kind: "vocabulary"; cardId?: string; courseId?: string }
  | { kind: "course"; courseId: string }
  | { kind: "focused"; cardId: string };

export interface PracticeOccurrenceContext {
  courseId: string;
  courseTitle: string;
  unitId: string;
  unitTitle: string;
  lessonId: string;
  lessonTitle: string;
  objective: string;
}

export interface PracticeSessionItem extends PracticeQueueItem {
  occurrenceContext?: PracticeOccurrenceContext;
  initialPhase?: PracticePhase;
  initialSupportLevel?: RecallSupportLevel;
  initialSupportKinds?: RecallSupportKind[];
  queueReason: PracticeQueueReason;
  scheduledReviewDueAt?: string;
}

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
  items: PracticeSessionItem[];
  blockedCardIds: string[];
  context: PracticeContext | null;
  completed: boolean;
  emptyReason:
    | CourseReplayEmptyReason
    | "blocked-content"
    | "no-due"
    | "no-vocabulary"
    | "lesson-complete"
    | "lesson-pending"
    | "focused-card-missing"
    | "focused-card-mastered"
    | "focused-card-ineligible"
    | "focused-card-not-weak"
    | null;
}

export interface BuildPracticeSessionInput {
  scope: PracticeScope;
  courses: Course[];
  cards: SentenceCard[];
  reviewStates: ReviewState[];
  learningStates: SentenceLearningState[];
  vocabularyEntries: VocabularyEntry[];
  weakCardIds?: ReadonlySet<string>;
  now: Date;
}

export function buildPracticeSession(input: BuildPracticeSessionInput): PracticeSession {
  const scope = input.scope;
  const learningStates = input.learningStates;

  if (scope.kind === "focused") {
    const card = input.cards.find((candidate) => candidate.id === scope.cardId);
    const reviewState = input.reviewStates.find((state) => state.cardId === scope.cardId);
    const learningState = learningStates.find((state) => state.cardId === scope.cardId);
    const emptyReason = !card
      ? "focused-card-missing" as const
      : !inspectSentenceCardRecallSafety(card).safe
        ? "blocked-content" as const
        : reviewState?.learningStatus === "mastered"
          ? "focused-card-mastered" as const
          : !learningState?.firstPassedAt || !reviewState
            ? "focused-card-ineligible" as const
            : !input.weakCardIds?.has(scope.cardId)
              ? "focused-card-not-weak" as const
              : null;

    return emptyReason || !card || !reviewState
      ? {
          scope,
          items: [],
          blockedCardIds: emptyReason === "blocked-content" ? [scope.cardId] : [],
          context: null,
          completed: true,
          emptyReason,
        }
      : {
          scope,
          items: [{
            card,
            reviewState,
            isDue: isReviewDue(reviewState, input.now),
            initialPhase: "voluntary-practice",
            queueReason: "focused-practice",
          }],
          blockedCardIds: [],
          context: null,
          completed: false,
          emptyReason: null,
        };
  }

  if (scope.kind === "review") {
    const scopedCards = scope.courseId
      ? cardsForCourse(findCourse(input.courses, scope.courseId), input.cards)
      : input.cards;
    const queue = buildPracticeQueue(scopedCards, input.reviewStates, input.now);
    const reviewItems: PracticeSessionItem[] = queue.due.map((item) => ({
      ...item,
      queueReason: "due-review",
      scheduledReviewDueAt: item.reviewState.dueAt,
    }));
    const quarantined = quarantineUnsafeItems(reviewItems);

    return {
      scope,
      items: quarantined.items,
      blockedCardIds: quarantined.blockedCardIds,
      context: null,
      completed: quarantined.items.length === 0,
      emptyReason: queue.due.length === 0
        ? "no-due"
        : quarantined.items.length === 0
          ? "blocked-content"
          : null,
    };
  }

  if (scope.kind === "vocabulary") {
    const cardById = new Map(input.cards.map((card) => [card.id, card]));
    const reviewByCardId = new Map(input.reviewStates.map((reviewState) => [reviewState.cardId, reviewState]));
    const courseCardIds = scope.courseId
      ? new Set(cardsForCourse(findCourse(input.courses, scope.courseId), input.cards).map((card) => card.id))
      : null;
    const items = input.vocabularyEntries.flatMap<PracticeSessionItem>((entry) => {
      if ((scope.cardId && entry.cardId !== scope.cardId) || (courseCardIds && !courseCardIds.has(entry.cardId))) {
        return [];
      }
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
            queueReason: "voluntary-practice",
          }];
    });

    const quarantined = quarantineUnsafeItems(items);

    return {
      scope,
      items: quarantined.items,
      blockedCardIds: quarantined.blockedCardIds,
      context: null,
      completed: quarantined.items.length === 0,
      emptyReason: items.length === 0
        ? "no-vocabulary"
        : quarantined.items.length === 0
          ? "blocked-content"
          : null,
    };
  }

  if (scope.kind === "course") {
    const course = input.courses.find((candidate) => candidate.id === scope.courseId);
    const replay = buildCourseReplayQueue(
      course,
      input.cards,
      input.reviewStates,
      learningStates,
      input.now,
    );
    const replayItems: PracticeSessionItem[] = replay.items.map((item) => ({
      card: item.card,
      reviewState: item.reviewState,
      isDue: item.isDue,
      queueReason: "voluntary-practice",
      occurrenceContext: {
        courseId: item.courseId,
        courseTitle: item.courseTitle,
        unitId: item.unitId,
        unitTitle: item.unitTitle,
        lessonId: item.lessonId,
        lessonTitle: item.lessonTitle,
        objective: item.objective,
      },
    }));
    const quarantined = quarantineUnsafeItems(replayItems);
    const items = quarantined.items;
    const progress = course ? deriveCourseProgress(course, learningStates) : null;

    return {
      scope,
      items,
      blockedCardIds: quarantined.blockedCardIds,
      context: course && progress ? {
        courseId: course.id,
        courseTitle: course.title,
        passedCards: progress.passedCards,
        totalCards: progress.totalCards,
      } : null,
      completed: items.length === 0,
      emptyReason: replay.items.length > 0 && items.length === 0
        ? "blocked-content"
        : replay.emptyReason,
    };
  }

  const course = findCourse(input.courses, scope.courseId);

  const unit = course.units.find((candidate) => candidate.lessons.some((lesson) => lesson.id === scope.lessonId));
  const lesson = unit?.lessons.find((candidate) => candidate.id === scope.lessonId);

  if (!unit || !lesson) {
    throw new Error(`CourseLesson not found in Course ${course.id}: ${scope.lessonId}`);
  }

  const queue = buildLessonPracticeQueue(
    course,
    lesson.id,
    input.cards,
    learningStates,
    input.reviewStates,
    input.now,
    scope.mode,
  );
  const progress = deriveCourseProgress(course, learningStates);
  const lessonProgress = progress.units
    .flatMap((unitProgress) => unitProgress.lessons)
    .find((candidate) => candidate.lessonId === lesson.id);

  const lessonItems: PracticeSessionItem[] = queue.items.map((item) => ({
    ...item,
    queueReason: scope.mode === "learn" ? "new-learning" : "voluntary-practice",
    occurrenceContext: {
      courseId: course.id,
      courseTitle: course.title,
      unitId: unit.id,
      unitTitle: unit.title,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      objective: lesson.objective,
    },
  }));
  const quarantined = quarantineUnsafeItems(lessonItems);

  return {
    scope,
    items: quarantined.items,
    blockedCardIds: quarantined.blockedCardIds,
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
    completed: queue.items.length > 0 && quarantined.items.length === 0
      ? true
      : queue.completed,
    emptyReason: queue.items.length > 0 && quarantined.items.length === 0
      ? "blocked-content"
      : queue.items.length === 0
        ? queue.completed ? "lesson-complete" : "lesson-pending"
        : null,
  };
}

function quarantineUnsafeItems<T extends PracticeQueueItem>(items: readonly T[]): {
  items: T[];
  blockedCardIds: string[];
} {
  const safeItems: T[] = [];
  const blockedCardIds = new Set<string>();

  for (const item of items) {
    if (inspectSentenceCardRecallSafety(item.card).safe) {
      safeItems.push(item);
    } else {
      blockedCardIds.add(item.card.id);
    }
  }

  return { items: safeItems, blockedCardIds: [...blockedCardIds] };
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
