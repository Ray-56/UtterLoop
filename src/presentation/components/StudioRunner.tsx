import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, BookmarkPlus, CheckCheck, ChevronLeft, CornerDownLeft, Eye, EyeOff, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { StudioCheckpoint, StudioExercise } from "../../domain/studio/LearningStudio";
import { exerciseCard } from "../../domain/studio/studioRules";
import { buildAttemptPreview, buildCorrectionDraft, CORRECTION_SLOT_PLACEHOLDER } from "../../domain/practice/buildAttemptPreview";
import { resolveCorrectionSpaceNavigation, stabilizeCorrectionDraft } from "../keyboard/resolvePracticeKey";
import type { LearningStudioController } from "../hooks/useLearningStudio";
import { useKeyFeedback } from "../hooks/useKeyFeedback";

export function StudioRunner({ initialCheckpoint, exercises, studio, onLeave, keySoundMuted, onMutedChange,
  catalogCardIds, masteredCardIds, vocabularyCardIds, onMasterCard, onVocabularyCard, onCatalogSignal }: {
  initialCheckpoint: StudioCheckpoint; exercises: StudioExercise[]; studio: LearningStudioController;
  onLeave(): void; keySoundMuted: boolean; onMutedChange(muted: boolean): Promise<unknown>;
  catalogCardIds: ReadonlySet<string>; masteredCardIds: ReadonlySet<string>; vocabularyCardIds: ReadonlySet<string>;
  onMasterCard?(cardId: string): Promise<unknown>; onVocabularyCard?(cardId: string, isSaved: boolean): Promise<unknown>;
  onCatalogSignal?(checkpoint: StudioCheckpoint, exercise: StudioExercise, kind: "revealed" | "skipped"): Promise<unknown>;
}) {
  const [checkpoint, setCheckpoint] = useState(initialCheckpoint);
  const [answerVisible, setAnswerVisible] = useState(initialCheckpoint.answerWasRevealed);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(checkpoint); latest.current = checkpoint;
  const isFinished = useRef(finished); isFinished.current = finished;
  const itemStartedAt = useRef(Date.now());
  const composing = useRef(false);
  const visited = useRef(new Map<number, StudioCheckpoint>());
  visited.current.set(checkpoint.index, checkpoint);
  const masteredHere = useRef(new Set<string>());
  const sounds = useKeyFeedback({ isMuted: keySoundMuted, onMutedChange });
  const exercise = exercises[checkpoint.index];
  const card = useMemo(() => exerciseCard(exercise), [exercise]);
  const preview = useMemo(() => buildAttemptPreview(card, checkpoint.draft), [card, checkpoint.draft]);
  const results = useMemo(() => studio.document?.attempts.filter((attempt) => attempt.sessionId === checkpoint.sessionId) ?? [],
    [studio.document?.attempts, checkpoint.sessionId]);
  const lastResult = useMemo(() => results.filter((attempt) => attempt.exerciseId === exercise.id).at(-1), [results, exercise.id]);
  const sourceId = exercise.sourceCardId && catalogCardIds.has(exercise.sourceCardId) ? exercise.sourceCardId : null;
  const vocabularySaved = Boolean(sourceId && vocabularyCardIds.has(sourceId));
  const isMastered = (item: StudioExercise) => Boolean(item.sourceCardId
    && (masteredCardIds.has(item.sourceCardId) || masteredHere.current.has(item.sourceCardId)));
  const previousIndex = exercises.findLastIndex((item, index) => index < checkpoint.index && !isMastered(item));

  useEffect(() => {
    if (finished) return;
    const timer = window.setTimeout(() => {
      void studio.run((service) => service.saveCheckpoint(checkpoint), true).catch(() => undefined);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [checkpoint, studio.run, finished]);

  // Restore the committed caret before new input; a later frame can select a newly typed character.
  useLayoutEffect(() => {
    if (checkpoint.phase === "recall" && !paused && !busy && !composing.current) {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.setSelectionRange(checkpoint.selectionStart ?? checkpoint.draft.length, checkpoint.selectionEnd ?? checkpoint.draft.length);
    }
  }, [checkpoint.phase, checkpoint.index, checkpoint.draft, checkpoint.selectionStart, checkpoint.selectionEnd, paused, busy]);

  useEffect(() => {
    const persist = () => {
      if (!isFinished.current) {
        void studio.run((service) => service.saveCheckpoint(latest.current), true).catch(() => undefined);
      }
    };
    const hide = () => { if (document.visibilityState === "hidden") persist(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", persist);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [studio.run]);

  function update(patch: Partial<StudioCheckpoint>) {
    setCheckpoint((current) => ({ ...current, ...patch, revision: current.revision + 1, updatedAt: new Date().toISOString() }));
  }

  async function submit() {
    if (busy || paused || composing.current || checkpoint.phase !== "recall") return;
    if (!preview.isComplete) { setNotice("Complete the word track before checking."); sounds.triggerKeyFeedback({ type: "incomplete" }); return; }
    setBusy(true); setNotice(null); sounds.triggerKeyFeedback({ type: "submit" });
    try {
      const next = await studio.run((service) => service.submit({
        id: `${checkpoint.sessionId}:${checkpoint.index}:${checkpoint.submissionCount}`,
        checkpoint, exercise, answer: checkpoint.draft,
        durationMs: Math.max(0, Date.now() - itemStartedAt.current),
      }));
      if (next.checkpoint) setCheckpoint(next.checkpoint);
      setAnswerVisible(false);
    } catch { setNotice("Your answer is still here. Retry saving this check."); }
    finally { setBusy(false); }
  }

  async function advance(from = checkpoint) {
    if (busy) return;
    sounds.triggerKeyFeedback({ type: "next" });
    setBusy(true);
    try {
      let nextIndex = from.index + 1;
      while (nextIndex < exercises.length && isMastered(exercises[nextIndex])) nextIndex++;
      if (nextIndex === exercises.length) {
        await studio.run((service) => service.finishSession(from.sessionId));
        setFinished(true);
      } else {
        const nextExercise = exercises[nextIndex];
        const personal = studio.document?.personalSentences.find((sentence) => sentence.id === nextExercise.id);
        const restored = visited.current.get(nextIndex);
        const next: StudioCheckpoint = { ...from, ...restored, revision: from.revision + 1, index: nextIndex,
          phase: nextExercise.stage === "held-out" || from.activity === "context"
            || (from.activity === "personal" && personal?.learningState.acquisitionStatus !== "needs-guided") ? "recall" : "instruction",
          draft: "", selectionStart: 0, selectionEnd: 0, answerWasRevealed: false, submissionCount: 0, updatedAt: new Date().toISOString(),
        };
        if (restored) Object.assign(next, { phase: restored.phase, draft: restored.draft,
          selectionStart: restored.selectionStart, selectionEnd: restored.selectionEnd,
          submissionCount: restored.submissionCount, answerWasRevealed: true });
        await studio.run((service) => service.saveCheckpoint(next));
        setCheckpoint(next); setAnswerVisible(false); setNotice(null); itemStartedAt.current = Date.now();
      }
    } catch { setNotice("The next step could not be saved. Retry while your current result stays here."); }
    finally { setBusy(false); }
  }

  async function previous() {
    if (busy || paused || previousIndex < 0) return;
    setBusy(true); sounds.triggerKeyFeedback({ type: "previous" });
    const previousExercise = exercises[previousIndex];
    const restored = visited.current.get(previousIndex);
    const count = results.filter((attempt) => attempt.exerciseId === previousExercise.id).length;
    const next: StudioCheckpoint = { ...checkpoint, ...restored, revision: checkpoint.revision + 1,
      index: previousIndex, phase: restored?.phase ?? "recall", draft: restored?.draft ?? "",
      selectionStart: restored?.selectionStart ?? 0, selectionEnd: restored?.selectionEnd ?? 0,
      submissionCount: Math.max(count, restored?.submissionCount ?? 0), answerWasRevealed: true,
      updatedAt: new Date().toISOString() };
    try {
      await studio.run((service) => service.saveCheckpoint(next));
      setCheckpoint(next); setAnswerVisible(false); setNotice("Revisited expressions count as supported practice.");
      itemStartedAt.current = Date.now();
    } catch { setNotice("The previous expression could not be saved. Retry while your current draft stays here."); }
    finally { setBusy(false); }
  }

  async function master() {
    if (busy || paused || !sourceId || !onMasterCard) return;
    setBusy(true); sounds.triggerKeyFeedback({ type: "mark-mastered" });
    try {
      await onMasterCard(sourceId);
      masteredHere.current.add(sourceId);
      setBusy(false);
      await advance();
    } catch { setBusy(false); setNotice("Master status could not be saved. Retry before leaving this expression."); }
  }

  async function vocabulary() {
    if (busy || paused || !sourceId || !onVocabularyCard) return;
    setBusy(true); sounds.triggerKeyFeedback({ type: "toggle-vocabulary" });
    try { await onVocabularyCard(sourceId, !vocabularySaved); setNotice(vocabularySaved ? "Removed from Vocabulary." : "Saved to Vocabulary."); }
    catch { setNotice("Vocabulary could not be saved. Retry while your draft stays here."); }
    finally { setBusy(false); }
  }

  async function reveal() {
    if (busy || paused || checkpoint.phase === "instruction") return;
    sounds.triggerKeyFeedback({ type: "toggle-answer" });
    if (answerVisible) { setAnswerVisible(false); return; }
    if (checkpoint.answerWasRevealed) { setAnswerVisible(true); return; }
    setBusy(true);
    try {
      if (sourceId) await onCatalogSignal?.(checkpoint, exercise, "revealed");
      const next = await studio.run((service) => service.recordSignal(checkpoint, "revealed"));
      if (next.checkpoint) setCheckpoint(next.checkpoint);
      setAnswerVisible(true);
    } catch { setNotice("Answer support could not be recorded. Retry before showing the answer."); }
    finally { setBusy(false); }
  }

  function retry() {
    if (busy || paused) return;
    sounds.triggerKeyFeedback({ type: "retry" });
    const correction = lastResult?.outcome === "perfect" ? { answer: "", firstErrorOffset: 0 } : buildCorrectionDraft(preview);
    update({ phase: "recall", draft: correction.answer, selectionStart: correction.firstErrorOffset,
      selectionEnd: correction.firstErrorOffset + (correction.answer ? 1 : 0), answerWasRevealed: true });
    setAnswerVisible(false); setNotice("Edit the cleared word slots, then check again. This is a supported retry.");
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    try {
      if (sourceId) await onCatalogSignal?.(checkpoint, exercise, "skipped");
      const next = await studio.run((service) => service.recordSignal(checkpoint, "skipped")); setBusy(false); await advance(next.checkpoint ?? checkpoint);
    }
    catch { setBusy(false); setNotice("Skip could not be saved. Retry before leaving this expression."); }
  }

  async function playAudio() {
    if (busy || paused) return;
    if (!("speechSynthesis" in window)) { setNotice("Sentence audio is unavailable in this browser."); return; }
    if (checkpoint.phase === "recall" && !checkpoint.answerWasRevealed) {
      setBusy(true);
      try {
        if (sourceId) await onCatalogSignal?.(checkpoint, exercise, "revealed");
        const next = await studio.run((service) => service.recordSignal(checkpoint, "revealed"));
        if (next.checkpoint) setCheckpoint(next.checkpoint);
      } catch { setNotice("Audio support could not be recorded. Retry to play this sentence."); return; }
      finally { setBusy(false); }
    }
    sounds.triggerKeyFeedback({ type: "play-audio" });
    window.speechSynthesis.cancel();
    for (let copy = 0; copy < 2; copy++) {
      const utterance = new SpeechSynthesisUtterance(exercise.target); utterance.lang = "en-US";
      utterance.onerror = () => setNotice("Sentence audio could not be played.");
      window.speechSynthesis.speak(utterance);
    }
  }

  function togglePause() {
    if (busy) return;
    setPaused((value) => !value); sounds.triggerKeyFeedback({ type: "toggle-pause" });
  }

  const handlers = useRef({ submit, advance, previous, master, vocabulary, retry, reveal, skip, playAudio, togglePause, paused, phase: checkpoint.phase, perfect: lastResult?.outcome === "perfect" });
  handlers.current = { submit, advance, previous, master, vocabulary, retry, reveal, skip, playAudio, togglePause, paused, phase: checkpoint.phase, perfect: lastResult?.outcome === "perfect" };
  useEffect(() => {
    function command(event: globalThis.KeyboardEvent) {
      if (event.isComposing || composing.current || finished) return;
      const current = handlers.current;
      if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        if (event.code === "Quote") { event.preventDefault(); void current.playAudio(); }
        else if (event.code === "Semicolon") { event.preventDefault(); current.phase === "result" ? current.retry() : void current.reveal(); }
        else if (event.key.toLowerCase() === "p") { event.preventDefault(); current.togglePause(); }
        else if (event.key.toLowerCase() === "m") { event.preventDefault(); void current.master(); }
        else if (event.key.toLowerCase() === "n") { event.preventDefault(); void current.vocabulary(); }
        return;
      }
      if (current.paused) return;
      if (event.shiftKey && event.key === "ArrowLeft") { event.preventDefault(); void current.previous(); }
      if (event.shiftKey && event.key === "ArrowRight") { event.preventDefault(); void current.skip(); }
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (event.target instanceof HTMLElement && event.target.closest("button, a, select")) return;
        event.preventDefault();
        if (current.phase === "result") current.perfect ? void current.advance() : current.retry();
        else if (current.phase === "instruction") { update({ phase: "recall" }); itemStartedAt.current = Date.now(); }
        else void current.submit();
      }
    }
    document.addEventListener("keydown", command);
    return () => document.removeEventListener("keydown", command);
  }, [finished]);

  function nativeKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || composing.current) return;
    if (event.key === "Escape") { event.preventDefault(); update({ draft: "", selectionStart: 0, selectionEnd: 0 }); sounds.triggerKeyFeedback({ type: "clear" }); }
    if (event.key === " " && checkpoint.draft.includes(CORRECTION_SLOT_PLACEHOLDER)) {
      const navigation = resolveCorrectionSpaceNavigation(checkpoint.draft, event.currentTarget.selectionEnd);
      if (navigation) { event.preventDefault(); event.currentTarget.setSelectionRange(navigation.selectionStart, navigation.selectionEnd); }
    }
  }

  if (finished) return <section className="center-panel" aria-live="polite"><h3>Studio round complete</h3>
    <p>{results.filter((attempt) => attempt.outcome === "perfect").length} perfect submissions · {exercises.length} expressions in this round</p>
    <p>Your Studio evidence was saved separately from Course and scheduled Review results.</p>
    <button className="primary-button" onClick={onLeave} type="button">Back to Learning Studio</button></section>;

  return <section className={`studio-runner studio-pulse-${sounds.keyPulse % 2 ? "odd" : "even"} ${paused ? "is-paused" : ""}`} aria-labelledby="studio-runner-title">
    <header className="studio-runner-top"><button className="secondary-button" onClick={async () => { try { await studio.run((service) => service.saveCheckpoint(checkpoint)); onLeave(); } catch { setNotice("Keep this session open and retry saving before leaving."); } }} type="button"><ArrowLeft aria-hidden="true" size={16} />Save and leave</button>
      <h3 id="studio-runner-title">{checkpoint.activity} practice</h3><span>{checkpoint.index + 1} / {exercises.length}</span>
      <button aria-label={sounds.isSoundEnabled ? "Mute key sounds" : "Enable key sounds"} className="icon-button" onClick={sounds.toggleKeySound} type="button">{sounds.isSoundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
    </header>
    <div className="studio-runner-status"><p className="eyebrow">{exercise.stage === "held-out" ? "Transfer check · specified expression" : checkpoint.phase === "instruction" ? "First exposure" : "Practice · separate evidence"}</p>
      <p>{exercise.prompt}</p><p className="sr-only" id="studio-input-help">Type the taught expression in the word track. Enter checks or continues; Control semicolon reveals the answer; Control quote plays audio; Control P pauses. Shift Left returns and Shift Right skips. Course Master and Vocabulary actions apply to linked Course sentences.</p>
    </div>
    <div className="studio-answer" aria-live="polite">{checkpoint.phase === "instruction" || checkpoint.phase === "result" || answerVisible ? <><span>{checkpoint.phase === "instruction" ? "Learn this expression" : "Reference expression"}</span><strong>{exercise.target}</strong></> : null}</div>
    {checkpoint.phase === "instruction" ? <div className="studio-instruction"><p>Read and understand the reference expression. Then hide it and rebuild it in the word track.</p><button className="primary-button" disabled={busy} onClick={() => { update({ phase: "recall" }); itemStartedAt.current = Date.now(); }} type="button">Start recall</button></div>
      : <div className="studio-word-track" role="group" aria-label="Sentence word track" tabIndex={0} onClick={() => inputRef.current?.focus()}>
        {preview.tokens.map((token, index) => <span key={index} className={`studio-word studio-word-${token.status} ${sounds.keyPulse ? "has-key-pulse" : ""}`} style={{ minWidth: `${Math.max(3, Math.min(18, preview.slotWidths[index] ?? 4))}ch` }}><span aria-hidden="true">{token.typed.replaceAll(CORRECTION_SLOT_PLACEHOLDER, "") || "\u00a0"}</span><span className="sr-only">{token.typed.replaceAll(CORRECTION_SLOT_PLACEHOLDER, "") || "Empty word"}</span></span>)}
        {preview.extraTokens.map((token, index) => <span className="studio-word studio-word-mismatch" key={`extra-${index}`}>{token}</span>)}
        <textarea aria-describedby="studio-input-help" aria-label="Studio sentence input" autoCapitalize="off" autoComplete="off" autoCorrect="off" className="practice-input-capture" disabled={busy || paused || checkpoint.phase !== "recall"} maxLength={1000} onKeyDown={nativeKey}
          onSelect={(event) => {
            if (checkpoint.phase === "recall" && (event.currentTarget.selectionStart !== checkpoint.selectionStart || event.currentTarget.selectionEnd !== checkpoint.selectionEnd)) {
              update({ selectionStart: event.currentTarget.selectionStart, selectionEnd: event.currentTarget.selectionEnd });
            }
          }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onChange={(event) => {
            let draft = event.target.value;
            let selectionStart = event.target.selectionStart;
            let selectionEnd = event.target.selectionEnd;
            if (checkpoint.draft.includes(CORRECTION_SLOT_PLACEHOLDER) && !composing.current) {
              const stable = stabilizeCorrectionDraft(checkpoint.draft, draft, event.target.selectionEnd);
              draft = stable.answer;
              selectionStart = stable.selectionStart; selectionEnd = stable.selectionEnd;
            }
            sounds.triggerKeyFeedback(draft.length < checkpoint.draft.length ? { type: "delete" } : { type: "append", value: draft.endsWith(" ") ? " " : draft.at(-1) ?? "" });
            update({ draft, selectionStart, selectionEnd });
          }} ref={inputRef} rows={1} spellCheck={false} value={checkpoint.draft} />
      </div>}
    <div className="studio-result" aria-live="polite">{checkpoint.phase === "result" && lastResult && <p><strong>{lastResult.outcome === "perfect" ? "Expression recalled." : "Check the reference and try the cleared words again."}</strong> {Math.round(lastResult.accuracy * 100)}% word accuracy · {lastResult.answerWasRevealed || !lastResult.firstSubmission ? "Supported or repeated" : "First submission"}</p>}
      {(notice || studio.error || sounds.soundPreferenceError) && <p role="alert">{notice ?? studio.error ?? sounds.soundPreferenceError}</p>}
      {studio.error && <button className="secondary-button" disabled={busy} onClick={() => void studio.run((service) => service.saveCheckpoint(checkpoint)).catch(() => undefined)} type="button">Retry draft save</button>}
    </div>
    <div className="studio-session-actions"><button aria-label="Previous expression, shortcut Shift plus Left Arrow" className="secondary-button" disabled={busy || paused || previousIndex < 0} onClick={() => void previous()} type="button"><ChevronLeft aria-hidden="true" size={16} /></button><button className="secondary-button" disabled={busy} onClick={togglePause} type="button">{paused ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}{paused ? "Resume" : "Pause"}</button><button className="secondary-button" disabled={busy || paused} onClick={() => void skip()} type="button">Skip expression</button></div>
    <div className="studio-shortcuts" aria-label="Practice shortcuts">
      <button disabled={busy || paused} onClick={() => void playAudio()} type="button"><Volume2 aria-hidden="true" size={16} /><kbd>Ctrl+'</kbd><span>Audio</span></button>
      <button aria-label={sourceId ? "Master Course sentence, shortcut Control plus M" : "Master requires a linked Course sentence"} disabled={busy || paused || !sourceId || !onMasterCard} onClick={() => void master()} type="button"><CheckCheck aria-hidden="true" size={16} /><kbd>Ctrl+M</kbd><span>Master</span></button>
      <button aria-label={sourceId ? `${vocabularySaved ? "Remove" : "Save"} Course Vocabulary, shortcut Control plus N` : "Vocabulary requires a linked Course sentence"} aria-pressed={vocabularySaved} disabled={busy || paused || !sourceId || !onVocabularyCard} onClick={() => void vocabulary()} type="button"><BookmarkPlus aria-hidden="true" size={16} /><kbd>Ctrl+N</kbd><span>Vocabulary</span></button>
      <button className="studio-primary-key" disabled={busy || paused || checkpoint.phase === "instruction"} onClick={() => checkpoint.phase === "result" ? lastResult?.outcome === "perfect" ? void advance() : retry() : void submit()} type="button"><CornerDownLeft aria-hidden="true" size={16} /><kbd>Enter</kbd><span>{checkpoint.phase === "result" ? lastResult?.outcome === "perfect" ? "Next" : "Edit answer" : "Check"}</span></button>
      <button disabled={busy || paused || checkpoint.phase === "instruction"} onClick={() => checkpoint.phase === "result" ? retry() : void reveal()} type="button">{checkpoint.phase === "result" ? <RotateCcw aria-hidden="true" size={16} /> : answerVisible ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}<kbd>Ctrl+;</kbd><span>{checkpoint.phase === "result" ? "Try again" : answerVisible ? "Hide answer" : "Answer"}</span></button>
    </div>
  </section>;
}
