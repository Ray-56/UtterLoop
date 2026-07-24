import { describe, expect, it } from "vitest";
import { validateCourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import { defaultCourseCategories } from "./defaultCatalog";
import {
  CC0_CONTENT_LICENSE,
  originalCourseCards,
  originalCourses,
} from "./originalCourses";

describe("original course seed content", () => {
  it("exports the two original CC0 courses", () => {
    expect(originalCourses.map((course) => course.title)).toEqual([
      "Starter Foundations",
      "Work & Study Essentials",
    ]);

    expect(originalCourses).toHaveLength(2);
    expect(originalCourses.every((course) => course.license === CC0_CONTENT_LICENSE)).toBe(true);
    expect(CC0_CONTENT_LICENSE).toEqual({
      name: "CC0 1.0 Universal",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      attribution:
        "No attribution required. Original UtterLoop course content dedicated under CC0 1.0 Universal.",
    });
  });

  it("provides 40 unique, keyboard-sized sentence cards", () => {
    expect(originalCourseCards).toHaveLength(40);
    expect(new Set(originalCourseCards.map((card) => card.id)).size).toBe(40);
    expect(new Set(originalCourseCards.map((card) => card.english)).size).toBe(40);

    for (const card of originalCourseCards) {
      const wordCount = card.english.trim().split(/\s+/).length;

      expect(wordCount).toBeGreaterThanOrEqual(4);
      expect(wordCount).toBeLessThanOrEqual(12);
      expect(card.prompt).toMatch(/[\u4e00-\u9fff]/);
      expect(card.tags.length).toBeGreaterThanOrEqual(2);
      expect(card.tags.length).toBeLessThanOrEqual(3);
    }
  });

  it("gives each course two units with two five-card lessons", () => {
    const referencedCardIds: string[] = [];

    for (const course of originalCourses) {
      expect(course.units).toHaveLength(2);

      for (const unit of course.units) {
        expect(unit.lessons).toHaveLength(2);

        for (const lesson of unit.lessons) {
          expect(lesson.cardIds).toHaveLength(5);
          referencedCardIds.push(...lesson.cardIds);
        }
      }
    }

    expect(referencedCardIds).toHaveLength(40);
    expect(new Set(referencedCardIds).size).toBe(40);
    expect(new Set(referencedCardIds)).toEqual(
      new Set(originalCourseCards.map((card) => card.id)),
    );
  });

  it("forms a valid course catalog", () => {
    expect(() =>
      validateCourseCatalog({
        categories: defaultCourseCategories,
        learningPaths: [],
        courses: originalCourses,
        cards: originalCourseCards,
      }),
    ).not.toThrow();
  });
});
