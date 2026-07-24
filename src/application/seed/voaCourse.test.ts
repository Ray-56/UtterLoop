import { describe, expect, it } from "vitest";
import { validateCourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import { defaultCourseCategories } from "./defaultCatalog";
import { VOA_PUBLIC_DOMAIN_LICENSE, voaCourse, voaCourseCards } from "./voaCourse";

const VERIFIED_SENTENCES = [
  "Who’s your friend?",
  "She is new to D.C.",
  "Where are you from?",
  "I am from a small town.",
  "Nice to meet you!",
  "Is this Marsha?",
  "You have the wrong number.",
  "I am here!",
  "You are there.",
  "I want to find a supermarket.",
  "The new apartment is great!",
  "Anna, do you have a pen?",
  "I have a pen in my bag.",
  "It is not a pen.",
  "It is a big book.",
  "It is a beautiful kitchen!",
  "We cook in the kitchen.",
  "Where are you?",
  "I wash in the bathroom.",
  "We sleep in the bedroom.",
] as const;

describe("VOA course seed", () => {
  it("preserves the 20 verified VOA transcript sentences verbatim", () => {
    expect(voaCourseCards.map((card) => card.english)).toEqual(VERIFIED_SENTENCES);
  });

  it("organizes 20 cards into two units and four five-card lessons", () => {
    const lessons = voaCourse.units.flatMap((unit) => unit.lessons);

    expect(voaCourse.units).toHaveLength(2);
    expect(lessons).toHaveLength(4);
    expect(lessons.every((lesson) => lesson.cardIds.length === 5)).toBe(true);
    expect(voaCourseCards).toHaveLength(20);
    expect(lessons.flatMap((lesson) => lesson.cardIds).sort()).toEqual(
      voaCourseCards.map((card) => card.id).sort(),
    );
  });

  it("uses unique identifiers and passes course catalog validation", () => {
    const units = voaCourse.units;
    const lessons = units.flatMap((unit) => unit.lessons);
    const identifiers = [
      voaCourse.id,
      ...units.map((unit) => unit.id),
      ...lessons.map((lesson) => lesson.id),
      ...voaCourseCards.map((card) => card.id),
    ];

    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(() =>
      validateCourseCatalog({
        categories: defaultCourseCategories,
        learningPaths: [
          {
            id: "voa-beginner-path",
            title: "VOA Beginner Path",
            description: "Practice beginner conversation from VOA Learning English.",
            courseIds: [voaCourse.id],
          },
        ],
        courses: [voaCourse],
        cards: voaCourseCards,
      }),
    ).not.toThrow();
  });

  it("attaches official VOA provenance to every lesson and card", () => {
    const lessons = voaCourse.units.flatMap((unit) => unit.lessons);

    expect(voaCourse.license).toEqual(VOA_PUBLIC_DOMAIN_LICENSE);
    expect(VOA_PUBLIC_DOMAIN_LICENSE.attribution).toContain("VOA Learning English");

    for (const lesson of lessons) {
      expect(officialVoaUrl(lesson.sourceUrl)).toBe(true);

      for (const cardId of lesson.cardIds) {
        const card = voaCourseCards.find((candidate) => candidate.id === cardId);
        expect(card).toBeDefined();
        expect(card?.source).toContain("VOA Learning English");
        expect(card?.sourceUrl).toBe(lesson.sourceUrl);
        expect(card?.license).toEqual(VOA_PUBLIC_DOMAIN_LICENSE);
      }
    }

    expect(voaCourseCards.every((card) => officialVoaUrl(card.sourceUrl))).toBe(true);
  });
});

function officialVoaUrl(value: string | undefined): boolean {
  return value !== undefined && new URL(value).hostname === "learningenglish.voanews.com";
}
