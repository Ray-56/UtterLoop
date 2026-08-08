import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type {
  ActivePracticeSessionCheckpointEvidence,
  ContextualPracticeLogEntry,
  PracticeLogContext,
  PracticeSessionEvidence,
} from "../../domain/practice/PracticeSessionEvidence";
import {
  addCalendarDays,
  enumerateCalendarDays,
  localDateKey,
} from "../../domain/progress/localCalendar";
import type { ReviewState } from "../../domain/review/ReviewState";

export type MeasureAvailability =
  | { status: "available" }
  | { status: "unavailable"; reason: "no-evidence" | "immature-cohort" };

export interface EvidenceCoverage {
  eligibleRows: number;
  contextBearingRows: number;
  excludedLegacyRows: number;
  excludedPreContextRows: number;
  measurementEpoch: string | null;
  containsInferred: boolean;
}

export interface RateMeasure {
  numerator: number;
  denominator: number;
  availability: MeasureAvailability;
  coverage: EvidenceCoverage;
}

export interface DurationMeasure {
  medianMs: number | null;
  sampleSize: number;
  availability: MeasureAvailability;
  coverage: EvidenceCoverage;
}

export interface CountMeasure {
  count: number;
  availability: MeasureAvailability;
  coverage: EvidenceCoverage;
}

export interface QuickStartDispositionMeasure {
  completed: number;
  dismissed: number;
  availability: MeasureAvailability;
  coverage: EvidenceCoverage;
}

export interface SessionHabitMeasures {
  completed: number;
  abandoned: number;
  presumedAbandoned: number;
  interrupted: number;
  invalidated: number;
  dismissed: number;
  completion: RateMeasure;
  coverage: EvidenceCoverage;
}

export interface SupportDistributionMeasure {
  denominator: number;
  levels: Record<0 | 1 | 2 | 3 | 4, number>;
  availability: MeasureAvailability;
  coverage: EvidenceCoverage;
}

export interface RequeueCapMeasure {
  cardRoundPairs: number;
  distinctCards: number;
  repeatedCards: number;
  availability: MeasureAvailability;
  coverage: EvidenceCoverage;
}

export interface BetaReadinessInput {
  asOf: Date;
  timeZone: string;
  sessionWindowDays: number;
  inactivityThresholdMs: number;
  measurementEpoch: string | null;
  activeCheckpoint: ActivePracticeSessionCheckpointEvidence | null;
  cards: readonly SentenceCard[];
  learningStates: readonly SentenceLearningState[];
  reviewStates: readonly ReviewState[];
  practiceLog: readonly ContextualPracticeLogEntry[];
  sessionEvidence: readonly PracticeSessionEvidence[];
}

export interface BetaReadinessSnapshot {
  asOf: string;
  timeZone: string;
  sessionWindowDays: number;
  activation: {
    firstEngagedSessionCompletion: RateMeasure;
    quickStartDisposition: QuickStartDispositionMeasure;
    timeToFirstPass: DurationMeasure;
  };
  acquisition: {
    sameRoundIndependentFirstPass: RateMeasure;
    highestSupportBeforeFirstPass: SupportDistributionMeasure;
    revealBeforeFirstPass: RateMeasure;
    skipBeforeFirstPass: RateMeasure;
    requeueCap: RequeueCapMeasure;
  };
  retention: {
    weeklyRetainedIndependentSentences: RateMeasure;
    dueReviewCompletion: RateMeasure;
    cohorts: {
      nextDay: RateMeasure;
      day7: RateMeasure;
      day30: RateMeasure;
    };
    dueBacklog: CountMeasure;
  };
  habit: {
    sessions: SessionHabitMeasures;
    activePracticeDays: RateMeasure;
  };
}

