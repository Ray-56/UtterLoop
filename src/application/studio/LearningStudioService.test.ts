import { describe, expect, it } from "vitest";
import type { LearningStudioStore } from "../ports/LearningStudioStore";
import { emptyLearningStudio, type LearningStudioDocument, type StudioCheckpoint } from "../../domain/studio/LearningStudio";
import { SENTENCE_FAMILIES } from "../../domain/studio/studioCatalog";
import { buildContextExercises, createPersonalSentence, recordPersonalRecall } from "../../domain/studio/studioRules";
import { buildWeaknessExercises } from "../../domain/studio/weaknessPractice";
import { defaultCatalog } from "../seed/defaultCatalog";
import { LearningStudioService } from "./LearningStudioService";

class MemoryStudio implements LearningStudioStore {
  document = emptyLearningStudio();
  failNext = false;
  async readLearningStudio() { return structuredClone(this.document); }
  async saveLearningStudio(document: LearningStudioDocument, expectedRevision: number) {
    if (this.failNext) { this.failNext = false; throw new Error("Storage unavailable"); }
    if (this.document.revision !== expectedRevision) throw new Error("Conflict");
    this.document = structuredClone({ ...document, revision: expectedRevision + 1 });
    return this.readLearningStudio();
  }
}
const now = new Date("2026-10-22T04:00:00.000Z");
const exercise = SENTENCE_FAMILIES[0].exercises[0];
function checkpoint(): StudioCheckpoint {
  return { revision: 1, sessionId: "studio-1", activity: "family", groupId: "polite-request",
    exerciseIds: [exercise.id], index: 0, phase: "recall", draft: "", answerWasRevealed: false,
    submissionCount: 0, updatedAt: now.toISOString(),
  };
}

