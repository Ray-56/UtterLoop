import type {
  PracticePhase,
  RecallSupportKind,
  RecallSupportLevel,
} from "../../domain/practice/PracticeTurn";
import { catalogFingerprint } from "./catalogFingerprint";
import type {
  DurableAttemptEvidence,
  DurablePracticeEvidence,
  PracticeSessionCatalog,
  PracticeSessionCheckpoint,
  PracticeSessionScope,
  PracticeTurnCheckpoint,
  ResolvedPracticeOccurrence,
} from "./model";
import { practiceOccurrenceId } from "./occurrence";
import { practiceScopeKey } from "./practiceScopeKey";

const CHECKPOINT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const MINIMUM_SUPPORT_LEVEL: Record<RecallSupportKind, RecallSupportLevel> = {
  pattern: 1,
  keywords: 2,
  frame: 3,
  pronunciation: 3,
  audio: 3,
  grammar: 1,
  "copy-target": 4,
  answer: 4,
  correction: 0,
};

export type CheckpointDiscardReason =
  | "unsupported-schema"
  | "invalid-checkpoint"
  | "scope-mismatch"
  | "scope-reference-missing"
  | "catalog-changed"
  | "unknown-occurrence"
  | "card-removed"
  | "card-mastered"
  | "stale"
  | "submission-conflict";

export type ValidatePracticeSessionCheckpointResult =
  | { ok: true; checkpoint: PracticeSessionCheckpoint }
  | { ok: false; reason: "unsupported-schema" | "invalid-checkpoint"; detail: string };

export interface ResolvePracticeSessionCheckpointInput {
  checkpoint: unknown;
  expectedScope: PracticeSessionScope;
  catalog: PracticeSessionCatalog;
  masteredCardIds: readonly string[];
  durableEvidence: readonly DurablePracticeEvidence[];
  now: Date;
}

export type ResolvePracticeSessionCheckpointResult =
  | {
      status: "resume";
      checkpoint: PracticeSessionCheckpoint;
      recoveredCommand: { kind: "submission"; evidenceId: string } | null;
    }
  | {
      status: "discard";
      reason: CheckpointDiscardReason;
      message: string;
    };

export function validatePracticeSessionCheckpoint(value: unknown): ValidatePracticeSessionCheckpointResult {
  if (!isRecord(value)) return invalid("Checkpoint must be an object.");
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    return { ok: false, reason: "unsupported-schema", detail: "Checkpoint schema version is not supported." };
  }

  try {
    const schemaVersion = value.schemaVersion;
    exactKeys(value, [
      "id",
      "schemaVersion",
      "scope",
      "scopeKey",
      "catalogFingerprint",
      "itinerary",
      "currentOccurrenceId",
      "draft",
      "selectionStart",
      "selectionEnd",
      "turn",
      "elapsedSeconds",
      "itemElapsedSeconds",
      "stats",
      "updatedAt",
      ...(schemaVersion === 2
        ? ["sessionId", "roundId", "entryPoint", "startedAt", "engagedAt", "revision", "round"]
        : ["commandRecovery"]),
    ], "checkpoint");
    const scope = parseScope(value.scope);
    const itinerary = array(value.itinerary, "itinerary").map(
      (item, index) => parseOccurrence(item, `itinerary[${index}]`, schemaVersion),
    );
    if (itinerary.length === 0) throw new Error("itinerary must contain at least one occurrence.");
    assertUnique(itinerary.map((occurrence) => occurrence.id), "itinerary occurrence ID");
    const draft = string(value.draft, "draft", true);
    const selectionStart = safeInteger(value.selectionStart, "selectionStart");
    const selectionEnd = safeInteger(value.selectionEnd, "selectionEnd");
    if (selectionStart > selectionEnd || selectionEnd > draft.length) {
      throw new Error("selection must be ordered and within the learner draft.");
    }
    const currentOccurrenceId = string(value.currentOccurrenceId, "currentOccurrenceId");
    const turn = parseTurn(value.turn, "turn");
    const stats = parseStats(value.stats, schemaVersion);
    const base = {
      id: literal(value.id, "active", "id"),
      scope,
      scopeKey: string(value.scopeKey, "scopeKey"),
      catalogFingerprint: string(value.catalogFingerprint, "catalogFingerprint"),
      itinerary,
      currentOccurrenceId,
      draft,
      selectionStart,
      selectionEnd,
      turn,
      elapsedSeconds: finiteNonNegative(value.elapsedSeconds, "elapsedSeconds"),
      itemElapsedSeconds: finiteNonNegative(value.itemElapsedSeconds, "itemElapsedSeconds"),
      stats,
      updatedAt: timestamp(value.updatedAt, "updatedAt"),
    };
    const checkpoint: PracticeSessionCheckpoint = schemaVersion === 1
      ? { ...base, schemaVersion }
      : parseRevisionedCheckpoint(value, base, itinerary);
    return { ok: true, checkpoint };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error));
  }
}

