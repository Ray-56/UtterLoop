import type { ContentLicense } from "./ContentLicense";

export type SentenceCardId = string;

export interface SentenceCard {
  id: SentenceCardId;
  english: string;
  prompt: string;
  note?: string;
  source: string;
  sourceUrl?: string;
  license?: ContentLicense;
  tags: string[];
  acceptableAnswers: string[];
  createdAt: string;
  updatedAt: string;
}
