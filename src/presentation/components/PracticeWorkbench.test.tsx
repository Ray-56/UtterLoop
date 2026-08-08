import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TrainingSnapshot } from "../../application/use-cases/getTrainingSnapshot";
import { previewPracticeAttempt } from "../../application/use-cases/previewPracticeAttempt";
import {
  buildQuickStartSession,
  QUICK_START_CARD_IDS,
} from "../../application/use-cases/buildQuickStartSession";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { Course } from "../../domain/curriculum/Course";
import type { TrainingController } from "../hooks/useTrainingController";
import type { PracticeSessionCheckpointV2 } from "../../application/practice-session/PracticeSessionCheckpoint";
import {
  PracticeSessionReplacementConfirmation,
  PracticeWorkbench,
  recallSupportSaveFailureCopy,
  recallSupportSavedNotice,
  retryPendingAudioSave,
  shouldRetryAudioSaveBeforeCommand,
  transitionCheckpointAfterFirstExposure,
  type PracticeFailedOperation,
} from "./PracticeWorkbench";

describe("PracticeWorkbench blocked content recovery", () => {
  it("fails a blocked Quick Start closed without rendering target content or completion", () => {
    const cards = QUICK_START_CARD_IDS.map(unsafeCard);
    const quickStartSession = buildQuickStartSession({ courses: [course], cards });
    const controller = {
      status: "ready",
      error: null,
      snapshot: {
        courses: [course],
        cards,
        sentenceLearningStates: [],
        reviewStates: [],
        vocabularyEntries: [],
        progressDashboard: { needsAttention: { weakCards: [] } },
        courseProgress: [],
      } as unknown as TrainingSnapshot,
    } as TrainingController;

    const html = renderToStaticMarkup(
      <PracticeWorkbench
        controller={controller}
        fingerGuideMode="auto"
        keySoundMuted
        onCompleteQuickStart={vi.fn(async () => undefined)}
        onContinueRecommended={vi.fn()}
        onDismissQuickStart={vi.fn(async () => undefined)}
        onKeySoundMutedChange={vi.fn()}
        onOpenCourse={vi.fn()}
        onOpenCourses={vi.fn()}
        onOpenReview={vi.fn()}
        onResumeActivePractice={vi.fn()}
        onStartLesson={vi.fn()}
        quickStartSession={quickStartSession}
        scope={quickStartSession.scope}
        speechVoiceUri={null}
      />,
    );

    expect(html).toContain("Content unavailable");
    expect(html).toContain("replace or re-import");
    expect(html).toContain("Browse courses");
    expect(html).not.toContain("Quick Start complete");
    for (const card of cards) {
      expect(html).not.toContain(card.prompt);
      expect(html).not.toContain(card.english);
    }
  });

  it("shows the same target-free recovery for a fully blocked standard scope", () => {
    const cards = QUICK_START_CARD_IDS.map(unsafeCard);
    const html = renderToStaticMarkup(
      <PracticeWorkbench
        controller={controllerFor(cards)}
        fingerGuideMode="auto"
        keySoundMuted
        onCompleteQuickStart={vi.fn(async () => undefined)}
        onContinueRecommended={vi.fn()}
        onDismissQuickStart={vi.fn(async () => undefined)}
        onKeySoundMutedChange={vi.fn()}
        onOpenCourse={vi.fn()}
        onOpenCourses={vi.fn()}
        onOpenReview={vi.fn()}
        onResumeActivePractice={vi.fn()}
        onStartLesson={vi.fn()}
        quickStartSession={null}
        scope={{
          kind: "lesson",
          courseId: course.id,
          lessonId: "sf-u1-l1",
          mode: "replay",
        }}
        speechVoiceUri={null}
      />,
    );

    expect(html).toContain("Content unavailable");
    expect(html).toContain("replace or re-import");
    expect(html).not.toContain("Restoring local practice");
    for (const card of cards) {
      expect(html).not.toContain(card.prompt);
      expect(html).not.toContain(card.english);
      expect(html).not.toContain(card.id);
    }
  });

  it("quarantines unsafe cards in a mixed queue and reports only their count", () => {
    const cards = QUICK_START_CARD_IDS.map((id, index) => (
      index === 0 ? unsafeCard(id) : safeCard(id)
    ));
    const quickStartSession = buildQuickStartSession({ courses: [course], cards });
    const html = renderToStaticMarkup(
      <PracticeWorkbench
        controller={controllerFor(cards)}
        fingerGuideMode="auto"
        keySoundMuted
        onCompleteQuickStart={vi.fn(async () => undefined)}
        onContinueRecommended={vi.fn()}
        onDismissQuickStart={vi.fn(async () => undefined)}
        onKeySoundMutedChange={vi.fn()}
        onOpenCourse={vi.fn()}
        onOpenCourses={vi.fn()}
        onOpenReview={vi.fn()}
        onResumeActivePractice={vi.fn()}
        onStartLesson={vi.fn()}
        quickStartSession={quickStartSession}
        scope={quickStartSession.scope}
        speechVoiceUri={null}
      />,
    );

    const blocked = cards[0];
    expect(html).toContain("1 sentence was quarantined");
    expect(html).toContain("Replace or re-import content");
    expect(html).not.toContain(blocked.prompt);
    expect(html).not.toContain(blocked.english);
    expect(html).not.toContain(blocked.id);
  });

  it("blocks replacement behind a target-free explicit confirmation", () => {
    const html = renderToStaticMarkup(
      <PracticeSessionReplacementConfirmation
        error={null}
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("Another Practice session is still active");
    expect(html).toContain("Replace the active Practice session?");
    expect(html).toContain("Cancel returns to the active Practice session with its draft intact");
    expect(html).toContain("Close it and start new");
    expect(html).toContain(">Cancel<");
    expect(html).not.toContain("card-");
    expect(html).not.toContain("learner draft");
  });

  it("durably advances Quick Start before the post-First-Exposure screen can reload", () => {
    const checkpoint = quickStartCheckpoint();

    const advanced = transitionCheckpointAfterFirstExposure({
      checkpoint,
      currentOccurrenceId: "occurrence-exposure",
      nextStandardTurn: null,
    });

    expect(advanced.currentOccurrenceId).toBe("occurrence-copy");
    expect(advanced.turn).toEqual(advanced.itinerary[1].turn);
    expect(advanced.itinerary[0].status).toBe("completed");
    expect(advanced.draft).toBe("");
  });

  it("carries typing captured during First Exposure into the durable recall turn", () => {
    const advanced = transitionCheckpointAfterFirstExposure({
      checkpoint: quickStartCheckpoint(),
      currentOccurrenceId: "occurrence-exposure",
      nextStandardTurn: null,
      draft: "i'm",
      selectionStart: 3,
      selectionEnd: 3,
    });

    expect(advanced).toMatchObject({
      currentOccurrenceId: "occurrence-copy",
      draft: "i'm",
      selectionStart: 3,
      selectionEnd: 3,
    });
  });
});

describe("PracticeWorkbench support save feedback", () => {
  it("keeps successful audio playback and learning-record persistence silent", () => {
    expect(recallSupportSavedNotice("audio", 3)).toBeNull();
    expect(recallSupportSavedNotice("answer", 4, true)).toBe(
      "Answer shown. Type it exactly for instructional completion.",
    );
  });

  it("describes an audio-record failure without claiming that support is visible", () => {
    const copy = recallSupportSaveFailureCopy("audio");

    expect(copy).toEqual({
      label: "Retry saving audio record",
      message: "Audio played, but its learning record could not be saved.",
      notice: null,
    });
    expect(Object.values(copy).join(" ")).not.toContain("support remains visible");
  });

  it("keeps visible-answer recovery distinct from audio recovery", () => {
    expect(recallSupportSaveFailureCopy("answer", true)).toMatchObject({
      label: "Retry saving Answer Reveal",
      message: expect.stringContaining("answer remains visible"),
    });
  });

  it("automatically retries a pending audio save before submission", async () => {
    const retry = vi.fn(async () => true);
    const operation: PracticeFailedOperation = {
      kind: "audio-save",
      label: "Retry saving audio record",
      locksPractice: false,
      message: "Audio played, but its learning record could not be saved.",
      retry,
    };

    await expect(retryPendingAudioSave(operation)).resolves.toBe(true);
    expect(retry).toHaveBeenCalledOnce();
    await expect(retryPendingAudioSave(null)).resolves.toBe(true);
  });

  it("retries audio persistence instead of running commands that change the turn", () => {
    for (const command of [
      "mark-mastered",
      "next",
      "previous",
      "retry",
      "skip",
      "toggle-answer",
      "toggle-vocabulary",
    ] as const) {
      expect(shouldRetryAudioSaveBeforeCommand(command)).toBe(true);
    }

    for (const command of [
      "append",
      "delete",
      "play-audio",
      "submit",
      "toggle-pause",
    ] as const) {
      expect(shouldRetryAudioSaveBeforeCommand(command)).toBe(false);
    }
  });
});

function controllerFor(cards: SentenceCard[]): TrainingController {
  return {
    status: "ready",
    error: null,
    snapshot: {
      courses: [course],
      cards,
      sentenceLearningStates: [],
      reviewStates: [],
      vocabularyEntries: [],
      progressDashboard: { needsAttention: { weakCards: [] } },
      courseProgress: [],
    } as unknown as TrainingSnapshot,
    previewAttempt: previewPracticeAttempt,
  } as TrainingController;
}

const course: Course = {
  id: "starter-foundations",
  title: "Starter Foundations",
  description: "Starter content.",
  categoryId: "foundations",
  tags: [],
  level: { label: "A1", cefrFrom: "A1", cefrTo: "A1" },
  provider: { kind: "original", name: "UtterLoop" },
  revision: 1,
  license: { name: "Original", url: "https://example.com", attribution: "Test" },
  units: [{
    id: "sf-u1",
    title: "Starter Unit",
    description: "Starter unit.",
    lessons: [{
      id: "sf-u1-l1",
      title: "First Lesson",
      objective: "Start recalling.",
      cardIds: [...QUICK_START_CARD_IDS],
    }],
  }],
};

function unsafeCard(id: (typeof QUICK_START_CARD_IDS)[number]): SentenceCard {
  const english = `Unsafe target for ${id}.`;
  return {
    id,
    english,
    prompt: `请输入：${english}`,
    source: "Test",
    tags: [],
    acceptableAnswers: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function safeCard(id: (typeof QUICK_START_CARD_IDS)[number]): SentenceCard {
  return {
    ...unsafeCard(id),
    english: `Safe target for ${id}.`,
    prompt: `A safe recall cue for card ${id}.`,
  };
}

function quickStartCheckpoint(): PracticeSessionCheckpointV2 {
  const turn = (turnId: string, phase: "first-exposure" | "guided-recall") => ({
    turnId,
    phase,
    supportLevelUsed: 0 as const,
    supportKindsUsed: [],
    receivedCorrection: false,
    reviewFailureRecorded: false,
    submissionIndex: 0,
  });
  return {
    id: "active",
    schemaVersion: 2,
    sessionId: "session-quick-start",
    roundId: "round-quick-start",
    entryPoint: "quick-start-v1",
    startedAt: "2026-08-01T08:00:00.000Z",
    engagedAt: null,
    revision: 0,
    scope: { kind: "lesson", courseId: course.id, lessonId: "sf-u1-l1", mode: "learn" },
    scopeKey: "lesson:starter-foundations:sf-u1-l1:learn",
    catalogFingerprint: "catalog",
    itinerary: [
      {
        id: "occurrence-exposure",
        cardId: QUICK_START_CARD_IDS[0],
        originalIndex: 0,
        returnIndex: 0,
        queueReason: "new-learning",
        status: "ready",
        turn: turn("turn-exposure", "first-exposure"),
      },
      {
        id: "occurrence-copy",
        cardId: QUICK_START_CARD_IDS[0],
        originalIndex: 0,
        returnIndex: 1,
        queueReason: "new-learning",
        status: "ready",
        turn: turn("turn-copy", "guided-recall"),
      },
    ],
    currentOccurrenceId: "occurrence-exposure",
    draft: "",
    selectionStart: 0,
    selectionEnd: 0,
    turn: turn("turn-exposure", "first-exposure"),
    elapsedSeconds: 2,
    itemElapsedSeconds: 2,
    stats: {
      completedCount: 0,
      perfectCount: 0,
      closeCount: 0,
      retryCount: 0,
      skippedCount: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      audioPlays: 0,
      revealed: 0,
      accuracyTotal: 0,
      returnCounts: {},
      pendingReturns: [],
    },
    round: {
      initialOccurrenceIds: ["occurrence-exposure", "occurrence-copy"],
      scheduledOccurrenceIds: ["occurrence-exposure", "occurrence-copy"],
      attemptedOccurrenceIds: [],
      completedOccurrenceIds: [],
      skippedOccurrenceIds: [],
      remainingOccurrenceIds: ["occurrence-exposure", "occurrence-copy"],
      dueReviewScheduledOccurrenceIds: [],
      dueReviewCompletedOccurrenceIds: [],
      introducedCardIds: [],
      firstPassCardIds: [],
      requeue: {
        insertedReturnOccurrenceIds: [],
        deferredNoRoomCardIds: [],
        capReachedCardIds: [],
      },
    },
    updatedAt: "2026-08-01T08:00:02.000Z",
  };
}