export const BetaReadiness = {
  measure(input: BetaReadinessInput): BetaReadinessSnapshot {
    assertInput(input);
    const sessionOutcomes = sessionOutcomesInWindow(input);
    const acquisition = measureAcquisition(input);
    return {
      asOf: input.asOf.toISOString(),
      timeZone: input.timeZone,
      sessionWindowDays: input.sessionWindowDays,
      activation: {
        firstEngagedSessionCompletion: measureFirstEngagedSessionCompletion(input, sessionOutcomes),
        quickStartDisposition: measureQuickStartDisposition(input),
        timeToFirstPass: measureTimeToFirstPass(input),
      },
      acquisition,
      retention: {
        weeklyRetainedIndependentSentences: measureWeeklyRetainedIndependentSentences(input),
        dueReviewCompletion: measureDueReviewCompletion(input),
        cohorts: {
          nextDay: measureRetentionCohort(input, { startMs: 20 * HOUR_MS, endMs: 48 * HOUR_MS }),
          day7: measureRetentionCohort(input, { kind: "local-days", firstDay: 6, lastDay: 9 }),
          day30: measureRetentionCohort(input, { kind: "local-days", firstDay: 27, lastDay: 34 }),
        },
        dueBacklog: measureDueBacklog(input),
      },
      habit: {
        sessions: measureSessions(input, sessionOutcomes),
        activePracticeDays: measureActivePracticeDays(input),
      },
    };
  },
};

const HOUR_MS = 60 * 60 * 1_000;

interface SessionOutcome {
  sessionId: string;
  engagedAt: string;
  outcome: "completed" | "abandoned" | "presumed-abandoned" | "interrupted" | "invalidated";
}

function measureAcquisition(input: BetaReadinessInput): BetaReadinessSnapshot["acquisition"] {
  const eligibleRounds = terminalContextCompleteRounds(input);
  const introducedByRound = new Map(eligibleRounds.map((session) => [
    roundKey(session.sessionId, session.roundId),
    new Set(session.round.introducedCardIds),
  ]));
  const introducedCards = new Set(eligibleRounds.flatMap((session) => session.round.introducedCardIds));
  const sameRoundPassed = new Set(eligibleRounds.flatMap((session) => {
    const introduced = new Set(session.round.introducedCardIds);
    return session.round.firstPassCardIds.filter((cardId) => introduced.has(cardId));
  }));
  const roundCoverage = evidenceCoverage(
    input,
    terminalRoundsInWindow(input).length,
    eligibleRounds.length,
    0,
    terminalRoundsInWindow(input).length - eligibleRounds.length,
  );
  const sameRoundIndependentFirstPass = rate(
    sameRoundPassed.size,
    introducedCards.size,
    roundCoverage,
  );

  const learningByCard = new Map(input.learningStates.map((state) => [state.cardId, state]));
  const diagnosticCards = new Set([...introducedCards].filter((cardId) => {
    const introducedAt = learningByCard.get(cardId)?.introducedAt;
    return introducedAt ? instantInReportingWindow(introducedAt, input) : false;
  }));
  const candidateRows = input.practiceLog.filter((entry) => {
    if (!diagnosticCards.has(entry.cardId)) return false;
    const learningState = learningByCard.get(entry.cardId);
    const introducedAt = Date.parse(learningState?.introducedAt ?? "");
    const firstPassedAt = learningState?.firstPassedAt
      ? Date.parse(learningState.firstPassedAt)
      : input.asOf.getTime();
    const submittedAt = Date.parse(entry.submittedAt);
    return !Number.isNaN(introducedAt)
      && !Number.isNaN(firstPassedAt)
      && !Number.isNaN(submittedAt)
      && submittedAt >= introducedAt
      && submittedAt <= firstPassedAt
      && submittedAt <= input.asOf.getTime();
  });
  const hasIntroductionContext = (entry: ContextualPracticeLogEntry): boolean => {
    if (!entry.context) return false;
    const introduced = introducedByRound.get(roundKey(entry.context.sessionId, entry.context.roundId));
    return Boolean(introduced?.has(entry.cardId));
  };
  const relevantRows = candidateRows.filter((entry) => (
    entry.phase !== "legacy" && hasIntroductionContext(entry)
  ));
  const legacyRows = candidateRows.filter((entry) => entry.phase === "legacy");
  const preContextRows = candidateRows.filter((entry) => (
    entry.phase !== "legacy" && !hasIntroductionContext(entry)
  ));
  const highestByCard = new Map<string, 0 | 1 | 2 | 3 | 4>(
    [...diagnosticCards].map((cardId) => [cardId, 0]),
  );
  for (const entry of relevantRows) {
    highestByCard.set(
      entry.cardId,
      Math.max(highestByCard.get(entry.cardId) ?? 0, entry.supportLevelUsed) as 0 | 1 | 2 | 3 | 4,
    );
  }
  const levels: SupportDistributionMeasure["levels"] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const level of highestByCard.values()) levels[level] += 1;
  const diagnosticCoverage = evidenceCoverage(
    input,
    candidateRows.length,
    relevantRows.length,
    legacyRows.length,
    preContextRows.length,
  );
  const revealedCards = new Set(relevantRows.filter((entry) => (
    entry.kind === "signal" && entry.signalKinds.includes("revealed")
  )).map((entry) => entry.cardId));
  const skippedCards = new Set(relevantRows.filter((entry) => (
    entry.kind === "signal" && entry.signalKinds.includes("skipped")
  )).map((entry) => entry.cardId));

  const capPairs = eligibleRounds.flatMap((session) => (
    [...new Set(session.round.requeue.capReachedCardIds)].map((cardId) => ({
      roundId: session.roundId,
      cardId,
    }))
  ));
  const capCounts = new Map<string, number>();
  for (const pair of capPairs) capCounts.set(pair.cardId, (capCounts.get(pair.cardId) ?? 0) + 1);
  const distinctCapCards = new Set(capPairs.map((pair) => pair.cardId));
  const repeatedCapCards = [...capCounts.values()].filter((count) => count >= 2).length;

  return {
    sameRoundIndependentFirstPass,
    highestSupportBeforeFirstPass: {
      denominator: diagnosticCards.size,
      levels,
      availability: diagnosticCards.size > 0
        ? { status: "available" }
        : { status: "unavailable", reason: "no-evidence" },
      coverage: diagnosticCoverage,
    },
    revealBeforeFirstPass: rate(revealedCards.size, diagnosticCards.size, diagnosticCoverage),
    skipBeforeFirstPass: rate(skippedCards.size, diagnosticCards.size, diagnosticCoverage),
    requeueCap: {
      cardRoundPairs: capPairs.length,
      distinctCards: distinctCapCards.size,
      repeatedCards: repeatedCapCards,
      availability: eligibleRounds.length > 0
        ? { status: "available" }
        : { status: "unavailable", reason: "no-evidence" },
      coverage: roundCoverage,
    },
  };
}

