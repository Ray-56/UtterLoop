import type { SentenceCard } from "../content/SentenceCard";
import { inspectSentenceCardRecallSafety } from "../content/inspectSentenceCardRecallSafety";
import type { FluencyResult, PhysicalKeyAggregate } from "./LearningStudio";

export interface FluencyRecommendation {
  card: SentenceCard;
  isNewMaterial: boolean;
  matchingWeakKeys: string[];
}

export function deriveFluencyProgress(
  results: readonly FluencyResult[],
  learnedCards: readonly SentenceCard[],
  excludeCardId?: string,
) {
  const unique = [...new Map(results.map((result) => [result.id, result])).values()];
  const keys = new Map<string, PhysicalKeyAggregate>();
  const practiced = new Map<string, number>();
  for (const result of unique) {
    practiced.set(result.sourceCardId, (practiced.get(result.sourceCardId) ?? 0) + 1);
    for (const key of result.physicalKeys) {
      const current = keys.get(key.code) ?? { code: key.code, presses: 0, mismatches: 0 };
      current.presses += key.presses;
      current.mismatches += key.mismatches;
      keys.set(key.code, current);
    }
  }
  const physicalKeys = [...keys.values()].sort((left, right) => left.code.localeCompare(right.code));
  const weakKeys = physicalKeys.filter((key) => key.presses >= 3 && key.mismatches > 0)
    .sort((left, right) => right.mismatches / right.presses - left.mismatches / left.presses
      || right.mismatches - left.mismatches || left.code.localeCompare(right.code)).slice(0, 5);
  const cards = [...new Map(learnedCards.map((card) => [card.id, card])).values()];
  const recommendations: FluencyRecommendation[] = cards.filter((card) => (
    card.id !== excludeCardId && card.english.length <= 500 && inspectSentenceCardRecallSafety(card).safe
  )).map((card) => ({
    card,
    isNewMaterial: !practiced.has(card.id),
    matchingWeakKeys: weakKeys.filter((key) => physicalKeyCharacters(key.code)
      .some((character) => card.english.toLowerCase().includes(character))).map((key) => key.code),
  })).sort((left, right) => Number(right.isNewMaterial) - Number(left.isNewMaterial)
    || right.matchingWeakKeys.length - left.matchingWeakKeys.length
    || (practiced.get(left.card.id) ?? 0) - (practiced.get(right.card.id) ?? 0)
    || left.card.id.localeCompare(right.card.id)).slice(0, 3);
  return {
    passes: unique.length,
    distinctSentences: practiced.size,
    medianNetWpm: median(unique.map((result) => result.netWpm)),
    medianCharacterAccuracy: median(unique.map((result) => result.characterAccuracy)),
    backspaces: unique.reduce((sum, result) => sum + result.backspaces, 0),
    pauseCount: unique.reduce((sum, result) => sum + result.pauseCount, 0),
    physicalKeys,
    weakKeys,
    recommendations,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function physicalKeyCharacters(code: string): string[] {
  if (/^Key[A-Z]$/.test(code)) return [code.slice(3).toLowerCase()];
  if (/^Digit[0-9]$/.test(code)) return [code.slice(5)];
  return ({ Space: [" "], Quote: ["'", '"'], Comma: [",", "<"], Period: [".", ">"],
    Semicolon: [";", ":"], Slash: ["/", "?"], Minus: ["-", "_"], Equal: ["=", "+"],
    BracketLeft: ["[", "{"], BracketRight: ["]", "}"], Backslash: ["\\", "|"],
  } as Record<string, string[]>)[code] ?? [];
}
