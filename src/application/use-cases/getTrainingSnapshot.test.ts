import { describe, expect, it } from "vitest";
import type { ContextualPracticeLogEntry } from "../../domain/practice/PracticeSessionEvidence";
import type { ReviewState } from "../../domain/review/ReviewState";
import type { AppPreferences } from "../../domain/backup/UtterLoopFullBackup";
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

  it("keeps recent activity bounded while deriving Progress from complete-history statistics", async () => {
    const snapshot = await getTrainingSnapshot(
      new SnapshotRepository(),
      new Date("2026-07-19T00:00:00.000Z"),
    );

    expect(snapshot.recentPracticeActivity).toEqual({
      entries: [],
      limit: 500,
      totalEntries: 650,
      isTruncated: true,
    });
    expect(snapshot.progressDashboard.retention.allTime.totalEvents).toBe(650);
    expect(snapshot.progressDashboard.timeZone).toBe("UTC");
    expect(snapshot).not.toHaveProperty("practiceLog");
  });

  it("projects Review data without leaking target sentences", async () => {
    const snapshot = await getTrainingSnapshot(
      new DueReviewRepository(),
      new Date("2026-07-19T00:00:00.000Z"),
    );

    expect(snapshot.reviewDashboard.due).toEqual([
      expect.objectContaining({
        cardId: "card-1",
        prompt: "这是一个句子。",
        isDue: true,
      }),
    ]);
    expect(JSON.stringify(snapshot.reviewDashboard)).not.toContain(card.english);
  });

  it("supplies explicit device defaults when preferences have not been persisted", async () => {
    const snapshot = await getTrainingSnapshot(
      new SnapshotRepository(),
      new Date("2026-07-19T00:00:00.000Z"),
    );

    expect(snapshot.preferences).toEqual({
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: null,
    });
  });

  it("normalizes an existing preference row that predates Finger Guide modes", async () => {
    const snapshot = await getTrainingSnapshot(
      new LegacyPreferenceRepository(),
      new Date("2026-07-19T00:00:00.000Z"),
    );

    expect(snapshot.preferences).toEqual({
      id: "device",
      theme: "dark",
      speechVoiceUri: null,
      keySoundMuted: true,
      fingerGuideMode: "auto",
      quickStart: null,
    });
  });

  it("projects Beta readiness only when the repository exposes durable session evidence", async () => {
    const withoutEvidenceStore = await getTrainingSnapshot(
      new SnapshotRepository(),
      new Date("2026-08-01T12:00:00.000Z"),
    );
    const withEvidenceStore = await getTrainingSnapshot(
      new BetaSnapshotRepository(),
      new Date("2026-08-01T12:00:00.000Z"),
    );

    expect(withoutEvidenceStore.betaReadiness).toBeNull();
    expect(withEvidenceStore.betaReadiness).not.toBeNull();
    expect(withEvidenceStore.betaReadiness?.sessionWindowDays).toBe(14);
    expect(withEvidenceStore.betaReadiness?.retention.weeklyRetainedIndependentSentences)
      .toMatchObject({ numerator: 1, denominator: 1 });
    expect(withEvidenceStore.betaReadiness?.retention.dueBacklog.count).toBe(0);
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
  async listReviewStates(): Promise<ReviewState[]> { return []; }
  async getReviewState() { return undefined; }
  async saveReviewState() {}
  async listSentenceLearningStates() { return []; }
  async getSentenceLearningState() { return undefined; }
  async saveSentenceLearningState() {}
  async saveLearningAndReviewState() {}
  async getPracticeLogEntry() { return undefined; }
  async savePracticeWrite(write: import("../ports/TrainingRepository").AtomicPracticeWrite) {
    return { entry: write.logEntry, created: true };
  }
  async addPracticeLog() {}
  async savePracticeResult() {}
  async listPracticeLog(): Promise<never> { throw new Error("Snapshot must not use the ambiguous log query."); }
  async listRecentPracticeActivity() { return { entries: [], limit: 500, totalEntries: 650, isTruncated: true }; }
  async getPracticeStatistics() {
    return {
      timeZone: "UTC",
      allTime: {
        totalEvents: 650,
        practiceActivityAttempts: 650,
        submissions: 650,
        retrievalChecks: 650,
        independentAccuracy: 1,
        perfectRecallCount: 650,
        closeCount: 0,
        retryCount: 0,
        correctionsCompleted: 0,
        revealCount: 0,
        skipCount: 0,
      },
      daily: [],
      byCard: [],
      qualifyingPracticeDates: [],
    };
  }
  async listAllPracticeLog(): Promise<import("../../domain/practice/PracticeLogEntry").PracticeLogEntry[]> { return []; }
  async listVocabularyEntries() { return []; }
  async getVocabularyEntry() { return undefined; }
  async saveVocabularyEntry() {}
  async deleteVocabularyEntry() {}
  async saveCourseCatalog() {}
  async getAppPreferences(): Promise<AppPreferences | undefined> { return undefined; }
  async saveAppPreferences() {}
  async getPracticeSessionCheckpoint() { return undefined; }
  async savePracticeSessionCheckpoint() {}
  async deletePracticeSessionCheckpoint() {}
  async readFullBackup(): Promise<never> { throw new Error("Not used by this fixture."); }
  async replaceAllData() {}
  async clearLearningProgress() {}
  async clearAll() {}
}

class DueReviewRepository extends SnapshotRepository {
  override async listReviewStates() {
    return [{
      cardId: card.id,
      stage: 1 as const,
      dueAt: "2026-07-18T00:00:00.000Z",
      lastReviewedAt: "2026-07-17T00:00:00.000Z",
      streak: 1,
      lapseCount: 0,
    }];
  }
}

class LegacyPreferenceRepository extends SnapshotRepository {
  override async getAppPreferences(): Promise<AppPreferences> {
    return {
      id: "device",
      theme: "dark",
      speechVoiceUri: null,
      keySoundMuted: true,
      quickStart: null,
    } as unknown as AppPreferences;
  }
}

class BetaSnapshotRepository extends SnapshotRepository {
  override async listAllPracticeLog(): Promise<ContextualPracticeLogEntry[]> {
    return [{
      kind: "attempt",
      id: "turn-attempt:turn-1:0",
      turnId: "turn-1",
      cardId: card.id,
      phase: "review-recall",
      submissionIndex: 0,
      submittedAt: "2026-08-01T10:00:00.000Z",
      answer: card.english,
      outcome: "perfect",
      accuracy: 1,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1_000,
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
      context: {
        sessionId: "session-1",
        roundId: "round-1",
        occurrenceId: "occurrence-1",
        queueReason: "due-review",
        scheduledReviewDueAt: "2026-08-01T09:00:00.000Z",
      },
    }];
  }

  async loadActiveCheckpoint() { return undefined; }
  async listEvidence() { return []; }
  async getMeasurementEpoch() { return "2026-08-01T00:00:00.000Z"; }
}
