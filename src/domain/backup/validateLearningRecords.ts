import type { SentenceCard } from "../content/SentenceCard";
import { assertValidSentenceLearningState, type AcquisitionStatus, type FirstPassSource, type SentenceLearningState } from "../learning/SentenceLearningState";
import type { LearningStatus, ReviewState } from "../review/ReviewState";

const FIRST_PASS_SOURCES = new Set<FirstPassSource>(["independent-recall", "explicit-mastery", "legacy"]);
const ACQUISITION_STATUSES = new Set<AcquisitionStatus>(["needs-guided", "ready-independent"]);
const LEARNING_STATUSES = new Set<LearningStatus>(["new", "mastered"]);

export function validateSentenceCardRecord(value: unknown, path: string): SentenceCard {
  const item = record(value, path);
  exactKeys(item, ["id", "english", "prompt", "note", "learningSupport", "source", "sourceUrl", "license", "tags", "acceptableAnswers", "createdAt", "updatedAt"], path, true);
  const card: SentenceCard = {
    id: text(item.id, `${path}.id`),
    english: text(item.english, `${path}.english`),
    prompt: text(item.prompt, `${path}.prompt`),
    ...(item.note === undefined ? {} : { note: text(item.note, `${path}.note`) }),
    ...(item.learningSupport === undefined ? {} : { learningSupport: validateLearningSupportShape(item.learningSupport, `${path}.learningSupport`) }),
    source: text(item.source, `${path}.source`),
    ...(item.sourceUrl === undefined ? {} : { sourceUrl: text(item.sourceUrl, `${path}.sourceUrl`) }),
    ...(item.license === undefined ? {} : { license: validateLicense(item.license, `${path}.license`) }),
    tags: stringArray(item.tags, `${path}.tags`),
    acceptableAnswers: stringArray(item.acceptableAnswers, `${path}.acceptableAnswers`, true),
    createdAt: timestamp(item.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(item.updatedAt, `${path}.updatedAt`),
  };
  if (Date.parse(card.createdAt) > Date.parse(card.updatedAt)) {
    throw pathError(`${path}.updatedAt`, "must not be earlier than createdAt");
  }
  validateRestorableLearningSupport(card, path);
  return card;
}

function validateLearningSupportShape(value: unknown, path: string): NonNullable<SentenceCard["learningSupport"]> {
  const support = record(value, path);
  exactKeys(support, ["context", "communicativeFunction", "pattern", "keywords", "frame", "pronunciation", "grammar"], path);
  const pronunciation = record(support.pronunciation, `${path}.pronunciation`);
  exactKeys(pronunciation, ["dialect", "sentenceIpa", "chunks"], `${path}.pronunciation`);
  const grammar = record(support.grammar, `${path}.grammar`);
  exactKeys(grammar, ["structure", "explanation", "points", "chunks"], `${path}.grammar`);
  return {
    context: text(support.context, `${path}.context`),
    communicativeFunction: text(support.communicativeFunction, `${path}.communicativeFunction`),
    pattern: text(support.pattern, `${path}.pattern`),
    keywords: stringArray(support.keywords, `${path}.keywords`),
    frame: text(support.frame, `${path}.frame`),
    pronunciation: {
      dialect: literal(pronunciation.dialect, "en-US", `${path}.pronunciation.dialect`),
      sentenceIpa: text(pronunciation.sentenceIpa, `${path}.pronunciation.sentenceIpa`),
      chunks: array(pronunciation.chunks, `${path}.pronunciation.chunks`).map((value, index) => {
        const chunkPath = `${path}.pronunciation.chunks[${index}]`;
        const chunk = record(value, chunkPath);
        exactKeys(chunk, ["text", "ipa"], chunkPath);
        return { text: text(chunk.text, `${chunkPath}.text`), ipa: text(chunk.ipa, `${chunkPath}.ipa`) };
      }),
    },
    grammar: {
      structure: text(grammar.structure, `${path}.grammar.structure`),
      explanation: text(grammar.explanation, `${path}.grammar.explanation`),
      points: stringArray(grammar.points, `${path}.grammar.points`),
      chunks: array(grammar.chunks, `${path}.grammar.chunks`).map((value, index) => {
        const chunkPath = `${path}.grammar.chunks[${index}]`;
        const chunk = record(value, chunkPath);
        exactKeysWithOptional(chunk, ["text", "role", "label"], ["tokens"], chunkPath);
        const tokens = chunk.tokens === undefined
          ? undefined
          : array(chunk.tokens, `${chunkPath}.tokens`).map((value, tokenIndex) => {
              const tokenPath = `${chunkPath}.tokens[${tokenIndex}]`;
              const token = record(value, tokenPath);
              exactKeys(token, ["text", "ipa", "gloss", "partOfSpeech"], tokenPath);
              return {
                text: trimmedText(token.text, `${tokenPath}.text`),
                ipa: trimmedText(token.ipa, `${tokenPath}.ipa`),
                gloss: trimmedText(token.gloss, `${tokenPath}.gloss`),
                partOfSpeech: trimmedText(
                  token.partOfSpeech,
                  `${tokenPath}.partOfSpeech`,
                ),
              };
            });
        return {
          text: text(chunk.text, `${chunkPath}.text`),
          role: enumeration(chunk.role, ["subject", "predicate", "object", "complement", "adverbial", "modal", "auxiliary", "determiner", "conjunction", "other"], `${chunkPath}.role`),
          label: text(chunk.label, `${chunkPath}.label`),
          ...(tokens === undefined ? {} : { tokens }),
        };
      }),
    },
  };
}

/**
 * Full Backup is a recovery format, not a content-admission boundary. Keep the
 * learning-support shape and internal reconstruction rules, while deliberately
 * leaving target-bearing Prompt/support detection to runtime quarantine.
 */
function validateRestorableLearningSupport(card: SentenceCard, cardPath: string): void {
  const support = card.learningSupport;
  if (!support) return;
  const path = `${cardPath}.learningSupport`;
  if (!support.frame.includes("___")) {
    throw pathError(`${path}.frame`, "must contain a blank marker (___)");
  }
  if (support.keywords.length < 1 || support.keywords.length > 2) {
    throw pathError(`${path}.keywords`, "must contain one or two items");
  }
  const normalizedTarget = normalizeWritten(card.english);
  const keywordSet = new Set<string>();
  support.keywords.forEach((keyword, index) => {
    if (keyword !== keyword.trim()) {
      throw pathError(`${path}.keywords[${index}]`, "must be trimmed");
    }
    const normalized = normalizeWritten(keyword);
    if (keywordSet.has(normalized)) {
      throw pathError(`${path}.keywords[${index}]`, "duplicates an earlier keyword");
    }
    keywordSet.add(normalized);
    if (!` ${normalizedTarget} `.includes(` ${normalized} `)) {
      throw pathError(`${path}.keywords[${index}]`, "must occur in the target");
    }
  });
  assertChunksReconstructTarget(
    support.pronunciation.chunks.map((chunk) => chunk.text),
    card,
    `${path}.pronunciation.chunks`,
  );
  assertChunksReconstructTarget(
    support.grammar.chunks.map((chunk) => chunk.text),
    card,
    `${path}.grammar.chunks`,
  );
  support.grammar.chunks.forEach((chunk, index) => {
    if (chunk.tokens === undefined) return;
    const tokenPath = `${path}.grammar.chunks[${index}].tokens`;
    if (
      chunk.tokens.length === 0
      || normalizeWritten(chunk.tokens.map((token) => token.text).join(" "))
        !== normalizeWritten(chunk.text)
    ) {
      throw pathError(tokenPath, "must reconstruct its grammar chunk in order");
    }
  });
  if (support.grammar.points.length > 2) {
    throw pathError(`${path}.grammar.points`, "must contain at most two items");
  }
  const pointSet = new Set<string>();
  support.grammar.points.forEach((point, index) => {
    if (point !== point.trim()) {
      throw pathError(`${path}.grammar.points[${index}]`, "must be trimmed");
    }
    const normalized = point.toLocaleLowerCase();
    if (pointSet.has(normalized)) {
      throw pathError(`${path}.grammar.points[${index}]`, "duplicates an earlier point");
    }
    pointSet.add(normalized);
  });
}

function assertChunksReconstructTarget(
  chunks: string[],
  card: SentenceCard,
  path: string,
): void {
  if (chunks.length === 0
    || normalizeWritten(chunks.join(" ")) !== normalizeWritten(card.english)) {
    throw pathError(path, "must reconstruct the target sentence in order");
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

function validateLicense(value: unknown, path: string) {
  const license = record(value, path);
  exactKeys(license, ["name", "url", "attribution"], path);
  return {
    name: text(license.name, `${path}.name`),
    url: text(license.url, `${path}.url`),
    attribution: text(license.attribution, `${path}.attribution`),
  };
}

export function validateSentenceLearningStateRecord(value: unknown, path: string): SentenceLearningState {
  const item = record(value, path);
  exactKeys(item, ["cardId", "introducedAt", "acquisitionStatus", "firstPassedAt", "firstPassSource"], path, true);
  const state: SentenceLearningState = {
    cardId: text(item.cardId, `${path}.cardId`),
    ...(item.introducedAt === undefined ? {} : { introducedAt: timestamp(item.introducedAt, `${path}.introducedAt`) }),
    ...(item.acquisitionStatus === undefined ? {} : { acquisitionStatus: setEnumeration(item.acquisitionStatus, ACQUISITION_STATUSES, `${path}.acquisitionStatus`) }),
    ...(item.firstPassedAt === undefined ? {} : { firstPassedAt: timestamp(item.firstPassedAt, `${path}.firstPassedAt`) }),
    ...(item.firstPassSource === undefined ? {} : { firstPassSource: setEnumeration(item.firstPassSource, FIRST_PASS_SOURCES, `${path}.firstPassSource`) }),
  };
  try {
    assertValidSentenceLearningState(state);
  } catch (error) {
    throw pathError(path, errorMessage(error));
  }
  if (state.introducedAt && state.firstPassedAt && Date.parse(state.introducedAt) > Date.parse(state.firstPassedAt)) {
    throw pathError(`${path}.firstPassedAt`, "must not be earlier than introducedAt");
  }
  return state;
}

export function validateReviewStateRecord(value: unknown, path: string): ReviewState {
  const item = record(value, path);
  exactKeys(item, ["cardId", "stage", "dueAt", "lastReviewedAt", "streak", "lapseCount", "learningStatus"], path, true);
  return {
    cardId: text(item.cardId, `${path}.cardId`),
    stage: enumeration(item.stage, [0, 1, 2, 3, 4, 5, 6], `${path}.stage`),
    dueAt: timestamp(item.dueAt, `${path}.dueAt`),
    ...(item.lastReviewedAt === undefined ? {} : { lastReviewedAt: timestamp(item.lastReviewedAt, `${path}.lastReviewedAt`) }),
    streak: safeInteger(item.streak, `${path}.streak`, 0),
    lapseCount: safeInteger(item.lapseCount, `${path}.lapseCount`, 0),
    ...(item.learningStatus === undefined ? {} : { learningStatus: setEnumeration(item.learningStatus, LEARNING_STATUSES, `${path}.learningStatus`) }),
  };
}

export function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw pathError(path, "must be an object");
  return value as Record<string, unknown>;
}
export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw pathError(path, "must be an array");
  return value;
}
export function string(value: unknown, path: string): string {
  if (typeof value !== "string") throw pathError(path, "must be a string");
  return value;
}
export function text(value: unknown, path: string): string {
  const result = string(value, path);
  if (!result.trim()) throw pathError(path, "must be non-empty text");
  return result;
}
export function trimmedText(value: unknown, path: string): string {
  const result = text(value, path);
  if (result !== result.trim()) throw pathError(path, "must be trimmed text");
  return result;
}
export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw pathError(path, "must be a boolean");
  return value;
}
export function boundedNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw pathError(path, `must be a finite number from ${min} to ${max}`);
  return value;
}
export function safeInteger(value: unknown, path: string, min: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) throw pathError(path, `must be a safe integer of at least ${min}`);
  return value;
}
export function timestamp(value: unknown, path: string): string {
  const result = string(value, path);
  const time = Date.parse(result);
  if (!Number.isFinite(time)) throw pathError(path, "must be a valid timestamp");
  try {
    if (new Date(time).toISOString() !== result) throw pathError(path, "must be a canonical ISO timestamp");
  } catch {
    throw pathError(path, "must be a valid timestamp");
  }
  return result;
}
export function stringArray(value: unknown, path: string, allowEmptyText = false): string[] {
  return array(value, path).map((item, index) => allowEmptyText ? string(item, `${path}[${index}]`) : text(item, `${path}[${index}]`));
}
export function literal<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw pathError(path, `must equal ${JSON.stringify(expected)}`);
  return expected;
}
export function enumeration<const T extends readonly (string | number)[]>(value: unknown, values: T, path: string): T[number] {
  if (!(values as readonly unknown[]).includes(value)) throw pathError(path, `must be one of ${values.join(", ")}`);
  return value as T[number];
}
export function setEnumeration<T extends string>(value: unknown, values: Set<T>, path: string): T {
  if (typeof value !== "string" || !values.has(value as T)) throw pathError(path, `has an unknown value ${JSON.stringify(value)}`);
  return value as T;
}
export function unique<T>(items: T[], getId: (item: T) => string, path: string, field: string): void {
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const id = getId(item);
    const first = seen.get(id);
    if (first !== undefined) throw pathError(`${path}[${index}].${field}`, `duplicates ${path}[${first}].${field}`);
    seen.set(id, index);
  });
}
export function exactKeys(value: Record<string, unknown>, allowed: string[], path: string, optionalAllowed = false): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw pathError(`${path}.${key}`, "is not part of the full-backup schema");
  }
  if (!optionalAllowed) {
    for (const key of allowed) {
      if (!(key in value)) throw pathError(`${path}.${key}`, "is required");
    }
  }
}
export function exactKeysWithOptional(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  path: string,
): void {
  exactKeys(value, [...required, ...optional], path, true);
  for (const key of required) {
    if (!(key in value)) throw pathError(`${path}.${key}`, "is required");
  }
}
export function pathError(path: string, message: string): Error {
  return new Error(`${path} ${message}`);
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
