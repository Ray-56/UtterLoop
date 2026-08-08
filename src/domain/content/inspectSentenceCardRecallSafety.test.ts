import { describe, expect, it } from "vitest";
import type { SentenceCard } from "./SentenceCard";
import { inspectSentenceCardRecallSafety } from "./inspectSentenceCardRecallSafety";

describe("inspectSentenceCardRecallSafety", () => {
  it("accepts a non-target-bearing Prompt", () => {
    expect(inspectSentenceCardRecallSafety(card())).toEqual({ safe: true, issues: [] });
  });

  it.each([
    ["canonical target", "请输入：Could you open the window?"],
    ["acceptable answer", "请输入 could you please open the window"],
    ["normalized punctuation and case", "COULD-YOU/OPEN THE WINDOW"],
  ])("detects a Prompt containing the %s without returning the unsafe text", (_label, prompt) => {
    const value = card();
    value.prompt = prompt;

    const result = inspectSentenceCardRecallSafety(value);

    expect(result).toEqual({
      safe: false,
      issues: [{ code: "target-bearing-prompt", field: "prompt" }],
    });
    expect(JSON.stringify(result)).not.toContain(value.english);
    expect(JSON.stringify(result)).not.toContain(value.acceptableAnswers[0]);
  });
});

function card(): SentenceCard {
  return {
    id: "card-1",
    english: "Could you open the window?",
    prompt: "你能帮忙打开窗户吗？",
    source: "Test",
    tags: ["test"],
    acceptableAnswers: ["Could you please open the window?"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}
