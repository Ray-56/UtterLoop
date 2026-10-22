import type { SentenceCard } from "../content/SentenceCard";
import { inspectSentenceCardRecallSafety } from "../content/inspectSentenceCardRecallSafety";
import type { PracticeLogEntry } from "../practice/PracticeLogEntry";
import { evaluateAttempt } from "../practice/evaluateAttempt";
import type { StudioExercise } from "./LearningStudio";

export type WeaknessPatternId = "articles" | "for-since" | "be-agreement";
export interface ObservedLanguagePattern {
  id: WeaknessPatternId;
  title: string;
  description: string;
  distinctCards: number;
  observations: number;
  cardIds: string[];
}

const patterns: Record<WeaknessPatternId, Pick<ObservedLanguagePattern, "title" | "description">> = {
  articles: { title: "Check articles", description: "Articles were omitted in first submissions across different sentences. This is an observed pattern; typing slips can look similar." },
  "for-since": { title: "Check for and since", description: "For and since were swapped across different sentences. Review duration versus starting point." },
  "be-agreement": { title: "Check forms of be", description: "Is/are or was/were were swapped across different sentences. Check the subject before choosing a form." },
};

export function deriveLanguagePatterns(cards: readonly SentenceCard[], logs: readonly PracticeLogEntry[], now: Date): ObservedLanguagePattern[] {
  const cardById = new Map(cards.filter((card) => inspectSentenceCardRecallSafety(card).safe).map((card) => [card.id, card]));
  const observed = new Map<WeaknessPatternId, { cards: Set<string>; count: number }>();
  const seenTurns = new Set<string>();
  const oldest = now.getTime() - 30 * 24 * 60 * 60 * 1_000;
  for (const log of logs) {
    if (log.kind !== "attempt" || log.submissionIndex !== 0 || log.outcome === "perfect"
      || log.phase === "legacy" || log.phase === "corrective-practice" || log.phase === "first-exposure"
      || log.answerWasRevealed || log.supportLevelUsed > 0 || log.receivedCorrection) continue;
    const at = Date.parse(log.submittedAt);
    if (!Number.isFinite(at) || at < oldest || at > now.getTime() || seenTurns.has(log.turnId)) continue;
    seenTurns.add(log.turnId);
    const card = cardById.get(log.cardId);
    if (!card) continue;
    const evaluation = evaluateAttempt(card, {
      cardId: log.cardId, answer: log.answer, submittedAt: log.submittedAt,
      answerWasRevealed: log.answerWasRevealed, hadEdits: log.hadEdits,
      audioPlayCount: log.audioPlayCount, durationMs: log.durationMs,
    });
    if (evaluation.accuracy < 0.6) continue;
    const missing = evaluation.expectedWords.filter((word) => word.status === "missing").map((word) => word.value.toLowerCase().replace(/[^a-z]/g, ""));
    const extras = evaluation.extraWords.map((word) => word.value.toLowerCase().replace(/[^a-z]/g, ""));
    const ids: WeaknessPatternId[] = [];
    if (missing.some((word) => ["a", "an", "the"].includes(word)) && extras.length === 0) ids.push("articles");
    if ((missing.includes("for") && extras.includes("since")) || (missing.includes("since") && extras.includes("for"))) ids.push("for-since");
    if ([["is", "are"], ["are", "is"], ["was", "were"], ["were", "was"]].some(([expected, actual]) => missing.includes(expected) && extras.includes(actual))) ids.push("be-agreement");
    for (const id of ids) {
      const entry = observed.get(id) ?? { cards: new Set<string>(), count: 0 };
      entry.cards.add(log.cardId); entry.count++; observed.set(id, entry);
    }
  }
  return [...observed].filter(([, entry]) => entry.cards.size >= 2).map(([id, entry]) => ({
    id, ...patterns[id], distinctCards: entry.cards.size, observations: entry.count, cardIds: [...entry.cards].sort(),
  })).sort((left, right) => right.distinctCards - left.distinctCards || left.id.localeCompare(right.id));
}

export function buildWeaknessExercises(pattern: WeaknessPatternId): StudioExercise[] {
  const pairs: Record<WeaknessPatternId, Array<[string, string]>> = {
    articles: [
      ["练习单数可数名词前的限定词：说你需要一支笔。", "I need a pen."],
      ["练习元音读音前的限定词：说你需要一个例子。", "I need an example."],
      ["练习表示双方都知道的物品：请对方打开这扇窗。", "Please open the window."],
    ],
    "for-since": [
      ["持续时长：说你在这里住了两年。", "I've lived here for two years."],
      ["开始时间：说你从2024年起住在这里。", "I've lived here since 2024."],
      ["开始时间：说你从星期一起在这里工作。", "I've worked here since Monday."],
    ],
    "be-agreement": [
      ["描述一个文件的状态：这份文件准备好了。", "The file is ready."],
      ["描述多个文件的状态：这些文件准备好了。", "The files are ready."],
      ["描述昨天的多份文件：这些文件昨天准备好了。", "The files were ready yesterday."],
    ],
  };
  return pairs[pattern].map(([prompt, target], index) => ({
    id: `weakness:${pattern}:${index}`, prompt, target, acceptableAnswers: [], stage: "training",
  }));
}
