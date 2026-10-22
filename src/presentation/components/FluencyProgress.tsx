import type { SentenceCard } from "../../domain/content/SentenceCard";
import { deriveFluencyProgress } from "../../domain/studio/fluencyProgress";
import type { FluencyResult } from "../../domain/studio/LearningStudio";
import "./FluencyPass.css";

export interface FluencyProgressProps {
  results: readonly FluencyResult[];
  learnedCards: readonly SentenceCard[];
  onStartCard?(card: SentenceCard): void;
  excludeCardId?: string;
}

const keyboardRows = [
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
  ["Minus", "Equal", "BracketLeft", "BracketRight", "Backslash", "Space"],
];

export function FluencyProgress({ results, learnedCards, onStartCard, excludeCardId }: FluencyProgressProps) {
  const progress = deriveFluencyProgress(results, learnedCards, excludeCardId);
  const keyByCode = new Map(progress.physicalKeys.map((key) => [key.code, key]));
  return (
    <section className="fluency-progress" aria-labelledby="fluency-progress-title">
      <div className="fluency-heading">
        <div>
          <p className="eyebrow">Typing evidence</p>
          <h2 id="fluency-progress-title">Fluency progress</h2>
        </div>
        <span>{progress.passes} {progress.passes === 1 ? "pass" : "passes"} · {progress.distinctSentences} {progress.distinctSentences === 1 ? "sentence" : "sentences"}</span>
      </div>
      <p className="muted-copy">Visible-target typing has its own results. English recall and Review scheduling stay separate.</p>
      <dl className="fluency-metrics">
        <Metric label="Median net WPM" value={progress.medianNetWpm === null ? "Not measured" : progress.medianNetWpm.toFixed(1)} />
        <Metric label="Median final character accuracy" value={progress.medianCharacterAccuracy === null ? "Not measured" : percent(progress.medianCharacterAccuracy)} />
        <Metric label="Backspace presses" value={String(progress.backspaces)} />
        <Metric label="Typing gaps of 2+ seconds" value={String(progress.pauseCount)} />
      </dl>
      <h3>Physical-key heatmap</h3>
      <p className="muted-copy">US ANSI labels describe key positions. Counts show observed presses and mismatches; they do not detect fingers or your active keyboard layout.</p>
      <div className="fluency-keyboard" aria-label="Observed physical-key presses and mismatches">
        {keyboardRows.map((row, index) => (
          <div className="fluency-keyboard-row" key={index}>
            {row.map((code) => {
              const key = keyByCode.get(code);
              const tone = !key ? "unobserved" : key.mismatches ? "mismatch" : "clean";
              return (
                <div className={`fluency-physical-key fluency-physical-key-${tone}`} key={code}
                  aria-label={`${keyLabel(code)}: ${key?.presses ?? 0} presses, ${key?.mismatches ?? 0} mismatches`}>
                  <strong>{keyLabel(code)}</strong>
                  <small>{key ? `${key.presses} / ${key.mismatches}` : "—"}</small>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="muted-copy">Each sampled key shows presses / mismatches. Unsampled keys remain unmeasured; composed and software-keyboard input may provide no physical-key evidence.</p>
      {progress.weakKeys.length > 0 ? (
        <p>Keys to revisit: {progress.weakKeys.map((key) => `${keyLabel(key.code)} (${key.mismatches}/${key.presses})`).join(" · ")}. Each has at least three observed presses.</p>
      ) : <p className="muted-copy">More observed key presses are needed before suggesting weak keys.</p>}

      <h3>Try another learned sentence</h3>
      <p className="muted-copy">Different acquired material helps check whether typing carries over. These suggestions do not claim a learning improvement.</p>
      {progress.recommendations.length > 0 ? (
        <ul className="fluency-recommendations">
          {progress.recommendations.map((item) => (
            <li key={item.card.id}>
              <div>
                <strong>{item.card.prompt}</strong>
                <small>{item.isNewMaterial ? "Not previously used in a Fluency Pass" : "Previously practiced"}
                  {item.matchingWeakKeys.length > 0 && ` · Includes ${item.matchingWeakKeys.map(keyLabel).join(", ")}`}</small>
              </div>
              {onStartCard && <button className="secondary-button" type="button" onClick={() => onStartCard(item.card)}>Start typing pass</button>}
            </li>
          ))}
        </ul>
      ) : <p className="muted-copy">Acquire another sentence to unlock different material here.</p>}
    </section>
  );
}

export function FluencyResultMetrics({ result }: { result: FluencyResult }) {
  return (
    <>
      <dl className="fluency-metrics">
        <Metric label="Net WPM" value={result.netWpm.toFixed(1)} />
        <Metric label="Final character accuracy" value={percent(result.characterAccuracy)} />
        <Metric label="Backspace presses" value={String(result.backspaces)} />
        <Metric label="Typing gaps of 2+ seconds" value={String(result.pauseCount)} />
        <Metric label="Active typing time" value={`${(result.activeDurationMs / 1_000).toFixed(1)}s`} />
        <Metric label="Longest between-input gap" value={`${(result.longestPauseMs / 1_000).toFixed(1)}s`} />
      </dl>
      <p className="muted-copy">Net WPM uses five characters per word and subtracts final character errors. Final character accuracy compares your submitted text with the whole target after edits. Timing starts with your first character and excludes paused time.</p>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function percent(value: number): string { return `${Math.round(value * 100)}%`; }

export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return ({ Space: "Space", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  } as Record<string, string>)[code] ?? code;
}
