import { enumerateCalendarDays, localDateKey } from "./localCalendar";

export type ProgressAttemptOutcome = "perfect" | "close" | "retry";
export type ProgressSignalKind = "support-used" | "revealed" | "skipped";

/**
 * A deliberately structural projection of PracticeLogEntry. It also accepts
 * pre-v4 rows so migration fixtures and complete-history reducers share one seam.
 */
export interface ProgressPracticeLogEntry {
  id: string;
  cardId: string;
  submittedAt: string;
  kind?: "attempt" | "signal";
  phase?: string;
  submissionIndex?: number;
  outcome?: ProgressAttemptOutcome | "revealed" | "skipped";
  accuracy: number;
  signalKinds?: ProgressSignalKind[];
  answerWasRevealed?: boolean;
  supportLevelUsed?: number;
  receivedCorrection?: boolean;
}

interface MutableCounts {
  totalEvents: number;
  practiceActivityAttempts: number;
  submissions: number;
  retrievalChecks: number;
  independentAccuracySum: number;
  perfectRecallCount: number;
  closeCount: number;
  retryCount: number;
  correctionsCompleted: number;
  revealCount: number;
  skipCount: number;
}

interface MutableDailyStatistics {
  date: string;
  practiceAttempts: number;
  nonVoluntaryAttempts: number;
  retrievalChecks: number;
  perfectRecalls: number;
  independentAccuracySum: number;
}

interface MutableCardStatistics {
  cardId: string;
  retrievalChecks: number;
  perfectRecalls: number;
  independentAccuracySum: number;
  recentNonPerfectChecks: number;
  mostRecentCheckAt: string | null;
  mostRecentOutcome: ProgressAttemptOutcome | null;
}

export interface PracticeStatisticsState {
  now: string;
  timeZone: string;
  recentWindowStart: number;
  recentWindowEnd: number;
  allTime: MutableCounts;
  daily: Record<string, MutableDailyStatistics>;
  byCard: Record<string, MutableCardStatistics>;
}

export interface AllTimePracticeStatistics {
  totalEvents: number;
  practiceActivityAttempts: number;
  submissions: number;
  retrievalChecks: number;
  independentAccuracy: number | null;
  perfectRecallCount: number;
  closeCount: number;
  retryCount: number;
  correctionsCompleted: number;
  revealCount: number;
  skipCount: number;
}

export interface DailyPracticeStatistics {
  date: string;
  practiceAttempts: number;
  nonVoluntaryAttempts: number;
  retrievalChecks: number;
  perfectRecalls: number;
  averageIndependentAccuracy: number | null;
}

export interface CardPracticeStatistics {
  cardId: string;
  retrievalChecks: number;
  perfectRecalls: number;
  independentAccuracy: number | null;
  recentNonPerfectChecks: number;
  mostRecentCheckAt: string | null;
  mostRecentOutcome: ProgressAttemptOutcome | null;
}

export interface PracticeStatistics {
  timeZone: string;
  allTime: AllTimePracticeStatistics;
  daily: DailyPracticeStatistics[];
  byCard: CardPracticeStatistics[];
  qualifyingPracticeDates: string[];
}

export function createPracticeStatisticsState(
  now: Date,
  timeZone: string,
): PracticeStatisticsState {
  // Constructing the formatter validates the IANA identifier before a scan starts.
  localDateKey(now, timeZone);
  return {
    now: now.toISOString(),
    timeZone,
    recentWindowStart: now.getTime() - 30 * 24 * 60 * 60 * 1_000,
    recentWindowEnd: now.getTime(),
    allTime: emptyCounts(),
    daily: {},
    byCard: {},
  };
}

export function reducePracticeStatistics(
  state: PracticeStatisticsState,
  log: ProgressPracticeLogEntry,
): PracticeStatisticsState {
  const submittedAt = new Date(log.submittedAt);
  if (Number.isNaN(submittedAt.getTime())) {
    throw new Error(`PracticeLog ${log.id} has an invalid submittedAt value.`);
  }

  const next = cloneState(state);
  next.allTime.totalEvents += 1;
  const normalizedKind = kindOf(log);

  if (normalizedKind === "signal") {
    const signals = signalKindsOf(log);
    if (signals.includes("revealed")) next.allTime.revealCount += 1;
    if (signals.includes("skipped")) next.allTime.skipCount += 1;
    return next;
  }

  next.allTime.practiceActivityAttempts += 1;
  const day = ensureDay(next, localDateKey(submittedAt, next.timeZone));
  day.practiceAttempts += 1;

  if (log.phase === "voluntary-practice") {
    return next;
  }

  next.allTime.submissions += 1;
  day.nonVoluntaryAttempts += 1;
  if (!isRetrievalCheck(log)) {
    if (isCorrectionCompleted(log)) next.allTime.correctionsCompleted += 1;
    return next;
  }

  const outcome = attemptOutcomeOf(log);
  next.allTime.retrievalChecks += 1;
  next.allTime.independentAccuracySum += log.accuracy;
  if (outcome === "perfect") next.allTime.perfectRecallCount += 1;
  if (outcome === "close") next.allTime.closeCount += 1;
  if (outcome === "retry") next.allTime.retryCount += 1;

  day.retrievalChecks += 1;
  day.independentAccuracySum += log.accuracy;
  if (outcome === "perfect") day.perfectRecalls += 1;

  const card = ensureCard(next, log.cardId);
  card.retrievalChecks += 1;
  card.independentAccuracySum += log.accuracy;
  if (outcome === "perfect") card.perfectRecalls += 1;
  if (
    outcome !== "perfect" &&
    submittedAt.getTime() >= next.recentWindowStart &&
    submittedAt.getTime() <= next.recentWindowEnd
  ) {
    card.recentNonPerfectChecks += 1;
  }
  if (!card.mostRecentCheckAt || submittedAt.getTime() > new Date(card.mostRecentCheckAt).getTime()) {
    card.mostRecentCheckAt = submittedAt.toISOString();
    card.mostRecentOutcome = outcome;
  }
  return next;
}

