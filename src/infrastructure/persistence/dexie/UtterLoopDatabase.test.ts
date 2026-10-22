import { describe, expect, it } from "vitest";
import { utterLoopDatabase } from "./UtterLoopDatabase";

describe("UtterLoopDatabase schema", () => {
  it("preserves guided learning and adds independent Studio storage in schema version 7", () => {
    expect(utterLoopDatabase.verno).toBe(7);
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("courseCategories");
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("vocabularyEntries");
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("sentenceLearningStates");
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("appPreferences");
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("practiceSessionCheckpoints");
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("practiceSessionEvidence");
    expect(utterLoopDatabase.tables.map((table) => table.name)).toContain("appMetadata");
    expect(utterLoopDatabase.table("learningStudio").schema.primKey.name).toBe("id");

    const categorySchema = utterLoopDatabase.table("courseCategories").schema;
    const courseSchema = utterLoopDatabase.table("courses").schema;

    expect(categorySchema.primKey.name).toBe("id");
    expect(categorySchema.indexes.map((index) => index.name)).toContain("sortOrder");
    expect(courseSchema.indexes.map((index) => index.name)).toContain("categoryId");
    expect(courseSchema.indexes.find((index) => index.name === "tags")?.multi).toBe(true);
    expect(utterLoopDatabase.table("vocabularyEntries").schema.primKey.name).toBe("cardId");
    expect(utterLoopDatabase.table("sentenceLearningStates").schema.primKey.name).toBe("cardId");
    expect(utterLoopDatabase.table("appPreferences").schema.primKey.name).toBe("id");
    expect(utterLoopDatabase.table("practiceSessionCheckpoints").schema.primKey.name).toBe("id");
    expect(utterLoopDatabase.table("practiceSessionCheckpoints").schema.indexes.map((index) => index.name))
      .toContain("updatedAt");
    expect(utterLoopDatabase.table("practiceSessionEvidence").schema.primKey.name).toBe("sessionId");
    expect(utterLoopDatabase.table("practiceSessionEvidence").schema.indexes.map((index) => index.name))
      .toEqual(expect.arrayContaining(["roundId", "endedAt", "terminal.kind", "entryPoint"]));
    expect(utterLoopDatabase.table("practiceLog").schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["outcome", "kind", "turnId"]),
    );
  });
});
