import { describe, expect, it } from "vitest";
import type { TrainingRepository } from "../ports/TrainingRepository";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../domain/review/ReviewState";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";
import { submitPracticeAttempt } from "./submitPracticeAttempt";
import { skipPracticeCard } from "./skipPracticeCard";
import { revealPracticeAnswer } from "./revealPracticeAnswer";
import { recordPracticeSupport } from "./recordPracticeSupport";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type { AtomicPracticeWrite } from "../ports/TrainingRepository";
import {
  createPracticeStatisticsState,
  finalizePracticeStatistics,
  reducePracticeStatistics,
} from "../../domain/progress/practiceStatistics";

const card: SentenceCard = {
  id: "course-card-1",
  english: "I can finish this sentence today.",
  prompt: "我今天可以完成这个句子。",
  source: "Test",
  tags: ["test"],
  acceptableAnswers: [],
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("submitPracticeAttempt", () => {
  it("atomically creates First Pass for a deterministic independent perfect", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-19T00:00:00.000Z",
      acquisitionStatus: "ready-independent",
    });

    const result = await submitPracticeAttempt(
      repository,
      {
        cardId: card.id,
        answer: card.english,
        submittedAt: "2026-07-19T01:00:00.000Z",
        turnId: "turn-1",
        phase: "independent-recall",
        submissionIndex: 0,
        answerWasRevealed: false,
        hadEdits: false,
        audioPlayCount: 0,
        durationMs: 1000,
        supportLevelUsed: 0,
        supportKindsUsed: [],
        receivedCorrection: false,
        context: {
          sessionId: "session-1",
          roundId: "round-1",
          occurrenceId: "occurrence-1",
          queueReason: "new-learning",
        },
      },
      new Date("2026-07-19T01:00:00.000Z"),
    );

    expect(result.learningState).toMatchObject({
      firstPassSource: "independent-recall",
      firstPassedAt: "2026-07-19T01:00:00.000Z",
    });
    expect(result.reviewState.stage).toBe(1);
    expect(repository.practiceLog[0]).toMatchObject({
      kind: "attempt",
      id: "turn-attempt:turn-1:0",
      phase: "independent-recall",
      context: {
        sessionId: "session-1",
        roundId: "round-1",
        occurrenceId: "occurrence-1",
        queueReason: "new-learning",
      },
    });
  });

  it("returns a persisted deterministic Attempt without scheduling it twice", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-19T00:00:00.000Z",
      acquisitionStatus: "ready-independent",
    });
    const attempt = {
      cardId: card.id,
      answer: card.english,
      submittedAt: "2026-07-19T01:00:00.000Z",
      turnId: "turn-idempotent",
      phase: "independent-recall" as const,
      submissionIndex: 0,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
    };

    const commandTime = new Date("2026-07-19T01:00:00.250Z");
    const first = await submitPracticeAttempt(repository, attempt, commandTime);
    const retried = await submitPracticeAttempt(repository, attempt, commandTime);

    expect(retried.logEntry).toEqual(first.logEntry);
    expect(retried.firstPassCreated).toBe(true);
    expect(retried.shouldRequeue).toBe(false);
    expect(retried.learningState).toEqual(first.learningState);
    expect(retried.reviewState).toEqual(first.reviewState);
    expect(repository.practiceLog).toHaveLength(1);
    expect(repository.savedReviewStates).toHaveLength(1);
  });

  it("logs a failed retrieval in its submitted phase and restores the corrective result on retry", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-19T00:00:00.000Z",
      firstPassedAt: "2026-07-19T00:30:00.000Z",
      firstPassSource: "independent-recall",
      acquisitionStatus: "ready-independent",
    });
    const attempt = {
      cardId: card.id,
      answer: "I can complete this sentence today.",
      submittedAt: "2026-07-19T01:00:00.000Z",
      turnId: "turn-failed-retrieval",
      phase: "review-recall" as const,
      submissionIndex: 0,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
      supportLevelUsed: 0 as const,
      supportKindsUsed: [],
      receivedCorrection: false,
    };

    const first = await submitPracticeAttempt(repository, attempt, new Date(attempt.submittedAt));
    const retried = await submitPracticeAttempt(repository, attempt, new Date(attempt.submittedAt));

    expect(first.evaluation.outcome).not.toBe("perfect");
    expect(first.logEntry.phase).toBe("review-recall");
    expect(first.logEntry.receivedCorrection).toBe(false);
    expect(first.turn.phase).toBe("corrective-practice");
    expect(retried.turn.phase).toBe("corrective-practice");
    expect(repository.practiceLog).toHaveLength(1);

    const statistics = finalizePracticeStatistics(
      reducePracticeStatistics(
        createPracticeStatisticsState(new Date("2026-07-19T02:00:00.000Z"), "UTC"),
        first.logEntry,
      ),
    );
    expect(statistics.allTime.retrievalChecks).toBe(1);
    expect(statistics.allTime.closeCount + statistics.allTime.retryCount).toBe(1);
  });

  it("preserves the independent requeue command when a guided completion is retried", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-19T00:00:00.000Z",
      acquisitionStatus: "needs-guided",
    });
    const attempt = {
      cardId: card.id,
      answer: card.english,
      submittedAt: "2026-07-19T01:00:00.000Z",
      turnId: "turn-guided-idempotent",
      phase: "guided-recall" as const,
      submissionIndex: 0,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
      supportLevelUsed: 1 as const,
      supportKindsUsed: ["pattern" as const],
      receivedCorrection: false,
    };

    const first = await submitPracticeAttempt(repository, attempt, new Date(attempt.submittedAt));
    const retried = await submitPracticeAttempt(repository, attempt, new Date(attempt.submittedAt));

    expect(first.shouldRequeue).toBe(true);
    expect(retried.shouldRequeue).toBe(true);
    expect(retried.firstPassCreated).toBe(false);
    expect(retried.learningState).toEqual(first.learningState);
    expect(retried.reviewState).toEqual(first.reviewState);
    expect(repository.practiceLog).toHaveLength(1);
    expect(repository.savedReviewStates).toHaveLength(1);
  });

  it("preserves the independent requeue command when a corrective completion is retried", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-19T00:00:00.000Z",
      acquisitionStatus: "needs-guided",
    });
    const attempt = {
      cardId: card.id,
      answer: card.english,
      submittedAt: "2026-07-19T01:00:00.000Z",
      turnId: "turn-corrective-idempotent",
      phase: "corrective-practice" as const,
      submissionIndex: 1,
      answerWasRevealed: false,
      hadEdits: true,
      audioPlayCount: 0,
      durationMs: 1600,
      supportLevelUsed: 0 as const,
      supportKindsUsed: ["correction" as const],
      receivedCorrection: true,
    };

    const first = await submitPracticeAttempt(repository, attempt, new Date(attempt.submittedAt));
    const retried = await submitPracticeAttempt(repository, attempt, new Date(attempt.submittedAt));

    expect(first.shouldRequeue).toBe(true);
    expect(retried.shouldRequeue).toBe(true);
    expect(retried.firstPassCreated).toBe(false);
    expect(retried.learningState).toEqual(first.learningState);
    expect(retried.reviewState).toEqual(first.reviewState);
    expect(repository.practiceLog).toHaveLength(1);
    expect(repository.savedReviewStates).toHaveLength(1);
  });

  it("rejects an incomplete attempt without writing review state or practice history", async () => {
    const repository = new RecordingRepository(card);

    await expect(
      submitPracticeAttempt(
        repository,
        {
          cardId: card.id,
          answer: "I can finish",
          submittedAt: "2026-07-19T01:00:00.000Z",
          answerWasRevealed: false,
          hadEdits: false,
          audioPlayCount: 0,
          durationMs: 1000,
        },
        new Date("2026-07-19T01:00:00.000Z"),
      ),
    ).rejects.toThrow("Attempt is incomplete");

    expect(repository.savedReviewStates).toHaveLength(0);
    expect(repository.practiceLog).toHaveLength(0);
  });

  it("atomically records answer evidence with the review transition", async () => {
    const repository = new RecordingRepository(card);

    const result = await submitPracticeAttempt(
      repository,
      {
        cardId: card.id,
        answer: card.english,
        submittedAt: "2026-07-19T01:00:00.000Z",
        answerWasRevealed: true,
        hadEdits: true,
        audioPlayCount: 2,
        durationMs: 4200,
      },
      new Date("2026-07-19T01:00:00.000Z"),
    );

    expect(result.reviewState.stage).toBe(0);
    expect(repository.savedReviewStates).toEqual([result.reviewState]);
    expect(repository.practiceLog[0]).toMatchObject({
      outcome: "perfect",
      answerWasRevealed: true,
      hadEdits: true,
      audioPlayCount: 2,
      durationMs: 4200,
    });
  });

  it("records skip as a short-interval review signal", async () => {
    const repository = new RecordingRepository(card);

    const reviewState = await skipPracticeCard(
      repository,
      card.id,
      {
        answerWasRevealed: true,
        hadEdits: true,
        audioPlayCount: 1,
        durationMs: 2300,
      },
      new Date("2026-07-19T01:00:00.000Z"),
    );

    expect(reviewState.stage).toBe(0);
    expect(repository.practiceLog[0]).toMatchObject({
      kind: "signal",
      signalKinds: ["skipped"],
      accuracy: 0,
      answer: "",
      answerWasRevealed: true,
      hadEdits: true,
      audioPlayCount: 1,
      durationMs: 2300,
    });
  });

  it("persists answer reveal immediately without counting it twice on submission", async () => {
    const repository = new RecordingRepository(card);
    const now = new Date("2026-07-19T01:00:00.000Z");

    const revealedState = await revealPracticeAnswer(
      repository,
      card.id,
      {
        answerWasRevealed: true,
        hadEdits: false,
        audioPlayCount: 1,
        durationMs: 1800,
      },
      now,
    );

    expect(revealedState).toMatchObject({ stage: 0, streak: 0, lapseCount: 0 });
    expect(repository.practiceLog[0]).toMatchObject({
      kind: "signal",
      signalKinds: ["revealed"],
      answer: "",
      accuracy: 0,
      answerWasRevealed: true,
    });

    const submitted = await submitPracticeAttempt(
      repository,
      {
        cardId: card.id,
        answer: card.english,
        submittedAt: now.toISOString(),
        answerWasRevealed: true,
        hadEdits: false,
        audioPlayCount: 1,
        durationMs: 3000,
      },
      now,
    );

    expect(submitted.reviewState.lapseCount).toBe(0);
    expect(repository.practiceLog.map((entry) => entry.kind)).toEqual(["signal", "attempt"]);
    expect(repository.practiceLog[1]).toMatchObject({ outcome: "perfect" });
  });

  it("persists progressive support as target-bearing evidence without marking Answer Reveal", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-18T00:00:00.000Z",
      firstPassedAt: "2026-07-18T01:00:00.000Z",
      firstPassSource: "independent-recall",
    });
    repository.savedReviewStates.push({
      cardId: card.id,
      stage: 3,
      dueAt: "2026-07-19T00:00:00.000Z",
      lastReviewedAt: "2026-07-18T01:00:00.000Z",
      streak: 3,
      lapseCount: 0,
    });

    const reviewState = await recordPracticeSupport(
      repository,
      card.id,
      {
        answerWasRevealed: false,
        hadEdits: false,
        audioPlayCount: 0,
        durationMs: 900,
        supportLevelUsed: 2,
        supportKindsUsed: ["pattern", "keywords"],
      },
      new Date("2026-07-19T01:00:00.000Z"),
      { turnId: "turn-support", phase: "review-recall" },
    );

    expect(reviewState).toMatchObject({ stage: 0, lapseCount: 1 });
    expect(repository.practiceLog).toHaveLength(1);
    expect(repository.practiceLog[0]).toMatchObject({
      id: "turn-signal:turn-support",
      kind: "signal",
      signalKinds: ["support-used"],
      supportLevelUsed: 2,
      supportKindsUsed: ["pattern", "keywords"],
      answerWasRevealed: false,
      reviewFailureRecorded: true,
    });
  });

  it("keeps durable support failure evidence monotonic across more support and the final submission", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-18T00:00:00.000Z",
      firstPassedAt: "2026-07-18T01:00:00.000Z",
      firstPassSource: "independent-recall",
    });
    repository.savedReviewStates.push({
      cardId: card.id,
      stage: 3,
      dueAt: "2026-07-19T00:00:00.000Z",
      lastReviewedAt: "2026-07-18T01:00:00.000Z",
      streak: 3,
      lapseCount: 0,
    });
    const context = {
      turnId: "turn-monotonic-support",
      phase: "review-recall" as const,
      reviewFailureRecorded: false,
      practiceLogContext: {
        sessionId: "session-signal",
        roundId: "round-signal",
        occurrenceId: "occurrence-signal",
        queueReason: "due-review" as const,
        scheduledReviewDueAt: "2026-07-19T00:00:00.000Z",
      },
    };
    const now = new Date("2026-07-19T01:00:00.000Z");

    const first = await recordPracticeSupport(repository, card.id, {
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 500,
      supportLevelUsed: 1,
      supportKindsUsed: ["pattern"],
    }, now, context);
    const second = await revealPracticeAnswer(repository, card.id, {
      answerWasRevealed: true,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 800,
      supportLevelUsed: 4,
      supportKindsUsed: ["pattern", "answer"],
    }, now, context);
    const submitted = await submitPracticeAttempt(repository, {
      cardId: card.id,
      answer: card.english,
      submittedAt: now.toISOString(),
      turnId: context.turnId,
      phase: "guided-recall",
      submissionIndex: 0,
      answerWasRevealed: true,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1000,
      supportLevelUsed: 4,
      supportKindsUsed: ["pattern", "answer"],
      receivedCorrection: false,
      reviewFailureRecorded: false,
    }, now);

    expect(first.lapseCount).toBe(1);
    expect(second.lapseCount).toBe(1);
    expect(submitted.reviewState.lapseCount).toBe(1);
    expect(repository.practiceLog).toHaveLength(2);
    expect(repository.practiceLog[0]).toMatchObject({
      kind: "signal",
      phase: "guided-recall",
      signalKinds: ["support-used", "revealed"],
      reviewFailureRecorded: true,
      context: context.practiceLogContext,
    });
  });

  it("preserves voluntary phase for Answer Reveal evidence without changing review", async () => {
    const repository = new RecordingRepository(card, {
      cardId: card.id,
      introducedAt: "2026-07-18T00:00:00.000Z",
      firstPassedAt: "2026-07-18T01:00:00.000Z",
      firstPassSource: "independent-recall",
    });
    const reviewState: ReviewState = {
      cardId: card.id,
      stage: 3,
      dueAt: "2026-07-20T00:00:00.000Z",
      lastReviewedAt: "2026-07-18T01:00:00.000Z",
      streak: 3,
      lapseCount: 0,
    };
    repository.savedReviewStates.push(reviewState);

    const result = await revealPracticeAnswer(repository, card.id, {
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 500,
    }, new Date("2026-07-19T01:00:00.000Z"), {
      turnId: "turn-voluntary-answer",
      phase: "voluntary-practice",
    });

    expect(result).toEqual(reviewState);
    expect(repository.practiceLog[0]).toMatchObject({
      kind: "signal",
      phase: "voluntary-practice",
      reviewFailureRecorded: false,
      signalKinds: ["revealed"],
    });
  });

  it("keeps Focused voluntary Reveal, Skip, and Attempt from changing the Review schedule", async () => {
    const learningState: SentenceLearningState = {
      cardId: card.id,
      introducedAt: "2026-07-18T00:00:00.000Z",
      firstPassedAt: "2026-07-18T01:00:00.000Z",
      firstPassSource: "independent-recall",
    };
    const repository = new RecordingRepository(card, learningState);
    const reviewState: ReviewState = {
      cardId: card.id,
      stage: 3,
      dueAt: "2026-08-20T00:00:00.000Z",
      lastReviewedAt: "2026-07-18T01:00:00.000Z",
      streak: 3,
      lapseCount: 1,
    };
    repository.savedReviewStates.push(reviewState);
    const now = new Date("2026-08-01T01:00:00.000Z");

    const revealed = await revealPracticeAnswer(repository, card.id, {
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 500,
    }, now, { turnId: "turn-focused-reveal", phase: "voluntary-practice" });
    const skipped = await skipPracticeCard(repository, card.id, {
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 700,
    }, now, { turnId: "turn-focused-skip", phase: "voluntary-practice" });
    const attempted = await submitPracticeAttempt(repository, {
      cardId: card.id,
      answer: card.english,
      submittedAt: now.toISOString(),
      turnId: "turn-focused-attempt",
      phase: "voluntary-practice",
      submissionIndex: 0,
      answerWasRevealed: false,
      hadEdits: false,
      audioPlayCount: 0,
      durationMs: 1_000,
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
    }, now);

    expect(revealed).toEqual(reviewState);
    expect(skipped).toEqual(reviewState);
    expect(attempted.reviewState).toEqual(reviewState);
    expect(attempted.learningState).toEqual(learningState);
  });
});

