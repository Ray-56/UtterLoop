import { describe, expect, it } from "vitest";
import { CORRECTION_SLOT_PLACEHOLDER } from "../../domain/practice/buildAttemptPreview";
import {
  resolvePracticeKey,
  stabilizeCorrectionDraft,
} from "./resolvePracticeKey";

const baseKey = {
  code: "KeyA",
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  altGraphKey: false,
  metaKey: false,
  isComposing: false,
  hasAnswer: false,
  hasResult: false,
  isAttemptComplete: false,
  canAdvance: false,
  isSubmitting: false,
  isPaused: false,
};

describe("resolvePracticeKey", () => {
  it("turns printable keys into sentence input", () => {
    expect(resolvePracticeKey({ ...baseKey, key: "a" })).toEqual({ type: "append", value: "a" });
    expect(resolvePracticeKey({ ...baseKey, key: " " })).toEqual({ type: "append", value: " " });
    expect(resolvePracticeKey({ ...baseKey, key: "A", shiftKey: true })).toEqual({ type: "append", value: "A" });
  });

  it("maps the Julebu core practice shortcuts", () => {
    expect(resolvePracticeKey({ ...baseKey, key: "'", code: "Quote", ctrlKey: true })).toEqual({ type: "play-audio" });
    expect(resolvePracticeKey({ ...baseKey, key: "m", ctrlKey: true })).toEqual({ type: "mark-mastered" });
    expect(resolvePracticeKey({ ...baseKey, key: "n", ctrlKey: true })).toEqual({ type: "toggle-vocabulary" });
    expect(resolvePracticeKey({ ...baseKey, key: ";", code: "Semicolon", ctrlKey: true })).toEqual({ type: "toggle-answer" });
    expect(resolvePracticeKey({
      ...baseKey,
      key: ";",
      code: "Semicolon",
      ctrlKey: true,
      hasResult: true,
      canAdvance: true,
    })).toEqual({ type: "retry" });
    expect(resolvePracticeKey({ ...baseKey, key: "Enter", hasResult: true, canAdvance: true })).toEqual({ type: "next" });
  });

  it("maps previous, skip, and pause without taking the AI shortcut", () => {
    expect(resolvePracticeKey({ ...baseKey, key: "ArrowLeft", shiftKey: true })).toEqual({ type: "previous" });
    expect(resolvePracticeKey({ ...baseKey, key: "ArrowRight", shiftKey: true })).toEqual({ type: "skip" });
    expect(resolvePracticeKey({ ...baseKey, key: "p", code: "KeyP", ctrlKey: true })).toEqual({ type: "toggle-pause" });
    expect(resolvePracticeKey({ ...baseKey, key: "/", code: "Slash", ctrlKey: true })).toBeNull();
  });

  it("keeps ordinary editing keys available", () => {
    expect(resolvePracticeKey({ ...baseKey, key: "Backspace" })).toEqual({ type: "delete" });
    expect(resolvePracticeKey({ ...baseKey, key: "Escape" })).toEqual({ type: "clear" });
    expect(resolvePracticeKey({ ...baseKey, key: "`", code: "Backquote", ctrlKey: true })).toBeNull();
  });

  it("blocks incomplete attempts, resumes failed corrections, and advances only perfect results", () => {
    expect(resolvePracticeKey({ ...baseKey, key: "Enter", hasAnswer: true })).toEqual({ type: "incomplete" });
    expect(resolvePracticeKey({ ...baseKey, key: "Enter", hasAnswer: true, isAttemptComplete: true })).toEqual({ type: "submit" });
    expect(resolvePracticeKey({ ...baseKey, key: "Enter", hasAnswer: true, hasResult: true })).toEqual({ type: "resume-editing" });
    expect(resolvePracticeKey({ ...baseKey, key: "Enter", hasAnswer: true, hasResult: true, canAdvance: true })).toEqual({ type: "next" });
    expect(resolvePracticeKey({ ...baseKey, key: "Enter" })).toBeNull();
  });

  it("allows correction after a failed result but locks a passed result", () => {
    expect(resolvePracticeKey({ ...baseKey, key: "a", hasResult: true })).toEqual({ type: "append", value: "a" });
    expect(resolvePracticeKey({ ...baseKey, key: "a", hasResult: true, canAdvance: true })).toBeNull();
    expect(resolvePracticeKey({ ...baseKey, key: "a", metaKey: true })).toBeNull();
    expect(resolvePracticeKey({ ...baseKey, key: "a", isComposing: true })).toBeNull();
  });

  it("allows only pause while practice is paused", () => {
    expect(resolvePracticeKey({ ...baseKey, key: "a", isPaused: true })).toBeNull();
    expect(resolvePracticeKey({ ...baseKey, key: "p", code: "KeyP", ctrlKey: true, isPaused: true })).toEqual({
      type: "toggle-pause",
    });
  });

  it("locks every command while a submission is in flight", () => {
    expect(resolvePracticeKey({
      ...baseKey,
      key: "ArrowLeft",
      shiftKey: true,
      isSubmitting: true,
    })).toBeNull();
    expect(resolvePracticeKey({
      ...baseKey,
      key: "m",
      ctrlKey: true,
      isSubmitting: true,
    })).toBeNull();
    expect(resolvePracticeKey({
      ...baseKey,
      key: "a",
      isSubmitting: true,
    })).toBeNull();
  });

  it("does not treat shifted, Command, or AltGr combinations as core Control shortcuts", () => {
    expect(resolvePracticeKey({ ...baseKey, key: ";", code: "Semicolon", ctrlKey: true, shiftKey: true })).toBeNull();
    expect(resolvePracticeKey({ ...baseKey, key: "m", ctrlKey: true, metaKey: true })).toBeNull();
    expect(resolvePracticeKey({ ...baseKey, key: "n", ctrlKey: true, altKey: true })).toBeNull();
    expect(resolvePracticeKey({ ...baseKey, key: "n", ctrlKey: true, altGraphKey: true })).toBeNull();
  });
});

describe("stabilizeCorrectionDraft", () => {
  it("keeps later correct words in place across native deletion paths", () => {
    const answer = `hello wrong name ${CORRECTION_SLOT_PLACEHOLDER} emma`;

    expect(stabilizeCorrectionDraft(
      answer,
      `hello  name ${CORRECTION_SLOT_PLACEHOLDER} emma`,
      6,
    )).toEqual({
      answer: `hello ${CORRECTION_SLOT_PLACEHOLDER} name ${CORRECTION_SLOT_PLACEHOLDER} emma`,
      selectionStart: 6,
      selectionEnd: 7,
    });
    expect(stabilizeCorrectionDraft(
      answer,
      `hellowrong name ${CORRECTION_SLOT_PLACEHOLDER} emma`,
      5,
    )).toEqual({
      answer,
      selectionStart: 5,
      selectionEnd: 5,
    });
  });
});
