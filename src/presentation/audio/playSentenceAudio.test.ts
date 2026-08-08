import { describe, expect, it } from "vitest";
import { queueSentenceAudioTwice } from "./playSentenceAudio";

describe("queueSentenceAudioTwice", () => {
  it("queues two copies of the sentence for one playback request", () => {
    const queuedUtterances: Array<{ copy: number }> = [];
    const playbackEvents: string[] = [];
    let createdCopies = 0;

    queueSentenceAudioTwice(
      {
        cancel: () => {
          playbackEvents.push("cancel");
        },
        speak: (utterance) => {
          queuedUtterances.push(utterance);
          playbackEvents.push(`speak copy ${utterance.copy}`);
        },
      },
      () => ({ copy: ++createdCopies }),
    );

    expect(queuedUtterances).toEqual([{ copy: 1 }, { copy: 2 }]);
    expect(playbackEvents).toEqual(["cancel", "speak copy 1", "speak copy 2"]);
  });
});