function measureFirstEngagedSessionCompletion(
  input: BetaReadinessInput,
  sessions: readonly SessionOutcome[],
): RateMeasure {
  const first = [...sessions]
    .filter((session) => session.outcome !== "interrupted" && session.outcome !== "invalidated")
    .sort((left, right) => Date.parse(left.engagedAt) - Date.parse(right.engagedAt))[0];
  const isObservable = Boolean(first);
  return {
    numerator: first?.outcome === "completed" ? 1 : 0,
    denominator: isObservable ? 1 : 0,
    availability: isObservable
      ? { status: "available" }
      : { status: "unavailable", reason: "no-evidence" },
    coverage: sessionCoverage(input, first ? [first] : []),
  };
}

function measureQuickStartDisposition(input: BetaReadinessInput): QuickStartDispositionMeasure {
  const quickStart = input.sessionEvidence.filter((session) => (
    session.entryPoint === "quick-start-v1"
    && instantInReportingWindow(session.endedAt, input)
  ));
  const completed = quickStart.filter((session) => session.terminal?.kind === "completed").length;
  const dismissed = quickStart.filter((session) => session.terminal?.kind === "dismissed").length;
  return {
    completed,
    dismissed,
    availability: quickStart.length > 0
      ? { status: "available" }
      : { status: "unavailable", reason: "no-evidence" },
    coverage: evidenceCoverage(input, quickStart.length, quickStart.length),
  };
}

