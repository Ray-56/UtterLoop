import type { ReviewState } from "../../domain/review/ReviewState";
import { buildPracticeQueue } from "../../domain/training/buildPracticeQueue";
import type { PracticeQueue } from "../../domain/training/PracticeQueue";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../domain/curriculum/Course";
import { deriveCourseProgress, type CourseProgress } from "../../domain/curriculum/deriveCourseProgress";
import {
  deriveLearningPathProgress,
  type LearningPathProgress,
} from "../../domain/curriculum/deriveLearningPathProgress";
import type { TrainingRepository } from "../ports/TrainingRepository";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import {
  deriveProgressDashboard,
  type ProgressDashboard,
} from "../../domain/progress/deriveProgressDashboard";
import type { RecentPracticeActivity } from "../ports/TrainingRepository";
import {
  buildReviewDashboard,
  type ReviewDashboard,
} from "../../domain/review/buildReviewDashboard";
import {
  DEFAULT_FINGER_GUIDE_MODE,
  normalizeAppPreferences,
  type AppPreferences,
} from "../../domain/backup/UtterLoopFullBackup";
import {
  BetaReadiness,
  type BetaReadinessSnapshot,
} from "../beta-readiness/BetaReadiness";
import type { PracticeSessionStore } from "../ports/PracticeSessionStore";
import type { PracticeSessionCheckpointV2 } from "../practice-session/PracticeSessionCheckpoint";

export const BETA_READINESS_WINDOW_DAYS = 14 as const;
export const BETA_SESSION_INACTIVITY_THRESHOLD_MS = 24 * 60 * 60 * 1_000;

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  id: "device",
  theme: "system",
  speechVoiceUri: null,
  keySoundMuted: false,
  fingerGuideMode: DEFAULT_FINGER_GUIDE_MODE,
  quickStart: null,
};

export interface TrainingSnapshot {
  categories: CourseCategory[];
  learningPaths: LearningPath[];
  courses: Course[];
  cards: SentenceCard[];
  reviewStates: ReviewState[];
  sentenceLearningStates: SentenceLearningState[];
  recentPracticeActivity: RecentPracticeActivity;
  reviewDashboard: ReviewDashboard;
  progressDashboard: ProgressDashboard;
  betaReadiness: BetaReadinessSnapshot | null;
  queue: PracticeQueue;
  courseProgress: CourseProgress[];
  pathProgress: LearningPathProgress[];
  vocabularyEntries: VocabularyEntry[];
  preferences: AppPreferences;
}

export async function getTrainingSnapshot(repository: TrainingRepository, now: Date): Promise<TrainingSnapshot> {
  const betaEvidencePromise = isBetaReadinessRepository(repository)
    ? Promise.all([
        repository.listAllPracticeLog(),
        repository.listEvidence(),
        repository.getMeasurementEpoch(),
        repository.loadActiveCheckpoint(),
      ])
    : Promise.resolve(null);
  const [
    categories,
    learningPaths,
    courses,
    cards,
    reviewStates,
    sentenceLearningStates,
    recentPracticeActivity,
    practiceStatistics,
    vocabularyEntries,
    storedPreferences,
    betaEvidence,
  ] = await Promise.all([
    repository.listCourseCategories(),
    repository.listLearningPaths(),
    repository.listCourses(),
    repository.listSentenceCards(),
    repository.listReviewStates(),
    repository.listSentenceLearningStates(),
    repository.listRecentPracticeActivity(),
    repository.getPracticeStatistics(now, 14),
    repository.listVocabularyEntries(),
    repository.getAppPreferences(),
    betaEvidencePromise,
  ]);

  return {
    categories,
    learningPaths,
    courses,
    cards,
    reviewStates,
    sentenceLearningStates,
    recentPracticeActivity,
    reviewDashboard: buildReviewDashboard({
      cards,
      courses,
      learningStates: sentenceLearningStates,
      reviewStates,
      vocabularyEntries,
      selectedCourseId: null,
    }, now),
    progressDashboard: deriveProgressDashboard({
      cards,
      courses,
      learningPaths,
      learningStates: sentenceLearningStates,
      reviewStates,
      statistics: practiceStatistics,
    }, now, practiceStatistics.timeZone),
    betaReadiness: betaEvidence
      ? BetaReadiness.measure({
          asOf: now,
          timeZone: practiceStatistics.timeZone,
          sessionWindowDays: BETA_READINESS_WINDOW_DAYS,
          inactivityThresholdMs: BETA_SESSION_INACTIVITY_THRESHOLD_MS,
          measurementEpoch: betaEvidence[2],
          activeCheckpoint: projectActiveCheckpoint(betaEvidence[3]),
          cards,
          learningStates: sentenceLearningStates,
          reviewStates,
          practiceLog: betaEvidence[0],
          sessionEvidence: betaEvidence[1],
        })
      : null,
    queue: buildPracticeQueue(cards, reviewStates, now),
    courseProgress: courses.map((course) => deriveCourseProgress(course, sentenceLearningStates)),
    pathProgress: learningPaths.map((path) => deriveLearningPathProgress(path, courses, sentenceLearningStates)),
    vocabularyEntries,
    preferences: storedPreferences
      ? normalizeAppPreferences(storedPreferences)
      : { ...DEFAULT_APP_PREFERENCES },
  };
}

type BetaReadinessRepository = TrainingRepository & Pick<
  PracticeSessionStore,
  "loadActiveCheckpoint" | "listEvidence" | "getMeasurementEpoch"
>;

function isBetaReadinessRepository(
  repository: TrainingRepository,
): repository is BetaReadinessRepository {
  const candidate = repository as Partial<BetaReadinessRepository>;
  return typeof candidate.loadActiveCheckpoint === "function"
    && typeof candidate.listEvidence === "function"
    && typeof candidate.getMeasurementEpoch === "function";
}

function projectActiveCheckpoint(
  checkpoint: Awaited<ReturnType<PracticeSessionStore["loadActiveCheckpoint"]>>,
) {
  if (!checkpoint || checkpoint.schemaVersion !== 2) return null;
  const active: PracticeSessionCheckpointV2 = checkpoint;
  return {
    sessionId: active.sessionId,
    roundId: active.roundId,
    entryPoint: active.entryPoint,
    startedAt: active.startedAt,
    engagedAt: active.engagedAt,
    updatedAt: active.updatedAt,
  };
}
