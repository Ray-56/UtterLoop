import type { SentenceCard } from "./SentenceCard";
import type { GrammarRole, GrammarToken } from "./SentenceLearningSupport";
import { containsCompleteSentenceAnswer } from "./inspectSentenceCardRecallSafety";

const GRAMMAR_ROLES = new Set<GrammarRole>([
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
]);

export function validateSentenceLearningSupport(card: SentenceCard): void {
  assertDoesNotContainCompleteAnswer(card.prompt, card, "Prompt");

  if (!card.learningSupport) {
    return;
  }

  const support = card.learningSupport;
  requireText(support.context, `SentenceCard ${card.id} learning context`);
  requireText(support.communicativeFunction, `SentenceCard ${card.id} communicative function`);
  requireText(support.pattern, `SentenceCard ${card.id} pattern`);
  requireText(support.frame, `SentenceCard ${card.id} frame`);
  if (!support.frame.includes("___")) {
    throw new Error(`SentenceCard ${card.id} frame must contain a blank marker (___).`);
  }
  assertDoesNotContainCompleteAnswer(support.frame, card, "frame");
  assertDoesNotContainCompleteAnswer(support.context, card, "context");
  assertDoesNotContainCompleteAnswer(support.pattern, card, "pattern");
  assertDoesNotContainCompleteAnswer(
    support.communicativeFunction,
    card,
    "communicative function",
  );
  validateKeywords(card);
  requireText(support.pronunciation.sentenceIpa, `SentenceCard ${card.id} sentence IPA`);
  if (support.pronunciation.dialect !== "en-US") {
    throw new Error(`SentenceCard ${card.id} pronunciation dialect must be en-US.`);
  }
  assertChunksReconstructTarget(
    support.pronunciation.chunks.map((chunk) => chunk.text),
    card,
    "pronunciation",
  );
  for (const chunk of support.pronunciation.chunks) {
    requireText(chunk.ipa, `SentenceCard ${card.id} pronunciation chunk IPA`);
  }
  requireText(support.grammar.structure, `SentenceCard ${card.id} grammar structure`);
  requireText(support.grammar.explanation, `SentenceCard ${card.id} grammar explanation`);
  assertDoesNotContainCompleteAnswer(
    support.grammar.explanation,
    card,
    "grammar explanation",
  );
  validateGrammarPoints(card);
  assertChunksReconstructTarget(
    support.grammar.chunks.map((chunk) => chunk.text),
    card,
    "grammar",
  );
  for (const chunk of support.grammar.chunks) {
    requireText(chunk.label, `SentenceCard ${card.id} grammar chunk label`);
    if (!GRAMMAR_ROLES.has(chunk.role)) {
      throw new Error(`SentenceCard ${card.id} grammar role is invalid: ${chunk.role}`);
    }
    validateGrammarTokens(card, chunk.text, chunk.tokens);
  }
}

function validateGrammarTokens(
  card: SentenceCard,
  chunkText: string,
  tokens: GrammarToken[] | undefined,
): void {
  if (tokens === undefined) {
    return;
  }

  for (const token of tokens) {
    requireTrimmedText(token.text, `SentenceCard ${card.id} grammar token text`);
    requireTrimmedText(token.ipa, `SentenceCard ${card.id} grammar token IPA`);
    requireTrimmedText(token.gloss, `SentenceCard ${card.id} grammar token gloss`);
    requireTrimmedText(
      token.partOfSpeech,
      `SentenceCard ${card.id} grammar token part of speech`,
    );
  }

  if (
    tokens.length === 0
    || normalizeWritten(tokens.map((token) => token.text).join(" "))
      !== normalizeWritten(chunkText)
  ) {
    throw new Error(
      `SentenceCard ${card.id} grammar tokens must reconstruct their chunk in order.`,
    );
  }
}

function validateGrammarPoints(card: SentenceCard): void {
  const points = card.learningSupport!.grammar.points;
  if (points.length > 2) {
    throw new Error(`SentenceCard ${card.id} grammar points must contain at most two items.`);
  }

  const seen = new Set<string>();
  for (const point of points) {
    if (point !== point.trim() || !point.trim()) {
      throw new Error(`SentenceCard ${card.id} grammar points must be non-empty and trimmed.`);
    }
    const normalized = point.toLocaleLowerCase();
    if (seen.has(normalized)) {
      throw new Error(`SentenceCard ${card.id} grammar points must be case-insensitively unique.`);
    }
    seen.add(normalized);
  }
}

function assertDoesNotContainCompleteAnswer(value: string, card: SentenceCard, label: string): void {
  if (containsCompleteSentenceAnswer(value, card)) {
    throw new Error(`SentenceCard ${card.id} ${label} must not expose the full target or acceptable answer.`);
  }
}

function validateKeywords(card: SentenceCard): void {
  const keywords = card.learningSupport!.keywords;
  if (keywords.length < 1 || keywords.length > 2) {
    throw new Error(`SentenceCard ${card.id} keywords must contain one or two items.`);
  }

  const normalizedTarget = normalizeWritten(card.english);
  const seen = new Set<string>();
  for (const keyword of keywords) {
    if (keyword !== keyword.trim() || !keyword.trim()) {
      throw new Error(`SentenceCard ${card.id} keywords must be non-empty and trimmed.`);
    }

    const normalized = normalizeWritten(keyword);
    if (seen.has(normalized)) {
      throw new Error(`SentenceCard ${card.id} keywords must be case-insensitively unique.`);
    }
    seen.add(normalized);

    if (normalized === normalizedTarget) {
      throw new Error(`SentenceCard ${card.id} keywords must not reconstruct the complete target.`);
    }

    if (!` ${normalizedTarget} `.includes(` ${normalized} `)) {
      throw new Error(`SentenceCard ${card.id} keyword must occur in the target: ${keyword}`);
    }
  }
  assertDoesNotContainCompleteAnswer(keywords.join(" "), card, "keywords");
}

function requireText(value: string, label: string): void {
  if (!value.trim()) {
    throw new Error(`${label} cannot be empty.`);
  }
}

function requireTrimmedText(value: string, label: string): void {
  if (!value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be non-empty and trimmed.`);
  }
}

function assertChunksReconstructTarget(
  chunkText: string[],
  card: SentenceCard,
  label: "pronunciation" | "grammar",
): void {
  if (chunkText.length === 0 || normalizeWritten(chunkText.join(" ")) !== normalizeWritten(card.english)) {
    throw new Error(`SentenceCard ${card.id} ${label} chunks must reconstruct the target sentence in order.`);
  }
}

function normalizeWritten(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?;:"()[\]{}]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
