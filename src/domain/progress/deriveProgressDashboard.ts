import type { SentenceCard } from "../content/SentenceCard";
import {
  projectRecallSafePrompt,
  type RecallContentSafety,
} from "../content/inspectSentenceCardRecallSafety";
import type { Course, LearningPath } from "../curriculum/Course";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import type { MasteryStage, ReviewState } from "../review/ReviewState";
import { enumerateCalendarDays, localDateKey } from "./localCalendar";
import type {
  CardPracticeStatistics,
  DailyPracticeStatistics,
  PracticeStatistics,
  ProgressAttemptOutcome,
} from "./practiceStatistics";

export interface ProgressDashboardInput {
  cards: SentenceCard[];
  courses: Course[];
  learningPaths: LearningPath[];
  learningStates: SentenceLearningState[];
  reviewStates: ReviewState[];
  statistics: PracticeStatistics;
}

export interface ProgressCoverageNode {
  id: string;
  title: string;
  passedCards: number;
  totalCards: number;
}

export interface LessonCoverage extends ProgressCoverageNode {}

export interface UnitCoverage extends ProgressCoverageNode {
  lessons: LessonCoverage[];
}

export interface CourseCoverage extends ProgressCoverageNode {
  units: UnitCoverage[];
}

export interface LearningPathCoverage extends ProgressCoverageNode {
  courses: CourseCoverage[];
}

export interface MasteryDistribution {
  untouched: number;
  acquiring: number;
  stage0FocusedReview: number;
  stage1: number;
  stage2: number;
  stage3: number;
  stage4: number;
  stage5: number;
  stage6: number;
  mastered: number;
}

export interface ProgressTrendDay extends DailyPracticeStatistics {
  firstPassCount: number;
}

export interface WeakCard {
  cardId: string;
  prompt: string;
  contentSafety: RecallContentSafety;
  courseId: string | null;
  courseTitle: string;
  stage: MasteryStage;
  lapseCount: number;
  recentNonPerfectChecks: number;
  independentAccuracy: number | null;
  recentResult: ProgressAttemptOutcome | null;
  mostRecentCheckAt: string | null;
  dueAt: string;
}

export interface ProgressDashboard {
  timeZone: string;
  hasPracticeData: boolean;
  overview: {
    firstPassed: number;
    totalCards: number;
    dueNow: number;
    independentAccuracy: number | null;
    currentStreak: number;
  };
  coverage: {
    paths: LearningPathCoverage[];
    courses: CourseCoverage[];
  };
  retention: {
    masteryDistribution: MasteryDistribution;
    allTime: PracticeStatistics["allTime"];
    longestStreak: number;
    trend: ProgressTrendDay[];
  };
  needsAttention: {
    weakCards: WeakCard[];
    isEmpty: boolean;
  };
  integrityWarnings: string[];
}

