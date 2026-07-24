import { describe, expect, it } from "vitest";
import { utterLoopDatabase } from "./UtterLoopDatabase";

describe("UtterLoopDatabase schema", () => {
  it("declares schema version 3 with categories, course discovery, and Vocabulary", () => {
    expect(utterLoopDatabase.verno).toBe(3);
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("courseCategories");
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("vocabularyEntries");

    const categorySchema = utterLoopDatabase.table("courseCategories").schema;
    const courseSchema = utterLoopDatabase.table("courses").schema;

    expect(categorySchema.primKey.name).toBe("id");
    expect(categorySchema.indexes.map((index) => index.name)).toContain("sortOrder");
    expect(courseSchema.indexes.map((index) => index.name)).toContain("categoryId");
    expect(courseSchema.indexes.find((index) => index.name === "tags")?.multi).toBe(true);
    expect(utterLoopDatabase.table("vocabularyEntries").schema.primKey.name).toBe("cardId");
  });
});
