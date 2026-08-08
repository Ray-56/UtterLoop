import { describe, expect, it, vi } from "vitest";
import type {
  UtterLoopFullBackupV1,
  UtterLoopFullBackupV2,
} from "../../domain/backup/UtterLoopFullBackup";
import { restoreFullBackup } from "./restoreFullBackup";

describe("restoreFullBackup", () => {
  it("replaces local data once and returns a display-ready backup summary", async () => {
    const backup = validBackup();
    const replaceAllData = vi.fn(async (_backup: UtterLoopFullBackupV2) => undefined);

    const summary = await restoreFullBackup({ replaceAllData }, backup);

    expect(replaceAllData).toHaveBeenCalledTimes(1);
    expect(replaceAllData).toHaveBeenCalledWith(backup);
    expect(summary).toEqual({
      exportedAt: "2026-07-31T10:00:00.000Z",
      counts: {
        courses: 1,
        cards: 1,
        firstPasses: 1,
        reviewStates: 1,
        practiceLogEntries: 1,
        vocabularyEntries: 1,
      },
    });
  });

  it("normalizes a valid v1 backup to empty session evidence at the restore epoch", async () => {
    const legacy = legacyBackup();
    const replaceAllData = vi.fn(async (_backup: UtterLoopFullBackupV2) => undefined);

    await restoreFullBackup(
      { replaceAllData },
      legacy,
      new Date("2026-08-01T12:00:00.000Z"),
    );

    expect(replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 2,
      databaseSchemaVersion: 6,
      learning: expect.objectContaining({
        measurementEpoch: "2026-08-01T12:00:00.000Z",
        practiceSessionEvidence: [],
      }),
    }));
  });

  it("rejects an invalid backup before any replacement write", async () => {
    const invalidBackup: unknown = {
      ...validBackup(),
      schemaVersion: 3,
    };
    const replaceAllData = vi.fn(async (_backup: UtterLoopFullBackupV2) => undefined);

    await expect(restoreFullBackup({ replaceAllData }, invalidBackup))
      .rejects.toThrow("schemaVersion");
    expect(replaceAllData).not.toHaveBeenCalled();
  });
});

function validBackup(): UtterLoopFullBackupV2 {
  return {
    format: "utterloop-full-backup",
    schemaVersion: 2,
    exportedAt: "2026-07-31T10:00:00.000Z",
    databaseSchemaVersion: 6,
    catalog: {
      categories: [{
        id: "category-1",
        title: "Foundations",
        description: "Start here",
        sortOrder: 0,
      }],
      learningPaths: [{
        id: "path-1",
        title: "Core",
        description: "Core path",
        courseIds: ["course-1"],
      }],
      courses: [{
        id: "course-1",
        title: "Course",
        description: "Course description",
        categoryId: "category-1",
        tags: ["core"],
        level: { label: "Beginner", cefrFrom: "A1", cefrTo: "A1" },
        provider: { kind: "original", name: "UtterLoop" },
        revision: 1,
        license: {
          name: "CC BY 4.0",
          url: "https://example.com/license",
          attribution: "UtterLoop",
        },
        units: [{
          id: "unit-1",
          title: "Unit",
          description: "Unit description",
          lessons: [{
            id: "lesson-1",
            title: "Lesson",
            objective: "Recall",
            cardIds: ["card-1"],
          }],
        }],
      }],
      cards: [{
        id: "card-1",
        english: "I am ready.",
        prompt: "表达我准备好了",
        source: "UtterLoop",
        tags: ["core"],
        acceptableAnswers: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      }],
    },
    learning: {
      sentenceLearningStates: [{
        cardId: "card-1",
        introducedAt: "2026-07-03T00:00:00.000Z",
        firstPassedAt: "2026-07-04T00:00:00.000Z",
        firstPassSource: "independent-recall",
      }],
      reviewStates: [{
        cardId: "card-1",
        stage: 1,
        dueAt: "2026-08-01T00:00:00.000Z",
        lastReviewedAt: "2026-07-04T00:00:00.000Z",
        streak: 1,
        lapseCount: 0,
      }],
      practiceLog: [{
        kind: "attempt",
        id: "turn-attempt:turn-1:0",
        turnId: "turn-1",
        cardId: "card-1",
        phase: "independent-recall",
        submissionIndex: 0,
        submittedAt: "2026-07-04T00:00:00.000Z",
        answer: "I am ready.",
        outcome: "perfect",
        accuracy: 1,
        answerWasRevealed: false,
        hadEdits: false,
        audioPlayCount: 0,
        durationMs: 1_200,
        supportLevelUsed: 0,
        supportKindsUsed: [],
        receivedCorrection: false,
      }],
      vocabularyEntries: [{
        cardId: "card-1",
        savedAt: "2026-07-05T00:00:00.000Z",
      }],
      measurementEpoch: "2026-07-31T00:00:00.000Z",
      practiceSessionEvidence: [],
    },
    preferences: {
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: { version: 1, status: "completed" },
    },
  };
}

function legacyBackup(): UtterLoopFullBackupV1 {
  const current = validBackup();
  const {
    measurementEpoch: _measurementEpoch,
    practiceSessionEvidence: _practiceSessionEvidence,
    ...learning
  } = current.learning;
  return {
    ...current,
    schemaVersion: 1,
    databaseSchemaVersion: 5,
    learning,
  };
}
