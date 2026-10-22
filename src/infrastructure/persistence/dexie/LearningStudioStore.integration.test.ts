import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningStudioConflictError } from "../../../application/ports/LearningStudioStore";
import { LocalDataChangedError } from "../../../application/ports/LocalDataAccess";
import { PracticeOwnershipLostError } from "../../../application/ports/LocalDataAccess";
import { defaultCatalog } from "../../../application/seed/defaultCatalog";
import { DEFAULT_APP_PREFERENCES } from "../../../application/use-cases/getTrainingSnapshot";
import { emptyLearningStudio, type LearningStudioDocument } from "../../../domain/studio/LearningStudio";
import { beginFluency, finishFluency, updateFluencyInput } from "../../../domain/studio/fluency";
import { createPersonalSentence, recordPersonalRecall } from "../../../domain/studio/studioRules";
import { portableLearningStudio } from "../../../domain/studio/validateLearningStudio";
import { validateFullBackup } from "../../../domain/backup/validateFullBackup";
import { UtterLoopDatabase } from "./UtterLoopDatabase";
import { DexieTrainingRepository } from "./DexieTrainingRepository";

const databases: UtterLoopDatabase[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  const names = [...new Set(databases.map((database) => database.name))];
  databases.splice(0).forEach((database) => database.close());
  await Promise.all(names.map((name) => Dexie.delete(name)));
});