function parseRevisionedCheckpoint(
  value: Record<string, unknown>,
  base: Omit<Extract<PracticeSessionCheckpoint, { schemaVersion: 1 }>, "schemaVersion">,
  itinerary: ResolvedPracticeOccurrence[],
): Extract<PracticeSessionCheckpoint, { schemaVersion: 2 }> {
  const startedAt = timestamp(value.startedAt, "startedAt");
  const engagedAt = value.engagedAt === null ? null : timestamp(value.engagedAt, "engagedAt");
  const updatedAt = base.updatedAt;
  if (engagedAt && Date.parse(engagedAt) < Date.parse(startedAt)) {
    throw new Error("engagedAt must not be earlier than startedAt.");
  }
  if (Date.parse(updatedAt) < Date.parse(engagedAt ?? startedAt)) {
    throw new Error("updatedAt must not be earlier than Practice engagement.");
  }
  const entryPoint = enumValue(
    value.entryPoint,
    ["standard", "quick-start-v1"] as const,
    "entryPoint",
  );
  return {
    ...base,
    schemaVersion: 2,
    sessionId: string(value.sessionId, "sessionId"),
    roundId: string(value.roundId, "roundId"),
    entryPoint,
    startedAt,
    engagedAt,
    revision: safeInteger(value.revision, "revision"),
    round: parseRound(value.round, itinerary),
  };
}

export function resolvePracticeSessionCheckpoint(
  input: ResolvePracticeSessionCheckpointInput,
): ResolvePracticeSessionCheckpointResult {
  const validation = validatePracticeSessionCheckpoint(input.checkpoint);
  if (!validation.ok) return discard(validation.reason, validation.detail);
  let checkpoint = validation.checkpoint;

  if (checkpoint.scopeKey !== practiceScopeKey(checkpoint.scope)) {
    return discard("invalid-checkpoint", "The saved Practice scope key is inconsistent.");
  }
  if (checkpoint.scopeKey !== practiceScopeKey(input.expectedScope)) {
    return discard("scope-mismatch", "Your previous practice belongs to a different scope.");
  }

  const currentOccurrence = checkpoint.itinerary.find((occurrence) => occurrence.id === checkpoint.currentOccurrenceId);
  if (!currentOccurrence) {
    return discard("unknown-occurrence", "The saved Practice occurrence is no longer available.");
  }
  if (currentOccurrence.turn.turnId !== checkpoint.turn.turnId) {
    return discard("unknown-occurrence", "The saved Practice turn no longer matches its occurrence.");
  }
  if (JSON.stringify(currentOccurrence.turn) !== JSON.stringify(checkpoint.turn)) {
    return discard("invalid-checkpoint", "The saved Practice turn evidence is inconsistent.");
  }
  const allOccurrences = [
    ...checkpoint.itinerary,
    ...checkpoint.stats.pendingReturns.map((pending) => pending.occurrence),
  ];
  for (const occurrence of allOccurrences) {
    if (occurrence.id !== practiceOccurrenceId(checkpoint.scope, occurrence.cardId, occurrence.originalIndex, occurrence.returnIndex)) {
      return discard("unknown-occurrence", "A saved Practice occurrence has an invalid stable identity.");
    }
  }

  const cardIds = new Set(input.catalog.cards.map((card) => card.id));
  if (allOccurrences.some((occurrence) => !cardIds.has(occurrence.cardId))) {
    return discard("card-removed", "A sentence in your previous practice was removed.");
  }
  const mastered = new Set(input.masteredCardIds);
  if (allOccurrences.some((occurrence) => mastered.has(occurrence.cardId))) {
    return discard("card-mastered", "A sentence in your previous practice is now mastered.");
  }

  let currentFingerprint: string;
  try {
    currentFingerprint = catalogFingerprint(input.expectedScope, input.catalog);
  } catch (error) {
    return discard("scope-reference-missing", error instanceof Error ? error.message : String(error));
  }
  if (checkpoint.catalogFingerprint !== currentFingerprint) {
    return discard("catalog-changed", "Your previous practice could not be resumed because the course changed.");
  }
  const allowedCardIds = cardIdsForScope(input.expectedScope, input.catalog);
  if (allOccurrences.some((occurrence) => !allowedCardIds.has(occurrence.cardId))) {
    return discard("unknown-occurrence", "A saved Practice occurrence does not belong to this scope.");
  }

  const updatedAt = Date.parse(checkpoint.updatedAt);
  if (input.now.getTime() - updatedAt > CHECKPOINT_MAX_AGE_MS) {
    return discard("stale", "Your previous practice is more than 30 days old.");
  }

  const reconciliation = reconcileDurableEvidence(checkpoint, input.durableEvidence);
  if (!reconciliation.ok) return discard("submission-conflict", reconciliation.detail);
  checkpoint = reconciliation.checkpoint;

  return {
    status: "resume",
    checkpoint,
    recoveredCommand: reconciliation.recoveredEvidenceId
      ? { kind: "submission", evidenceId: reconciliation.recoveredEvidenceId }
      : null,
  };
}

