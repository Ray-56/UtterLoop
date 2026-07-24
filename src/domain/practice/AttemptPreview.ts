export type AttemptPreviewStatus = "empty" | "active" | "matched" | "mismatch";

export interface AttemptPreviewToken {
  expected: string;
  typed: string;
  status: AttemptPreviewStatus;
  typedIndex: number | null;
}

export interface AttemptPreview {
  tokens: AttemptPreviewToken[];
  extraTokens: string[];
  extraTokenIndexes: number[];
  slotWidths: number[];
  typedWordCount: number;
  expectedWordCount: number;
  completion: number;
  isComplete: boolean;
}
