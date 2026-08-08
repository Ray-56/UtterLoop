import type {
  PracticeLogContext,
  PracticeRoundSummary,
  PracticeSessionEvidence,
  PracticeSessionEntryPoint,
  PracticeSessionTerminal,
} from "../../domain/practice/PracticeSessionEvidence";
import { PRACTICE_SESSION_EVIDENCE_SCHEMA_VERSION } from "../../domain/practice/PracticeSessionEvidence";
import type { QuickStartPreference } from "../../domain/backup/UtterLoopFullBackup";
import type {
  PracticeSessionCheckpointCommitResult,
  PracticeSessionStore,
  PracticeSessionTerminalCommitResult,
} from "../ports/PracticeSessionStore";
import {
  practiceLogContextForOccurrence,
  type PracticeSessionCheckpoint,
  type PracticeSessionCheckpointV1,
  type PracticeSessionCheckpointV2,
  type ResolvedPracticeOccurrence,
} from "./PracticeSessionCheckpoint";

export type PracticeSessionCheckpointSeed = Omit<
  PracticeSessionCheckpointV2,
  | "schemaVersion"
  | "sessionId"
  | "roundId"
  | "entryPoint"
  | "startedAt"
  | "engagedAt"
  | "revision"
  | "updatedAt"
>;

export interface PracticeSessionLifecycleDependencies {
  now(): Date;
  createId(kind: "session" | "round"): string;
}

export interface OpenPracticeSessionInput {
  checkpoint: PracticeSessionCheckpointSeed;
  entryPoint: PracticeSessionEntryPoint;
  catalogFingerprintForScope?(scope: PracticeSessionCheckpointV2["scope"]): string | undefined;
  masteredCardIds?: readonly string[];
}

export const PRACTICE_SESSION_RESUME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

export type PracticeSessionEngagementReason =
  | "text-input"
  | "first-exposure"
  | "support"
  | "target-audio"
  | "answer-reveal"
  | "skip"
  | "submission";

export interface CommitPracticeSessionCheckpointInput {
  kind: "checkpoint";
  checkpoint: PracticeSessionCheckpointV2;
  engagement?: PracticeSessionEngagementReason;
  roundEvents?: readonly PracticeSessionRoundEvent[];
}

export type PracticeSessionRoundEvent =
  | { kind: "attempted"; occurrenceId: string }
  | { kind: "completed"; occurrenceId: string }
  | { kind: "skipped"; occurrenceId: string }
  | { kind: "first-exposure"; cardId: string }
  | { kind: "first-pass"; cardId: string }
  | { kind: "requeue-inserted"; occurrenceId: string }
  | { kind: "requeue-deferred-no-room"; cardId: string }
  | { kind: "requeue-cap-reached"; cardId: string };

export interface CommitPracticeSessionTerminalInput {
  kind: "terminal";
  checkpoint: PracticeSessionCheckpointV2;
  terminal: PracticeSessionTerminal;
  quickStartPreference?: QuickStartPreference;
}

export type CommitPracticeSessionInput =
  | CommitPracticeSessionCheckpointInput
  | CommitPracticeSessionTerminalInput;

export interface OpenedPracticeSession {
  status: "opened" | "resumed" | "upgraded" | "replacement-required";
  checkpoint: PracticeSessionCheckpointV2;
  contextByOccurrenceId: Record<string, PracticeLogContext>;
}

export class PracticeSessionLifecycle {
  constructor(
    private readonly store: PracticeSessionStore,
    private readonly dependencies: PracticeSessionLifecycleDependencies,
  ) {}