export function finalizePracticeStatistics(
  state: PracticeStatisticsState,
  days = 14,
): PracticeStatistics {
  const endDate = localDateKey(state.now, state.timeZone);
  const daily = enumerateCalendarDays(endDate, days).map<DailyPracticeStatistics>((date) => {
    const value = state.daily[date] ?? emptyDay(date);
    return {
      date,
      practiceAttempts: value.practiceAttempts,
      nonVoluntaryAttempts: value.nonVoluntaryAttempts,
      retrievalChecks: value.retrievalChecks,
      perfectRecalls: value.perfectRecalls,
      averageIndependentAccuracy: average(value.independentAccuracySum, value.retrievalChecks),
    };
  });

  return {
    timeZone: state.timeZone,
    allTime: {
      totalEvents: state.allTime.totalEvents,
      practiceActivityAttempts: state.allTime.practiceActivityAttempts,
      submissions: state.allTime.submissions,
      retrievalChecks: state.allTime.retrievalChecks,
      independentAccuracy: average(
        state.allTime.independentAccuracySum,
        state.allTime.retrievalChecks,
      ),
      perfectRecallCount: state.allTime.perfectRecallCount,
      closeCount: state.allTime.closeCount,
      retryCount: state.allTime.retryCount,
      correctionsCompleted: state.allTime.correctionsCompleted,
      revealCount: state.allTime.revealCount,
      skipCount: state.allTime.skipCount,
    },
    daily,
    byCard: Object.values(state.byCard)
      .sort((left, right) => left.cardId.localeCompare(right.cardId))
      .map((card) => ({
        cardId: card.cardId,
        retrievalChecks: card.retrievalChecks,
        perfectRecalls: card.perfectRecalls,
        independentAccuracy: average(card.independentAccuracySum, card.retrievalChecks),
        recentNonPerfectChecks: card.recentNonPerfectChecks,
        mostRecentCheckAt: card.mostRecentCheckAt,
        mostRecentOutcome: card.mostRecentOutcome,
      })),
    qualifyingPracticeDates: Object.values(state.daily)
      .filter((day) => day.nonVoluntaryAttempts > 0)
      .map((day) => day.date)
      .sort(),
  };
}

function kindOf(log: ProgressPracticeLogEntry): "attempt" | "signal" {
  if (log.kind) return log.kind;
  return log.outcome === "revealed" || log.outcome === "skipped" ? "signal" : "attempt";
}

function signalKindsOf(log: ProgressPracticeLogEntry): ProgressSignalKind[] {
  if (log.signalKinds) return [...new Set(log.signalKinds)];
  if (log.outcome === "revealed" || log.outcome === "skipped") return [log.outcome];
  return [];
}

function attemptOutcomeOf(log: ProgressPracticeLogEntry): ProgressAttemptOutcome {
  if (log.outcome === "perfect" || log.outcome === "close" || log.outcome === "retry") {
    return log.outcome;
  }
  throw new Error(`Attempt PracticeLog ${log.id} has no Attempt outcome.`);
}

function isRetrievalCheck(log: ProgressPracticeLogEntry): boolean {
  if ((log.submissionIndex ?? 0) !== 0) return false;
  if (log.answerWasRevealed || (log.supportLevelUsed ?? 0) > 0 || log.receivedCorrection) {
    return false;
  }
  return log.phase === "independent-recall" || log.phase === "review-recall";
}

function isCorrectionCompleted(log: ProgressPracticeLogEntry): boolean {
  return (
    log.outcome === "perfect" &&
    (log.phase === "corrective-practice" || (log.submissionIndex ?? 0) > 0)
  );
}

function ensureDay(state: PracticeStatisticsState, date: string): MutableDailyStatistics {
  return (state.daily[date] ??= emptyDay(date));
}

function ensureCard(state: PracticeStatisticsState, cardId: string): MutableCardStatistics {
  return (state.byCard[cardId] ??= {
    cardId,
    retrievalChecks: 0,
    perfectRecalls: 0,
    independentAccuracySum: 0,
    recentNonPerfectChecks: 0,
    mostRecentCheckAt: null,
    mostRecentOutcome: null,
  });
}

function emptyCounts(): MutableCounts {
  return {
    totalEvents: 0,
    practiceActivityAttempts: 0,
    submissions: 0,
    retrievalChecks: 0,
    independentAccuracySum: 0,
    perfectRecallCount: 0,
    closeCount: 0,
    retryCount: 0,
    correctionsCompleted: 0,
    revealCount: 0,
    skipCount: 0,
  };
}

function emptyDay(date: string): MutableDailyStatistics {
  return {
    date,
    practiceAttempts: 0,
    nonVoluntaryAttempts: 0,
    retrievalChecks: 0,
    perfectRecalls: 0,
    independentAccuracySum: 0,
  };
}

function cloneState(state: PracticeStatisticsState): PracticeStatisticsState {
  return {
    ...state,
    allTime: { ...state.allTime },
    daily: Object.fromEntries(Object.entries(state.daily).map(([key, value]) => [key, { ...value }])),
    byCard: Object.fromEntries(Object.entries(state.byCard).map(([key, value]) => [key, { ...value }])),
  };
}

function average(sum: number, count: number): number | null {
  return count === 0 ? null : sum / count;
}
