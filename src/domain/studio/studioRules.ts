import type { SentenceCard } from "../content/SentenceCard";
import { inspectSentenceCardRecallSafety } from "../content/inspectSentenceCardRecallSafety";
import { completeFirstExposure, markInstructionalCompletion, recordFirstPass, requireGuidedAcquisition } from "../learning/SentenceLearningState";
import { applyPracticeSignalPolicy } from "../learning/learningAndReviewPolicy";
import { evaluateAttempt, normalizeAnswer } from "../practice/evaluateAttempt";
import { createPracticeTurn, type PracticeTurn } from "../practice/PracticeTurn";
import { applyEvaluationToReviewState, createInitialReviewState, isReviewDue, keepInAcquisitionReview } from "../review/reviewScheduler";
import type { ExerciseStage, PersonalSentence, StudioExercise } from "./LearningStudio";
import { CONTEXT_CUES, REHEARSAL_TASKS, SENTENCE_FAMILIES } from "./studioCatalog";
import { buildWeaknessExercises } from "./weaknessPractice";

export function buildContextExercises(
  cards: readonly SentenceCard[], acquiredCardIds: ReadonlySet<string>, stage: ExerciseStage,
): StudioExercise[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  return CONTEXT_CUES.flatMap((set) => {
    const card = cardById.get(set.cardId);
    if (!card || !acquiredCardIds.has(card.id) || !inspectSentenceCardRecallSafety(card).safe) return [];
    return set.cues.filter((cue) => cue.stage === stage).map((cue) => ({
      id: cue.id, prompt: cue.prompt, target: card.english,
      acceptableAnswers: [...card.acceptableAnswers], stage,
      sourceCardId: card.id,
    }));
  });
}

export function buildFamilyExercises(familyId: string, stage: ExerciseStage): StudioExercise[] {
  const family = SENTENCE_FAMILIES.find((candidate) => candidate.id === familyId);
  if (!family) throw new Error("Sentence family not found.");
  return family.exercises.filter((exercise) => exercise.stage === stage);
}

export function evaluateStudioExercise(exercise: StudioExercise, answer: string) {
  return evaluateAttempt(exerciseCard(exercise), { cardId: exercise.id, answer,
    submittedAt: "2000-01-01T00:00:00.000Z", answerWasRevealed: false,
    hadEdits: false, audioPlayCount: 0, durationMs: 0,
  });
}

export function exerciseCard(exercise: StudioExercise): SentenceCard {
  return {
    id: exercise.id, prompt: exercise.prompt, english: exercise.target,
    acceptableAnswers: exercise.acceptableAnswers, source: "UtterLoop Learning Studio",
    tags: [], createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z",
  };
}

export function validateStudioCatalog(cards: readonly SentenceCard[]): void {
  const allIds = new Set<string>();
  const cardById = new Map(cards.map((card) => [card.id, card]));
  for (const set of CONTEXT_CUES) {
    const card = cardById.get(set.cardId);
    if (!card) throw new Error(`Context references unknown card ${set.cardId}.`);
    for (const cue of set.cues) {
      validateExercise({ ...cue, target: card.english, acceptableAnswers: card.acceptableAnswers }, allIds);
    }
  }
  for (const family of SENTENCE_FAMILIES) {
    requiredText(family.title, "Family title", 100);
    requiredText(family.pattern, "Family pattern", 200);
    requiredText(family.explanation, "Family explanation", 1_000);
    for (const exercise of family.exercises) validateExercise(exercise, allIds);
  }
  for (const task of REHEARSAL_TASKS) {
    requiredText(task.title, "Task title", 100);
    for (const step of task.steps) validateExercise(step, allIds);
  }
  const familyExercises = SENTENCE_FAMILIES.flatMap((family) => family.exercises);
  const weaknessExercises = (["articles", "for-since", "be-agreement"] as const).flatMap(buildWeaknessExercises);
  for (const exercise of weaknessExercises) validateExercise(exercise, allIds);
  const teaching = [
    ...familyExercises.filter((exercise) => exercise.stage === "training"),
    ...REHEARSAL_TASKS.flatMap((task) => task.steps), ...weaknessExercises,
    ...cards.map((card) => ({ target: card.english, acceptableAnswers: card.acceptableAnswers })),
  ];
  const taughtAnswers = new Set(teaching.flatMap((exercise) => [exercise.target, ...exercise.acceptableAnswers].map(normalizeAnswer)));
  const testAnswers = new Set<string>();
  for (const exercise of familyExercises.filter((item) => item.stage === "held-out")) {
    for (const answer of new Set([exercise.target, ...exercise.acceptableAnswers].map(normalizeAnswer))) {
      if (taughtAnswers.has(answer) || testAnswers.has(answer)) {
        throw new Error(`Family held-out exercise ${exercise.id} shares an answer with another authored exercise.`);
      }
      testAnswers.add(answer);
    }
  }
}