function reconcileDurableEvidence(
  checkpoint: PracticeSessionCheckpoint,
  evidence: readonly DurablePracticeEvidence[],
): { ok: true; checkpoint: PracticeSessionCheckpoint; recoveredEvidenceId: string | null } | { ok: false; detail: string } {
  const current = checkpoint.itinerary.find((occurrence) => occurrence.id === checkpoint.currentOccurrenceId)!;
  const turnEvidence = evidence.filter((entry) => entry.turnId === checkpoint.turn.turnId);
  if (turnEvidence.some((entry) => entry.cardId !== current.cardId)) {
    return { ok: false, detail: "Durable turn evidence references a different sentence." };
  }

  const attempts = turnEvidence.filter((entry): entry is DurableAttemptEvidence => entry.kind === "attempt")
    .sort((left, right) => left.submissionIndex - right.submissionIndex);
  const indexes = new Set<number>();
  for (const attempt of attempts) {
    if (attempt.id !== `turn-attempt:${attempt.turnId}:${attempt.submissionIndex}` || indexes.has(attempt.submissionIndex)) {
      return { ok: false, detail: "Durable Attempt identity conflicts with its submission index." };
    }
    indexes.add(attempt.submissionIndex);
  }

  const savedIndex = checkpoint.turn.submissionIndex;
  const highestIndex = attempts.at(-1)?.submissionIndex ?? -1;
  if (highestIndex > savedIndex) {
    return { ok: false, detail: "Durable Attempts are ahead of the saved submission index." };
  }
  for (let index = 0; index < savedIndex; index += 1) {
    if (!indexes.has(index)) {
      return { ok: false, detail: "The saved submission index has missing durable Attempt evidence." };
    }
  }

  const committedPendingAttempt = attempts.find((attempt) => attempt.submissionIndex === savedIndex) ?? null;
  if (committedPendingAttempt
    && committedPendingAttempt.phase !== "legacy"
    && committedPendingAttempt.phase !== checkpoint.turn.phase) {
    return { ok: false, detail: "The committed Attempt phase conflicts with the saved turn." };
  }
  const signals = turnEvidence.filter((entry) => entry.kind === "signal");
  if (signals.some((signal) => signal.id !== `turn-signal:${signal.turnId}`)) {
    return { ok: false, detail: "Durable signal identity conflicts with its turn." };
  }

  const evidenceRows = [...attempts, ...signals];
  const supportLevelUsed = evidenceRows.reduce(
    (maximum, entry) => Math.max(maximum, entry.supportLevelUsed) as RecallSupportLevel,
    checkpoint.turn.supportLevelUsed,
  );
  const supportKindsUsed = unique([
    ...checkpoint.turn.supportKindsUsed,
    ...evidenceRows.flatMap((entry) => entry.supportKindsUsed),
  ]);
  const signalEscalatedSupport = signals.some((signal) => (
    signal.supportLevelUsed > checkpoint.turn.supportLevelUsed
    || signal.supportKindsUsed.some((kind) => !checkpoint.turn.supportKindsUsed.includes(kind))
  ));
  const reconciledTurn: PracticeTurnCheckpoint = {
    ...checkpoint.turn,
    phase: signalEscalatedSupport
      && supportLevelUsed > 0
      && checkpoint.turn.phase !== "first-exposure"
      && checkpoint.turn.phase !== "voluntary-practice"
      ? "guided-recall"
      : checkpoint.turn.phase,
    supportLevelUsed,
    supportKindsUsed,
    receivedCorrection: checkpoint.turn.receivedCorrection
      || attempts.some((attempt) => attempt.receivedCorrection),
    reviewFailureRecorded: checkpoint.turn.reviewFailureRecorded
      || signals.some((signal) => signal.reviewFailureRecorded),
    submissionIndex: committedPendingAttempt ? savedIndex + 1 : savedIndex,
  };
  const reconciledItinerary = checkpoint.itinerary.map((occurrence) => occurrence.id === checkpoint.currentOccurrenceId
    ? { ...occurrence, turn: reconciledTurn }
    : occurrence);

  return {
    ok: true,
    checkpoint: { ...checkpoint, itinerary: reconciledItinerary, turn: reconciledTurn },
    recoveredEvidenceId: committedPendingAttempt?.id ?? null,
  };
}

