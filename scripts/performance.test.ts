import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { getPracticeSnapshot, getTrainingSnapshot, BETA_SESSION_INACTIVITY_THRESHOLD_MS } from "../src/application/use-cases/getTrainingSnapshot";
import { UtterLoopService } from "../src/application/UtterLoopService";
import { BetaReadiness } from "../src/application/beta-readiness/BetaReadiness";
import { defaultCatalog } from "../src/application/seed/defaultCatalog";
import { DexieTrainingRepository } from "../src/infrastructure/persistence/dexie/DexieTrainingRepository";
import { UtterLoopDatabase } from "../src/infrastructure/persistence/dexie/UtterLoopDatabase";
import type { PracticeLogEntry } from "../src/domain/practice/PracticeLogEntry";
import { deriveProgressDashboard } from "../src/domain/progress/deriveProgressDashboard";
import { createPracticeStatisticsState, finalizePracticeStatistics, reducePracticeStatistics, summarizePracticeStatistics } from "../src/domain/progress/practiceStatistics";

const enabled = process.env.UTTERLOOP_PERFORMANCE === "1";
const now = new Date("2026-10-22T12:00:00.000Z");

describe.skipIf(!enabled)("long-history performance (opt-in)", () => {
  for (const count of [10_000, 100_000]) {
    it(`measures ${count.toLocaleString()} persisted events`, async () => {
      const database = new UtterLoopDatabase(`utterloop-performance-${count}`, () => now);
      try {
        const repository = new DexieTrainingRepository(database, () => now);
        await repository.saveCourseCatalog(defaultCatalog);
        await database.sentenceLearningStates.bulkPut(defaultCatalog.cards.map((card) => ({
          cardId: card.id, introducedAt: "2025-01-01T00:00:00.000Z",
          firstPassedAt: "2025-01-01T01:00:00.000Z", firstPassSource: "independent-recall" as const,
        })));
        await database.reviewStates.bulkPut(defaultCatalog.cards.map((card) => ({
          cardId: card.id, stage: 0 as const, streak: 0, lapseCount: 1,
          dueAt: "2025-01-01T00:00:00.000Z",
        })));
        const logs = Array.from({ length: count }, (_, index) => log(index));
        await database.practiceLog.bulkPut(logs);
        const legacy = await timed(() => legacySnapshot(repository));
        const complete = await timed(() => getTrainingSnapshot(repository, now));
        const practice = await timed(() => getPracticeSnapshot(repository, now));
        expect(complete.value.progressDashboard).toEqual(legacy.value.progressDashboard);
        expect(complete.value.betaReadiness).toEqual(legacy.value.betaReadiness);
        expect(complete.value.progressDashboard.retention.allTime.totalEvents).toBe(count);
        expect(practice.value.progressDashboard).toBeNull();

        const immutable = await timed(async () => finalizePracticeStatistics(logs.reduce(
          reducePracticeStatistics, createPracticeStatisticsState(now, "UTC"),
        )));
        const batch = await timed(async () => summarizePracticeStatistics(logs, now, 14, "UTC"));
        expect(batch.value).toEqual(immutable.value);

        await repository.acquirePracticeOwnership();
        const service = new UtterLoopService(repository);
        const legacySubmission = await timed(async () => {
          await submit(service, 0);
          return legacySnapshot(repository);
        });
        const practiceSubmission = await timed(async () => {
          await submit(service, 1);
          return getPracticeSnapshot(repository, now);
        });
        expect(await database.practiceLog.count()).toBe(count + 2);
        console.info(JSON.stringify({
          count,
          legacyStartupMs: legacy.ms,
          practiceStartupMs: practice.ms,
          analyticsSnapshotMs: complete.ms,
          legacySubmissionMs: legacySubmission.ms,
          practiceSubmissionMs: practiceSubmission.ms,
          immutableStatisticsMs: immutable.ms,
          batchStatisticsMs: batch.ms,
          processHeapUsedMb: Math.round(process.memoryUsage().heapUsed / 1_048_576),
        }));
      } finally {
        database.close();
        await database.delete();
      }
    }, 180_000);
  }
});

function log(index: number): PracticeLogEntry {
  const card = defaultCatalog.cards[index % defaultCatalog.cards.length];
  return {
    kind: "attempt",
    id: `performance-${index}`,
    turnId: `turn-${index}`,
    cardId: card.id,
    phase: "review-recall",
    submissionIndex: 0,
    submittedAt: new Date(now.getTime() - ((index % 365) * 86_400_000) - index).toISOString(),
    answer: card.english,
    outcome: index % 5 === 0 ? "close" : "perfect",
    accuracy: index % 5 === 0 ? 0.8 : 1,
    answerWasRevealed: false,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 2_000,
    supportLevelUsed: 0,
    supportKindsUsed: [],
    receivedCorrection: false,
    context: {
      sessionId: `session-${Math.floor(index / 10)}`,
      roundId: `round-${Math.floor(index / 10)}`,
      occurrenceId: `occurrence-${index}`,
      queueReason: "due-review",
      scheduledReviewDueAt: "2025-01-01T00:00:00.000Z",
    },
  };
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await run();
  return { value, ms: Math.round(performance.now() - started) };
}

async function submit(service: UtterLoopService, index: number) {
  const card = defaultCatalog.cards[index];
  const result = await service.submitPracticeTurn({
    cardId: card.id, answer: card.english, submittedAt: now.toISOString(),
    turnId: `benchmark-submission-${index}`, phase: "review-recall", submissionIndex: 0,
    answerWasRevealed: false, hadEdits: false, audioPlayCount: 0, durationMs: 2_000,
  }, now);
  expect(result.evaluation.outcome).toBe("perfect");
}

// Retain the pre-optimization read/reduce path so one command compares both versions.
async function legacySnapshot(repository: DexieTrainingRepository) {
  const [practice, statistics, practiceLog, sessionEvidence, measurementEpoch] = await Promise.all([
    getPracticeSnapshot(repository, now),
    repository.getPracticeStatistics(now, 14),
    repository.listAllPracticeLog(),
    repository.listEvidence(),
    repository.getMeasurementEpoch(),
  ]);
  return {
    progressDashboard: deriveProgressDashboard({
      cards: practice.cards, courses: practice.courses, learningPaths: practice.learningPaths,
      learningStates: practice.sentenceLearningStates, reviewStates: practice.reviewStates, statistics,
    }, now, statistics.timeZone),
    betaReadiness: BetaReadiness.measure({
      asOf: now, timeZone: statistics.timeZone, sessionWindowDays: 14,
      inactivityThresholdMs: BETA_SESSION_INACTIVITY_THRESHOLD_MS,
      measurementEpoch, activeCheckpoint: null,
      cards: practice.cards, learningStates: practice.sentenceLearningStates,
      reviewStates: practice.reviewStates, practiceLog, sessionEvidence,
    }),
  };
}
