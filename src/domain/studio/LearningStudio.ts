import type { SentenceCard } from "../content/SentenceCard";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import type { ReviewState } from "../review/ReviewState";
import type { EvaluationOutcome } from "../practice/AnswerEvaluation";

export type StudioActivity = "context" | "family" | "mission" | "personal" | "weakness";
export type ExerciseStage = "training" | "held-out";

export interface StudioExercise {
  id: string;
  prompt: string;
  target: string;
  acceptableAnswers: string[];
  stage: ExerciseStage;
  sourceCardId?: string;
}

export interface ContextCueSet {
  cardId: string;
  cues: Array<{ id: string; prompt: string; stage: ExerciseStage }>;
}

export interface SentenceFamily {
  id: string;
  title: string;
  pattern: string;
  explanation: string;
  exercises: StudioExercise[];
}

export interface RehearsalTask {
  id: string;
  title: string;
  description: string;
  steps: StudioExercise[];
}

export interface PersonalSentence {
  id: string;
  card: SentenceCard;
  learningState: SentenceLearningState;
  reviewState: ReviewState;
}

export interface StudioAttempt {
  id: string;
  sessionId: string;
  activity: StudioActivity;
  groupId: string;
  exerciseId: string;
  sourceCardId?: string;
  stage: ExerciseStage;
  outcome: EvaluationOutcome;
  accuracy: number;
  submittedAt: string;
  durationMs: number;
  answerWasRevealed: boolean;
  firstSubmission: boolean;
  firstEncounter: boolean;
  answerKeys?: string[];
}

export interface StudioSignal {
  id: string;
  sessionId: string;
  activity: StudioActivity;
  exerciseId: string;
  kind: "revealed" | "skipped";
  at: string;
  answerKeys?: string[];
}

export interface PhysicalKeyAggregate {
  code: string;
  presses: number;
  mismatches: number;
}

export interface FluencyResult {
  id: string;
  sourceCardId: string;
  source: "correct" | "corrected" | "revealed" | "learned";
  startedAt: string;
  completedAt: string;
  activeDurationMs: number;
  committedCharacters: number;
  correctCharacters: number;
  uncorrectedErrors: number;
  backspaces: number;
  pauseCount: number;
  longestPauseMs: number;
  netWpm: number;
  characterAccuracy: number;
  physicalKeys: PhysicalKeyAggregate[];
}

export interface StudioCheckpoint {
  revision: number;
  sessionId: string;
  activity: StudioActivity;
  groupId: string;
  exerciseIds: string[];
  index: number;
  phase: "instruction" | "recall" | "result";
  draft: string;
  selectionStart?: number;
  selectionEnd?: number;
  answerWasRevealed: boolean;
  submissionCount: number;
  updatedAt: string;
}

export interface LearningStudioDocument {
  id: "local";
  schemaVersion: 1;
  revision: number;
  personalSentences: PersonalSentence[];
  attempts: StudioAttempt[];
  signals: StudioSignal[];
  fluencyResults: FluencyResult[];
  closedSessionIds: string[];
  checkpoint: StudioCheckpoint | null;
}

export function emptyLearningStudio(): LearningStudioDocument {
  return {
    id: "local", schemaVersion: 1, revision: 0,
    personalSentences: [], attempts: [], signals: [], fluencyResults: [], closedSessionIds: [], checkpoint: null,
  };
}
