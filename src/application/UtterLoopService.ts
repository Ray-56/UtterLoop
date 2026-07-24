import type { SentenceCard } from "../domain/content/SentenceCard";
import type { CourseCatalog } from "../domain/curriculum/validateCourseCatalog";
import { validateCourseCatalog } from "../domain/curriculum/validateCourseCatalog";
import type { LearningStatus } from "../domain/review/ReviewState";
import type { TrainingRepository } from "./ports/TrainingRepository";
import { defaultCatalog } from "./seed/defaultCatalog";
import { ensureDefaultCatalog } from "./seed/ensureDefaultCatalog";
import { getTrainingSnapshot } from "./use-cases/getTrainingSnapshot";
import { previewPracticeAttempt } from "./use-cases/previewPracticeAttempt";
import { setReviewLearningStatus } from "./use-cases/setReviewLearningStatus";
import { submitPracticeAttempt } from "./use-cases/submitPracticeAttempt";
import { setVocabularyStatus } from "./use-cases/setVocabularyStatus";
import { skipPracticeCard } from "./use-cases/skipPracticeCard";
import { revealPracticeAnswer } from "./use-cases/revealPracticeAnswer";
import type { AttemptEvidence } from "../domain/practice/PracticeAttempt";

export const COURSE_BUNDLE_SCHEMA_VERSION = 2 as const;

export interface CourseBundle extends CourseCatalog {
  schemaVersion: typeof COURSE_BUNDLE_SCHEMA_VERSION;
}

export class UtterLoopService {
  constructor(private readonly repository: TrainingRepository) {}

  ensureDefaultCatalog() {
    return ensureDefaultCatalog(this.repository);
  }

  getSnapshot(now = new Date()) {
    return getTrainingSnapshot(this.repository, now);
  }

  submitAttempt(
    cardId: string,
    answer: string,
    evidence: AttemptEvidence,
    now = new Date(),
  ) {
    return submitPracticeAttempt(
      this.repository,
      {
        cardId,
        answer,
        submittedAt: now.toISOString(),
        ...evidence,
      },
      now,
    );
  }

  previewAttempt(card: SentenceCard, answer: string) {
    return previewPracticeAttempt(card, answer);
  }

  setReviewLearningStatus(cardId: string, status: LearningStatus, now = new Date()) {
    return setReviewLearningStatus(this.repository, cardId, status, now);
  }

  setVocabularyStatus(cardId: string, isSaved: boolean, now = new Date()) {
    return setVocabularyStatus(this.repository, cardId, isSaved, now);
  }

  skipPracticeCard(
    cardId: string,
    evidence: AttemptEvidence,
    now = new Date(),
  ) {
    return skipPracticeCard(this.repository, cardId, evidence, now);
  }

  revealPracticeAnswer(
    cardId: string,
    evidence: AttemptEvidence,
    now = new Date(),
  ) {
    return revealPracticeAnswer(this.repository, cardId, evidence, now);
  }

  async exportCourseBundle(): Promise<CourseBundle> {
    const [categories, learningPaths, courses, cards] = await Promise.all([
      this.repository.listCourseCategories(),
      this.repository.listLearningPaths(),
      this.repository.listCourses(),
      this.repository.listSentenceCards(),
    ]);

    return {
      schemaVersion: COURSE_BUNDLE_SCHEMA_VERSION,
      categories,
      learningPaths,
      courses,
      cards,
    };
  }

  async importCourseBundle(bundle: CourseBundle) {
    if (bundle?.schemaVersion !== COURSE_BUNDLE_SCHEMA_VERSION) {
      throw new Error("Course bundle must use schema version 2.");
    }

    assertBundleArray(bundle.categories, "categories");
    assertBundleArray(bundle.learningPaths, "learningPaths");
    assertBundleArray(bundle.courses, "courses");
    assertBundleArray(bundle.cards, "cards");

    const catalog: CourseCatalog = {
      categories: bundle.categories,
      learningPaths: bundle.learningPaths,
      courses: bundle.courses,
      cards: bundle.cards,
    };
    validateCourseCatalog(catalog);
    await this.repository.saveCourseCatalog(catalog);
  }

  restoreDefaultCourses() {
    return this.repository.saveCourseCatalog(defaultCatalog);
  }

  clearLearningProgress() {
    return this.repository.clearLearningProgress();
  }

  clearAll() {
    return this.repository.clearAll();
  }
}

function assertBundleArray(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Course bundle ${field} must be an array.`);
  }
}
