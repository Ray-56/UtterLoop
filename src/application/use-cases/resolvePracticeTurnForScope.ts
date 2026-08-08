import type { SentenceCard } from "../../domain/content/SentenceCard";
import {
  hasFirstPass,
  type SentenceLearningState,
} from "../../domain/learning/SentenceLearningState";
import {
  createPracticeTurn,
  resolveInitialPracticeTurn,
  type PracticePhase,
  type PracticeTurn,
} from "../../domain/practice/PracticeTurn";
import type { PracticeScope } from "./buildPracticeSession";

export interface ResolvePracticeTurnForScopeInput {
  id: string;
  scope: PracticeScope | null;
  card: SentenceCard;
  learningState: SentenceLearningState | undefined;
  initialPhase?: PracticePhase;
}

export function resolvePracticeTurnForScope(
  input: ResolvePracticeTurnForScopeInput,
): PracticeTurn {
  if (input.initialPhase) {
    return createPracticeTurn(input.id, input.card.id, input.initialPhase);
  }

  const resolved = resolveInitialPracticeTurn({
    id: input.id,
    cardId: input.card.id,
    learningState: input.learningState,
    isReviewScope: input.scope?.kind === "review",
  });
  const isVoluntaryScope = input.scope?.kind === "focused"
    || input.scope?.kind === "course"
    || input.scope?.kind === "vocabulary"
    || (input.scope?.kind === "lesson" && input.scope.mode === "replay");

  return hasFirstPass(input.learningState) && isVoluntaryScope
    ? createPracticeTurn(input.id, input.card.id, "voluntary-practice")
    : resolved;
}
