import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  BookOpenCheck,
  CheckCircle2,
  CheckCheck,
  CornerDownLeft,
  Eye,
  EyeOff,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume1,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import type { AttemptPreview, AttemptPreviewToken } from "../../domain/practice/AttemptPreview";
import {
  buildCorrectionDraft,
  buildCorrectionPreview,
  buildEvaluationPreview,
  CORRECTION_SLOT_PLACEHOLDER,
} from "../../domain/practice/buildAttemptPreview";
import {
  resolveNextLessonAction,
  type NextLessonAction,
} from "../../domain/curriculum/resolveNextLessonAction";
import {
  hasFirstPass,
  type SentenceLearningState,
} from "../../domain/learning/SentenceLearningState";
import {
  applyRecallSupport,
  createPracticeTurn,
  type PracticePhase,
  type PracticeTurn,
  type RecallSupportKind,
  type RecallSupportLevel,
} from "../../domain/practice/PracticeTurn";
import {
  buildPracticeSession,
  type PracticeContext,
  type PracticeScope,
  type PracticeSessionItem,
} from "../../application/use-cases/buildPracticeSession";
import { resolvePracticeTurnForScope } from "../../application/use-cases/resolvePracticeTurnForScope";
import type { SubmitResult, TrainingController } from "../hooks/useTrainingController";
import { useKeyFeedback } from "../hooks/useKeyFeedback";
import { queueSentenceAudioTwice } from "../audio/playSentenceAudio";
import {
  resolveFingerGuideStroke,
  type FingerGuideStroke,
} from "../keyboard/resolveFingerGuideStroke";
import {
  resolveCorrectionSpaceNavigation,
  resolvePracticeKey,
  stabilizeCorrectionDraft,
  type PracticeKeyCommand,
} from "../keyboard/resolvePracticeKey";
import {
  listEnglishSpeechVoices,
  resolvePreferredSpeechVoice,
} from "../preferences/personalizationPreferences";
import { FingerGuide } from "./FingerGuide";
import {
  LearningSupportPanel,
  shouldRecordAudioPlaybackAsRecallSupport,
} from "./LearningSupportPanel";
import { createLocalId } from "../../application/createLocalId";
import type {
  QuickStartItineraryStep,
  QuickStartSession,
} from "../../application/use-cases/buildQuickStartSession";
import { QuickStartGuide } from "./QuickStartGuide";
import { ConfirmationDialog } from "./ConfirmationDialog";
import {
  createWorkbenchPracticeSessionCheckpointSeed,
  practiceLogEntriesToDurableEvidence,
  restoreWorkbenchPracticeSessionCheckpoint,
} from "../practice-session/workbenchCheckpointAdapter";
import type { PracticeSessionCheckpointV2 } from "../../application/practice-session/PracticeSessionCheckpoint";
import { practiceLogContextForOccurrence } from "../../application/practice-session/PracticeSessionCheckpoint";
import { catalogFingerprint } from "../practice-session";
import type {
  PracticeSessionEngagementReason,
  PracticeSessionRoundEvent,
  PracticeSessionCheckpointSeed,
} from "../../application/practice-session/PracticeSessionLifecycle";
import type { PracticeRoundSummary } from "../../domain/practice/PracticeSessionEvidence";
import type { FingerGuideMode } from "../../domain/backup/UtterLoopFullBackup";

interface PracticeWorkbenchProps {
  controller: TrainingController;
  fingerGuideMode: FingerGuideMode;
  keySoundMuted: boolean;
  onCompleteQuickStart(): Promise<void>;
  onContinueRecommended(): void;
  onDismissQuickStart(): Promise<void>;
  onOpenCourse(courseId: string): void;
  onOpenCourses(): void;
  onOpenReview(courseId: string): void;
  onKeySoundMutedChange(isMuted: boolean): Promise<unknown> | unknown;
  onResumeActivePractice(scope: PracticeScope): void;
  onStartLesson(courseId: string, lessonId: string): void;
  quickStartSession: QuickStartSession | null;
  scope: PracticeScope | null;
  speechVoiceUri: string | null;
}

interface StartingRecallCapture {
  draft: string;
  isActive: boolean;
  isComposing: boolean;
  isLifecycleReady: boolean;
  selectionEnd: number;
  selectionStart: number;
}

interface StartingRecallFeedback {
  command: Extract<PracticeKeyCommand, { type: "append" | "delete" }>;
  stroke: FingerGuideStroke | null;
}

type QuickStartCardStep = Exclude<QuickStartItineraryStep, { kind: "explanation" }>;
type WorkbenchSessionItem = PracticeSessionItem & { quickStartStep?: QuickStartCardStep };

export type RecallGrade = "perfect" | "great" | "guided" | "corrected" | "correct-with-answer";

export interface RecallGradeEvidence {
  outcome: SubmitResult["evaluation"]["outcome"];
  phase: PracticePhase;
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: readonly RecallSupportKind[];
  answerWasRevealed: boolean;
  receivedCorrection: boolean;
  submissionIndex: number;
  hadEdits: boolean;
}

export interface SessionStats {
  score: number;
  combo: number;
  maxCombo: number;
  attempts: number;
  perfect: number;
  great: number;
  audioPlays: number;
  revealed: number;
  skipped: number;
  accuracyTotal: number;
}

export type PracticeFailedOperation =
  | {
      kind: "audio-save";
      label: string;
      locksPractice: false;
      message: string;
      retry(): Promise<boolean>;
    }
  | {
      kind: "operation";
      label: string;
      locksPractice: boolean;
      message: string;
      retry(): void;
    };

const COMMANDS_REQUIRING_AUDIO_SAVE = new Set<PracticeKeyCommand["type"]>([
  "mark-mastered",
  "next",
  "previous",
  "retry",
  "skip",
  "toggle-answer",
  "toggle-vocabulary",
]);

export function shouldRetryAudioSaveBeforeCommand(
  command: PracticeKeyCommand["type"],
): boolean {
  return COMMANDS_REQUIRING_AUDIO_SAVE.has(command);
}

export async function retryPendingAudioSave(
  operation: PracticeFailedOperation | null,
): Promise<boolean> {
  return operation?.kind === "audio-save" ? operation.retry() : true;
}

export const EMPTY_SESSION_STATS: SessionStats = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  attempts: 0,
  perfect: 0,
  great: 0,
  audioPlays: 0,
  revealed: 0,
  skipped: 0,
  accuracyTotal: 0,
};

// One app-wide queue keeps a route-unmount save ordered before a fast remount load.
const practiceCheckpointOperationQueue: { current: Promise<void> } = {
  current: Promise.resolve(),
};

