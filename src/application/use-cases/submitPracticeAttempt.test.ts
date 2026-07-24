import { describe, expect, it } from "vitest";
import type { TrainingRepository } from "../ports/TrainingRepository";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import type { ReviewState } from "../../domain/review/ReviewState";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";
import { submitPracticeAttempt } from "./submitPracticeAttempt";
import { skipPracticeCard } from "./skipPracticeCard";
import { revealPracticeAnswer } from "./revealPracticeAnswer";

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
      outcome: "skipped",
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

    expect(revealedState).toMatchObject({ stage: 0, streak: 0, lapseCount: 1 });
    expect(repository.practiceLog[0]).toMatchObject({
      outcome: "revealed",
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

    expect(submitted.reviewState.lapseCount).toBe(1);
    expect(repository.practiceLog.map((entry) => entry.outcome)).toEqual(["revealed", "perfect"]);
  });
});

class RecordingRepository implements TrainingRepository {
  readonly savedReviewStates: ReviewState[] = [];
  readonly practiceLog: PracticeLogEntry[] = [];
  readonly vocabularyEntries: VocabularyEntry[] = [];

  constructor(private readonly card: SentenceCard) {}

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
    return this.savedReviewStates.find((reviewState) => reviewState.cardId === cardId);
  }

  async saveReviewState(reviewState: ReviewState) {
    this.savedReviewStates.push(reviewState);
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

  async clearLearningProgress() {}

  async clearAll() {}
}
