import {
  array, boolean, boundedNumber, enumeration, exactKeys, exactKeysWithOptional,
  literal, pathError, record, safeInteger, string, stringArray, text, timestamp, unique,
  validateReviewStateRecord, validateSentenceCardRecord, validateSentenceLearningStateRecord,
} from "../backup/validateLearningRecords";
import { validateSentenceLearningSupport } from "../content/validateSentenceLearningSupport";
import { normalizeAnswer } from "../practice/evaluateAttempt";
import { buildStudioAnswerKeyLookup, studioAnswerKeys } from "./studioExposure";
import type {
  FluencyResult, LearningStudioDocument, PersonalSentence, StudioAttempt, StudioCheckpoint, StudioSignal,
} from "./LearningStudio";

export type PortableLearningStudio = Omit<LearningStudioDocument, "checkpoint">;

const ACTIVITIES = ["context", "family", "mission", "personal", "weakness"] as const;
const DOCUMENT_KEYS = ["id", "schemaVersion", "revision", "personalSentences", "attempts", "signals", "fluencyResults", "closedSessionIds"];
const historicalAnswerKeys = buildStudioAnswerKeyLookup([]);

export function validateLearningStudio(value: unknown, path = "Learning Studio"): LearningStudioDocument {
  const document = record(value, path);
  exactKeys(document, [...DOCUMENT_KEYS, "checkpoint"], path);
  const personalSentences = array(document.personalSentences, `${path}.personalSentences`)
    .map((entry, index) => validatePersonalSentence(entry, `${path}.personalSentences[${index}]`));
  const attempts = array(document.attempts, `${path}.attempts`)
    .map((entry, index) => validateStudioAttempt(entry, `${path}.attempts[${index}]`));
  const fluencyResults = array(document.fluencyResults, `${path}.fluencyResults`)
    .map((entry, index) => validateFluencyResult(entry, `${path}.fluencyResults[${index}]`));
  const signals = array(document.signals, `${path}.signals`).map((entry, index) => {
    const signalPath = `${path}.signals[${index}]`;
    const signal = record(entry, signalPath);
    exactKeysWithOptional(signal, ["id", "sessionId", "activity", "exerciseId", "kind", "at"], ["answerKeys"], signalPath);
    return {
      id: text(signal.id, `${signalPath}.id`), sessionId: text(signal.sessionId, `${signalPath}.sessionId`),
      activity: enumeration(signal.activity, ACTIVITIES, `${signalPath}.activity`),
      exerciseId: text(signal.exerciseId, `${signalPath}.exerciseId`),
      kind: enumeration(signal.kind, ["revealed", "skipped"], `${signalPath}.kind`),
      at: timestamp(signal.at, `${signalPath}.at`),
      ...(signal.answerKeys === undefined ? {} : { answerKeys: validateAnswerKeys(signal.answerKeys, `${signalPath}.answerKeys`) }),
    } satisfies StudioSignal;
  });
  const closedSessionIds = stringArray(document.closedSessionIds, `${path}.closedSessionIds`);
  unique(personalSentences, (entry) => entry.id, `${path}.personalSentences`, "id");
  unique(attempts, (entry) => entry.id, `${path}.attempts`, "id");
  unique(fluencyResults, (entry) => entry.id, `${path}.fluencyResults`, "id");
  unique(signals, (entry) => entry.id, `${path}.signals`, "id");
  unique(closedSessionIds, (id) => id, `${path}.closedSessionIds`, "value");
  const firstEncounters = attempts.filter((attempt) => attempt.firstEncounter);
  unique(firstEncounters, (attempt) => `${attempt.activity}:${attempt.exerciseId}`, `${path}.firstEncounters`, "exerciseId");
  const knownAnswers = new Map(historicalAnswerKeys);
  for (const sentence of personalSentences) knownAnswers.set(sentence.id,
    studioAnswerKeys({ target: sentence.card.english, acceptableAnswers: sentence.card.acceptableAnswers }));
  const encounteredAnswers = new Set<string>();
  for (const attempt of attempts) {
    const keys = attempt.answerKeys ?? knownAnswers.get(attempt.exerciseId) ?? [];
    if (attempt.answerKeys && attempt.firstEncounter && attempt.activity !== "context"
      && keys.some((key) => encounteredAnswers.has(key))) {
      throw pathError(`${path}.firstEncounters`, "cannot relabel an already practised expression as new");
    }
    for (const key of keys) encounteredAnswers.add(key);
  }
  const checkpoint = document.checkpoint === null ? null
    : validateStudioCheckpoint(document.checkpoint, `${path}.checkpoint`);
  if (checkpoint && closedSessionIds.includes(checkpoint.sessionId)) {
    throw pathError(`${path}.checkpoint.sessionId`, "belongs to a closed session");
  }
  return {
    id: literal(document.id, "local", `${path}.id`),
    schemaVersion: literal(document.schemaVersion, 1, `${path}.schemaVersion`),
    revision: safeInteger(document.revision, `${path}.revision`, 0),
    personalSentences, attempts, signals, fluencyResults, closedSessionIds, checkpoint,
  };
}

