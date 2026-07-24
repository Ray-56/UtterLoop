import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
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

export interface TrainingSnapshot {
  categories: CourseCategory[];
  learningPaths: LearningPath[];
  courses: Course[];
  cards: SentenceCard[];
  reviewStates: ReviewState[];
  practiceLog: PracticeLogEntry[];
  queue: PracticeQueue;
  courseProgress: CourseProgress[];
  pathProgress: LearningPathProgress[];
  vocabularyEntries: VocabularyEntry[];
}

export async function getTrainingSnapshot(repository: TrainingRepository, now: Date): Promise<TrainingSnapshot> {
  const [categories, learningPaths, courses, cards, reviewStates, practiceLog, vocabularyEntries] = await Promise.all([
    repository.listCourseCategories(),
    repository.listLearningPaths(),
    repository.listCourses(),
    repository.listSentenceCards(),
    repository.listReviewStates(),
    repository.listPracticeLog(),
    repository.listVocabularyEntries(),
  ]);

  return {
    categories,
    learningPaths,
    courses,
    cards,
    reviewStates,
    practiceLog,
    queue: buildPracticeQueue(cards, reviewStates, now),
    courseProgress: courses.map((course) => deriveCourseProgress(course, reviewStates)),
    pathProgress: learningPaths.map((path) => deriveLearningPathProgress(path, courses, reviewStates)),
    vocabularyEntries,
  };
}
