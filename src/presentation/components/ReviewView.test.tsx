import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReviewDashboard } from "../../domain/review/buildReviewDashboard";
import {
  EMPTY_REVIEW_ACTION_STATE,
  ReviewView,
  VocabularyRow,
  focusVocabularyRemovalTarget,
  getVocabularyRemovalFocusCandidates,
  reduceReviewActionState,
  type ReviewActionCommand,
} from "./ReviewView";

describe("ReviewView", () => {
  it("retains the exact failed row command for an immutable retry", () => {
    const execute = vi.fn();
    const command: ReviewActionCommand = Object.freeze({
      key: "vocabulary:save:saved",
      cardId: "saved",
      pendingLabel: "Saving…",
      retryLabel: "Retry saving Vocabulary",
      successMessage: "Sentence saved to Vocabulary.",
      failureMessage: "Sentence was not saved to Vocabulary.",
      execute,
    });

    const pending = reduceReviewActionState(EMPTY_REVIEW_ACTION_STATE, {
      type: "started",
      command,
    });
    const failed = reduceReviewActionState(pending, {
      type: "failed",
      command,
    });

    expect(failed.operations[command.key]).toEqual({
      status: "failed",
      command,
      message: "Sentence was not saved to Vocabulary.",
    });
    expect(failed.operations[command.key]?.command).toBe(command);

    const retried = reduceReviewActionState(failed, {
      type: "started",
      command: failed.operations[command.key]!.command,
    });

    expect(retried.operations[command.key]).toEqual({ status: "pending", command });
    expect(retried.operations[command.key]?.command).toBe(command);
  });

  it("settles one row command without clearing another row's pending state", () => {
    const first = reviewCommand("return:first", "first");
    const second = reviewCommand("remove:second", "second");
    const withFirst = reduceReviewActionState(EMPTY_REVIEW_ACTION_STATE, {
      type: "started",
      command: first,
    });
    const bothPending = reduceReviewActionState(withFirst, {
      type: "started",
      command: second,
    });

    expect(Object.keys(bothPending.operations)).toEqual([first.key, second.key]);

    const firstSettled = reduceReviewActionState(bothPending, {
      type: "succeeded",
      command: first,
    });

    expect(firstSettled.operations[first.key]).toBeUndefined();
    expect(firstSettled.operations[second.key]).toEqual({ status: "pending", command: second });
    expect(firstSettled.messages).toEqual({ first: "Saved first." });
  });

  it("hands focus to the next Vocabulary row, then the previous row or section heading", () => {
    const nextButton = focusTarget();
    const previousButton = focusTarget();
    const heading = focusTarget();
    const root = focusRoot({
      "vocabulary-primary-action:third": nextButton,
      "vocabulary-primary-action:first": previousButton,
      "vocabulary-review-heading": heading,
    });

    const middleCandidates = getVocabularyRemovalFocusCandidates(
      ["first", "second", "third"],
      "second",
    );
    expect(middleCandidates).toEqual(["third", "first"]);
    expect(focusVocabularyRemovalTarget(root, middleCandidates)).toBe(
      "vocabulary-primary-action:third",
    );
    expect(root.activeElement).toBe(nextButton);

    const lastCandidates = getVocabularyRemovalFocusCandidates(["first", "second"], "second");
    expect(lastCandidates).toEqual(["first"]);
    expect(focusVocabularyRemovalTarget(root, lastCandidates)).toBe(
      "vocabulary-primary-action:first",
    );
    expect(root.activeElement).toBe(previousButton);

    expect(focusVocabularyRemovalTarget(root, [])).toBe("vocabulary-review-heading");
    expect(root.activeElement).toBe(heading);
  });

  it("renders an action-specific row Retry without borrowing another card's pending state", () => {
    const failedCommand = reviewCommand("remove:saved", "saved");
    const otherPending = reviewCommand("return:other", "other");
    const failed = reduceReviewActionState(
      reduceReviewActionState(EMPTY_REVIEW_ACTION_STATE, {
        type: "started",
        command: failedCommand,
      }),
      { type: "failed", command: failedCommand },
    );
    const state = reduceReviewActionState(failed, {
      type: "started",
      command: otherPending,
    });

    const html = renderToStaticMarkup(
      <VocabularyRow
        actionState={state}
        item={vocabularyItem("saved")}
        onPractice={vi.fn()}
        onRemove={vi.fn()}
        onRetry={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(html).toContain('aria-busy="false"');
    expect(html).toContain("Could not save saved.");
    expect(html).toContain('aria-label="Retry saved for saved"');
    expect(html).toContain(">Retry saved</button>");
    expect(html).not.toContain("Saving other…");
  });

  it("disables one-card Practice while that Vocabulary row is being mutated", () => {
    const command = reviewCommand("remove:saved", "saved");
    const state = reduceReviewActionState(EMPTY_REVIEW_ACTION_STATE, {
      type: "started",
      command,
    });
    const html = renderToStaticMarkup(
      <VocabularyRow
        actionState={state}
        item={vocabularyItem("saved")}
        onPractice={vi.fn()}
        onRemove={vi.fn()}
        onRetry={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(html).toMatch(/aria-label="Practice saved"[^>]*disabled/);
  });

  it("blocks one-card Practice for quarantined Vocabulary content", () => {
    const html = renderToStaticMarkup(
      <VocabularyRow
        actionState={EMPTY_REVIEW_ACTION_STATE}
        item={{
          ...vocabularyItem("unsafe"),
          prompt: "Prompt unavailable — replace or re-import this content.",
          contentSafety: "blocked-content",
        }}
        onPractice={vi.fn()}
        onRemove={vi.fn()}
        onRetry={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(html).toContain("Content blocked");
    expect(html).toMatch(/aria-label="Practice unsafe"[^>]*disabled/);
  });

  it("renders target-free Due and Upcoming regions from the safe dashboard", () => {
    const html = render(dashboard({
      due: [reviewItem("due", "需要现在复习", true)],
      upcoming: [reviewItem("upcoming", "稍后再复习", false)],
    }));

    expect(html).toContain('aria-labelledby="due-review-heading"');
    expect(html).toContain('aria-labelledby="upcoming-review-heading"');
    expect(html).toContain("需要现在复习");
    expect(html).toContain("稍后再复习");
    expect(html).not.toContain("Do not reveal the due answer");
    expect(html).not.toContain("Do not reveal the future answer");
    expect(html).not.toContain("acceptableAnswers");
  });

  it("shows the selected safe course option and its due count", () => {
    const html = render(dashboard({
      selectedCourseId: "course-one",
      courseOptions: [
        { courseId: "course-one", title: "Course One", dueCount: 1, upcomingCount: 2 },
        { courseId: "course-two", title: "Course Two", dueCount: 0, upcomingCount: 1 },
      ],
      due: [reviewItem("selected", "选中课程提示", true, ["course-one"], ["Course One"])],
    }));

    expect(html).toContain('<label for="review-course-filter">Review course</label>');
    expect(html).toContain('<option value="">All courses</option>');
    expect(html).toContain('<option value="course-one" selected="">Course One · 1 due</option>');
    expect(html).toContain('<option value="course-two">Course Two · 0 due</option>');
    expect(html).toContain("1 card ready");
  });

  it("keeps Mastered and Vocabulary target-free while exposing independent actions", () => {
    const html = render(dashboard({
      mastered: [{
        cardId: "mastered",
        prompt: "把这句话带回来",
        contentSafety: "safe",
        courseIds: [],
        courseTitles: ["Imported / uncategorized"],
        source: "Test source",
        isInVocabulary: false,
      }],
      vocabulary: [
        {
          cardId: "saved",
          prompt: "保留这句话",
          contentSafety: "safe",
          courseIds: [],
          courseTitles: ["Imported / uncategorized"],
          source: "Test source",
          savedAt: "2026-07-29T08:00:00.000Z",
          isMastered: false,
        },
        {
          cardId: "mastered-saved",
          prompt: "再练这句话",
          contentSafety: "safe",
          courseIds: [],
          courseTitles: ["Imported / uncategorized"],
          source: "Test source",
          savedAt: "2026-07-28T08:00:00.000Z",
          isMastered: true,
        },
      ],
    }));

    expect(html).toContain("Mastered sentences · 1");
    expect(html).toContain("2 saved sentences · 1 active");
    expect(html).toContain('aria-label="Return mastered to new"');
    expect(html).toContain('aria-label="Save mastered to Vocabulary"');
    expect(html).toContain('aria-label="Practice saved"');
    expect(html).toContain('aria-label="Remove saved from Vocabulary"');
    expect(html).toContain('aria-label="Return mastered-saved to new"');
    expect(html).not.toContain("Bring this sentence back");
    expect(html).not.toContain("Keep this sentence");
  });

  it("announces Due, Upcoming, and management count changes politely", () => {
    const html = render(dashboard({
      due: [reviewItem("due", "需要现在复习", true)],
      upcoming: [reviewItem("upcoming", "稍后再复习", false)],
      mastered: [{
        cardId: "mastered",
        prompt: "把这句话带回来",
        contentSafety: "safe",
        courseIds: [],
        courseTitles: ["Imported / uncategorized"],
        source: "Test source",
        isInVocabulary: false,
      }],
      vocabulary: [vocabularyItem("saved")],
    }));

    expect(html).toMatch(/aria-label="Due now count: 1"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    expect(html).toMatch(/aria-label="Upcoming count: 1"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    expect(html).toMatch(/id="mastered-review-heading"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    expect(html).toMatch(/id="vocabulary-review-heading"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  });

  it("limits Upcoming to eight rows until expanded", () => {
    const upcoming = Array.from({ length: 10 }, (_, index) =>
      reviewItem(`future-${index}`, `未来提示 ${index}`, false));
    const html = render(dashboard({ upcoming }));

    expect(html).toContain("Showing 8 of 10");
    expect(html).toContain("Show all upcoming");
    expect(html).toContain("未来提示 7");
    expect(html).not.toContain("未来提示 8");
  });
});

function render(value: ReviewDashboard): string {
  return renderToStaticMarkup(
    <ReviewView
      dashboard={value}
      onPracticeVocabularyCard={vi.fn()}
      onRemoveVocabulary={vi.fn()}
      onReturnToNew={vi.fn()}
      onReviewCourseChange={vi.fn()}
      onSetVocabulary={vi.fn()}
      onStartReview={vi.fn()}
      onStartVocabulary={vi.fn()}
    />,
  );
}

function dashboard(patch: Partial<ReviewDashboard>): ReviewDashboard {
  return {
    selectedCourseId: null,
    courseOptions: [],
    due: [],
    upcoming: [],
    mastered: [],
    vocabulary: [],
    ...patch,
  };
}

function reviewItem(
  cardId: string,
  prompt: string,
  isDue: boolean,
  courseIds: string[] = [],
  courseTitles: string[] = ["Imported / uncategorized"],
) {
  return {
    cardId,
    prompt,
    contentSafety: "safe" as const,
    courseIds,
    courseTitles,
    source: "Test source",
    stage: 1 as const,
    dueAt: isDue ? "2026-07-30T08:00:00.000Z" : "2026-08-02T08:00:00.000Z",
    isDue,
    readiness: "retention" as const,
    isInVocabulary: false,
  };
}

function reviewCommand(key: string, cardId: string): ReviewActionCommand {
  return Object.freeze({
    key,
    cardId,
    pendingLabel: `Saving ${cardId}…`,
    retryLabel: `Retry ${cardId}`,
    successMessage: `Saved ${cardId}.`,
    failureMessage: `Could not save ${cardId}.`,
    execute: vi.fn(),
  });
}

function vocabularyItem(cardId: string) {
  return {
    cardId,
    prompt: "保留这句话",
    contentSafety: "safe" as const,
    courseIds: [],
    courseTitles: ["Imported / uncategorized"],
    source: "Test source",
    savedAt: "2026-07-29T08:00:00.000Z",
    isMastered: false,
  };
}

function focusTarget() {
  return {
    focus: vi.fn(function focus(this: object) {
      currentFocusRoot!.activeElement = this;
    }),
  };
}

let currentFocusRoot: ReturnType<typeof focusRoot> | null = null;

function focusRoot(targets: Record<string, ReturnType<typeof focusTarget>>) {
  const root = {
    activeElement: null as object | null,
    getElementById: vi.fn((id: string) => targets[id] ?? null),
  };
  currentFocusRoot = root;
  return root;
}
