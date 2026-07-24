import { useCallback, useEffect, useMemo, useState } from "react";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { AttemptPreview } from "../../domain/practice/AttemptPreview";
import type { AnswerEvaluation } from "../../domain/practice/AnswerEvaluation";
import type { LearningStatus, ReviewState } from "../../domain/review/ReviewState";
import { UtterLoopService, type CourseBundle } from "../../application/UtterLoopService";
import type { TrainingSnapshot } from "../../application/use-cases/getTrainingSnapshot";
import { DexieTrainingRepository } from "../../infrastructure/persistence/dexie/DexieTrainingRepository";
import type { AttemptEvidence } from "../../domain/practice/PracticeAttempt";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";

type ControllerStatus = "loading" | "ready" | "error";

export interface SubmitResult {
  evaluation: AnswerEvaluation;
  reviewState: ReviewState;
}

export interface TrainingController {
  snapshot: TrainingSnapshot | null;
  status: ControllerStatus;
  error: string | null;
  refresh(): Promise<void>;
  submitAttempt(
    cardId: string,
    answer: string,
    evidence: AttemptEvidence,
  ): Promise<SubmitResult>;
  setReviewLearningStatus(cardId: string, status: LearningStatus): Promise<ReviewState>;
  setVocabularyStatus(cardId: string, isSaved: boolean): Promise<VocabularyEntry | null>;
  skipPracticeCard(
    cardId: string,
    evidence: AttemptEvidence,
  ): Promise<ReviewState>;
  revealPracticeAnswer(
    cardId: string,
    evidence: AttemptEvidence,
  ): Promise<ReviewState>;
  previewAttempt(card: SentenceCard, answer: string): AttemptPreview;
  exportCourseBundle(): Promise<CourseBundle>;
  importCourseBundle(bundle: CourseBundle): Promise<void>;
  restoreDefaultCourses(): Promise<void>;
  resetLearningProgress(): Promise<void>;
  clearAll(): Promise<void>;
}

export function useTrainingController(): TrainingController {
  const service = useMemo(() => new UtterLoopService(new DexieTrainingRepository()), []);
  const [snapshot, setSnapshot] = useState<TrainingSnapshot | null>(null);
  const [status, setStatus] = useState<ControllerStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const nextSnapshot = await service.getSnapshot();
    setSnapshot(nextSnapshot);
  }, [service]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setStatus("loading");
        await service.ensureDefaultCatalog();
        const nextSnapshot = await service.getSnapshot();

        if (isMounted) {
          setSnapshot(nextSnapshot);
          setStatus("ready");
          setError(null);
        }
      } catch (caught) {
        if (isMounted) {
          setStatus("error");
          setError(caught instanceof Error ? caught.message : "Unable to load UtterLoop data.");
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [service]);

  const submitAttempt = useCallback(
    async (
      cardId: string,
      answer: string,
      evidence: AttemptEvidence,
    ) => {
      const result = await service.submitAttempt(cardId, answer, evidence);
      await refresh();
      return result;
    },
    [refresh, service],
  );

  const setReviewLearningStatus = useCallback(
    async (cardId: string, learningStatus: LearningStatus) => {
      const reviewState = await service.setReviewLearningStatus(cardId, learningStatus);
      await refresh();
      return reviewState;
    },
    [refresh, service],
  );

  const setVocabularyStatus = useCallback(
    async (cardId: string, isSaved: boolean) => {
      const entry = await service.setVocabularyStatus(cardId, isSaved);
      await refresh();
      return entry;
    },
    [refresh, service],
  );

  const skipCard = useCallback(
    async (
      cardId: string,
      evidence: AttemptEvidence,
    ) => {
      const reviewState = await service.skipPracticeCard(cardId, evidence);
      await refresh();
      return reviewState;
    },
    [refresh, service],
  );

  const revealAnswer = useCallback(
    async (
      cardId: string,
      evidence: AttemptEvidence,
    ) => {
      const reviewState = await service.revealPracticeAnswer(cardId, evidence);
      await refresh();
      return reviewState;
    },
    [refresh, service],
  );

  const exportCourseBundle = useCallback(() => service.exportCourseBundle(), [service]);

  const importCourseBundle = useCallback(
    async (bundle: CourseBundle) => {
      await service.importCourseBundle(bundle);
      await refresh();
    },
    [refresh, service],
  );

  const restoreDefaultCourses = useCallback(async () => {
    await service.restoreDefaultCourses();
    await refresh();
  }, [refresh, service]);

  const resetLearningProgress = useCallback(async () => {
    await service.clearLearningProgress();
    await refresh();
  }, [refresh, service]);

  const clearAll = useCallback(async () => {
    await service.clearAll();
    await refresh();
  }, [refresh, service]);

  return {
    snapshot,
    status,
    error,
    refresh,
    submitAttempt,
    setReviewLearningStatus,
    setVocabularyStatus,
    skipPracticeCard: skipCard,
    revealPracticeAnswer: revealAnswer,
    previewAttempt: (card, answer) => service.previewAttempt(card, answer),
    exportCourseBundle,
    importCourseBundle,
    restoreDefaultCourses,
    resetLearningProgress,
    clearAll,
  };
}
