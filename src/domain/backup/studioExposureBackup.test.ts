import { describe, expect, it } from "vitest";
import { defaultCatalog } from "../../application/seed/defaultCatalog";
import { emptyLearningStudio } from "../studio/LearningStudio";
import { studioAnswerKeys } from "../studio/studioExposure";
import { portableLearningStudio } from "../studio/validateLearningStudio";
import { validateFullBackup } from "./validateFullBackup";
import { LearningStudioService } from "../../application/studio/LearningStudioService";
import type { LearningStudioDocument, StudioCheckpoint } from "../studio/LearningStudio";

function backup() {
  const studio = emptyLearningStudio();
  const answerKeys = studioAnswerKeys({ target: "I'd like to check the plan first.", acceptableAnswers: [] });
  studio.attempts = [{ id: "test-result", sessionId: "test-session", activity: "family", groupId: "need-time",
    exerciseId: "time-4", stage: "held-out", outcome: "perfect", accuracy: 1,
    submittedAt: "2026-10-23T00:00:00.000Z", durationMs: 1_000, answerWasRevealed: true,
    firstSubmission: true, firstEncounter: true, answerKeys }];
  studio.signals = [{ id: "test-reveal", sessionId: "test-session", activity: "family", exerciseId: "time-4",
    kind: "revealed", at: "2026-10-22T23:59:59.000Z", answerKeys }];
  return {
    format: "utterloop-full-backup", schemaVersion: 3, databaseSchemaVersion: 7,
    exportedAt: "2026-10-23T00:01:00.000Z", catalog: defaultCatalog,
    learning: { sentenceLearningStates: [], reviewStates: [], practiceLog: [], vocabularyEntries: [],
      measurementEpoch: "2026-10-22T00:00:00.000Z", practiceSessionEvidence: [], studio: portableLearningStudio(studio) },
    preferences: { id: "device", theme: "system", speechVoiceUri: null, keySoundMuted: false, fingerGuideMode: "auto", quickStart: null },
  };
}

describe("Studio expression identities in full backup", () => {
  it("preserves durable attempt and signal identities without exporting a draft", () => {
    const source = backup();
    const restored = validateFullBackup(JSON.parse(JSON.stringify(source)));
    expect(restored.learning.studio).toEqual(source.learning.studio);
    expect(restored.learning.studio).not.toHaveProperty("checkpoint");
    expect(restored.learning.studio.attempts[0].answerKeys).toHaveLength(1);
  });

  it("accepts older evidence without keys and rejects target text in an identity field", () => {
    const source = backup();
    delete source.learning.studio.attempts[0].answerKeys;
    delete source.learning.studio.signals[0].answerKeys;
    expect(validateFullBackup(source).learning.studio.attempts[0]).not.toHaveProperty("answerKeys");
    source.learning.studio.signals[0].answerKeys = ["I'd like to check the plan first."];
    expect(() => validateFullBackup(source)).toThrow("learning.studio.signals[0].answerKeys");
  });

  it("uses restored identities to keep a renamed test from becoming a new first encounter", async () => {
    const restored = validateFullBackup(JSON.parse(JSON.stringify(backup())));
    let document: LearningStudioDocument = { ...restored.learning.studio, checkpoint: null };
    const service = new LearningStudioService({
      async readLearningStudio() { return structuredClone(document); },
      async saveLearningStudio(next, expectedRevision) {
        if (document.revision !== expectedRevision) throw new Error("Conflict");
        document = structuredClone({ ...next, revision: expectedRevision + 1 });
        return structuredClone(document);
      },
    }, () => new Date("2026-10-23T01:00:00.000Z"));
    const checkpoint: StudioCheckpoint = { revision: 1, sessionId: "after-restore", activity: "family", groupId: "need-time",
      exerciseIds: ["renamed-test"], index: 0, phase: "recall", draft: "", answerWasRevealed: false,
      submissionCount: 0, updatedAt: "2026-10-23T01:00:00.000Z" };
    await service.saveCheckpoint(checkpoint);
    const result = await service.submit({ id: "after-restore-check", checkpoint, durationMs: 1_000,
      exercise: { id: "renamed-test", prompt: "用本组句型说你想先检查计划。", target: "I would like to check the plan first.",
        acceptableAnswers: [], stage: "held-out" }, answer: "I'd like to check the plan first." });
    expect(result.attempts[1]).toMatchObject({ firstEncounter: false, firstSubmission: true, answerWasRevealed: false });
  });
});