  async open(input: OpenPracticeSessionInput): Promise<OpenedPracticeSession> {
    const active = await this.store.loadActiveCheckpoint();
    if (isV2Checkpoint(active)) {
      if (!isStructurallyValidV2Checkpoint(active)) {
        await this.store.discardActiveCheckpoint(
          typeof active.sessionId === "string" ? active.sessionId : undefined,
        );
      } else if (isExpiredCheckpoint(active, this.dependencies.now())) {
        if (active.engagedAt) {
          await this.commit({
            kind: "terminal",
            checkpoint: active,
            terminal: { kind: "abandoned", reason: "expired" },
          });
        } else {
          await this.store.discardActiveCheckpoint(active.sessionId);
        }
      } else if (input.catalogFingerprintForScope
        && input.catalogFingerprintForScope(active.scope) !== active.catalogFingerprint) {
        await this.commit({
          kind: "terminal",
          checkpoint: active,
          terminal: { kind: "invalidated", reason: "catalog-mismatch" },
        });
      } else if (checkpointContainsMasteredCard(active, input.masteredCardIds ?? [])) {
        await this.commit({
          kind: "terminal",
          checkpoint: active,
          terminal: { kind: "invalidated", reason: "corrupt" },
        });
      } else if (isCompatibleV2Checkpoint(active, input.checkpoint, input.entryPoint)) {
        return {
          status: "resumed",
          checkpoint: structuredClone(active),
          contextByOccurrenceId: contextsFor(active),
        };
      } else if (active.engagedAt) {
        return {
          status: "replacement-required",
          checkpoint: structuredClone(active),
          contextByOccurrenceId: contextsFor(active),
        };
      } else {
        await this.store.discardActiveCheckpoint(active.sessionId);
      }
    }

    const openedAt = this.dependencies.now().toISOString();
    if (isV1Checkpoint(active)) {
      if (this.dependencies.now().getTime() - Date.parse(active.updatedAt)
        > PRACTICE_SESSION_RESUME_MAX_AGE_MS) {
        await this.store.discardActiveCheckpoint();
      } else if (checkpointContainsMasteredCard(active, input.masteredCardIds ?? [])) {
        await this.store.discardActiveCheckpoint();
      } else if (isCompatibleV1Checkpoint(active, input.checkpoint)) {
        const checkpoint = upgradeLegacyCheckpoint(
          active,
          input.checkpoint,
          input.entryPoint,
          this.dependencies.createId("session"),
          this.dependencies.createId("round"),
          openedAt,
        );
        const commit = await this.store.commitCheckpoint(checkpoint);
        if (commit !== "stored" && commit !== "unchanged") {
          throw new Error(`Legacy Practice session could not be upgraded: ${commit}`);
        }
        return {
          status: "upgraded",
          checkpoint,
          contextByOccurrenceId: contextsFor(checkpoint),
        };
      }
      await this.store.discardActiveCheckpoint();
    }

    const checkpoint: PracticeSessionCheckpointV2 = {
      ...structuredClone(input.checkpoint),
      schemaVersion: 2,
      sessionId: this.dependencies.createId("session"),
      roundId: this.dependencies.createId("round"),
      entryPoint: input.entryPoint,
      startedAt: openedAt,
      engagedAt: null,
      revision: 0,
      updatedAt: openedAt,
    };
    const commit = await this.store.commitCheckpoint(checkpoint);
    if (commit !== "stored" && commit !== "unchanged") {
      throw new Error(`Practice session could not be opened: ${commit}`);
    }

    return {
      status: "opened",
      checkpoint,
      contextByOccurrenceId: contextsFor(checkpoint),
    };
  }

  async commit(input: CommitPracticeSessionCheckpointInput): Promise<{
    status: PracticeSessionCheckpointCommitResult;
    checkpoint: PracticeSessionCheckpointV2;
  }>;
  async commit(input: CommitPracticeSessionTerminalInput): Promise<{
    status: PracticeSessionTerminalCommitResult;
    evidence: PracticeSessionEvidence;
  }>;
  async commit(input: CommitPracticeSessionInput): Promise<
    | {
        status: PracticeSessionCheckpointCommitResult;
        checkpoint: PracticeSessionCheckpointV2;
      }
    | {
        status: PracticeSessionTerminalCommitResult;
        evidence: PracticeSessionEvidence;
      }
  > {
    const committedAt = this.dependencies.now().toISOString();
    if (input.kind === "terminal") {
      assertTerminalCompatible(input.checkpoint, input.terminal);
      const evidence = deepFreeze<PracticeSessionEvidence>({
        schemaVersion: PRACTICE_SESSION_EVIDENCE_SCHEMA_VERSION,
        sessionId: input.checkpoint.sessionId,
        roundId: input.checkpoint.roundId,
        scope: structuredClone(input.checkpoint.scope),
        entryPoint: input.checkpoint.entryPoint,
        startedAt: input.checkpoint.startedAt,
        engagedAt: input.checkpoint.engagedAt,
        endedAt: committedAt,
        terminal: structuredClone(input.terminal),
        round: structuredClone(input.checkpoint.round),
      });
      const status = await this.store.commitTerminal({
        evidence,
        ...(input.quickStartPreference
          ? { quickStartPreference: input.quickStartPreference }
          : {}),
      });
      return { status, evidence };
    }

    const checkpoint: PracticeSessionCheckpointV2 = {
      ...structuredClone(input.checkpoint),
      engagedAt: input.checkpoint.engagedAt ?? (input.engagement ? committedAt : null),
      revision: input.checkpoint.revision + 1,
      round: applyRoundEvents(input.checkpoint, input.roundEvents ?? []),
      updatedAt: committedAt,
    };
    const status = await this.store.commitCheckpoint(checkpoint);
    return { status, checkpoint };
  }
}

