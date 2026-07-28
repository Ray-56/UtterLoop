import { CORRECTION_SLOT_PLACEHOLDER } from "../../domain/practice/buildAttemptPreview";

export type PracticeKeyCommand =
  | { type: "append"; value: string }
  | { type: "delete" }
  | { type: "clear" }
  | { type: "incomplete" }
  | { type: "submit" }
  | { type: "next" }
  | { type: "mark-mastered" }
  | { type: "toggle-vocabulary" }
  | { type: "retry" }
  | { type: "play-audio" }
  | { type: "toggle-answer" }
  | { type: "resume-editing" }
  | { type: "previous" }
  | { type: "skip" }
  | { type: "toggle-pause" };

export interface PracticeKeyInput {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  altGraphKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  hasAnswer: boolean;
  hasResult: boolean;
  isAttemptComplete: boolean;
  canAdvance: boolean;
  isSubmitting: boolean;
  isPaused: boolean;
}

export interface StableCorrectionDraft {
  answer: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface CorrectionSpaceNavigation {
  command: { type: "append"; value: " " };
  selectionStart: number;
  selectionEnd: number;
}

export function resolveCorrectionSpaceNavigation(
  answer: string,
  selectionEnd: number,
): CorrectionSpaceNavigation | null {
  const followingErrorOffset = answer.indexOf(
    CORRECTION_SLOT_PLACEHOLDER,
    selectionEnd,
  );
  const nextErrorOffset = followingErrorOffset >= 0
    ? followingErrorOffset
    : answer.indexOf(CORRECTION_SLOT_PLACEHOLDER);

  return nextErrorOffset < 0
    ? null
    : {
        command: { type: "append", value: " " },
        selectionStart: nextErrorOffset,
        selectionEnd: nextErrorOffset + CORRECTION_SLOT_PLACEHOLDER.length,
      };
}

export function stabilizeCorrectionDraft(
  previousAnswer: string,
  nextAnswer: string,
  nextCaretOffset: number,
): StableCorrectionDraft {
  const nextSlots = nextAnswer.split(" ");
  const boundedCaretOffset = Math.min(nextCaretOffset, previousAnswer.length);

  if (nextSlots.length !== previousAnswer.split(" ").length) {
    return {
      answer: previousAnswer,
      selectionStart: boundedCaretOffset,
      selectionEnd: boundedCaretOffset,
    };
  }

  const firstEmptySlotIndex = nextSlots.findIndex((slot) => !slot);
  if (firstEmptySlotIndex < 0) {
    return {
      answer: nextAnswer,
      selectionStart: nextCaretOffset,
      selectionEnd: nextCaretOffset,
    };
  }

  nextSlots.forEach((slot, index) => {
    if (!slot) {
      nextSlots[index] = CORRECTION_SLOT_PLACEHOLDER;
    }
  });
  const stableAnswer = nextSlots.join(" ");
  const nextSelectionStart = firstEmptySlotIndex === 0
    ? 0
    : nextSlots.slice(0, firstEmptySlotIndex).join(" ").length + 1;

  return {
    answer: stableAnswer,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionStart + CORRECTION_SLOT_PLACEHOLDER.length,
  };
}

export function resolvePracticeKey(input: PracticeKeyInput): PracticeKeyCommand | null {
  if (input.isComposing) {
    return null;
  }

  if (input.isSubmitting) {
    return null;
  }

  if (input.ctrlKey && !input.shiftKey && !input.altKey && !input.altGraphKey && !input.metaKey) {
    const key = input.key.toLowerCase();

    if (key === "m") {
      return { type: "mark-mastered" };
    }

    if (key === "n") {
      return { type: "toggle-vocabulary" };
    }

    if (input.code === "Semicolon" || key === ";") {
      return input.hasResult && input.canAdvance ? { type: "retry" } : { type: "toggle-answer" };
    }

    if (input.code === "Quote" || ["'", '"'].includes(input.key)) {
      return { type: "play-audio" };
    }

    if (key === "p") {
      return { type: "toggle-pause" };
    }

    return null;
  }

  if (input.isPaused) {
    return null;
  }

  if (input.shiftKey && !input.ctrlKey && !input.metaKey && !input.altKey && !input.altGraphKey) {
    if (input.key === "ArrowRight") {
      return { type: "skip" };
    }

    if (input.key === "ArrowLeft") {
      return { type: "previous" };
    }
  }

  if (input.ctrlKey || input.metaKey || input.altKey || input.altGraphKey) {
    return null;
  }

  if (input.shiftKey && input.key.length !== 1) {
    return null;
  }

  if (input.key === "Enter") {
    if (input.hasResult) {
      return input.canAdvance ? { type: "next" } : { type: "resume-editing" };
    }

    if (!input.hasAnswer) {
      return null;
    }

    if (!input.isAttemptComplete) {
      return { type: "incomplete" };
    }

    return !input.isSubmitting ? { type: "submit" } : null;
  }

  if (input.key === "Escape") {
    return { type: "clear" };
  }

  if (input.hasResult && input.canAdvance) {
    return null;
  }

  if (input.key === "Backspace") {
    return { type: "delete" };
  }

  if (input.key.length === 1) {
    return { type: "append", value: input.key };
  }

  return null;
}
