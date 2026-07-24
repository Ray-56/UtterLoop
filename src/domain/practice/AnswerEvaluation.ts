export type EvaluationOutcome = "perfect" | "close" | "retry";

export interface WordMark {
  value: string;
  status: "matched" | "missing" | "extra";
}

export interface AnswerEvaluation {
  outcome: EvaluationOutcome;
  accuracy: number;
  matchedWords: number;
  totalWords: number;
  expectedWords: WordMark[];
  extraWords: WordMark[];
  acceptedAnswer: string;
  normalizedAttempt: string;
  normalizedExpected: string;
  message: string;
}