export function deriveProgressDashboard(
  input: ProgressDashboardInput,
  now: Date,
  timeZone: string,
): ProgressDashboard {
  localDateKey(now, timeZone);
  const learningByCard = new Map(input.learningStates.map((state) => [state.cardId, state]));
  const reviewByCard = new Map(input.reviewStates.map((state) => [state.cardId, state]));
  const statisticsByCard = new Map(input.statistics.byCard.map((value) => [value.cardId, value]));
  const passedCardIds = new Set(
    input.learningStates.filter((state) => state.firstPassedAt).map((state) => state.cardId),
  );
  const courseCoverage = input.courses.map((course) => deriveCourseCoverage(course, passedCardIds));
  const courseCoverageById = new Map(courseCoverage.map((course) => [course.id, course]));
  const integrityWarnings: string[] = [];
  const masteryDistribution = emptyMasteryDistribution();

  for (const card of input.cards) {
    const learningState = learningByCard.get(card.id);
    const reviewState = reviewByCard.get(card.id);
    if (reviewState?.learningStatus === "mastered") {
      masteryDistribution.mastered += 1;
    } else if (learningState?.firstPassedAt) {
      if (!reviewState) {
        integrityWarnings.push(`First-passed Card ${card.id} is missing ReviewState.`);
      } else {
        incrementStage(masteryDistribution, reviewState.stage);
      }
    } else if (learningState?.introducedAt || reviewState) {
      masteryDistribution.acquiring += 1;
    } else {
      masteryDistribution.untouched += 1;
    }
  }

  const nowMs = now.getTime();
  const dueNow = input.reviewStates.filter(
    (state) => state.learningStatus !== "mastered" && new Date(state.dueAt).getTime() <= nowMs,
  ).length;
  const streaks = deriveStreaks(input.statistics.qualifyingPracticeDates, now, timeZone);
  const trend = deriveTrend(input, now, timeZone);
  const weakCards = deriveWeakCards(
    input.cards,
    input.courses,
    learningByCard,
    reviewByCard,
    statisticsByCard,
  );

  return {
    timeZone,
    hasPracticeData: input.statistics.allTime.totalEvents > 0,
    overview: {
      firstPassed: passedCardIds.size,
      totalCards: input.cards.length,
      dueNow,
      independentAccuracy: input.statistics.allTime.independentAccuracy,
      currentStreak: streaks.current,
    },
    coverage: {
      paths: input.learningPaths.map((path) => {
        const courses = path.courseIds.map((courseId) => {
          const coverage = courseCoverageById.get(courseId);
          if (!coverage) {
            throw new Error(`LearningPath ${path.id} references unknown Course: ${courseId}`);
          }
          return coverage;
        });
        return {
          id: path.id,
          title: path.title,
          passedCards: sum(courses.map((course) => course.passedCards)),
          totalCards: sum(courses.map((course) => course.totalCards)),
          courses,
        };
      }),
      courses: courseCoverage,
    },
    retention: {
      masteryDistribution,
      allTime: input.statistics.allTime,
      longestStreak: streaks.longest,
      trend,
    },
    needsAttention: { weakCards, isEmpty: weakCards.length === 0 },
    integrityWarnings,
  };
}

function deriveCourseCoverage(course: Course, passed: Set<string>): CourseCoverage {
  const units = course.units.map<UnitCoverage>((unit) => {
    const lessons = unit.lessons.map<LessonCoverage>((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      passedCards: lesson.cardIds.filter((cardId) => passed.has(cardId)).length,
      totalCards: lesson.cardIds.length,
    }));
    return {
      id: unit.id,
      title: unit.title,
      passedCards: sum(lessons.map((lesson) => lesson.passedCards)),
      totalCards: sum(lessons.map((lesson) => lesson.totalCards)),
      lessons,
    };
  });
  return {
    id: course.id,
    title: course.title,
    passedCards: sum(units.map((unit) => unit.passedCards)),
    totalCards: sum(units.map((unit) => unit.totalCards)),
    units,
  };
}

function deriveTrend(
  input: ProgressDashboardInput,
  now: Date,
  timeZone: string,
): ProgressTrendDay[] {
  const statisticsByDate = new Map(input.statistics.daily.map((day) => [day.date, day]));
  const firstPasses = new Map<string, number>();
  for (const state of input.learningStates) {
    if (!state.firstPassedAt) continue;
    const date = localDateKey(state.firstPassedAt, timeZone);
    firstPasses.set(date, (firstPasses.get(date) ?? 0) + 1);
  }

  return enumerateCalendarDays(localDateKey(now, timeZone), 14).map((date) => {
    const day = statisticsByDate.get(date);
    return {
      date,
      practiceAttempts: day?.practiceAttempts ?? 0,
      nonVoluntaryAttempts: day?.nonVoluntaryAttempts ?? 0,
      retrievalChecks: day?.retrievalChecks ?? 0,
      perfectRecalls: day?.perfectRecalls ?? 0,
      averageIndependentAccuracy: day?.averageIndependentAccuracy ?? null,
      firstPassCount: firstPasses.get(date) ?? 0,
    };
  });
}

