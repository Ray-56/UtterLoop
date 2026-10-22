import { describe, expect, it } from "vitest";
import { defaultCatalog } from "../../application/seed/defaultCatalog";
import { CONTEXT_CUES, REHEARSAL_TASKS, SENTENCE_FAMILIES } from "./studioCatalog";
import { buildWeaknessExercises } from "./weaknessPractice";
import { normalizeAnswer } from "../practice/evaluateAttempt";
import {
  buildContextExercises, buildFamilyExercises, createPersonalSentence, evaluateStudioExercise,
  recordPersonalRecall, validateStudioCatalog,
} from "./studioRules";

describe("Learning Studio authored learning contracts", () => {
  it("ships 20 safe contextual cue sets, five 3+2 families and three complete rehearsals", () => {
    expect(() => validateStudioCatalog(defaultCatalog.cards)).not.toThrow();
    expect(CONTEXT_CUES).toHaveLength(20);
    for (const set of CONTEXT_CUES) {
      expect(set.cues.some((cue) => cue.stage === "training")).toBe(true);
      expect(set.cues.some((cue) => cue.stage === "held-out")).toBe(true);
    }
    expect(SENTENCE_FAMILIES).toHaveLength(5);
    for (const family of SENTENCE_FAMILIES) {
      expect(buildFamilyExercises(family.id, "training")).toHaveLength(3);
      expect(buildFamilyExercises(family.id, "held-out")).toHaveLength(2);
    }
    expect(REHEARSAL_TASKS).toHaveLength(3);
    expect(REHEARSAL_TASKS.every((task) => task.steps.length >= 3 && task.steps.length <= 5)).toBe(true);
  });

  it("requires acquired content and keeps held-out cues separate from training", () => {
    const acquired = new Set(["sf-001", "sf-020"]);
    const exercises = buildContextExercises(defaultCatalog.cards, acquired, "held-out");
    expect(exercises.map((exercise) => exercise.sourceCardId)).toEqual(["sf-001", "sf-020"]);
    expect(exercises.every((exercise) => exercise.stage === "held-out")).toBe(true);
    expect(buildContextExercises(defaultCatalog.cards, new Set(), "training")).toEqual([]);
    const card = defaultCatalog.cards.find((candidate) => candidate.id === "sf-020")!;
    expect(evaluateStudioExercise(exercises[1], card.english).outcome).toBe("perfect");
    expect(evaluateStudioExercise(exercises[1], card.acceptableAnswers[0]).outcome).toBe("perfect");
  });

  it("reserves every family test answer from all authored teaching targets and accepted answers", () => {
    const familyExercises = SENTENCE_FAMILIES.flatMap((family) => family.exercises);
    const teaching = [
      ...familyExercises.filter((exercise) => exercise.stage === "training"),
      ...REHEARSAL_TASKS.flatMap((task) => task.steps),
      ...(["articles", "for-since", "be-agreement"] as const).flatMap(buildWeaknessExercises),
      ...defaultCatalog.cards.map((card) => ({ target: card.english, acceptableAnswers: card.acceptableAnswers })),
    ];
    const taughtAnswers = new Set(teaching.flatMap((exercise) => [exercise.target, ...exercise.acceptableAnswers].map(normalizeAnswer)));
    const leaked = familyExercises.filter((exercise) => exercise.stage === "held-out")
      .filter((exercise) => [exercise.target, ...exercise.acceptableAnswers].some((answer) => taughtAnswers.has(normalizeAnswer(answer))))
      .map((exercise) => exercise.id);
    expect(leaked).toEqual([]);
  });

  it.each(["target", "accepted answer"])("rejects a family held-out expression exposed as a default teaching %s", (where) => {
    const extraCard = { ...defaultCatalog.cards[0], id: "pre-taught-variant",
      english: where === "target" ? "COULD YOU SEND US THE LINK BEFORE FRIDAY!" : "This is a different teaching sentence.",
      acceptableAnswers: where === "accepted answer" ? ["Could you send us the link before Friday?"] : [],
    };
    expect(() => validateStudioCatalog([...defaultCatalog.cards, extraCard])).toThrow("held-out");
  });

  it("uses the shared answer evaluator for variants and rejects unsupported arbitrary translations", () => {
    const exercise = buildFamilyExercises("need-time", "training")[0];
    expect(evaluateStudioExercise(exercise, "I would like to take a few minutes to think.").outcome).toBe("perfect");
    expect(evaluateStudioExercise(exercise, "Give me a moment.").outcome).not.toBe("perfect");
    expect(() => buildFamilyExercises("missing", "training")).toThrow("not found");
  });
});

