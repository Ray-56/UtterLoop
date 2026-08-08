import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { Course } from "../../domain/curriculum/Course";
import type {
  PracticePhase,
  RecallSupportKind,
  RecallSupportLevel,
} from "../../domain/practice/PracticeTurn";

export const QUICK_START_VERSION = 1 as const;
export const QUICK_START_COURSE_ID = "starter-foundations" as const;
export const QUICK_START_LESSON_ID = "sf-u1-l1" as const;
export const QUICK_START_CARD_IDS = ["sf-001", "sf-002", "sf-003"] as const;

export interface BuildQuickStartSessionInput {
  courses: readonly Course[];
  cards: readonly SentenceCard[];
}

export type QuickStartGuideStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface QuickStartFirstExposureStep {
  id: string;
  kind: "first-exposure";
  cardId: (typeof QUICK_START_CARD_IDS)[number];
  guideStep: 1 | 3 | 4;
  exposureStyle: "full" | "abbreviated";
  createsAttempt: false;
}

export interface QuickStartRecallStep {
  id: string;
  kind: "recall";
  cardId: (typeof QUICK_START_CARD_IDS)[number];
  guideStep: 2 | 3 | 4 | 5;
  purpose: "guided" | "independent-return";
  phase: Extract<PracticePhase, "guided-recall" | "independent-recall">;
  initialSupportLevel: RecallSupportLevel;
  initialSupportKinds: readonly RecallSupportKind[];
  targetVisible: boolean;
  answerWasRevealed: false;
  firstPassEligible: boolean;
  minimumInterveningRecallTurns: 0 | 2;
}

export interface QuickStartExplanationStep {
  id: "explain-review";
  kind: "explanation";
  cardId: null;
  guideStep: 6;
  topics: readonly ["spaced-review", "support-available"];
  completesQuickStart: true;
}

export type QuickStartItineraryStep =
  | QuickStartFirstExposureStep
  | QuickStartRecallStep
  | QuickStartExplanationStep;

export interface QuickStartSession {
  version: typeof QUICK_START_VERSION;
  scope: {
    kind: "lesson";
    courseId: typeof QUICK_START_COURSE_ID;
    lessonId: typeof QUICK_START_LESSON_ID;
    mode: "learn";
  };
  cardIds: typeof QUICK_START_CARD_IDS;
  itinerary: readonly QuickStartItineraryStep[];
}

export function buildQuickStartSession(input: BuildQuickStartSessionInput): QuickStartSession {
  assertStarterContent(input);

  return {
    version: QUICK_START_VERSION,
    scope: quickStartLessonScope(),
    cardIds: QUICK_START_CARD_IDS,
    itinerary: [
      exposure("expose-card-1", "sf-001", 1, "full"),
      recall({
        // Preserve the itinerary ID for existing local Quick Start state; this is no longer copy-along.
        id: "copy-card-1",
        cardId: "sf-001",
        guideStep: 2,
        purpose: "guided",
        phase: "guided-recall",
        initialSupportLevel: 0,
        initialSupportKinds: [],
        targetVisible: false,
        firstPassEligible: false,
      }),
      exposure("expose-card-2", "sf-002", 3, "abbreviated"),
      recall({
        id: "guide-card-2",
        cardId: "sf-002",
        guideStep: 3,
        purpose: "guided",
        phase: "guided-recall",
        initialSupportLevel: 0,
        initialSupportKinds: [],
        targetVisible: false,
        firstPassEligible: false,
      }),
      exposure("expose-card-3", "sf-003", 4, "abbreviated"),
      recall({
        id: "guide-card-3",
        cardId: "sf-003",
        guideStep: 4,
        purpose: "guided",
        phase: "guided-recall",
        initialSupportLevel: 0,
        initialSupportKinds: [],
        targetVisible: false,
        firstPassEligible: false,
      }),
      independentReturn("return-card-1", "sf-001"),
      independentReturn("return-card-2", "sf-002"),
      independentReturn("return-card-3", "sf-003"),
      {
        id: "explain-review",
        kind: "explanation",
        cardId: null,
        guideStep: 6,
        topics: ["spaced-review", "support-available"],
        completesQuickStart: true,
      },
    ],
  };
}

function exposure(
  id: string,
  cardId: QuickStartFirstExposureStep["cardId"],
  guideStep: QuickStartFirstExposureStep["guideStep"],
  exposureStyle: QuickStartFirstExposureStep["exposureStyle"],
): QuickStartFirstExposureStep {
  return { id, kind: "first-exposure", cardId, guideStep, exposureStyle, createsAttempt: false };
}

type RecallInput = Omit<
  QuickStartRecallStep,
  "kind" | "answerWasRevealed" | "minimumInterveningRecallTurns"
>;

function recall(input: RecallInput): QuickStartRecallStep {
  return {
    ...input,
    kind: "recall",
    answerWasRevealed: false,
    minimumInterveningRecallTurns: input.purpose === "independent-return" ? 2 : 0,
  };
}

function independentReturn(
  id: string,
  cardId: QuickStartRecallStep["cardId"],
): QuickStartRecallStep {
  return recall({
    id,
    cardId,
    guideStep: 5,
    purpose: "independent-return",
    phase: "independent-recall",
    initialSupportLevel: 0,
    initialSupportKinds: [],
    targetVisible: false,
    firstPassEligible: true,
  });
}

export function quickStartLessonScope(): QuickStartSession["scope"] {
  return {
    kind: "lesson",
    courseId: QUICK_START_COURSE_ID,
    lessonId: QUICK_START_LESSON_ID,
    mode: "learn",
  };
}

function assertStarterContent(input: BuildQuickStartSessionInput): void {
  const course = input.courses.find((candidate) => candidate.id === QUICK_START_COURSE_ID);
  const lesson = course?.units
    .flatMap((unit) => unit.lessons)
    .find((candidate) => candidate.id === QUICK_START_LESSON_ID);

  if (!course || !lesson) {
    throw new Error("Quick Start requires the first Starter Foundations Lesson.");
  }
  if (QUICK_START_CARD_IDS.some((cardId, index) => lesson.cardIds[index] !== cardId)) {
    throw new Error("Quick Start requires the approved first three Starter Foundations cards.");
  }

  const availableCardIds = new Set(input.cards.map((card) => card.id));
  const missingCardId = QUICK_START_CARD_IDS.find((cardId) => !availableCardIds.has(cardId));
  if (missingCardId) {
    throw new Error(`Quick Start requires SentenceCard ${missingCardId}.`);
  }
}
