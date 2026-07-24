import { describe, expect, it } from "vitest";
import type { CourseCatalog } from "./validateCourseCatalog";
import { validateCourseCatalog } from "./validateCourseCatalog";

describe("validateCourseCatalog", () => {
  it("accepts a complete catalog", () => {
    expect(() => validateCourseCatalog(catalog())).not.toThrow();
  });

  it("rejects duplicate category identifiers", () => {
    const value = catalog();
    value.categories.push({ ...value.categories[0] });

    expect(() => validateCourseCatalog(value)).toThrow("category-1");
  });

  it.each([
    ["title", " "],
    ["description", " "],
  ] as const)("rejects an empty category %s", (field, invalidValue) => {
    const value = catalog();
    value.categories[0][field] = invalidValue;

    expect(() => validateCourseCatalog(value)).toThrow(field);
  });

  it.each([-1, 1.5])("rejects invalid category sort order %s", (sortOrder) => {
    const value = catalog();
    value.categories[0].sortOrder = sortOrder;

    expect(() => validateCourseCatalog(value)).toThrow("sort order");
  });

  it("rejects a course that references an unknown category", () => {
    const value = catalog();
    value.courses[0].categoryId = "missing-category";

    expect(() => validateCourseCatalog(value)).toThrow("missing-category");
  });

  it.each([
    [["conversation", ""], "cannot be empty"],
    [["conversation", " work"], "must be trimmed"],
    [["Conversation", "conversation"], "Duplicate"],
  ] as const)("rejects invalid course tags %j", (tags, message) => {
    const value = catalog();
    value.courses[0].tags = [...tags];

    expect(() => validateCourseCatalog(value)).toThrow(message);
  });

  it.each([0, -1, 1.5])("rejects invalid course revision %s", (revision) => {
    const value = catalog();
    value.courses[0].revision = revision;

    expect(() => validateCourseCatalog(value)).toThrow("revision");
  });

  it("rejects unknown CEFR levels", () => {
    const value = catalog();
    value.courses[0].level.cefrFrom = "Starter" as never;

    expect(() => validateCourseCatalog(value)).toThrow("CEFR");
  });

  it("rejects a reversed CEFR range", () => {
    const value = catalog();
    value.courses[0].level.cefrFrom = "B1";
    value.courses[0].level.cefrTo = "A2";

    expect(() => validateCourseCatalog(value)).toThrow("range");
  });

  it.each([
    ["kind", "partner"],
    ["name", " "],
    ["url", " "],
  ] as const)("rejects an invalid provider %s", (field, invalidValue) => {
    const value = catalog();
    Object.assign(value.courses[0].provider, { [field]: invalidValue });

    expect(() => validateCourseCatalog(value)).toThrow("provider");
  });

  it("rejects a lesson that references a missing card", () => {
    const value = catalog();
    value.courses[0].units[0].lessons[0].cardIds.push("missing-card");

    expect(() => validateCourseCatalog(value)).toThrow("missing-card");
  });

  it("rejects a card that appears twice in one course", () => {
    const value = catalog();
    value.courses[0].units[0].lessons.push({
      id: "lesson-2",
      title: "Lesson Two",
      objective: "Repeat a card.",
      cardIds: ["card-1"],
    });

    expect(() => validateCourseCatalog(value)).toThrow("card-1");
  });

  it("rejects a learning path that references an unknown course", () => {
    const value = catalog();
    value.learningPaths[0].courseIds.push("missing-course");

    expect(() => validateCourseCatalog(value)).toThrow("missing-course");
  });

  it("rejects duplicate course identifiers", () => {
    const value = catalog();
    value.courses.push({ ...value.courses[0] });

    expect(() => validateCourseCatalog(value)).toThrow("course-1");
  });

  it("rejects empty instructional fields", () => {
    const value = catalog();
    value.courses[0].units[0].lessons[0].objective = " ";

    expect(() => validateCourseCatalog(value)).toThrow("objective");
  });
});

function catalog(): CourseCatalog {
  return {
    categories: [
      {
        id: "category-1",
        title: "Everyday Communication",
        description: "Useful language for daily life.",
        sortOrder: 0,
      },
    ],
    learningPaths: [
      {
        id: "path-1",
        title: "Path One",
        description: "A test path.",
        courseIds: ["course-1"],
      },
    ],
    courses: [
      {
        id: "course-1",
        title: "Course One",
        description: "A test course.",
        categoryId: "category-1",
        tags: ["conversation", "daily-life"],
        level: {
          label: "Beginner · A1–A2",
          cefrFrom: "A1",
          cefrTo: "A2",
        },
        provider: {
          kind: "original",
          name: "UtterLoop Original",
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
                objective: "Practice one card.",
                cardIds: ["card-1"],
              },
            ],
          },
        ],
      },
    ],
    cards: [
      {
        id: "card-1",
        english: "This is a complete sentence.",
        prompt: "这是一个完整的句子。",
        source: "Test",
        tags: ["test"],
        acceptableAnswers: [],
        createdAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
    ],
  };
}
