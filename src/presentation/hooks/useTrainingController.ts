import { useCallback, useEffect, useMemo, useState } from "react";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";
import type { AttemptPreview } from "../../domain/practice/AttemptPreview";
import type { LearningStatus, ReviewState } from "../../domain/review/ReviewState";
import { UtterLoopService, type CourseBundle } from "../../application/UtterLoopService";
import { TrainingSnapshotLoader, type AnalyticsStatus, type TrainingSnapshotLoadState } from "./trainingSnapshotLoader";
import type { LocalDataAccess } from "../../application/ports/LocalDataAccess";
import type { LearningStudioStore } from "../../application/ports/LearningStudioStore";
import { recordStudioCatalogSignal } from "../../application/studio/recordStudioCatalogSignal";
import type { StudioCheckpoint, StudioExercise } from "../../domain/studio/LearningStudio";
import type { TrainingSnapshot } from "../../application/use-cases/getTrainingSnapshot";
import { DexieTrainingRepository } from "../../infrastructure/persistence/dexie/DexieTrainingRepository";
import type { AttemptEvidence } from "../../domain/practice/PracticeAttempt";
import type { VocabularyEntry } from "../../domain/vocabulary/VocabularyEntry";
import type { PracticeAttempt } from "../../domain/practice/PracticeAttempt";
import type { SubmitPracticeAttemptResult } from "../../application/use-cases/submitPracticeAttempt";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type { PracticeSignalContext } from "../../application/use-cases/revealPracticeAnswer";
import { migrateLegacyAppPreferences } from "../../infrastructure/persistence/dexie/migrateLegacyAppPreferences";
import type {
  AppPreferences,
  UtterLoopFullBackup,
} from "../../domain/backup/UtterLoopFullBackup";
import type { FullBackupSummary } from "../../application/use-cases/restoreFullBackup";
import type { PracticeSessionCheckpoint } from "../practice-session";
import {
  practiceScopeKey,
  catalogFingerprint,
  validatePracticeSessionCheckpoint,
  type PracticeSessionScope,
} from "../practice-session";
import {
  PracticeSessionLifecycle,
  PRACTICE_SESSION_RESUME_MAX_AGE_MS,
  type CommitPracticeSessionCheckpointInput,
  type CommitPracticeSessionTerminalInput,
  type OpenPracticeSessionInput,
} from "../../application/practice-session/PracticeSessionLifecycle";
import { createLocalId } from "../../application/createLocalId";
import type {
  PracticeSessionCheckpointCommitResult,
  PracticeSessionTerminalCommitResult,
} from "../../application/ports/PracticeSessionStore";
import type { PracticeSessionCheckpointV2 } from "../../application/practice-session/PracticeSessionCheckpoint";
import type { PracticeSessionEvidence } from "../../domain/practice/PracticeSessionEvidence";

type ControllerStatus = "loading" | "ready" | "write-error" | "error";
export type PersistenceHealth = "saved" | "attention";

export function createPersistenceCommandRunner(
  onHealthChange: (health: PersistenceHealth) => void,
) {
  const failedCommands = new Set<string>();

  return async function runPersistenceCommand<T>(
    commandKey: string,
    command: () => Promise<T> | T,
  ): Promise<T> {
    try {
      const result = await command();
      failedCommands.delete(commandKey);
      onHealthChange(failedCommands.size === 0 ? "saved" : "attention");
      return result;
    } catch (caught) {
      failedCommands.add(commandKey);
      onHealthChange("attention");
      throw caught;
    }
  };
}

export type SubmitResult = SubmitPracticeAttemptResult;

export interface ActivePracticeSessionSummary {
  scope: PracticeSessionScope;
  scopeKey: string;
  schemaVersion: 1 | 2;
  sessionId?: string;
  entryPoint?: "standard" | "quick-start-v1";
  engagedAt?: string | null;
}

