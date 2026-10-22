/// <reference types="node" />
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import { env } from "node:process";
import { emptyLearningStudio, type StudioAttempt } from "../../../domain/studio/LearningStudio";
import { UtterLoopDatabase } from "./UtterLoopDatabase";
import { DexieTrainingRepository } from "./DexieTrainingRepository";

const benchmark = env.RUN_STUDIO_BENCHMARK === "1" ? it : it.skip;

benchmark.each([10_000, 100_000])("measures checkpoint autosave with %i historical Studio attempts", async (count) => {
  const database = new UtterLoopDatabase(`utterloop-studio-benchmark-${crypto.randomUUID()}`);
  await database.open();
  try {
    const seedRepository = new DexieTrainingRepository(database);
    const attempts = Array.from({ length: count }, (_, index): StudioAttempt => ({
      id: `attempt-${index}`, sessionId: `session-${Math.floor(index / 5)}`, activity: "family",
      groupId: "requests", exerciseId: `request-${index % 25}`, stage: "training",
      outcome: "perfect", accuracy: 1, submittedAt: "2026-10-22T00:00:00.000Z", durationMs: 2_000,
      answerWasRevealed: false, firstSubmission: true, firstEncounter: false,
    }));
    await seedRepository.saveLearningStudio({ ...emptyLearningStudio(), attempts }, 0);
    const repository = new DexieTrainingRepository(database);
    const beforeColdRead = performance.now();
    expect((await repository.readLearningStudio()).attempts).toHaveLength(count);
    const coldReadMs = performance.now() - beforeColdRead;
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const startedAt = performance.now();
      const current = await repository.readLearningStudio();
      const readMs = performance.now() - startedAt;
      const beforeSave = performance.now();
      const saved = await repository.saveLearningStudio({ ...current, checkpoint: {
        revision: index, sessionId: "active-session", activity: "family", groupId: "requests",
        exerciseIds: ["request-0"], index: 0, phase: "recall", draft: "a".repeat(index + 1),
        answerWasRevealed: false, submissionCount: 0, updatedAt: "2026-10-22T00:01:00.000Z",
      } }, current.revision);
      samples.push({ readMs, saveMs: performance.now() - beforeSave });
      expect(saved.attempts).toHaveLength(count);
    }
    console.info(JSON.stringify({ benchmark: "studio-checkpoint", count, coldReadMs: Number(coldReadMs.toFixed(2)),
      readMs: samples.map((sample) => Number(sample.readMs.toFixed(2))),
      saveMs: samples.map((sample) => Number(sample.saveMs.toFixed(2))),
    }));
  } finally {
    database.close();
    await Dexie.delete(database.name);
  }
}, 120_000);
