import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { UtterLoopDatabase } from "../../infrastructure/persistence/dexie/UtterLoopDatabase";
import { DexieTrainingRepository } from "../../infrastructure/persistence/dexie/DexieTrainingRepository";
import { defaultCatalog } from "../seed/defaultCatalog";
import type { StudioCheckpoint } from "../../domain/studio/LearningStudio";
import { recordStudioCatalogSignal } from "./recordStudioCatalogSignal";

const databases: UtterLoopDatabase[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map((database) => database.delete())); });
const now = new Date("2026-10-23T03:00:00.000Z");
const checkpoint: StudioCheckpoint = { revision: 1, sessionId: "studio-context", activity: "context", groupId: "all",
  exerciseIds: ["sf-001:context:test"], index: 0, phase: "recall", draft: "", answerWasRevealed: false,
  submissionCount: 0, updatedAt: now.toISOString() };
async function repository(dueAt: string) {
  const database = new UtterLoopDatabase(`studio-catalog-signal-${crypto.randomUUID()}`); databases.push(database);
  const store = new DexieTrainingRepository(database);
  await store.saveSentenceCards([defaultCatalog.cards.find((card) => card.id === "sf-001")!]);
  await store.saveSentenceLearningState({ cardId: "sf-001", introducedAt: "2026-10-01T00:00:00.000Z",
    firstPassedAt: "2026-10-01T01:00:00.000Z", firstPassSource: "independent-recall" });
  await store.saveReviewState({ cardId: "sf-001", stage: 3, dueAt, streak: 2, lapseCount: 0 });
  return { store, database };
}

describe("linked Studio support consequences", () => {
  it("returns a due acquired sentence to focus once across reveal/skip and retry", async () => {
    const { store } = await repository(now.toISOString());
    for (const kind of ["revealed", "skipped", "skipped"] as const) {
      await recordStudioCatalogSignal(store, checkpoint, checkpoint.exerciseIds[0], "sf-001", kind, now);
    }
    expect(await store.getReviewState("sf-001")).toMatchObject({ stage: 0, lapseCount: 1,
      dueAt: "2026-10-23T03:10:00.000Z" });
    const entries = await store.listAllPracticeLog();
    expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ kind: "signal", reviewFailureRecorded: true });
    expect(await store.getSentenceLearningState("sf-001")).toHaveProperty("firstPassedAt");
  });

  it("preserves a future schedule for voluntary contextual support", async () => {
    const { store } = await repository("2099-01-01T00:00:00.000Z");
    const before = await store.getReviewState("sf-001");
    await recordStudioCatalogSignal(store, checkpoint, checkpoint.exerciseIds[0], "sf-001", "revealed", now);
    expect(await store.getReviewState("sf-001")).toEqual(before);
    expect((await store.listAllPracticeLog())[0]).toMatchObject({ phase: "voluntary-practice", kind: "signal" });
  });

  it("does not add a new lapse after a judged Studio submission", async () => {
    const { store } = await repository(now.toISOString());
    await recordStudioCatalogSignal(store, { ...checkpoint, submissionCount: 1 }, checkpoint.exerciseIds[0], "sf-001", "skipped", now);
    expect(await store.getReviewState("sf-001")).toMatchObject({ stage: 3, lapseCount: 0 });
  });
});
