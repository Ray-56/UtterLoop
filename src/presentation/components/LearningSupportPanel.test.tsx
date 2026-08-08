import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { starterLearningSupportByCardId } from "../../application/seed/starterLearningSupport";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import {
  LearningSupportPanel,
  shouldRecordAudioPlaybackAsRecallSupport,
} from "./LearningSupportPanel";

const starterSupport = starterLearningSupportByCardId["sf-013"];

const legacyCard: SentenceCard = {
  id: "sf-013",
  english: "Could you open the window?",
  prompt: "你能把窗户打开吗？",
  source: "UtterLoop Original",
  tags: ["requests"],
  acceptableAnswers: [],
  learningSupport: {
    ...starterSupport,
    grammar: {
      ...starterSupport.grammar,
      chunks: starterSupport.grammar.chunks.map(({ text, role, label }) => ({
        text,
        role,
        label,
      })),
    },
  },
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const tokenizedCard: SentenceCard = {
  ...legacyCard,
  learningSupport: {
    ...legacyCard.learningSupport!,
    grammar: {
      ...legacyCard.learningSupport!.grammar,
      chunks: [
        {
          text: "Could",
          role: "modal",
          label: "情态动词",
          tokens: [
            { text: "Could", ipa: "/kʊd/", gloss: "可以", partOfSpeech: "情态动词" },
          ],
        },
        {
          text: "you",
          role: "subject",
          label: "主语 S",
          tokens: [
            { text: "you", ipa: "/ju/", gloss: "你", partOfSpeech: "代词" },
          ],
        },
        {
          text: "open",
          role: "predicate",
          label: "谓语 V",
          tokens: [
            { text: "open", ipa: "/ˈoʊpən/", gloss: "打开", partOfSpeech: "动词" },
          ],
        },
        {
          text: "the window?",
          role: "object",
          label: "宾语 O",
          tokens: [
            { text: "the", ipa: "/ðə/", gloss: "这扇", partOfSpeech: "限定词" },
            { text: "window?", ipa: "/ˈwɪndoʊ/", gloss: "窗户", partOfSpeech: "名词" },
          ],
        },
      ],
    },
  },
};

function renderPanel(
  card: SentenceCard,
  props: Partial<React.ComponentProps<typeof LearningSupportPanel>> = {},
): string {
  return renderToStaticMarkup(
    <LearningSupportPanel
      card={card}
      mode="recall"
      onStartRecall={vi.fn()}
      supportLevel={0}
      {...props}
    />,
  );
}

describe("LearningSupportPanel", () => {
  it("shows only the single grammar-map row and Start recall command on full First Exposure", () => {
    const html = renderPanel(tokenizedCard, { mode: "first-exposure" });

    expect(html).toContain("learning-support-map-only");
    expect(html).toContain("sentence-grammar-map");
    expect(html).toContain("Start recall");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain("Play audio");
    expect(html).not.toContain("learning-support-heading");
    expect(html).not.toContain("learning-support-context");
    expect(html).not.toContain("learning-support-pattern");
    expect(html).not.toContain("learning-support-keywords");
    expect(html).not.toContain("learning-support-target-form");
    expect(html).not.toContain("pronunciation-chunks");
    expect(html).not.toContain("grammar-chunks");
  });

  it("disables the sole First Exposure command while persistence needs attention", () => {
    const html = renderPanel(tokenizedCard, {
      disabled: true,
      mode: "first-exposure",
    });

    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html.match(/disabled/g)).toHaveLength(1);
  });

  it("shows only the grammar map in Result and explicit Answer", () => {
    const result = renderPanel(tokenizedCard, { mode: "result" });
    const answer = renderPanel(tokenizedCard, {
      mode: "recall",
      showAnswer: true,
      supportLevel: 4,
    });

    for (const html of [result, answer]) {
      expect(html).toContain("sentence-grammar-map");
      expect(html).toContain("/ˈwɪndoʊ/");
      expect(html).toContain("窗户");
      expect(html).not.toContain("<button");
      expect(html).not.toContain("learning-support-full-target");
      expect(html).not.toContain("General American");
      expect(html).not.toContain("Grammar notes");
    }
  });

  it("keeps Recall private while abbreviated exposure uses the one-line target fallback", () => {
    const recall = renderPanel(tokenizedCard);
    const suppressed = renderPanel(tokenizedCard, {
      showAnswer: true,
      suppressFullTarget: true,
      supportLevel: 4,
    });
    const abbreviated = renderPanel(tokenizedCard, {
      exposureStyle: "abbreviated",
      mode: "first-exposure",
    });

    for (const html of [recall, suppressed]) {
      expect(html).not.toContain("sentence-grammar-map");
      expect(html).not.toContain("Could you open the window?");
      expect(html).not.toContain("learning-support-full-target");
    }
    expect(abbreviated).not.toContain("sentence-grammar-map");
    expect(abbreviated).toContain("learning-support-full-target");
    expect(abbreviated).toContain("Could you open the window?");
    expect(abbreviated).toContain("Start recall");
  });

  it("uses only the plain written target when curated token details are unavailable", () => {
    const answer = renderPanel(legacyCard, {
      showAnswer: true,
      supportLevel: 4,
    });
    const result = renderPanel(legacyCard, { mode: "result" });

    for (const html of [answer, result]) {
      expect(html).toContain("learning-support-full-target");
      expect(html).toContain("Could you open the window?");
      expect(html).not.toContain("sentence-grammar-map");
      expect(html).not.toContain("pronunciation-chunks");
      expect(html).not.toContain("grammar-chunks");
      expect(html).not.toContain("/kʊd ju ˈoʊpən ðə ˈwɪndoʊ/");
    }
  });

  it("keeps the existing audio-support signal classification", () => {
    expect(shouldRecordAudioPlaybackAsRecallSupport("first-exposure")).toBe(false);
    expect(shouldRecordAudioPlaybackAsRecallSupport("result")).toBe(false);
    expect(shouldRecordAudioPlaybackAsRecallSupport("recall")).toBe(true);
  });
});
