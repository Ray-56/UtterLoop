import type { SentenceCard, SentenceCardId } from "../content/SentenceCard";
import {
  projectRecallSafePrompt,
  type RecallContentSafety,
} from "../content/inspectSentenceCardRecallSafety";
import type { Course } from "../curriculum/Course";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import type { VocabularyEntry } from "../vocabulary/VocabularyEntry";
import type { MasteryStage, ReviewState } from "./ReviewState";

export type ReviewReadiness = "acquisition" | "retention";

export interface ReviewDashboardItem {
  cardId: SentenceCardId;
  prompt: string;
  contentSafety: RecallContentSafety;
  courseIds: string[];
  courseTitles: string[];
  source: string;
  stage: MasteryStage;
  dueAt: string;
  isDue: boolean;
  readiness: ReviewReadiness;
  isInVocabulary: boolean;
}

export interface MasteredDashboardItem {
  cardId: SentenceCardId;
  prompt: string;
  contentSafety: RecallContentSafety;
  courseIds: string[];
  courseTitles: string[];
  source: string;
  masteredAt?: string;
  isInVocabulary: boolean;
}

export interface VocabularyDashboardItem {
  cardId: SentenceCardId;
  prompt: string;
  contentSafety: RecallContentSafety;
  courseIds: string[];
  courseTitles: string[];
  source: string;
  savedAt: string;
  isMastered: boolean;
}

export interface ReviewDashboard {
  selectedCourseId: string | null;
  courseOptions: Array<{
    courseId: string;
    title: string;
    dueCount: number;
    upcomingCount: number;
  }>;
  due: ReviewDashboardItem[];
  upcoming: ReviewDashboardItem[];
  mastered: MasteredDashboardItem[];
  vocabulary: VocabularyDashboardItem[];
}

export interface BuildReviewDashboardInput {
  cards: SentenceCard[];
  courses: Course[];
  learningStates: SentenceLearningState[];
  reviewStates: ReviewState[];
  vocabularyEntries: VocabularyEntry[];
  selectedCourseId: string | null;
}

interface CourseMembership {
  courseIds: string[];
  courseTitles: string[];
  firstCourseIndex: number;
}

const UNCATEGORIZED_LABEL = "Imported / uncategorized";

export function buildReviewDashboard(
  input: BuildReviewDashboardInput,
  now: Date,
): ReviewDashboard {
  const cardById = new Map(input.cards.map((card) => [card.id, card]));
  const reviewByCardId = new Map(input.reviewStates.map((state) => [state.cardId, state]));
  const learningByCardId = new Map(input.learningStates.map((state) => [state.cardId, state]));
  const vocabularyByCardId = new Map(input.vocabularyEntries.map((entry) => [entry.cardId, entry]));
  const memberships = buildMemberships(input.cards, input.courses);
  const selectedCourseId = input.selectedCourseId
    && input.courses.some((course) => course.id === input.selectedCourseId)
    ? input.selectedCourseId
    : null;
  const isSelected = (cardId: SentenceCardId) => {
    return !selectedCourseId || memberships.get(cardId)?.courseIds.includes(selectedCourseId);
  };

  const reviewItems = input.reviewStates.flatMap<ReviewDashboardItem>((reviewState) => {
    const card = cardById.get(reviewState.cardId);
    if (!card || reviewState.learningStatus === "mastered" || !isSelected(card.id)) {
      return [];
    }

    const membership = requireMembership(memberships, card.id);
    const isDue = new Date(reviewState.dueAt).getTime() <= now.getTime();
    return [{
      cardId: card.id,
      ...projectRecallSafePrompt(card),
      courseIds: membership.courseIds,
      courseTitles: membership.courseTitles,
      source: card.source,
      stage: reviewState.stage,
      dueAt: reviewState.dueAt,
      isDue,
      readiness: learningByCardId.get(card.id)?.firstPassedAt ? "retention" : "acquisition",
      isInVocabulary: vocabularyByCardId.has(card.id),
    }];
  }).sort((left, right) => compareReviewItems(left, right, memberships));

  const mastered = input.reviewStates.flatMap<MasteredDashboardItem>((reviewState) => {
    const card = cardById.get(reviewState.cardId);
    if (!card || reviewState.learningStatus !== "mastered" || !isSelected(card.id)) {
      return [];
    }

    const membership = requireMembership(memberships, card.id);
    return [{
      cardId: card.id,
      ...projectRecallSafePrompt(card),
      courseIds: membership.courseIds,
      courseTitles: membership.courseTitles,
      source: card.source,
      isInVocabulary: vocabularyByCardId.has(card.id),
    }];
  }).sort((left, right) => compareManagementItems(left, right, memberships));

  const vocabulary = input.vocabularyEntries.flatMap<VocabularyDashboardItem>((entry) => {
    const card = cardById.get(entry.cardId);
    if (!card || !isSelected(card.id)) {
      return [];
    }

    const membership = requireMembership(memberships, card.id);
    return [{
      cardId: card.id,
      ...projectRecallSafePrompt(card),
      courseIds: membership.courseIds,
      courseTitles: membership.courseTitles,
      source: card.source,
      savedAt: entry.savedAt,
      isMastered: reviewByCardId.get(card.id)?.learningStatus === "mastered",
    }];
  }).sort((left, right) => {
    const savedDifference = new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime();
    return savedDifference || compareManagementItems(left, right, memberships);
  });

  const activityCardIds = new Set<string>([
    ...input.reviewStates.map((state) => state.cardId),
    ...input.vocabularyEntries.map((entry) => entry.cardId),
  ]);
  const unfilteredReviewItems = buildUnfilteredReviewItems(
    input,
    now,
    cardById,
    learningByCardId,
    vocabularyByCardId,
    memberships,
  );

  return {
    selectedCourseId,
    courseOptions: input.courses.flatMap((course) => {
      const courseCardIds = new Set(flattenCourseCardIds(course));
      if (![...activityCardIds].some((cardId) => courseCardIds.has(cardId))) {
        return [];
      }

      const scoped = unfilteredReviewItems.filter((item) => item.courseIds.includes(course.id));
      return [{
        courseId: course.id,
        title: course.title,
        dueCount: scoped.filter((item) => item.isDue).length,
        upcomingCount: scoped.filter((item) => !item.isDue).length,
      }];
    }),
    due: reviewItems.filter((item) => item.isDue),
    upcoming: reviewItems.filter((item) => !item.isDue),
    mastered,
    vocabulary,
  };
}

