import type { SentenceCard, SentenceCardId } from "../../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../../domain/review/ReviewState";
import type { TrainingRepository } from "../../../application/ports/TrainingRepository";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../../domain/curriculum/Course";
import type { CourseCatalog } from "../../../domain/curriculum/validateCourseCatalog";
import type { VocabularyEntry } from "../../../domain/vocabulary/VocabularyEntry";
import { utterLoopDatabase } from "./UtterLoopDatabase";

export class DexieTrainingRepository implements TrainingRepository {
  async listCourseCategories(): Promise<CourseCategory[]> {
    return utterLoopDatabase.courseCategories.toArray();
  }

  async saveCourseCategories(categories: CourseCategory[]): Promise<void> {
    await utterLoopDatabase.courseCategories.bulkPut(categories);
  }

  async listLearningPaths(): Promise<LearningPath[]> {
    return utterLoopDatabase.learningPaths.toArray();
  }

  async saveLearningPaths(paths: LearningPath[]): Promise<void> {
    await utterLoopDatabase.learningPaths.bulkPut(paths);
  }

  async listCourses(): Promise<Course[]> {
    return utterLoopDatabase.courses.toArray();
  }

  async getCourse(courseId: string): Promise<Course | undefined> {
    return utterLoopDatabase.courses.get(courseId);
  }

  async saveCourses(courses: Course[]): Promise<void> {
    await utterLoopDatabase.courses.bulkPut(courses);
  }

  async listSentenceCards(): Promise<SentenceCard[]> {
    return utterLoopDatabase.sentenceCards.orderBy("updatedAt").reverse().toArray();
  }

  async getSentenceCard(cardId: SentenceCardId): Promise<SentenceCard | undefined> {
    return utterLoopDatabase.sentenceCards.get(cardId);
  }

  async saveSentenceCards(cards: SentenceCard[]): Promise<void> {
    await utterLoopDatabase.sentenceCards.bulkPut(cards);
  }

  async listReviewStates(): Promise<ReviewState[]> {
    return utterLoopDatabase.reviewStates.toArray();
  }

  async getReviewState(cardId: SentenceCardId): Promise<ReviewState | undefined> {
    return utterLoopDatabase.reviewStates.get(cardId);
  }

  async saveReviewState(reviewState: ReviewState): Promise<void> {
    await utterLoopDatabase.reviewStates.put(reviewState);
  }

  async addPracticeLog(entry: PracticeLogEntry): Promise<void> {
    await utterLoopDatabase.practiceLog.put(entry);
  }

  async savePracticeResult(reviewState: ReviewState, entry: PracticeLogEntry): Promise<void> {
    await utterLoopDatabase.transaction(
      "rw",
      utterLoopDatabase.reviewStates,
      utterLoopDatabase.practiceLog,
      async () => {
        await utterLoopDatabase.reviewStates.put(reviewState);
        await utterLoopDatabase.practiceLog.put(entry);
      },
    );
  }

  async listPracticeLog(): Promise<PracticeLogEntry[]> {
    return utterLoopDatabase.practiceLog.orderBy("submittedAt").reverse().limit(500).toArray();
  }

  async listVocabularyEntries(): Promise<VocabularyEntry[]> {
    return utterLoopDatabase.vocabularyEntries.orderBy("savedAt").reverse().toArray();
  }

  async getVocabularyEntry(cardId: SentenceCardId): Promise<VocabularyEntry | undefined> {
    return utterLoopDatabase.vocabularyEntries.get(cardId);
  }

  async saveVocabularyEntry(entry: VocabularyEntry): Promise<void> {
    await utterLoopDatabase.vocabularyEntries.put(entry);
  }

  async deleteVocabularyEntry(cardId: SentenceCardId): Promise<void> {
    await utterLoopDatabase.vocabularyEntries.delete(cardId);
  }

  async saveCourseCatalog(catalog: CourseCatalog): Promise<void> {
    await utterLoopDatabase.transaction(
      "rw",
      utterLoopDatabase.courseCategories,
      utterLoopDatabase.learningPaths,
      utterLoopDatabase.courses,
      utterLoopDatabase.sentenceCards,
      async () => {
        await utterLoopDatabase.courseCategories.bulkPut(catalog.categories);
        await utterLoopDatabase.learningPaths.bulkPut(catalog.learningPaths);
        await utterLoopDatabase.courses.bulkPut(catalog.courses);
        await utterLoopDatabase.sentenceCards.bulkPut(catalog.cards);
      },
    );
  }

  async clearLearningProgress(): Promise<void> {
    await utterLoopDatabase.transaction("rw", utterLoopDatabase.reviewStates, utterLoopDatabase.practiceLog, async () => {
      await utterLoopDatabase.reviewStates.clear();
      await utterLoopDatabase.practiceLog.clear();
    });
  }

  async clearAll(): Promise<void> {
    await utterLoopDatabase.transaction(
      "rw",
      [
        utterLoopDatabase.courseCategories,
        utterLoopDatabase.learningPaths,
        utterLoopDatabase.courses,
        utterLoopDatabase.sentenceCards,
        utterLoopDatabase.reviewStates,
        utterLoopDatabase.practiceLog,
        utterLoopDatabase.vocabularyEntries,
      ],
      async () => {
        await utterLoopDatabase.courseCategories.clear();
        await utterLoopDatabase.learningPaths.clear();
        await utterLoopDatabase.courses.clear();
        await utterLoopDatabase.sentenceCards.clear();
        await utterLoopDatabase.reviewStates.clear();
        await utterLoopDatabase.practiceLog.clear();
        await utterLoopDatabase.vocabularyEntries.clear();
      },
    );
  }
}
