import { describe, expect, it } from "vitest";
import { soundForPracticeCommand } from "./useKeyFeedback";

describe("soundForPracticeCommand", () => {
  it("uses a short click for ordinary characters", () => {
    expect(soundForPracticeCommand({ type: "append", value: "a" })).toBe("key");
  });

  it("gives the space bar a lower sound", () => {
    expect(soundForPracticeCommand({ type: "append", value: " " })).toBe("space");
  });

  it("groups editing commands as delete feedback", () => {
    expect(soundForPracticeCommand({ type: "delete" })).toBe("delete");
    expect(soundForPracticeCommand({ type: "clear" })).toBe("delete");
    expect(soundForPracticeCommand({ type: "retry" })).toBe("delete");
  });

  it("uses a heavier sound for practice actions", () => {
    expect(soundForPracticeCommand({ type: "incomplete" })).toBe("action");
    expect(soundForPracticeCommand({ type: "submit" })).toBe("action");
    expect(soundForPracticeCommand({ type: "mark-mastered" })).toBe("action");
    expect(soundForPracticeCommand({ type: "toggle-answer" })).toBe("action");
    expect(soundForPracticeCommand({ type: "toggle-vocabulary" })).toBe("action");
  });
});