function measureTimeToFirstPass(input: BetaReadinessInput): DurationMeasure {
  const known = new Set(input.cards.map((card) => card.id));
  const candidates = input.learningStates.filter((state) => (
    known.has(state.cardId)
    && Boolean(state.introducedAt)
    && Boolean(state.firstPassedAt)
    && instantInReportingWindow(state.firstPassedAt!, input)
  ));
  const observed = candidates.flatMap((state) => {
    if (state.firstPassSource === "legacy") return [];
    const introducedAt = Date.parse(state.introducedAt!);
    const firstPassedAt = Date.parse(state.firstPassedAt!);
    if (
      Number.isNaN(introducedAt)
      || Number.isNaN(firstPassedAt)
      || firstPassedAt < introducedAt
      || firstPassedAt > input.asOf.getTime()
    ) return [];
    return [{ introducedAt: state.introducedAt!, durationMs: firstPassedAt - introducedAt }];
  });
  const durations = observed.map((value) => value.durationMs).sort((left, right) => left - right);
  return {
    medianMs: median(durations),
    sampleSize: durations.length,
    availability: durations.length > 0
      ? { status: "available" }
      : { status: "unavailable", reason: "no-evidence" },
    coverage: {
      eligibleRows: candidates.length,
      contextBearingRows: observed.length,
      excludedLegacyRows: candidates.filter((state) => state.firstPassSource === "legacy").length,
      excludedPreContextRows: 0,
      measurementEpoch: input.measurementEpoch,
      containsInferred: false,
    },
  };
}

function measureSessions(
  input: BetaReadinessInput,
  sessions: readonly SessionOutcome[],
): SessionHabitMeasures {
  const completed = sessions.filter((session) => session.outcome === "completed").length;
  const explicitAbandoned = sessions.filter((session) => session.outcome === "abandoned").length;
  const presumedAbandoned = sessions.filter((session) => session.outcome === "presumed-abandoned").length;
  const abandoned = explicitAbandoned + presumedAbandoned;
  const coverage = sessionCoverage(input, sessions);
  return {
    completed,
    abandoned,
    presumedAbandoned,
    interrupted: sessions.filter((session) => session.outcome === "interrupted").length,
    invalidated: sessions.filter((session) => session.outcome === "invalidated").length,
    dismissed: input.sessionEvidence.filter((session) => (
      session.terminal.kind === "dismissed" && instantInReportingWindow(session.endedAt, input)
    )).length,
    completion: rate(completed, completed + abandoned, coverage),
    coverage,
  };
}

function measureWeeklyRetainedIndependentSentences(input: BetaReadinessInput): RateMeasure {
  const knownCardIds = new Set(input.cards.map((card) => card.id));
  const localDays = new Set(enumerateCalendarDays(localDateKey(input.asOf, input.timeZone), 7));
  const candidates = input.practiceLog.filter((entry) => (
    entry.kind === "attempt"
    && entry.submissionIndex === 0
    && knownCardIds.has(entry.cardId)
    && Date.parse(entry.submittedAt) <= input.asOf.getTime()
    && localDays.has(localDateKey(entry.submittedAt, input.timeZone))
    && (entry.phase === "review-recall" || entry.phase === "legacy")
  ));
  const contextBearing = candidates.filter((entry) => (
    entry.phase === "review-recall" && hasCompleteReviewContext(entry.context)
  ));
  const dueRows = contextBearing.filter((entry) => (
    Date.parse(entry.context!.scheduledReviewDueAt!) <= Date.parse(entry.submittedAt)
  ));
  const observedCards = new Set(dueRows.map((entry) => entry.cardId));
  const retainedCards = new Set(dueRows.filter((entry) => (
    entry.kind === "attempt"
    && entry.outcome === "perfect"
    && entry.supportLevelUsed === 0
    && !entry.answerWasRevealed
    && !entry.receivedCorrection
  )).map((entry) => entry.cardId));

  return {
    numerator: retainedCards.size,
    denominator: observedCards.size,
    availability: observedCards.size > 0
      ? { status: "available" }
      : { status: "unavailable", reason: "no-evidence" },
    coverage: {
      eligibleRows: candidates.length,
      contextBearingRows: contextBearing.length,
      excludedLegacyRows: candidates.filter((entry) => entry.phase === "legacy").length,
      excludedPreContextRows: candidates.filter((entry) => (
        entry.phase !== "legacy" && !hasCompleteReviewContext(entry.context)
      )).length,
      measurementEpoch: input.measurementEpoch,
      containsInferred: false,
    },
  };
}

