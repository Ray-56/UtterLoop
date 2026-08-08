import type { SentenceCard } from "../content/SentenceCard";
import type { AnswerEvaluation } from "./AnswerEvaluation";
import type { AttemptPreview } from "./AttemptPreview";
import {
  matchTokenIndexes,
  tokenizeAnswer,
  tokenizeWrittenAnswer,
} from "./evaluateAttempt";

export const CORRECTION_SLOT_PLACEHOLDER = "\u2063";

export interface CorrectionDraft {
  answer: string;
  firstErrorOffset: number;
}

export function buildAttemptPreview(card: SentenceCard, answer: string): AttemptPreview {
  const acceptedTokenSets = tokenSetsForCard(card, tokenizeWrittenAnswer);
  const typedTokens = tokenizeWrittenAnswer(answer);
  const expectedTokens = selectPreviewTokens(acceptedTokenSets, typedTokens);
  const slotWidths = stableSlotWidths(acceptedTokenSets);
  const slotCount = slotWidths.length;
  const hasTrailingBoundary = /\s$/.test(answer);
  const currentTypedIndex = !hasTrailingBoundary && typedTokens.length > 0 ? typedTokens.length - 1 : -1;
  const hasCompletedCurrentToken =
    currentTypedIndex >= 0 && typedTokens[currentTypedIndex] === expectedTokens[currentTypedIndex];
  const activeIndex = Math.min(
    currentTypedIndex >= 0 && !hasCompletedCurrentToken ? currentTypedIndex : typedTokens.length,
    Math.max(expectedTokens.length - 1, 0),
  );
  const matchedCount = expectedTokens.reduce(
    (count, token, index) => count + (typedTokens[index] === token ? 1 : 0),
    0,
  );

  return {
    tokens: Array.from({ length: slotCount }, (_, index) => {
      const expected = expectedTokens[index] ?? "";
      if (!expected) {
        return {
          expected: "",
          typed: "",
          status: "empty" as const,
          typedIndex: null,
        };
      }

      const typed = typedTokens[index] ?? "";

      if (!typed) {
        return {
          expected,
          typed,
          status: index === activeIndex ? "active" : "empty",
          typedIndex: null,
        };
      }

      if (index === currentTypedIndex && typed !== expected) {
        return {
          expected,
          typed,
          status: "active",
          typedIndex: index,
        };
      }

      return {
        expected,
        typed,
        status: typed === expected ? "matched" : "mismatch",
        typedIndex: index,
      };
    }),
    extraTokens: typedTokens.slice(expectedTokens.length),
    extraTokenIndexes: typedTokens
      .slice(expectedTokens.length)
      .map((_, index) => expectedTokens.length + index),
    slotWidths,
    typedWordCount: typedTokens.length,
    expectedWordCount: expectedTokens.length,
    completion: expectedTokens.length ? Number((matchedCount / expectedTokens.length).toFixed(3)) : 0,
    isComplete:
      typedTokens.length > 0
      && acceptedTokenSets.some((tokens) => typedTokens.length >= tokens.length),
  };
}

export function buildEvaluationPreview(
  card: SentenceCard,
  evaluation: AnswerEvaluation,
  attemptAnswer: string,
): AttemptPreview {
  const writtenExpectedTokens = tokenizeWrittenAnswer(evaluation.acceptedAnswer);
  const writtenTypedTokens = tokenizeWrittenAnswer(attemptAnswer);
  const useScoringTokens =
    evaluation.normalizedExpected === evaluation.normalizedAttempt
    && writtenExpectedTokens.join(" ") !== writtenTypedTokens.join(" ");
  const tokenize = useScoringTokens ? tokenizeAnswer : tokenizeWrittenAnswer;
  const acceptedTokenSets = tokenSetsForCard(card, tokenize);
  const expectedTokens = tokenize(evaluation.acceptedAnswer);
  const typedTokens = tokenize(attemptAnswer);
  const matches = matchTokenIndexes(expectedTokens, typedTokens);
  const tokens: AttemptPreview["tokens"] = [];
  const extraTokens: string[] = [];
  const extraTokenIndexes: number[] = [];
  let expectedStart = 0;
  let typedStart = 0;

  for (const match of [
    ...matches,
    { expectedIndex: expectedTokens.length, actualIndex: typedTokens.length },
  ]) {
    const unmatchedExpected = expectedTokens.slice(expectedStart, match.expectedIndex);
    const unmatchedTyped = typedTokens.slice(typedStart, match.actualIndex);

    unmatchedExpected.forEach((expected, index) => {
      const typed = unmatchedTyped[index] ?? "";
      tokens.push({
        expected,
        typed,
        status: "mismatch",
        typedIndex: typed ? typedStart + index : null,
      });
    });
    unmatchedTyped.slice(unmatchedExpected.length).forEach((typed, index) => {
      extraTokens.push(typed);
      extraTokenIndexes.push(typedStart + unmatchedExpected.length + index);
    });

    if (match.expectedIndex < expectedTokens.length) {
      tokens.push({
        expected: expectedTokens[match.expectedIndex],
        typed: typedTokens[match.actualIndex],
        status: "matched",
        typedIndex: match.actualIndex,
      });
    }

    expectedStart = match.expectedIndex + 1;
    typedStart = match.actualIndex + 1;
  }

  const slotWidths = stableSlotWidths(acceptedTokenSets);
  while (tokens.length < slotWidths.length) {
    tokens.push({
      expected: "",
      typed: "",
      status: "empty",
      typedIndex: null,
    });
  }

  return {
    tokens,
    extraTokens,
    extraTokenIndexes,
    slotWidths,
    typedWordCount: typedTokens.length,
    expectedWordCount: expectedTokens.length,
    completion: evaluation.accuracy,
    isComplete: typedTokens.length > 0,
  };
}

