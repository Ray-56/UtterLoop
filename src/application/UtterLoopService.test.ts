import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../domain/content/SentenceCard";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../domain/curriculum/Course";
import type { CourseCatalog } from "../domain/curriculum/validateCourseCatalog";
import type { PracticeLogEntry } from "../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../domain/review/ReviewState";
import type { SentenceLearningState } from "../domain/learning/SentenceLearningState";
import type { AtomicPracticeWrite } from "./ports/TrainingRepository";
import type { TrainingRepository } from "./ports/TrainingRepository";
import { defaultCatalog } from "./seed/defaultCatalog";
import {
  COURSE_BUNDLE_SCHEMA_VERSION,
  type CourseBundle,
  UtterLoopService,
} from "./UtterLoopService";

describe("UtterLoopService course bundles", () => {
  it("exports the complete stored catalog with schema version 2", async () => {
    const service = new UtterLoopService(new BundleRepository(defaultCatalog));

    await expect(service.exportCourseBundle()).resolves.toEqual({
      schemaVersion: COURSE_BUNDLE_SCHEMA_VERSION,
      ...defaultCatalog,
    });
  });

  it("validates and imports a schema version 2 bundle without persisting the envelope", async () => {
    const repository = new BundleRepository(emptyCatalog());
    const service = new UtterLoopService(repository);
    const bundle: CourseBundle = {
      schemaVersion: COURSE_BUNDLE_SCHEMA_VERSION,
      ...defaultCatalog,
    };

    await service.importCourseBundle(bundle);

    expect(repository.savedCatalogs).toEqual([defaultCatalog]);
  });

  it("rejects a legacy unversioned catalog before writing", async () => {
    const repository = new BundleRepository(emptyCatalog());
    const service = new UtterLoopService(repository);
    const legacyBundle = defaultCatalog as unknown as CourseBundle;

    await expect(service.importCourseBundle(legacyBundle)).rejects.toThrow(
      "Course bundle must use schema version 2.",
    );
    expect(repository.savedCatalogs).toEqual([]);
  });

  it("rejects a schema-incomplete bundle before writing", async () => {
    const repository = new BundleRepository(emptyCatalog());
    const service = new UtterLoopService(repository);
    const incompleteBundle = {
      schemaVersion: COURSE_BUNDLE_SCHEMA_VERSION,
      learningPaths: defaultCatalog.learningPaths,
      courses: defaultCatalog.courses,
      cards: defaultCatalog.cards,
    } as unknown as CourseBundle;

    await expect(service.importCourseBundle(incompleteBundle)).rejects.toThrow(
      "Course bundle categories must be an array.",
    );
    expect(repository.savedCatalogs).toEqual([]);
  });
});

class BundleRepository implements TrainingRepository {
  readonly savedCatalogs: CourseCatalog[] = [];

  constructor(private readonly catalog: CourseCatalog) {}

  async listCourseCategories(): Promise<CourseCategory[]> {
    return this.catalog.categories;
  }

  async saveCourseCategories(): Promise<void> {}

  async listLearningPaths(): Promise<LearningPath[]> {
    return this.catalog.learningPaths;
  }

  async saveLearningPaths(): Promise<void> {}

  async listCourses(): Promise<Course[]> {
    return this.catalog.courses;
  }

  async getCourse(): Promise<Course | undefined> {
    return undefined;
  }

  async saveCourses(): Promise<void> {}

  async listSentenceCards(): Promise<SentenceCard[]> {
    return this.catalog.cards;
  }

  async getSentenceCard(): Promise<SentenceCard | undefined> {
    return undefined;
  }

  async saveSentenceCards(): Promise<void> {}

  async listReviewStates(): Promise<ReviewState[]> {
    return [];
  }

  async getReviewState(): Promise<ReviewState | undefined> {
    return undefined;
  }

  async saveReviewState(): Promise<void> {}

  async listSentenceLearningStates(): Promise<SentenceLearningState[]> { return []; }

  async getSentenceLearningState(): Promise<SentenceLearningState | undefined> { return undefined; }

  async saveSentenceLearningState(): Promise<void> {}

  async saveLearningAndReviewState(): Promise<void> {}

  async getPracticeLogEntry(): Promise<PracticeLogEntry | undefined> { return undefined; }

  async savePracticeWrite(write: AtomicPracticeWrite) { return { entry: write.logEntry, created: true }; }

  async addPracticeLog(): Promise<void> {}

  async savePracticeResult(): Promise<void> {}

  async listPracticeLog(): Promise<PracticeLogEntry[]> {
    return [];
  }

  async listRecentPracticeActivity() { return { entries: [], limit: 500, totalEntries: 0, isTruncated: false }; }

  async getPracticeStatistics(): Promise<never> { throw new Error("Not used by this fixture."); }

  async listAllPracticeLog(): Promise<PracticeLogEntry[]> { return []; }

  async listVocabularyEntries() {
    return [];
  }

  async getVocabularyEntry() {
    return undefined;
  }

  async saveVocabularyEntry() {}

  async deleteVocabularyEntry() {}

  async saveCourseCatalog(catalog: CourseCatalog): Promise<void> {
    this.savedCatalogs.push(catalog);
  }

  async getAppPreferences() { return undefined; }

  async saveAppPreferences() {}

  async getPracticeSessionCheckpoint() { return undefined; }

  async savePracticeSessionCheckpoint() {}

  async deletePracticeSessionCheckpoint() {}

  async readFullBackup(): Promise<never> { throw new Error("Not used by this fixture."); }

  async replaceAllData() {}

  async clearLearningProgress(): Promise<void> {}

  async clearAll(): Promise<void> {}
}

function emptyCatalog(): CourseCatalog {
  return {
    categories: [],
    learningPaths: [],
    courses: [],
    cards: [],
  };
}