function measureDueReviewCompletion(input: BetaReadinessInput): RateMeasure {
  const reviewRounds = terminalRoundsInWindow(input).filter((session) => session.scope.kind === "review");
  const completeRounds = reviewRounds.filter((session) => isContextCompleteRound(session.round));
  const scheduled = completeRounds.flatMap((session) => (
    session.round.dueReviewScheduledOccurrenceIds.map((occurrenceId) => ({
      key: occurrenceKey(session.sessionId, session.roundId, occurrenceId),
      sessionId: session.sessionId,
      roundId: session.roundId,
      occurrenceId,
      terminalEndedAt: Date.parse(session.endedAt),
    }))
  ));
  const completed = new Set(completeRounds.flatMap((session) => (
    session.round.dueReviewCompletedOccurrenceIds.map((occurrenceId) => (
      occurrenceKey(session.sessionId, session.roundId, occurrenceId)
    ))
  )));
  const attemptTimesByOccurrence = new Map<string, number[]>();
  for (const entry of input.practiceLog) {
    if (entry.kind !== "attempt" || entry.phase === "legacy" || !entry.context) continue;
    const submittedAt = Date.parse(entry.submittedAt);
    if (Number.isNaN(submittedAt) || submittedAt > input.asOf.getTime()) continue;
    const key = occurrenceKey(
      entry.context.sessionId,
      entry.context.roundId,
      entry.context.occurrenceId,
    );
    attemptTimesByOccurrence.set(key, [
      ...(attemptTimesByOccurrence.get(key) ?? []),
      submittedAt,
    ]);
  }
  const numerator = scheduled.filter((occurrence) => (
    completed.has(occurrence.key)
    && (attemptTimesByOccurrence.get(occurrence.key) ?? [])
      .some((submittedAt) => submittedAt <= occurrence.terminalEndedAt)
  )).length;
  const excludedOccurrenceCount = reviewRounds
    .filter((session) => !isContextCompleteRound(session.round))
    .reduce((total, session) => total + session.round.dueReviewScheduledOccurrenceIds.length, 0);
  const coverage = evidenceCoverage(
    input,
    scheduled.length + excludedOccurrenceCount,
    scheduled.length,
    0,
    excludedOccurrenceCount,
  );
  return rate(numerator, scheduled.length, coverage);
}

interface ElapsedCohortWindow {
  kind?: "elapsed";
  startMs: number;
  endMs: number;
}

interface LocalDayCohortWindow {
  kind: "local-days";
  firstDay: number;
  lastDay: number;
}

type CohortWindow = ElapsedCohortWindow | LocalDayCohortWindow;

