import type { SentenceCard } from "../content/SentenceCard";
import type { AnswerEvaluation, EvaluationOutcome, WordMark } from "./AnswerEvaluation";
import type { PracticeAttempt } from "./PracticeAttempt";

const CONTRACTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bwon't\b/g, "will not"],
  [/\bcan't\b/g, "cannot"],
  [/\bi'm\b/g, "i am"],
  [/\bit's\b/g, "it is"],
  [/\bthat's\b/g, "that is"],
  [/\bthere's\b/g, "there is"],
  [/\bwhat's\b/g, "what is"],
  [/\bwho's\b/g, "who is"],
  [/\blet's\b/g, "let us"],
  [/\b([a-z]+)n't\b/g, "$1 not"],
  [/\b([a-z]+)'re\b/g, "$1 are"],
  [/\b([a-z]+)'ve\b/g, "$1 have"],
  [/\b([a-z]+)'ll\b/g, "$1 will"],
  [/\b([a-z]+)'d\b/g, "$1 would"],
];

export function normalizeAnswer(value: string): string {
  const lower = value.toLowerCase().replace(/[’]/g, "'");
  const expanded = CONTRACTION_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    lower,
  );

  return normalizeWrittenAnswer(expanded)
    .replace(/[']/g, "");
}

function normalizeWrittenAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?;:"()[\]{}]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeAnswer(value: string): string[] {
  const normalized = normalizeAnswer(value);
  return normalized ? normalized.split(" ") : [];
}

export function tokenizeWrittenAnswer(value: string): string[] {
  const normalized = normalizeWrittenAnswer(value);
  return normalized ? normalized.split(" ") : [];
}

export function evaluateAttempt(card: SentenceCard, attempt: PracticeAttempt): AnswerEvaluation {
  const acceptedAnswers = uniqueAnswers([card.english, ...card.acceptableAnswers]);
  const scoredAnswers = acceptedAnswers.map((answer) => scoreAgainst(answer, attempt.answer));
  const best = scoredAnswers.sort((a, b) => b.accuracy - a.accuracy)[0];
  const outcome = classifyOutcome(best.accuracy, best.normalizedExpected, best.normalizedAttempt);

  return {
    outcome,
    accuracy: best.accuracy,
    matchedWords: best.matchedWords,
    totalWords: Math.max(best.expectedTokens.length, best.actualTokens.length),
    expectedWords: best.expectedWords,
    extraWords: best.extraWords,
    acceptedAnswer: best.acceptedAnswer,
    normalizedAttempt: best.normalizedAttempt,
    normalizedExpected: best.normalizedExpected,
    message: messageForOutcome(outcome),
  };
}

function uniqueAnswers(answers: string[]): string[] {
  const seen = new Set<string>();
  return answers.filter((answer) => {
    const normalized = normalizeAnswer(answer);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function classifyOutcome(
  accuracy: number,
  normalizedExpected: string,
  normalizedAttempt: string,
): EvaluationOutcome {
  if (normalizedExpected === normalizedAttempt) {
    return "perfect";
  }

  if (accuracy >= 0.72) {
    return "close";
  }

  return "retry";
}

function messageForOutcome(outcome: EvaluationOutcome): string {
  switch (outcome) {
    case "perfect":
      return "Clean recall. Push it further out.";
    case "close":
      return "Close enough to learn from. Tighten the missing words.";
    case "retry":
      return "Bring it back soon. The sentence is not retrievable yet.";
  }
}

interface ScoredAnswer {
  acceptedAnswer: string;
  normalizedExpected: string;
  normalizedAttempt: string;
  expectedTokens: string[];
  actualTokens: string[];
  expectedWords: WordMark[];
  extraWords: WordMark[];
  matchedWords: number;
  accuracy: number;
}

function scoreAgainst(acceptedAnswer: string, attempt: string): ScoredAnswer {
  const expectedTokens = tokenizeAnswer(acceptedAnswer);
  const actualTokens = tokenizeAnswer(attempt);
  const matches = matchTokenIndexes(expectedTokens, actualTokens);
  const matchedExpectedIndexes = new Set(matches.map((match) => match.expectedIndex));
  const matchedActualIndexes = new Set(matches.map((match) => match.actualIndex));
  const matchedWords = matches.length;
  const denominator = Math.max(expectedTokens.length, actualTokens.length, 1);

  return {
    acceptedAnswer,
    normalizedExpected: normalizeAnswer(acceptedAnswer),
    normalizedAttempt: normalizeAnswer(attempt),
    expectedTokens,
    actualTokens,
    expectedWords: expectedTokens.map((value, index) => ({
      value,
      status: matchedExpectedIndexes.has(index) ? "matched" : "missing",
    })),
    extraWords: actualTokens
      .map<WordMark>((value, index) => ({
        value,
        status: matchedActualIndexes.has(index) ? "matched" : "extra",
      }))
      .filter((word) => word.status === "extra"),
    matchedWords,
    accuracy: Number((matchedWords / denominator).toFixed(3)),
  };
}

export interface TokenMatch {
  expectedIndex: number;
  actualIndex: number;
}

export function matchTokenIndexes(expected: string[], actual: string[]): TokenMatch[] {
  const matrix = Array.from({ length: expected.length + 1 }, () =>
    Array.from({ length: actual.length + 1 }, () => 0),
  );

  for (let expectedIndex = expected.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let actualIndex = actual.length - 1; actualIndex >= 0; actualIndex -= 1) {
      matrix[expectedIndex][actualIndex] =
        expected[expectedIndex] === actual[actualIndex]
          ? matrix[expectedIndex + 1][actualIndex + 1] + 1
          : Math.max(matrix[expectedIndex + 1][actualIndex], matrix[expectedIndex][actualIndex + 1]);
    }
  }

  const matches: TokenMatch[] = [];
  let expectedIndex = 0;
  let actualIndex = 0;

  while (expectedIndex < expected.length && actualIndex < actual.length) {
    if (expected[expectedIndex] === actual[actualIndex]) {
      matches.push({ expectedIndex, actualIndex });
      expectedIndex += 1;
      actualIndex += 1;
    } else if (matrix[expectedIndex + 1][actualIndex] >= matrix[expectedIndex][actualIndex + 1]) {
      expectedIndex += 1;
    } else {
      actualIndex += 1;
    }
  }

  return matches;
}
