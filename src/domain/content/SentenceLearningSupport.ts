export type PronunciationDialect = "en-US";

export type GrammarRole =
  | "subject"
  | "predicate"
  | "object"
  | "complement"
  | "adverbial"
  | "modal"
  | "auxiliary"
  | "determiner"
  | "conjunction"
  | "other";

export interface PronunciationChunk {
  text: string;
  ipa: string;
}

export interface GrammarToken {
  text: string;
  ipa: string;
  gloss: string;
  partOfSpeech: string;
}

export interface GrammarChunk {
  text: string;
  role: GrammarRole;
  label: string;
  tokens?: GrammarToken[];
}

export interface SentenceLearningSupport {
  context: string;
  communicativeFunction: string;
  pattern: string;
  keywords: string[];
  frame: string;
  pronunciation: {
    dialect: PronunciationDialect;
    sentenceIpa: string;
    chunks: PronunciationChunk[];
  };
  grammar: {
    structure: string;
    explanation: string;
    points: string[];
    chunks: GrammarChunk[];
  };
}
