import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCatalog } from "../../../application/seed/defaultCatalog";
import { DexieTrainingRepository } from "./DexieTrainingRepository";
import { utterLoopDatabase } from "./UtterLoopDatabase";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieTrainingRepository", () => {
  it("reads and writes course categories", async () => {
    const categories = defaultCatalog.categories;
    vi.spyOn(utterLoopDatabase.courseCategories, "toArray").mockResolvedValue(categories);
    const bulkPut = vi
      .spyOn(utterLoopDatabase.courseCategories, "bulkPut")
      .mockResolvedValue("everyday-communication");
    const repository = new DexieTrainingRepository();

    await expect(repository.listCourseCategories()).resolves.toEqual(categories);
    await repository.saveCourseCategories(categories);

    expect(bulkPut).toHaveBeenCalledWith(categories);
  });

  it("saves categories and course content in one transaction", async () => {
    const transaction = mockTransactionExecution();
    const saveCategories = vi
      .spyOn(utterLoopDatabase.courseCategories, "bulkPut")
      .mockResolvedValue("work-study");
    const savePaths = vi
      .spyOn(utterLoopDatabase.learningPaths, "bulkPut")
      .mockResolvedValue("utterloop-core-path");
    const saveCourses = vi
      .spyOn(utterLoopDatabase.courses, "bulkPut")
      .mockResolvedValue("work-study-essentials");
    const saveCards = vi
      .spyOn(utterLoopDatabase.sentenceCards, "bulkPut")
      .mockResolvedValue("wse-020");

    await new DexieTrainingRepository().saveCourseCatalog(defaultCatalog);

    expect(transaction).toHaveBeenCalledWith(
      "rw",
      utterLoopDatabase.courseCategories,
      utterLoopDatabase.learningPaths,
      utterLoopDatabase.courses,
      utterLoopDatabase.sentenceCards,
      expect.any(Function),
    );
    expect(saveCategories).toHaveBeenCalledWith(defaultCatalog.categories);
    expect(savePaths).toHaveBeenCalledWith(defaultCatalog.learningPaths);
    expect(saveCourses).toHaveBeenCalledWith(defaultCatalog.courses);
    expect(saveCards).toHaveBeenCalledWith(defaultCatalog.cards);
  });

  it("clears categories with all other stored data in one transaction", async () => {
    const transaction = mockTransactionExecution();
    const clearCategories = vi
      .spyOn(utterLoopDatabase.courseCategories, "clear")
      .mockResolvedValue();
    vi.spyOn(utterLoopDatabase.learningPaths, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.courses, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.sentenceCards, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.reviewStates, "clear").mockResolvedValue();
    vi.spyOn(utterLoopDatabase.practiceLog, "clear").mockResolvedValue();
    const clearVocabulary = vi.spyOn(utterLoopDatabase.vocabularyEntries, "clear").mockResolvedValue();

    await new DexieTrainingRepository().clearAll();

    expect(transaction).toHaveBeenCalledWith(
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
      expect.any(Function),
    );
    expect(clearCategories).toHaveBeenCalledOnce();
    expect(clearVocabulary).toHaveBeenCalledOnce();
  });

  it("stores review state and practice evidence in one transaction", async () => {
    const transaction = mockTransactionExecution();
    const reviewState = {
      cardId: "card-1",
      stage: 0 as const,
      dueAt: "2026-07-23T00:10:00.000Z",
      streak: 0,
      lapseCount: 1,
    };
    const entry = {
      id: "attempt-1",
      cardId: "card-1",
      submittedAt: "2026-07-23T00:00:00.000Z",
      answer: "",
      outcome: "skipped" as const,
      accuracy: 0,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 0,
    };
    const saveReview = vi.spyOn(utterLoopDatabase.reviewStates, "put").mockResolvedValue("card-1");
    const saveLog = vi.spyOn(utterLoopDatabase.practiceLog, "put").mockResolvedValue("attempt-1");

    await new DexieTrainingRepository().savePracticeResult(reviewState, entry);

    expect(transaction).toHaveBeenCalledWith(
      "rw",
      utterLoopDatabase.reviewStates,
      utterLoopDatabase.practiceLog,
      expect.any(Function),
    );
    expect(saveReview).toHaveBeenCalledWith(reviewState);
    expect(saveLog).toHaveBeenCalledWith(entry);
  });
});

function mockTransactionExecution() {
  return vi
    .spyOn(utterLoopDatabase, "transaction")
    .mockImplementation((async (...args: unknown[]) => {
      const operation = args.at(-1) as () => Promise<void>;
      await operation();
    }) as never);
}
