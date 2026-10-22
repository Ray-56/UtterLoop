import { describe, expect, it } from "vitest";
import { defaultCatalog } from "../../application/seed/defaultCatalog";
import type { PracticeSessionEvidence } from "../practice/PracticeSessionEvidence";
import { validateFullBackup } from "./validateFullBackup";

function backup(scope: unknown) {
  return {
    format: "utterloop-full-backup", schemaVersion: 2, databaseSchemaVersion: 6,
    exportedAt: "2026-10-22T11:00:00.000Z", catalog: defaultCatalog,
    learning: {
      sentenceLearningStates: [], reviewStates: [], practiceLog: [], vocabularyEntries: [],
      measurementEpoch: "2026-10-22T00:00:00.000Z",
      practiceSessionEvidence: [{
        schemaVersion: 1, sessionId: "return-session", roundId: "return-round", scope,
        entryPoint: "standard", startedAt: "2026-10-22T10:00:00.000Z", engagedAt: null,
        endedAt: "2026-10-22T10:01:00.000Z", terminal: { kind: "invalidated", reason: "stale" },
        round: { initialOccurrenceIds: [], scheduledOccurrenceIds: [], attemptedOccurrenceIds: [], completedOccurrenceIds: [], skippedOccurrenceIds: [], remainingOccurrenceIds: [], dueReviewScheduledOccurrenceIds: [], dueReviewCompletedOccurrenceIds: [], introducedCardIds: [], firstPassCardIds: [], requeue: { insertedReturnOccurrenceIds: [], deferredNoRoomCardIds: [], capReachedCardIds: [] } },
      } satisfies Omit<PracticeSessionEvidence, "scope"> & { scope: unknown }],
    },
    preferences: { id: "device", theme: "system", speechVoiceUri: null, keySoundMuted: false, fingerGuideMode: "auto", quickStart: null },
  };
}

describe("Return scope backup compatibility", () => {
  it.each([3, 8, 15])("round-trips a target-free %i-minute plan in durable evidence", (minutes) => {
    const result = validateFullBackup(backup({ kind: "return", minutes }));
    expect(result.learning.practiceSessionEvidence[0].scope).toEqual({ kind: "return", minutes });
  });

  it("rejects invalid budgets and extra target-bearing scope fields", () => {
    expect(() => validateFullBackup(backup({ kind: "return", minutes: 5 }))).toThrow(/scope.minutes/);
    expect(() => validateFullBackup(backup({ kind: "return", minutes: 3, target: "a secret answer" }))).toThrow(/scope.target/);
  });
});
