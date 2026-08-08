import { describe, expect, it } from "vitest";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import {
  clearQuickStartPreference,
  readQuickStartPreference,
  shouldOfferQuickStart,
  writeQuickStartPreference,
} from "./quickStartPreference";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Quick Start preference", () => {
  it("offers Quick Start only before any card-level learning evidence exists", () => {
    expect(shouldOfferQuickStart([], null)).toBe(true);
    expect(shouldOfferQuickStart([], { version: 1, status: "dismissed" })).toBe(false);
    expect(shouldOfferQuickStart([
      {
        cardId: "sf-001",
        introducedAt: "2026-07-31T10:00:00.000Z",
        acquisitionStatus: "needs-guided",
      } satisfies SentenceLearningState,
    ], null)).toBe(false);
  });

  it("persists completed and dismissed outcomes in a versioned record", () => {
    const storage = new MemoryStorage();

    writeQuickStartPreference(storage, "completed");
    expect(readQuickStartPreference(storage)).toEqual({ version: 1, status: "completed" });

    writeQuickStartPreference(storage, "dismissed");
    expect(readQuickStartPreference(storage)).toEqual({ version: 1, status: "dismissed" });
  });

  it("drops malformed values and supports Clear this device", () => {
    const storage = new MemoryStorage();
    storage.setItem("utterloop.quick-start", "not-json");

    expect(readQuickStartPreference(storage)).toBeNull();

    writeQuickStartPreference(storage, "completed");
    clearQuickStartPreference(storage);
    expect(readQuickStartPreference(storage)).toBeNull();
  });
});
