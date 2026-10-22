import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type { ExerciseStage, LearningStudioDocument, StudioActivity, StudioExercise } from "../../domain/studio/LearningStudio";
import { REHEARSAL_TASKS, SENTENCE_FAMILIES } from "../../domain/studio/studioCatalog";
import { buildContextExercises, buildFamilyExercises } from "../../domain/studio/studioRules";
import { buildWeaknessExercises, type WeaknessPatternId } from "../../domain/studio/weaknessPractice";

export interface StudioSelection { activity: StudioActivity; groupId: string; stage: ExerciseStage }

export function familyTestIsAvailable(document: LearningStudioDocument, familyId: string): boolean {
  const family = SENTENCE_FAMILIES.find((candidate) => candidate.id === familyId);
  return Boolean(family && family.exercises.filter((exercise) => exercise.stage === "training").every((exercise) =>
    document.attempts.some((attempt) => attempt.activity === "family" && attempt.groupId === familyId
      && attempt.exerciseId === exercise.id && attempt.stage === "training" && attempt.outcome === "perfect")));
}

export function buildStudioExercises(input: StudioSelection, context: {
  cards: readonly SentenceCard[]; learningStates: readonly SentenceLearningState[];
  document: LearningStudioDocument; now: Date;
}): StudioExercise[] {
  switch (input.activity) {
    case "context": return buildContextExercises(context.cards,
      new Set(context.learningStates.filter((state) => state.firstPassedAt).map((state) => state.cardId)), input.stage);
    case "family": {
      if (input.stage === "held-out" && !familyTestIsAvailable(context.document, input.groupId)) {
        throw new Error("Complete the three training variants before trying the transfer check.");
      }
      return buildFamilyExercises(input.groupId, input.stage);
    }
    case "mission": {
      const task = REHEARSAL_TASKS.find((candidate) => candidate.id === input.groupId);
      if (!task) throw new Error("Rehearsal task not found.");
      return task.steps;
    }
    case "personal": return context.document.personalSentences.filter((sentence) =>
      input.groupId === "all" || (input.groupId === "due" && Date.parse(sentence.reviewState.dueAt) <= context.now.getTime())
      || sentence.id === input.groupId,
    ).map((sentence) => ({ id: sentence.id, prompt: sentence.card.prompt, target: sentence.card.english,
      acceptableAnswers: sentence.card.acceptableAnswers, stage: "training", sourceCardId: sentence.id,
    }));
    case "weakness": {
      if (!["articles", "for-since", "be-agreement"].includes(input.groupId)) throw new Error("Unknown contrast-practice pattern.");
      return buildWeaknessExercises(input.groupId as WeaknessPatternId);
    }
  }
}
