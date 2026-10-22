import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FluencyProgress, FluencyResultMetrics } from "./FluencyProgress";
import type { FluencyResult } from "../../domain/studio/LearningStudio";
import type { SentenceCard } from "../../domain/content/SentenceCard";

const result: FluencyResult = {
  id: "pass", sourceCardId: "one", source: "learned", startedAt: "2026-10-22T00:00:00.000Z",
  completedAt: "2026-10-22T00:01:00.000Z", activeDurationMs: 60_000,
  committedCharacters: 10, correctCharacters: 9, uncorrectedErrors: 1,
  backspaces: 2, pauseCount: 1, longestPauseMs: 2_000, netWpm: 30,
  characterAccuracy: 0.9, physicalKeys: [{ code: "KeyC", presses: 3, mismatches: 1 }],
};
const card: SentenceCard = { id: "two", english: "Can you send it?", prompt: "礼貌提出请求。",
  source: "Test", tags: [], acceptableAnswers: [], createdAt: result.startedAt, updatedAt: result.startedAt };

describe("FluencyProgress", () => {
  it("renders honest empty metrics and unsampled key labels", () => {
    const html = renderToStaticMarkup(<FluencyProgress results={[]} learnedCards={[]} />);
    expect(html).toContain("Not measured");
    expect(html).toContain("0 passes");
    expect(html).toContain('aria-label="C: 0 presses, 0 mismatches"');
    expect(html).toContain("do not detect fingers");
  });

  it("renders key evidence and safe learned-card recommendations without target leakage", () => {
    const html = renderToStaticMarkup(<FluencyProgress results={[result]} learnedCards={[card]} onStartCard={() => {}} />);
    expect(html).toContain('aria-label="C: 3 presses, 1 mismatches"');
    expect(html).toContain("礼貌提出请求。");
    expect(html).toContain("Not previously used in a Fluency Pass");
    expect(html).toContain("Start typing pass");
    expect(html).not.toContain(card.english);
  });

  it("labels final accuracy and pause semantics explicitly", () => {
    const html = renderToStaticMarkup(<FluencyResultMetrics result={result} />);
    expect(html).toContain("Final character accuracy");
    expect(html).toContain("90%");
    expect(html).toContain("Backspace presses");
    expect(html).toContain("five characters per word");
    expect(html).toContain("whole target after edits");
  });
});