function cardIdsForScope(scope: PracticeSessionScope, catalog: PracticeSessionCatalog): Set<string> {
  if (scope.kind === "focused") {
    return new Set([scope.cardId]);
  }

  if (scope.kind === "vocabulary" && scope.cardId) {
    if (!scope.courseId) return new Set([scope.cardId]);
    const course = catalog.courses.find((candidate) => candidate.id === scope.courseId);
    const belongsToCourse = course?.units.some((unit) => unit.lessons.some(
      (lesson) => lesson.cardIds.includes(scope.cardId!),
    ));
    return belongsToCourse ? new Set([scope.cardId]) : new Set();
  }
  const courseId = scope.courseId;
  if (!courseId) return new Set(catalog.cards.map((card) => card.id));
  const course = catalog.courses.find((candidate) => candidate.id === courseId);
  if (!course) return new Set();
  if (scope.kind === "lesson") {
    const lesson = course.units.flatMap((unit) => unit.lessons).find((candidate) => candidate.id === scope.lessonId);
    return new Set(lesson?.cardIds ?? []);
  }
  return new Set(course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.cardIds)));
}

function parseScope(value: unknown): PracticeSessionScope {
  const scope = record(value, "scope");
  const kind = string(scope.kind, "scope.kind");
  if (kind === "lesson") {
    const mode = scope.mode;
    if (mode !== "learn" && mode !== "replay") throw new Error("scope.mode is invalid.");
    return { kind, courseId: string(scope.courseId, "scope.courseId"), lessonId: string(scope.lessonId, "scope.lessonId"), mode };
  }
  if (kind === "course") return { kind, courseId: string(scope.courseId, "scope.courseId") };
  if (kind === "focused") return { kind, cardId: string(scope.cardId, "scope.cardId") };
  if (kind === "review") {
    return { kind, ...(scope.courseId === undefined ? {} : { courseId: string(scope.courseId, "scope.courseId") }) };
  }
  if (kind === "vocabulary") {
    const cardId = scope.cardId === undefined ? undefined : string(scope.cardId, "scope.cardId");
    const courseId = scope.courseId === undefined ? undefined : string(scope.courseId, "scope.courseId");
    return { kind, ...(courseId ? { courseId } : {}), ...(cardId ? { cardId } : {}) };
  }
  throw new Error("scope.kind is invalid.");
}

