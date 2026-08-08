import type { SentenceCard } from "./SentenceCard";

export interface SentenceCardRecallSafetyIssue {
  code: "target-bearing-prompt";
  field: "prompt";
}

export type SentenceCardRecallSafety =
  | { safe: true; issues: [] }
  | { safe: false; issues: SentenceCardRecallSafetyIssue[] };

export const BLOCKED_RECALL_PROMPT = "Prompt unavailable — replace or re-import this content.";

export type RecallContentSafety = "safe" | "blocked-content";

/**
 * Detects content that can reveal a complete accepted sentence before recall.
 * The result deliberately contains no learner content or target text so it is
 * safe to render in Review, Progress, logs, and recovery notices.
 */
export function inspectSentenceCardRecallSafety(
  card: SentenceCard,
): SentenceCardRecallSafety {
  if (containsCompleteSentenceAnswer(card.prompt, card)) {
    return {
      safe: false,
      issues: [{ code: "target-bearing-prompt", field: "prompt" }],
    };
  }
  return { safe: true, issues: [] };
}

export function projectRecallSafePrompt(card: SentenceCard): {
  prompt: string;
  contentSafety: RecallContentSafety;
} {
  return inspectSentenceCardRecallSafety(card).safe
    ? { prompt: card.prompt, contentSafety: "safe" }
    : { prompt: BLOCKED_RECALL_PROMPT, contentSafety: "blocked-content" };
}

export function containsCompleteSentenceAnswer(
  value: string,
  card: Pick<SentenceCard, "english" | "acceptableAnswers">,
): boolean {
  const normalizedValue = normalizeWritten(value);
  return [card.english, ...card.acceptableAnswers]
    .map(normalizeWritten)
    .filter(Boolean)
    .some((answer) => normalizedValue.includes(answer));
}

function normalizeWritten(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?;:"()[\]{}]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