function measureRetentionCohort(
  input: BetaReadinessInput,
  window: CohortWindow,
): RateMeasure {
  const known = new Set(input.cards.map((card) => card.id));
  const epoch = input.measurementEpoch === null ? null : Date.parse(input.measurementEpoch);
  const allFirstPasses = input.learningStates.filter((state) => (
    known.has(state.cardId)
    && Boolean(state.firstPassedAt)
    && Date.parse(state.firstPassedAt!) <= input.asOf.getTime()
  ));
  const contextComplete = allFirstPasses.filter((state) => (
    state.firstPassSource !== "legacy"
    && epoch !== null
    && Date.parse(state.firstPassedAt!) >= epoch
  ));
  const matured = contextComplete.filter((state) => (
    cohortHasMatured(state.firstPassedAt!, window, input)
  ));
  const firstPassByCard = new Map(allFirstPasses.map((state) => [state.cardId, state]));
  const observationRows = input.practiceLog.filter((entry) => {
    if (
      entry.kind !== "attempt"
      || entry.submissionIndex !== 0
      || (entry.phase !== "review-recall" && entry.phase !== "legacy")
    ) return false;
    const submittedAt = Date.parse(entry.submittedAt);
    const firstPass = firstPassByCard.get(entry.cardId);
    if (!firstPass || Number.isNaN(submittedAt) || submittedAt > input.asOf.getTime()) return false;
    return observationFallsInCohort(
      Date.parse(firstPass.firstPassedAt!),
      firstPass.firstPassedAt!,
      entry.submittedAt,
      window,
      input.timeZone,
    );
  });
  const contextBearingObservationRows = observationRows.filter((entry) => (
    entry.phase === "review-recall" && hasCompleteReviewContext(entry.context)
  ));
  const strictRows = observationRows.filter((entry) => (
    isStrictDueRetrieval(entry, input.asOf)
  ));
  const retained = matured.filter((state) => {
    const firstPass = Date.parse(state.firstPassedAt!);
    return strictRows.some((entry) => {
      if (entry.cardId !== state.cardId) return false;
      return observationFallsInCohort(
        firstPass,
        state.firstPassedAt!,
        entry.submittedAt,
        window,
        input.timeZone,
      );
    });
  });
  const coverage = evidenceCoverage(
    input,
    allFirstPasses.length + observationRows.length,
    contextComplete.length + contextBearingObservationRows.length,
    allFirstPasses.filter((state) => state.firstPassSource === "legacy").length
      + observationRows.filter((entry) => entry.phase === "legacy").length,
    allFirstPasses.filter((state) => (
      state.firstPassSource !== "legacy"
      && (epoch === null || Date.parse(state.firstPassedAt!) < epoch)
    )).length + observationRows.filter((entry) => (
      entry.phase !== "legacy" && !hasCompleteReviewContext(entry.context)
    )).length,
  );
  return {
    numerator: retained.length,
    denominator: matured.length,
    availability: matured.length > 0
      ? { status: "available" }
      : contextComplete.length > 0
        ? { status: "unavailable", reason: "immature-cohort" }
        : { status: "unavailable", reason: "no-evidence" },
    coverage,
  };
}

function cohortHasMatured(
  firstPassedAt: string,
  window: CohortWindow,
  input: BetaReadinessInput,
): boolean {
  if (window.kind !== "local-days") {
    return input.asOf.getTime() >= Date.parse(firstPassedAt) + window.endMs;
  }
  const firstDate = localDateKey(firstPassedAt, input.timeZone);
  const firstDateAfterWindow = addCalendarDays(firstDate, window.lastDay + 1);
  return localDateKey(input.asOf, input.timeZone) >= firstDateAfterWindow;
}

function observationFallsInCohort(
  firstPass: number,
  firstPassedAt: string,
  observedAt: string,
  window: CohortWindow,
  timeZone: string,
): boolean {
  if (window.kind !== "local-days") {
    const observed = Date.parse(observedAt);
    return observed >= firstPass + window.startMs && observed < firstPass + window.endMs;
  }
  const firstDate = localDateKey(firstPassedAt, timeZone);
  const observedDate = localDateKey(observedAt, timeZone);
  return observedDate >= addCalendarDays(firstDate, window.firstDay)
    && observedDate <= addCalendarDays(firstDate, window.lastDay);
}

function measureDueBacklog(input: BetaReadinessInput): CountMeasure {
  const known = new Set(input.cards.map((card) => card.id));
  const active = input.reviewStates.filter((state) => (
    known.has(state.cardId) && state.learningStatus !== "mastered"
  ));
  const due = active.filter((state) => Date.parse(state.dueAt) <= input.asOf.getTime());
  return {
    count: due.length,
    availability: { status: "available" },
    coverage: evidenceCoverage(input, active.length, active.length),
  };
}

