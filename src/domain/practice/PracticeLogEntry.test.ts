import { describe, expect, it } from "vitest";
import {
  createPracticeAttemptLogEntry,
  mergePracticeSignalLogEntry,
} from "./PracticeLogEntry";

describe("PracticeLogEntry", () => {
  it("copies immutable Practice Session context into new Attempt and Signal rows", () => {
    const context = {
      sessionId: "session-1",
      roundId: "round-1",
      occurrenceId: "occurrence-1",
      queueReason: "due-review" as const,
      scheduledReviewDueAt: "2026-07-31T11:00:00.000Z",
    };
    const attempt = createPracticeAttemptLogEntry({
      turnId: "turn-context",
      cardId: "card-1",
      phase: "review-recall",
      submissionIndex: 0,
      submittedAt: "2026-07-31T12:00:00.000Z",
      answer: "A sentence.",
      outcome: "perfect",
      accuracy: 1,
      evidence: {
        answerWasRevealed: false,
        hadEdits: false,
        audioPlayCount: 0,
        durationMs: 1_000,
      },
      context,
    });
    const signal = mergePracticeSignalLogEntry(undefined, {
      turnId: "turn-context",
      cardId: "card-1",
      phase: "review-recall",
      at: "2026-07-31T12:00:00.000Z",
      signalKind: "support-used",
      reviewFailureRecorded: false,
      evidence: {
        answerWasRevealed: false,
        hadEdits: false,
        audioPlayCount: 1,
        durationMs: 500,
        supportLevelUsed: 3,
        supportKindsUsed: ["audio"],
      },
      context,
    });

    expect(attempt.context).toEqual(context);
    expect(signal.context).toEqual(context);
    expect(attempt.context).not.toBe(context);
    expect(signal.context).not.toBe(context);
  });

  it("uses deterministic indexed Attempt identifiers with normalized evidence", () => {
    const entry = createPracticeAttemptLogEntry({
      turnId: "turn-1",
      cardId: "card-1",
      phase: "independent-recall",
      submissionIndex: 2,
      submittedAt: "2026-07-31T12:00:00.000Z",
      answer: "A sentence.",
      outcome: "perfect",
      accuracy: 1,
      evidence: {
        answerWasRevealed: false,
        hadEdits: true,
        audioPlayCount: 0,
        durationMs: 1200,
      },
    });

    expect(entry).toMatchObject({
      kind: "attempt",
      id: "turn-attempt:turn-1:2",
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
    });
  });

  it("merges one deterministic signal row without lowering evidence or duplicating kinds", () => {
    const first = mergePracticeSignalLogEntry(undefined, {
      turnId: "turn-1",
      cardId: "card-1",
      phase: "guided-recall",
      at: "2026-07-31T12:00:00.000Z",
      signalKind: "support-used",
      reviewFailureRecorded: false,
      evidence: {
        answerWasRevealed: false,
        hadEdits: false,
        audioPlayCount: 1,
        durationMs: 500,
        supportLevelUsed: 3,
        supportKindsUsed: ["audio"],
      },
    });
    const merged = mergePracticeSignalLogEntry(first, {
      turnId: "turn-1",
      cardId: "card-1",
      phase: "guided-recall",
      at: "2026-07-31T12:01:00.000Z",
      signalKind: "revealed",
      reviewFailureRecorded: true,
      evidence: {
        answerWasRevealed: true,
        hadEdits: false,
        audioPlayCount: 1,
        durationMs: 900,
        supportLevelUsed: 4,
        supportKindsUsed: ["audio", "answer"],
      },
    });

    expect(merged).toMatchObject({
      id: "turn-signal:turn-1",
      submittedAt: first.submittedAt,
      updatedAt: "2026-07-31T12:01:00.000Z",
      signalKinds: ["support-used", "revealed"],
      supportLevelUsed: 4,
      supportKindsUsed: ["audio", "answer"],
      reviewFailureRecorded: true,
    });
  });
});