describe("Learning Studio durable storage", () => {
  it("adds the v7 store without rewriting a v6 profile or fabricating evidence", async () => {
    const name = `utterloop-studio-upgrade-${crypto.randomUUID()}`;
    const oldDatabase = new Dexie(name);
    oldDatabase.version(6).stores({
      courseCategories: "id, sortOrder", learningPaths: "id", courses: "id, revision, categoryId, *tags",
      sentenceCards: "id, source, updatedAt, *tags", reviewStates: "cardId, dueAt, stage",
      practiceLog: "id, cardId, submittedAt, outcome, kind, turnId", vocabularyEntries: "cardId, savedAt",
      sentenceLearningStates: "cardId", appPreferences: "id", appMetadata: "id, measurementEpoch",
      practiceSessionCheckpoints: "id, updatedAt",
      practiceSessionEvidence: "sessionId, roundId, endedAt, terminal.kind, entryPoint",
    });
    await oldDatabase.open();
    const metadata = { id: "device", measurementEpoch: "2026-08-01T00:00:00.000Z" };
    await oldDatabase.table("appMetadata").put(metadata);
    await oldDatabase.table("sentenceCards").put(defaultCatalog.cards[0]);
    oldDatabase.close();
    const database = await openDatabase(name);
    expect(database.verno).toBe(7);
    await expect(database.appMetadata.get("device")).resolves.toEqual(metadata);
    await expect(database.sentenceCards.get(defaultCatalog.cards[0].id)).resolves.toEqual(defaultCatalog.cards[0]);
    await expect(database.learningStudio.count()).resolves.toBe(0);
    await expect(new DexieTrainingRepository(database).readLearningStudio()).resolves.toEqual(emptyLearningStudio());
  });

  it("uses compare-and-swap across two connections so the losing draft never overwrites data", async () => {
    const database = await openDatabase();
    const secondDatabase = await openDatabase(database.name);
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(secondDatabase);
    const [firstRead, secondRead] = await Promise.all([first.readLearningStudio(), second.readLearningStudio()]);
    const stored = await first.saveLearningStudio({ ...document(), revision: firstRead.revision }, firstRead.revision);
    expect(stored.revision).toBe(1);
    await expect(second.saveLearningStudio({ ...secondRead, personalSentences: [] }, secondRead.revision))
      .rejects.toBeInstanceOf(LearningStudioConflictError);
    await expect(second.readLearningStudio()).resolves.toEqual(stored);
  });

  it("rejects a taken-over writer's higher checkpoint revision even when it reads the latest CAS revision", async () => {
    const database = await openDatabase();
    const first = new DexieTrainingRepository(database);
    const firstLease = await first.acquirePracticeOwnership();
    if (firstLease.status !== "owned") throw new Error("Expected initial ownership");
    const saved = await first.saveLearningStudio(document(), 0);
    const second = new DexieTrainingRepository(await openDatabase(database.name));
    await second.acquirePracticeOwnership({ takeOver: true });
    const latest = await second.readLearningStudio();
    const updated = await second.saveLearningStudio({ ...latest, checkpoint: { ...latest.checkpoint!, revision: 1, draft: "new owner's draft" } }, latest.revision);
    const staleRead = await first.readLearningStudio();
    expect(staleRead.revision).toBe(updated.revision);
    await expect(first.saveLearningStudio({ ...staleRead, checkpoint: { ...saved.checkpoint!, revision: 99, draft: "old writer high revision" } }, staleRead.revision))
      .rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(first.saveLearningStudio({ ...staleRead, fluencyResults: [] }, staleRead.revision))
      .rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(second.readLearningStudio()).resolves.toEqual(updated);
  });

  it("keeps a retired writer fenced after both tabs release their leases", async () => {
    const database = await openDatabase();
    const first = new DexieTrainingRepository(database);
    const second = new DexieTrainingRepository(await openDatabase(database.name));
    const firstLease = await first.acquirePracticeOwnership();
    if (firstLease.status !== "owned") throw new Error("Expected initial ownership");
    await first.saveLearningStudio(document(), 0);
    const secondLease = await second.acquirePracticeOwnership({ takeOver: true });
    if (secondLease.status !== "owned") throw new Error("Expected takeover ownership");
    const current = await second.readLearningStudio();
    const saved = await second.saveLearningStudio({ ...current, checkpoint: { ...current.checkpoint!, revision: 2, draft: "new owner's final draft" } }, current.revision);
    await first.releasePracticeOwnership(firstLease.token);
    await second.releasePracticeOwnership(secondLease.token);
    expect((await database.appMetadata.get("device"))?.practiceLease).toBeUndefined();
    const freshReadFromOldWriter = await first.readLearningStudio();
    await expect(first.saveLearningStudio({ ...freshReadFromOldWriter, checkpoint: {
      ...freshReadFromOldWriter.checkpoint!, revision: 99, draft: "retired late autosave",
    } }, freshReadFromOldWriter.revision)).rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(second.readLearningStudio()).resolves.toEqual(saved);
  });

  it("allows the latest owner's final unmount draft after it releases ownership", async () => {
    const database = await openDatabase();
    const store = new DexieTrainingRepository(database);
    const lease = await store.acquirePracticeOwnership();
    if (lease.status !== "owned") throw new Error("Expected ownership");
    const current = await store.saveLearningStudio(document(), 0);
    await store.releasePracticeOwnership(lease.token);
    expect((await database.appMetadata.get("device"))?.practiceLease).toBeUndefined();
    const saved = await store.saveLearningStudio({ ...current, checkpoint: {
      ...current.checkpoint!, revision: 1, draft: "last input before leaving",
    } }, current.revision);
    await expect(store.readLearningStudio()).resolves.toEqual(saved);
    expect(saved.checkpoint?.draft).toBe("last input before leaving");
  });

  it("does not let an instance that never acquired ownership write after the owner releases", async () => {
    const database = await openDatabase();
    const owner = new DexieTrainingRepository(database);
    const unclaimed = new DexieTrainingRepository(await openDatabase(database.name));
    const lease = await owner.acquirePracticeOwnership();
    if (lease.status !== "owned") throw new Error("Expected ownership");
    await owner.saveLearningStudio(document(), 0);
    await owner.releasePracticeOwnership(lease.token);
    const current = await unclaimed.readLearningStudio();
    await expect(unclaimed.saveLearningStudio({ ...current, checkpoint: {
      ...current.checkpoint!, revision: 100, draft: "unclaimed page draft",
    } }, current.revision)).rejects.toBeInstanceOf(PracticeOwnershipLostError);
    await expect(owner.readLearningStudio()).resolves.toEqual(current);
  });

  it("saves consecutive drafts without reading or rewriting durable history", async () => {
    const database = await openDatabase();
    const store = new DexieTrainingRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    const read = vi.spyOn(database.learningStudio, "get");
    const write = vi.spyOn(database.learningStudio, "put");
    const current = await store.readLearningStudio();
    const updated = await store.saveLearningStudio({ ...current, checkpoint: {
      ...current.checkpoint!, revision: 1, draft: "continued draft",
    } }, current.revision);
    expect(read.mock.calls.map(([id]) => id)).toEqual(["state", "state"]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual({ id: "state", revision: 2, contentRevision: 1, checkpoint: updated.checkpoint });
    expect(updated.attempts).toEqual(saved.attempts);
    expect(updated.personalSentences).toEqual(saved.personalSentences);
    expect(Object.isFrozen(updated.attempts[0])).toBe(true);
    expect(Object.isFrozen(updated.personalSentences[0].card)).toBe(true);
    expect(Object.isFrozen(updated.closedSessionIds)).toBe(true);
    await expect(store.readLearningStudio()).resolves.toEqual(updated);
  });

  it("invalidates cached history after another connection changes content and rejects its older autosave", async () => {
    const database = await openDatabase();
    const first = new DexieTrainingRepository(database);
    const saved = await first.saveLearningStudio(document(), 0);
    const second = new DexieTrainingRepository(await openDatabase(database.name));
    const secondRead = await second.readLearningStudio();
    const changed = await second.saveLearningStudio({ ...secondRead, signals: [...secondRead.signals, {
      id: "signal-2", sessionId: "active-session", activity: "personal", exerciseId: "personal-1",
      kind: "revealed", at: "2026-10-22T00:05:00.000Z",
    }] }, secondRead.revision);
    await expect(first.saveLearningStudio({ ...saved, checkpoint: { ...saved.checkpoint!, draft: "stale" } }, saved.revision))
      .rejects.toBeInstanceOf(LearningStudioConflictError);
    await expect(first.readLearningStudio()).resolves.toEqual(changed);
    const savedAgain = await first.saveLearningStudio({ ...changed, checkpoint: { ...changed.checkpoint!, draft: "fresh" } }, changed.revision);
    expect(savedAgain.signals).toHaveLength(2);
    await expect(second.readLearningStudio()).resolves.toEqual(savedAgain);
  });

  it("upgrades an embedded legacy draft on first save without losing its history", async () => {
    const database = await openDatabase();
    await database.learningStudio.put({ ...document(), revision: 8 });
    const store = new DexieTrainingRepository(database);
    const current = await store.readLearningStudio();
    expect(current.checkpoint?.draft).toBe("private unfinished draft");
    const saved = await store.saveLearningStudio({ ...current, checkpoint: { ...current.checkpoint!, revision: 1, draft: "new draft" } }, 8);
    expect(saved.revision).toBe(9);
    expect(await database.learningStudio.get("local")).toEqual({ ...document(), revision: 8, checkpoint: null });
    await expect(store.readLearningStudio()).resolves.toEqual(saved);
  });

  it("keeps checkpoint-only global revision in backup and reset while excluding damaged private drafts", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const original = await store.saveLearningStudio(document(), 0);
    const saved = await store.saveLearningStudio({ ...original, checkpoint: { ...original.checkpoint!, revision: 1, draft: "updated private draft" } }, original.revision);
    await database.table("learningStudio").put({ id: "state", revision: saved.revision, contentRevision: 1, checkpoint: { damaged: true } });
    await expect(new DexieTrainingRepository(database).readLearningStudio()).rejects.toThrow();
    const backup = await store.readFullBackup("2026-10-22T01:00:00.000Z");
    expect(backup.learning.studio).toEqual(portableLearningStudio(saved));
    await store.clearLearningProgress();
    const reset = await new DexieTrainingRepository(database).readLearningStudio();
    expect(reset.revision).toBe(saved.revision + 1);
    expect(reset.checkpoint).toBeNull();
    expect(reset.personalSentences).toHaveLength(1);
    expect(reset.attempts).toEqual([]);
  });

  it("rolls back durable history when the separate state write fails", async () => {
    const database = await openDatabase();
    const store = new DexieTrainingRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    const originalPut = database.learningStudio.put.bind(database.learningStudio);
    const failure = vi.spyOn(database.learningStudio, "put")
      .mockImplementationOnce((record) => originalPut(record))
      .mockRejectedValueOnce(new Error("state write failed"));
    await expect(store.saveLearningStudio({ ...saved, fluencyResults: [] }, saved.revision)).rejects.toThrow("state write failed");
    failure.mockRestore();
    await expect(store.readLearningStudio()).resolves.toEqual(saved);
    await expect(new DexieTrainingRepository(database).readLearningStudio()).resolves.toEqual(saved);
  });

  it("rejects checkpoint rollback and removing the tombstone of a completed session", async () => {
    const database = await openDatabase();
    const store = new DexieTrainingRepository(database);
    const initial = document();
    initial.checkpoint!.revision = 4;
    const stored = await store.saveLearningStudio(initial, 0);
    await expect(store.saveLearningStudio({ ...stored, checkpoint: { ...stored.checkpoint!, revision: 3 } }, stored.revision))
      .rejects.toBeInstanceOf(LearningStudioConflictError);
    await expect(store.saveLearningStudio({ ...stored, closedSessionIds: [] }, stored.revision))
      .rejects.toBeInstanceOf(LearningStudioConflictError);
    const closed = await store.saveLearningStudio({ ...stored, checkpoint: null,
      closedSessionIds: [...stored.closedSessionIds, stored.checkpoint!.sessionId] }, stored.revision);
    await expect(store.saveLearningStudio({ ...closed, checkpoint: stored.checkpoint }, closed.revision))
      .rejects.toBeInstanceOf(LearningStudioConflictError);
    await expect(store.readLearningStudio()).resolves.toEqual(closed);
  });

  it("exports a v3 backup containing private content and aggregate evidence without active drafts", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const lease = await store.acquirePracticeOwnership();
    expect(lease.status).toBe("owned");
    const saved = await store.saveLearningStudio(document(), 0);
    const backup = await store.readFullBackup("2026-10-22T01:00:00.000Z");
    expect(backup.schemaVersion).toBe(3);
    expect(backup.databaseSchemaVersion).toBe(7);
    expect(backup.learning.studio).toEqual(portableLearningStudio(saved));
    expect(JSON.stringify(backup)).not.toContain("private unfinished draft");
    expect(JSON.stringify(backup)).not.toContain("practiceLease");
    expect(JSON.stringify(backup)).not.toContain("dataGeneration");
    expect(validateFullBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);

    const destination = await openDatabase();
    const restored = new DexieTrainingRepository(destination);
    await restored.replaceAllData(backup);
    await expect(restored.readLearningStudio()).resolves.toEqual({ ...saved, checkpoint: null });
    await expect(destination.practiceSessionCheckpoints.count()).resolves.toBe(0);
    expect((await destination.appMetadata.get("device"))?.practiceLease).toBeUndefined();
  });

  it("normalizes v2 imports to an empty Studio while replacing older local private content", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    await store.saveLearningStudio(document(), 0);
    const current = await store.readFullBackup("2026-10-22T01:00:00.000Z");
    const { studio: _studio, ...oldLearning } = current.learning;
    const oldBackup = { ...current, schemaVersion: 2 as const, databaseSchemaVersion: 6 as const, learning: oldLearning };
    await store.replaceAllData(oldBackup);
    await expect(database.learningStudio.get("local")).resolves.toEqual(emptyLearningStudio());
    expect(validateFullBackup(oldBackup).learning.studio).toEqual(portableLearningStudio(emptyLearningStudio()));
  });

  it("rejects an unusable personal import before replacing the current profile", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    const backup = await store.readFullBackup("2026-10-22T01:00:00.000Z");
    const personal = backup.learning.studio.personalSentences[0];
    personal.learningState = { cardId: personal.id };
    personal.reviewState = { cardId: personal.id, stage: 0, dueAt: backup.exportedAt, streak: 0, lapseCount: 0 };
    await expect(store.replaceAllData(backup)).rejects.toThrow("introducedAt");
    await expect(store.readLearningStudio()).resolves.toEqual(saved);
    await expect(database.sentenceCards.count()).resolves.toBe(120);
    expect((await database.appMetadata.get("device"))?.dataGeneration ?? 0).toBe(0);
  });

  it("rejects a personal default-card identity even when the imported catalog is empty", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    const backup = await store.readFullBackup("2026-10-22T01:00:00.000Z");
    backup.catalog = { categories: [], learningPaths: [], courses: [], cards: [] };
    const personal = backup.learning.studio.personalSentences[0];
    personal.id = "sf-001"; personal.card.id = "sf-001";
    personal.learningState.cardId = "sf-001"; personal.reviewState.cardId = "sf-001";
    await expect(store.replaceAllData(backup)).rejects.toThrow("personal- namespace");
    await expect(store.readLearningStudio()).resolves.toEqual(saved);
    await expect(database.sentenceCards.count()).resolves.toBe(120);
  });

  it("resets personal acquisition and independent evidence while keeping the private sentence", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    expect(saved.personalSentences[0].learningState.firstPassedAt).toBeDefined();
    await store.clearLearningProgress();
    const reset = await store.readLearningStudio();
    expect(reset.personalSentences[0].card).toEqual(saved.personalSentences[0].card);
    expect(reset.personalSentences[0].learningState).toEqual({
      cardId: "personal-1", introducedAt: "2026-10-22T02:00:00.000Z", acquisitionStatus: "needs-guided",
    });
    expect(reset.personalSentences[0].reviewState).toMatchObject({ stage: 0, streak: 0, lapseCount: 0 });
    expect(reset).toMatchObject({ attempts: [], signals: [], fluencyResults: [], closedSessionIds: [], checkpoint: null });
    await expect(store.saveLearningStudio(saved, saved.revision)).rejects.toBeInstanceOf(LocalDataChangedError);
  });

  it("rolls back Studio, core progress, and generation when reset cannot write the reset document", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    await store.saveReviewState({ cardId: "sf-001", stage: 0, dueAt: "2026-10-22T00:00:00.000Z", streak: 0, lapseCount: 1 });
    const failure = vi.spyOn(database.learningStudio, "put").mockRejectedValueOnce(new Error("injected studio failure"));
    await expect(store.clearLearningProgress()).rejects.toThrow("injected studio failure");
    failure.mockRestore();
    await expect(store.readLearningStudio()).resolves.toEqual(saved);
    await expect(database.reviewStates.get("sf-001")).resolves.toMatchObject({ lapseCount: 1 });
    expect((await database.appMetadata.get("device"))?.dataGeneration ?? 0).toBe(0);
  });

  it("rolls back every table when restore cannot replace Studio content", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    const backup = await store.readFullBackup("2026-10-22T01:00:00.000Z");
    const failure = vi.spyOn(database.learningStudio, "put").mockRejectedValueOnce(new Error("injected studio restore failure"));
    await expect(store.replaceAllData(backup)).rejects.toThrow("injected studio restore failure");
    failure.mockRestore();
    await expect(store.readLearningStudio()).resolves.toEqual(saved);
    await expect(database.sentenceCards.count()).resolves.toBe(120);
    expect((await database.appMetadata.get("device"))?.dataGeneration ?? 0).toBe(0);
  });

  it("clears private Studio content with Clear all and blocks old instances from reintroducing it", async () => {
    const database = await openDatabase();
    const store = await seededRepository(database);
    const saved = await store.saveLearningStudio(document(), 0);
    await store.clearAll();
    await expect(database.learningStudio.count()).resolves.toBe(0);
    await expect(store.saveLearningStudio(saved, saved.revision)).rejects.toBeInstanceOf(LocalDataChangedError);
  });
});

