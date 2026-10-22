import type { LearningStudioStore } from "../ports/LearningStudioStore";
import type { PersonalSentenceDraft } from "../../domain/studio/studioRules";
import { createPersonalSentence, evaluateStudioExercise, recordPersonalRecall, recordPersonalSignal } from "../../domain/studio/studioRules";
import { normalizeAnswer } from "../../domain/practice/evaluateAttempt";
import { buildStudioAnswerKeyLookup, isFirstStudioEncounter, resolveStudioAnswerKeys, studioAnswerKeys } from "../../domain/studio/studioExposure";
import { defaultCatalog } from "../seed/defaultCatalog";
import type {
  FluencyResult, LearningStudioDocument, StudioAttempt, StudioCheckpoint, StudioExercise,
} from "../../domain/studio/LearningStudio";

const authoredAnswerKeys = buildStudioAnswerKeyLookup(defaultCatalog.cards);

export class LearningStudioService {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: LearningStudioStore, private readonly now: () => Date = () => new Date()) {}

  read(): Promise<LearningStudioDocument> {
    return this.store.readLearningStudio();
  }

  savePersonal(draft: PersonalSentenceDraft, previousId?: string): Promise<LearningStudioDocument> {
    return this.mutate((document) => {
      const created = createPersonalSentence(draft, this.now());
      const previous = previousId ? document.personalSentences.find((sentence) => sentence.id === previousId) : undefined;
      if (previousId && !previous) throw new Error("This personal sentence was removed. Reload the inbox before editing.");
      if (document.personalSentences.some((sentence) => sentence.id !== previousId
        && normalizeAnswer(sentence.card.english) === normalizeAnswer(created.card.english))) {
        throw new Error("This English expression is already in your personal inbox.");
      }
      if (previous && previous.card.english === created.card.english) {
        created.id = previous.id;
        created.card = { ...created.card, id: previous.id, createdAt: previous.card.createdAt };
        created.learningState = previous.learningState;
        created.reviewState = previous.reviewState;
      } else if (previous && previous.id === created.id) {
        throw new Error("Changing the target sentence requires a new sentence identity.");
      }
      const closesSession = Boolean(previous && document.checkpoint?.activity === "personal"
        && document.checkpoint.exerciseIds.includes(previous.id));
      return { ...document, personalSentences: [
        ...document.personalSentences.filter((sentence) => sentence.id !== previousId), created,
      ], checkpoint: closesSession ? null : document.checkpoint,
        closedSessionIds: closesSession ? [...document.closedSessionIds, document.checkpoint!.sessionId] : document.closedSessionIds,
      };
    });
  }

  removePersonal(id: string): Promise<LearningStudioDocument> {
    return this.mutate((document) => {
      const closesSession = document.checkpoint?.activity === "personal" && document.checkpoint.exerciseIds.includes(id);
      return { ...document,
        personalSentences: document.personalSentences.filter((sentence) => sentence.id !== id),
        checkpoint: closesSession ? null : document.checkpoint,
        closedSessionIds: closesSession ? [...document.closedSessionIds, document.checkpoint!.sessionId] : document.closedSessionIds,
      };
    });
  }

  saveCheckpoint(checkpoint: StudioCheckpoint | null): Promise<LearningStudioDocument> {
    return this.mutate((document) => {
      if (!checkpoint) throw new Error("Finish or discard the identified Studio session explicitly.");
      if (document.closedSessionIds.includes(checkpoint.sessionId)) throw new Error("This Studio session has already ended.");
      if (document.checkpoint && document.checkpoint.sessionId !== checkpoint.sessionId) {
        throw new Error("Resume or discard your current Studio session before starting another.");
      }
      if (document.checkpoint && checkpoint.revision <= document.checkpoint.revision) return document;
      return { ...document, checkpoint };
    });
  }

  finishSession(sessionId: string): Promise<LearningStudioDocument> {
    return this.mutate((document) => {
      if (document.closedSessionIds.includes(sessionId)) return document;
      if (document.checkpoint?.sessionId !== sessionId) throw new Error("The active Studio session has changed.");
      return { ...document, checkpoint: null, closedSessionIds: [...document.closedSessionIds, sessionId] };
    });
  }

  submit(input: {
    id: string; checkpoint: StudioCheckpoint; exercise: StudioExercise;
    answer: string; durationMs: number;
  }): Promise<LearningStudioDocument> {
    return this.mutate((document) => {
      if (document.attempts.some((attempt) => attempt.id === input.id)) return document;
      if (document.checkpoint?.sessionId !== input.checkpoint.sessionId
        || document.checkpoint.index !== input.checkpoint.index
        || document.checkpoint.exerciseIds[document.checkpoint.index] !== input.exercise.id
        || document.checkpoint.revision > input.checkpoint.revision
        || document.closedSessionIds.includes(input.checkpoint.sessionId)) {
        throw new Error("The active Studio exercise has changed. Reload before submitting.");
      }
      if (input.checkpoint.exerciseIds[input.checkpoint.index] !== input.exercise.id) {
        throw new Error("The submitted exercise does not match the active Studio session.");
      }
      if (!Number.isFinite(input.durationMs) || input.durationMs < 0) throw new Error("Invalid exercise duration.");
      const evaluation = evaluateStudioExercise(input.exercise, input.answer);
      const submittedAt = this.now().toISOString();
      const attempt: StudioAttempt = {
        id: input.id, sessionId: input.checkpoint.sessionId, activity: input.checkpoint.activity,
        groupId: input.checkpoint.groupId, exerciseId: input.exercise.id,
        ...(input.exercise.sourceCardId ? { sourceCardId: input.exercise.sourceCardId } : {}),
        stage: input.exercise.stage, outcome: evaluation.outcome, accuracy: evaluation.accuracy,
        submittedAt, durationMs: input.durationMs, answerWasRevealed: input.checkpoint.answerWasRevealed,
        firstSubmission: input.checkpoint.submissionCount === 0,
        firstEncounter: isFirstStudioEncounter(document, input.checkpoint, input.exercise, authoredAnswerKeys),
        answerKeys: studioAnswerKeys(input.exercise),
      };
      let personalSentences = document.personalSentences;
      if (input.checkpoint.activity === "personal") {
        const sentence = document.personalSentences.find((candidate) => candidate.id === input.exercise.id);
        if (!sentence) throw new Error("This personal sentence is no longer available.");
        const result = recordPersonalRecall(sentence, input.answer, input.checkpoint.answerWasRevealed, this.now());
        personalSentences = document.personalSentences.map((candidate) => candidate.id === sentence.id ? result.sentence : candidate);
      }
      return { ...document, personalSentences, attempts: [...document.attempts, attempt], checkpoint: {
        ...input.checkpoint, phase: "result", draft: input.answer,
        revision: input.checkpoint.revision + 1,
        submissionCount: input.checkpoint.submissionCount + 1, updatedAt: submittedAt,
      } };
    });
  }

  saveFluency(result: FluencyResult): Promise<LearningStudioDocument> {
    return this.mutate((document) => document.fluencyResults.some((entry) => entry.id === result.id)
      ? document : { ...document, fluencyResults: [...document.fluencyResults, result] });
  }

  recordSignal(checkpoint: StudioCheckpoint, kind: "revealed" | "skipped"): Promise<LearningStudioDocument> {
    return this.mutate((document) => {
      const active = document.checkpoint;
      if (!active || active.sessionId !== checkpoint.sessionId || active.index !== checkpoint.index
        || active.revision > checkpoint.revision
        || document.closedSessionIds.includes(checkpoint.sessionId)) throw new Error("The active Studio exercise has changed.");
      const exerciseId = checkpoint.exerciseIds[checkpoint.index];
      const id = `${checkpoint.sessionId}:${checkpoint.index}:${kind}`;
      if (document.signals.some((signal) => signal.id === id)) return document;
      const at = this.now();
      const answerKeys = resolveStudioAnswerKeys(exerciseId, document, authoredAnswerKeys);
      let personalSentences = document.personalSentences;
      if (checkpoint.activity === "personal") {
        const sentence = personalSentences.find((candidate) => candidate.id === exerciseId);
        if (!sentence) throw new Error("This personal sentence is no longer available.");
        const updated = recordPersonalSignal(sentence, kind, at, {
          receivedCorrection: checkpoint.submissionCount > 0,
          reviewFailureRecorded: document.signals.some((signal) => signal.sessionId === checkpoint.sessionId
            && signal.exerciseId === exerciseId),
        });
        personalSentences = personalSentences.map((candidate) => candidate.id === exerciseId ? updated : candidate);
      }
      return { ...document, personalSentences, signals: [...document.signals, {
        id, sessionId: checkpoint.sessionId, activity: checkpoint.activity, exerciseId,
        kind, at: at.toISOString(),
        ...(answerKeys ? { answerKeys: [...answerKeys] } : {}),
      }], checkpoint: { ...checkpoint, revision: Math.max(active.revision, checkpoint.revision) + 1,
        answerWasRevealed: checkpoint.answerWasRevealed || kind === "revealed",
      } };
    });
  }

  private mutate(change: (document: LearningStudioDocument) => LearningStudioDocument): Promise<LearningStudioDocument> {
    const operation = this.pending.then(async () => {
      const document = await this.store.readLearningStudio();
      const next = change(document);
      return next === document ? document : this.store.saveLearningStudio(next, document.revision);
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
