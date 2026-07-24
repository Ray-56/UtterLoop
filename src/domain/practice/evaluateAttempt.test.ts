import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import { buildAttemptPreview } from "./buildAttemptPreview";
import { evaluateAttempt, normalizeAnswer } from "./evaluateAttempt";

const card: SentenceCard = {
  id: "card-1",
  english: "Practice sentences until they come naturally.",
  prompt: "练习句子，直到它们自然地脱口而出。",
  source: "Test fixture",
  tags: ["daily"],
  acceptableAnswers: [],
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

describe("evaluateAttempt", () => {
  it("accepts exact recall while ignoring case and punctuation", () => {
    const evaluation = evaluateAttempt(card, {
      cardId: card.id,
      answer: "practice sentences until they come naturally",
      submittedAt: "2026-07-18T00:00:00.000Z",
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
    });

    expect(evaluation.outcome).toBe("perfect");
    expect(evaluation.accuracy).toBe(1);
  });

  it("normalizes common contractions", () => {
    expect(normalizeAnswer("Don't stop.")).toBe("do not stop");
  });

  it("normalizes who's for readable word slots and equivalent full-form answers", () => {
    expect(normalizeAnswer("Who’s your friend?")).toBe("who is your friend");
  });

  it("marks missing words for close attempts", () => {
    const evaluation = evaluateAttempt(card, {
      cardId: card.id,
      answer: "Practice sentences until they naturally",
      submittedAt: "2026-07-18T00:00:00.000Z",
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
    });

    expect(evaluation.outcome).toBe("close");
    expect(evaluation.expectedWords.some((word) => word.status === "missing")).toBe(true);
  });

  it("previews typed words against target slots before submission", () => {
    const preview = buildAttemptPreview(card, "Practice sentences until");

    expect(preview.typedWordCount).toBe(3);
    expect(preview.tokens.slice(0, 3).every((token) => token.status === "matched")).toBe(true);
    expect(preview.tokens[3]?.status).toBe("active");
  });

  it("keeps the current partial word active until it is committed", () => {
    const preview = buildAttemptPreview(card, "Practice sent");

    expect(preview.tokens[0]?.status).toBe("matched");
    expect(preview.tokens[1]?.typed).toBe("sent");
    expect(preview.tokens[1]?.status).toBe("active");
  });

  it("marks an incorrect word after a trailing space commits it", () => {
    const preview = buildAttemptPreview(card, "Practice wrong ");

    expect(preview.tokens[1]?.status).toBe("mismatch");
    expect(preview.tokens[2]?.status).toBe("active");
  });
});
