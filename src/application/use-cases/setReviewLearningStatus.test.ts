import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../domain/review/ReviewState";
import type { TrainingRepository } from "../ports/TrainingRepository";
import { setReviewLearningStatus } from "./setReviewLearningStatus";
import { setVocabularyStatus } from "./setVocabularyStatus";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";

const now = new Date("2026-07-18T12:00:00.000Z");

function createRepository(existingState?: ReviewState) {
  let savedState: ReviewState | undefined;
  let vocabularyEntry: VocabularyEntry | undefined;

  const repository: TrainingRepository = {
    listCourseCategories: async () => [],
    saveCourseCategories: async () => undefined,
    listLearningPaths: async () => [],
    saveLearningPaths: async () => undefined,
    listCourses: async () => [],
    getCourse: async () => undefined,
    saveCourses: async () => undefined,
    listSentenceCards: async () => [],
    getSentenceCard: async (cardId) => ({
      id: cardId,
      english: "Save this sentence.",
      prompt: "保存这个句子。",
      source: "Test",
      tags: [],
      acceptableAnswers: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }),
    saveSentenceCards: async (_cards: SentenceCard[]) => undefined,
    listReviewStates: async () => existingState ? [existingState] : [],
    getReviewState: async () => existingState,
    saveReviewState: async (state) => {
      savedState = state;
    },
    addPracticeLog: async (_entry: PracticeLogEntry) => undefined,
    savePracticeResult: async (state) => {
      savedState = state;
    },
    listPracticeLog: async () => [],
    listVocabularyEntries: async () => vocabularyEntry ? [vocabularyEntry] : [],
    getVocabularyEntry: async () => vocabularyEntry,
    saveVocabularyEntry: async (entry) => {
      vocabularyEntry = entry;
    },
    deleteVocabularyEntry: async () => {
      vocabularyEntry = undefined;
    },
    saveCourseCatalog: async () => undefined,
    clearLearningProgress: async () => undefined,
    clearAll: async () => undefined,
  };

  return {
    repository,
    getSavedState: () => savedState,
    getVocabularyEntry: () => vocabularyEntry,
  };
}

describe("setReviewLearningStatus", () => {
  it("creates and persists a mastered review state", async () => {
    const { repository, getSavedState } = createRepository();

    const result = await setReviewLearningStatus(repository, "card-1", "mastered", now);

    expect(result.learningStatus).toBe("mastered");
    expect(getSavedState()).toEqual(result);
  });
});

describe("setVocabularyStatus", () => {
  it("adds idempotently and removes a saved sentence independently of learning status", async () => {
    const { repository, getVocabularyEntry } = createRepository();

    const added = await setVocabularyStatus(repository, "card-1", true, now);
    const addedAgain = await setVocabularyStatus(repository, "card-1", true, new Date("2026-07-19T12:00:00.000Z"));

    expect(addedAgain).toEqual(added);
    expect(getVocabularyEntry()).toEqual(added);

    await setVocabularyStatus(repository, "card-1", false, now);
    expect(getVocabularyEntry()).toBeUndefined();
  });
});
