import { describe, expect, it, vi } from "vitest";
import type { UtterLoopFullBackup } from "../../domain/backup/UtterLoopFullBackup";
import { exportFullBackup } from "./exportFullBackup";

describe("exportFullBackup", () => {
  it("returns one consistent repository read stamped with the requested time", async () => {
    const backup = emptyBackup();
    const readFullBackup = vi.fn().mockResolvedValue(backup);

    const result = await exportFullBackup(
      { readFullBackup },
      new Date("2026-07-31T12:34:56.789Z"),
    );

    expect(result).toBe(backup);
    expect(readFullBackup).toHaveBeenCalledTimes(1);
    expect(readFullBackup).toHaveBeenCalledWith("2026-07-31T12:34:56.789Z");
  });
});

function emptyBackup(): UtterLoopFullBackup {
  return {
    format: "utterloop-full-backup",
    schemaVersion: 2,
    exportedAt: "2026-07-31T12:34:56.789Z",
    databaseSchemaVersion: 6,
    catalog: {
      categories: [],
      learningPaths: [],
      courses: [],
      cards: [],
    },
    learning: {
      sentenceLearningStates: [],
      reviewStates: [],
      practiceLog: [],
      vocabularyEntries: [],
      measurementEpoch: "2026-08-01T00:00:00.000Z",
      practiceSessionEvidence: [],
    },
    preferences: {
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: null,
    },
  };
}