function parseOccurrence(
  value: unknown,
  path: string,
  schemaVersion: 1 | 2,
): ResolvedPracticeOccurrence {
  const item = record(value, path);
  exactKeys(item, [
    "id",
    "cardId",
    "originalIndex",
    "returnIndex",
    "courseId",
    "unitId",
    "lessonId",
    "status",
    "turn",
    ...(schemaVersion === 2 ? ["queueReason", "scheduledReviewDueAt"] : []),
  ], path);
  const status = enumValue(item.status, ["ready", "completed", "skipped"] as const, `${path}.status`);
  const queueReason = schemaVersion === 2
    ? enumValue(
        item.queueReason,
        ["new-learning", "due-review", "focused-practice", "voluntary-practice"] as const,
        `${path}.queueReason`,
      )
    : undefined;
  const scheduledReviewDueAt = item.scheduledReviewDueAt === undefined
    ? undefined
    : timestamp(item.scheduledReviewDueAt, `${path}.scheduledReviewDueAt`);
  if (queueReason === "due-review" && !scheduledReviewDueAt) {
    throw new Error(`${path}.scheduledReviewDueAt is required for due Review.`);
  }
  return {
    id: string(item.id, `${path}.id`),
    cardId: string(item.cardId, `${path}.cardId`),
    originalIndex: safeInteger(item.originalIndex, `${path}.originalIndex`),
    returnIndex: safeInteger(item.returnIndex, `${path}.returnIndex`),
    ...(item.courseId === undefined ? {} : { courseId: string(item.courseId, `${path}.courseId`) }),
    ...(item.unitId === undefined ? {} : { unitId: string(item.unitId, `${path}.unitId`) }),
    ...(item.lessonId === undefined ? {} : { lessonId: string(item.lessonId, `${path}.lessonId`) }),
    ...(queueReason ? { queueReason } : {}),
    ...(scheduledReviewDueAt ? { scheduledReviewDueAt } : {}),
    status,
    turn: parseTurn(item.turn, `${path}.turn`),
  };
}

function parseTurn(value: unknown, path: string): PracticeTurnCheckpoint {
  const turn = record(value, path);
  exactKeys(turn, ["turnId", "phase", "supportLevelUsed", "supportKindsUsed", "receivedCorrection", "reviewFailureRecorded", "submissionIndex"], path);
  const phase = enumValue(turn.phase, ["first-exposure", "guided-recall", "independent-recall", "corrective-practice", "review-recall", "voluntary-practice"] as const, `${path}.phase`);
  const supportLevelUsed = enumValue(turn.supportLevelUsed, [0, 1, 2, 3, 4] as const, `${path}.supportLevelUsed`);
  const supportKindsUsed = array(turn.supportKindsUsed, `${path}.supportKindsUsed`).map((kind, index) => enumValue(
    kind,
    ["pattern", "keywords", "frame", "pronunciation", "audio", "grammar", "copy-target", "answer", "correction"] as const,
    `${path}.supportKindsUsed[${index}]`,
  ));
  if (new Set(supportKindsUsed).size !== supportKindsUsed.length) throw new Error(`${path}.supportKindsUsed must be unique.`);
  const minimumLevel = supportKindsUsed.reduce(
    (maximum, kind) => Math.max(maximum, MINIMUM_SUPPORT_LEVEL[kind]) as RecallSupportLevel,
    0 as RecallSupportLevel,
  );
  if (supportLevelUsed < minimumLevel) throw new Error(`${path}.supportLevelUsed contradicts its support kinds.`);
  return {
    turnId: string(turn.turnId, `${path}.turnId`),
    phase: phase as PracticePhase,
    supportLevelUsed: supportLevelUsed as RecallSupportLevel,
    supportKindsUsed: supportKindsUsed as RecallSupportKind[],
    receivedCorrection: boolean(turn.receivedCorrection, `${path}.receivedCorrection`),
    reviewFailureRecorded: boolean(turn.reviewFailureRecorded, `${path}.reviewFailureRecorded`),
    submissionIndex: safeInteger(turn.submissionIndex, `${path}.submissionIndex`),
  };
}

