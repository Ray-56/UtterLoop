import type { PracticeKeyCommand } from "./resolvePracticeKey";

export type FingerGuideHand = "left" | "right";
export type FingerGuideFinger = "pinky" | "ring" | "middle" | "index" | "thumb";

export interface FingerGuideAssignment {
  hand: FingerGuideHand;
  finger: FingerGuideFinger;
}

export interface FingerGuideKeyDefinition {
  code: string;
  label: string;
  shiftedLabel?: string;
  assignment: FingerGuideAssignment;
  units: number;
}

export interface FingerGuideStroke {
  code: string;
  legend: string;
  primary: FingerGuideAssignment;
  shift?: {
    code: "ShiftLeft" | "ShiftRight";
    assignment: FingerGuideAssignment;
  };
}

export interface FingerGuideKeyInput {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  altGraphKey: boolean;
  isComposing: boolean;
  command: PracticeKeyCommand | null;
}

const leftPinky = { hand: "left", finger: "pinky" } as const;
const leftRing = { hand: "left", finger: "ring" } as const;
const leftMiddle = { hand: "left", finger: "middle" } as const;
const leftIndex = { hand: "left", finger: "index" } as const;
const rightIndex = { hand: "right", finger: "index" } as const;
const rightMiddle = { hand: "right", finger: "middle" } as const;
const rightRing = { hand: "right", finger: "ring" } as const;
const rightPinky = { hand: "right", finger: "pinky" } as const;
const rightThumb = { hand: "right", finger: "thumb" } as const;

function key(
  code: string,
  label: string,
  assignment: FingerGuideAssignment,
  units = 1,
  shiftedLabel?: string,
): FingerGuideKeyDefinition {
  return { code, label, shiftedLabel, assignment, units };
}

export const FINGER_GUIDE_ROWS: readonly (readonly FingerGuideKeyDefinition[])[] = [
  [
    key("Escape", "Esc", leftPinky),
    key("Backquote", "`", leftPinky, 1, "~"),
    key("Digit1", "1", leftPinky, 1, "!"),
    key("Digit2", "2", leftRing, 1, "@"),
    key("Digit3", "3", leftMiddle, 1, "#"),
    key("Digit4", "4", leftIndex, 1, "$"),
    key("Digit5", "5", leftIndex, 1, "%"),
    key("Digit6", "6", rightIndex, 1, "^"),
    key("Digit7", "7", rightIndex, 1, "&"),
    key("Digit8", "8", rightMiddle, 1, "*"),
    key("Digit9", "9", rightRing, 1, "("),
    key("Digit0", "0", rightPinky, 1, ")"),
    key("Minus", "-", rightPinky, 1, "_"),
    key("Equal", "=", rightPinky, 1, "+"),
    key("Backspace", "Backspace", rightPinky, 2),
  ],
  [
    key("Tab", "Tab", leftPinky, 1.5),
    key("KeyQ", "Q", leftPinky),
    key("KeyW", "W", leftRing),
    key("KeyE", "E", leftMiddle),
    key("KeyR", "R", leftIndex),
    key("KeyT", "T", leftIndex),
    key("KeyY", "Y", rightIndex),
    key("KeyU", "U", rightIndex),
    key("KeyI", "I", rightMiddle),
    key("KeyO", "O", rightRing),
    key("KeyP", "P", rightPinky),
    key("BracketLeft", "[", rightPinky, 1, "{"),
    key("BracketRight", "]", rightPinky, 1, "}"),
    key("Backslash", "\\", rightPinky, 1.5, "|"),
  ],
  [
    key("CapsLock", "Caps", leftPinky, 1.75),
    key("KeyA", "A", leftPinky),
    key("KeyS", "S", leftRing),
    key("KeyD", "D", leftMiddle),
    key("KeyF", "F", leftIndex),
    key("KeyG", "G", leftIndex),
    key("KeyH", "H", rightIndex),
    key("KeyJ", "J", rightIndex),
    key("KeyK", "K", rightMiddle),
    key("KeyL", "L", rightRing),
    key("Semicolon", ";", rightPinky, 1, ":"),
    key("Quote", "'", rightPinky, 1, "\""),
    key("Enter", "Enter", rightPinky, 2.25),
  ],
  [
    key("ShiftLeft", "Shift", leftPinky, 2.25),
    key("KeyZ", "Z", leftPinky),
    key("KeyX", "X", leftRing),
    key("KeyC", "C", leftMiddle),
    key("KeyV", "V", leftIndex),
    key("KeyB", "B", leftIndex),
    key("KeyN", "N", rightIndex),
    key("KeyM", "M", rightIndex),
    key("Comma", ",", rightMiddle, 1, "<"),
    key("Period", ".", rightRing, 1, ">"),
    key("Slash", "/", rightPinky, 1, "?"),
    key("ShiftRight", "Shift", rightPinky, 2.75),
  ],
  [key("Space", "Space", rightThumb, 6.25)],
];

export function resolveFingerGuideStroke(input: FingerGuideKeyInput): FingerGuideStroke | null {
  if (
    !input.command
    || input.ctrlKey
    || input.altKey
    || input.metaKey
    || input.altGraphKey
    || input.isComposing
  ) {
    return null;
  }

  const definition = FINGER_GUIDE_ROWS.flat().find((key) => key.code === input.code);

  if (!definition) {
    return null;
  }

  const usesShift = input.shiftKey
    && (definition.code.startsWith("Key")
      || definition.code.startsWith("Digit")
      || Boolean(definition.shiftedLabel));

  return {
    code: definition.code,
    legend: input.shiftKey && definition.shiftedLabel
      ? definition.shiftedLabel
      : definition.label,
    primary: definition.assignment,
    ...(usesShift
      ? {
          shift: definition.assignment.hand === "left"
            ? { code: "ShiftRight" as const, assignment: rightPinky }
            : { code: "ShiftLeft" as const, assignment: leftPinky },
        }
      : {}),
  };
}