export interface TrainingController extends Partial<LocalDataAccess> {
  readonly learningStudioStore: LearningStudioStore;
  getAllPracticeLog(): Promise<PracticeLogEntry[]>;
  recordStudioCatalogSignal(checkpoint: StudioCheckpoint, exercise: StudioExercise, kind: "revealed" | "skipped"): Promise<unknown>;
  snapshot: TrainingSnapshot | null;
  analyticsStatus: AnalyticsStatus;
  analyticsError: string | null;
  loadAnalytics(options?: { force?: boolean }): Promise<void>;
  status: ControllerStatus;
  error: string | null;
  refresh(): Promise<void>;
  retryStartup(): Promise<void>;
  submitAttempt(
    cardId: string,
    answer: string,
    evidence: AttemptEvidence,
  ): Promise<SubmitResult>;
  submitPracticeTurn(attempt: PracticeAttempt): Promise<SubmitResult>;
  completeFirstExposure(cardId: string): Promise<SentenceLearningState>;
  setReviewLearningStatus(cardId: string, status: LearningStatus): Promise<ReviewState>;
  setVocabularyStatus(cardId: string, isSaved: boolean): Promise<VocabularyEntry | null>;
  skipPracticeCard(
    cardId: string,
    evidence: AttemptEvidence,
    context?: PracticeSignalContext,
  ): Promise<ReviewState>;
  revealPracticeAnswer(
    cardId: string,
    evidence: AttemptEvidence,
    context?: PracticeSignalContext,
  ): Promise<ReviewState>;
  recordPracticeSupport(
    cardId: string,
    evidence: AttemptEvidence,
    context?: PracticeSignalContext,
  ): Promise<ReviewState>;
  previewAttempt(card: SentenceCard, answer: string): AttemptPreview;
  exportCourseBundle(): Promise<CourseBundle>;
  importCourseBundle(bundle: CourseBundle): Promise<void>;
  restoreDefaultCourses(): Promise<void>;
  resetLearningProgress(): Promise<void>;
  clearAll(): Promise<void>;
  updateAppPreferences(patch: Partial<AppPreferences>): Promise<AppPreferences>;
  exportFullBackup(): Promise<UtterLoopFullBackup>;
  getPracticeTurnEvidence?(turnId: string): Promise<PracticeLogEntry[]>;
  restoreFullBackup(value: unknown): Promise<FullBackupSummary>;
  getPracticeSessionCheckpoint(): Promise<PracticeSessionCheckpoint | undefined>;
  savePracticeSessionCheckpoint(checkpoint: PracticeSessionCheckpoint): Promise<void>;
  deletePracticeSessionCheckpoint(): Promise<void>;
  getActivePracticeSession(): Promise<ActivePracticeSessionSummary | undefined>;
  openPracticeSession(input: OpenPracticeSessionInput): ReturnType<PracticeSessionLifecycle["open"]>;
  commitPracticeSessionCheckpoint(
    input: CommitPracticeSessionCheckpointInput,
  ): Promise<{
    status: PracticeSessionCheckpointCommitResult;
    checkpoint: PracticeSessionCheckpointV2;
  }>;
  commitPracticeSessionTerminal(
    input: CommitPracticeSessionTerminalInput,
  ): Promise<{
    status: PracticeSessionTerminalCommitResult;
    evidence: PracticeSessionEvidence;
  }>;
}

