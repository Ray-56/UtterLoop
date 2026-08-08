import { describe, expect, it } from "vitest";
import type { Course } from "../../domain/curriculum/Course";
import { buildPracticeSession } from "./buildPracticeSession";

const now = new Date("2026-07-19T00:00:00.000Z");
const course: Course = {
  id: "course-1",
  title: "Course One",
  description: "A test course.",
  categoryId: "category-1",
  tags: ["test"],
  level: {
    label: "Starter · A1",
    cefrFrom: "A1",
    cefrTo: "A1",
  },
  provider: {
    kind: "original",
    name: "Test",
  },
  revision: 1,
  license: {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "No attribution required.",
  },
  units: [
    {
      id: "unit-1",
      title: "Unit One",
      description: "A test unit.",
      lessons: [
        {
          id: "lesson-1",
          title: "Lesson One",
          objective: "Pass both cards.",
          cardIds: ["card-1", "card-2"],
        },
      ],
    },
  ],
};
const cards = [card("card-1"), card("card-2")];

describe("buildPracticeSession", () => {
  it.each([
    { label: "Lesson", scope: { kind: "lesson", courseId: course.id, lessonId: "lesson-1", mode: "learn" } as const },
    { label: "Review", scope: { kind: "review" } as const },
    { label: "Vocabulary", scope: { kind: "vocabulary" } as const },
    { label: "Course replay", scope: { kind: "course", courseId: course.id } as const },
  ])("quarantines unsafe cards from a $label scope without returning target content", ({ scope }) => {
    const unsafe = unsafeCard("card-2");
    const session = buildPracticeSession({
      scope,
      courses: [course],
      cards: [cards[0], unsafe],
      reviewStates: [
        reviewState("card-1", 1, now.toISOString()),
        reviewState("card-2", 1, now.toISOString()),
      ],
      learningStates: [],
      vocabularyEntries: [
        { cardId: "card-1", savedAt: now.toISOString() },
        { cardId: "card-2", savedAt: now.toISOString() },
      ],
      now,
    });

    expect(session.items.map((item) => item.card.id)).toEqual(["card-1"]);
    expect(session.blockedCardIds).toEqual(["card-2"]);
    expect(JSON.stringify(session)).not.toContain(unsafe.prompt);
    expect(JSON.stringify(session)).not.toContain(unsafe.english);
  });

  it.each([
    { label: "Lesson", scope: { kind: "lesson", courseId: "single-course", lessonId: "single-lesson", mode: "learn" } as const },
    { label: "Review", scope: { kind: "review" } as const },
    { label: "Vocabulary", scope: { kind: "vocabulary" } as const },
    { label: "Course replay", scope: { kind: "course", courseId: "single-course" } as const },
  ])("returns blocked-content when every queued $label card is quarantined", ({ scope }) => {
    const unsafe = unsafeCard("unsafe-card");
    const session = buildPracticeSession({
      scope,
      courses: [singleCardCourse],
      cards: [unsafe],
      reviewStates: [reviewState(unsafe.id, 1, now.toISOString())],
      learningStates: [],
      vocabularyEntries: [{ cardId: unsafe.id, savedAt: now.toISOString() }],
      now,
    });

    expect(session.items).toEqual([]);
    expect(session.blockedCardIds).toEqual([unsafe.id]);
    expect(session.completed).toBe(true);
    expect(session.emptyReason).toBe("blocked-content");
  });

  it("quarantines an otherwise eligible unsafe Focused Practice card", () => {
    const unsafe = unsafeCard("card-1");
    const session = buildPracticeSession({
      scope: { kind: "focused", cardId: unsafe.id },
      courses: [course],
      cards: [unsafe],
      reviewStates: [reviewState(unsafe.id, 1, now.toISOString())],
      learningStates: [learningState(unsafe.id, true)],
      vocabularyEntries: [],
      weakCardIds: new Set([unsafe.id]),
      now,
    });

    expect(session).toMatchObject({
      items: [],
      blockedCardIds: [unsafe.id],
      completed: true,
      emptyReason: "blocked-content",
    });
    expect(JSON.stringify(session)).not.toContain(unsafe.prompt);
    expect(JSON.stringify(session)).not.toContain(unsafe.english);
  });

  it("builds one voluntary Focused Practice item for an eligible weak card", () => {
    const session = buildPracticeSession({
      scope: { kind: "focused", cardId: "card-1" },
      courses: [course],
      cards,
      reviewStates: [reviewState("card-1", 1, now.toISOString())],
      learningStates: [learningState("card-1", true)],
      vocabularyEntries: [],
      weakCardIds: new Set(["card-1"]),
      now,
    });

    expect(session).toMatchObject({
      scope: { kind: "focused", cardId: "card-1" },
      context: null,
      completed: false,
      emptyReason: null,
    });
    expect(session.items).toHaveLength(1);
    expect(session.items[0]).toMatchObject({
      card: { id: "card-1" },
      initialPhase: "voluntary-practice",
      queueReason: "focused-practice",
    });
  });

  it("captures queue reason and scheduled due time when each occurrence opens", () => {
    const dueAt = "2026-07-18T23:00:00.000Z";
    const review = buildPracticeSession({
      scope: { kind: "review" },
      courses: [course],
      cards,
      reviewStates: [reviewState("card-1", 1, dueAt)],
      learningStates: [],
      vocabularyEntries: [],
      now,
    });
    const lesson = buildPracticeSession({
      scope: { kind: "lesson", courseId: course.id, lessonId: "lesson-1", mode: "learn" },
      courses: [course],
      cards,
      reviewStates: [],
      learningStates: [],
      vocabularyEntries: [],
      now,
    });

    expect(review.items[0]).toMatchObject({
      queueReason: "due-review",
      scheduledReviewDueAt: dueAt,
    });
    expect(lesson.items[0]).toMatchObject({
      queueReason: "new-learning",
    });
  });

  it.each([
    {
      label: "missing",
      cardId: "missing",
      reviewStates: [],
      learningStates: [],
      weakCardIds: new Set(["missing"]),
      reason: "focused-card-missing",
    },
    {
      label: "mastered",
      cardId: "card-1",
      reviewStates: [{ ...reviewState("card-1", 1, now.toISOString()), learningStatus: "mastered" as const }],
      learningStates: [learningState("card-1", true)],
      weakCardIds: new Set(["card-1"]),
      reason: "focused-card-mastered",
    },
    {
      label: "not first-passed",
      cardId: "card-1",
      reviewStates: [reviewState("card-1", 1, now.toISOString())],
      learningStates: [learningState("card-1", false)],
      weakCardIds: new Set(["card-1"]),
      reason: "focused-card-ineligible",
    },
    {
      label: "no longer weak",
      cardId: "card-1",
      reviewStates: [reviewState("card-1", 1, now.toISOString())],
      learningStates: [learningState("card-1", true)],
      weakCardIds: new Set<string>(),
      reason: "focused-card-not-weak",
    },
  ])("returns a typed empty result when the Focused Practice card is $label", (fixture) => {
    const session = buildPracticeSession({
      scope: { kind: "focused", cardId: fixture.cardId },
      courses: [course],
      cards,
      reviewStates: fixture.reviewStates,
      learningStates: fixture.learningStates,
      vocabularyEntries: [],
      weakCardIds: fixture.weakCardIds,
      now,
    });

    expect(session.items).toEqual([]);
    expect(session.completed).toBe(true);
    expect(session.emptyReason).toBe(fixture.reason);
  });

  it("resolves lesson context and keeps a failed future-due card active", () => {
    const session = buildPracticeSession({
      scope: { kind: "lesson", courseId: "course-1", lessonId: "lesson-1", mode: "learn" },
      courses: [course],
      cards,
      reviewStates: [reviewState("card-1", 0, "2026-07-20T00:00:00.000Z"), reviewState("card-2", 1, now.toISOString())],
      learningStates: [learningState("card-1", false), learningState("card-2", true)],
      vocabularyEntries: [],
      now,
    });

    expect(session.items.map((item) => item.card.id)).toEqual(["card-1"]);
    expect(session.context).toMatchObject({
      courseId: "course-1",
      courseTitle: "Course One",
      unitTitle: "Unit One",
      lessonId: "lesson-1",
      lessonTitle: "Lesson One",
      totalCards: 2,
      passedCards: 1,
    });
    expect(session.completed).toBe(false);
  });

  it("returns an explicit pending Lesson when its only unpassed card is not due yet", () => {
    const session = buildPracticeSession({
      scope: { kind: "lesson", courseId: "course-1", lessonId: "lesson-1", mode: "learn" },
      courses: [course],
      cards,
      reviewStates: [
        reviewState("card-1", 0, "2026-07-19T00:10:00.000Z"),
        reviewState("card-2", 1, now.toISOString()),
      ],
      learningStates: [readyIndependentState("card-1"), learningState("card-2", true)],
      vocabularyEntries: [],
      now,
    });

    expect(session.items).toEqual([]);
    expect(session.completed).toBe(false);
    expect(session.emptyReason).toBe("lesson-pending");
    expect(session.context).toMatchObject({ passedCards: 1, totalCards: 2 });
  });

  it("builds review only from attempted due cards", () => {
    const session = buildPracticeSession({
      scope: { kind: "review" },
      courses: [course],
      cards,
      reviewStates: [reviewState("card-2", 0, "2026-07-18T00:00:00.000Z")],
      learningStates: [],
      vocabularyEntries: [],
      now,
    });

    expect(session.items.map((item) => item.card.id)).toEqual(["card-2"]);
    expect(session.context).toBeNull();
  });

  it("builds a vocabulary round from saved cards and excludes mastered cards", () => {
    const session = buildPracticeSession({
      scope: { kind: "vocabulary" },
      courses: [course],
      cards,
      reviewStates: [
        reviewState("card-1", 0, now.toISOString()),
        { ...reviewState("card-2", 1, now.toISOString()), learningStatus: "mastered" },
      ],
      learningStates: [],
      vocabularyEntries: [
        { cardId: "card-1", savedAt: now.toISOString() },
        { cardId: "card-2", savedAt: now.toISOString() },
      ],
      now,
    });

    expect(session.items.map((item) => item.card.id)).toEqual(["card-1"]);
  });

  it("excludes mastered cards from replay and course rounds", () => {
    const reviewStates = [
      reviewState("card-1", 1, now.toISOString()),
      { ...reviewState("card-2", 1, now.toISOString()), learningStatus: "mastered" as const },
    ];
    const replay = buildPracticeSession({
      scope: { kind: "lesson", courseId: "course-1", lessonId: "lesson-1", mode: "replay" },
      courses: [course],
      cards,
      reviewStates,
      learningStates: [learningState("card-1", true), learningState("card-2", true)],
      vocabularyEntries: [],
      now,
    });
    const courseRound = buildPracticeSession({
      scope: { kind: "course", courseId: "course-1" },
      courses: [course],
      cards,
      reviewStates,
      learningStates: [learningState("card-1", true), learningState("card-2", true)],
      vocabularyEntries: [],
      now,
    });

    expect(replay.items.map((item) => item.card.id)).toEqual(["card-1"]);
    expect(courseRound.items.map((item) => item.card.id)).toEqual(["card-1"]);
  });

  it("keeps item-level lesson context while a Course replay crosses lessons", () => {
    const twoLessonCourse: Course = {
      ...course,
      units: [{
        ...course.units[0],
        lessons: [
          { ...course.units[0].lessons[0], cardIds: ["card-1"] },
          { id: "lesson-2", title: "Lesson Two", objective: "Recall card two.", cardIds: ["card-2"] },
        ],
      }],
    };
    const session = buildPracticeSession({
      scope: { kind: "course", courseId: course.id },
      courses: [twoLessonCourse],
      cards,
      reviewStates: [],
      learningStates: [],
      vocabularyEntries: [],
      now,
    });

    expect(session.items.map((item) => ({
      cardId: item.card.id,
      lessonId: item.occurrenceContext?.lessonId,
      lessonTitle: item.occurrenceContext?.lessonTitle,
    }))).toEqual([
      { cardId: "card-1", lessonId: "lesson-1", lessonTitle: "Lesson One" },
      { cardId: "card-2", lessonId: "lesson-2", lessonTitle: "Lesson Two" },
    ]);
    expect(session.emptyReason).toBeNull();
  });

  it("narrows Vocabulary to one card or one Course", () => {
    const entries = [
      { cardId: "card-2", savedAt: "2026-07-18T00:00:00.000Z" },
      { cardId: "card-1", savedAt: "2026-07-19T00:00:00.000Z" },
    ];
    const one = buildPracticeSession({
      scope: { kind: "vocabulary", cardId: "card-2" },
      courses: [course],
      cards,
      reviewStates: [],
      learningStates: [],
      vocabularyEntries: entries,
      now,
    });
    const scoped = buildPracticeSession({
      scope: { kind: "vocabulary", courseId: course.id },
      courses: [course],
      cards,
      reviewStates: [],
      learningStates: [],
      vocabularyEntries: entries,
      now,
    });

    expect(one.items.map((item) => item.card.id)).toEqual(["card-2"]);
    expect(scoped.items.map((item) => item.card.id)).toEqual(["card-2", "card-1"]);
  });
});