function parseStats(value: unknown, schemaVersion: 1 | 2) {
  const stats = record(value, "stats");
  exactKeys(stats, ["completedCount", "perfectCount", "closeCount", "retryCount", "skippedCount", "score", "combo", "bestCombo", "audioPlays", "revealed", "accuracyTotal", "returnCounts", "pendingReturns"], "stats");
  const returnCountsRecord = record(stats.returnCounts, "stats.returnCounts");
  const returnCounts = Object.fromEntries(Object.entries(returnCountsRecord).map(([cardId, count]) => {
    const parsed = safeInteger(count, `stats.returnCounts.${cardId}`);
    if (parsed > 2) throw new Error(`stats.returnCounts.${cardId} exceeds the in-round return cap.`);
    return [cardId, parsed];
  }));
  const pendingReturns = array(stats.pendingReturns, "stats.pendingReturns").map((value, index) => {
    const pending = record(value, `stats.pendingReturns[${index}]`);
    exactKeys(pending, ["occurrence", "eligibleAfterCompletedCount"], `stats.pendingReturns[${index}]`);
    return {
      occurrence: parseOccurrence(
        pending.occurrence,
        `stats.pendingReturns[${index}].occurrence`,
        schemaVersion,
      ),
      eligibleAfterCompletedCount: safeInteger(pending.eligibleAfterCompletedCount, `stats.pendingReturns[${index}].eligibleAfterCompletedCount`),
    };
  });
  return {
    completedCount: safeInteger(stats.completedCount, "stats.completedCount"),
    perfectCount: safeInteger(stats.perfectCount, "stats.perfectCount"),
    closeCount: safeInteger(stats.closeCount, "stats.closeCount"),
    retryCount: safeInteger(stats.retryCount, "stats.retryCount"),
    skippedCount: safeInteger(stats.skippedCount, "stats.skippedCount"),
    score: finiteNonNegative(stats.score, "stats.score"),
    combo: safeInteger(stats.combo, "stats.combo"),
    bestCombo: safeInteger(stats.bestCombo, "stats.bestCombo"),
    // These fields were omitted by early schema-v1 writers. Treat absence as
    // zero so existing local checkpoints remain resumable.
    audioPlays: safeInteger(stats.audioPlays ?? 0, "stats.audioPlays"),
    revealed: safeInteger(stats.revealed ?? 0, "stats.revealed"),
    accuracyTotal: finiteNonNegative(stats.accuracyTotal ?? 0, "stats.accuracyTotal"),
    returnCounts,
    pendingReturns,
  };
}

