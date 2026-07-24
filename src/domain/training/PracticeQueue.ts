import type { SentenceCard } from "../content/SentenceCard";
import type { ReviewState } from "../review/ReviewState";

export interface PracticeQueueItem {
  card: SentenceCard;
  reviewState: ReviewState;
  isDue: boolean;
}

export interface PracticeQueue {
  due: PracticeQueueItem[];
  upcoming: PracticeQueueItem[];
}