function deriveStreaks(
  practiceDates: string[],
  now: Date,
  timeZone: string,
): { current: number; longest: number } {
  const uniqueDates = [...new Set(practiceDates)].sort();
  let longest = 0;
  let run = 0;
  let prior: string | undefined;
  for (const date of uniqueDates) {
    if (!prior || date !== nextDay(prior)) run = 1;
    else run += 1;
    longest = Math.max(longest, run);
    prior = date;
  }

  const set = new Set(uniqueDates);
  const today = localDateKey(now, timeZone);
  let cursor = set.has(today) ? today : nextDay(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = nextDay(cursor, -1);
  }
  return { current, longest };
}

function deriveWeakCards(
  cards: SentenceCard[],
  courses: Course[],
  learningByCard: Map<string, SentenceLearningState>,
  reviewByCard: Map<string, ReviewState>,
  statisticsByCard: Map<string, CardPracticeStatistics>,
): WeakCard[] {
  const membership = firstCourseMembership(courses);
  return cards
    .flatMap<WeakCard>((card) => {
      const learning = learningByCard.get(card.id);
      const review = reviewByCard.get(card.id);
      const statistics = statisticsByCard.get(card.id);
      if (!learning?.firstPassedAt || !review || review.learningStatus === "mastered") return [];
      const recentNonPerfectChecks = statistics?.recentNonPerfectChecks ?? 0;
      if (review.lapseCount < 1 && recentNonPerfectChecks < 2) return [];
      const course = membership.get(card.id);
      return [{
        cardId: card.id,
        ...projectRecallSafePrompt(card),
        courseId: course?.id ?? null,
        courseTitle: course?.title ?? "Standalone",
        stage: review.stage,
        lapseCount: review.lapseCount,
        recentNonPerfectChecks,
        independentAccuracy: statistics?.independentAccuracy ?? null,
        recentResult: statistics?.mostRecentOutcome ?? null,
        mostRecentCheckAt: statistics?.mostRecentCheckAt ?? null,
        dueAt: review.dueAt,
      }];
    })
    .sort(compareWeakCards)
    .slice(0, 8);
}

function compareWeakCards(left: WeakCard, right: WeakCard): number {
  return (
    right.lapseCount - left.lapseCount ||
    right.recentNonPerfectChecks - left.recentNonPerfectChecks ||
    accuracyForRanking(left.independentAccuracy) - accuracyForRanking(right.independentAccuracy) ||
    timestampForRanking(right.mostRecentCheckAt) - timestampForRanking(left.mostRecentCheckAt) ||
    left.cardId.localeCompare(right.cardId)
  );
}

function firstCourseMembership(courses: Course[]): Map<string, { id: string; title: string }> {
  const result = new Map<string, { id: string; title: string }>();
  for (const course of courses) {
    for (const cardId of course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.cardIds))) {
      if (!result.has(cardId)) result.set(cardId, { id: course.id, title: course.title });
    }
  }
  return result;
}

function emptyMasteryDistribution(): MasteryDistribution {
  return {
    untouched: 0,
    acquiring: 0,
    stage0FocusedReview: 0,
    stage1: 0,
    stage2: 0,
    stage3: 0,
    stage4: 0,
    stage5: 0,
    stage6: 0,
    mastered: 0,
  };
}

function incrementStage(distribution: MasteryDistribution, stage: MasteryStage): void {
  const key = stage === 0 ? "stage0FocusedReview" : (`stage${stage}` as keyof MasteryDistribution);
  distribution[key] += 1;
}

function nextDay(date: string, amount = 1): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function accuracyForRanking(value: number | null): number {
  return value ?? 1;
}

function timestampForRanking(value: string | null): number {
  return value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
