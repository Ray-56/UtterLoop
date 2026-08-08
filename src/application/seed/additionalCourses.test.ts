import { describe, expect, it } from "vitest";
import { validateCourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import {
  additionalCourseCards,
  additionalCourses,
} from "./additionalCourses";
import { defaultCourseCategories } from "./defaultCatalog";
import { CC0_CONTENT_LICENSE } from "./originalCourses";

describe("additional original course seed content", () => {
  it("exports three focused CC0 courses", () => {
    expect(additionalCourses.map((course) => course.title)).toEqual([
      "Travel & City Essentials",
      "Social Plans & Stories",
      "Meetings & Decisions",
    ]);
    expect(additionalCourses.every((course) => course.license === CC0_CONTENT_LICENSE)).toBe(true);
    expect(additionalCourses.every((course) => course.provider.kind === "original")).toBe(true);
  });

  it("provides 60 unique, keyboard-sized sentence cards", () => {
    expect(additionalCourseCards).toHaveLength(60);
    expect(new Set(additionalCourseCards.map((card) => card.id)).size).toBe(60);
    expect(new Set(additionalCourseCards.map((card) => card.english)).size).toBe(60);

    for (const card of additionalCourseCards) {
      const wordCount = card.english.trim().split(/\s+/).length;

      expect(wordCount).toBeGreaterThanOrEqual(4);
      expect(wordCount).toBeLessThanOrEqual(12);
      expect(card.prompt).toMatch(/[\u4e00-\u9fff]/);
      expect(card.source).toBe("UtterLoop Original");
      expect(card.tags.length).toBeGreaterThanOrEqual(2);
      expect(card.tags.length).toBeLessThanOrEqual(3);
    }
  });

  it("gives each course two units with two five-card lessons", () => {
    const referencedCardIds: string[] = [];

    for (const course of additionalCourses) {
      expect(course.units).toHaveLength(2);

      for (const unit of course.units) {
        expect(unit.lessons).toHaveLength(2);

        for (const lesson of unit.lessons) {
          expect(lesson.cardIds).toHaveLength(5);
          referencedCardIds.push(...lesson.cardIds);
        }
      }
    }

    expect(referencedCardIds).toHaveLength(60);
    expect(new Set(referencedCardIds).size).toBe(60);
    expect(new Set(referencedCardIds)).toEqual(
      new Set(additionalCourseCards.map((card) => card.id)),
    );
  });

  it("forms a valid course catalog", () => {
    expect(() =>
      validateCourseCatalog({
        categories: defaultCourseCategories,
        learningPaths: [],
        courses: additionalCourses,
        cards: additionalCourseCards,
      }),
    ).not.toThrow();
  });
});
