import Dexie, { type Table } from "dexie";
import type { SentenceCard } from "../../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../../domain/review/ReviewState";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../../domain/curriculum/Course";
import type { VocabularyEntry } from "../../../domain/vocabulary/VocabularyEntry";

export class UtterLoopDatabase extends Dexie {
  courseCategories!: Table<CourseCategory, string>;
  learningPaths!: Table<LearningPath, string>;
  courses!: Table<Course, string>;
  sentenceCards!: Table<SentenceCard, string>;
  reviewStates!: Table<ReviewState, string>;
  practiceLog!: Table<PracticeLogEntry, string>;
  vocabularyEntries!: Table<VocabularyEntry, string>;

  constructor() {
    super("utterloop-courses");

    this.version(1).stores({
      learningPaths: "id",
      courses: "id, revision",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome",
    });

    this.version(2).stores({
      courseCategories: "id, sortOrder",
      learningPaths: "id",
      courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome",
    });

    this.version(3).stores({
      courseCategories: "id, sortOrder",
      learningPaths: "id",
      courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags",
      reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome",
      vocabularyEntries: "cardId, savedAt",
    });
  }
}

export const utterLoopDatabase = new UtterLoopDatabase();
