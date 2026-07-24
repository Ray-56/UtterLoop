import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import {
  buildAttemptPreview,
  buildCorrectionDraft,
  buildCorrectionPreview,
  buildEvaluationPreview,
  CORRECTION_SLOT_PLACEHOLDER,
} from "./buildAttemptPreview";
import { evaluateAttempt } from "./evaluateAttempt";

const card: SentenceCard = {
  id: "card-1",
  english: "I can finish this sentence today.",
  prompt: "我今天可以完成这个句子。",
  source: "Test",
  tags: ["test"],
  acceptableAnswers: ["I can finish it today."],
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("buildAttemptPreview", () => {
  it("keeps an unfinished attempt out of evaluation", () => {
    const preview = buildAttemptPreview(card, "I can finish this");

    expect(preview).toMatchObject({
      isComplete: false,
      typedWordCount: 4,
    });
  });

  it("allows a complete attempt to be evaluated even when it is wrong", () => {
    const preview = buildAttemptPreview(card, "I can finish every sentence tomorrow");

    expect(preview.isComplete).toBe(true);
  });

  it("recognizes a shorter acceptable answer as complete", () => {
    const preview = buildAttemptPreview(card, "I can finish it today");

    expect(preview.isComplete).toBe(true);
    expect(preview.expectedWordCount).toBe(5);
    expect(preview.tokens).toHaveLength(6);
    expect(preview.tokens.slice(0, 5).every((token) => token.status === "matched")).toBe(true);
    expect(preview.tokens[5]).toMatchObject({
      expected: "",
      typed: "",
      status: "empty",
      typedIndex: null,
    });
    expect(preview.tokens.some((token) => token.status === "mismatch")).toBe(false);
  });

  it("keeps slot count and widths stable when the selected accepted answer changes", () => {
    const canonicalPreview = buildAttemptPreview(card, "I can finish this");
    const shorterPreview = buildAttemptPreview(card, "I can finish it today");

    expect(canonicalPreview.tokens).toHaveLength(6);
    expect(shorterPreview.tokens).toHaveLength(6);
    expect(shorterPreview.slotWidths).toEqual(canonicalPreview.slotWidths);
  });

  it("aligns submitted words to the best accepted answer without shifting after an insertion", () => {
    const evaluation = evaluateAttempt(card, {
      cardId: card.id,
      answer: "I really can finish it today",
      submittedAt: "2026-07-19T00:00:00.000Z",
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
    });

    const preview = buildEvaluationPreview(card, evaluation);

    expect(evaluation.acceptedAnswer).toBe("I can finish it today.");
    expect(preview.tokens.map(({ typed, status, typedIndex }) => ({ typed, status, typedIndex }))).toEqual([
      { typed: "i", status: "matched", typedIndex: 0 },
      { typed: "can", status: "matched", typedIndex: 2 },
      { typed: "finish", status: "matched", typedIndex: 3 },
      { typed: "it", status: "matched", typedIndex: 4 },
      { typed: "today", status: "matched", typedIndex: 5 },
      { typed: "", status: "empty", typedIndex: null },
    ]);
    expect(preview.extraTokens).toEqual(["really"]);
    expect(preview.extraTokenIndexes).toEqual([1]);
    expect(buildCorrectionDraft(preview)).toEqual({
      answer: "i can finish it today",
      firstErrorOffset: 2,
    });
  });

  it("keeps later matches in their accepted-answer slots after a deletion", () => {
    const evaluation = evaluateAttempt(card, {
      cardId: card.id,
      answer: "I can it today",
      submittedAt: "2026-07-19T00:00:00.000Z",
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
    });

    const preview = buildEvaluationPreview(card, evaluation);

    expect(preview.tokens.map(({ expected, typed, status, typedIndex }) => ({
      expected,
      typed,
      status,
      typedIndex,
    }))).toEqual([
      { expected: "i", typed: "i", status: "matched", typedIndex: 0 },
      { expected: "can", typed: "can", status: "matched", typedIndex: 1 },
      { expected: "finish", typed: "", status: "mismatch", typedIndex: null },
      { expected: "it", typed: "it", status: "matched", typedIndex: 2 },
      { expected: "today", typed: "today", status: "matched", typedIndex: 3 },
      { expected: "", typed: "", status: "empty", typedIndex: null },
    ]);
    expect(preview.extraTokens).toEqual([]);
    expect(preview.extraTokenIndexes).toEqual([]);
  });

  it("clears every mismatched slot, removes extras, and points to the first error", () => {
    const correctionCard = {
      ...card,
      english: "I can finish it today.",
      acceptableAnswers: [],
    };
    const evaluation = evaluateAttempt(correctionCard, {
      cardId: card.id,
      answer: "I really could finish those today",
      submittedAt: "2026-07-19T00:00:00.000Z",
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
    });
    const draft = buildCorrectionDraft(buildEvaluationPreview(correctionCard, evaluation));

    expect(evaluation.acceptedAnswer).toBe("I can finish it today.");
    expect(draft.answer).toBe(
      `i ${CORRECTION_SLOT_PLACEHOLDER} finish ${CORRECTION_SLOT_PLACEHOLDER} today`,
    );
    expect(draft.firstErrorOffset).toBe(2);
    expect(draft.answer).not.toContain("really");
    expect(draft.answer).not.toContain("could");
    expect(draft.answer).not.toContain("those");
  });

  it("keeps correction slots stable without revealing missing expected words", () => {
    const acceptedAnswer = "I can finish it today.";
    const draft = `i ${CORRECTION_SLOT_PLACEHOLDER} finish ${CORRECTION_SLOT_PLACEHOLDER} today`;
    const preview = buildCorrectionPreview(card, acceptedAnswer, draft);
    const wrongRetry = buildCorrectionPreview(
      card,
      acceptedAnswer,
      `i could finish ${CORRECTION_SLOT_PLACEHOLDER} today`,
    );

    expect(preview.tokens.map(({ expected, typed, status, typedIndex }) => ({
      expected,
      typed,
      status,
      typedIndex,
    }))).toEqual([
      { expected: "i", typed: "i", status: "matched", typedIndex: 0 },
      { expected: "", typed: "", status: "active", typedIndex: 1 },
      { expected: "finish", typed: "finish", status: "matched", typedIndex: 2 },
      { expected: "", typed: "", status: "empty", typedIndex: 3 },
      { expected: "today", typed: "today", status: "matched", typedIndex: 4 },
      { expected: "", typed: "", status: "empty", typedIndex: null },
    ]);
    expect(preview).toMatchObject({
      extraTokens: [],
      typedWordCount: 3,
      expectedWordCount: 5,
      completion: 0.6,
      isComplete: false,
    });
    expect(wrongRetry.tokens[1]).toMatchObject({
      expected: "",
      typed: "could",
      status: "mismatch",
    });
  });

  it("completes correction only after every placeholder is replaced", () => {
    const incomplete = buildCorrectionPreview(
      card,
      "I can finish it today.",
      `i can finish ${CORRECTION_SLOT_PLACEHOLDER} today`,
    );
    const complete = buildCorrectionPreview(
      card,
      "I can finish it today.",
      "i can finish it today",
    );
    const switchedToShorterAnswer = buildCorrectionPreview(
      card,
      card.english,
      "i can finish it today",
    );

    expect(incomplete.isComplete).toBe(false);
    expect(complete.isComplete).toBe(true);
    expect(switchedToShorterAnswer.isComplete).toBe(true);
    expect(complete.tokens.slice(0, 5).every((token) => token.status === "matched")).toBe(true);
  });
});
