import { describe, expect, it } from "vitest";
import {
  completeFirstExposure,
  markInstructionalCompletion,
  recordFirstPass,
  requireGuidedAcquisition,
} from "./SentenceLearningState";

describe("SentenceLearningState", () => {
  it("records first exposure once and requires a guided recall", () => {
    const first = completeFirstExposure(undefined, "card-1", "2026-07-31T01:00:00.000Z");
    const repeated = completeFirstExposure(first, "card-1", "2026-07-31T02:00:00.000Z");

    expect(first).toEqual({
      cardId: "card-1",
      introducedAt: "2026-07-31T01:00:00.000Z",
      acquisitionStatus: "needs-guided",
    });
    expect(repeated.introducedAt).toBe(first.introducedAt);
  });

  it("becomes independent-ready only after exact instruction and returns to guided after assistance or failure", () => {
    const introduced = completeFirstExposure(undefined, "card-1", "2026-07-31T01:00:00.000Z");
    const ready = markInstructionalCompletion(introduced);
    const guidedAgain = requireGuidedAcquisition(ready);

    expect(ready.acquisitionStatus).toBe("ready-independent");
    expect(guidedAgain.acquisitionStatus).toBe("needs-guided");
  });

  it("records a monotonic First Pass and clears acquisition readiness", () => {
    const ready = markInstructionalCompletion(
      completeFirstExposure(undefined, "card-1", "2026-07-31T01:00:00.000Z"),
    );
    const passed = recordFirstPass(ready, "card-1", "independent-recall", "2026-07-31T03:00:00.000Z");
    const repeated = recordFirstPass(passed, "card-1", "explicit-mastery", "2026-08-01T03:00:00.000Z");

    expect(passed).toEqual({
      cardId: "card-1",
      introducedAt: "2026-07-31T01:00:00.000Z",
      firstPassedAt: "2026-07-31T03:00:00.000Z",
      firstPassSource: "independent-recall",
    });
    expect(repeated).toEqual(passed);
  });

  it("explicit mastery can introduce and pass an untouched card atomically", () => {
    expect(recordFirstPass(undefined, "card-1", "explicit-mastery", "2026-07-31T03:00:00.000Z")).toEqual({
      cardId: "card-1",
      introducedAt: "2026-07-31T03:00:00.000Z",
      firstPassedAt: "2026-07-31T03:00:00.000Z",
      firstPassSource: "explicit-mastery",
    });
  });
});
