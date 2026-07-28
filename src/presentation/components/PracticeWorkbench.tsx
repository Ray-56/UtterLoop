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
import {
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
import type { PracticeQueueItem } from "../../domain/training/PracticeQueue";
import {
  buildPracticeSession,
  type PracticeContext,
  type PracticeScope,
} from "../../application/use-cases/buildPracticeSession";
import type { SubmitResult, TrainingController } from "../hooks/useTrainingController";
import { useKeyFeedback } from "../hooks/useKeyFeedback";
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
import { FingerGuide } from "./FingerGuide";

interface PracticeWorkbenchProps {
  controller: TrainingController;
  onOpenCourses(): void;
  scope: PracticeScope | null;
}

type RecallGrade = "perfect" | "great" | "correct";

interface SessionStats {
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

const EMPTY_SESSION_STATS: SessionStats = {
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

export function PracticeWorkbench({ controller, onOpenCourses, scope }: PracticeWorkbenchProps) {
  const [answer, setAnswer] = useState("");
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [lastGrade, setLastGrade] = useState<RecallGrade | null>(null);
  const [itinerary, setItinerary] = useState<PracticeQueueItem[]>([]);
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
  const [correctionAcceptedAnswer, setCorrectionAcceptedAnswer] = useState<string | null>(null);
  const [fingerGuideFeedback, setFingerGuideFeedback] = useState<{
    stroke: FingerGuideStroke | null;
    pulse: number;
  }>({ stroke: null, pulse: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itineraryInitializedRef = useRef(false);
  const fingerGuideStrokeRef = useRef<FingerGuideStroke | null>(null);
  const fingerGuideHomeTimerRef = useRef<number | null>(null);
  const {
    isSoundEnabled,
    isSoundSupported,
    keyPulse,
    toggleKeySound,
    triggerKeyFeedback,
  } = useKeyFeedback();
  const snapshot = controller.snapshot;
  const session = useMemo(
    () => snapshot && scope
      ? buildPracticeSession({
          scope,
          courses: snapshot.courses,
          cards: snapshot.cards,
          reviewStates: snapshot.reviewStates,
          vocabularyEntries: snapshot.vocabularyEntries,
          now: new Date(),
        })
      : null,
    [scope, snapshot],
  );
  const sessionItems = itinerary.length > 0 ? itinerary : session?.items ?? [];
  const activeItem = sessionItems[currentIndex];
  const preview = activeItem
    ? correctionAcceptedAnswer
      ? buildCorrectionPreview(activeItem.card, correctionAcceptedAnswer, answer)
      : controller.previewAttempt(activeItem.card, answer)
    : null;
  const displayPreview = lastResult
    ? buildEvaluationPreview(activeItem.card, lastResult.evaluation)
    : preview;
  const activeWordIndex = wordIndexAtOffset(
    answer,
    caretOffset,
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
  const isFingerGuideMuted =
    isPaused
    || isSubmitting
    || isUpdatingStatus
    || lastResult?.evaluation.outcome === "perfect";

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

  const triggerFingerGuide = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, command: PracticeKeyCommand | null) => {
      const stroke = resolveFingerGuideStroke({
        altGraphKey: event.getModifierState("AltGraph"),
        altKey: event.altKey,
        code: event.code,
        command,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });

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
    setCorrectionAcceptedAnswer(null);
    returnFingerGuideHome();
    itineraryInitializedRef.current = false;
  }, [returnFingerGuideHome, scopeKey]);

  useEffect(() => clearFingerGuideHomeTimer, [clearFingerGuideHomeTimer]);

  useEffect(() => {
    if (!session || itineraryInitializedRef.current) {
      return;
    }

    itineraryInitializedRef.current = true;
    setItinerary(session.items);
  }, [session]);

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
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
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
    setCorrectionAcceptedAnswer(null);
  }, []);

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
    setShortcutNotice(null);
    try {
      const result = await controller.submitAttempt(activeItem.card.id, answer, {
        answerWasRevealed,
        hadEdits,
        audioPlayCount,
        durationMs: itemElapsedSeconds * 1000,
      });
      const grade = gradeRecall(result, answerWasRevealed, hadEdits);

      setItinerary((items) => items.map((item) => item.card.id === activeItem.card.id
        ? { ...item, reviewState: result.reviewState, isDue: false }
        : item));
      setSessionStats((current) => recordAttempt(current, result, grade));

      if (result.evaluation.outcome === "perfect") {
        setCorrectionAcceptedAnswer(null);
        setLastResult(result);
        setLastGrade(grade);
        setIsAnswerVisible(true);
      } else {
        const correction = buildCorrectionDraft(
          buildEvaluationPreview(activeItem.card, result.evaluation),
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
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeItem,
    answer,
    answerWasRevealed,
    audioPlayCount,
    controller,
    hadEdits,
    isPaused,
    isSubmitting,
    itemElapsedSeconds,
    lastResult,
    preview?.isComplete,
    focusInputRange,
  ]);

  const retryCurrent = useCallback(() => {
    resetItemState();
  }, [resetItemState]);

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
    (nextAnswer: string, nextCaretOffset: number, isComposing: boolean) => {
      if (!activeItem || isPaused || lastResult?.evaluation.outcome === "perfect") {
        return;
      }

      const maximumLength = Math.max(activeItem.card.english.length * 2, 160);
      const stableDraft = correctionAcceptedAnswer && !isComposing
        ? stabilizeCorrectionDraft(answer, nextAnswer, nextCaretOffset)
        : {
            answer: nextAnswer,
            selectionStart: nextCaretOffset,
            selectionEnd: nextCaretOffset,
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

  const playAudio = useCallback(() => {
    if (!activeItem || isPaused) {
      return;
    }

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setShortcutNotice("Audio is not available in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(activeItem.card.english);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    utterance.onstart = () => setShortcutNotice("Playing sentence audio.");
    utterance.onend = () => setShortcutNotice("Audio played.");
    utterance.onerror = () => setShortcutNotice("Sentence audio could not be played.");
    setAudioPlayCount((current) => current + 1);
    setSessionStats((current) => ({
      ...current,
      audioPlays: current.audioPlays + 1,
    }));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [activeItem, isPaused]);

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
    if (!nextIsVisible || answerWasRevealed) {
      setIsAnswerVisible(nextIsVisible);
      setShortcutNotice(nextIsVisible ? "Answer shown. This recall will return sooner." : "Answer hidden.");
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const reviewState = await controller.revealPracticeAnswer(activeItem.card.id, {
        answerWasRevealed: true,
        hadEdits,
        audioPlayCount,
        durationMs: itemElapsedSeconds * 1000,
      });
      setItinerary((items) => items.map((item) => item.card.id === activeItem.card.id
        ? { ...item, reviewState, isDue: true }
        : item));
      setSessionStats((current) => ({
        ...current,
        revealed: current.revealed + 1,
      }));
      setAnswerWasRevealed(true);
      setIsAnswerVisible(true);
      setShortcutNotice("Answer shown. This recall will return sooner.");
    } catch {
      setShortcutNotice("Answer could not be saved. Try again.");
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    answerWasRevealed,
    audioPlayCount,
    controller,
    hadEdits,
    isAnswerVisible,
    isPaused,
    isSubmitting,
    isUpdatingStatus,
    itemElapsedSeconds,
    lastResult,
  ]);

  const markMastered = useCallback(async () => {
    if (!activeItem || isPaused || isSubmitting || isUpdatingStatus) {
      return;
    }

    setIsUpdatingStatus(true);
    try {
      await controller.setReviewLearningStatus(activeItem.card.id, "mastered");
      const remainingItems = sessionItems.filter((item) => item.card.id !== activeItem.card.id);
      setItinerary(remainingItems);

      if (remainingItems.length === 0 || currentIndex >= remainingItems.length) {
        setIsSessionComplete(true);
      } else {
        resetItemState("Moved to mastered. It has left the active queue.");
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    controller,
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
    try {
      await controller.setVocabularyStatus(activeItem.card.id, !isInVocabulary);
      setShortcutNotice(isInVocabulary ? "Removed from Vocabulary." : "Saved to Vocabulary.");
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
    if (!activeItem || isPaused || isSubmitting || isUpdatingStatus || lastResult?.evaluation.outcome === "perfect") {
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const reviewState = await controller.skipPracticeCard(activeItem.card.id, {
        answerWasRevealed,
        hadEdits,
        audioPlayCount,
        durationMs: itemElapsedSeconds * 1000,
      });
      setItinerary((items) => items.map((item) => item.card.id === activeItem.card.id
        ? { ...item, reviewState, isDue: true }
        : item));
      setSessionStats((current) => ({
        ...current,
        combo: 0,
        skipped: current.skipped + 1,
      }));
      moveForward("Previous sentence skipped. It remains in focused review.");
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    activeItem,
    answerWasRevealed,
    audioPlayCount,
    controller,
    hadEdits,
    isPaused,
    isSubmitting,
    isUpdatingStatus,
    itemElapsedSeconds,
    lastResult,
    moveForward,
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
      if (isSubmitting || isUpdatingStatus) {
        event.preventDefault();
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
      isPaused,
      isSubmitting,
      isUpdatingStatus,
      lastResult,
      preview?.isComplete,
      runCommand,
      triggerFingerGuide,
      triggerKeyFeedback,
    ],
  );

  const handleCaptureChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => updateAnswerFromCapture(
      event.currentTarget.value,
      event.currentTarget.selectionStart ?? event.currentTarget.value.length,
      (event.nativeEvent as InputEvent).isComposing,
    ),
    [updateAnswerFromCapture],
  );

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
    },
    [answer, isPaused, isSubmitting, isUpdatingStatus, lastResult],
  );

  const restartRound = useCallback(() => {
    const nextItems = session?.items.length ? session.items : itinerary;
    setItinerary(nextItems);
    setCurrentIndex(0);
    setIsSessionComplete(false);
    setElapsedSeconds(0);
    setSessionStats(EMPTY_SESSION_STATS);
    resetItemState();
  }, [itinerary, resetItemState, session]);

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
    if (activeItem) {
      focusBoard();
    }
  }, [activeItem?.card.id, focusBoard]);

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

  if (isSessionComplete) {
    return (
      <SessionSummary
        elapsedSeconds={elapsedSeconds}
        onOpenCourses={onOpenCourses}
        onRepeat={restartRound}
        scope={scope}
        stats={sessionStats}
      />
    );
  }

  if (!activeItem) {
    return (
      <section className="center-panel">
        <CheckCircle2 size={28} />
        <h3>{scope.kind === "review" ? "Review complete" : scope.kind === "vocabulary" ? "Vocabulary is empty" : "Lesson complete"}</h3>
        <p>
          {scope.kind === "review"
            ? "There are no attempted sentences due right now."
            : scope.kind === "vocabulary"
              ? "Save a sentence with Control N, then practice it here."
            : "Every sentence in this lesson has been completed successfully."}
        </p>
        <button className="primary-button" onClick={onOpenCourses} type="button">
          {scope.kind === "review" || scope.kind === "vocabulary" ? "View courses" : "Choose next lesson"}
        </button>
      </section>
    );
  }

  return (
    <section className="practice-layout practice-layout-stage">
      <SentenceGameBoard
        activeItem={activeItem}
        answer={answer}
        boardRef={boardRef}
        context={session.context}
        currentNumber={currentIndex + 1}
        activeWordIndex={activeWordIndex}
        elapsedSeconds={elapsedSeconds}
        fingerGuidePulse={fingerGuideFeedback.pulse}
        fingerGuideStroke={fingerGuideFeedback.stroke}
        inputRef={inputRef}
        isAnswerVisible={isAnswerVisible}
        isCorrecting={Boolean(correctionAcceptedAnswer)}
        isInVocabulary={isInVocabulary}
        isFingerGuideMuted={isFingerGuideMuted}
        isKeySoundEnabled={isSoundEnabled}
        isKeySoundSupported={isSoundSupported}
        isPaused={isPaused}
        isSubmitting={isSubmitting}
        isUpdatingStatus={isUpdatingStatus}
        keyPulse={keyPulse}
        lastGrade={lastGrade}
        lastResult={lastResult}
        onAnswerChange={handleCaptureChange}
        onBoardPointerDown={focusBoard}
        onKeyDown={handleKeyDown}
        onInputSelect={setCaretOffset}
        onMarkMastered={() => runShortcut({ type: "mark-mastered" })}
        onNext={() => runShortcut({ type: "next" })}
        onPause={() => runShortcut({ type: "toggle-pause" })}
        onPlayAudio={() => runShortcut({ type: "play-audio" })}
        onPrevious={() => runShortcut({ type: "previous" })}
        onResumeEditing={() => runShortcut({ type: "resume-editing" })}
        onRetry={() => runShortcut({ type: "retry" })}
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
        shortcutNotice={shortcutNotice}
        totalItems={sessionItems.length}
      />
    </section>
  );
}

function isNativeInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, [contenteditable='true']"));
}

interface SentenceGameBoardProps {
  activeItem: PracticeQueueItem;
  activeWordIndex: number;
  answer: string;
  boardRef: RefObject<HTMLDivElement | null>;
  context: PracticeContext | null;
  currentNumber: number;
  elapsedSeconds: number;
  fingerGuidePulse: number;
  fingerGuideStroke: FingerGuideStroke | null;
  inputRef: RefObject<HTMLInputElement | null>;
  isAnswerVisible: boolean;
  isCorrecting: boolean;
  isFingerGuideMuted: boolean;
  isInVocabulary: boolean;
  isKeySoundEnabled: boolean;
  isKeySoundSupported: boolean;
  isPaused: boolean;
  isSubmitting: boolean;
  isUpdatingStatus: boolean;
  keyPulse: number;
  lastGrade: RecallGrade | null;
  lastResult: SubmitResult | null;
  onAnswerChange(event: ChangeEvent<HTMLInputElement>): void;
  onBoardPointerDown(): void;
  onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void;
  onInputSelect(caretOffset: number): void;
  onMarkMastered(): void;
  onNext(): void;
  onPause(): void;
  onPlayAudio(): void;
  onPrevious(): void;
  onResumeEditing(): void;
  onRetry(): void;
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
  inputRef,
  isAnswerVisible,
  isCorrecting,
  isFingerGuideMuted,
  isInVocabulary,
  isKeySoundEnabled,
  isKeySoundSupported,
  isPaused,
  isSubmitting,
  isUpdatingStatus,
  keyPulse,
  lastGrade,
  lastResult,
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
  onRetry,
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
        onSelect={(event) => onInputSelect(event.currentTarget.selectionStart ?? answer.length)}
        readOnly={
          isPaused
          || isSubmitting
          || isUpdatingStatus
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
          </span>
        </div>
        <div className="game-topbar-actions">
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
      </div>

      <div className="game-progress" aria-label={`${progress}% of this practice session complete`}>
        <span style={{ width: `${Math.max(4, progress)}%` }} />
      </div>

      <div className={`game-result game-result-${boardState}`} aria-live="polite" aria-atomic="true">
        <strong>
          {lastResult
            ? lastGrade
              ? labelForGrade(lastGrade)
              : labelForOutcome(lastResult.evaluation.outcome)
            : isPaused
              ? "Practice paused"
              : "Recall the sentence"}
        </strong>
        <span>
          {shortcutNotice ?? (lastResult
            ? `${lastResult.evaluation.message} ${accuracy}% aligned.`
            : answer
              ? "Keep going"
              : "Ready when you are")}
        </span>
      </div>

      <div className="word-stage" aria-label="Sentence word track" data-has-answer={Boolean(answer)}>
        <div
          aria-hidden={!isAnswerHintVisible}
          className={`target-sentence-hint ${isAnswerHintVisible ? "is-visible" : ""}`}
        >
          <span>Answer</span>
          <p>{activeItem.card.english}</p>
        </div>
        <p aria-atomic="true" aria-live="polite" className="sr-only">
          {isAnswerHintVisible ? `Answer: ${activeItem.card.english}` : ""}
        </p>
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

      <div className="game-prompt">
        <span>Prompt</span>
        <p>{activeItem.card.prompt}</p>
      </div>

      <FingerGuide
        isMuted={isFingerGuideMuted}
        pulse={fingerGuidePulse}
        stroke={fingerGuideStroke}
      />

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

      <ShortcutBar
        answer={answer}
        isAnswerVisible={isAnswerVisible}
        isInVocabulary={isInVocabulary}
        isPaused={isPaused}
        isSubmitting={isSubmitting}
        isUpdatingStatus={isUpdatingStatus}
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
          || (!lastResult && !answer.trim())
        }
        onClick={primaryAction}
        primary
      />
      <ShortcutButton
        active={isAnswerVisible && !canAdvance}
        ariaPressed={canAdvance ? undefined : isAnswerVisible}
        disabled={isPaused || isSubmitting || isUpdatingStatus}
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
    case "correct":
      return "Correct with answer";
  }
}

function gradeRecall(
  result: SubmitResult,
  answerWasRevealed: boolean,
  hadEdits: boolean,
): RecallGrade | null {
  if (result.evaluation.outcome !== "perfect") {
    return null;
  }

  if (answerWasRevealed) {
    return "correct";
  }

  return hadEdits ? "great" : "perfect";
}

function recordAttempt(current: SessionStats, result: SubmitResult, grade: RecallGrade | null): SessionStats {
  const combo = grade && grade !== "correct" ? current.combo + 1 : 0;

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
  const base = grade === "perfect" ? 1000 : grade === "great" ? 750 : grade === "correct" ? 250 : accuracy * 100;
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
      return scope.kind;
    case "course":
      return `${scope.kind}:${scope.courseId}`;
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
  }
}

function SessionSummary({
  elapsedSeconds,
  onOpenCourses,
  onRepeat,
  scope,
  stats,
}: {
  elapsedSeconds: number;
  onOpenCourses(): void;
  onRepeat(): void;
  scope: PracticeScope;
  stats: SessionStats;
}) {
  const averageAccuracy = stats.attempts
    ? Math.round((stats.accuracyTotal / stats.attempts) * 100)
    : 0;
  const completedItems = stats.attempts + stats.skipped;
  const averageSeconds = completedItems
    ? Math.round(elapsedSeconds / completedItems)
    : 0;

  return (
    <section className="practice-layout session-summary" aria-labelledby="session-summary-title">
      <div className="session-summary-heading">
        <Trophy size={30} />
        <div>
          <p className="eyebrow">{labelForScope(scope)} complete</p>
          <h3 id="session-summary-title">{stats.score.toLocaleString()} points</h3>
          <span>{stats.skipped > 0 || stats.revealed > 0
            ? "Skipped and revealed sentences remain scheduled for focused review."
            : "Round complete. Clean recall moves these sentences further out."}</span>
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
        <button className="secondary-button" onClick={onOpenCourses} type="button">Choose lesson</button>
        <button className="primary-button" onClick={onRepeat} type="button">
          <RotateCcw size={16} />
          Practice again
        </button>
      </div>
    </section>
  );
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
