import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { NextLessonAction } from "../../domain/curriculum/resolveNextLessonAction";
import {
  classifyRecallGrade,
  EMPTY_SESSION_STATS,
  explainRecallResult,
  SessionSummary,
  shouldKeepSkippedCardPending,
} from "./PracticeWorkbench";

const nextLesson: NextLessonAction = {
  courseId: "course-1",
  courseTitle: "Course One",
  lessonId: "lesson-2",
  lessonTitle: "Lesson Two",
  scope: {
    kind: "lesson",
    courseId: "course-1",
    lessonId: "lesson-2",
    mode: "learn",
  },
};

describe("Practice SessionSummary", () => {
  it("names and links the next lesson after true Lesson completion", () => {
    const html = renderToStaticMarkup(
      <SessionSummary
        elapsedSeconds={30}
        nextLesson={nextLesson}
        onOpenCourses={vi.fn()}
        onRepeat={vi.fn()}
        onStartNextLesson={vi.fn()}
        pendingReturnCount={0}
        scope={{ kind: "lesson", courseId: "course-1", lessonId: "lesson-1", mode: "learn" }}
        stats={EMPTY_SESSION_STATS}
      />,
    );

    expect(html).toContain("Lesson complete");
    expect(html).toContain("Next lesson: Lesson Two");
  });

  it("calls a pending acquisition round complete and withholds Next lesson", () => {
    const html = renderToStaticMarkup(
      <SessionSummary
        elapsedSeconds={30}
        nextLesson={null}
        onOpenCourses={vi.fn()}
        onRepeat={vi.fn()}
        onStartNextLesson={vi.fn()}
        pendingReturnCount={1}
        scope={{ kind: "lesson", courseId: "course-1", lessonId: "lesson-1", mode: "learn" }}
        stats={EMPTY_SESSION_STATS}
      />,
    );

    expect(html).toContain("Round complete");
    expect(html).not.toContain("Next lesson:");
  });

  it("uses the Course replay completion label", () => {
    const html = renderToStaticMarkup(
      <SessionSummary
        elapsedSeconds={30}
        nextLesson={null}
        onOpenCourses={vi.fn()}
        onRepeat={vi.fn()}
        onStartNextLesson={vi.fn()}
        pendingReturnCount={0}
        scope={{ kind: "course", courseId: "course-1" }}
        stats={EMPTY_SESSION_STATS}
      />,
    );

    expect(html).toContain("Course replay complete");
  });

  it("makes the learning path primary when a completed Lesson has no recommendation", () => {
    const html = renderToStaticMarkup(
      <SessionSummary
        elapsedSeconds={30}
        nextLesson={null}
        onOpenCourses={vi.fn()}
        onRepeat={vi.fn()}
        onStartNextLesson={vi.fn()}
        pendingReturnCount={0}
        scope={{ kind: "lesson", courseId: "course-1", lessonId: "lesson-last", mode: "learn" }}
        stats={EMPTY_SESSION_STATS}
      />,
    );

    expect(html).toMatch(/class="primary-button"[^>]*>View learning path/);
    expect(html).toMatch(/class="secondary-button"[^>]*>[\s\S]*Practice again/);
  });
});

describe("Practice result classification", () => {
  const base = {
    outcome: "perfect" as const,
    phase: "independent-recall" as const,
    supportLevelUsed: 0 as const,
    supportKindsUsed: [] as const,
    answerWasRevealed: false,
    receivedCorrection: false,
    submissionIndex: 0,
    hadEdits: false,
  };

  it("uses the specified evidence precedence", () => {
    expect(classifyRecallGrade({
      ...base,
      answerWasRevealed: true,
      supportLevelUsed: 4,
      supportKindsUsed: ["answer"],
      receivedCorrection: true,
      submissionIndex: 1,
    })).toBe("correct-with-answer");
    expect(classifyRecallGrade({
      ...base,
      phase: "corrective-practice",
      receivedCorrection: true,
      submissionIndex: 1,
    })).toBe("corrected");
    expect(classifyRecallGrade({
      ...base,
      phase: "guided-recall",
      supportLevelUsed: 2,
      supportKindsUsed: ["keywords"],
    })).toBe("guided");
    expect(classifyRecallGrade({ ...base, hadEdits: true })).toBe("great");
    expect(classifyRecallGrade(base)).toBe("perfect");
  });

  it("does not classify a non-perfect result as completion", () => {
    expect(classifyRecallGrade({ ...base, outcome: "close" })).toBeNull();
  });

  it("explains voluntary and supported completions without making progress claims", () => {
    expect(explainRecallResult({
      phase: "voluntary-practice",
      grade: "perfect",
      shouldRequeue: false,
      hasFirstPass: true,
      quickStartReturnIsAlreadyPlanned: false,
    })).toContain("Practice only");
    expect(explainRecallResult({
      phase: "guided-recall",
      grade: "correct-with-answer",
      shouldRequeue: false,
      hasFirstPass: true,
      quickStartReturnIsAlreadyPlanned: false,
    })).toContain("previously scheduled review remains");
    expect(explainRecallResult({
      phase: "guided-recall",
      grade: "guided",
      shouldRequeue: true,
      hasFirstPass: false,
      quickStartReturnIsAlreadyPlanned: true,
    })).toContain("independent check");
  });
});

describe("Practice skip completion", () => {
  it("keeps an unpassed Learn card pending without affecting replay or Quick Start", () => {
    const learnScope = {
      kind: "lesson",
      courseId: "course-1",
      lessonId: "lesson-1",
      mode: "learn",
    } as const;

    expect(shouldKeepSkippedCardPending(learnScope, false, undefined)).toBe(true);
    expect(shouldKeepSkippedCardPending(learnScope, true, undefined)).toBe(false);
    expect(shouldKeepSkippedCardPending({ ...learnScope, mode: "replay" }, false, undefined)).toBe(false);
    expect(shouldKeepSkippedCardPending(learnScope, false, {
      cardId: "card-1",
      introducedAt: "2026-07-31T00:00:00.000Z",
      firstPassedAt: "2026-07-31T00:01:00.000Z",
      firstPassSource: "independent-recall",
    })).toBe(false);
  });
});
