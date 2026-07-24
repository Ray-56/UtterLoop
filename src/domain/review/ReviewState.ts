import type { SentenceCardId } from "../content/SentenceCard";

export type MasteryStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type LearningStatus = "new" | "mastered";

export interface ReviewState {
  cardId: SentenceCardId;
  stage: MasteryStage;
  dueAt: string;
  lastReviewedAt?: string;
  streak: number;
  lapseCount: number;
  learningStatus?: LearningStatus;
}
