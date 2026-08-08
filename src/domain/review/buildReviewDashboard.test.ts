import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import type { Course } from "../curriculum/Course";
import type { SentenceLearningState } from "../learning/SentenceLearningState";
import type { ReviewState } from "./ReviewState";
import { buildReviewDashboard, filterReviewDashboard } from "./buildReviewDashboard";

const now = new Date("2026-07-31T12:00:00.000Z");

describe("buildReviewDashboard", () => {
  it("returns a target-free projection and keeps due and upcoming distinct at now", () => {
    const dueCard = card("due", "Never serialize this due target", "到期提示");
    const upcomingCard = card("upcoming", "Never serialize this future target", "未来提示");
    const dashboard = buildReviewDashboard({
      cards: [dueCard, upcomingCard],
      courses: [course("course-a", "Course A", [dueCard.id, upcomingCard.id])],
      learningStates: [passed(dueCard.id), passed(upcomingCard.id)],
      reviewStates: [
        review(dueCard.id, now.toISOString(), 2),
        review(upcomingCard.id, "2026-08-01T12:00:00.000Z", 1),
      ],
      vocabularyEntries: [],
      selectedCourseId: null,
    }, now);

    expect(dashboard.due.map((item) => item.cardId)).toEqual([dueCard.id]);
    expect(dashboard.upcoming.map((item) => item.cardId)).toEqual([upcomingCard.id]);
    const serialized = JSON.stringify(dashboard);
    expect(serialized).not.toContain(dueCard.english);
    expect(serialized).not.toContain(upcomingCard.english);
    expect(serialized).not.toContain("acceptable secret");
    expect(serialized).not.toContain('"english"');
    expect(serialized).not.toContain('"acceptableAnswers"');
    expect(serialized).not.toContain('"learningSupport"');
  });

  it("quarantines target-bearing stored Prompts in every Review projection", () => {
    const due = card("unsafe-due", "Never expose this due target", "旧提示：Never expose this due target");
    const mastered = card("unsafe-mastered", "Never expose this mastered target", "Never expose this mastered target");
    const saved = card("unsafe-saved", "Never expose this saved target", "请输入 Never expose this saved target");
    const dashboard = buildReviewDashboard({
      cards: [due, mastered, saved],
      courses: [],
      learningStates: [passed(due.id), passed(mastered.id), passed(saved.id)],
      reviewStates: [
        review(due.id, "2026-07-30T00:00:00.000Z"),
        { ...review(mastered.id, "2026-07-30T00:00:00.000Z"), learningStatus: "mastered" },
        review(saved.id, "2026-08-02T00:00:00.000Z"),
      ],
      vocabularyEntries: [
        { cardId: mastered.id, savedAt: "2026-07-31T00:00:00.000Z" },
        { cardId: saved.id, savedAt: "2026-07-31T01:00:00.000Z" },
      ],
      selectedCourseId: null,
    }, now);

    const projected = [
      ...dashboard.due,
      ...dashboard.mastered,
      ...dashboard.vocabulary,
    ].filter((item) => item.cardId.startsWith("unsafe-"));
    expect(projected).not.toHaveLength(0);
    expect(projected.every((item) => item.contentSafety === "blocked-content")).toBe(true);
    expect(new Set(projected.map((item) => item.prompt))).toEqual(new Set([
      "Prompt unavailable — replace or re-import this content.",
    ]));
    const serialized = JSON.stringify(dashboard);
    expect(serialized).not.toContain("Never expose this due target");
    expect(serialized).not.toContain("Never expose this mastered target");
    expect(serialized).not.toContain("Never expose this saved target");
  });

  it("derives deterministic multi-course membership and labels standalone cards", () => {
    const shared = card("shared", "Shared target", "共享提示");
    const standalone = card("standalone", "Standalone target", "独立提示");
    const dashboard = buildReviewDashboard({
      cards: [standalone, shared],
      courses: [
        course("course-b", "Course B", [shared.id]),
        course("course-a", "Course A", [shared.id]),
      ],
      learningStates: [passed(shared.id), passed(standalone.id)],
      reviewStates: [review(shared.id, "2026-07-30T10:00:00.000Z"), review(standalone.id, "2026-07-30T10:00:00.000Z")],
      vocabularyEntries: [],
      selectedCourseId: null,
    }, now);

    expect(dashboard.due).toHaveLength(2);
    expect(dashboard.due.find((item) => item.cardId === shared.id)).toMatchObject({
      courseIds: ["course-b", "course-a"],
      courseTitles: ["Course B", "Course A"],
    });
    expect(dashboard.due.find((item) => item.cardId === standalone.id)).toMatchObject({
      courseIds: [],
      courseTitles: ["Imported / uncategorized"],
    });
  });

  it("applies one course filter to due, upcoming, mastered, vocabulary, and options", () => {
    const due = card("a-due", "A due target", "A 到期");
    const upcoming = card("a-upcoming", "A upcoming target", "A 未来");
    const mastered = card("a-mastered", "A mastered target", "A 已掌握");
    const saved = card("a-saved", "A saved target", "A 生词");
    const other = card("b-due", "B target", "B 到期");
    const dashboard = buildReviewDashboard({
      cards: [due, upcoming, mastered, saved, other],
      courses: [
        course("course-a", "Course A", [due.id, upcoming.id, mastered.id, saved.id]),
        course("course-b", "Course B", [other.id]),
        course("course-empty", "Empty", []),
      ],
      learningStates: [due, upcoming, mastered, saved, other].map((item) => passed(item.id)),
      reviewStates: [
        review(due.id, "2026-07-30T10:00:00.000Z"),
        review(upcoming.id, "2026-08-01T10:00:00.000Z"),
        { ...review(mastered.id, "2026-07-30T10:00:00.000Z"), learningStatus: "mastered" },
        review(saved.id, "2026-08-02T10:00:00.000Z"),
        review(other.id, "2026-07-29T10:00:00.000Z"),
      ],
      vocabularyEntries: [
        { cardId: saved.id, savedAt: "2026-07-31T09:00:00.000Z" },
        { cardId: mastered.id, savedAt: "2026-07-30T09:00:00.000Z" },
      ],
      selectedCourseId: "course-a",
    }, now);

    expect(dashboard.selectedCourseId).toBe("course-a");
    expect(dashboard.due.map((item) => item.cardId)).toEqual([due.id]);
    expect(dashboard.upcoming.map((item) => item.cardId)).toEqual([upcoming.id, saved.id]);
    expect(dashboard.mastered.map((item) => item.cardId)).toEqual([mastered.id]);
    expect(dashboard.vocabulary.map((item) => item.cardId)).toEqual([saved.id, mastered.id]);
    expect(dashboard.courseOptions).toEqual([
      { courseId: "course-a", title: "Course A", dueCount: 1, upcomingCount: 2 },
      { courseId: "course-b", title: "Course B", dueCount: 1, upcomingCount: 0 },
    ]);
  });

  it("keeps mastery and vocabulary independent and reports acquisition readiness", () => {
    const acquiring = card("acquiring", "Acquiring target", "学习中");
    const masteredSaved = card("mastered-saved", "Mastered target", "已掌握并收藏");
    const dashboard = buildReviewDashboard({
      cards: [acquiring, masteredSaved],
      courses: [],
      learningStates: [
        { cardId: acquiring.id, introducedAt: "2026-07-30T00:00:00.000Z", acquisitionStatus: "needs-guided" },
        passed(masteredSaved.id),
      ],
      reviewStates: [
        review(acquiring.id, "2026-07-30T00:00:00.000Z", 0),
        { ...review(masteredSaved.id, "2026-07-30T00:00:00.000Z"), learningStatus: "mastered" },
      ],
      vocabularyEntries: [{ cardId: masteredSaved.id, savedAt: "2026-07-30T03:00:00.000Z" }],
      selectedCourseId: null,
    }, now);

    expect(dashboard.due[0]).toMatchObject({ cardId: acquiring.id, readiness: "acquisition" });
    expect(dashboard.mastered[0]).toMatchObject({ cardId: masteredSaved.id, isInVocabulary: true });
    expect(dashboard.vocabulary[0]).toMatchObject({ cardId: masteredSaved.id, isMastered: true });
  });

  it("orders queue rows by due time, stage, course order, then card ID", () => {
    const cards = [card("z", "Z", "Z"), card("a", "A", "A"), card("m", "M", "M")];
    const dashboard = buildReviewDashboard({
      cards,
      courses: [course("first", "First", ["m"]), course("second", "Second", ["a", "z"])],
      learningStates: cards.map((item) => passed(item.id)),
      reviewStates: [review("z", "2026-07-30T00:00:00.000Z", 2), review("a", "2026-07-30T00:00:00.000Z", 2), review("m", "2026-07-30T00:00:00.000Z", 2)],
      vocabularyEntries: [],
      selectedCourseId: null,
    }, now);

    expect(dashboard.due.map((item) => item.cardId)).toEqual(["m", "a", "z"]);
  });

  it("filters an already-safe dashboard and falls back when the course is unavailable", () => {
    const one = card("one", "Target one", "提示一");
    const two = card("two", "Target two", "提示二");
    const dashboard = buildReviewDashboard({
      cards: [one, two],
      courses: [course("course-one", "One", [one.id]), course("course-two", "Two", [two.id])],
      learningStates: [passed(one.id), passed(two.id)],
      reviewStates: [review(one.id, "2026-07-30T00:00:00.000Z"), review(two.id, "2026-07-30T00:00:00.000Z")],
      vocabularyEntries: [{ cardId: two.id, savedAt: "2026-07-30T00:00:00.000Z" }],
      selectedCourseId: null,
    }, now);

    expect(filterReviewDashboard(dashboard, "course-two")).toMatchObject({
      selectedCourseId: "course-two",
      due: [{ cardId: two.id }],
      vocabulary: [{ cardId: two.id }],
    });
    expect(filterReviewDashboard(dashboard, "missing")).toEqual(dashboard);
  });
});

