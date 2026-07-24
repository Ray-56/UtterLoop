import { describe, expect, it } from "vitest";
import type { TrainingRepository } from "../ports/TrainingRepository";
import { getTrainingSnapshot } from "./getTrainingSnapshot";

const category = {
  id: "category-1",
  title: "Everyday Communication",
  description: "Practical language for everyday communication.",
  sortOrder: 0,
};

const course = {
  id: "course-1",
  title: "Course One",
  description: "A test course.",
  categoryId: category.id,
  tags: ["test"],
  level: {
    label: "Starter · A1",
    cefrFrom: "A1" as const,
    cefrTo: "A1" as const,
  },
  provider: {
    kind: "original" as const,
    name: "Test",
  },
  revision: 1,
  license: {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "No attribution required.",
  },
  units: [
    {
      id: "unit-1",
      title: "Unit One",
      description: "A test unit.",
      lessons: [
        {
          id: "lesson-1",
          title: "Lesson One",
          objective: "Pass the card.",
          cardIds: ["card-1"],
        },
      ],
    },
  ],
};

const path = {
  id: "path-1",
  title: "Path One",
  description: "A test path.",
  courseIds: [course.id],
};

const card = {
  id: "card-1",
  english: "This is one sentence.",
  prompt: "这是一个句子。",
  source: "Test",
  tags: ["test"],
  acceptableAnswers: [],
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("getTrainingSnapshot", () => {
  it("returns independent course and path progress without reviewing untouched cards", async () => {
    const snapshot = await getTrainingSnapshot(new SnapshotRepository(), new Date("2026-07-19T00:00:00.000Z"));

    expect(snapshot.categories).toEqual([category]);
    expect(snapshot.learningPaths).toEqual([path]);
    expect(snapshot.courses).toEqual([course]);
    expect(snapshot.courseProgress[0]).toMatchObject({
      courseId: "course-1",
      status: "not-started",
      recommendedLessonId: "lesson-1",
    });
    expect(snapshot.pathProgress[0]).toMatchObject({
      pathId: "path-1",
      recommendedCourseId: "course-1",
      recommendedLessonId: "lesson-1",
    });
    expect(snapshot.queue.due).toEqual([]);
    expect(snapshot.vocabularyEntries).toEqual([]);
  });
});

class SnapshotRepository implements TrainingRepository {
  async listCourseCategories() { return [category]; }
  async saveCourseCategories() {}
  async listLearningPaths() { return [path]; }
  async saveLearningPaths() {}
  async listCourses() { return [course]; }
  async getCourse() { return course; }
  async saveCourses() {}
  async listSentenceCards() { return [card]; }
  async getSentenceCard() { return card; }
  async saveSentenceCards() {}
  async listReviewStates() { return []; }
  async getReviewState() { return undefined; }
  async saveReviewState() {}
  async addPracticeLog() {}
  async savePracticeResult() {}
  async listPracticeLog() { return []; }
  async listVocabularyEntries() { return []; }
  async getVocabularyEntry() { return undefined; }
  async saveVocabularyEntry() {}
  async deleteVocabularyEntry() {}
  async saveCourseCatalog() {}
  async clearLearningProgress() {}
  async clearAll() {}
}