class RecordingRepository implements TrainingRepository {
  readonly savedReviewStates: ReviewState[] = [];
  readonly practiceLog: PracticeLogEntry[] = [];
  readonly vocabularyEntries: VocabularyEntry[] = [];
  readonly learningStates: SentenceLearningState[] = [];

  constructor(private readonly card: SentenceCard, learningState?: SentenceLearningState) {
    if (learningState) this.learningStates.push(learningState);
  }

  async listCourseCategories() {
    return [];
  }

  async saveCourseCategories() {}

  async listLearningPaths() {
    return [];
  }

  async saveLearningPaths() {}

  async listCourses() {
    return [];
  }

  async getCourse() {
    return undefined;
  }

  async saveCourses() {}

  async listSentenceCards() {
    return [this.card];
  }

  async getSentenceCard(cardId: string) {
    return cardId === this.card.id ? this.card : undefined;
  }

  async saveSentenceCards() {}

  async listReviewStates() {
    return [...this.savedReviewStates];
  }

  async getReviewState(cardId: string) {
    return [...this.savedReviewStates].reverse().find((reviewState) => reviewState.cardId === cardId);
  }

  async saveReviewState(reviewState: ReviewState) {
    this.savedReviewStates.push(reviewState);
  }

  async listSentenceLearningStates() { return [...this.learningStates]; }