function card(id: string, english: string, prompt: string): SentenceCard {
  return {
    id,
    english,
    prompt,
    source: "Test source",
    tags: [],
    acceptableAnswers: ["acceptable secret"],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function course(id: string, title: string, cardIds: string[]): Course {
  return {
    id,
    title,
    description: "Test course",
    categoryId: "test",
    tags: [],
    level: { label: "A1", cefrFrom: "A1", cefrTo: "A1" },
    provider: { kind: "original", name: "Test" },
    revision: 1,
    license: { name: "CC0", url: "https://example.com", attribution: "None" },
    units: [{
      id: `${id}-unit`,
      title: "Unit",
      description: "Unit",
      lessons: [{ id: `${id}-lesson`, title: "Lesson", objective: "Learn", cardIds }],
    }],
  };
}

function review(cardId: string, dueAt: string, stage: ReviewState["stage"] = 1): ReviewState {
  return { cardId, dueAt, stage, lastReviewedAt: "2026-07-01T00:00:00.000Z", streak: 1, lapseCount: 0 };
}

function passed(cardId: string): SentenceLearningState {
  return {
    cardId,
    introducedAt: "2026-07-01T00:00:00.000Z",
    firstPassedAt: "2026-07-02T00:00:00.000Z",
    firstPassSource: "independent-recall",
  };
}
