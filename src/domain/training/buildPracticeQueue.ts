import type { SentenceCard } from "../content/SentenceCard";
import type { ReviewState } from "../review/ReviewState";
import { isReviewDue } from "../review/reviewScheduler";
import type { PracticeQueue, PracticeQueueItem } from "./PracticeQueue";

export function buildPracticeQueue(
  cards: SentenceCard[],
  reviewStates: ReviewState[],
  now: Date,
): PracticeQueue {
  const reviewByCard = new Map(reviewStates.map((reviewState) => [reviewState.cardId, reviewState]));
  const items = cards
    .flatMap<PracticeQueueItem>((card) => {
      const reviewState = reviewByCard.get(card.id);

      if (!reviewState || (!reviewState.lastReviewedAt && !reviewState.learningStatus && reviewState.stage === 0)) {
        return [];
      }

      return [{
        card,
        reviewState,
        isDue: isReviewDue(reviewState, now),
      }];
    })
    .filter((item) => item.reviewState.learningStatus !== "mastered")
    .sort(compareQueueItems);

  return {
    due: items.filter((item) => item.isDue),
    upcoming: items.filter((item) => !item.isDue),
  };
}

function compareQueueItems(left: PracticeQueueItem, right: PracticeQueueItem): number {
  const dueDifference = new Date(left.reviewState.dueAt).getTime() - new Date(right.reviewState.dueAt).getTime();

  if (dueDifference !== 0) {
    return dueDifference;
  }

  return left.reviewState.stage - right.reviewState.stage;
}