function parseRound(value: unknown, itinerary: ResolvedPracticeOccurrence[]) {
  const round = record(value, "round");
  exactKeys(round, [
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
  ], "round");
  const initialOccurrenceIds = uniqueStrings(round.initialOccurrenceIds, "round.initialOccurrenceIds");
  const scheduledOccurrenceIds = uniqueStrings(round.scheduledOccurrenceIds, "round.scheduledOccurrenceIds");
  const attemptedOccurrenceIds = uniqueStrings(round.attemptedOccurrenceIds, "round.attemptedOccurrenceIds");
  const completedOccurrenceIds = uniqueStrings(round.completedOccurrenceIds, "round.completedOccurrenceIds");
  const skippedOccurrenceIds = uniqueStrings(round.skippedOccurrenceIds, "round.skippedOccurrenceIds");
  const remainingOccurrenceIds = uniqueStrings(round.remainingOccurrenceIds, "round.remainingOccurrenceIds");
  const dueReviewScheduledOccurrenceIds = uniqueStrings(
    round.dueReviewScheduledOccurrenceIds,
    "round.dueReviewScheduledOccurrenceIds",
  );
  const dueReviewCompletedOccurrenceIds = uniqueStrings(
    round.dueReviewCompletedOccurrenceIds,
    "round.dueReviewCompletedOccurrenceIds",
  );
  const introducedCardIds = uniqueStrings(round.introducedCardIds, "round.introducedCardIds");
  const firstPassCardIds = uniqueStrings(round.firstPassCardIds, "round.firstPassCardIds");
  const requeue = record(round.requeue, "round.requeue");
  exactKeys(requeue, [
    "insertedReturnOccurrenceIds",
    "deferredNoRoomCardIds",
    "capReachedCardIds",
  ], "round.requeue");
  const insertedReturnOccurrenceIds = uniqueStrings(
    requeue.insertedReturnOccurrenceIds,
    "round.requeue.insertedReturnOccurrenceIds",
  );
  const deferredNoRoomCardIds = uniqueStrings(
    requeue.deferredNoRoomCardIds,
    "round.requeue.deferredNoRoomCardIds",
  );
  const capReachedCardIds = uniqueStrings(
    requeue.capReachedCardIds,
    "round.requeue.capReachedCardIds",
  );

  const scheduled = new Set(scheduledOccurrenceIds);
  const itineraryIds = new Set(itinerary.map((occurrence) => occurrence.id));
  if (itineraryIds.size !== scheduled.size
    || [...itineraryIds].some((id) => !scheduled.has(id))) {
    throw new Error("round.scheduledOccurrenceIds must match the checkpoint itinerary.");
  }
  assertSubset(initialOccurrenceIds, scheduled, "round.initialOccurrenceIds");
  assertSubset(attemptedOccurrenceIds, scheduled, "round.attemptedOccurrenceIds");
  assertSubset(dueReviewScheduledOccurrenceIds, scheduled, "round.dueReviewScheduledOccurrenceIds");
  assertSubset(dueReviewCompletedOccurrenceIds, new Set(dueReviewScheduledOccurrenceIds), "round.dueReviewCompletedOccurrenceIds");
  assertSubset(dueReviewCompletedOccurrenceIds, new Set(completedOccurrenceIds), "round.dueReviewCompletedOccurrenceIds");
  assertSubset(insertedReturnOccurrenceIds, scheduled, "round.requeue.insertedReturnOccurrenceIds");
  if (insertedReturnOccurrenceIds.some((id) => initialOccurrenceIds.includes(id))) {
    throw new Error("Inserted return occurrences cannot be initial occurrences.");
  }
  const terminalSets = [completedOccurrenceIds, skippedOccurrenceIds, remainingOccurrenceIds];
  const terminalUnion = new Set(terminalSets.flat());
  if (terminalUnion.size !== scheduled.size
    || [...scheduled].some((id) => !terminalUnion.has(id))
    || terminalSets.some((values, index) => values.some(
      (id) => terminalSets.some((other, otherIndex) => otherIndex !== index && other.includes(id)),
    ))) {
    throw new Error("Completed, skipped, and remaining occurrences must partition the scheduled round.");
  }

  return {
    initialOccurrenceIds,
    scheduledOccurrenceIds,
    attemptedOccurrenceIds,
    completedOccurrenceIds,
    skippedOccurrenceIds,
    remainingOccurrenceIds,
    dueReviewScheduledOccurrenceIds,
    dueReviewCompletedOccurrenceIds,
    introducedCardIds,
    firstPassCardIds,
    requeue: {
      insertedReturnOccurrenceIds,
      deferredNoRoomCardIds,
      capReachedCardIds,
    },
  };
}

function discard(reason: CheckpointDiscardReason, message: string): ResolvePracticeSessionCheckpointResult {
  return { status: "discard", reason, message };
}

function invalid(detail: string): ValidatePracticeSessionCheckpointResult {
  return { ok: false, reason: "invalid-checkpoint", detail };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) throw new Error(`${path} must be a string.`);
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean.`);
  return value;
}

function safeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${path} must be a non-negative safe integer.`);
  return value as number;
}

function finiteNonNegative(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${path} must be a finite non-negative number.`);
  return value;
}

function timestamp(value: unknown, path: string): string {
  const result = string(value, path);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${path} must be a valid timestamp.`);
  return result;
}

function literal<T extends string>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new Error(`${path} must equal ${expected}.`);
  return expected;
}

function enumValue<T extends readonly (string | number)[]>(value: unknown, values: T, path: string): T[number] {
  if (!values.includes(value as never)) throw new Error(`${path} is invalid.`);
  return value as T[number];
}

function exactKeys(value: Record<string, unknown>, keys: string[], path: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${path}.${unknown} is not checkpoint metadata.`);
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function uniqueStrings(value: unknown, path: string): string[] {
  const values = array(value, path).map((item, index) => string(item, `${path}[${index}]`));
  assertUnique(values, path);
  return values;
}

function assertSubset(values: string[], allowed: ReadonlySet<string>, path: string): void {
  if (values.some((value) => !allowed.has(value))) {
    throw new Error(`${path} contains an occurrence outside its allowed set.`);
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
