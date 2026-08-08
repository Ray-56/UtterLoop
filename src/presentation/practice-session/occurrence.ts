import type { PracticePhase } from "../../domain/practice/PracticeTurn";
import type {
  PracticeSessionScope,
  ResolvedPracticeOccurrence,
} from "./model";
import { practiceScopeKey } from "./practiceScopeKey";

export interface CreateResolvedPracticeOccurrenceInput {
  scope: PracticeSessionScope;
  cardId: string;
  originalIndex: number;
  returnIndex?: number;
  phase: PracticePhase;
  courseId?: string;
  unitId?: string;
  lessonId?: string;
}

export function practiceOccurrenceId(
  scope: PracticeSessionScope,
  cardId: string,
  originalIndex: number,
  returnIndex: number,
): string {
  assertIndex(originalIndex, "originalIndex");
  assertIndex(returnIndex, "returnIndex");
  const scopeHash = hashIdentity(practiceScopeKey(scope));
  return `occ-v1-${scopeHash}-${encodeURIComponent(cardId)}-${originalIndex}-r${returnIndex}`;
}

export function createResolvedPracticeOccurrence(
  input: CreateResolvedPracticeOccurrenceInput,
): ResolvedPracticeOccurrence {
  const returnIndex = input.returnIndex ?? 0;
  const id = practiceOccurrenceId(input.scope, input.cardId, input.originalIndex, returnIndex);
  return {
    id,
    cardId: input.cardId,
    originalIndex: input.originalIndex,
    returnIndex,
    ...(input.courseId ? { courseId: input.courseId } : {}),
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.lessonId ? { lessonId: input.lessonId } : {}),
    status: "ready",
    turn: {
      turnId: `turn:${id}`,
      phase: input.phase,
      supportLevelUsed: 0,
      supportKindsUsed: [],
      receivedCorrection: false,
      reviewFailureRecorded: false,
      submissionIndex: 0,
    },
  };
}

export function createReturnOccurrence(
  scope: PracticeSessionScope,
  source: ResolvedPracticeOccurrence,
  returnIndex: number,
): ResolvedPracticeOccurrence {
  return createResolvedPracticeOccurrence({
    scope,
    cardId: source.cardId,
    originalIndex: source.originalIndex,
    returnIndex,
    phase: "independent-recall",
    courseId: source.courseId,
    unitId: source.unitId,
    lessonId: source.lessonId,
  });
}

function hashIdentity(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash, 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function assertIndex(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer.`);
}