export function buildCorrectionDraft(preview: AttemptPreview): CorrectionDraft {
  const draftTokens = preview.tokens
    .filter((token) => token.expected)
    .map((token) => token.status === "matched" ? token.typed : CORRECTION_SLOT_PLACEHOLDER);
  const answer = draftTokens.join(" ");
  const firstClearedOffset = answer.indexOf(CORRECTION_SLOT_PLACEHOLDER);

  if (firstClearedOffset >= 0) {
    return { answer, firstErrorOffset: firstClearedOffset };
  }

  const firstExtraIndex = preview.extraTokenIndexes[0];
  const nextSlotIndex = firstExtraIndex === undefined
    ? -1
    : preview.tokens.findIndex(
        (token) => token.typedIndex !== null && token.typedIndex > firstExtraIndex,
      );
  const firstErrorOffset = firstExtraIndex === undefined
    ? -1
    : nextSlotIndex < 0
      ? answer.length
      : nextSlotIndex === 0
        ? 0
        : draftTokens.slice(0, nextSlotIndex).join(" ").length + 1;

  return { answer, firstErrorOffset };
}

export function buildCorrectionPreview(
  card: SentenceCard,
  acceptedAnswer: string,
  draft: string,
): AttemptPreview {
  const acceptedTokenSets = tokenSetsForCard(card, tokenizeWrittenAnswer);
  const expectedTokens = tokenizeWrittenAnswer(acceptedAnswer);
  const draftTokens = tokenizeWrittenAnswer(draft);
  const firstEmptyIndex = expectedTokens.findIndex(
    (_, index) => !draftTokens[index] || draftTokens[index] === CORRECTION_SLOT_PLACEHOLDER,
  );
  const slotWidths = stableSlotWidths(acceptedTokenSets);
  const matchedCount = expectedTokens.reduce(
    (count, expected, index) => count + (draftTokens[index] === expected ? 1 : 0),
    0,
  );
  const tokens: AttemptPreview["tokens"] = expectedTokens.map((expected, index) => {
    const draftToken = draftTokens[index] ?? "";
    const isEmpty = !draftToken || draftToken === CORRECTION_SLOT_PLACEHOLDER;

    if (isEmpty) {
      return {
        expected: "",
        typed: "",
        status: index === firstEmptyIndex ? "active" : "empty",
        typedIndex: draftToken ? index : null,
      };
    }

    const isMatched = draftToken === expected;
    return {
      expected: isMatched ? expected : "",
      typed: draftToken,
      status: isMatched ? "matched" : "mismatch",
      typedIndex: index,
    };
  });

  while (tokens.length < slotWidths.length) {
    tokens.push({
      expected: "",
      typed: "",
      status: "empty",
      typedIndex: null,
    });
  }

  const extraTokenEntries = draftTokens
    .map((token, index) => ({ token, index }))
    .slice(expectedTokens.length)
    .filter(({ token }) => token !== CORRECTION_SLOT_PLACEHOLDER);

  return {
    tokens,
    extraTokens: extraTokenEntries.map(({ token }) => token),
    extraTokenIndexes: extraTokenEntries.map(({ index }) => index),
    slotWidths,
    typedWordCount: draftTokens.filter((token) => token !== CORRECTION_SLOT_PLACEHOLDER).length,
    expectedWordCount: expectedTokens.length,
    completion: expectedTokens.length
      ? Number((matchedCount / expectedTokens.length).toFixed(3))
      : 0,
    isComplete:
      draftTokens.length > 0
      && acceptedTokenSets.some((tokens) => draftTokens.length >= tokens.length)
      && !draftTokens.includes(CORRECTION_SLOT_PLACEHOLDER),
  };
}

function tokenSetsForCard(
  card: SentenceCard,
  tokenize: (answer: string) => string[],
): string[][] {
  const seen = new Set<string>();

  return [card.english, ...card.acceptableAnswers]
    .map(tokenize)
    .filter((tokens) => {
      const key = tokens.join(" ");
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function selectPreviewTokens(acceptedTokenSets: string[][], typedTokens: string[]): string[] {
  if (typedTokens.length === 0) {
    return acceptedTokenSets[0] ?? [];
  }

  return acceptedTokenSets.reduce((best, candidate) => {
    const bestScore = previewAnswerScore(best, typedTokens);
    const candidateScore = previewAnswerScore(candidate, typedTokens);
    return candidateScore > bestScore ? candidate : best;
  }, acceptedTokenSets[0] ?? []);
}

function previewAnswerScore(expectedTokens: string[], typedTokens: string[]): number {
  const matchedWords = matchTokenIndexes(expectedTokens, typedTokens).length;
  return matchedWords / Math.max(expectedTokens.length, typedTokens.length, 1);
}

function stableSlotWidths(acceptedTokenSets: string[][]): number[] {
  const slotCount = Math.max(...acceptedTokenSets.map((tokens) => tokens.length), 0);

  return Array.from({ length: slotCount }, (_, index) =>
    Math.max(...acceptedTokenSets.map((tokens) => tokens[index]?.length ?? 0), 1));
}
