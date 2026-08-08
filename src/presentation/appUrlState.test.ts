import { describe, expect, it } from "vitest";
import {
  buildAppUrlState,
  DEFAULT_APP_URL_STATE,
  parseAppUrlState,
  type AppUrlState,
} from "./appUrlState";

describe("application URL state", () => {
  it("round-trips every canonical Practice scope", () => {
    const scopes = [
      { kind: "lesson", courseId: "starter foundations", lessonId: "lesson/1", mode: "learn" },
      { kind: "lesson", courseId: "starter", lessonId: "lesson-2", mode: "replay" },
      { kind: "review", courseId: "work-study" },
      { kind: "review" },
      { kind: "course", courseId: "starter" },
      { kind: "vocabulary", cardId: "sf-011" },
      { kind: "vocabulary", courseId: "starter" },
      { kind: "vocabulary", cardId: "sf-011", courseId: "starter" },
      { kind: "vocabulary" },
      { kind: "focused", cardId: "sf-011" },
    ] as const;

    for (const practiceScope of scopes) {
      const state: AppUrlState = {
        ...DEFAULT_APP_URL_STATE,
        view: "practice",
        practiceScope,
      };
      expect(parseAppUrlState(buildAppUrlState(state))).toEqual(state);
    }
  });

  it("uses the approved canonical parameter names and order", () => {
    expect(buildAppUrlState({
      ...DEFAULT_APP_URL_STATE,
      view: "practice",
      practiceScope: {
        kind: "lesson",
        courseId: "starter-foundations",
        lessonId: "sf-l01",
        mode: "learn",
      },
    })).toBe("?view=practice&scope=lesson&practiceCourse=starter-foundations&practiceLesson=sf-l01&practiceMode=learn");

    expect(buildAppUrlState({
      ...DEFAULT_APP_URL_STATE,
      view: "review",
      reviewCourseId: "starter-foundations",
    })).toBe("?view=review&reviewCourse=starter-foundations");
  });

  it("round-trips the catalog load window and rejects invalid limits", () => {
    const expanded: AppUrlState = {
      ...DEFAULT_APP_URL_STATE,
      view: "courses",
      catalog: {
        ...DEFAULT_APP_URL_STATE.catalog,
        resultLimit: 48,
      },
    };

    expect(buildAppUrlState(expanded)).toBe("?view=courses&limit=48");
    expect(parseAppUrlState("?view=courses&limit=48")).toEqual(expanded);
    expect(parseAppUrlState("?view=courses&limit=23").catalog.resultLimit).toBe(24);
    expect(parseAppUrlState("?view=courses&limit=not-a-number").catalog.resultLimit).toBe(24);
    expect(buildAppUrlState(DEFAULT_APP_URL_STATE)).not.toContain("limit=");
  });

  it("keeps catalog discovery context latent outside Courses", () => {
    const state = parseAppUrlState(
      "?view=review&reviewCourse=starter&q=hello&category=work-study&cefr=B1&status=in-progress&sort=progress",
    );

    expect(state).toEqual({
      view: "review",
      catalog: {
        selectedCourseId: null,
        resultLimit: 24,
        query: {
          text: "hello",
          categoryId: "work-study",
          cefr: "B1",
          status: "in-progress",
          sort: "progress",
        },
      },
      reviewCourseId: "starter",
      practiceScope: null,
      practiceScopeWasInvalid: false,
    });
    expect(buildAppUrlState(state)).toBe(
      "?view=review&reviewCourse=starter&q=hello&category=work-study&cefr=B1&status=in-progress&sort=progress",
    );
  });

  it("falls back safely for unknown views, enum values, and incomplete scopes", () => {
    expect(parseAppUrlState(
      "?view=unknown&scope=course&practiceCourse=hidden&cefr=Z9&status=paused&sort=random",
    )).toEqual(DEFAULT_APP_URL_STATE);

    const incompleteLesson = parseAppUrlState(
      "?view=practice&scope=lesson&practiceCourse=starter&practiceMode=learn",
    );
    expect(incompleteLesson.practiceScope).toBeNull();
    expect(incompleteLesson.practiceScopeWasInvalid).toBe(true);
    expect(parseAppUrlState(
      "?view=practice&scope=lesson&practiceCourse=starter&practiceLesson=l1&practiceMode=test",
    ).practiceScopeWasInvalid).toBe(true);
    expect(parseAppUrlState("?view=practice&scope=unknown").practiceScopeWasInvalid).toBe(true);
    expect(parseAppUrlState("?view=practice").practiceScopeWasInvalid).toBe(false);
  });

  it("serializes only canonical app-owned state and never draft or target data", () => {
    const parsed = parseAppUrlState(
      "?view=courses&course=starter&q=hello&draft=secret&answer=target&turnId=t1&supportLevel=4&junk=yes",
    );
    const serialized = buildAppUrlState(parsed);

    expect(serialized).toBe("?view=courses&course=starter&q=hello");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("target");
    expect(serialized).not.toContain("turnId");
    expect(serialized).not.toContain("supportLevel");
  });
});
