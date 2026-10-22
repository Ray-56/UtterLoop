import type { FluencyResult, PhysicalKeyAggregate } from "./LearningStudio";

export interface FluencyCapture {
  id: string;
  sourceCardId: string;
  source: FluencyResult["source"];
  target: string;
  input: string;
  firstInputAt: number | null;
  lastInputAt: number | null;
  pausedAt: number | null;
  inactiveDurationMs: number;
  committedCharacters: number;
  correctCharacters: number;
  backspaces: number;
  pauseCount: number;
  longestPauseMs: number;
  physicalKeys: PhysicalKeyAggregate[];
}

export function beginFluency(input: Pick<FluencyCapture, "id" | "sourceCardId" | "source" | "target">): FluencyCapture {
  if (!input.id.trim() || !input.sourceCardId.trim() || !input.target.trim() || input.target.length > 500) {
    throw new Error("A Fluency Pass needs an identified, bounded target sentence.");
  }
  return { ...input, input: "", firstInputAt: null, lastInputAt: null, pausedAt: null,
    inactiveDurationMs: 0, committedCharacters: 0, correctCharacters: 0, backspaces: 0,
    pauseCount: 0, longestPauseMs: 0, physicalKeys: [],
  };
}

export function updateFluencyInput(state: FluencyCapture, input: string, at: number, physicalCode?: string): FluencyCapture {
  assertClock(state, at);
  if (state.pausedAt !== null) throw new Error("Fluency Pass is paused.");
  if (input.length > 1_000) throw new Error("The typing input is too long.");
  if (state.input === input) return state;
  const before = [...state.input];
  const after = [...input];
  const target = [...state.target];
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const inserted = after.slice(prefix, after.length - suffix);
  const removed = before.length - prefix - suffix;
  const correctInserted = inserted.filter((character, index) => character === target[prefix + index]).length;
  const gap = state.lastInputAt === null ? 0 : at - state.lastInputAt;
  const physicalKeys = state.physicalKeys.map((key) => ({ ...key }));
  if (physicalCode && /^(Key[A-Z]|Digit[0-9]|Space|Quote|Comma|Period|Semicolon|Slash|Minus|Equal|BracketLeft|BracketRight|Backslash)$/.test(physicalCode)
    && inserted.length === 1) {
    let aggregate = physicalKeys.find((key) => key.code === physicalCode);
    if (!aggregate) { aggregate = { code: physicalCode, presses: 0, mismatches: 0 }; physicalKeys.push(aggregate); }
    aggregate.presses++;
    aggregate.mismatches += correctInserted === 1 ? 0 : 1;
  }
  return { ...state, input, firstInputAt: state.firstInputAt ?? at, lastInputAt: at,
    committedCharacters: state.committedCharacters + inserted.length,
    correctCharacters: state.correctCharacters + correctInserted,
    backspaces: state.backspaces + (physicalCode === "Backspace" && removed > 0 ? 1 : 0),
    pauseCount: state.pauseCount + (gap >= 2_000 ? 1 : 0),
    longestPauseMs: Math.max(state.longestPauseMs, gap), physicalKeys,
  };
}

export function pauseFluency(state: FluencyCapture, at: number): FluencyCapture {
  assertClock(state, at);
  return state.pausedAt === null ? { ...state, pausedAt: at } : state;
}

export function resumeFluency(state: FluencyCapture, at: number): FluencyCapture {
  assertClock(state, at);
  if (state.pausedAt === null) return state;
  const excluded = state.firstInputAt === null ? 0 : at - state.pausedAt;
  return { ...state, pausedAt: null, inactiveDurationMs: state.inactiveDurationMs + excluded,
    lastInputAt: state.lastInputAt === null ? null : at,
  };
}

export function finishFluency(state: FluencyCapture, at: number, completedAt: Date): FluencyResult {
  assertClock(state, at);
  if (state.firstInputAt === null || state.committedCharacters === 0) throw new Error("Type the sentence before saving a Fluency Pass.");
  const pauseTail = state.pausedAt === null ? 0 : at - state.pausedAt;
  const activeDurationMs = Math.max(1, at - state.firstInputAt - state.inactiveDurationMs - pauseTail);
  const uncorrectedErrors = characterDistance(state.target, state.input);
  const denominator = Math.max([...state.target].length, [...state.input].length);
  const characterAccuracy = Math.max(0, 1 - uncorrectedErrors / denominator);
  return { id: state.id, sourceCardId: state.sourceCardId, source: state.source,
    startedAt: new Date(completedAt.getTime() - (at - state.firstInputAt)).toISOString(),
    completedAt: completedAt.toISOString(), activeDurationMs,
    committedCharacters: state.committedCharacters, correctCharacters: state.correctCharacters,
    uncorrectedErrors, backspaces: state.backspaces, pauseCount: state.pauseCount,
    longestPauseMs: state.longestPauseMs,
    netWpm: Math.max(0, ([...state.input].length - uncorrectedErrors) / 5) / (activeDurationMs / 60_000),
    characterAccuracy, physicalKeys: state.physicalKeys.map((key) => ({ ...key })),
  };
}

function assertClock(state: FluencyCapture, at: number): void {
  if (!Number.isFinite(at) || at < 0 || (state.lastInputAt !== null && at < state.lastInputAt)
    || (state.pausedAt !== null && at < state.pausedAt)) throw new Error("Fluency clock must be monotonic.");
}

function characterDistance(expected: string, actual: string): number {
  const left = [...expected];
  const right = [...actual];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) row[j] = Math.min(
      row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
    );
    previous = row;
  }
  return previous[right.length];
}