export function PracticeWorkbench({
  controller,
  fingerGuideMode,
  keySoundMuted,
  onCompleteQuickStart,
  onContinueRecommended,
  onDismissQuickStart,
  onKeySoundMutedChange,
  onOpenCourse,
  onOpenCourses,
  onOpenReview,
  onResumeActivePractice,
  onStartLesson,
  quickStartSession,
  scope,
  speechVoiceUri,
}: PracticeWorkbenchProps) {
  const [answer, setAnswer] = useState("");
  const [startingRecallCapture, setStartingRecallCapture] = useState<StartingRecallCapture | null>(null);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [lastGrade, setLastGrade] = useState<RecallGrade | null>(null);
  const [itinerary, setItinerary] = useState<WorkbenchSessionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [answerWasRevealed, setAnswerWasRevealed] = useState(false);
  const [hadEdits, setHadEdits] = useState(false);
  const [audioPlayCount, setAudioPlayCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [itemElapsedSeconds, setItemElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats>(EMPTY_SESSION_STATS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [shortcutNotice, setShortcutNotice] = useState<string | null>(null);
  const [caretOffset, setCaretOffset] = useState(0);
  const [selectionEndOffset, setSelectionEndOffset] = useState(0);
  const [correctionAcceptedAnswer, setCorrectionAcceptedAnswer] = useState<string | null>(null);
  const [practiceTurn, setPracticeTurn] = useState<PracticeTurn | null>(null);
  const [submissionIndex, setSubmissionIndex] = useState(0);
  const [returnCounts, setReturnCounts] = useState<Record<string, number>>({});
  const [pendingReturnCount, setPendingReturnCount] = useState(0);
  const [checkpointStatus, setCheckpointStatus] = useState<"loading" | "ready">("loading");
  const [checkpointRecovery, setCheckpointRecovery] = useState<{
    message: string;
    reason: string;
  } | null>(null);
  const [suppressRestoredTarget, setSuppressRestoredTarget] = useState(false);
  const [isRestartDialogOpen, setIsRestartDialogOpen] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [replacementCheckpoint, setReplacementCheckpoint] = useState<PracticeSessionCheckpointV2 | null>(null);
  const [isReplacingSession, setIsReplacingSession] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [failedOperation, setFailedOperation] = useState<PracticeFailedOperation | null>(null);
  const [fingerGuideFeedback, setFingerGuideFeedback] = useState<{
    stroke: FingerGuideStroke | null;
    pulse: number;
  }>({ stroke: null, pulse: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const checkpointLoadKeyRef = useRef<string | null>(null);
  const checkpointReadyRef = useRef(false);
  const latestCheckpointRef = useRef<PracticeSessionCheckpointV2 | null>(null);
  const latestCheckpointSeedRef = useRef<PracticeSessionCheckpointSeed | null>(null);
  const occurrenceIdsRef = useRef<string[]>([]);
  const latestCheckpointIdentityRef = useRef<string | null>(null);
  const terminalCommitStartedRef = useRef(false);
  const terminalCommitPromiseRef = useRef<Promise<void> | null>(null);
  const checkpointSaveTimerRef = useRef<number | null>(null);
  const checkpointCriticalSignatureRef = useRef<string | null>(null);
  const checkpointDraftSignatureRef = useRef<string | null>(null);
  const restoredSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const isMountedRef = useRef(true);
  const turnHistoryRef = useRef<Record<number, {
    turn: PracticeTurn;
    submissionIndex: number;
  }>>({});
  const startingRecallCaptureRef = useRef<StartingRecallCapture | null>(null);
  const startingRecallFeedbackRef = useRef<StartingRecallFeedback | null>(null);
  const fingerGuideStrokeRef = useRef<FingerGuideStroke | null>(null);
  const fingerGuideHomeTimerRef = useRef<number | null>(null);
  const {
    isSoundEnabled,
    isSoundSupported,
    keyPulse,
    soundPreferenceError,
    toggleKeySound,
    triggerKeyFeedback,
  } = useKeyFeedback({ isMuted: keySoundMuted, onMutedChange: onKeySoundMutedChange });
  const snapshot = controller.snapshot;
  const session = useMemo(
    () => snapshot && scope
      ? buildPracticeSession({
          scope: quickStartSession && scope.kind === "lesson"
            ? { ...scope, mode: "replay" }
            : scope,
          courses: snapshot.courses,
          cards: snapshot.cards,
          learningStates: snapshot.sentenceLearningStates,
          reviewStates: snapshot.reviewStates,
          vocabularyEntries: snapshot.vocabularyEntries,
          weakCardIds: new Set(
            snapshot.progressDashboard.needsAttention.weakCards.map((card) => card.cardId),
          ),
          now: new Date(),
        })
      : null,
    [quickStartSession, scope, snapshot],
  );
  const sessionItems: WorkbenchSessionItem[] = itinerary.length > 0
    ? itinerary
    : session?.items ?? [];
  const activeItem = sessionItems[currentIndex];
  const activeQuickStartStep = activeItem?.quickStartStep;
  const practiceAnswer = startingRecallCapture?.draft ?? answer;
  const practiceCaretOffset = startingRecallCapture?.selectionStart ?? caretOffset;
  const isStartingRecallCaptureActive = Boolean(startingRecallCapture?.isActive);
  const preview = activeItem
    ? correctionAcceptedAnswer
      ? buildCorrectionPreview(activeItem.card, correctionAcceptedAnswer, practiceAnswer)
      : controller.previewAttempt(activeItem.card, practiceAnswer)
    : null;
  const displayPreview = lastResult
    ? buildEvaluationPreview(activeItem.card, lastResult.evaluation, practiceAnswer)
    : preview;
  const activeWordIndex = wordIndexAtOffset(
    practiceAnswer,
    practiceCaretOffset,
    preview?.expectedWordCount ?? 0,
  );
  const isInVocabulary = Boolean(
    activeItem && snapshot?.vocabularyEntries.some((entry) => entry.cardId === activeItem.card.id),
  );
  const progress = sessionItems.length
    ? Math.round(
        ((currentIndex + (lastResult?.evaluation.outcome === "perfect" ? 1 : 0)) / sessionItems.length) * 100,
      )
    : session?.completed
      ? 100
      : 0;
  const scopeKey = practiceScopeKey(scope);
  const sessionIdentity = `${scopeKey}:${quickStartSession ? `quick-start-${quickStartSession.version}` : "standard"}:${sessionGeneration}`;
  const isFirstExposure = practiceTurn?.phase === "first-exposure";
  const isFingerGuideMuted =
    isPaused
    || isSubmitting
    || (isFirstExposure && !isStartingRecallCaptureActive)
    || (isUpdatingStatus && !isStartingRecallCaptureActive)
    || Boolean(failedOperation?.locksPractice)
    || lastResult?.evaluation.outcome === "perfect";
  const isPracticeInteractionLocked =
    isUpdatingStatus
    || isStartingRecallCaptureActive
    || Boolean(failedOperation?.locksPractice);
  const activeContext: PracticeContext | null = activeItem?.occurrenceContext
    ? {
        ...activeItem.occurrenceContext,
        passedCards: session?.context?.passedCards ?? 0,
        totalCards: session?.context?.totalCards ?? sessionItems.length,
      }
    : session?.context ?? null;
  const nextLesson = useMemo<NextLessonAction | null>(() => {
    if (
      !snapshot
      || scope?.kind !== "lesson"
      || scope.mode !== "learn"
      || pendingReturnCount > 0
    ) {
      return null;
    }

    const completedLesson = snapshot.courseProgress
      .find((progress) => progress.courseId === scope.courseId)
      ?.units.flatMap((unit) => unit.lessons)
      .find((lesson) => lesson.lessonId === scope.lessonId);

    if (completedLesson?.status !== "completed") {
      return null;
    }

    return resolveNextLessonAction({
      completedCourseId: scope.courseId,
      completedLessonId: scope.lessonId,
      courses: snapshot.courses,
      learningPaths: snapshot.learningPaths,
      courseProgress: snapshot.courseProgress,
    });
  }, [pendingReturnCount, scope, snapshot]);

  const clearFingerGuideHomeTimer = useCallback(() => {
    if (fingerGuideHomeTimerRef.current !== null) {
      window.clearTimeout(fingerGuideHomeTimerRef.current);
      fingerGuideHomeTimerRef.current = null;
    }
  }, []);

  const returnFingerGuideHome = useCallback((delay = 0) => {
    clearFingerGuideHomeTimer();

    const clearStroke = () => {
      fingerGuideStrokeRef.current = null;
      fingerGuideHomeTimerRef.current = null;
      setFingerGuideFeedback((current) => current.stroke
        ? { ...current, stroke: null }
        : current);
    };

    if (delay > 0) {
      fingerGuideHomeTimerRef.current = window.setTimeout(clearStroke, delay);
      return;
    }

    clearStroke();
  }, [clearFingerGuideHomeTimer]);

  const showFingerGuideStroke = useCallback(
    (stroke: FingerGuideStroke | null) => {
      if (!stroke) {
        return;
      }

      clearFingerGuideHomeTimer();
      fingerGuideStrokeRef.current = stroke;
      setFingerGuideFeedback((current) => ({
        stroke,
        pulse: current.pulse + 1,
      }));
      fingerGuideHomeTimerRef.current = window.setTimeout(
        () => returnFingerGuideHome(),
        stroke.code === "Enter" ? 150 : 450,
      );
    },
    [clearFingerGuideHomeTimer, returnFingerGuideHome],
  );

  const triggerFingerGuide = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, command: PracticeKeyCommand | null) => {
      showFingerGuideStroke(resolveFingerGuideStroke({
        altGraphKey: event.getModifierState("AltGraph"),
        altKey: event.altKey,
        code: event.code,
        command,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      }));
    },
    [showFingerGuideStroke],
  );

  useEffect(() => {
    setAnswer("");
    setLastResult(null);
    setLastGrade(null);
    setItinerary([]);
    setCurrentIndex(0);
    setIsSessionComplete(false);
    setIsAnswerVisible(false);
    setAnswerWasRevealed(false);
    setHadEdits(false);
    setAudioPlayCount(0);
    setElapsedSeconds(0);
    setItemElapsedSeconds(0);
    setIsPaused(false);
    setSessionStats(EMPTY_SESSION_STATS);
    setShortcutNotice(null);
    setCaretOffset(0);
    setSelectionEndOffset(0);
    setCorrectionAcceptedAnswer(null);
    setSuppressRestoredTarget(false);
    setPracticeTurn(null);
    setSubmissionIndex(0);
    setReturnCounts({});
    setPendingReturnCount(0);
    setCheckpointStatus(quickStartSession ? "ready" : "loading");
    setCheckpointRecovery(null);
    setSuppressRestoredTarget(false);
    setIsRestartDialogOpen(false);
    setIsRestarting(false);
    setRestartError(null);
    setReplacementCheckpoint(null);
    setIsReplacingSession(false);
    setReplacementError(null);
    setFailedOperation(null);
    returnFingerGuideHome();
    checkpointLoadKeyRef.current = null;
    checkpointReadyRef.current = Boolean(quickStartSession);
    latestCheckpointRef.current = null;
    latestCheckpointSeedRef.current = null;
    occurrenceIdsRef.current = [];
    latestCheckpointIdentityRef.current = null;
    terminalCommitStartedRef.current = false;
    terminalCommitPromiseRef.current = null;
    checkpointCriticalSignatureRef.current = null;
    checkpointDraftSignatureRef.current = null;
    turnHistoryRef.current = {};
    startingRecallCaptureRef.current = null;
    startingRecallFeedbackRef.current = null;
    setStartingRecallCapture(null);
  }, [returnFingerGuideHome, sessionIdentity]);

  useEffect(() => clearFingerGuideHomeTimer, [clearFingerGuideHomeTimer]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!scope || !session || !snapshot || checkpointLoadKeyRef.current === sessionIdentity) {
      return;
    }

    const currentScope = scope;
    const currentSession = session;
    const currentSnapshot = snapshot;
    checkpointLoadKeyRef.current = sessionIdentity;
    let isCancelled = false;

    setCheckpointStatus("loading");
    checkpointReadyRef.current = false;
    restoredSelectionRef.current = null;

    async function initializeSession() {
      try {
        const initialItems: WorkbenchSessionItem[] = quickStartSession
          ? buildQuickStartWorkbenchItems(
              quickStartSession,
              currentSession.items,
              new Set(currentSession.blockedCardIds),
            )
          : currentSession.items;
        if (initialItems.length === 0) {
          setItinerary([]);
          setCheckpointStatus("ready");
          checkpointReadyRef.current = true;
          return;
        }

        const firstItem = initialItems[0];
        const firstStep = firstItem.quickStartStep;
        const initialTurn = firstStep
          ? firstStep.kind === "first-exposure"
            ? createPracticeTurn(createLocalId("turn"), firstItem.card.id, "first-exposure")
            : createPracticeTurn(
                createLocalId("turn"),
                firstItem.card.id,
                firstStep.phase,
                firstStep.initialSupportLevel,
                [...firstStep.initialSupportKinds],
              )
          : resolvePracticeTurnForScope({
              id: createLocalId("turn"),
              scope: currentScope,
              card: firstItem.card,
              learningState: currentSnapshot.sentenceLearningStates.find(
                (state) => state.cardId === firstItem.card.id,
              ),
              initialPhase: firstItem.initialPhase,
            });
        const seed = createWorkbenchPracticeSessionCheckpointSeed({
          scope: currentScope,
          items: initialItems,
          currentIndex: 0,
          draft: "",
          selectionStart: 0,
          selectionEnd: 0,
          practiceTurn: initialTurn,
          submissionIndex: 0,
          elapsedSeconds: 0,
          itemElapsedSeconds: 0,
          stats: EMPTY_SESSION_STATS,
          returnCounts: {},
          pendingReturnCount: 0,
          catalog: { courses: currentSnapshot.courses, cards: currentSnapshot.cards },
          updatedAt: new Date().toISOString(),
        });
        latestCheckpointSeedRef.current = seed;
        const catalogFingerprintForScope = (
          candidateScope: PracticeScope,
        ): string | undefined => {
          try {
            return catalogFingerprint(candidateScope, {
              courses: currentSnapshot.courses,
              cards: currentSnapshot.cards,
            });
          } catch {
            return undefined;
          }
        };
        const masteredCardIds = currentSnapshot.reviewStates
          .filter((state) => state.learningStatus === "mastered")
          .map((state) => state.cardId);

        await practiceCheckpointOperationQueue.current.catch(() => undefined);
        let opened = await controllerRef.current.openPracticeSession({
          checkpoint: seed,
          entryPoint: quickStartSession ? "quick-start-v1" : "standard",
          catalogFingerprintForScope,
          masteredCardIds,
        });
        if (opened.status === "replacement-required") {
          setReplacementCheckpoint(opened.checkpoint);
          setCheckpointStatus("ready");
          checkpointReadyRef.current = false;
          return;
        }
        if (isCancelled) return;

        let checkpoint = opened.checkpoint;

        const durableTurnEntries = (await controllerRef.current.exportFullBackup())
          .learning.practiceLog
          .filter((entry) => entry.turnId === checkpoint.turn.turnId);
        if (isCancelled) return;

        const restored = restoreWorkbenchPracticeSessionCheckpoint({
          checkpoint,
          scope: currentScope,
          items: initialItems,
          catalog: { courses: currentSnapshot.courses, cards: currentSnapshot.cards },
          masteredCardIds,
          durableEvidence: practiceLogEntriesToDurableEvidence(durableTurnEntries),
          now: new Date(),
        });

        if (restored.status === "discard") {
          await controllerRef.current.commitPracticeSessionTerminal({
            kind: "terminal",
            checkpoint,
            terminal: {
              kind: "invalidated",
              reason: restored.reason === "stale"
                ? "stale"
                : restored.reason === "catalog-changed"
                  ? "catalog-mismatch"
                  : restored.reason === "unsupported-schema"
                    ? "unsupported"
                    : "corrupt",
            },
          });
          const fresh = await controllerRef.current.openPracticeSession({
            checkpoint: seed,
            entryPoint: quickStartSession ? "quick-start-v1" : "standard",
            catalogFingerprintForScope,
            masteredCardIds,
          });
          checkpoint = fresh.checkpoint;
          if (isCancelled) return;

          latestCheckpointRef.current = checkpoint;
          latestCheckpointSeedRef.current = seed;
          occurrenceIdsRef.current = checkpoint.itinerary.map((occurrence) => occurrence.id);
          setItinerary(initialItems);
          setPracticeTurn(initialTurn);
          setCheckpointRecovery({ reason: restored.reason, message: restored.message });
          setShortcutNotice(restored.message);
          setCheckpointStatus("ready");
          checkpointReadyRef.current = true;
          return;
        }

        const restoredState = restored.viewState;
        restoredSelectionRef.current = {
          start: restoredState.selectionStart,
          end: restoredState.selectionEnd,
        };
        latestCheckpointRef.current = checkpoint;
        latestCheckpointSeedRef.current = seed;
        latestCheckpointIdentityRef.current = sessionIdentity;
        occurrenceIdsRef.current = [...restoredState.occurrenceIds];
        setItinerary(restoredState.itinerary);
        setCurrentIndex(restoredState.currentIndex);
        setAnswer(restoredState.draft);
        setCaretOffset(restoredState.selectionStart);
        setSelectionEndOffset(restoredState.selectionEnd);
        setPracticeTurn(restoredState.practiceTurn);
        setSubmissionIndex(restoredState.submissionIndex);
        setElapsedSeconds(restoredState.elapsedSeconds);
        setItemElapsedSeconds(restoredState.itemElapsedSeconds);
        setSessionStats(restoredState.stats);
        setReturnCounts(restoredState.returnCounts);
        setPendingReturnCount(restoredState.pendingReturnCount);
        setIsPaused(false);
        setIsAnswerVisible(false);
        setAnswerWasRevealed(restoredState.practiceTurn.answerWasRevealed);
        setSuppressRestoredTarget(
          restoredState.practiceTurn.supportLevelUsed === 4,
        );
        setHadEdits(Boolean(restoredState.draft));
        turnHistoryRef.current = {
          [restoredState.currentIndex]: {
            turn: restoredState.practiceTurn,
            submissionIndex: restoredState.submissionIndex,
          },
        };

        let resumeNotice = opened.status === "opened"
          ? sessionGeneration > 0
            ? "Practice restarted from the first sentence."
            : "Practice is ready."
          : "Practice restored. Your draft and recall turn are ready.";
        if (restored.recoveredCommand) {
          const committedAttempt = durableTurnEntries.find(
            (entry) => entry.id === restored.recoveredCommand?.evidenceId && entry.kind === "attempt",
          );
          if (committedAttempt?.kind === "attempt") {
            const result = await controllerRef.current.submitPracticeTurn({
              cardId: committedAttempt.cardId,
              answer: committedAttempt.answer,
              submittedAt: committedAttempt.submittedAt,
              turnId: committedAttempt.turnId,
              phase: committedAttempt.phase === "legacy"
                ? restoredState.practiceTurn.phase
                : committedAttempt.phase,
              submissionIndex: committedAttempt.submissionIndex,
              answerWasRevealed: committedAttempt.answerWasRevealed,
              hadEdits: committedAttempt.hadEdits,
              audioPlayCount: committedAttempt.audioPlayCount,
              durationMs: committedAttempt.durationMs,
              supportLevelUsed: committedAttempt.supportLevelUsed,
              supportKindsUsed: committedAttempt.supportKindsUsed,
              receivedCorrection: committedAttempt.receivedCorrection,
              reviewFailureRecorded: restoredState.practiceTurn.reviewFailureRecorded,
              ...(committedAttempt.context
                ? { context: structuredClone(committedAttempt.context) }
                : {}),
            });
            if (isCancelled) return;

            const grade = gradeRecall(
              result,
              committedAttempt.hadEdits,
              committedAttempt.submissionIndex,
            );
            setAnswer(committedAttempt.answer);
            setLastResult(result);
            setLastGrade(grade);
            setPracticeTurn(result.turn);
            setSubmissionIndex(committedAttempt.submissionIndex + 1);
            setSessionStats((current) => recordAttempt(current, result, grade));
            setIsAnswerVisible(result.evaluation.outcome === "perfect");
            setSuppressRestoredTarget(false);
            resumeNotice = "Practice restored. Your last Check was recovered without submitting it twice.";
          }
        }

        setShortcutNotice(resumeNotice);
        setCheckpointStatus("ready");
        checkpointReadyRef.current = true;
      } catch (caught) {
        if (isCancelled) return;
        setItinerary([]);
        setCheckpointRecovery({
          reason: "load-error",
          message: "Your Practice session could not be opened safely. Retry from Courses.",
        });
        setShortcutNotice("The Practice session could not be opened safely.");
        setCheckpointStatus("ready");
        checkpointReadyRef.current = false;
      }
    }

    void initializeSession();
    return () => {
      isCancelled = true;
    };
  }, [sessionIdentity, Boolean(session), Boolean(snapshot)]);

  useEffect(() => {
    if (!activeItem || isPaused || isSessionComplete) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
      setItemElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeItem, isPaused, isSessionComplete]);

  const focusBoard = useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;

      input.focus({ preventScroll: true });
      const restoredSelection = restoredSelectionRef.current;
      if (restoredSelection) {
        input.setSelectionRange(restoredSelection.start, restoredSelection.end);
        restoredSelectionRef.current = null;
      }
    });
  }, []);

  const focusInputRange = useCallback((start: number, end: number = start) => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;

      if (!input) {
        return;
      }

      input.focus({ preventScroll: true });
      input.setSelectionRange(start, end);
      setCaretOffset(start);
      setSelectionEndOffset(end);
    });
  }, []);

  const resetItemState = useCallback((notice: string | null = null) => {
    setAnswer("");
    setLastResult(null);
    setLastGrade(null);
    setIsAnswerVisible(false);
    setAnswerWasRevealed(false);
    setHadEdits(false);
    setAudioPlayCount(0);
    setItemElapsedSeconds(0);
    setShortcutNotice(notice);
    setCaretOffset(0);
    setSelectionEndOffset(0);
    setCorrectionAcceptedAnswer(null);
    setPracticeTurn(null);
    setSubmissionIndex(0);
    setSuppressRestoredTarget(false);
    setFailedOperation(null);
  }, []);

  useEffect(() => {
    if (!activeItem || practiceTurn) {
      return;
    }

    const savedTurn = turnHistoryRef.current[currentIndex];
    if (savedTurn && savedTurn.turn.cardId === activeItem.card.id) {
      setPracticeTurn(savedTurn.turn);
      setSubmissionIndex(savedTurn.submissionIndex);
      return;
    }

    if (activeQuickStartStep) {
      setPracticeTurn(activeQuickStartStep.kind === "first-exposure"
        ? createPracticeTurn(createLocalId("turn"), activeItem.card.id, "first-exposure")
        : createPracticeTurn(
            createLocalId("turn"),
            activeItem.card.id,
            activeQuickStartStep.phase,
            activeQuickStartStep.initialSupportLevel,
            [...activeQuickStartStep.initialSupportKinds],
          ));
      return;
    }

    setPracticeTurn(resolvePracticeTurnForScope({
      id: createLocalId("turn"),
      scope,
      card: activeItem.card,
      learningState: snapshot?.sentenceLearningStates.find(
        (state) => state.cardId === activeItem.card.id,
      ),
      initialPhase: activeItem.initialPhase,
    }));
  }, [activeItem, activeQuickStartStep, currentIndex, practiceTurn, scope, snapshot?.sentenceLearningStates]);

  useEffect(() => {
    if (!practiceTurn) {
      return;
    }

    turnHistoryRef.current[currentIndex] = {
      turn: practiceTurn,
      submissionIndex,
    };
  }, [currentIndex, practiceTurn, submissionIndex]);

  const currentPracticeLogContext = useCallback(() => {
    const checkpoint = latestCheckpointRef.current;
    const occurrenceId = occurrenceIdsRef.current[currentIndex];
    if (!checkpoint || !occurrenceId) return undefined;
    return practiceLogContextForOccurrence(checkpoint, occurrenceId);
  }, [currentIndex]);

  const commitLifecycleEvents = useCallback((
    engagement: PracticeSessionEngagementReason,
    roundEvents: readonly PracticeSessionRoundEvent[] = [],
    updateCheckpoint?: (
      checkpoint: PracticeSessionCheckpointV2,
    ) => PracticeSessionCheckpointV2,
  ) => {
    const identity = sessionIdentity;
    return enqueueCheckpointOperation(practiceCheckpointOperationQueue, async () => {
      const active = latestCheckpointRef.current;
      if (!active || latestCheckpointIdentityRef.current !== identity) {
        throw new Error("The active Practice lifecycle is unavailable.");
      }
      const checkpoint = updateCheckpoint
        ? updateCheckpoint(structuredClone(active))
        : active;
      const result = await controllerRef.current.commitPracticeSessionCheckpoint({
        kind: "checkpoint",
        checkpoint,
        engagement,
        ...(roundEvents.length > 0 ? { roundEvents } : {}),
      });
      if (result.status === "stored" || result.status === "unchanged") {
        latestCheckpointRef.current = result.checkpoint;
        return;
      }
      throw new Error(`Practice lifecycle commit was rejected: ${result.status}`);
    });
  }, [sessionIdentity]);

  const persistCheckpoint = useCallback((
    seed: PracticeSessionCheckpointSeed,
    engagement?: PracticeSessionEngagementReason,
  ) => {
    const identity = sessionIdentity;
    return enqueueCheckpointOperation(practiceCheckpointOperationQueue, async () => {
      const active = latestCheckpointRef.current;
      if (!active || latestCheckpointIdentityRef.current !== identity) return;
      const checkpoint = checkpointFromWorkbenchSeed(active, seed);
      const result = await controllerRef.current.commitPracticeSessionCheckpoint({
        kind: "checkpoint",
        checkpoint,
        ...(engagement ? { engagement } : {}),
      });
      if (result.status === "stored" || result.status === "unchanged") {
        latestCheckpointRef.current = result.checkpoint;
        occurrenceIdsRef.current = result.checkpoint.itinerary.map((occurrence) => occurrence.id);
      }
    }).then(() => {
      if (!isMountedRef.current || latestCheckpointIdentityRef.current !== identity) return;
      setFailedOperation((current) => current?.label === "Retry saving Practice session" ? null : current);
    }).catch((caught) => {
      if (!isMountedRef.current || latestCheckpointIdentityRef.current !== identity) return;
      const message = "The Practice session checkpoint could not be saved. Your current screen is still available.";
      setFailedOperation((current) => current ?? {
        kind: "operation",
        label: "Retry saving Practice session",
        locksPractice: false,
        message,
        retry: () => {
          const latest = latestCheckpointSeedRef.current;
          if (latest) void persistCheckpoint(latest, latest.draft ? "text-input" : undefined);
        },
      });
      setShortcutNotice("Your practice is still open, but its local checkpoint needs a retry.");
    });
  }, [sessionIdentity]);

  useEffect(() => {
    if (
      checkpointStatus !== "ready"
      || !checkpointReadyRef.current
      || !scope
      || !snapshot
      || !practiceTurn
      || isSessionComplete
      || itinerary.length === 0
      || currentIndex < 0
      || currentIndex >= itinerary.length
    ) {
      return;
    }

    let checkpoint: PracticeSessionCheckpointSeed;
    try {
      checkpoint = createWorkbenchPracticeSessionCheckpointSeed({
        scope,
        items: itinerary,
        currentIndex,
        draft: answer,
        selectionStart: caretOffset,
        selectionEnd: selectionEndOffset,
        practiceTurn,
        submissionIndex,
        elapsedSeconds,
        itemElapsedSeconds,
        stats: sessionStats,
        returnCounts,
        pendingReturnCount,
        catalog: { courses: snapshot.courses, cards: snapshot.cards },
        updatedAt: new Date().toISOString(),
      });
    } catch (caught) {
      setShortcutNotice(caught instanceof Error
        ? `Practice checkpoint unavailable: ${caught.message}`
        : "Practice checkpoint unavailable.");
      return;
    }

    latestCheckpointSeedRef.current = checkpoint;
    latestCheckpointIdentityRef.current = sessionIdentity;

    const criticalSignature = JSON.stringify({
      scopeKey,
      currentIndex,
      itinerary: itinerary.map((item) => [
        item.card.id,
        item.occurrenceContext?.courseId ?? null,
        item.occurrenceContext?.unitId ?? null,
        item.occurrenceContext?.lessonId ?? null,
      ]),
      turn: practiceTurn,
      submissionIndex,
      stats: sessionStats,
      returnCounts,
      pendingReturnCount,
      isPaused,
    });
    const draftSignature = JSON.stringify([answer, caretOffset, selectionEndOffset]);
    const isCriticalChange = checkpointCriticalSignatureRef.current !== criticalSignature;
    const isDraftChange = checkpointDraftSignatureRef.current !== draftSignature;
    checkpointCriticalSignatureRef.current = criticalSignature;
    checkpointDraftSignatureRef.current = draftSignature;

    if (!isCriticalChange && !isDraftChange) {
      return;
    }

    if (checkpointSaveTimerRef.current !== null) {
      window.clearTimeout(checkpointSaveTimerRef.current);
      checkpointSaveTimerRef.current = null;
    }

    if (isCriticalChange) {
      void persistCheckpoint(checkpoint, answer ? "text-input" : undefined);
      return;
    }

    if (isDraftChange) {
      checkpointSaveTimerRef.current = window.setTimeout(() => {
        checkpointSaveTimerRef.current = null;
        const latest = latestCheckpointSeedRef.current;
        if (latest && latestCheckpointIdentityRef.current === sessionIdentity) {
          void persistCheckpoint(latest, latest.draft ? "text-input" : undefined);
        }
      }, 200);
    }
  }, [
    answer,
    caretOffset,
    checkpointStatus,
    currentIndex,
    elapsedSeconds,
    isPaused,
    isSessionComplete,
    itemElapsedSeconds,
    itinerary,
    pendingReturnCount,
    persistCheckpoint,
    practiceTurn,
    returnCounts,
    scope,
    scopeKey,
    selectionEndOffset,
    sessionIdentity,
    sessionStats,
    snapshot,
    submissionIndex,
  ]);

  useEffect(() => {
    function saveWhenHidden() {
      if (document.visibilityState !== "hidden") return;
      const latest = latestCheckpointSeedRef.current;
      if (latest && latestCheckpointIdentityRef.current === sessionIdentity) {
        if (checkpointSaveTimerRef.current !== null) {
          window.clearTimeout(checkpointSaveTimerRef.current);
          checkpointSaveTimerRef.current = null;
        }
        void persistCheckpoint(latest, latest.draft ? "text-input" : undefined);
      }
    }

    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => document.removeEventListener("visibilitychange", saveWhenHidden);
  }, [persistCheckpoint, sessionIdentity]);

  useEffect(() => () => {
    if (checkpointSaveTimerRef.current !== null) {
      window.clearTimeout(checkpointSaveTimerRef.current);
      checkpointSaveTimerRef.current = null;
    }
    const latest = latestCheckpointSeedRef.current;
    if (latest && latestCheckpointIdentityRef.current === sessionIdentity) {
      void persistCheckpoint(latest, latest.draft ? "text-input" : undefined);
    }
  }, [persistCheckpoint, sessionIdentity]);

  const commitCompletedLifecycle = useCallback(() => {
    if (terminalCommitPromiseRef.current) return terminalCommitPromiseRef.current;
    const identity = sessionIdentity;
    terminalCommitStartedRef.current = true;
    if (checkpointSaveTimerRef.current !== null) {
      window.clearTimeout(checkpointSaveTimerRef.current);
      checkpointSaveTimerRef.current = null;
    }
    const commit = enqueueCheckpointOperation(practiceCheckpointOperationQueue, async () => {
      const checkpoint = latestCheckpointRef.current;
      if (!checkpoint || latestCheckpointIdentityRef.current !== identity) return;
      await controllerRef.current.commitPracticeSessionTerminal({
        kind: "terminal",
        checkpoint,
        terminal: quickStartSession
          ? { kind: "completed", reason: "quick-start-complete" }
          : { kind: "completed", reason: "scope-complete" },
        ...(quickStartSession
          ? { quickStartPreference: { version: 1 as const, status: "completed" as const } }
          : {}),
      });
      latestCheckpointRef.current = null;
      latestCheckpointSeedRef.current = null;
      latestCheckpointIdentityRef.current = null;
      occurrenceIdsRef.current = [];
    }).catch((caught) => {
      terminalCommitStartedRef.current = false;
      terminalCommitPromiseRef.current = null;
      throw caught;
    });
    terminalCommitPromiseRef.current = commit;
    return commit;
  }, [quickStartSession, sessionIdentity]);

  useEffect(() => {
    if (
      checkpointStatus !== "ready"
      || (!isSessionComplete && !(session?.completed && itinerary.length === 0))
      || !latestCheckpointRef.current
    ) {
      return;
    }

    void commitCompletedLifecycle().catch(() => {
      setFailedOperation({
        kind: "operation",
        label: "Retry saving Practice completion",
        locksPractice: false,
        message: "Practice is complete, but its final local evidence still needs to be saved.",
        retry: () => void commitCompletedLifecycle(),
      });
    });
  }, [
    checkpointStatus,
    commitCompletedLifecycle,
    isSessionComplete,
    itinerary.length,
    session?.completed,
  ]);

  const moveForward = useCallback(
    (notice: string | null = null) => {
      if (currentIndex + 1 >= sessionItems.length) {
        setIsSessionComplete(true);
        setShortcutNotice(null);
        return;
      }

      setCurrentIndex((current) => current + 1);
      resetItemState(notice);
    },
    [currentIndex, resetItemState, sessionItems.length],
  );

  const submit = useCallback(async () => {
    if (
      !activeItem
      || !practiceTurn
      || practiceTurn.phase === "first-exposure"
      || !answer.trim()
      || isSubmitting
      || isPaused
      || lastResult?.evaluation.outcome === "perfect"
    ) {
      return;
    }

    if (!preview?.isComplete) {
      setShortcutNotice("Complete every word slot before checking.");
      return;
    }

    setIsSubmitting(true);
    if (!await retryPendingAudioSave(failedOperation)) {
      setIsSubmitting(false);
      return;
    }
    setShortcutNotice(null);
    setFailedOperation(null);
    try {
      const logContext = currentPracticeLogContext();
      if (!logContext) {
        throw new Error("Practice lifecycle context is unavailable.");
      }
      const result = await controller.submitPracticeTurn({
        cardId: activeItem.card.id,
        answer,
        submittedAt: new Date().toISOString(),
        turnId: practiceTurn.id,
        phase: practiceTurn.phase,
        submissionIndex,
        answerWasRevealed: practiceTurn.answerWasRevealed || answerWasRevealed,
        hadEdits,
        audioPlayCount,
        durationMs: itemElapsedSeconds * 1000,
        supportLevelUsed: practiceTurn.supportLevelUsed,
        supportKindsUsed: practiceTurn.supportKindsUsed,
        receivedCorrection: practiceTurn.receivedCorrection,
        reviewFailureRecorded: practiceTurn.reviewFailureRecorded,
        context: logContext,
      });
      const grade = gradeRecall(result, hadEdits, submissionIndex);
      const roundEvents: PracticeSessionRoundEvent[] = [
        { kind: "attempted", occurrenceId: logContext.occurrenceId },
      ];
      if (result.evaluation.outcome === "perfect") {
        roundEvents.push({ kind: "completed", occurrenceId: logContext.occurrenceId });
      }
      if (result.firstPassCreated) {
        roundEvents.push({ kind: "first-pass", cardId: activeItem.card.id });
      }

      setItinerary((items) => items.map((item) => item.card.id === activeItem.card.id
        ? { ...item, reviewState: result.reviewState, isDue: false }
        : item));
      setSessionStats((current) => recordAttempt(current, result, grade));
      setPracticeTurn(result.turn);
      setSubmissionIndex((current) => current + 1);

      if (result.evaluation.outcome === "perfect") {
        const quickStartReturnIsAlreadyPlanned = activeQuickStartStep?.kind === "recall"
          && activeQuickStartStep.purpose !== "independent-return";
        const resultExplanation = explainRecallResult({
          phase: result.turn.phase,
          grade,
          shouldRequeue: result.shouldRequeue,
          hasFirstPass: hasFirstPass(result.learningState),
          quickStartReturnIsAlreadyPlanned,
        });
        if (result.shouldRequeue && !quickStartReturnIsAlreadyPlanned) {
          const priorReturnCount = returnCounts[activeItem.card.id] ?? 0;
          const canReturnInRound = priorReturnCount < 2
            && sessionItems.length - currentIndex - 1 >= 2;
          if (canReturnInRound) {
            setItinerary((items) => {
              const next = [...items];
              next.splice(currentIndex + 3, 0, activeItem);
              return next;
            });
            setReturnCounts((current) => ({
              ...current,
              [activeItem.card.id]: priorReturnCount + 1,
            }));
            setShortcutNotice("Guided recall complete. This sentence will return after two others for an independent check.");
          } else {
            roundEvents.push(priorReturnCount >= 2
              ? { kind: "requeue-cap-reached", cardId: activeItem.card.id }
              : { kind: "requeue-deferred-no-room", cardId: activeItem.card.id });
            setPendingReturnCount((current) => current + 1);
            setShortcutNotice("Guided recall complete. This sentence will return in the next round.");
          }
        } else if (resultExplanation) {
          setShortcutNotice(resultExplanation);
        }
        setCorrectionAcceptedAnswer(null);
        setLastResult(result);
        setLastGrade(grade);
        setIsAnswerVisible(true);
      } else {
        const correction = buildCorrectionDraft(
          buildEvaluationPreview(activeItem.card, result.evaluation, answer),
        );

        setAnswer(correction.answer);
        setCorrectionAcceptedAnswer(result.evaluation.acceptedAnswer);
        setLastResult(null);
        setLastGrade(null);
        setIsAnswerVisible(false);
        setHadEdits(true);
        setShortcutNotice(null);
        const firstErrorIsSlot =
          correction.answer[correction.firstErrorOffset] === CORRECTION_SLOT_PLACEHOLDER;
        const firstErrorOffset = correction.firstErrorOffset >= 0
          ? correction.firstErrorOffset
          : correction.answer.length;
        focusInputRange(
          firstErrorOffset,
          firstErrorIsSlot
            ? firstErrorOffset + CORRECTION_SLOT_PLACEHOLDER.length
            : firstErrorOffset,
        );
      }
      await commitLifecycleEvents("submission", roundEvents);
    } catch (caught) {
      const message = "Your answer could not be saved. It is still here for retry.";
      setShortcutNotice("Your answer is still here. Retry saving this attempt.");
      setFailedOperation({
        kind: "operation",
        label: "Retry saving attempt",
        locksPractice: true,
        message,
        retry: () => void submit(),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeItem,
    activeQuickStartStep,
    answer,
    answerWasRevealed,
    audioPlayCount,
    controller,
    commitLifecycleEvents,
    currentPracticeLogContext,
    hadEdits,
    isPaused,
    isSubmitting,
    itemElapsedSeconds,
    lastResult,
    preview?.isComplete,
    focusInputRange,
    failedOperation,
    practiceTurn,
    returnCounts,
    submissionIndex,
    currentIndex,
    sessionItems,
    scope,
  ]);

  const retryCurrent = useCallback(() => {
    resetItemState();
    if (activeItem) {
      setPracticeTurn(createPracticeTurn(
        createLocalId("turn"),
        activeItem.card.id,
        "voluntary-practice",
      ));
    }
  }, [activeItem, resetItemState]);

  const resumeEditing = useCallback(() => {
    if (lastResult?.evaluation.outcome === "perfect") {
      return;
    }

    setLastResult(null);
    setLastGrade(null);
    setIsAnswerVisible(false);
    setHadEdits(true);
    setShortcutNotice("Edit the highlighted words, then check again.");
  }, [lastResult]);

  const advance = useCallback(() => {
    if (lastResult?.evaluation.outcome !== "perfect") {
      resumeEditing();
      return;
    }

    moveForward();
  }, [lastResult, moveForward, resumeEditing]);

  const clearCurrent = useCallback(() => {
    if (lastResult?.evaluation.outcome === "perfect") {
      retryCurrent();
      return;
    }

    setAnswer("");
    setLastResult(null);
    setLastGrade(null);
    setIsAnswerVisible(false);
    setHadEdits(true);
    setShortcutNotice(null);
    setCorrectionAcceptedAnswer(null);
  }, [lastResult, retryCurrent]);

  const deleteCharacter = useCallback(() => {
    if (lastResult?.evaluation.outcome === "perfect") {
      return;
    }

    setLastResult(null);
    setLastGrade(null);
    setIsAnswerVisible(false);
    setHadEdits(true);
    setAnswer((current) => Array.from(current).slice(0, -1).join(""));
  }, [lastResult]);

  const appendCharacter = useCallback(
    (character: string) => {
      if (!activeItem || lastResult?.evaluation.outcome === "perfect") {
        return;
      }

      if (lastResult) {
        setLastResult(null);
        setLastGrade(null);
        setHadEdits(true);
      }
      setShortcutNotice(null);
      setAnswer((current) => {
        if (character === " " && (!current || /\s$/.test(current))) {
          return current;
        }

        const maximumLength = Math.max(activeItem.card.english.length * 2, 160);
        return `${current}${character}`.slice(0, maximumLength);
      });
    },
    [activeItem, lastResult],
  );

  const updateAnswerFromCapture = useCallback(
    (
      nextAnswer: string,
      nextSelectionStart: number,
      nextSelectionEnd: number,
      isComposing: boolean,
    ) => {
      if (!activeItem || isPaused || lastResult?.evaluation.outcome === "perfect") {
        return;
      }

      const maximumLength = Math.max(activeItem.card.english.length * 2, 160);
      const stableDraft = correctionAcceptedAnswer && !isComposing
        ? stabilizeCorrectionDraft(answer, nextAnswer, nextSelectionStart)
        : {
            answer: nextAnswer,
            selectionStart: nextSelectionStart,
            selectionEnd: nextSelectionEnd,
          };
      const boundedAnswer = stableDraft.answer.slice(0, maximumLength);
      const selectionStart = Math.min(stableDraft.selectionStart, boundedAnswer.length);
      const selectionEnd = Math.min(stableDraft.selectionEnd, boundedAnswer.length);

      if (lastResult || !nextAnswer.startsWith(answer)) {
        setHadEdits(true);
      }
      setLastResult(null);
      setLastGrade(null);
      setShortcutNotice(null);
      setAnswer(boundedAnswer);
      setCaretOffset(selectionStart);
      setSelectionEndOffset(selectionEnd);

      if (stableDraft.answer !== nextAnswer) {
        window.requestAnimationFrame(() => {
          const input = inputRef.current;

          if (!input) {
            return;
          }

          input.value = boundedAnswer;
          input.focus({ preventScroll: true });
          input.setSelectionRange(selectionStart, selectionEnd);
        });
      }
    },
    [activeItem, answer, correctionAcceptedAnswer, isPaused, lastResult],
  );

  const finishStartingRecallCapture = useCallback(() => {
    const capture = startingRecallCaptureRef.current;

    if (capture?.isComposing) {
      const composingCapture = { ...capture, isLifecycleReady: true };
      startingRecallCaptureRef.current = composingCapture;
      setStartingRecallCapture(composingCapture);
      return;
    }

    if (!capture) {
      return;
    }

    flushSync(() => {
      setAnswer(capture.draft);
      setCaretOffset(capture.selectionStart);
      setSelectionEndOffset(capture.selectionEnd);
      setStartingRecallCapture(null);
      setIsUpdatingStatus(false);
    });
    startingRecallCaptureRef.current = null;
    startingRecallFeedbackRef.current = null;
  }, []);

  const pauseStartingRecallCapture = useCallback(() => {
    const capture = startingRecallCaptureRef.current;
    startingRecallFeedbackRef.current = null;
    if (!capture) {
      return;
    }

    const pausedCapture = { ...capture, isActive: false };
    startingRecallCaptureRef.current = pausedCapture;
    setStartingRecallCapture(pausedCapture);
  }, []);

  const startRecall = useCallback(async () => {
    if (failedOperation?.kind === "audio-save") {
      void failedOperation.retry();
      return;
    }
    if (!activeItem || !practiceTurn || practiceTurn.phase !== "first-exposure" || isUpdatingStatus) {
      return;
    }

    const currentCapture = startingRecallCaptureRef.current;
    const nextCapture: StartingRecallCapture = currentCapture
      ? { ...currentCapture, isActive: true }
      : {
          draft: answer,
          isActive: true,
          isComposing: false,
          isLifecycleReady: false,
          selectionStart: caretOffset,
          selectionEnd: selectionEndOffset,
        };
    startingRecallCaptureRef.current = nextCapture;
    startingRecallFeedbackRef.current = null;
    flushSync(() => {
      setStartingRecallCapture(nextCapture);
      setIsUpdatingStatus(true);
      setFailedOperation(null);
    });
    inputRef.current?.focus({ preventScroll: true });
    try {
      const learningState = await controller.completeFirstExposure(activeItem.card.id);
      const nextStandardTurn = activeQuickStartStep?.kind === "first-exposure"
        ? null
        : resolvePracticeTurnForScope({
            id: createLocalId("turn"),
            scope,
            card: activeItem.card,
            learningState,
            initialPhase: activeItem.initialPhase,
          });
      const lifecycleEvents: PracticeSessionRoundEvent[] = [{
        kind: "first-exposure",
        cardId: activeItem.card.id,
      }];
      let currentOccurrenceId: string | null = null;
      if (activeQuickStartStep?.kind === "first-exposure") {
        const practiceLogContext = currentPracticeLogContext();
        if (!practiceLogContext) {
          throw new Error("Practice lifecycle context is unavailable.");
        }
        lifecycleEvents.push({
          kind: "completed",
          occurrenceId: practiceLogContext.occurrenceId,
        });
        currentOccurrenceId = practiceLogContext.occurrenceId;
      }
      await commitLifecycleEvents(
        "first-exposure",
        lifecycleEvents,
        (checkpoint) => {
          const capture = startingRecallCaptureRef.current;
          return transitionCheckpointAfterFirstExposure({
            checkpoint,
            currentOccurrenceId: currentOccurrenceId
              ?? occurrenceIdsRef.current[currentIndex]
              ?? checkpoint.currentOccurrenceId,
            nextStandardTurn,
            draft: capture?.draft ?? "",
            selectionStart: capture?.selectionStart ?? 0,
            selectionEnd: capture?.selectionEnd ?? 0,
          });
        },
      );
      if (activeQuickStartStep?.kind === "first-exposure") {
        const nextOccurrence = latestCheckpointRef.current?.itinerary[currentIndex + 1];
        if (nextOccurrence) {
          turnHistoryRef.current[currentIndex + 1] = {
            turn: {
              id: nextOccurrence.turn.turnId,
              cardId: nextOccurrence.cardId,
              phase: nextOccurrence.turn.phase,
              supportLevelUsed: nextOccurrence.turn.supportLevelUsed,
              supportKindsUsed: [...nextOccurrence.turn.supportKindsUsed],
              answerWasRevealed: nextOccurrence.turn.supportKindsUsed.includes("answer"),
              receivedCorrection: nextOccurrence.turn.receivedCorrection,
              reviewFailureRecorded: nextOccurrence.turn.reviewFailureRecorded,
            },
            submissionIndex: nextOccurrence.turn.submissionIndex,
          };
        }
        moveForward("First exposure complete. Now rebuild the sentence in the word track.");
        finishStartingRecallCapture();
        return;
      }
      setPracticeTurn(nextStandardTurn);
      setShortcutNotice("First exposure complete. Rebuild the sentence in the word track; use Answer only if you need support.");
      finishStartingRecallCapture();
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry starting recall",
        locksPractice: true,
        message: "First exposure could not be saved. You are still on this sentence.",
        retry: () => void startRecall(),
      });
      pauseStartingRecallCapture();
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    activeQuickStartStep,
    answer,
    caretOffset,
    commitLifecycleEvents,
    controller,
    currentIndex,
    currentPracticeLogContext,
    failedOperation,
    finishStartingRecallCapture,
    isUpdatingStatus,
    moveForward,
    pauseStartingRecallCapture,
    practiceTurn,
    selectionEndOffset,
    scope,
  ]);

  const registerSupport = useCallback(async (
    kind: RecallSupportKind,
    level: RecallSupportLevel,
    explicitAnswer = false,
  ): Promise<boolean> => {
    if (!activeItem || !practiceTurn || practiceTurn.phase === "first-exposure") {
      return false;
    }

    const nextTurn = applyRecallSupport(practiceTurn, kind, level);
    setSuppressRestoredTarget(false);
    setPracticeTurn(nextTurn);
    if (explicitAnswer) {
      setAnswerWasRevealed(true);
      setIsAnswerVisible(true);
    }
    setIsUpdatingStatus(true);
    setFailedOperation(null);
    try {
      const practiceLogContext = currentPracticeLogContext();
      if (!practiceLogContext) {
        throw new Error("Practice lifecycle context is unavailable.");
      }
      const evidence = {
        answerWasRevealed: nextTurn.answerWasRevealed,
        hadEdits,
        audioPlayCount: audioPlayCount + (kind === "audio" ? 1 : 0),
        durationMs: itemElapsedSeconds * 1000,
        supportLevelUsed: nextTurn.supportLevelUsed,
        supportKindsUsed: nextTurn.supportKindsUsed,
        receivedCorrection: nextTurn.receivedCorrection,
      };
      const context = {
        turnId: nextTurn.id,
        phase: practiceTurn.phase,
        reviewFailureRecorded: practiceTurn.reviewFailureRecorded,
        receivedCorrection: practiceTurn.receivedCorrection,
        practiceLogContext,
      };
      const reviewState = explicitAnswer
        ? await controller.revealPracticeAnswer(activeItem.card.id, evidence, context)
        : await controller.recordPracticeSupport(activeItem.card.id, evidence, context);
      await commitLifecycleEvents(
        explicitAnswer ? "answer-reveal" : kind === "audio" ? "target-audio" : "support",
      );
      setItinerary((items) => items.map((item) => item.card.id === activeItem.card.id
        ? { ...item, reviewState, isDue: true }
        : item));
      if (explicitAnswer && !answerWasRevealed) {
        setSessionStats((current) => ({ ...current, revealed: current.revealed + 1 }));
      }
      const savedNotice = recallSupportSavedNotice(kind, level, explicitAnswer);
      if (savedNotice) {
        setShortcutNotice(savedNotice);
      }
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      return true;
    } catch (caught) {
      const failureCopy = recallSupportSaveFailureCopy(kind, explicitAnswer);
      if (kind === "audio" && !explicitAnswer) {
        setFailedOperation({
          kind: "audio-save",
          label: failureCopy.label,
          locksPractice: false,
          message: failureCopy.message,
          retry: () => registerSupport(kind, level, explicitAnswer),
        });
      } else {
        setFailedOperation({
          kind: "operation",
          label: failureCopy.label,
          locksPractice: true,
          message: failureCopy.message,
          retry: () => void registerSupport(kind, level, explicitAnswer),
        });
      }
      if (failureCopy.notice) {
        setShortcutNotice(failureCopy.notice);
      }
      return false;
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    answerWasRevealed,
    audioPlayCount,
    commitLifecycleEvents,
    controller,
    currentPracticeLogContext,
    hadEdits,
    itemElapsedSeconds,
    practiceTurn,
  ]);

  const saveAudioEngagement = useCallback(async (): Promise<boolean> => {
    setFailedOperation((current) => current?.kind === "audio-save" ? null : current);
    try {
      await commitLifecycleEvents("target-audio");
      return true;
    } catch (caught) {
      setFailedOperation({
        kind: "audio-save",
        label: "Retry saving audio record",
        locksPractice: false,
        message: "Audio played, but its activity record could not be saved.",
        retry: () => saveAudioEngagement(),
      });
      return false;
    }
  }, [commitLifecycleEvents]);

  const playAudio = useCallback(() => {
    if (!activeItem || isPaused) {
      return;
    }

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setShortcutNotice("Audio is not available in this browser.");
      return;
    }

    const supportPanelMode = isFirstExposure
      ? "first-exposure"
      : lastResult
        ? "result"
        : "recall";
    if (shouldRecordAudioPlaybackAsRecallSupport(supportPanelMode)) {
      void registerSupport("audio", 3);
      setAudioPlayCount((current) => current + 1);
    } else {
      void saveAudioEngagement();
    }
    const voices = listEnglishSpeechVoices(window.speechSynthesis.getVoices());
    const voice = resolvePreferredSpeechVoice(voices, speechVoiceUri);
    setSessionStats((current) => ({
      ...current,
      audioPlays: current.audioPlays + 1,
    }));
    queueSentenceAudioTwice(window.speechSynthesis, (copy) => {
      const utterance = new SpeechSynthesisUtterance(activeItem.card.english);
      utterance.lang = voice?.lang ?? "en-US";
      utterance.rate = 0.92;

      if (voice) {
        utterance.voice = voice;
      }

      utterance.onerror = () => setShortcutNotice("Sentence audio could not be played.");
      return utterance;
    });
  }, [
    activeItem,
    isFirstExposure,
    isPaused,
    lastResult,
    registerSupport,
    saveAudioEngagement,
    speechVoiceUri,
  ]);

  const toggleAnswer = useCallback(async () => {
    if (
      !activeItem
      || isPaused
      || isSubmitting
      || isUpdatingStatus
      || lastResult?.evaluation.outcome === "perfect"
    ) {
      return;
    }

    const nextIsVisible = !isAnswerVisible;
    setSuppressRestoredTarget(false);
    if (!nextIsVisible || answerWasRevealed) {
      setIsAnswerVisible(nextIsVisible);
      setShortcutNotice(nextIsVisible ? "Answer shown." : "Answer hidden. The support evidence remains recorded.");
      return;
    }

    await registerSupport("answer", 4, true);
  }, [
    activeItem,
    answerWasRevealed,
    isAnswerVisible,
    isPaused,
    isSubmitting,
    isUpdatingStatus,
    lastResult,
    registerSupport,
  ]);

  const markMastered = useCallback(async () => {
    if (!activeItem || isPaused || isSubmitting || isUpdatingStatus) {
      return;
    }

    setIsUpdatingStatus(true);
    setFailedOperation(null);
    try {
      await controller.setReviewLearningStatus(activeItem.card.id, "mastered");
      const practiceLogContext = currentPracticeLogContext();
      if (practiceLogContext) {
        const skippedOccurrences = latestCheckpointRef.current?.itinerary
          .filter((occurrence) => (
            occurrence.cardId === activeItem.card.id
            && latestCheckpointRef.current?.round.remainingOccurrenceIds.includes(occurrence.id)
          ))
          .map<PracticeSessionRoundEvent>((occurrence) => ({
            kind: "skipped",
            occurrenceId: occurrence.id,
          })) ?? [{ kind: "skipped", occurrenceId: practiceLogContext.occurrenceId }];
        await commitLifecycleEvents("skip", skippedOccurrences);
      }
      const remainingItems = sessionItems.filter((item) => item.card.id !== activeItem.card.id);
      setItinerary(remainingItems);

      if (remainingItems.length === 0 || currentIndex >= remainingItems.length) {
        setIsSessionComplete(true);
      } else {
        resetItemState("Moved to mastered. It has left the active queue.");
      }
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry marking mastered",
        locksPractice: true,
        message: "Mastery could not be saved. This sentence remains in the current queue.",
        retry: () => void markMastered(),
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    commitLifecycleEvents,
    controller,
    currentPracticeLogContext,
    currentIndex,
    isPaused,
    isSubmitting,
    isUpdatingStatus,
    resetItemState,
    sessionItems,
  ]);

  const toggleVocabulary = useCallback(async () => {
    if (!activeItem || isPaused || isSubmitting || isUpdatingStatus) {
      return;
    }

    setIsUpdatingStatus(true);
    setFailedOperation((current) => current?.kind === "audio-save" ? current : null);
    try {
      await controller.setVocabularyStatus(activeItem.card.id, !isInVocabulary);
      setShortcutNotice(isInVocabulary ? "Removed from Vocabulary." : "Saved to Vocabulary.");
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry saving Vocabulary",
        locksPractice: true,
        message: "Vocabulary could not be updated. Its previous saved state remains.",
        retry: () => void toggleVocabulary(),
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    controller,
    isInVocabulary,
    isPaused,
    isSubmitting,
    isUpdatingStatus,
  ]);

  const skipCurrent = useCallback(async () => {
    if (!activeItem || !practiceTurn || isPaused || isSubmitting || isUpdatingStatus || lastResult?.evaluation.outcome === "perfect") {
      return;
    }

    setIsUpdatingStatus(true);
    setFailedOperation(null);
    try {
      const practiceLogContext = currentPracticeLogContext();
      if (!practiceLogContext) {
        throw new Error("Practice lifecycle context is unavailable.");
      }
      const reviewState = await controller.skipPracticeCard(activeItem.card.id, {
        answerWasRevealed: practiceTurn.answerWasRevealed || answerWasRevealed,
        hadEdits,
        audioPlayCount,
        durationMs: itemElapsedSeconds * 1000,
        supportLevelUsed: practiceTurn.supportLevelUsed,
        supportKindsUsed: practiceTurn.supportKindsUsed,
        receivedCorrection: practiceTurn.receivedCorrection,
      }, {
        turnId: practiceTurn.id,
        phase: practiceTurn.phase,
        reviewFailureRecorded: practiceTurn.reviewFailureRecorded,
        receivedCorrection: practiceTurn.receivedCorrection,
        practiceLogContext,
      });
      await commitLifecycleEvents("skip", [{
        kind: "skipped",
        occurrenceId: practiceLogContext.occurrenceId,
      }]);
      setItinerary((items) => items.map((item) => item.card.id === activeItem.card.id
        ? { ...item, reviewState, isDue: true }
        : item));
      setSessionStats((current) => ({
        ...current,
        combo: 0,
        skipped: current.skipped + 1,
      }));
      if (shouldKeepSkippedCardPending(
        scope,
        Boolean(quickStartSession),
        snapshot?.sentenceLearningStates.find((state) => state.cardId === activeItem.card.id),
      )) {
        setPendingReturnCount((current) => current + 1);
      }
      moveForward("Previous sentence skipped. It remains in focused review.");
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry saving skip",
        locksPractice: true,
        message: "Skip could not be saved. You are still on this sentence.",
        retry: () => void skipCurrent(),
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    answerWasRevealed,
    audioPlayCount,
    commitLifecycleEvents,
    controller,
    currentPracticeLogContext,
    hadEdits,
    isPaused,
    isSubmitting,
    isUpdatingStatus,
    itemElapsedSeconds,
    lastResult,
    moveForward,
    practiceTurn,
    quickStartSession,
    scope,
    snapshot?.sentenceLearningStates,
  ]);

  const previous = useCallback(() => {
    if (isPaused || isSubmitting || isUpdatingStatus) {
      return;
    }

    if (currentIndex === 0) {
      setShortcutNotice("This is the first sentence in the round.");
      return;
    }

    setCurrentIndex((current) => current - 1);
    resetItemState();
  }, [currentIndex, isPaused, isSubmitting, isUpdatingStatus, resetItemState]);

  const togglePause = useCallback(() => {
    setIsPaused((current) => {
      const next = !current;

      if (next && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setShortcutNotice(next ? "Practice paused." : "Practice resumed.");
      return next;
    });
  }, []);

  const runCommand = useCallback(
    (command: PracticeKeyCommand) => {
      triggerKeyFeedback(command);

      if (
        failedOperation?.kind === "audio-save"
        && shouldRetryAudioSaveBeforeCommand(command.type)
      ) {
        void failedOperation.retry();
        return;
      }

      switch (command.type) {
        case "append":
          appendCharacter(command.value);
          break;
        case "delete":
          deleteCharacter();
          break;
        case "clear":
          clearCurrent();
          break;
        case "incomplete":
          if (correctionAcceptedAnswer) {
            const firstErrorOffset = answer.indexOf(CORRECTION_SLOT_PLACEHOLDER);
            setShortcutNotice(null);
            if (firstErrorOffset >= 0) {
              focusInputRange(
                firstErrorOffset,
                firstErrorOffset + CORRECTION_SLOT_PLACEHOLDER.length,
              );
            }
          } else {
            setShortcutNotice("Complete every word slot before checking.");
          }
          break;
        case "submit":
          void submit();
          break;
        case "next":
          advance();
          break;
        case "mark-mastered":
          void markMastered();
          break;
        case "toggle-vocabulary":
          void toggleVocabulary();
          break;
        case "retry":
          retryCurrent();
          break;
        case "play-audio":
          playAudio();
          break;
        case "toggle-answer":
          void toggleAnswer();
          break;
        case "resume-editing":
          resumeEditing();
          break;
        case "previous":
          previous();
          break;
        case "skip":
          void skipCurrent();
          break;
        case "toggle-pause":
          togglePause();
          break;
      }
    },
    [
      advance,
      appendCharacter,
      answer,
      clearCurrent,
      correctionAcceptedAnswer,
      deleteCharacter,
      failedOperation,
      focusInputRange,
      markMastered,
      playAudio,
      previous,
      retryCurrent,
      resumeEditing,
      skipCurrent,
      submit,
      toggleAnswer,
      togglePause,
      toggleVocabulary,
      triggerKeyFeedback,
    ],
  );

  const runShortcut = useCallback(
    (command: PracticeKeyCommand) => {
      runCommand(command);
      focusBoard();
    },
    [focusBoard, runCommand],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      const startingCapture = startingRecallCaptureRef.current;
      if (startingCapture?.isActive) {
        startingRecallFeedbackRef.current = null;
        const command = resolvePracticeKey({
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          altGraphKey: event.getModifierState("AltGraph"),
          metaKey: event.metaKey,
          isComposing: event.nativeEvent.isComposing,
          hasAnswer: Boolean(startingCapture.draft.trim()),
          hasResult: false,
          isAttemptComplete: false,
          canAdvance: false,
          isSubmitting: false,
          isPaused: false,
        });

        if (command?.type === "append" || command?.type === "delete") {
          startingRecallFeedbackRef.current = {
            command,
            stroke: resolveFingerGuideStroke({
              altGraphKey: event.getModifierState("AltGraph"),
              altKey: event.altKey,
              code: event.code,
              command,
              ctrlKey: event.ctrlKey,
              isComposing: event.nativeEvent.isComposing,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
            }),
          };
          return;
        }

        if (command?.type === "clear") {
          event.preventDefault();
          const clearedCapture = {
            ...startingCapture,
            draft: "",
            selectionStart: 0,
            selectionEnd: 0,
          };
          startingRecallCaptureRef.current = clearedCapture;
          setStartingRecallCapture(clearedCapture);
          triggerFingerGuide(event, command);
          triggerKeyFeedback(command);
          return;
        }

        if (command || event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
        }
        return;
      }

      if (isSubmitting || isPracticeInteractionLocked) {
        event.preventDefault();
        return;
      }

      if (
        isFirstExposure
        && event.key === "Enter"
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !event.getModifierState("AltGraph")
      ) {
        event.preventDefault();
        triggerKeyFeedback({ type: "next" });
        void startRecall();
        return;
      }

      if (
        correctionAcceptedAnswer
        && event.key === " "
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !event.getModifierState("AltGraph")
        && !event.nativeEvent.isComposing
      ) {
        const selectionEnd = event.currentTarget.selectionEnd ?? 0;
        const navigation = resolveCorrectionSpaceNavigation(answer, selectionEnd);

        if (navigation) {
          event.preventDefault();
          triggerFingerGuide(event, navigation.command);
          triggerKeyFeedback(navigation.command);
          focusInputRange(
            navigation.selectionStart,
            navigation.selectionEnd,
          );
          return;
        }
      }

      const command = resolvePracticeKey({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        altGraphKey: event.getModifierState("AltGraph"),
        metaKey: event.metaKey,
        isComposing: event.nativeEvent.isComposing,
        hasAnswer: Boolean(answer.trim()),
        hasResult: Boolean(lastResult),
        isAttemptComplete: Boolean(preview?.isComplete),
        canAdvance: lastResult?.evaluation.outcome === "perfect",
        isSubmitting,
        isPaused,
      });

      if (!command) {
        return;
      }

      if (isFirstExposure && [
        "append",
        "delete",
        "clear",
        "incomplete",
        "submit",
        "next",
        "retry",
        "resume-editing",
      ].includes(command.type)) {
        event.preventDefault();
        return;
      }

      triggerFingerGuide(event, command);

      if (command.type === "append" || command.type === "delete") {
        triggerKeyFeedback(command);
        return;
      }

      event.preventDefault();
      runCommand(command);
    },
    [
      answer,
      correctionAcceptedAnswer,
      focusInputRange,
      isFirstExposure,
      isPaused,
      isSubmitting,
      isPracticeInteractionLocked,
      lastResult,
      preview?.isComplete,
      runCommand,
      startRecall,
      triggerFingerGuide,
      triggerKeyFeedback,
    ],
  );

  const handleCaptureChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextAnswer = event.currentTarget.value;
      const nextSelectionStart = event.currentTarget.selectionStart ?? nextAnswer.length;
      const nextSelectionEnd = event.currentTarget.selectionEnd ?? nextAnswer.length;
      const inputEvent = event.nativeEvent as InputEvent;
      const startingCapture = startingRecallCaptureRef.current;

      if (startingCapture?.isActive) {
        const maximumLength = activeItem
          ? Math.max(activeItem.card.english.length * 2, 160)
          : 160;
        const boundedAnswer = nextAnswer.slice(0, maximumLength);
        const nextCapture = {
          ...startingCapture,
          draft: boundedAnswer,
          isComposing: inputEvent.isComposing,
          selectionStart: Math.min(nextSelectionStart, boundedAnswer.length),
          selectionEnd: Math.min(nextSelectionEnd, boundedAnswer.length),
        };
        const pendingFeedback = startingRecallFeedbackRef.current;
        startingRecallCaptureRef.current = nextCapture;
        startingRecallFeedbackRef.current = null;
        setStartingRecallCapture(nextCapture);

        if (pendingFeedback) {
          showFingerGuideStroke(pendingFeedback.stroke);
          triggerKeyFeedback(pendingFeedback.command);
        } else if (boundedAnswer !== startingCapture.draft) {
          triggerKeyFeedback(boundedAnswer.length < startingCapture.draft.length
            ? { type: "delete" }
            : { type: "append", value: inputEvent.data ?? boundedAnswer });
        }
        if (nextCapture.isLifecycleReady && !nextCapture.isComposing) {
          finishStartingRecallCapture();
        }
        return;
      }

      updateAnswerFromCapture(
        nextAnswer,
        nextSelectionStart,
        nextSelectionEnd,
        inputEvent.isComposing,
      );
    },
    [
      activeItem,
      finishStartingRecallCapture,
      showFingerGuideStroke,
      triggerKeyFeedback,
      updateAnswerFromCapture,
    ],
  );

  const handleInputSelect = useCallback((selectionStart: number, selectionEnd: number) => {
    const startingCapture = startingRecallCaptureRef.current;
    if (startingCapture) {
      const nextCapture = { ...startingCapture, selectionStart, selectionEnd };
      startingRecallCaptureRef.current = nextCapture;
      setStartingRecallCapture(nextCapture);
      return;
    }

    setCaretOffset(selectionStart);
    setSelectionEndOffset(selectionEnd);
  }, []);

  const selectWord = useCallback(
    (index: number, token: AttemptPreviewToken) => {
      const input = inputRef.current;

      if (
        !input
        || isPaused
        || isSubmitting
        || isUpdatingStatus
        || lastResult?.evaluation.outcome === "perfect"
      ) {
        return;
      }

      const ranges = wordRanges(answer);
      const typedIndex = token.typedIndex
        ?? displayPreview?.tokens
          .slice(index + 1)
          .find((candidate) => candidate.typedIndex !== null)
          ?.typedIndex
        ?? ranges.length;
      const range = ranges[typedIndex];
      const start = range?.start ?? answer.length;
      const end = token.typedIndex !== null ? (range?.end ?? start) : start;

      input.focus({ preventScroll: true });
      input.setSelectionRange(start, end);
      setCaretOffset(start);
      setSelectionEndOffset(end);
    },
    [
      answer,
      displayPreview?.tokens,
      isPaused,
      isSubmitting,
      isUpdatingStatus,
      lastResult,
    ],
  );

  const selectExtraWord = useCallback(
    (typedIndex: number) => {
      const input = inputRef.current;
      const range = wordRanges(answer)[typedIndex];

      if (
        !input
        || !range
        || isPaused
        || isSubmitting
        || isUpdatingStatus
        || lastResult?.evaluation.outcome === "perfect"
      ) {
        return;
      }

      input.focus({ preventScroll: true });
      input.setSelectionRange(range.start, range.end);
      setCaretOffset(range.start);
      setSelectionEndOffset(range.end);
    },
    [answer, isPaused, isSubmitting, isUpdatingStatus, lastResult],
  );

  const performStartOver = useCallback(async () => {
    if (isRestarting) return;
    if (failedOperation?.kind === "audio-save") {
      void failedOperation.retry();
      return;
    }
    setIsRestarting(true);
    setRestartError(null);
    try {
      if (checkpointSaveTimerRef.current !== null) {
        window.clearTimeout(checkpointSaveTimerRef.current);
        checkpointSaveTimerRef.current = null;
      }
      await enqueueCheckpointOperation(practiceCheckpointOperationQueue, async () => {
        const checkpoint = latestCheckpointRef.current;
        if (!checkpoint) return;
        await controllerRef.current.commitPracticeSessionTerminal({
          kind: "terminal",
          checkpoint,
          terminal: { kind: "abandoned", reason: "start-over" },
        });
      });
      latestCheckpointRef.current = null;
      latestCheckpointSeedRef.current = null;
      latestCheckpointIdentityRef.current = null;
      occurrenceIdsRef.current = [];
      terminalCommitStartedRef.current = false;
      terminalCommitPromiseRef.current = null;
      setSessionGeneration((current) => current + 1);
      setIsRestartDialogOpen(false);
    } catch (caught) {
      setRestartError("Practice could not be restarted. Your current round remains available.");
    } finally {
      setIsRestarting(false);
    }
  }, [failedOperation, isRestarting]);

  const requestStartOver = useCallback(() => {
    if (failedOperation?.kind === "audio-save") {
      void failedOperation.retry();
      return;
    }
    if (answer.trim() || pendingReturnCount > 0) {
      setRestartError(null);
      setIsRestartDialogOpen(true);
      return;
    }
    void performStartOver();
  }, [answer, failedOperation, pendingReturnCount, performStartOver]);

  const restartRound = useCallback(() => {
    void performStartOver();
  }, [performStartOver]);

  const cancelSessionReplacement = useCallback(() => {
    if (!replacementCheckpoint || isReplacingSession) return;
    setReplacementError(null);
    onResumeActivePractice(structuredClone(replacementCheckpoint.scope));
  }, [isReplacingSession, onResumeActivePractice, replacementCheckpoint]);

  const confirmSessionReplacement = useCallback(async () => {
    if (!replacementCheckpoint || isReplacingSession) return;
    setIsReplacingSession(true);
    setReplacementError(null);
    try {
      await enqueueCheckpointOperation(practiceCheckpointOperationQueue, async () => {
        await controllerRef.current.commitPracticeSessionTerminal({
          kind: "terminal",
          checkpoint: replacementCheckpoint,
          terminal: { kind: "abandoned", reason: "replaced" },
        });
      });
      setReplacementCheckpoint(null);
      setSessionGeneration((current) => current + 1);
    } catch (caught) {
      setReplacementError(
        "The current Practice session could not be closed. It remains available and no new session was started.",
      );
    } finally {
      setIsReplacingSession(false);
    }
  }, [isReplacingSession, replacementCheckpoint]);

  const refreshAfterQuickStartDismissal = useCallback(async () => {
    try {
      await onDismissQuickStart();
      setFailedOperation(null);
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry refreshing Quick Start",
        locksPractice: false,
        message: "Quick Start was dismissed safely, but this screen could not refresh.",
        retry: () => void refreshAfterQuickStartDismissal(),
      });
    }
  }, [onDismissQuickStart]);

  const refreshAfterQuickStartCompletion = useCallback(async () => {
    try {
      await onCompleteQuickStart();
      setFailedOperation(null);
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry refreshing Quick Start",
        locksPractice: false,
        message: "Quick Start completion is safely stored, but this screen could not refresh.",
        retry: () => void refreshAfterQuickStartCompletion(),
      });
    }
  }, [onCompleteQuickStart]);

  const dismissQuickStart = useCallback(async () => {
    if (!quickStartSession || isUpdatingStatus) {
      return;
    }
    if (failedOperation?.kind === "audio-save") {
      void failedOperation.retry();
      return;
    }

    setIsUpdatingStatus(true);
    setFailedOperation(null);
    try {
      await enqueueCheckpointOperation(practiceCheckpointOperationQueue, async () => {
        const checkpoint = latestCheckpointRef.current;
        if (!checkpoint) {
          throw new Error("The active Quick Start lifecycle is unavailable.");
        }
        await controllerRef.current.commitPracticeSessionTerminal({
          kind: "terminal",
          checkpoint,
          terminal: { kind: "dismissed", reason: "quick-start-dismissed" },
          quickStartPreference: { version: 1, status: "dismissed" },
        });
      });
      latestCheckpointRef.current = null;
      latestCheckpointSeedRef.current = null;
      latestCheckpointIdentityRef.current = null;
      occurrenceIdsRef.current = [];
      await refreshAfterQuickStartDismissal();
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry skipping Quick Start",
        locksPractice: true,
        message: "Quick Start could not be dismissed. Your current step remains available.",
        retry: () => void dismissQuickStart(),
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [failedOperation, isUpdatingStatus, quickStartSession, refreshAfterQuickStartDismissal]);

  const completeQuickStart = useCallback(async () => {
    if (!quickStartSession || isUpdatingStatus) {
      return;
    }
    if (failedOperation?.kind === "audio-save") {
      void failedOperation.retry();
      return;
    }

    setIsUpdatingStatus(true);
    setFailedOperation(null);
    try {
      await commitCompletedLifecycle();
      await refreshAfterQuickStartCompletion();
    } catch (caught) {
      setFailedOperation({
        kind: "operation",
        label: "Retry finishing Quick Start",
        locksPractice: true,
        message: "Quick Start completion could not be saved. Your learning evidence remains available.",
        retry: () => void completeQuickStart(),
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    commitCompletedLifecycle,
    failedOperation,
    isUpdatingStatus,
    quickStartSession,
    refreshAfterQuickStartCompletion,
  ]);

  useEffect(() => {
    const delay = fingerGuideStrokeRef.current?.code === "Enter" ? 150 : 0;
    returnFingerGuideHome(delay);
  }, [activeItem?.card.id, returnFingerGuideHome]);

  useEffect(() => {
    if (
      isPaused
      || isUpdatingStatus
      || lastResult?.evaluation.outcome === "perfect"
    ) {
      if (fingerGuideStrokeRef.current?.code !== "Enter") {
        returnFingerGuideHome();
      }
    }
  }, [
    isPaused,
    isUpdatingStatus,
    lastResult?.evaluation.outcome,
    returnFingerGuideHome,
  ]);

  useEffect(() => {
    if (activeItem && checkpointStatus === "ready") {
      focusBoard();
    }
  }, [activeItem?.card.id, checkpointStatus, focusBoard]);

  if (controller.status === "loading") {
    return (
      <section className="center-panel">
        <Loader2 className="spin" size={24} />
        <p>Loading local practice data...</p>
      </section>
    );
  }

  if (controller.error) {
    return (
      <section className="center-panel">
        <XCircle size={24} />
        <p>{controller.error}</p>
      </section>
    );
  }

  if (!scope || !session) {
    return (
      <section className="center-panel">
        <BookOpenCheck size={28} />
        <h3>Choose a lesson</h3>
        <p>Open Courses to start from the recommended point in your learning path.</p>
        <button className="primary-button" onClick={onOpenCourses} type="button">Browse courses</button>
      </section>
    );
  }

  if (session.emptyReason === "blocked-content") {
    return (
      <section className="center-panel" role="status">
        <XCircle aria-hidden="true" size={28} />
        <h3>Content unavailable</h3>
        <p>This content cannot be practiced safely; replace or re-import it before trying again.</p>
        <button className="primary-button" onClick={onOpenCourses} type="button">
          Browse courses
        </button>
      </section>
    );
  }

  if (replacementCheckpoint) {
    return (
      <PracticeSessionReplacementConfirmation
        error={replacementError}
        isPending={isReplacingSession}
        onCancel={cancelSessionReplacement}
        onConfirm={() => void confirmSessionReplacement()}
      />
    );
  }

  if (checkpointStatus === "loading") {
    return (
      <>
        {session.blockedCardIds.length > 0 && (
          <BlockedPracticeContentNotice
            count={session.blockedCardIds.length}
            onOpenCourses={onOpenCourses}
          />
        )}
        <section aria-live="polite" className="center-panel">
          <Loader2 className="spin" size={24} />
          <h3>Restoring local practice</h3>
          <p>Checking this scope against your last saved turn…</p>
        </section>
      </>
    );
  }

  if (isSessionComplete && quickStartSession) {
    return (
      <section className="practice-layout quick-start-completion" aria-labelledby="quick-start-completion-title">
        <QuickStartGuide onDismiss={() => {}} showDismiss={false} step={6} />
        <div className="session-summary-heading">
          <Trophy aria-hidden="true" size={30} />
          <div>
            <p className="eyebrow">Quick Start complete</p>
            <h3 id="quick-start-completion-title">You have learned the full loop</h3>
            <span>Independent First Passes enter spaced Review. Support stays available whenever recall needs help.</span>
          </div>
        </div>
        {failedOperation && (
          <div aria-live="assertive" className="practice-operation-error" role="alert">
            <span>{failedOperation.message}</span>
            <button className="secondary-button" onClick={failedOperation.retry} type="button">
              {failedOperation.label}
            </button>
          </div>
        )}
        <div className="practice-actions">
          <button
            className="primary-button"
            disabled={isUpdatingStatus}
            onClick={() => void completeQuickStart()}
            type="button"
          >
            {isUpdatingStatus ? "Saving…" : "Continue learning"}
          </button>
        </div>
      </section>
    );
  }

  if (isSessionComplete) {
    return (
      <SessionSummary
        elapsedSeconds={elapsedSeconds}
        nextLesson={nextLesson}
        onOpenCourses={scope.kind === "course"
          ? () => onOpenCourse(scope.courseId)
          : onOpenCourses}
        onRepeat={restartRound}
        onStartNextLesson={(action) => onStartLesson(action.courseId, action.lessonId)}
        pendingReturnCount={pendingReturnCount}
        scope={scope}
        stats={sessionStats}
      />
    );
  }

  if (!activeItem) {
    if (checkpointRecovery) {
      return (
        <section className="center-panel practice-checkpoint-recovery" role="status">
          <XCircle size={28} />
          <h3>Previous practice could not be resumed</h3>
          <p>{checkpointRecovery.message}</p>
          <div className="practice-actions">
            <button
              className="primary-button"
              onClick={() => {
                setCheckpointRecovery(null);
                onContinueRecommended();
              }}
              type="button"
            >
              Continue recommended
            </button>
            <button className="secondary-button" onClick={onOpenCourses} type="button">
              Browse courses
            </button>
          </div>
        </section>
      );
    }

    const isLessonPending = session.emptyReason === "lesson-pending"
      && scope.kind === "lesson"
      && scope.mode === "learn";
    const pendingLessonCount = isLessonPending
      ? Math.max(1, (session.context?.totalCards ?? 1) - (session.context?.passedCards ?? 0))
      : 0;
    const emptyHeading = isLessonPending
      ? "Round complete"
      : scope.kind === "review"
      ? "Review complete"
      : scope.kind === "vocabulary"
        ? "Vocabulary is empty"
        : scope.kind === "course"
          ? "Course replay complete"
          : scope.kind === "focused"
            ? "Focused Practice unavailable"
            : "Lesson complete";

    return (
      <section className="center-panel">
        <CheckCircle2 size={28} />
        <h3>{emptyHeading}</h3>
        <p>
          {isLessonPending
            ? `${pendingLessonCount} sentence${pendingLessonCount === 1 ? "" : "s"} still need${pendingLessonCount === 1 ? "s" : ""} another Independent Recall. Review will show ${pendingLessonCount === 1 ? "it" : "them"} when ${pendingLessonCount === 1 ? "it is" : "they are"} due.`
            : scope.kind === "review"
            ? "There are no attempted sentences due right now."
            : scope.kind === "vocabulary"
              ? "Save a sentence with Control N, then practice it here."
              : scope.kind === "course"
                ? "Every available sentence in this course replay has been completed or mastered."
                : scope.kind === "focused"
                  ? "This sentence is no longer eligible for Focused Practice. Return to Progress for the current weak-card list."
                  : "Every sentence in this lesson has a First Pass."}
        </p>
        <div className="practice-actions">
          {isLessonPending && (
            <button
              className="primary-button"
              onClick={() => onOpenReview(scope.courseId)}
              type="button"
            >
              Review when ready
            </button>
          )}
          {!isLessonPending && nextLesson && (
            <button
              className="primary-button"
              onClick={() => onStartLesson(nextLesson.courseId, nextLesson.lessonId)}
              type="button"
            >
              Next lesson: {nextLesson.lessonTitle}
            </button>
          )}
          <button
            className={isLessonPending || nextLesson ? "secondary-button" : "primary-button"}
            onClick={scope.kind === "course" ? () => onOpenCourse(scope.courseId) : onOpenCourses}
            type="button"
          >
            {isLessonPending
              ? "Choose lesson"
              : scope.kind === "course"
              ? "View course"
              : scope.kind === "lesson" && scope.mode === "learn"
                ? "View learning path"
                : "View courses"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        className={`practice-layout practice-layout-stage ${
          checkpointRecovery || session.blockedCardIds.length > 0 || activeQuickStartStep
            ? "is-flowing"
            : ""
        }`}
      >
      {checkpointRecovery && (
        <div className="practice-checkpoint-recovery" role="status">
          <div>
            <strong>Previous practice could not be resumed</strong>
            <span>{checkpointRecovery.message}</span>
          </div>
          <div>
            <button
              className="secondary-button"
              onClick={() => {
                setCheckpointRecovery(null);
                onContinueRecommended();
              }}
              type="button"
            >
              Continue recommended
            </button>
            <button className="secondary-button" onClick={onOpenCourses} type="button">
              Browse courses
            </button>
            <button
              aria-label="Dismiss checkpoint recovery notice"
              className="checkpoint-recovery-dismiss"
              onClick={() => setCheckpointRecovery(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {session.blockedCardIds.length > 0 && (
        <BlockedPracticeContentNotice
          count={session.blockedCardIds.length}
          onOpenCourses={onOpenCourses}
        />
      )}
      {activeQuickStartStep && (
        <QuickStartGuide
          isDismissDisabled={isPracticeInteractionLocked}
          onDismiss={() => void dismissQuickStart()}
          phase={activeQuickStartStep.kind === "first-exposure" ? "first-exposure" : "recall"}
          step={activeQuickStartStep.guideStep}
        />
      )}
      <SentenceGameBoard
        activeItem={activeItem}
        answer={practiceAnswer}
        boardRef={boardRef}
        context={activeContext}
        currentNumber={currentIndex + 1}
        activeWordIndex={activeWordIndex}
        elapsedSeconds={elapsedSeconds}
        fingerGuidePulse={fingerGuideFeedback.pulse}
        fingerGuideStroke={fingerGuideFeedback.stroke}
        fingerGuideMode={fingerGuideMode}
        inputRef={inputRef}
        isAnswerVisible={isAnswerVisible}
        isCorrecting={Boolean(correctionAcceptedAnswer)}
        isInVocabulary={isInVocabulary}
        isFingerGuideMuted={isFingerGuideMuted}
        isKeySoundEnabled={isSoundEnabled}
        isKeySoundSupported={isSoundSupported}
        isPaused={isPaused}
        isStartingRecallCapture={isStartingRecallCaptureActive}
        isSubmitting={isSubmitting}
        suppressRestoredTarget={suppressRestoredTarget}
        isUpdatingStatus={isPracticeInteractionLocked}
        keyPulse={keyPulse}
        lastGrade={lastGrade}
        lastResult={lastResult}
        failedOperation={failedOperation}
        practiceTurn={practiceTurn}
        quickStartExposureStyle={activeQuickStartStep?.kind === "first-exposure"
          ? activeQuickStartStep.exposureStyle
          : undefined}
        onAnswerChange={handleCaptureChange}
        onBoardPointerDown={focusBoard}
        onKeyDown={handleKeyDown}
        onInputSelect={handleInputSelect}
        onMarkMastered={() => runShortcut({ type: "mark-mastered" })}
        onNext={() => runShortcut({ type: "next" })}
        onPause={() => runShortcut({ type: "toggle-pause" })}
        onPlayAudio={() => runShortcut({ type: "play-audio" })}
        onPrevious={() => runShortcut({ type: "previous" })}
        onResumeEditing={() => runShortcut({ type: "resume-editing" })}
        onRetryOperation={() => failedOperation?.retry()}
        onRetry={() => runShortcut({ type: "retry" })}
        onStartRecall={() => void startRecall()}
        onStartOver={requestStartOver}
        onSkip={() => runShortcut({ type: "skip" })}
        onSubmit={() => runShortcut({ type: "submit" })}
        onExtraWordSelect={selectExtraWord}
        onWordSelect={selectWord}
        onToggleAnswer={() => runShortcut({ type: "toggle-answer" })}
        onToggleKeySound={() => {
          toggleKeySound();
          focusBoard();
        }}
        onToggleVocabulary={() => runShortcut({ type: "toggle-vocabulary" })}
        preview={displayPreview}
        progress={progress}
        sessionStats={sessionStats}
        scope={scope}
        shortcutNotice={shortcutNotice ?? soundPreferenceError}
        totalItems={sessionItems.length}
      />
      </section>
      <ConfirmationDialog
        confirmLabel="Start over"
        danger={false}
        description={pendingReturnCount > 0
          ? "This clears the current draft and pending in-round returns, then rebuilds the same Practice scope from its first sentence. Durable learning evidence stays intact."
          : "This clears the current draft and restarts the same Practice scope from its first sentence. Durable learning evidence stays intact."}
        error={restartError}
        id="practice-start-over"
        isPending={isRestarting}
        onCancel={() => {
          if (!isRestarting) {
            setIsRestartDialogOpen(false);
            setRestartError(null);
          }
        }}
        onConfirm={() => void performStartOver()}
        open={isRestartDialogOpen}
        pendingLabel="Restarting…"
        title="Start this Practice round over?"
      />
    </>
  );
}

function isNativeInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, [contenteditable='true']"));
}

function enqueueCheckpointOperation(
  queue: { current: Promise<void> },
  operation: () => Promise<void>,
): Promise<void> {
  const next = queue.current.catch(() => undefined).then(operation);
  queue.current = next;
  return next;
}

export function PracticeSessionReplacementConfirmation({
  error,
  isPending,
  onCancel,
  onConfirm,
}: {
  error: string | null;
  isPending: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <>
      <section className="center-panel" role="status">
        <Pause aria-hidden="true" size={28} />
        <h3>Another Practice session is still active</h3>
        <p>Keep that session, or explicitly close it before starting this different Practice scope.</p>
      </section>
      <ConfirmationDialog
        confirmLabel="Close it and start new"
        danger={false}
        description="Cancel returns to the active Practice session with its draft intact. Confirming records that session as replaced, then starts this new scope."
        error={error}
        id="practice-session-replacement"
        isPending={isPending}
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
        pendingLabel="Starting new Practice…"
        title="Replace the active Practice session?"
      />
    </>
  );
}

export function transitionCheckpointAfterFirstExposure({
  checkpoint,
  currentOccurrenceId,
  nextStandardTurn,
  draft = "",
  selectionStart = 0,
  selectionEnd = selectionStart,
}: {
  checkpoint: PracticeSessionCheckpointV2;
  currentOccurrenceId: string;
  nextStandardTurn: PracticeTurn | null;
  draft?: string;
  selectionStart?: number;
  selectionEnd?: number;
}): PracticeSessionCheckpointV2 {
  const currentIndex = checkpoint.itinerary.findIndex(
    (occurrence) => occurrence.id === currentOccurrenceId,
  );
  if (currentIndex < 0) {
    throw new Error("The First Exposure occurrence is unavailable in the active checkpoint.");
  }

  const itinerary = structuredClone(checkpoint.itinerary);
  if (nextStandardTurn) {
    const turn = {
      turnId: nextStandardTurn.id,
      phase: nextStandardTurn.phase,
      supportLevelUsed: nextStandardTurn.supportLevelUsed,
      supportKindsUsed: [...nextStandardTurn.supportKindsUsed],
      receivedCorrection: nextStandardTurn.receivedCorrection,
      reviewFailureRecorded: nextStandardTurn.reviewFailureRecorded,
      submissionIndex: 0,
    };
    itinerary[currentIndex] = { ...itinerary[currentIndex], turn };
    return {
      ...checkpoint,
      itinerary,
      currentOccurrenceId,
      draft,
      selectionStart,
      selectionEnd,
      turn,
      itemElapsedSeconds: 0,
    };
  }

  itinerary[currentIndex] = { ...itinerary[currentIndex], status: "completed" };
  const next = itinerary[currentIndex + 1];
  if (!next) {
    return { ...checkpoint, itinerary, draft, selectionStart, selectionEnd };
  }
  return {
    ...checkpoint,
    itinerary,
    currentOccurrenceId: next.id,
    draft,
    selectionStart,
    selectionEnd,
    turn: structuredClone(next.turn),
    itemElapsedSeconds: 0,
  };
}

function BlockedPracticeContentNotice({
  count,
  onOpenCourses,
}: {
  count: number;
  onOpenCourses(): void;
}) {
  return (
    <div className="practice-checkpoint-recovery" role="status">
      <div>
        <strong>
          {count} sentence{count === 1 ? " was" : "s were"} quarantined
        </strong>
        <span>Unsafe recall content was removed from this queue without showing its prompt or target.</span>
      </div>
      <button className="secondary-button" onClick={onOpenCourses} type="button">
        Replace or re-import content
      </button>
    </div>
  );
}

interface SentenceGameBoardProps {
  activeItem: PracticeSessionItem;
  activeWordIndex: number;
  answer: string;
  boardRef: RefObject<HTMLDivElement | null>;
  context: PracticeContext | null;
  currentNumber: number;
  elapsedSeconds: number;
  fingerGuidePulse: number;
  fingerGuideStroke: FingerGuideStroke | null;
  fingerGuideMode: FingerGuideMode;
  inputRef: RefObject<HTMLInputElement | null>;
  isAnswerVisible: boolean;
  isCorrecting: boolean;
  isFingerGuideMuted: boolean;
  isInVocabulary: boolean;
  isKeySoundEnabled: boolean;
  isKeySoundSupported: boolean;
  isPaused: boolean;
  isStartingRecallCapture: boolean;
  isSubmitting: boolean;
  suppressRestoredTarget: boolean;
  isUpdatingStatus: boolean;
  keyPulse: number;
  lastGrade: RecallGrade | null;
  lastResult: SubmitResult | null;
  failedOperation: PracticeFailedOperation | null;
  practiceTurn: PracticeTurn | null;
  quickStartExposureStyle?: "full" | "abbreviated";
  onAnswerChange(event: ChangeEvent<HTMLInputElement>): void;
  onBoardPointerDown(): void;
  onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void;
  onInputSelect(selectionStart: number, selectionEnd: number): void;
  onMarkMastered(): void;
  onNext(): void;
  onPause(): void;
  onPlayAudio(): void;
  onPrevious(): void;
  onResumeEditing(): void;
  onRetryOperation(): void;
  onRetry(): void;
  onStartRecall(): void;
  onStartOver(): void;
  onSkip(): void;
  onSubmit(): void;
  onExtraWordSelect(typedIndex: number): void;
  onWordSelect(index: number, token: AttemptPreviewToken): void;
  onToggleAnswer(): void;
  onToggleKeySound(): void;
  onToggleVocabulary(): void;
  preview: AttemptPreview | null;
  progress: number;
  sessionStats: SessionStats;
  scope: PracticeScope;
  shortcutNotice: string | null;
  totalItems: number;
}

function SentenceGameBoard({
  activeItem,
  activeWordIndex,
  answer,
  boardRef,
  context,
  currentNumber,
  elapsedSeconds,
  fingerGuidePulse,
  fingerGuideStroke,
  fingerGuideMode,
  inputRef,
  isAnswerVisible,
  isCorrecting,
  isFingerGuideMuted,
  isInVocabulary,
  isKeySoundEnabled,
  isKeySoundSupported,
  isPaused,
  isStartingRecallCapture,
  isSubmitting,
  suppressRestoredTarget,
  isUpdatingStatus,
  keyPulse,
  lastGrade,
  lastResult,
  failedOperation,
  practiceTurn,
  quickStartExposureStyle,
  onAnswerChange,
  onBoardPointerDown,
  onKeyDown,
  onInputSelect,
  onMarkMastered,
  onNext,
  onPause,
  onPlayAudio,
  onPrevious,
  onResumeEditing,
  onRetryOperation,
  onRetry,
  onStartRecall,
  onStartOver,
  onSkip,
  onSubmit,
  onExtraWordSelect,
  onWordSelect,
  onToggleAnswer,
  onToggleKeySound,
  onToggleVocabulary,
  preview,
  progress,
  sessionStats,
  scope,
  shortcutNotice,
  totalItems,
}: SentenceGameBoardProps) {
  const boardState = lastResult?.evaluation.outcome ?? "typing";
  const accuracy = lastResult ? Math.round(lastResult.evaluation.accuracy * 100) : null;
  const keyPulseClass = keyPulse > 0 ? `key-pulse-${keyPulse % 2 === 0 ? "even" : "odd"}` : "";
  const isAnswerHintVisible = isAnswerVisible;
  const isFirstExposure = practiceTurn?.phase === "first-exposure";
  const supportMode = isFirstExposure
    ? "first-exposure" as const
    : lastResult?.evaluation.outcome === "perfect"
      ? "result" as const
      : "recall" as const;
  const showsRecallAnswer = supportMode === "recall" && isAnswerHintVisible;
  const showsLearningSupport = supportMode !== "recall" || showsRecallAnswer;

  return (
    <div
      aria-describedby="practice-keyboard-help"
      aria-label="Sentence recall practice"
      className={`game-shell game-shell-${boardState} ${keyPulseClass}`}
      onPointerDown={(event) => {
        if (!isNativeInteractiveTarget(event.target)) {
          onBoardPointerDown();
        }
      }}
      ref={boardRef}
      role="group"
    >
      <p className="sr-only" id="practice-keyboard-help">
        Type the English sentence directly. Press Control Quote for audio, Control M to mark mastered,
        Control N to save to Vocabulary, Enter to check or continue, and Control Semicolon to show the answer or retry.
        Shift Left Arrow goes to the previous sentence, Shift Right Arrow skips, and Control P pauses.
        Backspace deletes and Escape clears your typing.
      </p>
      <p aria-live="polite" className="sr-only">
        {isCorrecting
          ? `Attempt ${sessionStats.attempts}. Incorrect words cleared. Focus moved to the first correction point.`
          : ""}
      </p>
      <input
        aria-describedby="practice-keyboard-help"
        aria-label="Type the target sentence"
        autoCapitalize="off"
        autoComplete="off"
        className="practice-input-capture"
        maxLength={Math.max(activeItem.card.english.length * 2, 160)}
        onChange={onAnswerChange}
        onKeyDown={onKeyDown}
        onSelect={(event) => onInputSelect(
          event.currentTarget.selectionStart ?? answer.length,
          event.currentTarget.selectionEnd ?? answer.length,
        )}
        readOnly={
          isPaused
          || isSubmitting
          || (isUpdatingStatus && !isStartingRecallCapture)
          || (isFirstExposure && !isStartingRecallCapture)
          || lastResult?.evaluation.outcome === "perfect"
        }
        ref={inputRef}
        spellCheck={false}
        type="text"
        value={answer}
      />

      <div className="game-topbar">
        <div className="game-lesson">
          <span className="game-round">{labelForScope(scope)}</span>
          <strong>{context ? [context.courseTitle, context.lessonTitle].filter(Boolean).join(" · ") : activeItem.card.source}</strong>
          <span>
            {context?.objective ? `${context.objective} · ` : ""}Stage {activeItem.reviewState.stage}
            {isInVocabulary ? " · Vocabulary" : ""}
            {practiceTurn ? ` · ${labelForPracticePhase(practiceTurn.phase)}` : ""}
          </span>
        </div>
        <div className="game-topbar-actions">
          {failedOperation && !failedOperation.locksPractice && (
            <>
              <span aria-live="polite" className="sr-only" role="status">
                {failedOperation.message}
              </span>
              <button
                aria-label={`${failedOperation.label}: ${failedOperation.message}`}
                className="practice-save-attention"
                onClick={onRetryOperation}
                title={failedOperation.message}
                type="button"
              >
                <AlertCircle aria-hidden="true" size={16} />
                <span>Save needs attention</span>
              </button>
            </>
          )}
          <div className="game-navigation" aria-label="Session controls">
            <button
              aria-label="Previous sentence, shortcut Shift plus Left Arrow"
              disabled={isPaused || isSubmitting || isUpdatingStatus || currentNumber <= 1}
              onClick={onPrevious}
              title="Previous sentence · Shift+←"
              type="button"
            >
              <ArrowLeft size={17} />
            </button>
            <button
              aria-label={isPaused ? "Resume practice, shortcut Control plus P" : "Pause practice, shortcut Control plus P"}
              aria-pressed={isPaused}
              onClick={onPause}
              title={`${isPaused ? "Resume" : "Pause"} · Ctrl+P`}
              type="button"
            >
              {isPaused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button
              aria-label="Skip sentence, shortcut Shift plus Right Arrow"
              disabled={isPaused || isSubmitting || isUpdatingStatus || lastResult?.evaluation.outcome === "perfect"}
              onClick={onSkip}
              title="Skip sentence · Shift+→"
              type="button"
            >
              <ArrowRight size={17} />
            </button>
            <button
              aria-label="Start this Practice round over"
              disabled={isSubmitting || isUpdatingStatus}
              onClick={onStartOver}
              title="Start over"
              type="button"
            >
              <RotateCcw size={17} />
            </button>
          </div>
          <button
            aria-label={isKeySoundSupported
              ? `Key sounds ${isKeySoundEnabled ? "on" : "off"}`
              : "Key sounds unavailable"}
            aria-pressed={isKeySoundEnabled}
            className="key-sound-toggle"
            disabled={!isKeySoundSupported}
            onClick={onToggleKeySound}
            title={isKeySoundSupported
              ? `Key sounds ${isKeySoundEnabled ? "on" : "off"}`
              : "Key sounds unavailable"}
            type="button"
          >
            {isKeySoundEnabled ? <Volume1 size={17} /> : <VolumeX size={17} />}
          </button>
          <div
            className="game-score"
            aria-label={`Session score ${sessionStats.score}, combo ${sessionStats.combo}, elapsed ${formatDuration(elapsedSeconds)}`}
          >
            <span>{sessionStats.score.toString().padStart(6, "0")}</span>
            <strong>
              {sessionStats.combo > 0 ? `Combo x ${sessionStats.combo}` : "Combo ready"}
              {" · "}{currentNumber}/{totalItems} · {formatDuration(elapsedSeconds)}
            </strong>
          </div>
        </div>
        <div className="game-hud">
          <span>
            <strong>Words</strong> {preview?.typedWordCount ?? 0}/{preview?.expectedWordCount ?? 0}
          </span>
          <span>
            <strong>Match</strong>{" "}
            {accuracy === null ? `${Math.round((preview?.completion ?? 0) * 100)}% live` : `${accuracy}% final`}
          </span>
          <span>
            <strong>Tags</strong> {activeItem.card.tags.join(" · ")}
          </span>
        </div>
      </div>

      <div className="game-progress" aria-label={`${progress}% of this practice session complete`}>
        <span style={{ width: `${Math.max(4, progress)}%` }} />
      </div>

      <div className="practice-status-band">
        <div className="game-prompt">
          <span>Prompt</span>
          <p>{activeItem.card.prompt}</p>
        </div>
        <div className={`game-result game-result-${boardState}`} aria-live="polite" aria-atomic="true">
          <strong>
            {lastResult
              ? lastGrade
                ? labelForGrade(lastGrade)
                : labelForOutcome(lastResult.evaluation.outcome)
              : isPaused
                ? "Practice paused"
                : practiceTurn
                  ? labelForPracticePhase(practiceTurn.phase)
                  : "Preparing recall"}
          </strong>
          <span>
            {shortcutNotice ?? (lastResult
              ? `${lastResult.evaluation.message} ${accuracy}% aligned.`
              : answer
                ? "Keep going"
                : "Ready when you are")}
          </span>
        </div>
        {failedOperation?.locksPractice && (
          <div aria-live="assertive" className="practice-operation-error" role="alert">
            <span>{failedOperation.message}</span>
            <button className="secondary-button" onClick={onRetryOperation} type="button">
              {failedOperation.label}
            </button>
          </div>
        )}
      </div>

      <div className={`practice-focus-shell practice-focus-shell-${supportMode} ${isFirstExposure ? "is-first-exposure" : ""}`}>
        <div className={`practice-support-slot ${showsLearningSupport ? "" : "is-empty"}`}>
          {practiceTurn && showsLearningSupport ? (
            <LearningSupportPanel
              card={activeItem.card}
              disabled={isSubmitting || isUpdatingStatus}
              exposureStyle={quickStartExposureStyle}
              mode={supportMode}
              onStartRecall={onStartRecall}
              showAnswer={showsRecallAnswer}
              suppressFullTarget={suppressRestoredTarget}
              supportLevel={practiceTurn.supportLevelUsed}
            />
          ) : null}
          <p aria-atomic="true" aria-live="polite" className="sr-only">
            {showsRecallAnswer ? `Answer: ${activeItem.card.english}` : ""}
          </p>
        </div>

        <div className="word-stage" aria-label="Sentence word track" data-has-answer={Boolean(answer)}>
          {isPaused && (
            <div className="practice-pause-overlay" role="status">
              <Pause size={24} />
              <strong>Paused</strong>
              <span>Press Control P or use the pause button to resume.</span>
            </div>
          )}

          <div className="word-track">
            {preview?.tokens.map((token, index) => {
              const displayValue = token.typed || "\u00a0";
              const displayStatus = lastResult
                ? token.status
                : statusAtCaret(token, index, activeWordIndex);

              return (
                <button
                  aria-label={`Edit word ${index + 1}`}
                  className={`word-slot slot-tone-${index % 6} word-slot-${displayStatus}`}
                  key={index}
                  onClick={() => onWordSelect(index, token)}
                  style={{
                    "--slot-width": `${Math.max(
                      (preview.slotWidths[index] ?? token.expected.length) + 2,
                      5,
                    )}ch`,
                  } as CSSProperties}
                  tabIndex={-1}
                  type="button"
                >
                  <span className="slot-hint">{String(index + 1).padStart(2, "0")}</span>
                  <span className="slot-typed">{displayValue}</span>
                  <span className="slot-rail" />
                </button>
              );
            })}
            {preview && preview.extraTokens.length > 0 && (
              <div className="extra-token-stack" aria-label="Extra words">
                {preview.extraTokens.map((token, index) => (
                  <button
                    aria-label={`Edit extra word ${token}`}
                    key={`${token}-${index}`}
                    onClick={() => onExtraWordSelect(preview.extraTokenIndexes[index] ?? index)}
                    tabIndex={-1}
                    type="button"
                  >
                    {token}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <FingerGuide
          isMuted={isFingerGuideMuted}
          mode={fingerGuideMode}
          pulse={fingerGuidePulse}
          stroke={fingerGuideStroke}
        />
      </div>

      <ShortcutBar
        answer={answer}
        isAnswerVisible={isAnswerVisible}
        isInVocabulary={isInVocabulary}
        isPaused={isPaused}
        isSubmitting={isSubmitting}
        isUpdatingStatus={isUpdatingStatus}
        isFirstExposure={isFirstExposure}
        lastResult={lastResult}
        onMarkMastered={onMarkMastered}
        onNext={onNext}
        onPlayAudio={onPlayAudio}
        onResumeEditing={onResumeEditing}
        onRetry={onRetry}
        onSubmit={onSubmit}
        onToggleAnswer={onToggleAnswer}
        onToggleVocabulary={onToggleVocabulary}
      />
    </div>
  );
}

interface ShortcutBarProps {
  answer: string;
  isAnswerVisible: boolean;
  isInVocabulary: boolean;
  isPaused: boolean;
  isSubmitting: boolean;
  isUpdatingStatus: boolean;
  isFirstExposure: boolean;
  lastResult: SubmitResult | null;
  onMarkMastered(): void;
  onNext(): void;
  onPlayAudio(): void;
  onResumeEditing(): void;
  onRetry(): void;
  onSubmit(): void;
  onToggleAnswer(): void;
  onToggleVocabulary(): void;
}

function ShortcutBar({
  answer,
  isAnswerVisible,
  isInVocabulary,
  isPaused,
  isSubmitting,
  isUpdatingStatus,
  isFirstExposure,
  lastResult,
  onMarkMastered,
  onNext,
  onPlayAudio,
  onResumeEditing,
  onRetry,
  onSubmit,
  onToggleAnswer,
  onToggleVocabulary,
}: ShortcutBarProps) {
  const canAdvance = lastResult?.evaluation.outcome === "perfect";
  const primaryLabel = lastResult ? (canAdvance ? "Next" : "Edit answer") : "Check";
  const primaryAction = lastResult ? (canAdvance ? onNext : onResumeEditing) : onSubmit;
  const answerLabel = canAdvance ? "Try again" : isAnswerVisible ? "Hide answer" : "Show answer";
  const answerAction = canAdvance ? onRetry : onToggleAnswer;
  const controlKey = "Ctrl";

  return (
    <div className="shortcut-bar" aria-label="Practice shortcuts">
      <ShortcutButton
        disabled={isPaused || isSubmitting || isUpdatingStatus}
        icon={<Volume2 size={16} />}
        keys={[controlKey, "'"]}
        label="Play audio"
        onClick={onPlayAudio}
      />
      <ShortcutButton
        disabled={isPaused || isSubmitting || isUpdatingStatus}
        icon={<CheckCheck size={16} />}
        keys={[controlKey, "M"]}
        label="Master"
        onClick={onMarkMastered}
      />
      <ShortcutButton
        active={isInVocabulary}
        ariaPressed={isInVocabulary}
        disabled={isPaused || isSubmitting || isUpdatingStatus}
        icon={isInVocabulary ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
        keys={[controlKey, "N"]}
        label={isInVocabulary ? "Remove vocabulary" : "Save vocabulary"}
        onClick={onToggleVocabulary}
      />
      <ShortcutButton
        icon={isSubmitting ? <Loader2 className="spin" size={16} /> : <CornerDownLeft size={16} />}
        keys={["Enter"]}
        label={primaryLabel}
        disabled={
          isPaused
          || isSubmitting
          || isUpdatingStatus
          || isFirstExposure
          || (!lastResult && !answer.trim())
        }
        onClick={primaryAction}
        primary
      />
      <ShortcutButton
        active={isAnswerVisible && !canAdvance}
        ariaPressed={canAdvance ? undefined : isAnswerVisible}
        disabled={isPaused || isSubmitting || isUpdatingStatus || isFirstExposure}
        icon={canAdvance ? <RotateCcw size={16} /> : isAnswerVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        keys={[controlKey, ";"]}
        label={answerLabel}
        onClick={answerAction}
      />
    </div>
  );
}

interface ShortcutButtonProps {
  active?: boolean;
  ariaPressed?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  keys: string[];
  label: string;
  onClick(): void;
  primary?: boolean;
}

function ShortcutButton({
  active = false,
  ariaPressed,
  disabled,
  icon,
  keys,
  label,
  onClick,
  primary = false,
}: ShortcutButtonProps) {
  return (
    <button
      aria-label={`${label}, shortcut ${keys.map(accessibleKeyName).join(" plus ")}`}
      aria-pressed={ariaPressed}
      className={`shortcut-button ${primary ? "is-primary" : ""} ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="shortcut-icon" aria-hidden="true">{icon}</span>
      <span className="shortcut-keys" aria-hidden="true">
        {keys.map((key) => <kbd key={key}>{key}</kbd>)}
      </span>
      <span>{label}</span>
    </button>
  );
}

function accessibleKeyName(key: string): string {
  switch (key) {
    case "Ctrl":
      return "Control";
    case "'":
      return "Quote";
    case ";":
      return "Semicolon";
    case "/":
      return "Slash";
    default:
      return key;
  }
}

function labelForOutcome(outcome: SubmitResult["evaluation"]["outcome"]): string {
  switch (outcome) {
    case "perfect":
      return "Perfect";
    case "close":
      return "Close";
    case "retry":
      return "Try again";
  }
}

function labelForGrade(grade: RecallGrade): string {
  switch (grade) {
    case "perfect":
      return "Perfect";
    case "great":
      return "Great";
    case "guided":
      return "Guided";
    case "corrected":
      return "Corrected";
    case "correct-with-answer":
      return "Correct with answer";
  }
}

function gradeRecall(
  result: SubmitResult,
  hadEdits: boolean,
  submissionIndex: number,
): RecallGrade | null {
  return classifyRecallGrade({
    outcome: result.evaluation.outcome,
    phase: result.turn.phase,
    supportLevelUsed: result.turn.supportLevelUsed,
    supportKindsUsed: result.turn.supportKindsUsed,
    answerWasRevealed: result.turn.answerWasRevealed,
    receivedCorrection: result.turn.receivedCorrection,
    submissionIndex,
    hadEdits,
  });
}

export function classifyRecallGrade(evidence: RecallGradeEvidence): RecallGrade | null {
  if (evidence.outcome !== "perfect") return null;
  if (evidence.answerWasRevealed || evidence.supportKindsUsed.includes("answer")) {
    return "correct-with-answer";
  }
  if (
    evidence.receivedCorrection
    || evidence.submissionIndex > 0
    || evidence.phase === "corrective-practice"
  ) {
    return "corrected";
  }
  if (evidence.phase === "guided-recall" || evidence.supportLevelUsed > 0) {
    return "guided";
  }
  return evidence.hadEdits ? "great" : "perfect";
}

export function explainRecallResult(input: {
  phase: PracticePhase;
  grade: RecallGrade | null;
  shouldRequeue: boolean;
  hasFirstPass: boolean;
  quickStartReturnIsAlreadyPlanned: boolean;
}): string | null {
  if (input.phase === "voluntary-practice") {
    return "Practice only. Review and Course progress are unchanged.";
  }
  if (input.shouldRequeue && input.quickStartReturnIsAlreadyPlanned) {
    return "Guided recall complete. Quick Start will bring this sentence back for an independent check.";
  }
  if (
    input.hasFirstPass
    && (input.grade === "guided"
      || input.grade === "corrected"
      || input.grade === "correct-with-answer")
  ) {
    return "This supported completion helps you study; the previously scheduled review remains.";
  }
  return null;
}

export function shouldKeepSkippedCardPending(
  scope: PracticeScope | null,
  isQuickStart: boolean,
  learningState: SentenceLearningState | undefined,
): boolean {
  return !isQuickStart
    && scope?.kind === "lesson"
    && scope.mode === "learn"
    && !hasFirstPass(learningState);
}

function recordAttempt(current: SessionStats, result: SubmitResult, grade: RecallGrade | null): SessionStats {
  const combo = grade === "perfect" || grade === "great" ? current.combo + 1 : 0;

  return {
    ...current,
    score: current.score + scoreForRecall(grade, result.evaluation.accuracy, combo),
    combo,
    maxCombo: Math.max(current.maxCombo, combo),
    attempts: current.attempts + 1,
    perfect: current.perfect + (grade === "perfect" ? 1 : 0),
    great: current.great + (grade === "great" ? 1 : 0),
    accuracyTotal: current.accuracyTotal + result.evaluation.accuracy,
  };
}

function scoreForRecall(grade: RecallGrade | null, accuracy: number, combo: number): number {
  const base = grade === "perfect"
    ? 1000
    : grade === "great"
      ? 750
      : grade
        ? 250
        : accuracy * 100;
  const multiplier = combo >= 20
    ? 2
    : combo >= 15
      ? 1.8
      : combo >= 10
        ? 1.5
        : combo >= 7
          ? 1.3
          : combo >= 5
            ? 1.2
            : combo >= 3
              ? 1.1
              : 1;
  return Math.round(base * multiplier);
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function buildQuickStartWorkbenchItems(
  quickStart: QuickStartSession,
  lessonItems: PracticeSessionItem[],
  blockedCardIds: ReadonlySet<string> = new Set(),
): WorkbenchSessionItem[] {
  const itemByCardId = new Map(lessonItems.map((item) => [item.card.id, item]));

  return quickStart.itinerary.flatMap<WorkbenchSessionItem>((step) => {
    if (step.kind === "explanation") {
      return [];
    }

    const item = itemByCardId.get(step.cardId);
    if (!item) {
      if (blockedCardIds.has(step.cardId)) {
        return [];
      }
      throw new Error(`Quick Start SentenceCard is unavailable in the Starter Lesson: ${step.cardId}`);
    }

    return [{
      ...item,
      initialPhase: step.kind === "first-exposure" ? "first-exposure" : step.phase,
      initialSupportLevel: step.kind === "first-exposure" ? 0 : step.initialSupportLevel,
      initialSupportKinds: step.kind === "first-exposure"
        ? []
        : [...step.initialSupportKinds],
      queueReason: "new-learning",
      scheduledReviewDueAt: undefined,
      quickStartStep: step,
    }];
  });
}

function checkpointFromWorkbenchSeed(
  active: PracticeSessionCheckpointV2,
  seed: PracticeSessionCheckpointSeed,
): PracticeSessionCheckpointV2 {
  return {
    ...structuredClone(seed),
    schemaVersion: 2,
    sessionId: active.sessionId,
    roundId: active.roundId,
    entryPoint: active.entryPoint,
    startedAt: active.startedAt,
    engagedAt: active.engagedAt,
    revision: active.revision,
    round: mergePracticeRoundSummary(active.round, seed.round),
    updatedAt: active.updatedAt,
  };
}

function mergePracticeRoundSummary(
  durable: PracticeRoundSummary,
  view: PracticeRoundSummary,
): PracticeRoundSummary {
  const scheduled = new Set(view.scheduledOccurrenceIds);
  const skipped = unionWithinSchedule(
    durable.skippedOccurrenceIds,
    view.skippedOccurrenceIds,
    scheduled,
  );
  const skippedSet = new Set(skipped);
  const completed = unionWithinSchedule(
    durable.completedOccurrenceIds,
    view.completedOccurrenceIds,
    scheduled,
  ).filter((occurrenceId) => !skippedSet.has(occurrenceId));
  const completedSet = new Set(completed);
  const remaining = view.scheduledOccurrenceIds.filter(
    (occurrenceId) => !completedSet.has(occurrenceId) && !skippedSet.has(occurrenceId),
  );
  const dueScheduled = [...view.dueReviewScheduledOccurrenceIds];
  const dueScheduledSet = new Set(dueScheduled);
  const previouslyScheduled = new Set(durable.scheduledOccurrenceIds);
  const newlyScheduled = view.scheduledOccurrenceIds.filter(
    (occurrenceId) => !previouslyScheduled.has(occurrenceId),
  );

  return {
    initialOccurrenceIds: durable.initialOccurrenceIds.filter(
      (occurrenceId) => scheduled.has(occurrenceId),
    ),
    scheduledOccurrenceIds: [...view.scheduledOccurrenceIds],
    attemptedOccurrenceIds: unionWithinSchedule(
      durable.attemptedOccurrenceIds,
      view.attemptedOccurrenceIds,
      scheduled,
    ),
    completedOccurrenceIds: completed,
    skippedOccurrenceIds: skipped,
    remainingOccurrenceIds: remaining,
    dueReviewScheduledOccurrenceIds: dueScheduled,
    dueReviewCompletedOccurrenceIds: completed.filter(
      (occurrenceId) => dueScheduledSet.has(occurrenceId),
    ),
    introducedCardIds: [...new Set([
      ...durable.introducedCardIds,
      ...view.introducedCardIds,
    ])],
    firstPassCardIds: [...new Set([
      ...durable.firstPassCardIds,
      ...view.firstPassCardIds,
    ])],
    requeue: {
      insertedReturnOccurrenceIds: [...new Set([
        ...durable.requeue.insertedReturnOccurrenceIds,
        ...newlyScheduled,
      ])].filter((occurrenceId) => scheduled.has(occurrenceId)),
      deferredNoRoomCardIds: [...new Set([
        ...durable.requeue.deferredNoRoomCardIds,
        ...view.requeue.deferredNoRoomCardIds,
      ])],
      capReachedCardIds: [...new Set([
        ...durable.requeue.capReachedCardIds,
        ...view.requeue.capReachedCardIds,
      ])],
    },
  };
}

function unionWithinSchedule(
  left: readonly string[],
  right: readonly string[],
  scheduled: ReadonlySet<string>,
): string[] {
  return [...new Set([...left, ...right])].filter((occurrenceId) => scheduled.has(occurrenceId));
}

function practiceScopeKey(scope: PracticeScope | null): string {
  if (!scope) {
    return "none";
  }

  switch (scope.kind) {
    case "lesson":
      return `${scope.kind}:${scope.courseId}:${scope.lessonId}:${scope.mode}`;
    case "review":
      return `${scope.kind}:${scope.courseId ?? "all"}`;
    case "vocabulary":
      return `${scope.kind}:${scope.courseId ?? "all"}:${scope.cardId ?? "all"}`;
    case "course":
      return `${scope.kind}:${scope.courseId}`;
    case "focused":
      return `${scope.kind}:${scope.cardId}`;
  }
}

function labelForScope(scope: PracticeScope): string {
  switch (scope.kind) {
    case "lesson":
      return scope.mode === "replay" ? "Replay" : "Lesson";
    case "review":
      return "Review";
    case "vocabulary":
      return "Vocabulary";
    case "course":
      return "Course";
    case "focused":
      return "Focused Practice";
  }
}

export function recallSupportSavedNotice(
  kind: RecallSupportKind,
  level: RecallSupportLevel,
  explicitAnswer = false,
): string | null {
  if (explicitAnswer) {
    return "Answer shown. Type it exactly for instructional completion.";
  }
  if (kind === "audio") {
    return null;
  }
  return `Support level ${level} recorded. This turn is Guided Recall.`;
}

export function recallSupportSaveFailureCopy(
  kind: RecallSupportKind,
  explicitAnswer = false,
): { label: string; message: string; notice: string | null } {
  if (explicitAnswer) {
    return {
      label: "Retry saving Answer Reveal",
      message: "Answer Reveal could not be saved. The answer remains visible for retry.",
      notice: "The answer remains visible. Retry its learning write before continuing.",
    };
  }

  if (kind === "audio") {
    return {
      label: "Retry saving audio record",
      message: "Audio played, but its learning record could not be saved.",
      notice: null,
    };
  }

  return {
    label: "Retry saving recall support",
    message: "Recall support could not be saved. The support remains visible for retry.",
    notice: "The support remains visible. Retry its learning write before continuing.",
  };
}

function labelForPracticePhase(phase: PracticePhase): string {
  switch (phase) {
    case "first-exposure":
      return "First exposure";
    case "guided-recall":
      return "Guided recall";
    case "independent-recall":
      return "Independent recall";
    case "corrective-practice":
      return "Corrective practice";
    case "review-recall":
      return "Review recall";
    case "voluntary-practice":
      return "Voluntary practice";
  }
}

export function SessionSummary({
  elapsedSeconds,
  nextLesson,
  onOpenCourses,
  onRepeat,
  onStartNextLesson,
  pendingReturnCount,
  scope,
  stats,
}: {
  elapsedSeconds: number;
  nextLesson: NextLessonAction | null;
  onOpenCourses(): void;
  onRepeat(): void;
  onStartNextLesson(action: NextLessonAction): void;
  pendingReturnCount: number;
  scope: PracticeScope;
  stats: SessionStats;
}) {
  const averageAccuracy = stats.attempts
    ? Math.round((stats.accuracyTotal / stats.attempts) * 100)
    : 0;
  const completionLabel = pendingReturnCount > 0
    ? "Round complete"
    : scope.kind === "course"
      ? "Course replay complete"
      : scope.kind === "lesson" && scope.mode === "learn"
        ? "Lesson complete"
        : `${labelForScope(scope)} complete`;
  const completedItems = stats.attempts + stats.skipped;
  const averageSeconds = completedItems
    ? Math.round(elapsedSeconds / completedItems)
    : 0;
  const lessonPathIsPrimary = scope.kind === "lesson"
    && scope.mode === "learn"
    && !nextLesson;

  return (
    <section className="practice-layout session-summary" aria-labelledby="session-summary-title">
      <div className="session-summary-heading">
        <Trophy size={30} />
        <div>
          <p className="eyebrow">{completionLabel}</p>
          <h3 id="session-summary-title">{stats.score.toLocaleString()} points</h3>
          <span>{sessionCompletionDescription(scope, stats, pendingReturnCount)}</span>
        </div>
      </div>

      <div className="session-summary-grid">
        <SummaryMetric label="Rating" value={sessionRating(averageAccuracy, stats)} />
        <SummaryMetric label="Checks" value={stats.attempts.toString()} />
        <SummaryMetric label="Perfect" value={stats.perfect.toString()} />
        <SummaryMetric label="Great" value={stats.great.toString()} />
        <SummaryMetric label="Skipped" value={stats.skipped.toString()} />
        <SummaryMetric label="Revealed" value={stats.revealed.toString()} />
        <SummaryMetric label="Audio replays" value={stats.audioPlays.toString()} />
        <SummaryMetric label="Accuracy" value={`${averageAccuracy}%`} />
        <SummaryMetric label="Best combo" value={stats.maxCombo.toString()} />
        <SummaryMetric label="Average time" value={formatDuration(averageSeconds)} />
        <SummaryMetric label="Duration" value={formatDuration(elapsedSeconds)} />
      </div>

      <div className="practice-actions">
        <button
          className={lessonPathIsPrimary ? "primary-button" : "secondary-button"}
          onClick={onOpenCourses}
          type="button"
        >
          {scope.kind === "course"
            ? "View course"
            : lessonPathIsPrimary && pendingReturnCount === 0
              ? "View learning path"
              : "Choose lesson"}
        </button>
        <button
          className={nextLesson || lessonPathIsPrimary ? "secondary-button" : "primary-button"}
          onClick={onRepeat}
          type="button"
        >
          <RotateCcw size={16} />
          Practice again
        </button>
        {nextLesson && (
          <button
            className="primary-button"
            onClick={() => onStartNextLesson(nextLesson)}
            type="button"
          >
            Next lesson: {nextLesson.lessonTitle}
          </button>
        )}
      </div>
    </section>
  );
}

function sessionCompletionDescription(
  scope: PracticeScope,
  stats: SessionStats,
  pendingReturnCount: number,
): string {
  if (pendingReturnCount > 0) {
    return `${pendingReturnCount} sentence${pendingReturnCount === 1 ? "" : "s"} still need an independent return in the next round.`;
  }
  if (stats.skipped > 0 || stats.revealed > 0) {
    return "Skipped and revealed sentences remain scheduled for focused review.";
  }
  if (scope.kind === "focused" || scope.kind === "course" || scope.kind === "vocabulary" || (scope.kind === "lesson" && scope.mode === "replay")) {
    return "Voluntary practice evidence is saved without changing the spaced Review schedule.";
  }
  if (scope.kind === "review") {
    return "Review complete. Recall results have updated the spaced Review schedule.";
  }
  return "Every sentence in this Lesson now has a durable First Pass.";
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function sessionRating(averageAccuracy: number, stats: SessionStats): string {
  if (stats.skipped === 0 && stats.revealed === 0 && averageAccuracy >= 95) {
    return "S";
  }

  if (averageAccuracy >= 85) {
    return "A";
  }

  if (averageAccuracy >= 70) {
    return "B";
  }

  return "C";
}

function statusAtCaret(
  token: AttemptPreviewToken,
  index: number,
  activeWordIndex: number,
): AttemptPreviewToken["status"] {
  if (index === activeWordIndex) {
    return "active";
  }

  if (token.status !== "active") {
    return token.status;
  }

  if (!token.typed) {
    return "empty";
  }

  return token.typed === token.expected ? "matched" : "mismatch";
}

function wordIndexAtOffset(answer: string, offset: number, expectedWordCount: number): number {
  if (expectedWordCount <= 1) {
    return 0;
  }

  const beforeCaret = answer.slice(0, Math.max(0, offset));
  const completedWords = beforeCaret.trim() ? beforeCaret.trim().split(/\s+/).length : 0;
  const index = /\s$/.test(beforeCaret)
    ? completedWords
    : Math.max(0, completedWords - 1);

  return Math.min(index, expectedWordCount - 1);
}

function wordRanges(answer: string): Array<{ start: number; end: number }> {
  return Array.from(answer.matchAll(/\S+/g), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