export function validatePortableLearningStudio(value: unknown, path = "learning.studio"): PortableLearningStudio {
  const document = record(value, path);
  exactKeys(document, DOCUMENT_KEYS, path);
  const { checkpoint: _checkpoint, ...portable } = validateLearningStudio({ ...document, checkpoint: null }, path);
  return portable;
}

export function portableLearningStudio(document: LearningStudioDocument): PortableLearningStudio {
  const { checkpoint: _checkpoint, ...portable } = validateLearningStudio(document);
  return portable;
}

function validatePersonalSentence(value: unknown, path: string): PersonalSentence {
  const entry = record(value, path);
  exactKeys(entry, ["id", "card", "learningState", "reviewState"], path);
  const id = text(entry.id, `${path}.id`);
  const card = validateSentenceCardRecord(entry.card, `${path}.card`);
  const learningState = validateSentenceLearningStateRecord(entry.learningState, `${path}.learningState`);
  const reviewState = validateReviewStateRecord(entry.reviewState, `${path}.reviewState`);
  if (!id.startsWith("personal-")) {
    throw pathError(`${path}.id`, "must use the reserved personal- namespace");
  }
  if (id !== id.trim() || id.length > 150 || card.english.length > 500
    || card.prompt.length > 1_000 || card.source.length > 1_000
    || !/[a-z]/i.test(card.english) || normalizeAnswer(card.english).split(" ").length < 2) {
    throw pathError(path, "must contain a bounded, complete personal English expression and scenario");
  }
  if ([card.id, learningState.cardId, reviewState.cardId].some((cardId) => cardId !== id)) {
    throw pathError(path, "must use the same personal SentenceCard ID throughout");
  }
  if (!learningState.introducedAt) {
    throw pathError(`${path}.learningState.introducedAt`, "is required for a personal sentence");
  }
  if (!learningState.firstPassedAt && (reviewState.stage > 0 || reviewState.learningStatus === "mastered")) {
    throw pathError(`${path}.reviewState`, "cannot advance before an Independent First Pass");
  }
  if (!learningState.firstPassedAt && (reviewState.streak !== 0 || reviewState.lapseCount !== 0)) {
    throw pathError(`${path}.reviewState`, "acquisition review cannot have a streak or lapse");
  }
  if (reviewState.learningStatus === "mastered" && reviewState.stage !== 6) {
    throw pathError(`${path}.reviewState.stage`, "must be 6 for a mastered personal sentence");
  }
  validateSentenceLearningSupport(card);
  return { id, card, learningState, reviewState };
}

