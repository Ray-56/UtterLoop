import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  GrammarChunk,
  GrammarRole,
} from "../../domain/content/SentenceLearningSupport";
import {
  hasCompleteGrammarTokenDetails,
  SentenceGrammarMap,
  type TokenizedGrammarChunk,
} from "./SentenceGrammarMap";

describe("SentenceGrammarMap", () => {
  it("renders curated token pronunciation, meaning, and part of speech inside its grammar group", () => {
    const chunks: TokenizedGrammarChunk[] = [
      {
        text: "Could you",
        role: "modal",
        label: "情态动词 + 主语",
        tokens: [
          {
            text: "Could",
            ipa: "/kʊd/",
            gloss: "可以",
            partOfSpeech: "情态动词",
          },
          {
            text: "you",
            ipa: "/ju/",
            gloss: "你",
            partOfSpeech: "代词",
          },
        ],
      },
      {
        text: "open the window?",
        role: "predicate",
        label: "谓语 V",
        tokens: [
          {
            text: "open",
            ipa: "/ˈoʊpən/",
            gloss: "打开",
            partOfSpeech: "动词",
          },
          {
            text: "the window?",
            ipa: "/ðə ˈwɪndoʊ/",
            gloss: "这扇窗户",
            partOfSpeech: "名词短语",
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      <SentenceGrammarMap
        chunks={chunks}
      />,
    );

    expect(html).toContain('aria-label="Sentence structure map"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Sentence grammar"');
    expect(html).not.toContain("sentence-grammar-map-heading");
    expect(html).not.toContain("Grammar map");
    expect(html).toContain("/kʊd/");
    expect(html).toContain("可以");
    expect(html).toContain("情态动词");
    expect(html).toContain("sentence-grammar-token");
    expect(html).toContain("sentence-grammar-group grammar-role-modal has-token-detail");
    expect(html).toContain("sentence-grammar-group grammar-role-predicate has-token-detail");
  });

  it("keeps every supported grammar role explicit in text as well as its styling hook", () => {
    const roles: GrammarRole[] = [
      "subject",
      "predicate",
      "object",
      "complement",
      "adverbial",
      "modal",
      "auxiliary",
      "determiner",
      "conjunction",
      "other",
    ];
    const chunks: TokenizedGrammarChunk[] = roles.map((role, index) => ({
      text: `chunk ${index + 1}`,
      role,
      label: `语法角色 ${index + 1}`,
      tokens: [{
        text: `chunk ${index + 1}`,
        ipa: `/chunk ${index + 1}/`,
        gloss: `词义 ${index + 1}`,
        partOfSpeech: `词性 ${index + 1}`,
      }],
    }));

    const html = renderToStaticMarkup(
      <SentenceGrammarMap
        chunks={chunks}
      />,
    );

    roles.forEach((role, index) => {
      expect(html).toContain(`grammar-role-${role}`);
      expect(html).toContain(`语法角色 ${index + 1}`);
    });
  });

  it("requires complete curated tokens for every chunk before selecting the detailed map", () => {
    const complete: GrammarChunk[] = [
      {
        text: "I",
        role: "subject",
        label: "主语 S",
        tokens: [{ text: "I", ipa: "/aɪ/", gloss: "我", partOfSpeech: "代词" }],
      },
    ];
    const mixed: GrammarChunk[] = [
      ...complete,
      { text: "agree.", role: "predicate", label: "谓语 V" },
    ];

    expect(hasCompleteGrammarTokenDetails(complete)).toBe(true);
    expect(hasCompleteGrammarTokenDetails(mixed)).toBe(false);
    expect(hasCompleteGrammarTokenDetails([])).toBe(false);
  });
});
