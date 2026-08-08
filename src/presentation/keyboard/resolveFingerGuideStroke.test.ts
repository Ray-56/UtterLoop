import { describe, expect, it } from "vitest";
import {
  FINGER_GUIDE_ROWS,
  resolveFingerGuideStroke,
  type FingerGuideAssignment,
  type FingerGuideKeyInput,
} from "./resolveFingerGuideStroke";

const baseInput: FingerGuideKeyInput = {
  code: "KeyF",
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  altGraphKey: false,
  isComposing: false,
  command: { type: "append", value: "f" },
};

function input(
  code: string,
  overrides: Partial<FingerGuideKeyInput> = {},
): FingerGuideKeyInput {
  return { ...baseInput, code, ...overrides };
}

describe("resolveFingerGuideStroke", () => {
  it("maps a physical ANSI key to its recommended finger", () => {
    expect(resolveFingerGuideStroke(baseInput)).toEqual({
      code: "KeyF",
      legend: "F",
      primary: { hand: "left", finger: "index" },
    });
  });

  it("exposes the complete compact ANSI typing block", () => {
    expect(FINGER_GUIDE_ROWS.map((row) => row.map(({ code }) => code))).toEqual([
      [
        "Escape",
        "Backquote",
        "Digit1",
        "Digit2",
        "Digit3",
        "Digit4",
        "Digit5",
        "Digit6",
        "Digit7",
        "Digit8",
        "Digit9",
        "Digit0",
        "Minus",
        "Equal",
        "Backspace",
      ],
      [
        "Tab",
        "KeyQ",
        "KeyW",
        "KeyE",
        "KeyR",
        "KeyT",
        "KeyY",
        "KeyU",
        "KeyI",
        "KeyO",
        "KeyP",
        "BracketLeft",
        "BracketRight",
        "Backslash",
      ],
      [
        "CapsLock",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyF",
        "KeyG",
        "KeyH",
        "KeyJ",
        "KeyK",
        "KeyL",
        "Semicolon",
        "Quote",
        "Enter",
      ],
      [
        "ShiftLeft",
        "KeyZ",
        "KeyX",
        "KeyC",
        "KeyV",
        "KeyB",
        "KeyN",
        "KeyM",
        "Comma",
        "Period",
        "Slash",
        "ShiftRight",
      ],
      ["Space"],
    ]);
  });

  it("assigns every ANSI key in the guide to the specified touch-typing finger", () => {
    const definitions = new Map(FINGER_GUIDE_ROWS.flat().map((key) => [key.code, key]));
    const expected: Array<[FingerGuideAssignment, string[]]> = [
      [
        { hand: "left", finger: "pinky" },
        ["Escape", "Backquote", "Digit1", "Tab", "CapsLock", "KeyQ", "KeyA", "KeyZ", "ShiftLeft"],
      ],
      [{ hand: "left", finger: "ring" }, ["Digit2", "KeyW", "KeyS", "KeyX"]],
      [{ hand: "left", finger: "middle" }, ["Digit3", "KeyE", "KeyD", "KeyC"]],
      [
        { hand: "left", finger: "index" },
        ["Digit4", "Digit5", "KeyR", "KeyT", "KeyF", "KeyG", "KeyV", "KeyB"],
      ],
      [
        { hand: "right", finger: "index" },
        ["Digit6", "Digit7", "KeyY", "KeyU", "KeyH", "KeyJ", "KeyN", "KeyM"],
      ],
      [{ hand: "right", finger: "middle" }, ["Digit8", "KeyI", "KeyK", "Comma"]],
      [{ hand: "right", finger: "ring" }, ["Digit9", "KeyO", "KeyL", "Period"]],
      [
        { hand: "right", finger: "pinky" },
        [
          "Digit0",
          "Minus",
          "Equal",
          "KeyP",
          "BracketLeft",
          "BracketRight",
          "Backslash",
          "Semicolon",
          "Quote",
          "Slash",
          "ShiftRight",
          "Backspace",
          "Enter",
        ],
      ],
      [{ hand: "right", finger: "thumb" }, ["Space"]],
    ];

    for (const [assignment, codes] of expected) {
      for (const code of codes) {
        expect(definitions.get(code)?.assignment, code).toEqual(assignment);
      }
    }
  });

  it("adds the opposite Shift pinky for shifted letters, digits, and punctuation", () => {
    expect(resolveFingerGuideStroke(input("KeyB", { shiftKey: true }))).toEqual({
      code: "KeyB",
      legend: "B",
      primary: { hand: "left", finger: "index" },
      shift: {
        code: "ShiftRight",
        assignment: { hand: "right", finger: "pinky" },
      },
    });
    expect(resolveFingerGuideStroke(input("Digit6", { shiftKey: true }))).toEqual({
      code: "Digit6",
      legend: "^",
      primary: { hand: "right", finger: "index" },
      shift: {
        code: "ShiftLeft",
        assignment: { hand: "left", finger: "pinky" },
      },
    });
    expect(resolveFingerGuideStroke(input("Slash", { shiftKey: true }))).toEqual({
      code: "Slash",
      legend: "?",
      primary: { hand: "right", finger: "pinky" },
      shift: {
        code: "ShiftLeft",
        assignment: { hand: "left", finger: "pinky" },
      },
    });
  });

  it("does not add Shift guidance to Space or editing/action keys", () => {
    const cases: Array<[string, FingerGuideKeyInput["command"], string]> = [
      ["Space", { type: "append", value: " " }, "Space"],
      ["Enter", { type: "submit" }, "Enter"],
      ["Backspace", { type: "delete" }, "Backspace"],
      ["Escape", { type: "clear" }, "Esc"],
    ];

    for (const [code, command, legend] of cases) {
      expect(resolveFingerGuideStroke(input(code, { shiftKey: true, command }))).toEqual({
        code,
        legend,
        primary: code === "Space"
          ? { hand: "right", finger: "thumb" }
          : code === "Escape"
            ? { hand: "left", finger: "pinky" }
            : { hand: "right", finger: "pinky" },
      });
    }
  });

  it("ignores unsupported, modified, composing, and unaccepted keystrokes", () => {
    expect(resolveFingerGuideStroke(input("ArrowUp"))).toBeNull();
    expect(resolveFingerGuideStroke(input("KeyF", { command: null }))).toBeNull();
    expect(resolveFingerGuideStroke(input("KeyF", { ctrlKey: true }))).toBeNull();
    expect(resolveFingerGuideStroke(input("KeyF", { altKey: true }))).toBeNull();
    expect(resolveFingerGuideStroke(input("KeyF", { metaKey: true }))).toBeNull();
    expect(resolveFingerGuideStroke(input("KeyF", { altGraphKey: true }))).toBeNull();
    expect(resolveFingerGuideStroke(input("KeyF", { isComposing: true }))).toBeNull();
  });
});