function validateStudioAttempt(value: unknown, path: string): StudioAttempt {
  const entry = record(value, path);
  exactKeysWithOptional(entry, ["id", "sessionId", "activity", "groupId", "exerciseId", "stage", "outcome", "accuracy", "submittedAt", "durationMs", "answerWasRevealed", "firstSubmission", "firstEncounter"], ["sourceCardId", "answerKeys"], path);
  const attempt: StudioAttempt = {
    id: text(entry.id, `${path}.id`), sessionId: text(entry.sessionId, `${path}.sessionId`),
    activity: enumeration(entry.activity, ACTIVITIES, `${path}.activity`),
    groupId: text(entry.groupId, `${path}.groupId`), exerciseId: text(entry.exerciseId, `${path}.exerciseId`),
    ...(entry.sourceCardId === undefined ? {} : { sourceCardId: text(entry.sourceCardId, `${path}.sourceCardId`) }),
    stage: enumeration(entry.stage, ["training", "held-out"], `${path}.stage`),
    outcome: enumeration(entry.outcome, ["perfect", "close", "retry"], `${path}.outcome`),
    accuracy: boundedNumber(entry.accuracy, `${path}.accuracy`, 0, 1),
    submittedAt: timestamp(entry.submittedAt, `${path}.submittedAt`),
    durationMs: boundedNumber(entry.durationMs, `${path}.durationMs`, 0, Number.MAX_SAFE_INTEGER),
    answerWasRevealed: boolean(entry.answerWasRevealed, `${path}.answerWasRevealed`),
    firstSubmission: boolean(entry.firstSubmission, `${path}.firstSubmission`),
    firstEncounter: boolean(entry.firstEncounter, `${path}.firstEncounter`),
    ...(entry.answerKeys === undefined ? {} : { answerKeys: validateAnswerKeys(entry.answerKeys, `${path}.answerKeys`) }),
  };
  if (attempt.outcome === "perfect" && attempt.accuracy !== 1) {
    throw pathError(`${path}.accuracy`, "must equal 1 for a perfect result");
  }
  if (attempt.firstEncounter && !attempt.firstSubmission) {
    throw pathError(`${path}.firstEncounter`, "requires a first submission");
  }
  return attempt;
}

function validateAnswerKeys(value: unknown, path: string): string[] {
  const keys = stringArray(value, path);
  if (!keys.length || keys.some((key) => !/^answer-v1-[0-9a-f]{16}$/.test(key))) {
    throw pathError(path, "must contain versioned expression identities");
  }
  unique(keys, (key) => key, path, "value");
  return keys;
}

function validateFluencyResult(value: unknown, path: string): FluencyResult {
  const entry = record(value, path);
  exactKeys(entry, ["id", "sourceCardId", "source", "startedAt", "completedAt", "activeDurationMs", "committedCharacters", "correctCharacters", "uncorrectedErrors", "backspaces", "pauseCount", "longestPauseMs", "netWpm", "characterAccuracy", "physicalKeys"], path);
  const result: FluencyResult = {
    id: text(entry.id, `${path}.id`), sourceCardId: text(entry.sourceCardId, `${path}.sourceCardId`),
    source: enumeration(entry.source, ["correct", "corrected", "revealed", "learned"], `${path}.source`),
    startedAt: timestamp(entry.startedAt, `${path}.startedAt`),
    completedAt: timestamp(entry.completedAt, `${path}.completedAt`),
    activeDurationMs: boundedNumber(entry.activeDurationMs, `${path}.activeDurationMs`, 1, Number.MAX_SAFE_INTEGER),
    committedCharacters: safeInteger(entry.committedCharacters, `${path}.committedCharacters`, 1),
    correctCharacters: safeInteger(entry.correctCharacters, `${path}.correctCharacters`, 0),
    uncorrectedErrors: safeInteger(entry.uncorrectedErrors, `${path}.uncorrectedErrors`, 0),
    backspaces: safeInteger(entry.backspaces, `${path}.backspaces`, 0),
    pauseCount: safeInteger(entry.pauseCount, `${path}.pauseCount`, 0),
    longestPauseMs: boundedNumber(entry.longestPauseMs, `${path}.longestPauseMs`, 0, Number.MAX_SAFE_INTEGER),
    netWpm: boundedNumber(entry.netWpm, `${path}.netWpm`, 0, Number.MAX_SAFE_INTEGER),
    characterAccuracy: boundedNumber(entry.characterAccuracy, `${path}.characterAccuracy`, 0, 1),
    physicalKeys: array(entry.physicalKeys, `${path}.physicalKeys`).map((value, index) => {
      const keyPath = `${path}.physicalKeys[${index}]`;
      const key = record(value, keyPath);
      exactKeys(key, ["code", "presses", "mismatches"], keyPath);
      const code = text(key.code, `${keyPath}.code`);
      if (!/^(Key[A-Z]|Digit[0-9]|Space|Quote|Comma|Period|Semicolon|Slash|Minus|Equal|BracketLeft|BracketRight|Backslash)$/.test(code)) {
        throw pathError(`${keyPath}.code`, "is not a supported physical-key aggregate");
      }
      const presses = safeInteger(key.presses, `${keyPath}.presses`, 1);
      const mismatches = safeInteger(key.mismatches, `${keyPath}.mismatches`, 0);
      if (mismatches > presses) throw pathError(`${keyPath}.mismatches`, "cannot exceed presses");
      return { code, presses, mismatches };
    }),
  };
  const wallDuration = Date.parse(result.completedAt) - Date.parse(result.startedAt);
  if (wallDuration < 0 || result.activeDurationMs > wallDuration + 1) {
    throw pathError(`${path}.activeDurationMs`, "must fit within the pass's wall-clock interval");
  }
  if (result.correctCharacters > result.committedCharacters) {
    throw pathError(`${path}.correctCharacters`, "cannot exceed committedCharacters");
  }
  if (result.physicalKeys.reduce((sum, key) => sum + key.presses, 0) > result.committedCharacters) {
    throw pathError(`${path}.physicalKeys`, "cannot count more presses than committed characters");
  }
  unique(result.physicalKeys, (key) => key.code, `${path}.physicalKeys`, "code");
  return result;
}

