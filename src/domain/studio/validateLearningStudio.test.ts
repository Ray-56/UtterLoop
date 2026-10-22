import { describe, expect, it } from "vitest";
import { emptyLearningStudio, type LearningStudioDocument } from "./LearningStudio";
import { createPersonalSentence } from "./studioRules";
import { beginFluency, finishFluency, updateFluencyInput } from "./fluency";
import { portableLearningStudio, validateLearningStudio, validatePortableLearningStudio } from "./validateLearningStudio";
import { studioAnswerKeys } from "./studioExposure";

describe("Learning Studio persistence boundary", () => {
  it("round-trips personal content, independent evidence, aggregate typing, and a local checkpoint", () => {
    const document = studioDocument();
    expect(validateLearningStudio(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it("keeps durable Studio evidence portable while excluding every active draft", () => {
    const document = studioDocument();
    const portable = portableLearningStudio(document);
    expect(portable).not.toHaveProperty("checkpoint");
    expect(JSON.stringify(portable)).not.toContain("private unfinished input");
    expect(validatePortableLearningStudio(JSON.parse(JSON.stringify(portable)))).toEqual(portable);
    expect(() => validatePortableLearningStudio({ ...portable, checkpoint: null })).toThrow("checkpoint");
  });

  it("round-trips optional expression identities without requiring them in older evidence", () => {
    const document = studioDocument();
    const keys = studioAnswerKeys({ target: "I'd like to check the plan first.", acceptableAnswers: ["I would like to check the plan first."] });
    document.attempts[0].answerKeys = keys;
    document.signals[0].answerKeys = keys;
    expect(validateLearningStudio(document)).toEqual(document);
    expect(validatePortableLearningStudio(JSON.parse(JSON.stringify(portableLearningStudio(document)))).attempts[0].answerKeys).toEqual(keys);
    expect(validateLearningStudio(studioDocument()).attempts[0]).not.toHaveProperty("answerKeys");
  });

  it("rejects a second new-expression claim under another exercise ID while allowing a genuinely new context cue", () => {
    const document = studioDocument();
    const keys = studioAnswerKeys({ target: "I'd like to check the plan first.", acceptableAnswers: [] });
    document.attempts[0].answerKeys = keys;
    document.attempts.push({ ...document.attempts[0], id: "relabelled-attempt", exerciseId: "another-exercise" });
    expect(() => validateLearningStudio(document)).toThrow("firstEncounters");
    document.attempts[1].activity = "context";
    expect(validateLearningStudio(document).attempts[1].firstEncounter).toBe(true);
  });

  it("preserves an optional caret while accepting older checkpoints without caret fields", () => {
    const document = studioDocument();
    expect(validateLearningStudio(document).checkpoint).not.toHaveProperty("selectionStart");
    Object.assign(document.checkpoint!, { selectionStart: 4, selectionEnd: 9 });
    expect(validateLearningStudio(document).checkpoint).toMatchObject({ selectionStart: 4, selectionEnd: 9 });
    Object.assign(document.checkpoint!, { selectionStart: 9, selectionEnd: 4 });
    expect(() => validateLearningStudio(document)).toThrow("caret");
    Object.assign(document.checkpoint!, { selectionStart: 0, selectionEnd: 100_000 });
    expect(() => validateLearningStudio(document)).toThrow("caret");
  });

  it.each([
    ["root key history", (document: LearningStudioDocument) => Object.assign(document, { rawKeys: [] })],
    ["attempt raw answer", (document: LearningStudioDocument) => Object.assign(document.attempts[0], { answer: "private answer" })],
    ["typing key history", (document: LearningStudioDocument) => Object.assign(document.fluencyResults[0], { events: [] })],
    ["signal raw answer", (document: LearningStudioDocument) => Object.assign(document.signals[0], { answer: "private answer" })],
    ["signal invalid time", (document: LearningStudioDocument) => { document.signals[0].at = "yesterday"; }],
    ["raw expression identity", (document: LearningStudioDocument) => { document.attempts[0].answerKeys = ["I am ready."]; }],
    ["empty expression identities", (document: LearningStudioDocument) => { document.signals[0].answerKeys = []; }],
    ["duplicate expression identities", (document: LearningStudioDocument) => { document.signals[0].answerKeys = ["answer-v1-0000000000000001", "answer-v1-0000000000000001"]; }],
    ["duplicate signal ID", (document: LearningStudioDocument) => { document.signals.push(structuredClone(document.signals[0])); }],
    ["personal unknown field", (document: LearningStudioDocument) => Object.assign(document.personalSentences[0].card, { generated: true })],
    ["invalid time", (document: LearningStudioDocument) => { document.attempts[0].submittedAt = "yesterday"; }],
    ["NaN accuracy", (document: LearningStudioDocument) => { document.attempts[0].accuracy = NaN; }],
    ["infinite WPM", (document: LearningStudioDocument) => { document.fluencyResults[0].netWpm = Infinity; }],
    ["negative duration", (document: LearningStudioDocument) => { document.fluencyResults[0].activeDurationMs = -1; }],
    ["incorrect personal reference", (document: LearningStudioDocument) => { document.personalSentences[0].reviewState.cardId = "someone-else"; }],
    ["unintroduced personal learning", (document: LearningStudioDocument) => { document.personalSentences[0].learningState = { cardId: "personal-1" }; }],
    ["reserved personal identity", (document: LearningStudioDocument) => {
      const sentence = document.personalSentences[0];
      sentence.id = "sf-001"; sentence.card.id = "sf-001";
      sentence.learningState.cardId = "sf-001"; sentence.reviewState.cardId = "sf-001";
    }],
    ["unearned personal advancement", (document: LearningStudioDocument) => { document.personalSentences[0].reviewState.stage = 3; }],
    ["unearned personal streak", (document: LearningStudioDocument) => { document.personalSentences[0].reviewState.streak = 1; }],
    ["unearned personal lapse", (document: LearningStudioDocument) => { document.personalSentences[0].reviewState.lapseCount = 1; }],
    ["personal mastery at wrong stage", (document: LearningStudioDocument) => {
      document.personalSentences[0].learningState = { cardId: "personal-1", introducedAt: "2026-10-22T00:00:00.000Z",
        firstPassedAt: "2026-10-22T00:01:00.000Z", firstPassSource: "explicit-mastery" };
      document.personalSentences[0].reviewState.learningStatus = "mastered";
    }],
    ["personal answer leakage", (document: LearningStudioDocument) => { document.personalSentences[0].card.prompt = "I am ready."; }],
    ["duplicate personal ID", (document: LearningStudioDocument) => { document.personalSentences.push(structuredClone(document.personalSentences[0])); }],
    ["duplicate attempt ID", (document: LearningStudioDocument) => { document.attempts.push(structuredClone(document.attempts[0])); }],
    ["fabricated new encounter", (document: LearningStudioDocument) => { document.attempts.push({ ...document.attempts[0], id: "new-id" }); }],
    ["new encounter on retry", (document: LearningStudioDocument) => { document.attempts[0].firstSubmission = false; }],
    ["duplicate fluency ID", (document: LearningStudioDocument) => { document.fluencyResults.push(structuredClone(document.fluencyResults[0])); }],
    ["counted impossible characters", (document: LearningStudioDocument) => { document.fluencyResults[0].correctCharacters = 10_000; }],
    ["typing duration beyond wall time", (document: LearningStudioDocument) => { document.fluencyResults[0].activeDurationMs = 60_000; }],
    ["invalid physical key", (document: LearningStudioDocument) => { document.fluencyResults[0].physicalKeys = [{ code: "SecretTypedWord", presses: 1, mismatches: 0 }]; }],
    ["physical mismatch overflow", (document: LearningStudioDocument) => { document.fluencyResults[0].physicalKeys = [{ code: "KeyA", presses: 1, mismatches: 2 }]; }],
    ["checkpoint out of range", (document: LearningStudioDocument) => { document.checkpoint!.index = 8; }],
    ["closed checkpoint revival", (document: LearningStudioDocument) => { document.closedSessionIds.push(document.checkpoint!.sessionId); }],
  ])("rejects %s from untrusted data", (_label, mutate) => {
    const document = studioDocument();
    mutate(document);
    expect(() => validateLearningStudio(document)).toThrow();
  });
});

export function studioDocument(): LearningStudioDocument {
  const personal = createPersonalSentence({
    id: "personal-1", prompt: "告诉同事你已经准备好了。", english: "I am ready.",
    source: "Checked personal notes", confirmed: true,
  }, new Date("2026-10-22T00:00:00.000Z"));
  const capture = updateFluencyInput(beginFluency({
    id: "fluency-1", sourceCardId: "personal-1", source: "learned", target: "I am ready.",
  }), "I am ready.", 0);
  return {
    ...emptyLearningStudio(),
    personalSentences: [personal],
    attempts: [{
      id: "attempt-1", sessionId: "completed-session", activity: "family", groupId: "request",
      exerciseId: "request-held-out", stage: "held-out", outcome: "perfect", accuracy: 1,
      submittedAt: "2026-10-22T00:01:00.000Z", durationMs: 5_000,
      answerWasRevealed: false, firstSubmission: true, firstEncounter: true,
    }],
    signals: [{ id: "signal-1", sessionId: "completed-session", activity: "family",
      exerciseId: "different-exercise", kind: "skipped", at: "2026-10-22T00:02:00.000Z" }],
    fluencyResults: [finishFluency(capture, 10_000, new Date("2026-10-22T00:03:00.000Z"))],
    closedSessionIds: ["completed-session"],
    checkpoint: {
      revision: 0, sessionId: "unfinished-session", activity: "personal", groupId: "personal",
      exerciseIds: ["personal-1"], index: 0, phase: "recall", draft: "private unfinished input",
      answerWasRevealed: false, submissionCount: 0, updatedAt: "2026-10-22T00:04:00.000Z",
    },
  };
}
