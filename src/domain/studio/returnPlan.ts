import type { SentenceCard } from "../content/SentenceCard";
import { inspectSentenceCardRecallSafety } from "../content/inspectSentenceCardRecallSafety";
import { hasFirstPass, type SentenceLearningState } from "../learning/SentenceLearningState";
import type { PracticeQueueReason } from "../practice/PracticeSessionEvidence";
import type { PracticePhase } from "../practice/PracticeTurn";
import type { ReviewState } from "../review/ReviewState";
import { createInitialReviewState } from "../review/reviewScheduler";
import { buildPracticeQueue } from "../training/buildPracticeQueue";
import type { PracticeQueueItem } from "../training/PracticeQueue";

export type ReturnPlanMinutes = 3 | 8 | 15;

export interface ReturnPlanItem extends PracticeQueueItem {
  queueReason: PracticeQueueReason;
  initialPhase: PracticePhase;
  scheduledReviewDueAt?: string;
  explanation: string;
}

export interface ReturnPlan {
  minutes: ReturnPlanMinutes;
  itemLimit: number;
  items: ReturnPlanItem[];
  blockedCardIds: string[];
  remainingDueCount: number;
  description: string;
}

export const RETURN_PLAN_BUDGETS = {
  3: { items: 3, new: 0, weak: 1 },
  8: { items: 6, new: 1, weak: 1 },
  15: { items: 10, new: 2, weak: 2 },
} as const;

export function buildReturnPlan(input: {
  minutes: ReturnPlanMinutes;
  cards: readonly SentenceCard[];
  reviewStates: readonly ReviewState[];
  learningStates: readonly SentenceLearningState[];
  weakCardIds?: ReadonlySet<string>;
  now: Date;
}): ReturnPlan {
  const budget = RETURN_PLAN_BUDGETS[input.minutes];
  if (!budget) throw new Error("Return practice requires a 3, 8, or 15 minute budget.");
  if (!Number.isFinite(input.now.getTime())) throw new Error("Return practice requires a valid clock.");
  const reviewByCard = new Map(input.reviewStates.map((state) => [state.cardId, state]));
  const learningByCard = new Map(input.learningStates.map((state) => [state.cardId, state]));
  const blockedCardIds: string[] = [];
  const safeCards = input.cards.filter((card) => {
    if (reviewByCard.get(card.id)?.learningStatus === "mastered") return false;
    if (inspectSentenceCardRecallSafety(card).safe) return true;
    blockedCardIds.push(card.id);
    return false;
  });
  const acquiredCards = safeCards.filter((card) => hasFirstPass(learningByCard.get(card.id)));
  const due = buildPracticeQueue(acquiredCards, [...input.reviewStates], input.now).due
    .sort((left, right) => left.reviewState.dueAt.localeCompare(right.reviewState.dueAt)
      || left.card.id.localeCompare(right.card.id));
  const items: ReturnPlanItem[] = due.slice(0, budget.items).map((item) => ({
    ...item,
    queueReason: "due-review",
    initialPhase: "review-recall",
    scheduledReviewDueAt: item.reviewState.dueAt,
    explanation: `Oldest due review first; due ${item.reviewState.dueAt}.`,
  }));
  const selected = new Set(items.map((item) => item.card.id));
  const add = (item: ReturnPlanItem) => {
    if (items.length < budget.items && !selected.has(item.card.id)) {
      items.push(item);
      selected.add(item.card.id);
    }
  };
  const weakCards = acquiredCards
    .filter((card) => input.weakCardIds?.has(card.id) && !selected.has(card.id) && reviewByCard.has(card.id))
    .sort((left, right) => (reviewByCard.get(right.id)!.lapseCount - reviewByCard.get(left.id)!.lapseCount)
      || left.id.localeCompare(right.id))
    .slice(0, budget.weak);
  for (const card of weakCards) {
    add({
      card,
      reviewState: reviewByCard.get(card.id)!,
      isDue: false,
      queueReason: "voluntary-practice",
      initialPhase: "voluntary-practice",
      explanation: "Optional weak-card practice after due work; its Review schedule stays separate.",
    });
  }
  const learningCards = safeCards.filter((card) => !hasFirstPass(learningByCard.get(card.id)))
    .sort((left, right) => {
      const leftIntroduced = learningByCard.get(left.id)?.introducedAt;
      const rightIntroduced = learningByCard.get(right.id)?.introducedAt;
      return leftIntroduced && rightIntroduced ? leftIntroduced.localeCompare(rightIntroduced)
        : leftIntroduced ? -1 : rightIntroduced ? 1 : 0;
    })
    .slice(0, budget.new);
  for (const card of learningCards) {
    const learning = learningByCard.get(card.id);
    add({
      card,
      reviewState: reviewByCard.get(card.id) ?? createInitialReviewState(card.id, input.now),
      isDue: false,
      queueReason: "new-learning",
      initialPhase: !learning?.introducedAt ? "first-exposure"
        : learning.acquisitionStatus === "ready-independent" ? "independent-recall" : "guided-recall",
      explanation: learning?.introducedAt
        ? "Continue an unfinished acquisition after due work; this is not retained Review."
        : "A bounded new sentence after due work; instruction comes before recall.",
    });
  }
  return {
    minutes: input.minutes,
    itemLimit: budget.items,
    items,
    blockedCardIds,
    remainingDueCount: due.length - items.filter((item) => item.queueReason === "due-review").length,
    description: `${input.minutes}-minute intention with at most ${budget.items} sentences. Actual time depends on your pace. Due work comes first; unpracticed due dates stay unchanged.`,
  };
}
