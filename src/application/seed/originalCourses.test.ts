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

  it("ships the approved Starter Foundations order and complete learning support", () => {
    const starter = originalCourses.find((course) => course.id === "starter-foundations");
    const starterCards = originalCourseCards.filter((card) => card.id.startsWith("sf-"));

    expect(starter?.revision).toBe(4);
    expect(starter?.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.cardIds))).toEqual([
      ["sf-001", "sf-002", "sf-003", "sf-005", "sf-004"],
      ["sf-006", "sf-007", "sf-010", "sf-008", "sf-009"],
      ["sf-011", "sf-012", "sf-013", "sf-014", "sf-015"],
      ["sf-017", "sf-016", "sf-018", "sf-019", "sf-020"],
    ]);
    expect(starterCards).toHaveLength(20);

    for (const card of starterCards) {
      const support = card.learningSupport;

      expect(card.updatedAt).toBe("2026-08-02T00:00:00.000Z");
      expect(support, `${card.id} learning support`).toBeDefined();
      expect(support?.context.trim()).toBeTruthy();
      expect(support?.communicativeFunction.trim()).toBeTruthy();
      expect(support?.pattern.trim()).toBeTruthy();
      expect(support?.keywords.length).toBeGreaterThanOrEqual(1);
      expect(support?.keywords.length).toBeLessThanOrEqual(2);
      expect(support?.frame).toContain("___");
      expect(support?.pronunciation.dialect).toBe("en-US");
      expect(support?.pronunciation.sentenceIpa).toMatch(/^\/.+\/$/);
      expect(support?.pronunciation.chunks.length).toBeGreaterThan(0);
      expect(support?.grammar.structure.trim()).toBeTruthy();
      expect(support?.grammar.explanation.trim()).toBeTruthy();
      expect(support?.grammar.points.length).toBeGreaterThan(0);
      expect(support?.grammar.points.length).toBeLessThanOrEqual(2);
      expect(support?.grammar.chunks.length).toBeGreaterThan(0);
      expect(normalizeWritten(support?.pronunciation.chunks.map((chunk) => chunk.text).join(" ") ?? ""))
        .toBe(normalizeWritten(card.english));
      expect(normalizeWritten(support?.grammar.chunks.map((chunk) => chunk.text).join(" ") ?? ""))
        .toBe(normalizeWritten(card.english));
    }
  });

  it("ships complete word annotations for every Starter grammar chunk", () => {
    const starterCards = originalCourseCards.filter((card) => card.id.startsWith("sf-"));
    let tokenCount = 0;

    expect(starterCards).toHaveLength(20);
    for (const card of starterCards) {
      const grammarChunks = card.learningSupport?.grammar.chunks ?? [];

      expect(grammarChunks.length, `${card.id} grammar chunks`).toBeGreaterThan(0);
      for (const chunk of grammarChunks) {
        const tokens = chunk.tokens ?? [];

        expect(tokens.length, `${card.id} ${chunk.text} tokens`).toBeGreaterThan(0);
        expect(normalizeWritten(tokens.map((token) => token.text).join(" ")))
          .toBe(normalizeWritten(chunk.text));

        for (const token of tokens) {
          expect(token.text).toBe(token.text.trim());
          expect(token.gloss).toBe(token.gloss.trim());
          expect(token.partOfSpeech).toBe(token.partOfSpeech.trim());
          expect(token.text.length).toBeGreaterThan(0);
          expect(token.gloss).toMatch(/[\u4e00-\u9fff]/);
          expect(token.partOfSpeech).toMatch(/[\u4e00-\u9fff]/);
          expect(token.ipa).toMatch(/^\/\S+\/$/);
          tokenCount += 1;
        }
      }
    }

    expect(tokenCount).toBe(122);
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

function normalizeWritten(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
