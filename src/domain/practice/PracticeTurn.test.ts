import { describe, expect, it } from "vitest";
import {
  applyRecallSupport,
  createPracticeTurn,
  planIndependentRequeue,
  resolveInitialPracticeTurn,
} from "./PracticeTurn";

describe("PracticeTurn support evidence", () => {
  it("raises support monotonically, keeps unique kinds, and only Answer sets the reveal flag", () => {
    const turn = createPracticeTurn("turn-1", "card-1", "independent-recall");
    const withAudio = applyRecallSupport(turn, "audio");
    const afterPattern = applyRecallSupport(withAudio, "pattern");
    const withGrammar = applyRecallSupport(afterPattern, "grammar", 4);

    expect(withAudio).toMatchObject({
      phase: "guided-recall",
      supportLevelUsed: 3,
      supportKindsUsed: ["audio"],
      answerWasRevealed: false,
    });
    expect(afterPattern.supportLevelUsed).toBe(3);
    expect(applyRecallSupport(afterPattern, "audio").supportKindsUsed).toEqual(["audio", "pattern"]);
    expect(withGrammar).toMatchObject({ supportLevelUsed: 4, answerWasRevealed: false });
    expect(applyRecallSupport(withGrammar, "answer")).toMatchObject({
      supportLevelUsed: 4,
      answerWasRevealed: true,
    });
  });

  it("resolves exposure, Guided, and Independent acquisition from durable learning state", () => {
    expect(resolveInitialPracticeTurn({
      id: "turn-1",
      cardId: "card-1",
      learningState: undefined,
      isReviewScope: false,
    })).toMatchObject({ phase: "first-exposure", supportLevelUsed: 0 });

    expect(resolveInitialPracticeTurn({
      id: "turn-2",
      cardId: "card-1",
      learningState: {
        cardId: "card-1",
        introducedAt: "2026-07-31T00:00:00.000Z",
        acquisitionStatus: "needs-guided",
      },
      isReviewScope: false,
    })).toMatchObject({ phase: "guided-recall", supportLevelUsed: 0, supportKindsUsed: [] });

    expect(resolveInitialPracticeTurn({
      id: "turn-3",
      cardId: "card-1",
      learningState: {
        cardId: "card-1",
        introducedAt: "2026-07-31T00:00:00.000Z",
        acquisitionStatus: "ready-independent",
      },
      isReviewScope: false,
    }).phase).toBe("independent-recall");
  });

  it("requeues an instructional completion after two intervening turns and enforces the return cap", () => {
    const remaining = [
      createPracticeTurn("turn-b", "card-b", "guided-recall"),
      createPracticeTurn("turn-c", "card-c", "guided-recall"),
      createPracticeTurn("turn-d", "card-d", "guided-recall"),
    ];
    const inserted = planIndependentRequeue({
      remainingTurns: remaining,
      cardId: "card-a",
      newTurnId: "turn-a-return",
      priorReturnCount: 1,
    });
    const capped = planIndependentRequeue({
      remainingTurns: remaining,
      cardId: "card-a",
      newTurnId: "unused",
      priorReturnCount: 2,
    });

    expect(inserted.turns.map((turn) => turn.id)).toEqual([
      "turn-b",
      "turn-c",
      "turn-a-return",
      "turn-d",
    ]);
    expect(inserted).toMatchObject({ inserted: true, pending: false });
    expect(capped).toMatchObject({ inserted: false, pending: true });
  });

  it("leaves a card pending when two intervening turns are unavailable", () => {
    const plan = planIndependentRequeue({
      remainingTurns: [createPracticeTurn("turn-b", "card-b", "guided-recall")],
      cardId: "card-a",
      newTurnId: "turn-a-return",
      priorReturnCount: 0,
    });

    expect(plan).toMatchObject({ inserted: false, pending: true });
  });
});
