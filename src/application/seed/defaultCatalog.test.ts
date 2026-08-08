import { describe, expect, it } from "vitest";
import { validateCourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import { additionalCourses } from "./additionalCourses";
import { defaultCatalog } from "./defaultCatalog";
import { originalCourses } from "./originalCourses";
import { voaCourse } from "./voaCourse";

describe("default course catalog", () => {
  it("defines three stable categories and complete discovery metadata", () => {
    expect(defaultCatalog.categories).toEqual([
      {
        id: "everyday-communication",
        title: "Everyday Communication",
        description: "Introductions, routines, practical needs, and everyday conversation.",
        sortOrder: 0,
      },
      {
        id: "work-study",
        title: "Work & Study",
        description: "Updates, requests, planning, and feedback for shared work and study.",
        sortOrder: 1,
      },
      {
        id: "travel-and-services",
        title: "Travel & Services",
        description: "Directions, transport, accommodation, and practical help away from home.",
        sortOrder: 2,
      },
    ]);

    expect(
      defaultCatalog.courses.map(({ id, categoryId, level, provider, revision, tags }) => ({
        id,
        categoryId,
        level,
        provider,
        revision,
        tags,
      })),
    ).toEqual([
      {
        id: "starter-foundations",
        categoryId: "everyday-communication",
        level: { label: "Beginner · A1–A2", cefrFrom: "A1", cefrTo: "A2" },
        provider: { kind: "original", name: "UtterLoop" },
        revision: 4,
        tags: ["introductions", "daily routines", "requests", "conversation repair"],
      },
      {
        id: "voa-lle1-sentence-recall",
        categoryId: "everyday-communication",
        level: { label: "Beginner · A1", cefrFrom: "A1", cefrTo: "A1" },
        provider: {
          kind: "curated",
          name: "VOA Learning English",
          url: "https://learningenglish.voanews.com/p/5644.html",
        },
        revision: 2,
        tags: ["introductions", "telephone", "everyday objects", "rooms", "locations"],
      },
      {
        id: "work-study-essentials",
        categoryId: "work-study",
        level: {
          label: "Elementary to Intermediate · A2–B1",
          cefrFrom: "A2",
          cefrTo: "B1",
        },
        provider: { kind: "original", name: "UtterLoop" },
        revision: 2,
        tags: ["work", "study", "status updates", "requests", "planning", "feedback"],
      },
      {
        id: "travel-city-essentials",
        categoryId: "travel-and-services",
        level: {
          label: "Elementary to Intermediate · A2–B1",
          cefrFrom: "A2",
          cefrTo: "B1",
        },
        provider: { kind: "original", name: "UtterLoop" },
        revision: 1,
        tags: ["travel", "directions", "public transport", "accommodation", "problem solving"],
      },
      {
        id: "social-plans-stories",
        categoryId: "everyday-communication",
        level: {
          label: "Elementary to Intermediate · A2–B1",
          cefrFrom: "A2",
          cefrTo: "B1",
        },
        provider: { kind: "original", name: "UtterLoop" },
        revision: 1,
        tags: ["social plans", "invitations", "preferences", "storytelling", "conversation"],
      },
      {
        id: "meetings-decisions",
        categoryId: "work-study",
        level: {
          label: "Intermediate to Upper Intermediate · B1–B2",
          cefrFrom: "B1",
          cefrTo: "B2",
        },
        provider: { kind: "original", name: "UtterLoop" },
        revision: 1,
        tags: ["meetings", "discussion", "opinions", "trade-offs", "decisions", "follow-up"],
      },
    ]);
  });

  it("keeps the original three-course prefix and appends new courses to one learning path", () => {
    expect(defaultCatalog.learningPaths).toHaveLength(1);
    expect(defaultCatalog.learningPaths[0].title).toBe("Everyday Output Path");
    expect(defaultCatalog.courses.map((course) => course.id)).toEqual([
      originalCourses[0].id,
      voaCourse.id,
      originalCourses[1].id,
      ...additionalCourses.map((course) => course.id),
    ]);
    expect(defaultCatalog.learningPaths[0].courseIds).toEqual(
      defaultCatalog.courses.map((course) => course.id),
    );
  });

  it("contains exactly 120 unique cards referenced once by the course outlines", () => {
    const cardIds = defaultCatalog.cards.map((card) => card.id);
    const referencedCardIds = defaultCatalog.courses.flatMap((course) =>
      course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.cardIds)),
    );

    expect(cardIds).toHaveLength(120);
    expect(new Set(cardIds).size).toBe(120);
    expect(new Set(defaultCatalog.cards.map((card) => card.english)).size).toBe(120);
    expect(referencedCardIds).toHaveLength(120);
    expect(new Set(referencedCardIds)).toEqual(new Set(cardIds));
  });

  it("passes complete catalog validation", () => {
    expect(() => validateCourseCatalog(defaultCatalog)).not.toThrow();
  });
});
