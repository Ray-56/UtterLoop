import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";

const QUICK_START_KEY = "utterloop.quick-start";
const QUICK_START_VERSION = 1 as const;

interface KeyValueStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export type QuickStartStatus = "completed" | "dismissed";

export interface QuickStartPreference {
  version: typeof QUICK_START_VERSION;
  status: QuickStartStatus;
}

export function shouldOfferQuickStart(
  learningStates: readonly SentenceLearningState[],
  preference: QuickStartPreference | null,
): boolean {
  return learningStates.length === 0 && preference === null;
}

export function readQuickStartPreference(storage: KeyValueStorage): QuickStartPreference | null {
  const raw = storage.getItem(QUICK_START_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPreference(parsed)) {
      storage.removeItem(QUICK_START_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(QUICK_START_KEY);
    return null;
  }
}

export function writeQuickStartPreference(
  storage: KeyValueStorage,
  status: QuickStartStatus,
): void {
  storage.setItem(QUICK_START_KEY, JSON.stringify({
    version: QUICK_START_VERSION,
    status,
  } satisfies QuickStartPreference));
}

export function clearQuickStartPreference(storage: KeyValueStorage): void {
  storage.removeItem(QUICK_START_KEY);
}

function isPreference(value: unknown): value is QuickStartPreference {
  return typeof value === "object"
    && value !== null
    && "version" in value
    && value.version === QUICK_START_VERSION
    && "status" in value
    && (value.status === "completed" || value.status === "dismissed");
}