function validateExercise(exercise: StudioExercise, ids: Set<string>): void {
  requiredText(exercise.id, "Exercise ID", 150);
  if (ids.has(exercise.id)) throw new Error(`Duplicate Studio exercise ${exercise.id}.`);
  ids.add(exercise.id);
  requiredText(exercise.prompt, "Exercise prompt", 1_000);
  requiredText(exercise.target, "Exercise target", 500);
  if (!inspectSentenceCardRecallSafety(exerciseCard(exercise)).safe) {
    throw new Error(`Studio exercise ${exercise.id} leaks its target in the prompt.`);
  }
}

export interface PersonalSentenceDraft {
  id: string;
  prompt: string;
  english: string;
  source: string;
  confirmed: boolean;
}

export function createPersonalSentence(draft: PersonalSentenceDraft, now: Date): PersonalSentence {
  if (draft.confirmed !== true) throw new Error("Please confirm that the English expression has been checked.");
  const id = requiredText(draft.id, "Sentence ID", 150);
  const prompt = requiredText(draft.prompt, "Scenario", 1_000);
  const english = requiredText(draft.english, "English", 500);
  const source = requiredText(draft.source, "Source", 1_000);
  if (!/[a-z]/i.test(english) || normalizeAnswer(english).split(" ").length < 2) {
    throw new Error("Enter a complete English expression with at least two words.");
  }
  const card: SentenceCard = {
    id, prompt, english, source, acceptableAnswers: [], tags: ["personal"],
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  if (!inspectSentenceCardRecallSafety(card).safe) throw new Error("The scenario must not include the complete English answer.");
  return {
    id, card,
    learningState: completeFirstExposure(undefined, id, now.toISOString()),
    reviewState: createInitialReviewState(id, now),
  };
}

export function recordPersonalRecall(sentence: PersonalSentence, answer: string, revealed: boolean, now: Date) {
  const evaluation = evaluateStudioExercise({
    id: sentence.id, prompt: sentence.card.prompt, target: sentence.card.english,
    acceptableAnswers: sentence.card.acceptableAnswers, stage: "training",
  }, answer);
  const isInstructional = !sentence.learningState.firstPassedAt
    && (sentence.learningState.acquisitionStatus !== "ready-independent" || revealed);
  let learningState = sentence.learningState;
  if (evaluation.outcome === "perfect") {
    learningState = isInstructional
      ? markInstructionalCompletion(sentence.learningState)
      : revealed ? sentence.learningState
        : recordFirstPass(sentence.learningState, sentence.id, "independent-recall", now.toISOString());
  } else if (!sentence.learningState.firstPassedAt) {
    learningState = requireGuidedAcquisition(sentence.learningState);
  }
  const reviewState = !learningState.firstPassedAt
    ? keepInAcquisitionReview(sentence.reviewState, now)
    : sentence.learningState.firstPassedAt && !isReviewDue(sentence.reviewState, now)
      ? sentence.reviewState
    : applyEvaluationToReviewState(sentence.reviewState, evaluation, now, {
        answerWasRevealed: revealed, hadEdits: false,
      });
  return { evaluation, instructional: isInstructional, sentence: { ...sentence, learningState, reviewState } };
}

export function recordPersonalSignal(sentence: PersonalSentence, kind: "revealed" | "skipped", now: Date,
  context: Pick<PracticeTurn, "receivedCorrection" | "reviewFailureRecorded">,
): PersonalSentence {
  const phase = sentence.learningState.firstPassedAt
    ? isReviewDue(sentence.reviewState, now) ? "review-recall" : "voluntary-practice"
    : sentence.learningState.acquisitionStatus === "ready-independent" ? "independent-recall" : "guided-recall";
  const decision = applyPracticeSignalPolicy({
    learningState: sentence.learningState, reviewState: sentence.reviewState,
    turn: { ...createPracticeTurn(sentence.id, sentence.id, phase), ...context }, signalKind: kind, now,
  });
  return { ...sentence, learningState: decision.learningState ?? sentence.learningState, reviewState: decision.reviewState };
}

function requiredText(value: string, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${label} must contain 1–${max} characters.`);
  }
  return value.trim();
}
