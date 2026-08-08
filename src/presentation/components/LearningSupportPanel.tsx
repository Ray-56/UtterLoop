import { BookOpenCheck } from "lucide-react";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import {
  hasCompleteGrammarTokenDetails,
  SentenceGrammarMap,
} from "./SentenceGrammarMap";

export type LearningSupportPanelMode = "first-exposure" | "recall" | "result";
export type LearningSupportLevel = 0 | 1 | 2 | 3 | 4;

export function shouldRecordAudioPlaybackAsRecallSupport(
  mode: LearningSupportPanelMode,
): boolean {
  return mode === "recall";
}

interface LearningSupportPanelProps {
  card: SentenceCard;
  disabled?: boolean;
  exposureStyle?: "full" | "abbreviated";
  mode: LearningSupportPanelMode;
  onStartRecall(): void;
  showAnswer?: boolean;
  suppressFullTarget?: boolean;
  supportLevel: LearningSupportLevel;
}

export function LearningSupportPanel({
  card,
  disabled = false,
  exposureStyle = "full",
  mode,
  onStartRecall,
  showAnswer = false,
  suppressFullTarget = false,
  supportLevel,
}: LearningSupportPanelProps) {
  const learningSupport = card.learningSupport;
  const showsStructuredStudy = mode !== "first-exposure" || exposureStyle === "full";
  const showsFullTarget = !suppressFullTarget
    && (mode !== "recall" || showAnswer);
  const tokenizedGrammarChunks = learningSupport
    && hasCompleteGrammarTokenDetails(learningSupport.grammar.chunks)
    ? learningSupport.grammar.chunks
    : null;
  const showsSentenceGrammarMap = Boolean(
    tokenizedGrammarChunks && showsStructuredStudy && showsFullTarget,
  );
  const showsPlainTargetFallback = showsFullTarget && !showsSentenceGrammarMap;

  return (
    <section
      aria-label={panelLabel(mode, supportLevel)}
      className={`learning-support learning-support-map-only learning-support-${mode}`}
    >
      <div className="learning-support-body">
        {showsSentenceGrammarMap && tokenizedGrammarChunks && (
          <SentenceGrammarMap chunks={tokenizedGrammarChunks} />
        )}

        {showsPlainTargetFallback && (
          <section className="learning-support-block learning-support-full-target">
            <span>{mode === "recall" ? "Answer" : "Target sentence"}</span>
            <strong>{card.english}</strong>
          </section>
        )}
      </div>

      {mode === "first-exposure" && (
        <footer className="learning-support-actions">
          <button
            className="primary-button"
            disabled={disabled}
            onClick={onStartRecall}
            type="button"
          >
            <BookOpenCheck aria-hidden="true" size={17} />
            Start recall
          </button>
        </footer>
      )}
    </section>
  );
}

function panelLabel(mode: LearningSupportPanelMode, level: LearningSupportLevel): string {
  if (mode === "first-exposure") {
    return "First exposure";
  }

  if (mode === "result") {
    return "Study the sentence";
  }

  return level === 0 ? "Independent recall" : `Guided recall · level ${level}`;
}
