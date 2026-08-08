import type { SentenceCard } from "../content/SentenceCard";
import type { Course, CourseCategory, LearningPath } from "../curriculum/Course";
import {
  assertValidSentenceLearningState,
  type AcquisitionStatus,
  type FirstPassSource,
  type SentenceLearningState,
} from "../learning/SentenceLearningState";
import type {
  PersistedAttemptEvidence,
  PracticeAttemptLogEntry,
  PracticeLogEntry,
  PracticeSignalLogEntry,
} from "../practice/PracticeLogEntry";
import type {
  PersistedPracticePhase,
  PracticeSignalKind,
  RecallSupportKind,
  RecallSupportLevel,
} from "../practice/PracticeTurn";
import type { LearningStatus, ReviewState } from "../review/ReviewState";
import type { VocabularyEntry } from "../vocabulary/VocabularyEntry";
import type {
  PracticeRoundSummary,
  PracticeSessionEvidence,
  PracticeSessionEvidenceScope,
  PracticeSessionEntryPoint,
  PracticeSessionTerminal,
  ContextualPracticeLogEntry,
  PracticeLogContext,
} from "../practice/PracticeSessionEvidence";
import { PRACTICE_SESSION_EVIDENCE_SCHEMA_VERSION } from "../practice/PracticeSessionEvidence";
import {
  DEFAULT_FINGER_GUIDE_MODE,
  FULL_BACKUP_DATABASE_SCHEMA_VERSION,
  FULL_BACKUP_SCHEMA_VERSION,
  LEGACY_FULL_BACKUP_DATABASE_SCHEMA_VERSION,
  LEGACY_FULL_BACKUP_SCHEMA_VERSION,
  type AppPreferences,
  type FingerGuideMode,
  type QuickStartStatus,
  type ThemePreference,
  type UtterLoopFullBackupV2,
} from "./UtterLoopFullBackup";

const PHASES = new Set<PersistedPracticePhase>([
  "first-exposure",
  "guided-recall",
  "independent-recall",
  "corrective-practice",
  "review-recall",
  "voluntary-practice",
  "legacy",
]);
const SUPPORT_KINDS = new Set<RecallSupportKind>([
  "pattern", "keywords", "frame", "pronunciation", "audio", "grammar",
  "copy-target", "answer", "correction",
]);
const SIGNAL_KINDS = new Set<PracticeSignalKind>(["support-used", "revealed", "skipped"]);
const FIRST_PASS_SOURCES = new Set<FirstPassSource>(["independent-recall", "explicit-mastery", "legacy"]);
const ACQUISITION_STATUSES = new Set<AcquisitionStatus>(["needs-guided", "ready-independent"]);
const LEARNING_STATUSES = new Set<LearningStatus>(["new", "mastered"]);
const THEMES = new Set<ThemePreference>(["system", "light", "dark"]);
const FINGER_GUIDE_MODES = new Set<FingerGuideMode>(["auto", "compact", "full", "off"]);
const QUICK_START_STATUSES = new Set<QuickStartStatus>(["completed", "dismissed"]);
const TARGET_BEARING_SUPPORT = new Set<RecallSupportKind>([
  "pattern", "keywords", "frame", "pronunciation", "audio", "grammar", "copy-target", "answer",
]);

