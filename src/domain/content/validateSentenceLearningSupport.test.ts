import { describe, expect, it } from "vitest";
import type { SentenceCard } from "./SentenceCard";
import { validateSentenceLearningSupport } from "./validateSentenceLearningSupport";

describe("validateSentenceLearningSupport", () => {
  it("accepts structured support whose chunks reconstruct the target", () => {
    expect(() => validateSentenceLearningSupport(card())).not.toThrow();
  });

  it("keeps legacy grammar chunks without tokens valid", () => {
    const value = card();
    value.learningSupport!.grammar.chunks.forEach((chunk) => {
      delete chunk.tokens;
    });

    expect(() => validateSentenceLearningSupport(value)).not.toThrow();
  });

  it.each([
    ["context", (value: SentenceCard) => { value.learningSupport!.context = " "; }],
    ["communicative function", (value: SentenceCard) => { value.learningSupport!.communicativeFunction = " "; }],
    ["pattern", (value: SentenceCard) => { value.learningSupport!.pattern = " "; }],
    ["frame", (value: SentenceCard) => { value.learningSupport!.frame = " "; }],
    ["sentence IPA", (value: SentenceCard) => { value.learningSupport!.pronunciation.sentenceIpa = " "; }],
    ["grammar structure", (value: SentenceCard) => { value.learningSupport!.grammar.structure = " "; }],
    ["grammar explanation", (value: SentenceCard) => { value.learningSupport!.grammar.explanation = " "; }],
  ])("rejects empty %s", (label, change) => {
    const value = card();
    change(value);

    expect(() => validateSentenceLearningSupport(value)).toThrow(label);
  });

  it("rejects an unsupported pronunciation dialect", () => {
    const value = card();
    value.learningSupport!.pronunciation.dialect = "en-GB" as "en-US";

    expect(() => validateSentenceLearningSupport(value)).toThrow("dialect");
  });

  it.each([
    ["pronunciation", (value: SentenceCard) => { value.learningSupport!.pronunciation.chunks[1].text = "close the door"; }],
    ["grammar", (value: SentenceCard) => { value.learningSupport!.grammar.chunks.reverse(); }],
  ])("rejects %s chunks that do not reconstruct the canonical target in order", (label, change) => {
    const value = card();
    change(value);

    expect(() => validateSentenceLearningSupport(value)).toThrow(`${label} chunks`);
  });

  it.each([
    ["pronunciation chunk IPA", (value: SentenceCard) => { value.learningSupport!.pronunciation.chunks[0].ipa = " "; }],
    ["grammar chunk label", (value: SentenceCard) => { value.learningSupport!.grammar.chunks[0].label = " "; }],
    ["grammar role", (value: SentenceCard) => { value.learningSupport!.grammar.chunks[0].role = "verb" as never; }],
  ])("rejects an invalid %s", (label, change) => {
    const value = card();
    change(value);

    expect(() => validateSentenceLearningSupport(value)).toThrow(label);
  });

  it.each([
    ["text", (value: SentenceCard) => { value.learningSupport!.grammar.chunks[0].tokens![0].text = " "; }],
    ["IPA", (value: SentenceCard) => { value.learningSupport!.grammar.chunks[0].tokens![0].ipa = " /kʊd/"; }],
    ["gloss", (value: SentenceCard) => { value.learningSupport!.grammar.chunks[0].tokens![0].gloss = "能 "; }],
    ["part of speech", (value: SentenceCard) => { value.learningSupport!.grammar.chunks[0].tokens![0].partOfSpeech = " "; }],
  ])("rejects a grammar token with invalid %s", (label, change) => {
    const value = card();
    change(value);

    expect(() => validateSentenceLearningSupport(value)).toThrow(`grammar token ${label}`);
  });

  it("rejects grammar tokens that do not reconstruct their chunk in order", () => {
    const value = card();
    value.learningSupport!.grammar.chunks[3].tokens = [
      { text: "a window", ipa: "/ə ˈwɪndoʊ/", gloss: "一扇窗户", partOfSpeech: "名词短语" },
    ];

    expect(() => validateSentenceLearningSupport(value)).toThrow(
      "grammar tokens must reconstruct their chunk in order",
    );
  });

  it.each([
    ["one or two", (value: SentenceCard) => { value.learningSupport!.keywords = []; }],
    ["one or two", (value: SentenceCard) => { value.learningSupport!.keywords = ["could", "open", "window"]; }],
    ["unique", (value: SentenceCard) => { value.learningSupport!.keywords = ["Open", "open"]; }],
    ["occur", (value: SentenceCard) => { value.learningSupport!.keywords = ["door"]; }],
    ["complete target", (value: SentenceCard) => { value.learningSupport!.keywords = ["Could you open the window?"]; }],
  ])("rejects keywords that violate the %s rule", (message, change) => {
    const value = card();
    change(value);

    expect(() => validateSentenceLearningSupport(value)).toThrow(message);
  });

  it.each([
    ["blank marker", (value: SentenceCard) => { value.learningSupport!.frame = "Could you open the window?"; }],
    ["full target", (value: SentenceCard) => { value.learningSupport!.frame = "Could you open the window? ___"; }],
  ])("rejects a frame that exposes the %s", (message, change) => {
    const value = card();
    change(value);

    expect(() => validateSentenceLearningSupport(value)).toThrow(message);
  });

  it.each([
    ["at most two", ["one", "two", "three"]],
    ["unique", ["Verb form", "verb form"]],
    ["trimmed", [" verb form"]],
  ])("rejects grammar points that are not %s", (message, points) => {
    const value = card();
    value.learningSupport!.grammar.points = points;

    expect(() => validateSentenceLearningSupport(value)).toThrow(message);
  });

  it.each([
    ["Prompt", (value: SentenceCard) => { value.prompt = `请输入: ${value.english}`; }],
    ["context", (value: SentenceCard) => { value.learningSupport!.context = value.english; }],
    ["communicative function", (value: SentenceCard) => { value.learningSupport!.communicativeFunction = value.english; }],
    ["pattern", (value: SentenceCard) => { value.learningSupport!.pattern = value.english; }],
    ["grammar explanation", (value: SentenceCard) => { value.learningSupport!.grammar.explanation = value.english; }],
  ])("rejects target-bearing %s content", (message, change) => {
    const value = card();
    change(value);

    expect(() => validateSentenceLearningSupport(value)).toThrow(message);
  });

  it("rejects keywords that reconstruct the complete target together", () => {
    const value = card();
    value.learningSupport!.keywords = ["Could you", "open the window"];

    expect(() => validateSentenceLearningSupport(value)).toThrow("keywords");
  });
});