export function useTrainingController(): TrainingController {
  const repository = useMemo(() => new DexieTrainingRepository(), []);
  const service = useMemo(() => new UtterLoopService(repository), [repository]);
  const initializeDataAccess = useCallback(() => repository.initializeDataAccess(), [repository]);
  const acquirePracticeOwnership = useCallback(
    (options?: { takeOver?: boolean }) => repository.acquirePracticeOwnership(options),
    [repository],
  );
  const renewPracticeOwnership = useCallback(
    (token: string) => repository.renewPracticeOwnership(token), [repository],
  );
  const releasePracticeOwnership = useCallback(
    (token: string) => repository.releasePracticeOwnership(token), [repository],
  );
  const getAllPracticeLog = useCallback(() => repository.listAllPracticeLog(), [repository]);
  const practiceSessionLifecycle = useMemo(() => new PracticeSessionLifecycle(repository, {
    now: () => new Date(),
    createId: (kind) => createLocalId(kind),
  }), [repository]);
  const [snapshotState, setSnapshotState] = useState<TrainingSnapshotLoadState>({
    snapshot: null, analyticsStatus: "deferred", analyticsError: null,
  });
  const { snapshot, analyticsStatus, analyticsError } = snapshotState;
  const snapshotLoader = useMemo(
    () => new TrainingSnapshotLoader(service, setSnapshotState),
    [service],
  );
  const [status, setStatus] = useState<ControllerStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [persistenceHealth, setPersistenceHealth] = useState<PersistenceHealth>("saved");
  const runPersistenceCommand = useMemo(
    () => createPersistenceCommandRunner(setPersistenceHealth),
    [],
  );

  const refresh = useCallback(() => snapshotLoader.refresh(), [snapshotLoader]);
  const loadAnalytics = useCallback(
    (options?: { force?: boolean }) => snapshotLoader.loadAnalytics(options), [snapshotLoader],
  );

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setStatus("loading");
        await repository.initializeDataAccess();
        await migrateBrowserPreferences(repository);
        await service.ensureDefaultCatalog();
        await snapshotLoader.refresh();

        if (isMounted) {
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
      snapshotLoader.cancel();
    };
  }, [repository, service, snapshotLoader]);

  const retryStartup = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      await repository.initializeDataAccess();
      await migrateBrowserPreferences(repository);
      await service.ensureDefaultCatalog();
      await snapshotLoader.refresh({ invalidateFocused: true });
      setStatus("ready");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Unable to load UtterLoop data.");
    }
  }, [repository, service, snapshotLoader]);

  const submitAttempt = useCallback(
    async (
      cardId: string,
      answer: string,
      evidence: AttemptEvidence,
    ) => {
      return runPersistenceCommand(`attempt:${cardId}`, async () => {
        const result = await service.submitAttempt(cardId, answer, evidence);
        await refresh();
        return result;
      });
    },
    [refresh, runPersistenceCommand, service],
  );

  const submitPracticeTurn = useCallback(async (attempt: PracticeAttempt) => {
    return runPersistenceCommand(`attempt:${attempt.cardId}`, async () => {
      const result = await service.submitPracticeTurn(attempt);
      await refresh();
      return result;
    });
  }, [refresh, runPersistenceCommand, service]);

  const completeFirstExposure = useCallback(async (cardId: string) => {
    return runPersistenceCommand(`first-exposure:${cardId}`, async () => {
      const learningState = await service.completeFirstExposure(cardId);
      await refresh();
      return learningState;
    });
  }, [refresh, runPersistenceCommand, service]);

  const setReviewLearningStatus = useCallback(
    async (cardId: string, learningStatus: LearningStatus) => {
      return runPersistenceCommand(`review-status:${cardId}`, async () => {
        const reviewState = await service.setReviewLearningStatus(cardId, learningStatus);
        await refresh();
        return reviewState;
      });
    },
    [refresh, runPersistenceCommand, service],
  );

  const recordCatalogSignal = useCallback(async (checkpoint: StudioCheckpoint, exercise: StudioExercise,
    kind: "revealed" | "skipped",
  ) => {
    const sourceCardId = exercise.sourceCardId;
    if (!sourceCardId) throw new Error("This Studio expression has no catalog sentence.");
    return runPersistenceCommand(`studio-signal:${checkpoint.sessionId}:${exercise.id}:${kind}`, async () => {
      const result = await recordStudioCatalogSignal(repository, checkpoint, exercise.id, sourceCardId, kind, new Date());
      await refresh();
      return result;
    });
  }, [refresh, repository, runPersistenceCommand]);

  const setVocabularyStatus = useCallback(
    async (cardId: string, isSaved: boolean) => {
      return runPersistenceCommand(`vocabulary:${cardId}`, async () => {
        const entry = await service.setVocabularyStatus(cardId, isSaved);
        await refresh();
        return entry;
      });
    },
    [refresh, runPersistenceCommand, service],
  );

  const skipCard = useCallback(
    async (
      cardId: string,
      evidence: AttemptEvidence,
      context?: PracticeSignalContext,
    ) => {
      return runPersistenceCommand(`skip:${cardId}`, async () => {
        const reviewState = await service.skipPracticeCard(cardId, evidence, new Date(), context);
        await refresh();
        return reviewState;
      });
    },
    [refresh, runPersistenceCommand, service],
  );

  const revealAnswer = useCallback(
    async (
      cardId: string,
      evidence: AttemptEvidence,
      context?: PracticeSignalContext,
    ) => {
      return runPersistenceCommand(`answer-reveal:${cardId}`, async () => {
        const reviewState = await service.revealPracticeAnswer(cardId, evidence, new Date(), context);
        await refresh();
        return reviewState;
      });
    },
    [refresh, runPersistenceCommand, service],
  );

  const recordSupport = useCallback(
    async (
      cardId: string,
      evidence: AttemptEvidence,
      context?: PracticeSignalContext,
    ) => {
      return runPersistenceCommand(`recall-support:${cardId}`, async () => {
        const reviewState = await service.recordPracticeSupport(cardId, evidence, new Date(), context);
        await refresh();
        return reviewState;
      });
    },
    [refresh, runPersistenceCommand, service],
  );

  const exportCourseBundle = useCallback(() => service.exportCourseBundle(), [service]);

  const importCourseBundle = useCallback(
    async (bundle: CourseBundle) => {
      await runPersistenceCommand("course-catalog", async () => {
        await service.importCourseBundle(bundle);
        await snapshotLoader.refresh({ invalidateFocused: true });
      });
    },
    [refresh, runPersistenceCommand, service],
  );

  const restoreDefaultCourses = useCallback(async () => {
    await runPersistenceCommand("course-catalog", async () => {
      await service.restoreDefaultCourses();
      await snapshotLoader.refresh({ invalidateFocused: true });
    });
  }, [refresh, runPersistenceCommand, service]);

  const resetLearningProgress = useCallback(async () => {
    await runPersistenceCommand("learning-progress", async () => {
      await service.clearLearningProgress();
      await snapshotLoader.refresh({ invalidateFocused: true });
    });
  }, [refresh, runPersistenceCommand, service]);

  const clearAll = useCallback(async () => {
    await runPersistenceCommand("all-local-data", async () => {
      await service.clearAll();
      await snapshotLoader.refresh({ invalidateFocused: true });
    });
  }, [refresh, runPersistenceCommand, service]);

  const updatePreferences = useCallback(async (patch: Partial<AppPreferences>) => {
    const commandKey = `preferences:${Object.keys(patch).sort().join(",")}`;
    return runPersistenceCommand(commandKey, async () => {
      const preferences = await service.updateAppPreferences(patch);
      await refresh();
      return preferences;
    });
  }, [refresh, runPersistenceCommand, service]);

  const restoreBackup = useCallback(async (value: unknown) => {
    return runPersistenceCommand("full-backup", async () => {
      const summary = await service.restoreFullBackup(value);
      await snapshotLoader.refresh({ invalidateFocused: true });
      return summary;
    });
  }, [refresh, runPersistenceCommand, service]);

  return {
    learningStudioStore: repository,
    getAllPracticeLog,
    recordStudioCatalogSignal: recordCatalogSignal,
    snapshot,
    analyticsStatus,
    analyticsError,
    loadAnalytics,
    initializeDataAccess,
    acquirePracticeOwnership,
    renewPracticeOwnership,
    releasePracticeOwnership,
    status: status === "ready" && persistenceHealth === "attention" ? "write-error" : status,
    error,
    refresh,
    retryStartup,
    submitAttempt,
    submitPracticeTurn,
    completeFirstExposure,
    setReviewLearningStatus,
    setVocabularyStatus,
    skipPracticeCard: skipCard,
    revealPracticeAnswer: revealAnswer,
    recordPracticeSupport: recordSupport,
    previewAttempt: (card, answer) => service.previewAttempt(card, answer),
    exportCourseBundle,
    importCourseBundle,
    restoreDefaultCourses,
    resetLearningProgress,
    clearAll,
    updateAppPreferences: updatePreferences,
    exportFullBackup: () => service.exportFullBackup(),
    getPracticeTurnEvidence: (turnId) => repository.listPracticeLogForTurn(turnId),
    restoreFullBackup: restoreBackup,
    getPracticeSessionCheckpoint: () => service.getPracticeSessionCheckpoint(),
    savePracticeSessionCheckpoint: (checkpoint) => runPersistenceCommand(
      "practice-checkpoint",
      () => service.savePracticeSessionCheckpoint(checkpoint),
    ),
    deletePracticeSessionCheckpoint: () => runPersistenceCommand(
      "practice-checkpoint",
      () => service.deletePracticeSessionCheckpoint(),
    ),
    getActivePracticeSession: async () => {
      const validation = validatePracticeSessionCheckpoint(
        await service.getPracticeSessionCheckpoint(),
      );
      if (!validation.ok) return undefined;
      const checkpoint = validation.checkpoint;
      if (checkpoint.scopeKey !== practiceScopeKey(checkpoint.scope)) return undefined;
      if (Date.now() - Date.parse(checkpoint.updatedAt) > PRACTICE_SESSION_RESUME_MAX_AGE_MS) {
        return undefined;
      }
      if (snapshot) {
        const masteredCardIds = new Set(snapshot.reviewStates
          .filter((state) => state.learningStatus === "mastered")
          .map((state) => state.cardId));
        if (checkpoint.itinerary.some((occurrence) => masteredCardIds.has(occurrence.cardId))
          || checkpoint.stats.pendingReturns.some(
            (pending) => masteredCardIds.has(pending.occurrence.cardId),
          )) {
          return undefined;
        }
        try {
          const currentFingerprint = catalogFingerprint(checkpoint.scope, {
            courses: snapshot.courses,
            cards: snapshot.cards,
          });
          if (currentFingerprint !== checkpoint.catalogFingerprint) return undefined;
        } catch {
          return undefined;
        }
      }
      return {
        scope: structuredClone(checkpoint.scope),
        scopeKey: checkpoint.scopeKey,
        schemaVersion: checkpoint.schemaVersion,
        ...(checkpoint.schemaVersion === 2
          ? {
              sessionId: checkpoint.sessionId,
              entryPoint: checkpoint.entryPoint,
              engagedAt: checkpoint.engagedAt,
            }
          : {}),
      };
    },
    openPracticeSession: (input) => runPersistenceCommand(
      "practice-session-lifecycle",
      () => practiceSessionLifecycle.open(input),
    ),
    commitPracticeSessionCheckpoint: (input) => runPersistenceCommand(
      "practice-session-lifecycle",
      () => practiceSessionLifecycle.commit(input),
    ),
    commitPracticeSessionTerminal: (input) => runPersistenceCommand(
      "practice-session-lifecycle",
      () => practiceSessionLifecycle.commit(input),
    ),
  };
}

async function migrateBrowserPreferences(repository: DexieTrainingRepository): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const storage = {
    getItem(key: string): string | null {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    removeItem(key: string): void {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // The durable preference already succeeded; inaccessible legacy storage
        // can be retried harmlessly on the next startup.
      }
    },
  };

  await migrateLegacyAppPreferences({
    storage,
    load: () => repository.getAppPreferences(),
    save: (preferences) => repository.saveAppPreferences(preferences),
  });
}