export function validateFullBackup(
  value: unknown,
  legacyMeasurementEpoch = new Date().toISOString(),
): UtterLoopFullBackupV2 {
  const root = record(value, "$backup");
  exactKeys(root, ["format", "schemaVersion", "exportedAt", "databaseSchemaVersion", "catalog", "learning", "preferences"], "$backup");
  literal(root.format, "utterloop-full-backup", "format");
  const schemaVersion = enumeration(
    root.schemaVersion,
    [LEGACY_FULL_BACKUP_SCHEMA_VERSION, FULL_BACKUP_SCHEMA_VERSION],
    "schemaVersion",
  );
  timestamp(root.exportedAt, "exportedAt");
  literal(
    root.databaseSchemaVersion,
    schemaVersion === LEGACY_FULL_BACKUP_SCHEMA_VERSION
      ? LEGACY_FULL_BACKUP_DATABASE_SCHEMA_VERSION
      : FULL_BACKUP_DATABASE_SCHEMA_VERSION,
    "databaseSchemaVersion",
  );

  const catalogValue = record(root.catalog, "catalog");
  exactKeys(catalogValue, ["categories", "learningPaths", "courses", "cards"], "catalog");
  const categories = array(catalogValue.categories, "catalog.categories").map(validateCategory);
  const learningPaths = array(catalogValue.learningPaths, "catalog.learningPaths").map(validateLearningPath);
  const courses = array(catalogValue.courses, "catalog.courses").map(validateCourse);
  const cards = array(catalogValue.cards, "catalog.cards").map(validateCard);
  unique(categories, (item) => item.id, "catalog.categories", "id");
  unique(learningPaths, (item) => item.id, "catalog.learningPaths", "id");
  unique(courses, (item) => item.id, "catalog.courses", "id");
  unique(cards, (item) => item.id, "catalog.cards", "id");
  validateCatalogReferences(categories, learningPaths, courses, cards);
  validateRestorableCatalog(courses);

  const learningValue = record(root.learning, "learning");
  exactKeys(
    learningValue,
    schemaVersion === LEGACY_FULL_BACKUP_SCHEMA_VERSION
      ? ["sentenceLearningStates", "reviewStates", "practiceLog", "vocabularyEntries"]
      : [
          "sentenceLearningStates",
          "reviewStates",
          "practiceLog",
          "vocabularyEntries",
          "measurementEpoch",
          "practiceSessionEvidence",
        ],
    "learning",
  );
  const sentenceLearningStates = array(learningValue.sentenceLearningStates, "learning.sentenceLearningStates")
    .map(validateSentenceLearningState);
  const reviewStates = array(learningValue.reviewStates, "learning.reviewStates").map(validateReviewState);
  const practiceLog = array(learningValue.practiceLog, "learning.practiceLog")
    .map((entry, index) => validatePracticeLogEntry(
      entry,
      index,
      schemaVersion === FULL_BACKUP_SCHEMA_VERSION,
    ));
  const vocabularyEntries = array(learningValue.vocabularyEntries, "learning.vocabularyEntries")
    .map(validateVocabularyEntry);
  unique(sentenceLearningStates, (item) => item.cardId, "learning.sentenceLearningStates", "cardId");
  unique(reviewStates, (item) => item.cardId, "learning.reviewStates", "cardId");
  unique(practiceLog, (item) => item.id, "learning.practiceLog", "id");
  unique(vocabularyEntries, (item) => item.cardId, "learning.vocabularyEntries", "cardId");
  const practiceSessionEvidence = schemaVersion === FULL_BACKUP_SCHEMA_VERSION
    ? array(
        learningValue.practiceSessionEvidence,
        "learning.practiceSessionEvidence",
      ).map(validatePracticeSessionEvidence)
    : [];
  unique(
    practiceSessionEvidence,
    (item) => item.sessionId,
    "learning.practiceSessionEvidence",
    "sessionId",
  );
  unique(
    practiceSessionEvidence,
    (item) => item.roundId,
    "learning.practiceSessionEvidence",
    "roundId",
  );
  validateLearningReferences(cards, sentenceLearningStates, reviewStates, practiceLog, vocabularyEntries);
  validateGuidedInvariants(sentenceLearningStates, reviewStates, practiceLog);

  const measurementEpoch = schemaVersion === FULL_BACKUP_SCHEMA_VERSION
    ? timestamp(learningValue.measurementEpoch, "learning.measurementEpoch")
    : timestamp(legacyMeasurementEpoch, "learning.measurementEpoch");

  const preferences = validatePreferences(root.preferences);

  return {
    format: "utterloop-full-backup",
    schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
    exportedAt: root.exportedAt as string,
    databaseSchemaVersion: FULL_BACKUP_DATABASE_SCHEMA_VERSION,
    catalog: { categories, learningPaths, courses, cards },
    learning: {
      sentenceLearningStates,
      reviewStates,
      practiceLog,
      vocabularyEntries,
      measurementEpoch,
      practiceSessionEvidence,
    },
    preferences,
  };
}

function validateCategory(value: unknown, index: number): CourseCategory {
  const path = `catalog.categories[${index}]`;
  const item = record(value, path);
  exactKeys(item, ["id", "title", "description", "sortOrder"], path);
  return {
    id: text(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`),
    description: text(item.description, `${path}.description`),
    sortOrder: safeInteger(item.sortOrder, `${path}.sortOrder`, 0),
  };
}

function validateLearningPath(value: unknown, index: number): LearningPath {
  const path = `catalog.learningPaths[${index}]`;
  const item = record(value, path);
  exactKeys(item, ["id", "title", "description", "courseIds"], path);
  const courseIds = array(item.courseIds, `${path}.courseIds`).map((id, position) => text(id, `${path}.courseIds[${position}]`));
  unique(courseIds, (id) => id, `${path}.courseIds`, "value");
  return {
    id: text(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`),
    description: text(item.description, `${path}.description`),
    courseIds,
  };
}