function card(): SentenceCard {
  return {
    id: "card-1",
    english: "Could you open the window?",
    prompt: "你能帮忙打开窗户吗？",
    source: "Test",
    tags: ["test"],
    acceptableAnswers: [],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    learningSupport: {
      context: "礼貌地请求别人做事。",
      communicativeFunction: "礼貌请求",
      pattern: "Could + 主语 + 动词原形 + 宾语?",
      keywords: ["open", "window"],
      frame: "Could you ___ the ___?",
      pronunciation: {
        dialect: "en-US",
        sentenceIpa: "/kʊd ju ˈoʊpən ðə ˈwɪndoʊ/",
        chunks: [
          { text: "Could you", ipa: "/kʊd ju/" },
          { text: "open the window", ipa: "/ˈoʊpən ðə ˈwɪndoʊ/" },
        ],
      },
      grammar: {
        structure: "Modal + S + V + O",
        explanation: "Could 放在主语前，用动词原形构成礼貌请求。",
        points: ["情态动词 could", "动词原形"],
        chunks: [
          {
            text: "Could",
            role: "modal",
            label: "情态动词",
            tokens: [
              { text: "Could", ipa: "/kʊd/", gloss: "能；可以", partOfSpeech: "情态动词" },
            ],
          },
          {
            text: "you",
            role: "subject",
            label: "主语 S",
            tokens: [
              { text: "you", ipa: "/ju/", gloss: "你", partOfSpeech: "人称代词" },
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
            text: "the window",
            role: "object",
            label: "宾语 O",
            tokens: [
              { text: "the", ipa: "/ðə/", gloss: "这个", partOfSpeech: "定冠词" },
              { text: "window", ipa: "/ˈwɪndoʊ/", gloss: "窗户", partOfSpeech: "名词" },
            ],
          },
        ],
      },
    },
  };
}
