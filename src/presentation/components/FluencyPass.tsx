import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { FluencyResult } from "../../domain/studio/LearningStudio";
import { beginFluency, finishFluency, pauseFluency, resumeFluency, updateFluencyInput, type FluencyCapture } from "../../domain/studio/fluency";
import { createLocalId } from "../../application/createLocalId";
import { useKeyFeedback } from "../hooks/useKeyFeedback";
import { FluencyProgress, FluencyResultMetrics } from "./FluencyProgress";
import "./FluencyPass.css";

export interface FluencyPassProps {
  card: SentenceCard;
  source: FluencyResult["source"];
  onSave(result: FluencyResult): Promise<void>;
  onClose(): void;
  learnedCards?: readonly SentenceCard[];
  results?: readonly FluencyResult[];
  onStartCard?(card: SentenceCard): void;
  keySoundMuted?: boolean;
  onKeySoundMutedChange?(isMuted: boolean): Promise<unknown> | unknown;
}

export function FluencyPass(props: FluencyPassProps) {
  return <FluencyPassSession key={`${props.card.id}:${props.card.english}:${props.source}`} {...props} />;
}

function FluencyPassSession({ card, source, onSave, onClose, learnedCards = [], results = [], onStartCard,
  keySoundMuted, onKeySoundMutedChange }: FluencyPassProps) {
  const inputId = useId();
  const helpId = useId();
  const [capture, setCapture] = useState<FluencyCapture>(() => beginFluency({
    id: createLocalId("fluency"), sourceCardId: card.id, source, target: card.english,
  }));
  const captureRef = useRef(capture);
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<FluencyResult | null>(null);
  const resultRef = useRef<FluencyResult | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const composingRef = useRef(false);
  const physicalCodeRef = useRef<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedback = useKeyFeedback({ isMuted: keySoundMuted, onMutedChange: onKeySoundMutedChange });
  const paused = capture.pausedAt !== null;
  const words = buildFluencyWordTrack(card.english, draft, caret);

  const publishCapture = useCallback((next: FluencyCapture) => {
    captureRef.current = next;
    setCapture(next);
  }, []);

  const pause = useCallback((automatic = false) => {
    if (resultRef.current || captureRef.current.pausedAt !== null) return;
    publishCapture(pauseFluency(captureRef.current, performance.now()));
    physicalCodeRef.current = undefined;
    setNotice(automatic ? "Typing paused while this window was inactive. Resume when ready." : "Typing paused.");
  }, [publishCapture]);

  const resume = useCallback(() => {
    if (resultRef.current) return;
    publishCapture(resumeFluency(captureRef.current, performance.now()));
    setNotice(null);
    inputRef.current?.focus({ preventScroll: true });
  }, [publishCapture]);

  useEffect(() => {
    mountedRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
    const onBlur = () => pause(true);
    const onVisibility = () => { if (document.visibilityState === "hidden") pause(true); };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pause]);

  useEffect(() => {
    if (!result && !paused) inputRef.current?.focus({ preventScroll: true });
  }, [paused, result]);

  function acceptInput(value: string, code?: string) {
    if (resultRef.current || captureRef.current.pausedAt !== null) return;
    const previous = captureRef.current.input;
    publishCapture(updateFluencyInput(captureRef.current, value, performance.now(), code));
    setDraft(value);
    physicalCodeRef.current = undefined;
    if (value !== previous) feedback.triggerKeyFeedback(value.length < previous.length
      ? { type: "delete" } : { type: "append", value: value.slice(-1) });
  }

  async function save(measured: FluencyResult) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      await onSave(measured);
      if (mountedRef.current) setSaveState("saved");
    } catch {
      if (mountedRef.current) setSaveState("error");
    } finally {
      savingRef.current = false;
    }
  }

  function finish() {
    if (composingRef.current || resultRef.current || captureRef.current.pausedAt !== null) return;
    if (captureRef.current.firstInputAt === null) {
      setNotice("Type the visible sentence before finishing.");
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const measured = finishFluency(captureRef.current, performance.now(), new Date());
    resultRef.current = measured;
    setResult(measured);
    setNotice(null);
    feedback.triggerKeyFeedback({ type: "submit" });
    void save(measured);
  }

  function restart() {
    if (savingRef.current) return;
    resultRef.current = null;
    setResult(null);
    publishCapture(beginFluency({ id: createLocalId("fluency"), sourceCardId: card.id, source, target: card.english }));
    setDraft("");
    setCaret(0);
    setNotice(null);
    setSaveState("saved");
    inputRef.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const command = resolveFluencyKey({ key: event.key, ctrlKey: event.ctrlKey, altKey: event.altKey,
      metaKey: event.metaKey, isComposing: event.nativeEvent.isComposing || composingRef.current });
    if (command === "cancel") {
      event.preventDefault();
      if (!savingRef.current) onClose();
      return;
    }
    if (resultRef.current) return;
    if (command === "toggle-pause") {
      event.preventDefault();
      feedback.triggerKeyFeedback({ type: "toggle-pause" });
      if (captureRef.current.pausedAt !== null) resume(); else pause();
      return;
    }
    if (event.target !== inputRef.current) return;
    if (command === "finish") {
      event.preventDefault();
      finish();
      return;
    }
    physicalCodeRef.current = !event.ctrlKey && !event.altKey && !event.metaKey
      && !event.nativeEvent.isComposing && !composingRef.current ? event.code : undefined;
  }

  const rejectPaste = useCallback(() => {
    physicalCodeRef.current = undefined;
    setNotice("Paste and text replacement are disabled during timed typing. Type the visible sentence to measure a pass.");
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const beforeInput = (event: InputEvent) => {
      if (rejectsFluencyInsertion(event.inputType)) {
        event.preventDefault();
        rejectPaste();
      }
    };
    input.addEventListener("beforeinput", beforeInput);
    return () => input.removeEventListener("beforeinput", beforeInput);
  }, [rejectPaste, result]);

  return (
    <section className={`fluency-pass ${feedback.keyPulse > 0 ? `fluency-pulse-${feedback.keyPulse % 2 ? "odd" : "even"}` : ""}`}
      aria-labelledby={`${inputId}-title`} onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) pause(true);
      }}>
      <div className="fluency-heading">
        <div><p className="eyebrow">Optional typing practice</p><h1 id={`${inputId}-title`}>Fluency Pass</h1></div>
        <div className="fluency-controls">
          <button className="secondary-button" type="button" aria-pressed={!feedback.isSoundEnabled}
            onClick={feedback.toggleKeySound} aria-label={feedback.isSoundEnabled ? "Mute key sounds" : "Enable key sounds"}>
            {feedback.isSoundEnabled ? <Volume2 aria-hidden="true" size={18} /> : <VolumeX aria-hidden="true" size={18} />}
          </button>
          <button className="secondary-button" type="button" disabled={saveState === "saving"}
            onClick={onClose}><X aria-hidden="true" size={18} />{result
              ? saveState === "error" ? "Discard unsaved result" : "Return to learning" : "Cancel pass"}</button>
        </div>
      </div>
      <p className="muted-copy">The target is visible for typing practice. This pass does not change English recall, First Pass, or your Review schedule.</p>
      <p className="fluency-target" lang="en" aria-label="Visible typing target">{card.english}</p>

      {result ? (
        <>
          <FluencyPassResult result={result} saveState={saveState} onRetrySave={() => void save(result)}
            onRestart={restart} onClose={onClose} />
          <FluencyProgress results={saveState === "saved" ? [...results, result] : results}
            learnedCards={learnedCards} onStartCard={saveState === "saved" ? onStartCard : undefined} excludeCardId={card.id} />
        </>
      ) : (
        <>
          <p className="sr-only" id={helpId}>Type the visible English sentence in the word track. Timing starts with the first character. Enter finishes, Control plus P pauses or resumes, and Escape cancels. Paste is disabled.</p>
          <label className="sr-only" htmlFor={inputId}>Type the visible sentence for a Fluency Pass</label>
          <input id={inputId} ref={inputRef} className="fluency-input-capture" value={draft}
            type="text" inputMode="text" autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
            maxLength={1_000} readOnly={paused} aria-describedby={helpId}
            onChange={(event) => {
              setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
              if (composingRef.current || (event.nativeEvent as InputEvent).isComposing) {
                setDraft(event.currentTarget.value);
              } else acceptInput(event.currentTarget.value, physicalCodeRef.current);
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? draft.length)}
            onCompositionStart={() => { composingRef.current = true; physicalCodeRef.current = undefined; }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
              acceptInput(event.currentTarget.value);
            }}
            onPaste={(event) => { event.preventDefault(); rejectPaste(); }}
            onDrop={(event) => { event.preventDefault(); rejectPaste(); }} />
          <div className="fluency-word-track" aria-label="Your typed sentence" onClick={() => {
            if (!paused) inputRef.current?.focus({ preventScroll: true });
          }}>
            {words.map((word, index) => (
              <div className={`fluency-word fluency-word-${word.status}`} key={index}
                style={{ "--fluency-word-width": `${Math.max(word.expected.length, 3) + 1}ch` } as CSSProperties}>
                <small>{index + 1}</small><span>{word.typed || "\u00a0"}</span>
              </div>
            ))}
          </div>
          <div className="fluency-actions">
            <button className="secondary-button" type="button" onClick={() => paused ? resume() : pause()} aria-pressed={paused}>
              {paused ? <Play aria-hidden="true" size={18} /> : <Pause aria-hidden="true" size={18} />}
              {paused ? "Resume typing" : "Pause typing"}
            </button>
            <button className="primary-button" type="button" disabled={paused || capture.firstInputAt === null}
              onClick={finish}>Finish pass</button>
            <span>{capture.firstInputAt === null ? "Timer starts with your first character" : paused ? "Timer paused" : "Typing in progress"}</span>
          </div>
          <p className="fluency-shortcuts"><kbd>Enter</kbd> finish <kbd>Ctrl+P</kbd> pause/resume <kbd>Escape</kbd> cancel</p>
        </>
      )}
      <p className="fluency-notice" role="status" aria-live="polite">{notice ?? feedback.soundPreferenceError ?? ""}</p>
    </section>
  );
}

