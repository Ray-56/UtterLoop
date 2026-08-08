import type { SentenceCard, SentenceCardId } from "../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../domain/review/ReviewState";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../domain/curriculum/Course";
import type { CourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type {
  AppPreferences,
  UtterLoopFullBackupV2,
} from "../../domain/backup/UtterLoopFullBackup";
import type { PracticeStatistics } from "../../domain/progress/practiceStatistics";
import type { PracticeSessionCheckpoint } from "../practice-session/PracticeSessionCheckpoint";

export const RECENT_PRACTICE_LOG_LIMIT = 500 as const;

export interface RecentPracticeActivity {
  entries: PracticeLogEntry[];
  limit: number;
  totalEntries: number;
  isTruncated: boolean;
}

export interface AtomicPracticeWrite {
  learningState?: SentenceLearningState;
  reviewState?: ReviewState;
  logEntry: PracticeLogEntry;
}

export interface AtomicPracticeWriteResult {
  entry: PracticeLogEntry;
  created: boolean;
}

export interface TrainingRepository {
  listCourseCategories(): Promise<CourseCategory[]>;
  saveCourseCategories(categories: CourseCategory[]): Promise<void>;
  listLearningPaths(): Promise<LearningPath[]>;
  saveLearningPaths(paths: LearningPath[]): Promise<void>;
  listCourses(): Promise<Course[]>;
  getCourse(courseId: string): Promise<Course | undefined>;
  saveCourses(courses: Course[]): Promise<void>;
  listSentenceCards(): Promise<SentenceCard[]>;
  getSentenceCard(cardId: SentenceCardId): Promise<SentenceCard | undefined>;
  saveSentenceCards(cards: SentenceCard[]): Promise<void>;
  listReviewStates(): Promise<ReviewState[]>;
  getReviewState(cardId: SentenceCardId): Promise<ReviewState | undefined>;
  saveReviewState(reviewState: ReviewState): Promise<void>;
  listSentenceLearningStates(): Promise<SentenceLearningState[]>;
  getSentenceLearningState(cardId: SentenceCardId): Promise<SentenceLearningState | undefined>;
  saveSentenceLearningState(state: SentenceLearningState): Promise<void>;
  saveLearningAndReviewState(state: SentenceLearningState, reviewState: ReviewState): Promise<void>;
  getPracticeLogEntry(id: string): Promise<PracticeLogEntry | undefined>;
  savePracticeWrite(write: AtomicPracticeWrite): Promise<AtomicPracticeWriteResult>;
  addPracticeLog(entry: PracticeLogEntry): Promise<void>;
  savePracticeResult(reviewState: ReviewState, entry: PracticeLogEntry): Promise<void>;
  listPracticeLog(): Promise<PracticeLogEntry[]>;
  listRecentPracticeActivity(limit?: number): Promise<RecentPracticeActivity>;
  getPracticeStatistics(now: Date, days: number, timeZone?: string): Promise<PracticeStatistics>;
  listAllPracticeLog(): Promise<PracticeLogEntry[]>;
  listVocabularyEntries(): Promise<VocabularyEntry[]>;
  getVocabularyEntry(cardId: SentenceCardId): Promise<VocabularyEntry | undefined>;
  saveVocabularyEntry(entry: VocabularyEntry): Promise<void>;
  deleteVocabularyEntry(cardId: SentenceCardId): Promise<void>;
  saveCourseCatalog(catalog: CourseCatalog): Promise<void>;
  getAppPreferences(): Promise<AppPreferences | undefined>;
  saveAppPreferences(preferences: AppPreferences): Promise<void>;
  getPracticeSessionCheckpoint(): Promise<PracticeSessionCheckpoint | undefined>;
  savePracticeSessionCheckpoint(checkpoint: PracticeSessionCheckpoint): Promise<void>;
  deletePracticeSessionCheckpoint(): Promise<void>;
  readFullBackup(exportedAt: string): Promise<UtterLoopFullBackupV2>;
  replaceAllData(backup: UtterLoopFullBackupV2): Promise<void>;
  clearLearningProgress(): Promise<void>;
  clearAll(): Promise<void>;
}