describe("Learning Studio durable application operations", () => {
  it("atomically stores a result/checkpoint, de-duplicates retries and labels repeated tests honestly", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const cp = checkpoint(); await service.saveCheckpoint(cp);
    const command = { id: "attempt-1", checkpoint: cp, exercise, answer: exercise.target, durationMs: 1_000 };
    const first = await service.submit(command);
    expect(first.attempts).toHaveLength(1);
    expect(first.attempts[0]).toMatchObject({ firstEncounter: true, firstSubmission: true, outcome: "perfect" });
    expect(first.checkpoint).toMatchObject({ phase: "result", submissionCount: 1, revision: 2 });
    expect((await service.submit(command)).revision).toBe(first.revision);
    await service.finishSession(cp.sessionId);
    const next = { ...cp, sessionId: "studio-2" }; await service.saveCheckpoint(next);
    const repeated = await service.submit({ ...command, id: "attempt-2", checkpoint: next });
    expect(repeated.attempts[1].firstEncounter).toBe(false);
  });

  it("counts a revealed first test encounter as assisted evidence and excludes later encounters", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const testExercise = SENTENCE_FAMILIES[0].exercises.find((item) => item.stage === "held-out")!;
    const cp = { ...checkpoint(), exerciseIds: [testExercise.id] };
    await service.saveCheckpoint(cp);
    const revealed = await service.recordSignal(cp, "revealed");
    const first = await service.submit({ id: "assisted-test", checkpoint: revealed.checkpoint!,
      exercise: testExercise, answer: testExercise.target, durationMs: 1_000 });
    expect(first.attempts[0]).toMatchObject({ firstEncounter: true, firstSubmission: true,
      stage: "held-out", outcome: "perfect", answerWasRevealed: true });
    await service.finishSession(cp.sessionId);
    const next = { ...cp, sessionId: "later-test" };
    await service.saveCheckpoint(next);
    const repeated = await service.submit({ id: "repeated-test", checkpoint: next,
      exercise: testExercise, answer: testExercise.target, durationMs: 1_000 });
    expect(repeated.attempts[1]).toMatchObject({ firstEncounter: false, answerWasRevealed: false });
  });

  it.each(["canonical", "accepted"])("does not relabel a taught %s answer as a first encounter after its exercise ID changes", async (where) => {
    const store = new MemoryStudio(); let service = new LearningStudioService(store, () => now);
    const target = SENTENCE_FAMILIES.find((family) => family.id === "need-time")!.exercises.find((item) => item.id === "time-4")!;
    const prior = { ...target, id: "retired-local-variant", stage: "training" as const,
      target: where === "canonical" ? "I WOULD LIKE TO CHECK THE PLAN FIRST!" : "I want to inspect this plan first.",
      acceptableAnswers: where === "accepted" ? ["I would like to check the plan first."] : [],
    };
    const cp = { ...checkpoint(), groupId: "need-time", exerciseIds: [prior.id] };
    await service.saveCheckpoint(cp);
    await service.submit({ id: "taught-answer", checkpoint: cp, exercise: prior, answer: prior.target, durationMs: 1_000 });
    await service.finishSession(cp.sessionId);
    service = new LearningStudioService(store, () => now);
    const test = { ...cp, sessionId: "transfer-check", exerciseIds: [target.id] };
    await service.saveCheckpoint(test);
    const result = await service.submit({ id: "relabelled-test", checkpoint: test, exercise: target, answer: target.target, durationMs: 1_000 });
    expect(result.attempts[1]).toMatchObject({ firstEncounter: false, firstSubmission: true, answerWasRevealed: false });
  });

  it("interprets old duration-4 evidence as Monday while keeping the new Tuesday variant distinct", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    store.document.attempts = [{ id: "old-monday", sessionId: "historical", activity: "family", groupId: "duration-start",
      exerciseId: "duration-4", stage: "held-out", outcome: "perfect", accuracy: 1, submittedAt: now.toISOString(),
      durationMs: 1_000, answerWasRevealed: false, firstSubmission: true, firstEncounter: true }];
    const monday = buildWeaknessExercises("for-since")[2];
    const cp: StudioCheckpoint = { ...checkpoint(), activity: "weakness", groupId: "for-since", exerciseIds: [monday.id] };
    await service.saveCheckpoint(cp);
    const repeated = await service.submit({ id: "known-monday", checkpoint: cp, exercise: monday, answer: monday.target, durationMs: 1_000 });
    expect(repeated.attempts[1].firstEncounter).toBe(false);
    await service.finishSession(cp.sessionId);
    const tuesday = SENTENCE_FAMILIES.find((family) => family.id === "duration-start")!.exercises.find((item) => item.id === "duration-since-tuesday")!;
    const test: StudioCheckpoint = { ...cp, sessionId: "new-tuesday", activity: "family", groupId: "duration-start", exerciseIds: [tuesday.id] };
    await service.saveCheckpoint(test);
    const novel = await service.submit({ id: "novel-tuesday", checkpoint: test, exercise: tuesday, answer: tuesday.target, durationMs: 1_000 });
    expect(novel.attempts[2].firstEncounter).toBe(true);
  });

  it("counts a new context cue independently from prior practice of the same learned expression", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const training = buildContextExercises(defaultCatalog.cards, new Set(["sf-020"]), "training")[0];
    const heldOut = buildContextExercises(defaultCatalog.cards, new Set(["sf-020"]), "held-out")[0];
    const cp: StudioCheckpoint = { ...checkpoint(), activity: "context", groupId: "all", exerciseIds: [training.id] };
    await service.saveCheckpoint(cp);
    await service.submit({ id: "trained-cue", checkpoint: cp, exercise: training, answer: training.target, durationMs: 1_000 });
    await service.finishSession(cp.sessionId);
    const test = { ...cp, sessionId: "unfamiliar-cue", exerciseIds: [heldOut.id] };
    await service.saveCheckpoint(test);
    const result = await service.submit({ id: "new-cue", checkpoint: test, exercise: heldOut, answer: heldOut.target, durationMs: 1_000 });
    expect(result.attempts[1]).toMatchObject({ firstEncounter: true, stage: "held-out" });
    expect(result.attempts[1].answerKeys).toEqual(result.attempts[0].answerKeys);
  });

  it("prevents late autosaves and stale submissions from reviving completed or moved exercises", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const cp = checkpoint(); await service.saveCheckpoint(cp);
    await service.saveCheckpoint({ ...cp, revision: 2, draft: "newer draft" });
    expect((await service.saveCheckpoint(cp)).checkpoint?.draft).toBe("newer draft");
    await expect(service.submit({ id: "old", checkpoint: cp, exercise, answer: exercise.target, durationMs: 1_000 })).rejects.toThrow("changed");
    await service.finishSession(cp.sessionId);
    await expect(service.saveCheckpoint({ ...cp, revision: 99 })).rejects.toThrow("ended");
    expect(store.document.checkpoint).toBeNull();
  });

  it("retains the current draft after failed writes and permits an explicit retry", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const cp = checkpoint(); await service.saveCheckpoint(cp); store.failNext = true;
    const command = { id: "retry", checkpoint: cp, exercise, answer: exercise.target, durationMs: 2_000 };
    await expect(service.submit(command)).rejects.toThrow("Storage unavailable");
    expect(store.document.attempts).toHaveLength(0);
    expect(store.document.checkpoint?.phase).toBe("recall");
    expect((await service.submit(command)).attempts).toHaveLength(1);
  });

  it("supports confirmed local CRUD, preserves learning for prompt edits and gives changed targets new identities", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const draft = { id: "personal-1", prompt: "说明日期尚未确定。", english: "The date isn't final yet.", source: "Checked with a colleague", confirmed: true };
    await service.savePersonal(draft);
    await expect(service.savePersonal({ ...draft, id: "duplicate" })).rejects.toThrow("already");
    const edited = await service.savePersonal({ ...draft, id: "unused", prompt: "开会时说明日期还没最后确认。" }, "personal-1");
    expect(edited.personalSentences[0].id).toBe("personal-1");
    await expect(service.savePersonal({ ...draft, english: "The time isn't final yet." }, "personal-1")).rejects.toThrow("identity");
    const replaced = await service.savePersonal({ ...draft, id: "personal-2", english: "The time isn't final yet." }, "personal-1");
    expect(replaced.personalSentences.map((sentence) => sentence.id)).toEqual(["personal-2"]);
    expect((await service.removePersonal("personal-2")).personalSentences).toEqual([]);
  });

  it("keeps an unfinished personal draft when another expression is added or edited", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const first = { id: "personal-date", prompt: "说明日期尚未确定。", english: "The date isn't final yet.",
      source: "Confirmed with a colleague", confirmed: true };
    await service.savePersonal(first);
    const cp: StudioCheckpoint = { ...checkpoint(), activity: "personal", groupId: "due",
      exerciseIds: [first.id], draft: "The date" };
    await service.saveCheckpoint(cp);
    const second = { ...first, id: "personal-time", prompt: "说明时间尚未确定。", english: "The time isn't final yet." };
    const added = await service.savePersonal(second);
    expect(added.checkpoint).toEqual(cp);
    expect(added.closedSessionIds).toEqual([]);
    const edited = await service.savePersonal({ ...second, prompt: "会议里说明时间还没最后确定。" }, second.id);
    expect(edited.checkpoint).toEqual(cp);
    const changed = await service.savePersonal({ ...first, id: "personal-date-new", english: "The date is final now." }, first.id);
    expect(changed.checkpoint).toBeNull();
    expect(changed.closedSessionIds).toEqual([cp.sessionId]);
    await expect(service.saveCheckpoint({ ...cp, revision: 99 })).rejects.toThrow("ended");
  });

  it("atomically puts due personal reveals and skips into focused review without double counting a lapse", async () => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const before = new Date("2026-10-21T04:00:00.000Z");
    const draft = { id: "personal-date", prompt: "说明日期尚未确定。", english: "The date isn't final yet.",
      source: "Confirmed with a colleague", confirmed: true };
    const created = createPersonalSentence(draft, before);
    const guided = recordPersonalRecall(created, draft.english, false, before).sentence;
    const acquired = recordPersonalRecall(guided, draft.english, false, before).sentence;
    acquired.reviewState = { ...acquired.reviewState, stage: 3, streak: 4, lapseCount: 2 };
    store.document.personalSentences = [acquired];
    const cp: StudioCheckpoint = { ...checkpoint(), activity: "personal", groupId: "due", exerciseIds: [draft.id] };
    await service.saveCheckpoint(cp);
    store.failNext = true;
    await expect(service.recordSignal(cp, "revealed")).rejects.toThrow("Storage unavailable");
    expect((await service.read()).personalSentences[0]).toEqual(acquired);
    expect((await service.read()).signals).toEqual([]);
    const revealed = await service.recordSignal(cp, "revealed");
    expect(revealed.personalSentences[0].reviewState).toMatchObject({ stage: 0, streak: 0, lapseCount: 3,
      dueAt: "2026-10-22T04:10:00.000Z" });
    expect(revealed.personalSentences[0].learningState).toEqual(acquired.learningState);
    const duplicate = await service.recordSignal(revealed.checkpoint!, "revealed");
    expect(duplicate.revision).toBe(revealed.revision);
    const skipped = await service.recordSignal(duplicate.checkpoint!, "skipped");
    expect(skipped.personalSentences[0].reviewState).toEqual(revealed.personalSentences[0].reviewState);
    expect(skipped.signals).toHaveLength(2);
  });

  it.each(["revealed", "skipped"] as const)("treats personal %s as guided acquisition and preserves voluntary review schedules", async (kind) => {
    const store = new MemoryStudio(); const service = new LearningStudioService(store, () => now);
    const draft = { id: "personal-date", prompt: "说明日期尚未确定。", english: "The date isn't final yet.",
      source: "Confirmed with a colleague", confirmed: true };
    const created = createPersonalSentence(draft, now);
    const ready = recordPersonalRecall(created, draft.english, false, now).sentence;
    store.document.personalSentences = [ready];
    const cp: StudioCheckpoint = { ...checkpoint(), activity: "personal", groupId: draft.id, exerciseIds: [draft.id] };
    await service.saveCheckpoint(cp);
    const supported = await service.recordSignal(cp, kind);
    expect(supported.personalSentences[0].learningState).toMatchObject({ acquisitionStatus: "needs-guided" });
    expect(supported.personalSentences[0].learningState.firstPassedAt).toBeUndefined();
    expect(supported.personalSentences[0].reviewState).toMatchObject({ stage: 0, lapseCount: 0,
      dueAt: "2026-10-22T04:10:00.000Z" });
    await service.finishSession(cp.sessionId);
    const acquired = recordPersonalRecall(ready, draft.english, false, now).sentence;
    store.document.personalSentences = [acquired];
    const voluntary = { ...cp, sessionId: "early-personal-practice" };
    await service.saveCheckpoint(voluntary);
    const practised = await service.recordSignal(voluntary, kind);
    expect(practised.personalSentences[0]).toEqual(acquired);
  });
});