export function filterReviewDashboard(
  dashboard: ReviewDashboard,
  selectedCourseId: string | null,
): ReviewDashboard {
  if (!selectedCourseId) {
    return dashboard.selectedCourseId === null
      ? dashboard
      : { ...dashboard, selectedCourseId: null };
  }

  if (!dashboard.courseOptions.some((option) => option.courseId === selectedCourseId)) {
    return dashboard;
  }

  const inCourse = (item: { courseIds: string[] }) => item.courseIds.includes(selectedCourseId);
  return {
    ...dashboard,
    selectedCourseId,
    due: dashboard.due.filter(inCourse),
    upcoming: dashboard.upcoming.filter(inCourse),
    mastered: dashboard.mastered.filter(inCourse),
    vocabulary: dashboard.vocabulary.filter(inCourse),
  };
}

function buildUnfilteredReviewItems(
  input: BuildReviewDashboardInput,
  now: Date,
  cardById: Map<string, SentenceCard>,
  learningByCardId: Map<string, SentenceLearningState>,
  vocabularyByCardId: Map<string, VocabularyEntry>,
  memberships: Map<string, CourseMembership>,
): ReviewDashboardItem[] {
  return input.reviewStates.flatMap<ReviewDashboardItem>((reviewState) => {
    const card = cardById.get(reviewState.cardId);
    if (!card || reviewState.learningStatus === "mastered") {
      return [];
    }

    const membership = requireMembership(memberships, card.id);
    const isDue = new Date(reviewState.dueAt).getTime() <= now.getTime();
    return [{
      cardId: card.id,
      ...projectRecallSafePrompt(card),
      courseIds: membership.courseIds,
      courseTitles: membership.courseTitles,
      source: card.source,
      stage: reviewState.stage,
      dueAt: reviewState.dueAt,
      isDue,
      readiness: learningByCardId.get(card.id)?.firstPassedAt ? "retention" : "acquisition",
      isInVocabulary: vocabularyByCardId.has(card.id),
    }];
  });
}

function buildMemberships(cards: SentenceCard[], courses: Course[]): Map<string, CourseMembership> {
  const memberships = new Map<string, CourseMembership>(cards.map((card) => [card.id, {
    courseIds: [],
    courseTitles: [],
    firstCourseIndex: Number.MAX_SAFE_INTEGER,
  }]));

  courses.forEach((course, courseIndex) => {
    for (const cardId of flattenCourseCardIds(course)) {
      const membership = memberships.get(cardId);
      if (!membership || membership.courseIds.includes(course.id)) {
        continue;
      }
      membership.courseIds.push(course.id);
      membership.courseTitles.push(course.title);
      membership.firstCourseIndex = Math.min(membership.firstCourseIndex, courseIndex);
    }
  });

  for (const membership of memberships.values()) {
    if (membership.courseTitles.length === 0) {
      membership.courseTitles.push(UNCATEGORIZED_LABEL);
    }
  }

  return memberships;
}

function flattenCourseCardIds(course: Course): string[] {
  return course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.cardIds));
}

function requireMembership(
  memberships: Map<string, CourseMembership>,
  cardId: string,
): CourseMembership {
  return memberships.get(cardId) ?? {
    courseIds: [],
    courseTitles: [UNCATEGORIZED_LABEL],
    firstCourseIndex: Number.MAX_SAFE_INTEGER,
  };
}

function compareReviewItems(
  left: ReviewDashboardItem,
  right: ReviewDashboardItem,
  memberships: Map<string, CourseMembership>,
): number {
  const dueDifference = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
  if (dueDifference) {
    return dueDifference;
  }

  const stageDifference = left.stage - right.stage;
  if (stageDifference) {
    return stageDifference;
  }

  return compareManagementItems(left, right, memberships);
}

function compareManagementItems(
  left: Pick<ReviewDashboardItem, "cardId">,
  right: Pick<ReviewDashboardItem, "cardId">,
  memberships: Map<string, CourseMembership>,
): number {
  const courseDifference = requireMembership(memberships, left.cardId).firstCourseIndex
    - requireMembership(memberships, right.cardId).firstCourseIndex;
  return courseDifference || left.cardId.localeCompare(right.cardId);
}