  async getSentenceLearningState(cardId: string) {
    return this.learningStates.find((state) => state.cardId === cardId);
  }

  async saveSentenceLearningState(state: SentenceLearningState) {
    this.putLearningState(state);
  }

  async saveLearningAndReviewState(state: SentenceLearningState, reviewState: ReviewState) {
    this.putLearningState(state);
    this.savedReviewStates.push(reviewState);
  }

  async getPracticeLogEntry(id: string) {
    return this.practiceLog.find((entry) => entry.id === id);
  }

  async savePracticeWrite(write: AtomicPracticeWrite) {
    const existing = this.practiceLog.find((entry) => entry.id === write.logEntry.id);
    if (existing && existing.kind === "attempt") return { entry: existing, created: false };
    if (write.learningState) this.putLearningState(write.learningState);
    if (write.reviewState) this.savedReviewStates.push(write.reviewState);
    if (existing) this.practiceLog.splice(this.practiceLog.indexOf(existing), 1, write.logEntry);
    else this.practiceLog.push(write.logEntry);
    return { entry: write.logEntry, created: !existing };
  }

  async addPracticeLog(entry: PracticeLogEntry) {
    this.practiceLog.push(entry);
  }

  async savePracticeResult(reviewState: ReviewState, entry: PracticeLogEntry) {
    this.savedReviewStates.push(reviewState);
    this.practiceLog.push(entry);
  }

