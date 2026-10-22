import type { SentenceCard } from "../content/SentenceCard";
import { normalizeAnswer } from "../practice/evaluateAttempt";
import type { LearningStudioDocument, StudioCheckpoint, StudioExercise } from "./LearningStudio";
import { CONTEXT_CUES, REHEARSAL_TASKS, SENTENCE_FAMILIES } from "./studioCatalog";
import { buildWeaknessExercises } from "./weaknessPractice";

export function studioAnswerKeys(exercise: Pick<StudioExercise, "target" | "acceptableAnswers">): string[] {
  return [...new Set([exercise.target, ...exercise.acceptableAnswers].map(normalizeAnswer))].map((answer) => {
    let hash = 0xcbf29ce484222325n;
    for (let index = 0; index < answer.length; index++) {
      hash = BigInt.asUintN(64, (hash ^ BigInt(answer.charCodeAt(index))) * 0x100000001b3n);
    }
    return `answer-v1-${hash.toString(16).padStart(16, "0")}`;
  });
}

export function buildStudioAnswerKeyLookup(cards: readonly SentenceCard[]): ReadonlyMap<string, readonly string[]> {
  const exercises = [
    ...SENTENCE_FAMILIES.flatMap((family) => family.exercises), ...REHEARSAL_TASKS.flatMap((task) => task.steps),
    ...(["articles", "for-since", "be-agreement"] as const).flatMap(buildWeaknessExercises),
  ];
  const lookup = new Map<string, readonly string[]>(exercises.map((exercise) => [exercise.id, studioAnswerKeys(exercise)]));
  // Retired targets keep their original meaning when older backups have no answer keys.
  lookup.set("duration-4", studioAnswerKeys({ target: "I've worked here since Monday.", acceptableAnswers: [] }));
  for (const card of cards) {
    const keys = studioAnswerKeys({ target: card.english, acceptableAnswers: card.acceptableAnswers });
    lookup.set(card.id, keys);
    for (const cue of CONTEXT_CUES.find((set) => set.cardId === card.id)?.cues ?? []) lookup.set(cue.id, keys);
  }
  return lookup;
}

export function resolveStudioAnswerKeys(exerciseId: string, document: LearningStudioDocument,
  lookup: ReadonlyMap<string, readonly string[]>,
): readonly string[] | undefined {
  const personal = document.personalSentences.find((sentence) => sentence.id === exerciseId);
  return personal ? studioAnswerKeys({ target: personal.card.english, acceptableAnswers: personal.card.acceptableAnswers })
    : lookup.get(exerciseId);
}

export function isFirstStudioEncounter(document: LearningStudioDocument, checkpoint: StudioCheckpoint,
  exercise: StudioExercise, lookup: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (checkpoint.submissionCount !== 0) return false;
  const keys = new Set(studioAnswerKeys(exercise));
  const personalKeys = new Map(document.personalSentences.map((sentence) => [sentence.id,
    studioAnswerKeys({ target: sentence.card.english, acceptableAnswers: sentence.card.acceptableAnswers })]));
  const encountered = (previous: { exerciseId: string; answerKeys?: string[] }) => {
    if (previous.exerciseId === exercise.id) return true;
    if (checkpoint.activity === "context") return false;
    const previousKeys = previous.answerKeys ?? personalKeys.get(previous.exerciseId) ?? lookup.get(previous.exerciseId);
    return previousKeys?.some((key) => keys.has(key)) ?? false;
  };
  if (document.attempts.some(encountered)
    || document.signals.some((signal) => !(signal.sessionId === checkpoint.sessionId && signal.exerciseId === exercise.id)
      && encountered(signal))) return false;
  if (checkpoint.activity === "family" && exercise.stage === "held-out"
    && [...personalKeys.values()].some((answers) => answers.some((key) => keys.has(key)))) return false;
  return true;
}