export function FluencyPassResult({ result, saveState, onRetrySave, onRestart, onClose }: {
  result: FluencyResult;
  saveState: "saving" | "saved" | "error";
  onRetrySave(): void;
  onRestart(): void;
  onClose(): void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);
  return <section className="fluency-result" aria-labelledby="fluency-result-title">
    <h2 id="fluency-result-title" ref={headingRef} tabIndex={-1}>Typing result</h2>
    <p className="sr-only" role="status">{result.netWpm.toFixed(1)} net words per minute, {Math.round(result.characterAccuracy * 100)} percent final character accuracy.</p>
    <FluencyResultMetrics result={result} />
    {saveState === "error" && <div className="fluency-save-error" role="alert">
      <p>Your typing result is still here. Retry saving this same pass.</p>
      <button className="primary-button" type="button" onClick={onRetrySave}>Retry save</button>
    </div>}
    <div className="fluency-actions">
      <button className="primary-button" type="button" disabled={saveState !== "saved"} onClick={onClose}>
        {saveState === "saving" ? "Saving result…" : "Return to learning"}
      </button>
      <button className="secondary-button" type="button" disabled={saveState !== "saved"} onClick={onRestart}>
        <RotateCcw aria-hidden="true" size={18} />Try again
      </button>
    </div>
  </section>;
}

export function resolveFluencyKey(event: {
  key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; isComposing: boolean;
}): "finish" | "toggle-pause" | "cancel" | null {
  if (event.isComposing || event.altKey || event.metaKey) return null;
  if (event.ctrlKey) return event.key.toLowerCase() === "p" ? "toggle-pause" : null;
  if (event.key === "Enter") return "finish";
  if (event.key === "Escape") return "cancel";
  return null;
}

export function rejectsFluencyInsertion(inputType: string | undefined): boolean {
  return ["insertFromPaste", "insertFromDrop", "insertReplacementText", "insertFromYank"].includes(inputType ?? "");
}

export function buildFluencyWordTrack(target: string, input: string, caret = input.length) {
  const expected = target.split(/\s+/);
  const typed = input.split(" ");
  const activeWord = input.slice(0, caret).split(" ").length - 1;
  return Array.from({ length: Math.max(expected.length, typed.length) }, (_, index) => ({
    expected: expected[index] ?? "",
    typed: typed[index] ?? "",
    status: index === activeWord ? "active" : !typed[index] ? "empty"
      : typed[index] === expected[index] ? "correct" : "incorrect",
  }));
}