function card(id: string) {
  return {
    id,
    english: `This is ${id}.`,
    prompt: `这是 ${id}。`,
    source: "Test",
    tags: ["test"],
    acceptableAnswers: [],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function unsafeCard(id: string) {
  const value = card(id);
  return { ...value, prompt: `请输入：${value.english}` };
}

const singleCardCourse: Course = {
  ...course,
  id: "single-course",
  units: [{
    ...course.units[0],
    lessons: [{
      ...course.units[0].lessons[0],
      id: "single-lesson",
      cardIds: ["unsafe-card"],
    }],
  }],
};

function reviewState(cardId: string, stage: 0 | 1, dueAt: string) {
  return {
    cardId,
    stage,
    dueAt,
    lastReviewedAt: "2026-07-18T00:00:00.000Z",
    streak: stage,
    lapseCount: 0,
  };
}

function learningState(cardId: string, passed: boolean) {
  return passed ? {
    cardId,
    introducedAt: "2026-07-18T00:00:00.000Z",
    firstPassedAt: "2026-07-19T00:00:00.000Z",
    firstPassSource: "independent-recall" as const,
  } : {
    cardId,
    introducedAt: "2026-07-18T00:00:00.000Z",
    acquisitionStatus: "needs-guided" as const,
  };
}

function readyIndependentState(cardId: string) {
  return {
    cardId,
    introducedAt: "2026-07-18T00:00:00.000Z",
    acquisitionStatus: "ready-independent" as const,
  };
}