export function validateStudioCheckpoint(value: unknown, path = "Studio checkpoint"): StudioCheckpoint {
  const entry = record(value, path);
  exactKeysWithOptional(entry, ["revision", "sessionId", "activity", "groupId", "exerciseIds", "index", "phase", "draft", "answerWasRevealed", "submissionCount", "updatedAt"], ["selectionStart", "selectionEnd"], path);
  const exerciseIds = stringArray(entry.exerciseIds, `${path}.exerciseIds`);
  unique(exerciseIds, (id) => id, `${path}.exerciseIds`, "value");
  const index = safeInteger(entry.index, `${path}.index`, 0);
  if (index >= exerciseIds.length) throw pathError(`${path}.index`, "must refer to a scheduled exercise");
  const draft = string(entry.draft, `${path}.draft`);
  if (draft.length > 10_000) throw pathError(`${path}.draft`, "is too long");
  const selectionStart = entry.selectionStart === undefined ? undefined : safeInteger(entry.selectionStart, `${path}.selectionStart`, 0);
  const selectionEnd = entry.selectionEnd === undefined ? undefined : safeInteger(entry.selectionEnd, `${path}.selectionEnd`, 0);
  if ((selectionStart ?? 0) > (selectionEnd ?? draft.length)
    || (selectionStart ?? 0) > draft.length || (selectionEnd ?? 0) > draft.length) {
    throw pathError(path, "must keep the caret selection inside its saved draft");
  }
  const checkpoint: StudioCheckpoint = {
    revision: safeInteger(entry.revision, `${path}.revision`, 0),
    sessionId: text(entry.sessionId, `${path}.sessionId`),
    activity: enumeration(entry.activity, ACTIVITIES, `${path}.activity`),
    groupId: text(entry.groupId, `${path}.groupId`), exerciseIds, index,
    phase: enumeration(entry.phase, ["instruction", "recall", "result"], `${path}.phase`),
    draft, answerWasRevealed: boolean(entry.answerWasRevealed, `${path}.answerWasRevealed`),
    ...(selectionStart === undefined ? {} : { selectionStart }),
    ...(selectionEnd === undefined ? {} : { selectionEnd }),
    submissionCount: safeInteger(entry.submissionCount, `${path}.submissionCount`, 0),
    updatedAt: timestamp(entry.updatedAt, `${path}.updatedAt`),
  };
  if (checkpoint.phase === "result" && checkpoint.submissionCount === 0) {
    throw pathError(`${path}.submissionCount`, "must include a submitted result");
  }
  return checkpoint;
}