function isExpiredCheckpoint(
  checkpoint: PracticeSessionCheckpointV2,
  now: Date,
): boolean {
  return now.getTime() - Date.parse(checkpoint.updatedAt) > PRACTICE_SESSION_RESUME_MAX_AGE_MS;
}

function checkpointContainsMasteredCard(
  checkpoint: PracticeSessionCheckpoint,
  masteredCardIds: readonly string[],
): boolean {
  if (masteredCardIds.length === 0) return false;
  const mastered = new Set(masteredCardIds);
  return checkpoint.itinerary.some((occurrence) => mastered.has(occurrence.cardId))
    || checkpoint.stats.pendingReturns.some(
      (pending) => mastered.has(pending.occurrence.cardId),
    );
}

function assertTerminalCompatible(
  checkpoint: PracticeSessionCheckpointV2,
  terminal: PracticeSessionTerminal,
): void {
  if (terminal.kind === "completed" && checkpoint.round.remainingOccurrenceIds.length > 0) {
    throw new Error("A completed Practice round cannot retain remaining occurrences.");
  }
  if (terminal.kind === "dismissed" && checkpoint.entryPoint !== "quick-start-v1") {
    throw new Error("Only Quick Start can be dismissed.");
  }
  if (terminal.kind === "completed"
    && terminal.reason === "quick-start-complete"
    && checkpoint.entryPoint !== "quick-start-v1") {
    throw new Error("Quick Start completion requires the Quick Start entry point.");
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function applyRoundEvents(
  checkpoint: PracticeSessionCheckpointV2,
  events: readonly PracticeSessionRoundEvent[],
): PracticeRoundSummary {
  const round = structuredClone(checkpoint.round);
  const scheduled = new Set(round.scheduledOccurrenceIds);
  const attempted = new Set(round.attemptedOccurrenceIds);
  const completed = new Set(round.completedOccurrenceIds);
  const skipped = new Set(round.skippedOccurrenceIds);
  const remaining = new Set(round.remainingOccurrenceIds);
  const dueScheduled = new Set(round.dueReviewScheduledOccurrenceIds);
  const dueCompleted = new Set(round.dueReviewCompletedOccurrenceIds);
  const introduced = new Set(round.introducedCardIds);
  const firstPass = new Set(round.firstPassCardIds);
  const inserted = new Set(round.requeue.insertedReturnOccurrenceIds);
  const deferred = new Set(round.requeue.deferredNoRoomCardIds);
  const capped = new Set(round.requeue.capReachedCardIds);

  for (const event of events) {
    if ("occurrenceId" in event && !scheduled.has(event.occurrenceId)) {
      throw new Error(`Practice round does not contain occurrence: ${event.occurrenceId}`);
    }
    switch (event.kind) {
      case "attempted":
        attempted.add(event.occurrenceId);
        break;
      case "completed":
        completed.add(event.occurrenceId);
        skipped.delete(event.occurrenceId);
        remaining.delete(event.occurrenceId);
        if (dueScheduled.has(event.occurrenceId)) dueCompleted.add(event.occurrenceId);
        break;
      case "skipped":
        skipped.add(event.occurrenceId);
        completed.delete(event.occurrenceId);
        dueCompleted.delete(event.occurrenceId);
        remaining.delete(event.occurrenceId);
        break;
      case "first-exposure":
        introduced.add(event.cardId);
        break;
      case "first-pass":
        firstPass.add(event.cardId);
        break;
      case "requeue-inserted":
        inserted.add(event.occurrenceId);
        break;
      case "requeue-deferred-no-room":
        deferred.add(event.cardId);
        break;
      case "requeue-cap-reached":
        capped.add(event.cardId);
        break;
    }
  }

  return {
    initialOccurrenceIds: [...round.initialOccurrenceIds],
    scheduledOccurrenceIds: [...scheduled],
    attemptedOccurrenceIds: [...attempted],
    completedOccurrenceIds: [...completed],
    skippedOccurrenceIds: [...skipped],
    remainingOccurrenceIds: [...remaining],
    dueReviewScheduledOccurrenceIds: [...dueScheduled],
    dueReviewCompletedOccurrenceIds: [...dueCompleted],
    introducedCardIds: [...introduced],
    firstPassCardIds: [...firstPass],
    requeue: {
      insertedReturnOccurrenceIds: [...inserted],
      deferredNoRoomCardIds: [...deferred],
      capReachedCardIds: [...capped],
    },
  };
}

function isCompatibleV1Checkpoint(
  checkpoint: PracticeSessionCheckpointV1,
  seed: PracticeSessionCheckpointSeed,
): boolean {
  if (checkpoint.id !== "active"
    || checkpoint.scopeKey !== seed.scopeKey
    || checkpoint.catalogFingerprint !== seed.catalogFingerprint
    || JSON.stringify(checkpoint.scope) !== JSON.stringify(seed.scope)
    || checkpoint.itinerary.length === 0
    || !Number.isFinite(Date.parse(checkpoint.updatedAt))
    || typeof checkpoint.draft !== "string"
    || !Number.isSafeInteger(checkpoint.selectionStart)
    || !Number.isSafeInteger(checkpoint.selectionEnd)
    || checkpoint.selectionStart < 0
    || checkpoint.selectionEnd < checkpoint.selectionStart
    || checkpoint.selectionEnd > checkpoint.draft.length) {
    return false;
  }
  const current = checkpoint.itinerary.find(
    (occurrence) => occurrence.id === checkpoint.currentOccurrenceId,
  );
  if (!current || current.turn.turnId !== checkpoint.turn.turnId) return false;
  const baseOccurrences = new Map(seed.itinerary.map((occurrence) => [
    occurrence.originalIndex,
    occurrence,
  ]));
  const occurrences = [
    ...checkpoint.itinerary,
    ...checkpoint.stats.pendingReturns.map((pending) => pending.occurrence),
  ];
  const occurrenceIds = new Set<string>();
  const occurrenceIndexes = new Set<string>();
  return occurrences.every((occurrence) => {
    const base = baseOccurrences.get(occurrence.originalIndex);
    const indexKey = `${occurrence.originalIndex}:${occurrence.returnIndex}`;
    if (!base
      || occurrence.returnIndex > 2
      || occurrenceIds.has(occurrence.id)
      || occurrenceIndexes.has(indexKey)
      || !isStructurallyValidOccurrence(occurrence)
      || !sameOccurrenceSource(base, occurrence)) {
      return false;
    }
    occurrenceIds.add(occurrence.id);
    occurrenceIndexes.add(indexKey);
    return true;
  });
}

function sameOccurrenceSource(
  left: ResolvedPracticeOccurrence,
  right: ResolvedPracticeOccurrence,
): boolean {
  return left.cardId === right.cardId
    && left.courseId === right.courseId
    && left.unitId === right.unitId
    && left.lessonId === right.lessonId;
}

function isV1Checkpoint(
  checkpoint: PracticeSessionCheckpoint | undefined,
): checkpoint is PracticeSessionCheckpointV1 {
  return checkpoint?.schemaVersion === 1;
}

function isStructurallyValidOccurrence(occurrence: ResolvedPracticeOccurrence): boolean {
  return typeof occurrence.id === "string"
    && occurrence.id.length > 0
    && typeof occurrence.cardId === "string"
    && occurrence.cardId.length > 0
    && Number.isSafeInteger(occurrence.originalIndex)
    && occurrence.originalIndex >= 0
    && Number.isSafeInteger(occurrence.returnIndex)
    && occurrence.returnIndex >= 0
    && ["ready", "completed", "skipped"].includes(occurrence.status)
    && typeof occurrence.turn?.turnId === "string"
    && occurrence.turn.turnId.length > 0;
}

function isStructurallyValidV2Checkpoint(
  checkpoint: PracticeSessionCheckpointV2,
): boolean {
  if (typeof checkpoint.sessionId !== "string" || checkpoint.sessionId.length === 0
    || typeof checkpoint.roundId !== "string" || checkpoint.roundId.length === 0
    || !["standard", "quick-start-v1"].includes(checkpoint.entryPoint)
    || !Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0
    || !Number.isFinite(Date.parse(checkpoint.startedAt))
    || (checkpoint.engagedAt !== null && !Number.isFinite(Date.parse(checkpoint.engagedAt)))) {
    return false;
  }
  const occurrences = [
    ...checkpoint.itinerary,
    ...checkpoint.stats.pendingReturns.map((pending) => pending.occurrence),
  ];
  if (checkpoint.itinerary.length === 0 || occurrences.some((occurrence) => (
    !isStructurallyValidOccurrence(occurrence)
    || !["new-learning", "due-review", "focused-practice", "voluntary-practice"]
      .includes(occurrence.queueReason ?? "")
    || (occurrence.queueReason === "due-review"
      && !Number.isFinite(Date.parse(occurrence.scheduledReviewDueAt ?? "")))
  ))) {
    return false;
  }
  const current = checkpoint.itinerary.find(
    (occurrence) => occurrence.id === checkpoint.currentOccurrenceId,
  );
  if (!current || current.turn.turnId !== checkpoint.turn.turnId) return false;

  const scheduled = new Set(checkpoint.round.scheduledOccurrenceIds);
  const itineraryIds = new Set(checkpoint.itinerary.map((occurrence) => occurrence.id));
  if (scheduled.size !== itineraryIds.size
    || [...scheduled].some((id) => !itineraryIds.has(id))) {
    return false;
  }
  const terminalIds = [
    ...checkpoint.round.completedOccurrenceIds,
    ...checkpoint.round.skippedOccurrenceIds,
    ...checkpoint.round.remainingOccurrenceIds,
  ];
  return terminalIds.length === scheduled.size
    && new Set(terminalIds).size === scheduled.size
    && terminalIds.every((id) => scheduled.has(id));
}

function upgradeLegacyCheckpoint(
  legacy: PracticeSessionCheckpointV1,
  seed: PracticeSessionCheckpointSeed,
  entryPoint: PracticeSessionEntryPoint,
  sessionId: string,
  roundId: string,
  upgradedAt: string,
): PracticeSessionCheckpointV2 {
  const metadata = new Map(seed.itinerary.map((occurrence) => [occurrence.id, occurrence]));
  const baseMetadata = new Map(seed.itinerary.map((occurrence) => [
    occurrence.originalIndex,
    occurrence,
  ]));
  const itinerary = legacy.itinerary.map((occurrence) => {
    const current = metadata.get(occurrence.id)
      ?? baseMetadata.get(occurrence.originalIndex)!;
    return {
      ...structuredClone(occurrence),
      queueReason: current.queueReason,
      ...(current.scheduledReviewDueAt
        ? { scheduledReviewDueAt: current.scheduledReviewDueAt }
        : {}),
    };
  });
  const pendingReturns = legacy.stats.pendingReturns.map((pending) => ({
    ...structuredClone(pending),
    occurrence: {
      ...structuredClone(pending.occurrence),
      queueReason: baseMetadata.get(pending.occurrence.originalIndex)?.queueReason
        ?? queueReasonForLegacyOccurrence(legacy, pending.occurrence),
      ...(baseMetadata.get(pending.occurrence.originalIndex)?.scheduledReviewDueAt
        ? {
            scheduledReviewDueAt: baseMetadata.get(
              pending.occurrence.originalIndex,
            )!.scheduledReviewDueAt,
          }
        : {}),
    },
  }));
  const checkpoint: PracticeSessionCheckpointV2 = {
    ...structuredClone(legacy),
    schemaVersion: 2,
    sessionId,
    roundId,
    entryPoint,
    startedAt: legacy.updatedAt,
    engagedAt: legacyWasEngaged(legacy) ? legacy.updatedAt : null,
    revision: 0,
    itinerary,
    stats: { ...structuredClone(legacy.stats), pendingReturns },
    round: buildRoundSummary(itinerary, pendingReturns, legacy.stats.returnCounts),
    updatedAt: upgradedAt,
  };
  return checkpoint;
}

function queueReasonForLegacyOccurrence(
  checkpoint: PracticeSessionCheckpointV1,
  occurrence: ResolvedPracticeOccurrence,
) {
  if (checkpoint.scope.kind === "review") return "due-review" as const;
  if (checkpoint.scope.kind === "focused") return "focused-practice" as const;
  if (checkpoint.scope.kind === "lesson" && checkpoint.scope.mode === "learn"
    && occurrence.turn.phase !== "voluntary-practice") {
    return "new-learning" as const;
  }
  return "voluntary-practice" as const;
}

function legacyWasEngaged(checkpoint: PracticeSessionCheckpointV1): boolean {
  return checkpoint.draft.length > 0
    || checkpoint.turn.submissionIndex > 0
    || checkpoint.turn.supportKindsUsed.length > 0
    || checkpoint.stats.completedCount > 0
    || checkpoint.stats.skippedCount > 0
    || checkpoint.stats.audioPlays > 0
    || checkpoint.stats.revealed > 0;
}

function buildRoundSummary(
  itinerary: ResolvedPracticeOccurrence[],
  pendingReturns: PracticeSessionCheckpointV1["stats"]["pendingReturns"],
  returnCounts: Record<string, number>,
) {
  const completed = itinerary.filter((item) => item.status === "completed").map((item) => item.id);
  const skipped = itinerary.filter((item) => item.status === "skipped").map((item) => item.id);
  const remaining = itinerary.filter((item) => item.status === "ready").map((item) => item.id);
  const due = itinerary.filter((item) => item.queueReason === "due-review");
  return {
    initialOccurrenceIds: itinerary.filter((item) => item.returnIndex === 0).map((item) => item.id),
    scheduledOccurrenceIds: itinerary.map((item) => item.id),
    attemptedOccurrenceIds: [...completed],
    completedOccurrenceIds: completed,
    skippedOccurrenceIds: skipped,
    remainingOccurrenceIds: remaining,
    dueReviewScheduledOccurrenceIds: due.map((item) => item.id),
    dueReviewCompletedOccurrenceIds: due.filter((item) => item.status === "completed").map((item) => item.id),
    introducedCardIds: [],
    firstPassCardIds: [],
    requeue: {
      insertedReturnOccurrenceIds: itinerary.filter((item) => item.returnIndex > 0).map((item) => item.id),
      deferredNoRoomCardIds: [...new Set(pendingReturns.map((pending) => pending.occurrence.cardId))],
      capReachedCardIds: Object.entries(returnCounts)
        .filter(([, count]) => count >= 2)
        .map(([cardId]) => cardId),
    },
  };
}

function isV2Checkpoint(
  checkpoint: PracticeSessionCheckpoint | undefined,
): checkpoint is PracticeSessionCheckpointV2 {
  return checkpoint?.schemaVersion === 2
    && typeof checkpoint.sessionId === "string"
    && checkpoint.sessionId.length > 0
    && typeof checkpoint.roundId === "string"
    && checkpoint.roundId.length > 0
    && Number.isSafeInteger(checkpoint.revision)
    && checkpoint.revision >= 0;
}

function isCompatibleV2Checkpoint(
  checkpoint: PracticeSessionCheckpointV2,
  seed: PracticeSessionCheckpointSeed,
  entryPoint: PracticeSessionEntryPoint,
): boolean {
  return checkpoint.scopeKey === seed.scopeKey
    && checkpoint.catalogFingerprint === seed.catalogFingerprint
    && JSON.stringify(checkpoint.scope) === JSON.stringify(seed.scope)
    && checkpoint.entryPoint === entryPoint;
}

function contextsFor(
  checkpoint: PracticeSessionCheckpointV2,
): Record<string, PracticeLogContext> {
  return Object.fromEntries(checkpoint.itinerary.map((occurrence) => [
    occurrence.id,
    practiceLogContextForOccurrence(checkpoint, occurrence.id),
  ]));
}
