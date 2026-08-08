import { describe, expect, it } from "vitest";
import {
  buildPrimaryNavigationState,
  buildCourseReplayScope,
  buildCourseResultLimitNavigation,
  buildFocusedPracticeScope,
  buildReviewScope,
} from "./App";
import { DEFAULT_APP_URL_STATE } from "./appUrlState";

describe("course replay navigation", () => {
  it("starts a whole-course practice scope", () => {
    expect(buildCourseReplayScope("course-1")).toEqual({
      kind: "course",
      courseId: "course-1",
    });
  });

  it("keeps the selected course in the review practice scope", () => {
    expect(buildReviewScope("course-1")).toEqual({
      kind: "review",
      courseId: "course-1",
    });
    expect(buildReviewScope()).toEqual({ kind: "review" });
  });

  it("starts one weak card as Focused Practice", () => {
    expect(buildFocusedPracticeScope("weak-card")).toEqual({
      kind: "focused",
      cardId: "weak-card",
    });
  });

  it("replaces only the Course load window while preserving discovery context", () => {
    const current = {
      ...DEFAULT_APP_URL_STATE,
      view: "courses" as const,
      catalog: {
        ...DEFAULT_APP_URL_STATE.catalog,
        selectedCourseId: "course-1",
        query: {
          ...DEFAULT_APP_URL_STATE.catalog.query,
          text: "work",
        },
      },
    };

    expect(buildCourseResultLimitNavigation(current, 48)).toEqual({
      mode: "replace",
      state: {
        ...current,
        catalog: {
          ...current.catalog,
          resultLimit: 48,
        },
      },
    });
  });

  it("clears a stale Practice scope when primary navigation leaves or re-enters Practice", () => {
    const current = {
      ...DEFAULT_APP_URL_STATE,
      practiceScope: {
        kind: "lesson" as const,
        courseId: "starter-foundations",
        lessonId: "sf-u1-l1",
        mode: "learn" as const,
      },
    };

    const coursesState = buildPrimaryNavigationState(current, "courses");
    expect(coursesState.practiceScope).toBeNull();

    expect(buildPrimaryNavigationState(coursesState, "practice").practiceScope).toBeNull();
  });
});
