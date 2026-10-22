import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFluencyWordTrack, FluencyPass, FluencyPassResult, rejectsFluencyInsertion, resolveFluencyKey } from "./FluencyPass";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { FluencyResult } from "../../domain/studio/LearningStudio";

const card: SentenceCard = {
  id: "one", english: "Can you help me?", prompt: "礼貌请求帮助。", source: "Test",
  tags: [], acceptableAnswers: [], createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z",
};
const event = { key: "Enter", ctrlKey: false, altKey: false, metaKey: false, isComposing: false };
const result: FluencyResult = {
  id: "same-stable-pass", sourceCardId: card.id, source: "correct", startedAt: card.createdAt,
  completedAt: "2026-10-22T00:01:00.000Z", activeDurationMs: 60_000,
  committedCharacters: 15, correctCharacters: 15, uncorrectedErrors: 0,
  backspaces: 2, pauseCount: 0, longestPauseMs: 500, netWpm: 3,
  characterAccuracy: 1, physicalKeys: [],
};

describe("FluencyPass", () => {
  it("renders a visible target and hidden native capture with keyboard and button alternatives", () => {
    const html = renderToStaticMarkup(<FluencyPass card={card} source="correct" onSave={async () => {}} onClose={() => {}} />);
    expect(html).toContain(card.english);
    expect(html).toContain('aria-label="Visible typing target"');
    expect(html).toContain('class="fluency-input-capture"');
    expect(html).toContain("Type the visible sentence for a Fluency Pass");
    expect(html).toContain("Finish pass");
    expect(html).toContain("Cancel pass");
    expect(html).toContain("Timer starts with your first character");
    expect(html).toContain("does not change English recall");
  });

  it("handles typing shortcuts while protecting composition and native modified keys", () => {
    expect(resolveFluencyKey(event)).toBe("finish");
    expect(resolveFluencyKey({ ...event, key: "p", ctrlKey: true })).toBe("toggle-pause");
    expect(resolveFluencyKey({ ...event, key: "Escape" })).toBe("cancel");
    expect(resolveFluencyKey({ ...event, isComposing: true })).toBeNull();
    expect(resolveFluencyKey({ ...event, key: "Escape", isComposing: true })).toBeNull();
    expect(resolveFluencyKey({ ...event, metaKey: true })).toBeNull();
    expect(resolveFluencyKey({ ...event, ctrlKey: true })).toBeNull();
  });

  it("blocks paste, replacement, and drop while allowing committed IME input and editing", () => {
    for (const inputType of ["insertFromPaste", "insertFromDrop", "insertReplacementText", "insertFromYank"]) {
      expect(rejectsFluencyInsertion(inputType)).toBe(true);
    }
    for (const inputType of ["insertText", "insertCompositionText", "insertFromComposition", "deleteContentBackward", undefined]) {
      expect(rejectsFluencyInsertion(inputType)).toBe(false);
    }
  });

  it("renders learner text in stable word slots, including extra words and caret editing", () => {
    const track = buildFluencyWordTrack("Can you help?", "Can we help? extra", 5);
    expect(track).toEqual([
      { expected: "Can", typed: "Can", status: "correct" },
      { expected: "you", typed: "we", status: "active" },
      { expected: "help?", typed: "help?", status: "correct" },
      { expected: "", typed: "extra", status: "incorrect" },
    ]);
  });

  it("retains result metrics and an explicit retry when persistence fails", () => {
    const html = renderToStaticMarkup(<FluencyPassResult result={result} saveState="error"
      onRetrySave={() => {}} onRestart={() => {}} onClose={() => {}} />);
    expect(html).toContain("Your typing result is still here");
    expect(html).toContain("Retry save");
    expect(html).toContain("3.0");
    expect(html).toContain("100%");
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/disabled=""[^>]*>Return to learning/);
  });
});