async function openDatabase(name = `utterloop-studio-${crypto.randomUUID()}`) {
  const database = new UtterLoopDatabase(name);
  databases.push(database);
  await database.open();
  return database;
}

async function seededRepository(database: UtterLoopDatabase) {
  const repository = new DexieTrainingRepository(database, () => new Date("2026-10-22T02:00:00.000Z"));
  await repository.saveCourseCatalog(defaultCatalog);
  await repository.saveAppPreferences({ ...DEFAULT_APP_PREFERENCES });
  return repository;
}

function document(): LearningStudioDocument {
  let sentence = createPersonalSentence({
    id: "personal-1", prompt: "告诉同事你已经准备好了。", english: "I am ready.", source: "Checked notes", confirmed: true,
  }, new Date("2026-10-22T00:00:00.000Z"));
  sentence = recordPersonalRecall(sentence, "I am ready.", false, new Date("2026-10-22T00:00:30.000Z")).sentence;
  sentence = recordPersonalRecall(sentence, "I am ready.", false, new Date("2026-10-22T00:01:00.000Z")).sentence;
  const capture = updateFluencyInput(beginFluency({ id: "fluency-1", sourceCardId: "personal-1", source: "learned", target: "I am ready." }), "I am ready.", 0);
  return { ...emptyLearningStudio(), personalSentences: [sentence],
    attempts: [{ id: "attempt-1", sessionId: "closed-session", activity: "family", groupId: "request", exerciseId: "request-held-out", stage: "held-out",
      outcome: "perfect", accuracy: 1, submittedAt: "2026-10-22T00:01:00.000Z", durationMs: 5_000,
      answerWasRevealed: false, firstSubmission: true, firstEncounter: true }],
    fluencyResults: [finishFluency(capture, 10_000, new Date("2026-10-22T00:03:00.000Z"))],
    signals: [{ id: "signal-1", sessionId: "closed-session", activity: "family", exerciseId: "other-exercise", kind: "skipped", at: "2026-10-22T00:01:30.000Z" }],
    closedSessionIds: ["closed-session"], checkpoint: {
      revision: 0, sessionId: "active-session", activity: "personal", groupId: "personal", exerciseIds: ["personal-1"], index: 0,
      phase: "recall", draft: "private unfinished draft", answerWasRevealed: false, submissionCount: 0, updatedAt: "2026-10-22T00:04:00.000Z",
    },
  };
}