function measureActivePracticeDays(input: BetaReadinessInput): RateMeasure {
  const eventTimes = [
    ...input.sessionEvidence.flatMap((session) => session.engagedAt ? [session.engagedAt] : []),
    ...(input.activeCheckpoint?.engagedAt ? [input.activeCheckpoint.engagedAt] : []),
    ...input.practiceLog.map((entry) => entry.submittedAt),
  ].filter((value) => instantInReportingWindow(value, input));
  const days = new Set(eventTimes.map((value) => localDateKey(value, input.timeZone)));
  const coverage = evidenceCoverage(input, eventTimes.length, eventTimes.length);
  return {
    numerator: days.size,
    denominator: input.sessionWindowDays,
    availability: { status: "available" },
    coverage,
  };
}

function sessionOutcomesInWindow(input: BetaReadinessInput): SessionOutcome[] {
  const durable = input.sessionEvidence.flatMap<SessionOutcome>((session) => {
    const endedAt = Date.parse(session.endedAt);
    if (
      !session.engagedAt
      || !instantInReportingWindow(session.engagedAt, input)
      || Number.isNaN(endedAt)
      || endedAt > input.asOf.getTime()
    ) return [];
    if (session.terminal.kind === "dismissed") return [];
    return [{
      sessionId: session.sessionId,
      engagedAt: session.engagedAt,
      outcome: session.terminal.kind,
    }];
  });
  const checkpoint = input.activeCheckpoint;
  if (
    !checkpoint?.engagedAt
    || durable.some((session) => session.sessionId === checkpoint.sessionId)
    || !instantInReportingWindow(checkpoint.engagedAt, input)
  ) return durable;
  const inactiveFor = input.asOf.getTime() - Date.parse(checkpoint.updatedAt);
  return [...durable, {
    sessionId: checkpoint.sessionId,
    engagedAt: checkpoint.engagedAt,
    outcome: inactiveFor >= input.inactivityThresholdMs ? "presumed-abandoned" : "interrupted",
  }];
}

function sessionCoverage(
  input: BetaReadinessInput,
  sessions: readonly SessionOutcome[],
): EvidenceCoverage {
  return evidenceCoverage(
    input,
    sessions.length,
    sessions.length,
    0,
    0,
    sessions.some((session) => session.outcome === "presumed-abandoned"),
  );
}

function evidenceCoverage(
  input: BetaReadinessInput,
  eligibleRows: number,
  contextBearingRows: number,
  excludedLegacyRows = 0,
  excludedPreContextRows = 0,
  containsInferred = false,
): EvidenceCoverage {
  return {
    eligibleRows,
    contextBearingRows,
    excludedLegacyRows,
    excludedPreContextRows,
    measurementEpoch: input.measurementEpoch,
    containsInferred,
  };
}

function terminalRoundsInWindow(input: BetaReadinessInput): PracticeSessionEvidence[] {
  return input.sessionEvidence.filter((session) => (
    (session.terminal.kind === "completed" || session.terminal.kind === "abandoned")
    && instantInReportingWindow(session.endedAt, input)
  ));
}

function terminalContextCompleteRounds(input: BetaReadinessInput): PracticeSessionEvidence[] {
  return terminalRoundsInWindow(input).filter((session) => isContextCompleteRound(session.round));
}