  async listPracticeLog() {
    return [...this.practiceLog];
  }

  async listRecentPracticeActivity() {
    return { entries: [...this.practiceLog], limit: 500, totalEntries: this.practiceLog.length, isTruncated: false };
  }

  async getPracticeStatistics(): Promise<never> { throw new Error("Not used by this fixture."); }

  async listAllPracticeLog() { return [...this.practiceLog]; }

  async listVocabularyEntries() {
    return [...this.vocabularyEntries];
  }

  async getVocabularyEntry(cardId: string) {
    return this.vocabularyEntries.find((entry) => entry.cardId === cardId);
  }

  async saveVocabularyEntry(entry: VocabularyEntry) {
    this.vocabularyEntries.push(entry);
  }

  async deleteVocabularyEntry(cardId: string) {
    const index = this.vocabularyEntries.findIndex((entry) => entry.cardId === cardId);
    if (index >= 0) {
      this.vocabularyEntries.splice(index, 1);
    }
  }

  async saveCourseCatalog() {}

  async getAppPreferences() { return undefined; }

  async saveAppPreferences() {}

  async getPracticeSessionCheckpoint() { return undefined; }

  async savePracticeSessionCheckpoint() {}

  async deletePracticeSessionCheckpoint() {}

  async readFullBackup(): Promise<never> { throw new Error("Not used by this fixture."); }

  async replaceAllData() {}

  async clearLearningProgress() {}

  async clearAll() {}

  private putLearningState(state: SentenceLearningState) {
    const index = this.learningStates.findIndex((candidate) => candidate.cardId === state.cardId);
    if (index >= 0) this.learningStates.splice(index, 1, state);
    else this.learningStates.push(state);
  }
}
