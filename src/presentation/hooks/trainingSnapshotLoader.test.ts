import { describe, expect, it, vi } from "vitest";
import type { CompleteTrainingSnapshot, TrainingSnapshot } from "../../application/use-cases/getTrainingSnapshot";
import { TrainingSnapshotLoader } from "./trainingSnapshotLoader";

const asOf = "2026-10-22T12:00:00.000Z";
function practice(id = "one"): TrainingSnapshot {
  return {
    cards: [{ id }], progressDashboard: null, betaReadiness: null,
    analyticsAsOf: null, focusedWeakCardIds: null,
  } as unknown as TrainingSnapshot;
}
function complete(): CompleteTrainingSnapshot {
  return {
    ...practice(), progressDashboard: { overview: { totalCards: 1 } },
    analyticsAsOf: asOf, focusedWeakCardIds: ["weak-card"],
  } as unknown as CompleteTrainingSnapshot;
}

describe("TrainingSnapshotLoader", () => {
  it("defers analytics, deduplicates requests, and preserves focused eligibility across Practice refreshes", async () => {
    const source = {
      getPracticeSnapshot: vi.fn(async () => practice()),
      getSnapshot: vi.fn(async () => complete()),
    };
    const loader = new TrainingSnapshotLoader(source, vi.fn(), () => Date.parse(asOf));
    await loader.refresh();
    expect(source.getSnapshot).not.toHaveBeenCalled();
    await Promise.all([loader.loadAnalytics(), loader.loadAnalytics()]);
    await loader.loadAnalytics();
    expect(source.getSnapshot).toHaveBeenCalledTimes(1);
    expect(loader.state.analyticsStatus).toBe("loaded");
    await loader.loadAnalytics({ force: true });
    expect(source.getSnapshot).toHaveBeenCalledTimes(2);

    await loader.refresh();
    expect(loader.state.snapshot?.progressDashboard).toBeNull();
    expect(loader.state.snapshot?.focusedWeakCardIds).toEqual(["weak-card"]);
    expect(loader.state.analyticsStatus).toBe("deferred");
    await loader.refresh({ invalidateFocused: true });
    expect(loader.state.snapshot?.focusedWeakCardIds).toBeNull();
  });

  it("discards analytics that finish after a newer Practice write refresh", async () => {
    let resolveAnalytics!: (value: CompleteTrainingSnapshot) => void;
    const source = {
      getPracticeSnapshot: vi.fn(async () => practice()),
      getSnapshot: vi.fn(() => new Promise<CompleteTrainingSnapshot>((resolve) => { resolveAnalytics = resolve; })),
    };
    const loader = new TrainingSnapshotLoader(source, vi.fn());
    await loader.refresh();
    const pending = loader.loadAnalytics();
    source.getPracticeSnapshot.mockResolvedValue(practice("latest"));
    await loader.refresh();
    resolveAnalytics(complete());
    await pending;
    expect(loader.state.snapshot?.cards[0].id).toBe("latest");
    expect(loader.state.snapshot?.analyticsAsOf).toBeNull();
  });

  it("surfaces analytics failure and permits an explicit retry", async () => {
    const source = {
      getPracticeSnapshot: vi.fn(async () => practice()),
      getSnapshot: vi.fn(async () => complete()),
    };
    source.getSnapshot.mockRejectedValueOnce(new Error("private database detail"));
    const loader = new TrainingSnapshotLoader(source, vi.fn());
    await loader.refresh();
    await expect(loader.loadAnalytics()).rejects.toThrow("private database detail");
    expect(loader.state.analyticsStatus).toBe("error");
    expect(loader.state.analyticsError).not.toContain("private database detail");
    expect(loader.state.snapshot?.cards[0].id).toBe("one");
    await loader.loadAnalytics();
    expect(loader.state.analyticsStatus).toBe("loaded");
    expect(loader.state.analyticsError).toBeNull();
  });

  it("reloads time-dependent analytics after its freshness window", async () => {
    let now = Date.parse(asOf);
    const source = {
      getPracticeSnapshot: vi.fn(async () => practice()),
      getSnapshot: vi.fn(async () => complete()),
    };
    const loader = new TrainingSnapshotLoader(source, vi.fn(), () => now);
    await loader.refresh();
    await loader.loadAnalytics();
    now += 61_000;
    await loader.loadAnalytics();
    expect(source.getSnapshot).toHaveBeenCalledTimes(2);
  });
});