function validateCourse(value: unknown, index: number): Course {
  const path = `catalog.courses[${index}]`;
  const item = record(value, path);
  exactKeys(item, ["id", "title", "description", "categoryId", "tags", "level", "provider", "revision", "license", "units"], path);
  const level = record(item.level, `${path}.level`);
  exactKeys(level, ["label", "cefrFrom", "cefrTo"], `${path}.level`);
  const provider = record(item.provider, `${path}.provider`);
  exactKeys(provider, ["kind", "name", "url"], `${path}.provider`, true);
  const license = record(item.license, `${path}.license`);
  exactKeys(license, ["name", "url", "attribution"], `${path}.license`);
  const tags = stringArray(item.tags, `${path}.tags`);
  const units = array(item.units, `${path}.units`).map((unitValue, unitIndex) => {
    const unitPath = `${path}.units[${unitIndex}]`;
    const unit = record(unitValue, unitPath);
    exactKeys(unit, ["id", "title", "description", "lessons"], unitPath);
    return {
      id: text(unit.id, `${unitPath}.id`),
      title: text(unit.title, `${unitPath}.title`),
      description: text(unit.description, `${unitPath}.description`),
      lessons: array(unit.lessons, `${unitPath}.lessons`).map((lessonValue, lessonIndex) => {
        const lessonPath = `${unitPath}.lessons[${lessonIndex}]`;
        const lesson = record(lessonValue, lessonPath);
        exactKeys(lesson, ["id", "title", "objective", "sourceUrl", "cardIds"], lessonPath, true);
        return {
          id: text(lesson.id, `${lessonPath}.id`),
          title: text(lesson.title, `${lessonPath}.title`),
          objective: text(lesson.objective, `${lessonPath}.objective`),
          ...(lesson.sourceUrl === undefined ? {} : { sourceUrl: text(lesson.sourceUrl, `${lessonPath}.sourceUrl`) }),
          cardIds: stringArray(lesson.cardIds, `${lessonPath}.cardIds`),
        };
      }),
    };
  });
  return {
    id: text(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`),
    description: text(item.description, `${path}.description`),
    categoryId: text(item.categoryId, `${path}.categoryId`),
    tags,
    level: {
      label: text(level.label, `${path}.level.label`),
      cefrFrom: enumeration(level.cefrFrom, ["A1", "A2", "B1", "B2", "C1", "C2"], `${path}.level.cefrFrom`),
      cefrTo: enumeration(level.cefrTo, ["A1", "A2", "B1", "B2", "C1", "C2"], `${path}.level.cefrTo`),
    },
    provider: {
      kind: enumeration(provider.kind, ["original", "curated", "imported"], `${path}.provider.kind`),
      name: text(provider.name, `${path}.provider.name`),
      ...(provider.url === undefined ? {} : { url: text(provider.url, `${path}.provider.url`) }),
    },
    revision: safeInteger(item.revision, `${path}.revision`, 1),
    license: {
      name: text(license.name, `${path}.license.name`),
      url: text(license.url, `${path}.license.url`),
      attribution: text(license.attribution, `${path}.license.attribution`),
    },
    units,
  };
}

function validateCard(value: unknown, index: number): SentenceCard {
  const path = `catalog.cards[${index}]`;
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

function validatePracticeSessionEvidence(
  value: unknown,
  index: number,
): PracticeSessionEvidence {
  const path = `learning.practiceSessionEvidence[${index}]`;
  const item = record(value, path);
  exactKeys(item, [
    "schemaVersion",
    "sessionId",
    "roundId",
    "scope",
    "entryPoint",
    "startedAt",
    "engagedAt",
    "endedAt",
    "terminal",
    "round",
  ], path);
  const startedAt = timestamp(item.startedAt, `${path}.startedAt`);
  const engagedAt = item.engagedAt === null
    ? null
    : timestamp(item.engagedAt, `${path}.engagedAt`);
  const endedAt = timestamp(item.endedAt, `${path}.endedAt`);
  if (engagedAt && Date.parse(engagedAt) < Date.parse(startedAt)) {
    throw pathError(`${path}.engagedAt`, "must not be earlier than startedAt");
  }
  if (Date.parse(endedAt) < Date.parse(engagedAt ?? startedAt)) {
    throw pathError(`${path}.endedAt`, "must not be earlier than the session activity");
  }
  const entryPoint = validateSessionEntryPoint(item.entryPoint, `${path}.entryPoint`);
  const terminal = validateSessionTerminal(item.terminal, `${path}.terminal`);
  const round = validatePracticeRoundSummary(item.round, `${path}.round`);
  if (terminal.kind === "dismissed" && entryPoint !== "quick-start-v1") {
    throw pathError(`${path}.terminal`, "dismissed is only valid for Quick Start");
  }
  if (terminal.kind === "completed"
    && terminal.reason === "quick-start-complete"
    && entryPoint !== "quick-start-v1") {
    throw pathError(`${path}.terminal.reason`, "requires a Quick Start entry point");
  }
  if (terminal.kind === "completed" && round.remainingOccurrenceIds.length > 0) {
    throw pathError(`${path}.round.remainingOccurrenceIds`, "must be empty for a completed session");
  }
  return {
    schemaVersion: literal(
      item.schemaVersion,
      PRACTICE_SESSION_EVIDENCE_SCHEMA_VERSION,
      `${path}.schemaVersion`,
    ),
    sessionId: text(item.sessionId, `${path}.sessionId`),
    roundId: text(item.roundId, `${path}.roundId`),
    scope: validateSessionScope(item.scope, `${path}.scope`),
    entryPoint,
    startedAt,
    engagedAt,
    endedAt,
    terminal,
    round,
  };
}

function validateSessionEntryPoint(value: unknown, path: string): PracticeSessionEntryPoint {
  const entryPoint = text(value, path);
  return enumeration(value, ["standard", "quick-start-v1"], path);
}

function validateSessionScope(value: unknown, path: string): PracticeSessionEvidenceScope {
  const item = record(value, path);
  const kind = enumeration(
    item.kind,
    ["lesson", "review", "vocabulary", "course", "focused"],
    `${path}.kind`,
  );
  switch (kind) {
    case "lesson":
      exactKeys(item, ["kind", "courseId", "lessonId", "mode"], path);
      return {
        kind,
        courseId: text(item.courseId, `${path}.courseId`),
        lessonId: text(item.lessonId, `${path}.lessonId`),
        mode: enumeration(item.mode, ["learn", "replay"], `${path}.mode`),
      };
    case "review":
      exactKeys(item, ["kind", "courseId"], path, true);
      return {
        kind,
        ...(item.courseId === undefined
          ? {}
          : { courseId: text(item.courseId, `${path}.courseId`) }),
      };
    case "vocabulary":
      exactKeys(item, ["kind", "cardId", "courseId"], path, true);
      return {
        kind,
        ...(item.cardId === undefined
          ? {}
          : { cardId: text(item.cardId, `${path}.cardId`) }),
        ...(item.courseId === undefined
          ? {}
          : { courseId: text(item.courseId, `${path}.courseId`) }),
      };
    case "course":
      exactKeys(item, ["kind", "courseId"], path);
      return { kind, courseId: text(item.courseId, `${path}.courseId`) };
    case "focused":
      exactKeys(item, ["kind", "cardId"], path);
      return { kind, cardId: text(item.cardId, `${path}.cardId`) };
  }
}

function validateSessionTerminal(value: unknown, path: string): PracticeSessionTerminal {
  const item = record(value, path);
  exactKeys(item, ["kind", "reason"], path);
  const kind = enumeration(
    item.kind,
    ["completed", "dismissed", "abandoned", "invalidated"],
    `${path}.kind`,
  );
  switch (kind) {
    case "completed":
      return {
        kind,
        reason: enumeration(
          item.reason,
          ["scope-complete", "round-complete", "quick-start-complete"],
          `${path}.reason`,
        ),
      };
    case "dismissed":
      return {
        kind,
        reason: literal(item.reason, "quick-start-dismissed", `${path}.reason`),
      };
    case "abandoned":
      return {
        kind,
        reason: enumeration(
          item.reason,
          ["start-over", "replaced", "expired"],
          `${path}.reason`,
        ),
      };
    case "invalidated":
      return {
        kind,
        reason: enumeration(
          item.reason,
          ["stale", "unsupported", "corrupt", "catalog-mismatch"],
          `${path}.reason`,
        ),
      };
  }
}

function validatePracticeRoundSummary(value: unknown, path: string): PracticeRoundSummary {
  const item = record(value, path);
  exactKeys(item, [
    "initialOccurrenceIds",
    "scheduledOccurrenceIds",
    "attemptedOccurrenceIds",
    "completedOccurrenceIds",
    "skippedOccurrenceIds",
    "remainingOccurrenceIds",
    "dueReviewScheduledOccurrenceIds",
    "dueReviewCompletedOccurrenceIds",
    "introducedCardIds",
    "firstPassCardIds",
    "requeue",
  ], path);
  const result = {
    initialOccurrenceIds: identityArray(item.initialOccurrenceIds, `${path}.initialOccurrenceIds`),
    scheduledOccurrenceIds: identityArray(item.scheduledOccurrenceIds, `${path}.scheduledOccurrenceIds`),
    attemptedOccurrenceIds: identityArray(item.attemptedOccurrenceIds, `${path}.attemptedOccurrenceIds`),
    completedOccurrenceIds: identityArray(item.completedOccurrenceIds, `${path}.completedOccurrenceIds`),
    skippedOccurrenceIds: identityArray(item.skippedOccurrenceIds, `${path}.skippedOccurrenceIds`),
    remainingOccurrenceIds: identityArray(item.remainingOccurrenceIds, `${path}.remainingOccurrenceIds`),
    dueReviewScheduledOccurrenceIds: identityArray(
      item.dueReviewScheduledOccurrenceIds,
      `${path}.dueReviewScheduledOccurrenceIds`,
    ),
    dueReviewCompletedOccurrenceIds: identityArray(
      item.dueReviewCompletedOccurrenceIds,
      `${path}.dueReviewCompletedOccurrenceIds`,
    ),
    introducedCardIds: identityArray(item.introducedCardIds, `${path}.introducedCardIds`),
    firstPassCardIds: identityArray(item.firstPassCardIds, `${path}.firstPassCardIds`),
    requeue: validateRequeueSummary(item.requeue, `${path}.requeue`),
  } satisfies PracticeRoundSummary;
  assertSubset(result.initialOccurrenceIds, result.scheduledOccurrenceIds, `${path}.initialOccurrenceIds`);
  assertSubset(result.attemptedOccurrenceIds, result.scheduledOccurrenceIds, `${path}.attemptedOccurrenceIds`);
  assertSubset(result.completedOccurrenceIds, result.scheduledOccurrenceIds, `${path}.completedOccurrenceIds`);
  assertSubset(result.skippedOccurrenceIds, result.scheduledOccurrenceIds, `${path}.skippedOccurrenceIds`);
  assertSubset(result.remainingOccurrenceIds, result.scheduledOccurrenceIds, `${path}.remainingOccurrenceIds`);
  assertSubset(
    result.dueReviewScheduledOccurrenceIds,
    result.scheduledOccurrenceIds,
    `${path}.dueReviewScheduledOccurrenceIds`,
  );
  assertSubset(
    result.dueReviewCompletedOccurrenceIds,
    result.dueReviewScheduledOccurrenceIds,
    `${path}.dueReviewCompletedOccurrenceIds`,
  );
  assertSubset(
    result.dueReviewCompletedOccurrenceIds,
    result.completedOccurrenceIds,
    `${path}.dueReviewCompletedOccurrenceIds`,
  );
  assertSubset(
    result.dueReviewCompletedOccurrenceIds,
    result.attemptedOccurrenceIds,
    `${path}.dueReviewCompletedOccurrenceIds`,
  );
  assertSubset(
    result.requeue.insertedReturnOccurrenceIds,
    result.scheduledOccurrenceIds,
    `${path}.requeue.insertedReturnOccurrenceIds`,
  );
  const terminalPartitions = [
    result.completedOccurrenceIds,
    result.skippedOccurrenceIds,
    result.remainingOccurrenceIds,
  ];
  assertDisjoint(terminalPartitions, `${path}.completedOccurrenceIds`);
  const partition = new Set(terminalPartitions.flat());
  if (partition.size !== result.scheduledOccurrenceIds.length
    || result.scheduledOccurrenceIds.some((id) => !partition.has(id))) {
    throw pathError(path, "completed, skipped, and remaining IDs must partition scheduled IDs");
  }
  const initial = new Set(result.initialOccurrenceIds);
  if (result.requeue.insertedReturnOccurrenceIds.some((id) => initial.has(id))) {
    throw pathError(
      `${path}.requeue.insertedReturnOccurrenceIds`,
      "must not include an initial occurrence",
    );
  }
  return result;
}

function validateRequeueSummary(
  value: unknown,
  path: string,
): PracticeRoundSummary["requeue"] {
  const item = record(value, path);
  exactKeys(item, [
    "insertedReturnOccurrenceIds",
    "deferredNoRoomCardIds",
    "capReachedCardIds",
  ], path);
  return {
    insertedReturnOccurrenceIds: identityArray(
      item.insertedReturnOccurrenceIds,
      `${path}.insertedReturnOccurrenceIds`,
    ),
    deferredNoRoomCardIds: identityArray(
      item.deferredNoRoomCardIds,
      `${path}.deferredNoRoomCardIds`,
    ),
    capReachedCardIds: identityArray(item.capReachedCardIds, `${path}.capReachedCardIds`),
  };
}

function identityArray(value: unknown, path: string): string[] {
  const values = stringArray(value, path);
  unique(values, (item) => item, path, "value");
  return values;
}

function assertSubset(values: string[], superset: string[], path: string): void {
  const allowed = new Set(superset);
  values.forEach((value, index) => {
    if (!allowed.has(value)) throw pathError(`${path}[${index}]`, "is not in the required parent set");
  });
}

function assertDisjoint(groups: string[][], path: string): void {
  const seen = new Set<string>();
  groups.flat().forEach((value) => {
    if (seen.has(value)) throw pathError(path, `contains overlapping occurrence ${value}`);
    seen.add(value);
  });
}

function validateSentenceLearningState(value: unknown, index: number): SentenceLearningState {
  const path = `learning.sentenceLearningStates[${index}]`;
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

function validateReviewState(value: unknown, index: number): ReviewState {
  const path = `learning.reviewStates[${index}]`;
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

function validatePracticeLogEntry(
  value: unknown,
  index: number,
  allowContext: boolean,
): ContextualPracticeLogEntry {
  const path = `learning.practiceLog[${index}]`;
  const item = record(value, path);
  const kind = enumeration(item.kind, ["attempt", "signal"], `${path}.kind`);
  const base = {
    kind,
    id: text(item.id, `${path}.id`),
    turnId: text(item.turnId, `${path}.turnId`),
    cardId: text(item.cardId, `${path}.cardId`),
    phase: setEnumeration(item.phase, PHASES, `${path}.phase`),
    submittedAt: timestamp(item.submittedAt, `${path}.submittedAt`),
    ...(item.context === undefined
      ? {}
      : { context: validatePracticeLogContext(item.context, `${path}.context`) }),
  };
  const evidence = validateEvidence(item, path);
  if (kind === "attempt") {
    exactKeysWithOptional(
      item,
      ["kind", "id", "turnId", "cardId", "phase", "submittedAt", "submissionIndex", "answer", "outcome", "accuracy", "answerWasRevealed", "hadEdits", "audioPlayCount", "durationMs", "supportLevelUsed", "supportKindsUsed", "receivedCorrection"],
      allowContext ? ["context"] : [],
      path,
    );
    const submissionIndex = safeInteger(item.submissionIndex, `${path}.submissionIndex`, 0);
    const entry: PracticeAttemptLogEntry = {
      ...base,
      kind: "attempt",
      submissionIndex,
      answer: string(item.answer, `${path}.answer`),
      outcome: enumeration(item.outcome, ["perfect", "close", "retry"], `${path}.outcome`),
      accuracy: boundedNumber(item.accuracy, `${path}.accuracy`, 0, 1),
      ...evidence,
    };
    if (entry.id !== `turn-attempt:${entry.turnId}:${entry.submissionIndex}`) {
      throw pathError(`${path}.id`, `must equal turn-attempt:${entry.turnId}:${entry.submissionIndex}`);
    }
    if (entry.phase === "first-exposure") {
      throw pathError(`${path}.phase`, "First Exposure cannot contain an Attempt");
    }
    if (entry.submissionIndex === 0 && entry.receivedCorrection) {
      throw pathError(`${path}.receivedCorrection`, "cannot be true for the first submission");
    }
    return entry;
  }

  exactKeysWithOptional(
    item,
    ["kind", "id", "turnId", "cardId", "phase", "submittedAt", "updatedAt", "signalKinds", "reviewFailureRecorded", "answer", "accuracy", "answerWasRevealed", "hadEdits", "audioPlayCount", "durationMs", "supportLevelUsed", "supportKindsUsed", "receivedCorrection"],
    allowContext ? ["context"] : [],
    path,
  );
  const signalKinds = array(item.signalKinds, `${path}.signalKinds`).map((signal, signalIndex) => setEnumeration(signal, SIGNAL_KINDS, `${path}.signalKinds[${signalIndex}]`));
  unique(signalKinds, (signal) => signal, `${path}.signalKinds`, "value");
  if (signalKinds.length === 0) {
    throw pathError(`${path}.signalKinds`, "must contain at least one signal");
  }
  const entry: PracticeSignalLogEntry = {
    ...base,
    kind: "signal",
    updatedAt: timestamp(item.updatedAt, `${path}.updatedAt`),
    signalKinds,
    reviewFailureRecorded: boolean(item.reviewFailureRecorded, `${path}.reviewFailureRecorded`),
    answer: literal(item.answer, "", `${path}.answer`),
    accuracy: literal(item.accuracy, 0, `${path}.accuracy`),
    ...evidence,
  };
  if (entry.id !== `turn-signal:${entry.turnId}`) {
    throw pathError(`${path}.id`, `must equal turn-signal:${entry.turnId}`);
  }
  if (Date.parse(entry.updatedAt) < Date.parse(entry.submittedAt)) {
    throw pathError(`${path}.updatedAt`, "must not be earlier than submittedAt");
  }
  if (entry.signalKinds.includes("revealed") && !entry.supportKindsUsed.includes("answer")) {
    throw pathError(`${path}.supportKindsUsed`, "must include answer when signalKinds includes revealed");
  }
  if (entry.signalKinds.includes("support-used") && entry.supportKindsUsed.length === 0) {
    throw pathError(`${path}.supportKindsUsed`, "must include support for support-used");
  }
  if (entry.phase === "voluntary-practice" && entry.reviewFailureRecorded) {
    throw pathError(`${path}.reviewFailureRecorded`, "must remain false in voluntary-practice");
  }
  return entry;
}

function validatePracticeLogContext(value: unknown, path: string): PracticeLogContext {
  const item = record(value, path);
  exactKeys(item, [
    "sessionId",
    "roundId",
    "occurrenceId",
    "queueReason",
    "scheduledReviewDueAt",
  ], path, true);
  for (const required of ["sessionId", "roundId", "occurrenceId", "queueReason"]) {
    if (!(required in item)) throw pathError(`${path}.${required}`, "is required");
  }
  return {
    sessionId: text(item.sessionId, `${path}.sessionId`),
    roundId: text(item.roundId, `${path}.roundId`),
    occurrenceId: text(item.occurrenceId, `${path}.occurrenceId`),
    queueReason: enumeration(
      item.queueReason,
      ["new-learning", "due-review", "focused-practice", "voluntary-practice"],
      `${path}.queueReason`,
    ),
    ...(item.scheduledReviewDueAt === undefined
      ? {}
      : {
          scheduledReviewDueAt: timestamp(
            item.scheduledReviewDueAt,
            `${path}.scheduledReviewDueAt`,
          ),
        }),
  };
}

function validateEvidence(item: Record<string, unknown>, path: string): PersistedAttemptEvidence {
  const supportLevelUsed = enumeration(item.supportLevelUsed, [0, 1, 2, 3, 4], `${path}.supportLevelUsed`);
  const supportKindsUsed = array(item.supportKindsUsed, `${path}.supportKindsUsed`).map((kind, index) => setEnumeration(kind, SUPPORT_KINDS, `${path}.supportKindsUsed[${index}]`));
  unique(supportKindsUsed, (kind) => kind, `${path}.supportKindsUsed`, "value");
  const answerWasRevealed = boolean(item.answerWasRevealed, `${path}.answerWasRevealed`);
  if (answerWasRevealed !== supportKindsUsed.includes("answer")) {
    throw pathError(`${path}.answerWasRevealed`, "must equal supportKindsUsed.includes(answer)");
  }
  const requiredLevel = supportKindsUsed.reduce<RecallSupportLevel>((highest, kind) => Math.max(highest, supportLevelForKind(kind)) as RecallSupportLevel, 0);
  if (supportLevelUsed < requiredLevel) {
    throw pathError(`${path}.supportLevelUsed`, `must be at least ${requiredLevel} for its support kinds`);
  }
  const receivedCorrection = boolean(item.receivedCorrection, `${path}.receivedCorrection`);
  if (receivedCorrection !== supportKindsUsed.includes("correction")) {
    throw pathError(`${path}.receivedCorrection`, "must equal supportKindsUsed.includes(correction)");
  }
  const phase = item.phase;
  if ((phase === "independent-recall" || phase === "review-recall") && (supportLevelUsed > 0 || supportKindsUsed.some((kind) => TARGET_BEARING_SUPPORT.has(kind)))) {
    throw pathError(`${path}.phase`, "Independent and Review recall cannot retain target-bearing support");
  }
  if (phase === "corrective-practice" && !receivedCorrection) {
    throw pathError(`${path}.receivedCorrection`, "must be true in corrective-practice");
  }
  return {
    answerWasRevealed,
    hadEdits: boolean(item.hadEdits, `${path}.hadEdits`),
    audioPlayCount: safeInteger(item.audioPlayCount, `${path}.audioPlayCount`, 0),
    durationMs: boundedNumber(item.durationMs, `${path}.durationMs`, 0, Number.MAX_SAFE_INTEGER),
    supportLevelUsed,
    supportKindsUsed,
    receivedCorrection,
  };
}

function validateVocabularyEntry(value: unknown, index: number): VocabularyEntry {
  const path = `learning.vocabularyEntries[${index}]`;
  const item = record(value, path);
  exactKeys(item, ["cardId", "savedAt"], path);
  return { cardId: text(item.cardId, `${path}.cardId`), savedAt: timestamp(item.savedAt, `${path}.savedAt`) };
}

function validatePreferences(value: unknown): AppPreferences {
  const path = "preferences";
  const item = record(value, path);
  exactKeysWithOptional(
    item,
    ["id", "theme", "speechVoiceUri", "keySoundMuted", "quickStart"],
    ["fingerGuideMode"],
    path,
  );
  const quickStart = item.quickStart === null ? null : validateQuickStart(item.quickStart, `${path}.quickStart`);
  return {
    id: literal(item.id, "device", `${path}.id`),
    theme: setEnumeration(item.theme, THEMES, `${path}.theme`),
    speechVoiceUri: item.speechVoiceUri === null ? null : text(item.speechVoiceUri, `${path}.speechVoiceUri`),
    keySoundMuted: boolean(item.keySoundMuted, `${path}.keySoundMuted`),
    fingerGuideMode: item.fingerGuideMode === undefined
      ? DEFAULT_FINGER_GUIDE_MODE
      : setEnumeration(item.fingerGuideMode, FINGER_GUIDE_MODES, `${path}.fingerGuideMode`),
    quickStart,
  };
}

function validateQuickStart(value: unknown, path: string): NonNullable<AppPreferences["quickStart"]> {
  const item = record(value, path);
  exactKeys(item, ["version", "status"], path);
  return {
    version: literal(item.version, 1, `${path}.version`),
    status: setEnumeration(item.status, QUICK_START_STATUSES, `${path}.status`),
  };
}

function validateCatalogReferences(categories: CourseCategory[], paths: LearningPath[], courses: Course[], cards: SentenceCard[]): void {
  const categoryIds = new Set(categories.map((item) => item.id));
  const courseIds = new Set(courses.map((item) => item.id));
  const cardIds = new Set(cards.map((item) => item.id));
  paths.forEach((path, pathIndex) => path.courseIds.forEach((courseId, index) => {
    if (!courseIds.has(courseId)) throw pathError(`catalog.learningPaths[${pathIndex}].courseIds[${index}]`, "references a missing Course");
  }));
  const unitIds = new Map<string, string>();
  const lessonIds = new Map<string, string>();
  courses.forEach((course, courseIndex) => {
    if (!categoryIds.has(course.categoryId)) throw pathError(`catalog.courses[${courseIndex}].categoryId`, "references a missing CourseCategory");
    course.units.forEach((unit, unitIndex) => {
      const unitPath = `catalog.courses[${courseIndex}].units[${unitIndex}].id`;
      if (unitIds.has(unit.id)) throw pathError(unitPath, `duplicates ${unitIds.get(unit.id)}`);
      unitIds.set(unit.id, unitPath);
      unit.lessons.forEach((lesson, lessonIndex) => {
        const lessonPath = `catalog.courses[${courseIndex}].units[${unitIndex}].lessons[${lessonIndex}]`;
        if (lessonIds.has(lesson.id)) throw pathError(`${lessonPath}.id`, `duplicates ${lessonIds.get(lesson.id)}`);
        lessonIds.set(lesson.id, `${lessonPath}.id`);
        if (lesson.cardIds.length === 0) throw pathError(`${lessonPath}.cardIds`, "must contain at least one Card");
        unique(lesson.cardIds, (id) => id, `${lessonPath}.cardIds`, "value");
        lesson.cardIds.forEach((cardId, index) => {
          if (!cardIds.has(cardId)) throw pathError(`${lessonPath}.cardIds[${index}]`, "references a missing Card");
        });
      });
    });
  });
}

function validateRestorableCatalog(courses: Course[]): void {
  const cefr = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
  courses.forEach((course, courseIndex) => {
    const path = `catalog.courses[${courseIndex}]`;
    if (cefr.indexOf(course.level.cefrFrom) > cefr.indexOf(course.level.cefrTo)) {
      throw pathError(`${path}.level`, "must run from a lower to a higher CEFR level");
    }
    const tags = new Set<string>();
    course.tags.forEach((tag, index) => {
      if (tag !== tag.trim()) throw pathError(`${path}.tags[${index}]`, "must be trimmed");
      const normalized = tag.toLocaleLowerCase();
      if (tags.has(normalized)) {
        throw pathError(`${path}.tags[${index}]`, "duplicates an earlier tag");
      }
      tags.add(normalized);
    });
    const cardIds = new Map<string, string>();
    course.units.forEach((unit, unitIndex) => {
      unit.lessons.forEach((lesson, lessonIndex) => {
        lesson.cardIds.forEach((cardId, cardIndex) => {
          const cardPath = `${path}.units[${unitIndex}].lessons[${lessonIndex}].cardIds[${cardIndex}]`;
          const previous = cardIds.get(cardId);
          if (previous) throw pathError(cardPath, `duplicates ${previous} in this Course`);
          cardIds.set(cardId, cardPath);
        });
      });
    });
  });
}

function validateLearningReferences(cards: SentenceCard[], states: SentenceLearningState[], reviews: ReviewState[], logs: PracticeLogEntry[], vocabulary: VocabularyEntry[]): void {
  const cardIds = new Set(cards.map((item) => item.id));
  const collections: Array<[Array<{ cardId: string }>, string]> = [
    [states, "learning.sentenceLearningStates"],
    [reviews, "learning.reviewStates"],
    [logs, "learning.practiceLog"],
    [vocabulary, "learning.vocabularyEntries"],
  ];
  collections.forEach(([items, path]) => items.forEach((item, index) => {
    if (!cardIds.has(item.cardId)) throw pathError(`${path}[${index}].cardId`, "references a missing Card");
  }));
}

function validateGuidedInvariants(states: SentenceLearningState[], reviews: ReviewState[], logs: PracticeLogEntry[]): void {
  const stateByCard = new Map(states.map((state) => [state.cardId, state]));
  const reviewByCard = new Map(reviews.map((review) => [review.cardId, review]));
  reviews.forEach((review, index) => {
    const path = `learning.reviewStates[${index}]`;
    const state = stateByCard.get(review.cardId);
    const passed = Boolean(state?.firstPassedAt);
    if (review.learningStatus === "mastered" && review.stage !== 6) {
      throw pathError(`${path}.stage`, "must be 6 when learningStatus is mastered");
    }
    if (review.learningStatus === "mastered" && !passed) {
      throw pathError(`${path}.learningStatus`, "mastered requires a First Pass");
    }
    if (!passed && review.stage !== 0) {
      throw pathError(`${path}.stage`, "must remain 0 before First Pass");
    }
    if (!passed && (review.streak !== 0 || review.lapseCount !== 0)) {
      throw pathError(path, "acquisition review cannot have a streak or lapse");
    }
  });
  states.forEach((state, index) => {
    if (state.firstPassedAt && !reviewByCard.has(state.cardId)) {
      throw pathError(`learning.sentenceLearningStates[${index}].cardId`, "First Pass requires a ReviewState");
    }
  });
  const turnCards = new Map<string, string>();
  logs.forEach((entry, index) => {
    const path = `learning.practiceLog[${index}]`;
    const priorCard = turnCards.get(entry.turnId);
    if (priorCard !== undefined && priorCard !== entry.cardId) {
      throw pathError(`${path}.cardId`, `turnId ${entry.turnId} already belongs to Card ${priorCard}`);
    }
    turnCards.set(entry.turnId, entry.cardId);
    if (entry.phase !== "legacy" && !stateByCard.get(entry.cardId)?.introducedAt) {
      throw pathError(`${path}.phase`, "durable Guided-era logs require an introduced SentenceLearningState");
    }
    if (entry.kind === "attempt" && entry.phase !== "voluntary-practice" && entry.phase !== "legacy" && entry.submissionIndex === 0 && entry.outcome === "perfect" && entry.supportLevelUsed === 0 && (entry.phase === "independent-recall" || entry.phase === "review-recall") && !stateByCard.get(entry.cardId)?.firstPassedAt) {
      throw pathError(`${path}.outcome`, "perfect Independent or Review recall requires a First Pass");
    }
  });
}

function supportLevelForKind(kind: RecallSupportKind): RecallSupportLevel {
  switch (kind) {
    case "pattern": case "grammar": return 1;
    case "keywords": return 2;
    case "frame": case "pronunciation": case "audio": return 3;
    case "copy-target": case "answer": return 4;
    case "correction": return 0;
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw pathError(path, "must be an object");
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw pathError(path, "must be an array");
  return value;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string") throw pathError(path, "must be a string");
  return value;
}
function text(value: unknown, path: string): string {
  const result = string(value, path);
  if (!result.trim()) throw pathError(path, "must be non-empty text");
  return result;
}
function trimmedText(value: unknown, path: string): string {
  const result = text(value, path);
  if (result !== result.trim()) throw pathError(path, "must be trimmed text");
  return result;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw pathError(path, "must be a boolean");
  return value;
}
function boundedNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw pathError(path, `must be a finite number from ${min} to ${max}`);
  return value;
}
function safeInteger(value: unknown, path: string, min: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) throw pathError(path, `must be a safe integer of at least ${min}`);
  return value;
}
function timestamp(value: unknown, path: string): string {
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
function stringArray(value: unknown, path: string, allowEmptyText = false): string[] {
  return array(value, path).map((item, index) => allowEmptyText ? string(item, `${path}[${index}]`) : text(item, `${path}[${index}]`));
}
function literal<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw pathError(path, `must equal ${JSON.stringify(expected)}`);
  return expected;
}
function enumeration<const T extends readonly (string | number)[]>(value: unknown, values: T, path: string): T[number] {
  if (!(values as readonly unknown[]).includes(value)) throw pathError(path, `must be one of ${values.join(", ")}`);
  return value as T[number];
}
function setEnumeration<T extends string>(value: unknown, values: Set<T>, path: string): T {
  if (typeof value !== "string" || !values.has(value as T)) throw pathError(path, `has an unknown value ${JSON.stringify(value)}`);
  return value as T;
}
function unique<T>(items: T[], getId: (item: T) => string, path: string, field: string): void {
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const id = getId(item);
    const first = seen.get(id);
    if (first !== undefined) throw pathError(`${path}[${index}].${field}`, `duplicates ${path}[${first}].${field}`);
    seen.set(id, index);
  });
}
function exactKeys(value: Record<string, unknown>, allowed: string[], path: string, optionalAllowed = false): void {
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
function exactKeysWithOptional(
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
function pathError(path: string, message: string): Error {
  return new Error(`${path} ${message}`);
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