function isContextCompleteRound(round: PracticeSessionEvidence["round"]): boolean {
  const sets = [
    round.initialOccurrenceIds,
    round.scheduledOccurrenceIds,
    round.attemptedOccurrenceIds,
    round.completedOccurrenceIds,
    round.skippedOccurrenceIds,
    round.remainingOccurrenceIds,
    round.dueReviewScheduledOccurrenceIds,
    round.dueReviewCompletedOccurrenceIds,
    round.introducedCardIds,
    round.firstPassCardIds,
    round.requeue.insertedReturnOccurrenceIds,
    round.requeue.deferredNoRoomCardIds,
    round.requeue.capReachedCardIds,
  ];
  if (sets.some((values) => new Set(values).size !== values.length)) return false;

  const initial = new Set(round.initialOccurrenceIds);
  const scheduled = new Set(round.scheduledOccurrenceIds);
  const attempted = new Set(round.attemptedOccurrenceIds);
  const completed = new Set(round.completedOccurrenceIds);
  const skipped = new Set(round.skippedOccurrenceIds);
  const remaining = new Set(round.remainingOccurrenceIds);
  const dueScheduled = new Set(round.dueReviewScheduledOccurrenceIds);
  const dueCompleted = new Set(round.dueReviewCompletedOccurrenceIds);
  const inserted = new Set(round.requeue.insertedReturnOccurrenceIds);

  if (![...initial, ...attempted, ...dueScheduled, ...inserted].every((id) => scheduled.has(id))) return false;
  if ([...inserted].some((id) => initial.has(id))) return false;
  if ([...dueCompleted].some((id) => !dueScheduled.has(id) || !completed.has(id) || !attempted.has(id))) return false;

  const terminalSets = [completed, skipped, remaining];
  for (const id of scheduled) {
    if (terminalSets.filter((set) => set.has(id)).length !== 1) return false;
  }
  return terminalSets.every((set) => [...set].every((id) => scheduled.has(id)));
}

function roundKey(sessionId: string, roundId: string): string {
  return `${sessionId}\u0000${roundId}`;
}

function occurrenceKey(sessionId: string, roundId: string, occurrenceId: string): string {
  return `${roundKey(sessionId, roundId)}\u0000${occurrenceId}`;
}

function rate(numerator: number, denominator: number, coverage: EvidenceCoverage): RateMeasure {
  return {
    numerator,
    denominator,
    availability: denominator > 0
      ? { status: "available" }
      : { status: "unavailable", reason: "no-evidence" },
    coverage,
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle] ?? null;
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}

function hasCompleteReviewContext(context: PracticeLogContext | undefined): boolean {
  if (
    !context?.sessionId
    || !context.roundId
    || !context.occurrenceId
    || context.queueReason !== "due-review"
    || !context.scheduledReviewDueAt
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(context.scheduledReviewDueAt));
}

function isStrictDueRetrieval(
  entry: ContextualPracticeLogEntry,
  asOf: Date,
): entry is Extract<ContextualPracticeLogEntry, { kind: "attempt" }> {
  const submittedAt = Date.parse(entry.submittedAt);
  return !Number.isNaN(submittedAt)
    && submittedAt <= asOf.getTime()
    && entry.kind === "attempt"
    && entry.phase === "review-recall"
    && entry.submissionIndex === 0
    && entry.outcome === "perfect"
    && entry.supportLevelUsed === 0
    && !entry.answerWasRevealed
    && !entry.receivedCorrection
    && hasCompleteReviewContext(entry.context)
    && Date.parse(entry.context!.scheduledReviewDueAt!) <= submittedAt;
}

function assertInput(input: BetaReadinessInput): void {
  if (Number.isNaN(input.asOf.getTime())) throw new Error("Beta Readiness requires a valid as-of instant.");
  if (!Number.isSafeInteger(input.sessionWindowDays) || input.sessionWindowDays < 1) {
    throw new Error("Beta Readiness session window must contain at least one local day.");
  }
  if (!Number.isFinite(input.inactivityThresholdMs) || input.inactivityThresholdMs < 0) {
    throw new Error("Beta Readiness inactivity threshold must be a finite non-negative duration.");
  }
  if (input.measurementEpoch !== null && Number.isNaN(Date.parse(input.measurementEpoch))) {
    throw new Error("Beta Readiness measurement epoch must be a valid instant.");
  }
  localDateKey(input.asOf, input.timeZone);
}

function instantInReportingWindow(value: string, input: BetaReadinessInput): boolean {
  const time = Date.parse(value);
  if (Number.isNaN(time) || time > input.asOf.getTime()) return false;
  const days = new Set(enumerateCalendarDays(
    localDateKey(input.asOf, input.timeZone),
    input.sessionWindowDays,
  ));
  return days.has(localDateKey(value, input.timeZone));
}
