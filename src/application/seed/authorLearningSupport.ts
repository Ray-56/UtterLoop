import type { GrammarRole, SentenceLearningSupport } from "../../domain/content/SentenceLearningSupport";

export interface SupportDefinition {
  context: string;
  communicativeFunction: string;
  pattern: string;
  keywords: string[];
  frame: string;
  sentenceIpa: string;
  tokenAnnotations: Array<[
    text: string,
    gloss: string,
    partOfSpeech: string,
  ]>;
  pronunciationChunks: Array<[text: string, ipa: string]>;
  grammarStructure: string;
  grammarExplanation: string;
  grammarPoints: string[];
  grammarChunks: Array<[text: string, role: GrammarRole, label: string]>;
}

export function authorLearningSupport(definition: SupportDefinition): SentenceLearningSupport {
  const pronunciationTokens = definition.pronunciationChunks.flatMap(([text, ipa]) => {
    const writtenTokens = splitWrittenTokens(text);
    const ipaTokens = splitIpaTokens(ipa, definition);

    if (writtenTokens.length !== ipaTokens.length) {
      throw authoringError(
        definition,
        `pronunciation chunk "${text}" has ${writtenTokens.length} written tokens but ${ipaTokens.length} IPA units`,
      );
    }

    return writtenTokens.map((token, index) => ({
      text: token,
      ipa: `/${ipaTokens[index]}/`,
    }));
  });

  if (pronunciationTokens.length !== definition.tokenAnnotations.length) {
    throw authoringError(
      definition,
      `pronunciation provides ${pronunciationTokens.length} tokens but ${definition.tokenAnnotations.length} annotations were authored`,
    );
  }

  const authoredTokens = definition.tokenAnnotations.map(
    ([text, gloss, partOfSpeech], index) => {
      requireAuthoredText(text, `token ${index + 1} text`, definition);
      requireAuthoredText(gloss, `token ${index + 1} gloss`, definition);
      requireAuthoredText(partOfSpeech, `token ${index + 1} part of speech`, definition);

      const pronunciationToken = pronunciationTokens[index];
      if (normalizeWrittenToken(text) !== normalizeWrittenToken(pronunciationToken.text)) {
        throw authoringError(
          definition,
          `token ${index + 1} is "${text}" in annotations but "${pronunciationToken.text}" in pronunciation chunks`,
        );
      }

      return {
        text,
        ipa: pronunciationToken.ipa,
        gloss,
        partOfSpeech,
      };
    },
  );

  let tokenOffset = 0;
  const grammarChunks = definition.grammarChunks.map(([text, role, label]) => {
    const chunkWords = splitWrittenTokens(text);
    const tokens = authoredTokens.slice(tokenOffset, tokenOffset + chunkWords.length);

    if (tokens.length !== chunkWords.length) {
      throw authoringError(
        definition,
        `grammar chunk "${text}" extends beyond the authored token sequence`,
      );
    }

    chunkWords.forEach((word, index) => {
      if (normalizeWrittenToken(word) !== normalizeWrittenToken(tokens[index].text)) {
        throw authoringError(
          definition,
          `grammar chunk "${text}" expects "${word}" at token ${tokenOffset + index + 1}, but the annotation is "${tokens[index].text}"`,
        );
      }
    });

    tokenOffset += chunkWords.length;
    return { text, role, label, tokens };
  });

  if (tokenOffset !== authoredTokens.length) {
    throw authoringError(
      definition,
      `grammar chunks consume ${tokenOffset} tokens but ${authoredTokens.length} annotations were authored`,
    );
  }

  return {
    context: definition.context,
    communicativeFunction: definition.communicativeFunction,
    pattern: definition.pattern,
    keywords: definition.keywords,
    frame: definition.frame,
    pronunciation: {
      dialect: "en-US",
      sentenceIpa: definition.sentenceIpa,
      chunks: definition.pronunciationChunks.map(([text, ipa]) => ({ text, ipa })),
    },
    grammar: {
      structure: definition.grammarStructure,
      explanation: definition.grammarExplanation,
      points: definition.grammarPoints,
      chunks: grammarChunks,
    },
  };
}

function splitWrittenTokens(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function splitIpaTokens(ipa: string, definition: SupportDefinition): string[] {
  if (ipa !== ipa.trim() || !ipa.startsWith("/") || !ipa.endsWith("/")) {
    throw authoringError(definition, `pronunciation IPA "${ipa}" must be trimmed and enclosed in slashes`);
  }

  const tokens = ipa.slice(1, -1).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw authoringError(definition, "pronunciation IPA must contain at least one unit");
  }
  return tokens;
}

function requireAuthoredText(
  value: string,
  field: string,
  definition: SupportDefinition,
): void {
  if (!value || value !== value.trim()) {
    throw authoringError(definition, `${field} must be non-empty and trimmed`);
  }
}

function normalizeWrittenToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, "");
}

function authoringError(definition: SupportDefinition, message: string): Error {
  const target = definition.grammarChunks.map(([text]) => text).join(" ");
  return new Error(`Learning-support authoring error for "${target}": ${message}.`);
}
