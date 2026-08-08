import { describe, expect, it } from "vitest";
import {
  buildPracticeScopeUrl,
  parsePracticeScopeUrl,
  removePracticeScopeFromUrl,
} from "./practiceScopeUrlState";

describe("practice scope URL state", () => {
  it("round-trips every durable practice scope", () => {
    const scopes = [
      { kind: "lesson", courseId: "starter foundations", lessonId: "lesson/1", mode: "learn" },
      { kind: "review", courseId: "course-1" },
      { kind: "review" },
      { kind: "vocabulary" },
      { kind: "course", courseId: "course-2" },
      { kind: "focused", cardId: "card-1" },
    ] as const;

    for (const scope of scopes) {
      expect(parsePracticeScopeUrl(buildPracticeScopeUrl(scope))).toEqual(scope);
    }
  });

  it("rejects incomplete or unknown scope parameters", () => {
    expect(parsePracticeScopeUrl("?view=practice&practice=lesson&practiceCourse=course-1")).toBeNull();
    expect(parsePracticeScopeUrl("?view=practice&practice=lesson&practiceCourse=c&practiceLesson=l&practiceMode=test"))
      .toBeNull();
    expect(parsePracticeScopeUrl("?view=practice&practice=unknown")).toBeNull();
  });

  it("removes practice-only parameters when navigating elsewhere", () => {
    expect(
      removePracticeScopeFromUrl(
        "?view=practice&practice=lesson&practiceCourse=course-1&practiceLesson=lesson-1&practiceMode=learn&q=work",
      ),
    ).toBe("?view=practice&q=work");
  });
});
