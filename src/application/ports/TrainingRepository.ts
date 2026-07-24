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
  addPracticeLog(entry: PracticeLogEntry): Promise<void>;
  savePracticeResult(reviewState: ReviewState, entry: PracticeLogEntry): Promise<void>;
  listPracticeLog(): Promise<PracticeLogEntry[]>;
  listVocabularyEntries(): Promise<VocabularyEntry[]>;
  getVocabularyEntry(cardId: SentenceCardId): Promise<VocabularyEntry | undefined>;
  saveVocabularyEntry(entry: VocabularyEntry): Promise<void>;
  deleteVocabularyEntry(cardId: SentenceCardId): Promise<void>;
  saveCourseCatalog(catalog: CourseCatalog): Promise<void>;
  clearLearningProgress(): Promise<void>;
  clearAll(): Promise<void>;
}