describe("personal sentence lifecycle", () => {
  const now = new Date("2026-10-22T04:00:00.000Z");
  const draft = {
    id: "personal-1", prompt: "给同事说明最终日期还没确定。", english: "The date isn't final yet.",
    source: "Confirmed meeting expression", confirmed: true,
  };

  it("requires an explicit confirmation and a safe, bounded prompt before storing learner content", () => {
    const sentence = createPersonalSentence(draft, now);
    expect(sentence.card.id).toBe(draft.id);
    expect(sentence.learningState.acquisitionStatus).toBe("needs-guided");
    expect(() => createPersonalSentence({ ...draft, confirmed: false }, now)).toThrow("confirm");
    expect(() => createPersonalSentence({ ...draft, prompt: draft.english }, now)).toThrow();
    expect(() => createPersonalSentence({ ...draft, english: "" }, now)).toThrow();
    expect(() => createPersonalSentence({ ...draft, english: "x".repeat(501) }, now)).toThrow();
    expect(() => createPersonalSentence({ ...draft, source: "" }, now)).toThrow();
  });

  it("teaches before First Pass, then uses the shared review schedule without touching course evidence", () => {
    const sentence = createPersonalSentence(draft, now);
    const guided = recordPersonalRecall(sentence, draft.english, false, now);
    expect(guided.sentence.learningState.acquisitionStatus).toBe("ready-independent");
    expect(guided.sentence.learningState.firstPassedAt).toBeUndefined();
    const independent = recordPersonalRecall(guided.sentence, draft.english, false, new Date(now.getTime() + 60_000));
    expect(independent.sentence.learningState.firstPassedAt).toBe("2026-10-22T04:01:00.000Z");
    expect(independent.sentence.reviewState.stage).toBe(1);
    expect(independent.sentence.reviewState.dueAt).toBe("2026-10-22T12:01:00.000Z");
    expect(sentence.learningState.firstPassedAt).toBeUndefined();
  });

  it("keeps revealed answers assisted and preserves First Pass through later failures", () => {
    const sentence = createPersonalSentence(draft, now);
    const assisted = recordPersonalRecall(sentence, draft.english, true, now);
    expect(assisted.sentence.learningState.firstPassedAt).toBeUndefined();
    const ready = recordPersonalRecall(assisted.sentence, draft.english, false, now).sentence;
    const passed = ready.learningState.firstPassedAt ? ready : recordPersonalRecall(ready, draft.english, false, now).sentence;
    const earlyPractice = recordPersonalRecall(passed, "wrong sentence", false, now);
    expect(earlyPractice.sentence.reviewState).toEqual(passed.reviewState);
    const failed = recordPersonalRecall(passed, "wrong sentence", false, new Date(passed.reviewState.dueAt));
    expect(failed.sentence.learningState.firstPassedAt).toBe(passed.learningState.firstPassedAt);
    expect(failed.sentence.reviewState.stage).toBe(0);
  });

  it("returns an unsuccessful personal independent check to guided acquisition without fabricating a lapse", () => {
    const created = createPersonalSentence(draft, now);
    const ready = recordPersonalRecall(created, draft.english, false, now).sentence;
    const failed = recordPersonalRecall(ready, "The date is final now.", false, new Date("2026-10-22T04:01:00.000Z"));
    expect(failed.sentence.learningState.acquisitionStatus).toBe("needs-guided");
    expect(failed.sentence.learningState.firstPassedAt).toBeUndefined();
    expect(failed.sentence.reviewState).toMatchObject({ stage: 0, lapseCount: 0, dueAt: "2026-10-22T04:11:00.000Z" });
  });
});
