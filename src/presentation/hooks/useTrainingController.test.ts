import { describe, expect, it, vi } from "vitest";
import { createPersistenceCommandRunner } from "./useTrainingController";

describe("training controller persistence status", () => {
  it("keeps a failed write visible until that command succeeds on retry", async () => {
    const onHealthChange = vi.fn();
    const run = createPersistenceCommandRunner(onHealthChange);
    const failure = new Error("database internals");

    await expect(run("preferences:theme", async () => Promise.reject(failure))).rejects.toBe(failure);
    expect(onHealthChange).toHaveBeenLastCalledWith("attention");

    await expect(run("practice-checkpoint", async () => "saved in background")).resolves.toBe(
      "saved in background",
    );
    expect(onHealthChange).toHaveBeenLastCalledWith("attention");

    await expect(run("preferences:theme", async () => "saved on retry")).resolves.toBe(
      "saved on retry",
    );
    expect(onHealthChange).toHaveBeenLastCalledWith("saved");
  });

  it("waits for every failed command to recover before reporting saved", async () => {
    const health: string[] = [];
    const run = createPersistenceCommandRunner((next) => health.push(next));

    await expect(run("vocabulary:one", async () => Promise.reject(new Error("first")))).rejects.toThrow(
      "first",
    );
    await expect(run("review:two", async () => Promise.reject(new Error("second")))).rejects.toThrow(
      "second",
    );
    await run("vocabulary:one", async () => undefined);

    expect(health.at(-1)).toBe("attention");

    await run("review:two", async () => undefined);
    expect(health.at(-1)).toBe("saved");
  });
});
