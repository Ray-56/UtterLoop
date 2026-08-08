interface SpeechQueue<TUtterance> {
  cancel(): void;
  speak(utterance: TUtterance): void;
}

type SentenceAudioCopy = 0 | 1;

export function queueSentenceAudioTwice<TUtterance>(
  synthesis: SpeechQueue<TUtterance>,
  createUtterance: (copy: SentenceAudioCopy) => TUtterance,
): void {
  const firstCopy = createUtterance(0);
  const secondCopy = createUtterance(1);

  synthesis.cancel();
  synthesis.speak(firstCopy);
  synthesis.speak(secondCopy);
}
