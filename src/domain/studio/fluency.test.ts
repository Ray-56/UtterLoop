import { describe, expect, it } from "vitest";
import { beginFluency, finishFluency, pauseFluency, resumeFluency, updateFluencyInput } from "./fluency";

describe("visible-target Fluency Pass", () => {
  const start = () => beginFluency({ id: "pass-1", sourceCardId: "sf-001", target: "cat dog", source: "correct" });

  it("starts timing at the first typed character, independently from recall and target exposure", () => {
    let state = start();
    state = updateFluencyInput(state, "c", 60_000, "KeyC");
    state = updateFluencyInput(state, "cat dog", 120_000, undefined);
    const result = finishFluency(state, 120_000, new Date("2026-10-22T04:00:00.000Z"));
    expect(result.activeDurationMs).toBe(60_000);
    expect(result.netWpm).toBeCloseTo(1.4);
    expect(result.characterAccuracy).toBe(1);
    expect(result.physicalKeys).toEqual([{ code: "KeyC", presses: 1, mismatches: 0 }]);
    expect(result).not.toHaveProperty("target");
    expect(result).not.toHaveProperty("answer");
  });

  it("records backspaces and physical-key mistakes without claiming finger or layout detection", () => {
    let state = updateFluencyInput(start(), "x", 0, "KeyX");
    state = updateFluencyInput(state, "", 1_000, "Backspace");
    state = updateFluencyInput(state, "cat dog", 60_000);
    const result = finishFluency(state, 60_000, new Date("2026-10-22T04:00:00.000Z"));
    expect(result.backspaces).toBe(1);
    expect(result.committedCharacters).toBe(8);
    expect(result.uncorrectedErrors).toBe(0);
    expect(result.physicalKeys).toEqual([{ code: "KeyX", presses: 1, mismatches: 1 }]);
  });

  it("excludes explicit pauses and rejects input while paused", () => {
    let state = updateFluencyInput(start(), "c", 1_000);
    state = pauseFluency(state, 2_000);
    expect(() => updateFluencyInput(state, "ca", 3_000)).toThrow("paused");
    state = resumeFluency(state, 62_000);
    state = updateFluencyInput(state, "cat dog", 63_000);
    const result = finishFluency(state, 63_000, new Date("2026-10-22T04:00:00.000Z"));
    expect(result.activeDurationMs).toBe(2_000);
    expect(result.pauseCount).toBe(0);
  });

  it("does not subtract a pause that ended before the first typed character", () => {
    let state = pauseFluency(start(), 1_000);
    state = resumeFluency(state, 61_000);
    state = updateFluencyInput(state, "c", 62_000);
    state = updateFluencyInput(state, "cat dog", 72_000);
    expect(finishFluency(state, 72_000, new Date("2026-10-22T04:00:00.000Z")).activeDurationMs).toBe(10_000);
  });

  it("measures rhythm, incomplete final accuracy and net speed with explicit denominators", () => {
    let state = updateFluencyInput(start(), "c", 0);
    state = updateFluencyInput(state, "car", 3_000, "KeyR");
    const result = finishFluency(state, 60_000, new Date("2026-10-22T04:00:00.000Z"));
    expect(result.pauseCount).toBe(1);
    expect(result.longestPauseMs).toBe(3_000);
    expect(result.uncorrectedErrors).toBe(5);
    expect(result.characterAccuracy).toBeCloseTo(2 / 7);
    expect(result.netWpm).toBe(0);
  });

  it("rejects empty passes, nonmonotonic clocks and invalid targets", () => {
    expect(() => finishFluency(start(), 10, new Date())).toThrow("Type");
    const state = updateFluencyInput(start(), "c", 100);
    expect(() => updateFluencyInput(state, "ca", 99)).toThrow("clock");
    expect(() => finishFluency(state, 99, new Date())).toThrow("clock");
    expect(() => beginFluency({ id: "x", sourceCardId: "x", target: "", source: "learned" })).toThrow();
  });
});
