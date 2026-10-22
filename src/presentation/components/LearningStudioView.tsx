import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, BookOpen, ChevronRight, Clock3, Layers3, MessageSquare, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { createLocalId } from "../../application/createLocalId";
import type { TrainingSnapshot } from "../../application/use-cases/getTrainingSnapshot";
import { buildStudioExercises, familyTestIsAvailable, type StudioSelection } from "../../application/studio/buildStudioExercises";
import type { PersonalSentence, StudioCheckpoint, StudioExercise } from "../../domain/studio/LearningStudio";
import { REHEARSAL_TASKS, SENTENCE_FAMILIES } from "../../domain/studio/studioCatalog";
import type { ObservedLanguagePattern } from "../../domain/studio/weaknessPractice";
import type { LearningStudioController } from "../hooks/useLearningStudio";
import type { StudioView } from "../appUrlState";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { StudioRunner } from "./StudioRunner";
import "./LearningStudio.css";

const entries = [
  { id: "context", title: "Recall in a new context", description: "Find an acquired expression from a different situation.", icon: MessageSquare },
  { id: "family", title: "Sentence families", description: "Learn a structure, then try new combinations.", icon: Layers3 },
  { id: "mission", title: "Rehearse a real task", description: "Prepare for a conversation one useful step at a time.", icon: Target },
  { id: "personal", title: "Personal sentence inbox", description: "Bring back an expression you wanted to use in real life.", icon: Plus },
  { id: "weakness", title: "Contrast practice", description: "Explore recurring patterns from your recent first submissions.", icon: BookOpen },
  { id: "fluency", title: "Typing fluency", description: "Practise visible, already learned sentences with separate typing feedback.", icon: Sparkles },
] satisfies Array<{ id: StudioView; title: string; description: string; icon: typeof Target }>;

export function LearningStudioView({ tab, studio, snapshot, onNavigate, onClose, onReturnPlan, keySoundMuted, onMutedChange, fluencyContent,
  onMasterCard, onVocabularyCard, onCatalogSignal }: {
  tab: StudioView; studio: LearningStudioController; snapshot: TrainingSnapshot;
  onNavigate(tab: StudioView): void; onClose(): void; onReturnPlan(minutes: 3 | 8 | 15): void;
  keySoundMuted: boolean; onMutedChange(muted: boolean): Promise<unknown>;
  fluencyContent?: ReactNode;
  onMasterCard?(cardId: string): Promise<unknown>; onVocabularyCard?(cardId: string, isSaved: boolean): Promise<unknown>;
  onCatalogSignal?(checkpoint: StudioCheckpoint, exercise: StudioExercise, kind: "revealed" | "skipped"): Promise<unknown>;
}) {
  const [session, setSession] = useState<{ checkpoint: StudioCheckpoint; exercises: StudioExercise[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const document = studio.document;
  const catalogCardIds = useMemo(() => new Set(snapshot.cards.map((card) => card.id)), [snapshot.cards]);
  const masteredCardIds = useMemo(() => new Set(snapshot.reviewStates.filter((state) => state.learningStatus === "mastered").map((state) => state.cardId)), [snapshot.reviewStates]);
  const vocabularyCardIds = useMemo(() => new Set(snapshot.vocabularyEntries.map((entry) => entry.cardId)), [snapshot.vocabularyEntries]);

  useEffect(() => { setSession(null); setNotice(null); }, [tab]);

  async function start(selection: StudioSelection) {
    if (!document) return;
    try {
      if (document.checkpoint) { setNotice("Resume or discard your unfinished Studio session before starting another."); return; }
      const exercises = buildStudioExercises(selection, { cards: snapshot.cards, learningStates: snapshot.sentenceLearningStates, document, now: new Date() })
        .filter((exercise) => !exercise.sourceCardId || !masteredCardIds.has(exercise.sourceCardId));
      if (!exercises.length) { setNotice("No eligible sentences are available for this activity yet."); return; }
      const checkpoint: StudioCheckpoint = {
        revision: 1, sessionId: createLocalId("studio"), activity: selection.activity, groupId: selection.groupId,
        exerciseIds: exercises.map((exercise) => exercise.id), index: 0,
        phase: selection.stage === "held-out" || selection.activity === "context"
          || (selection.activity === "personal" && document.personalSentences.find((sentence) => sentence.id === exercises[0].id)?.learningState.acquisitionStatus !== "needs-guided")
          ? "recall" : "instruction",
        draft: "", answerWasRevealed: false, submissionCount: 0, updatedAt: new Date().toISOString(),
      };
      await studio.run((service) => service.saveCheckpoint(checkpoint));
      setSession({ checkpoint, exercises }); setNotice(null);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "This activity could not be started."); }
  }

  async function resume() {
    if (!document?.checkpoint) return;
    const checkpoint = document.checkpoint;
    try {
      const stage = checkpoint.exerciseIds.some((id) => id.includes(":test") || SENTENCE_FAMILIES.some((family) => family.exercises.some((exercise) => exercise.id === id && exercise.stage === "held-out"))) ? "held-out" : "training";
      const available = buildStudioExercises({ activity: checkpoint.activity,
        groupId: checkpoint.activity === "personal" ? "all" : checkpoint.groupId, stage }, {
        cards: snapshot.cards, learningStates: snapshot.sentenceLearningStates, document, now: new Date(),
      });
      const byId = new Map(available.map((exercise) => [exercise.id, exercise]));
      const exercises = checkpoint.exerciseIds.map((id) => byId.get(id));
      if (exercises.some((exercise) => !exercise)) throw new Error("Some session content has changed. Discard this session and choose the activity again.");
      setSession({ checkpoint, exercises: exercises as StudioExercise[] }); setNotice(null);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "The Studio session could not be resumed."); }
  }

  if (!document) return <section className="center-panel" aria-live="polite">
    <h3>{studio.error ? "Studio data could not be loaded" : "Opening your Learning Studio"}</h3>
    <p>{studio.error ?? "Your personal content and practice stay on this device."}</p>
    {studio.error && <button className="primary-button" onClick={() => void studio.reload()} type="button">Retry Studio data</button>}
  </section>;

  if (session) return <StudioRunner
    key={session.checkpoint.sessionId} initialCheckpoint={session.checkpoint} exercises={session.exercises}
    studio={studio} keySoundMuted={keySoundMuted} onMutedChange={onMutedChange}
    catalogCardIds={catalogCardIds} masteredCardIds={masteredCardIds} vocabularyCardIds={vocabularyCardIds}
    onMasterCard={onMasterCard} onVocabularyCard={onVocabularyCard}
    onCatalogSignal={onCatalogSignal}
    onLeave={() => setSession(null)}
  />;

  return <section className="learning-studio">
    <header className="studio-heading">
      <button className="secondary-button" onClick={tab === "home" ? onClose : () => onNavigate("home")} type="button"><ArrowLeft aria-hidden="true" size={17} />{tab === "home" ? "Courses" : "Studio"}</button>
      <div><p className="eyebrow">Optional practice</p><h3>{tab === "home" ? "Learning Studio" : entries.find((entry) => entry.id === tab)?.title}</h3></div>
    </header>
    <p className="studio-evidence-note">Transfer and personal practice have their own evidence. Course First Pass and scheduled Review measures keep their existing meaning.</p>
    {(notice || (tab !== "personal" && studio.error)) && <p className="studio-alert" role="alert">{notice ?? studio.error}</p>}
    {document.checkpoint && <div className="studio-resume" role="status">
      <div><strong>An unfinished Studio session is ready</strong><p>{document.checkpoint.index + 1} of {document.checkpoint.exerciseIds.length} · {document.checkpoint.activity}</p></div>
      <button className="primary-button" disabled={studio.pending} onClick={() => void resume()} type="button">Resume Studio session</button>
      <button className="secondary-button" onClick={() => setDiscard(true)} type="button">Discard session</button>
    </div>}
    {tab === "home" && <>
      <div className="studio-options">{entries.map((entry) => { const Icon = entry.icon; return <button className="studio-option" key={entry.id} onClick={() => onNavigate(entry.id)} type="button">
        <Icon aria-hidden="true" size={23} /><strong>{entry.title}</strong><span>{entry.description}</span><ChevronRight aria-hidden="true" size={17} />
      </button>; })}</div>
      <section className="studio-return" aria-labelledby="studio-return-title"><Clock3 aria-hidden="true" size={23} /><div><h4 id="studio-return-title">A small way back</h4><p>Choose a bounded practice round. Oldest due sentences get priority; unfinished work keeps its true schedule.</p></div>
        <div className="practice-actions">{([3, 8, 15] as const).map((minutes) => <button className="secondary-button" key={minutes} onClick={() => onReturnPlan(minutes)} type="button">About {minutes} minutes</button>)}</div>
      </section>
      <StudioEvidence document={document} />
    </>}
    {tab === "context" && <section className="studio-panel"><h4>One expression, a different situation</h4>
      <p>Use an acquired Starter expression for a new situation. Other natural English may differ; this exercise checks the expression you learned.</p>
      <p>{snapshot.sentenceLearningStates.filter((state) => state.cardId.startsWith("sf-") && state.firstPassedAt).length} acquired Starter sentences available.</p>
      <div className="practice-actions"><button className="primary-button" disabled={studio.pending} onClick={() => void start({ activity: "context", groupId: "all", stage: "training" })} type="button">Practise new cues</button>
        <button className="secondary-button" disabled={studio.pending} onClick={() => void start({ activity: "context", groupId: "all", stage: "held-out" })} type="button">Try unfamiliar cues</button></div>
    </section>}
    {tab === "family" && <div className="studio-list">{SENTENCE_FAMILIES.map((family) => <section className="studio-panel" key={family.id}>
      <h4>{family.title}</h4><p>{family.explanation}</p><p className="studio-pattern">{family.pattern}</p>
      <div className="practice-actions"><button className="primary-button" disabled={studio.pending} onClick={() => void start({ activity: "family", groupId: family.id, stage: "training" })} type="button">Learn 3 variants</button>
        <button className="secondary-button" disabled={studio.pending || !familyTestIsAvailable(document, family.id)} onClick={() => void start({ activity: "family", groupId: family.id, stage: "held-out" })} type="button">Check 2 new variants</button></div>
      {!familyTestIsAvailable(document, family.id) && <p className="muted-copy">Complete each training variant before the transfer check.</p>}
    </section>)}</div>}
    {tab === "mission" && <div className="studio-list">{REHEARSAL_TASKS.map((task) => <section className="studio-panel" key={task.id}><h4>{task.title}</h4><p>{task.description}</p><p>{task.steps.length} steps · taught expressions with explicit reference answers</p>
      <button className="primary-button" disabled={studio.pending} onClick={() => void start({ activity: "mission", groupId: task.id, stage: "training" })} type="button">Rehearse this task</button>
    </section>)}</div>}
    {tab === "personal" && <PersonalInbox studio={studio} onPractise={(groupId) => void start({ activity: "personal", groupId, stage: "training" })} />}
    {tab === "weakness" && <WeaknessChoices snapshot={snapshot} studio={studio} onStart={(groupId) => void start({ activity: "weakness", groupId, stage: "training" })} />}
    {tab === "fluency" && fluencyContent}
    <ConfirmationDialog id="studio-discard" open={discard} title="Discard this Studio session?" description="Your saved results and personal sentences remain. The current draft will be removed." confirmLabel="Discard session" isPending={studio.pending}
      onCancel={() => setDiscard(false)} onConfirm={() => { const id = document.checkpoint?.sessionId; if (id) void studio.run((service) => service.finishSession(id)).then(() => setDiscard(false)).catch(() => undefined); }} />
  </section>;
}

function StudioEvidence({ document }: { document: NonNullable<LearningStudioController["document"]> }) {
  const novel = document.attempts.filter((attempt) => attempt.stage === "held-out" && attempt.firstEncounter && attempt.firstSubmission);
  const successful = novel.filter((attempt) => attempt.outcome === "perfect" && !attempt.answerWasRevealed);
  return <section className="studio-panel"><h4>Separate practice evidence</h4><p>{document.attempts.length} saved exercise submissions · {document.personalSentences.length} personal sentences</p>
    <p>{novel.length ? `${successful.length} of ${novel.length} first encounters with test variants were recalled perfectly without reveal.` : "No first-encounter transfer checks yet."}</p>
    <p className="muted-copy">These checks describe the exercises completed here. They do not establish spontaneous conversation ability.</p></section>;
}

function PersonalInbox({ studio, onPractise }: { studio: LearningStudioController; onPractise(id: string): void }) {
  const [editing, setEditing] = useState<PersonalSentence | null>(null);
  const [prompt, setPrompt] = useState(""); const [english, setEnglish] = useState(""); const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false); const [remove, setRemove] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const document = studio.document!;
  const due = document.personalSentences.filter((sentence) => Date.parse(sentence.reviewState.dueAt) <= Date.now()).length;
  function edit(sentence: PersonalSentence) {
    setEditing(sentence); setPrompt(sentence.card.prompt); setEnglish(sentence.card.english); setSource(sentence.card.source); setConfirmed(false); setFormError(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setFormError(null);
    try {
      await studio.run((service) => service.savePersonal({ id: createLocalId("personal"), prompt, english, source, confirmed }, editing?.id));
      setEditing(null); setPrompt(""); setEnglish(""); setSource(""); setConfirmed(false);
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "This personal sentence could not be saved."); }
  }
  return <div className="studio-list"><section className="studio-panel"><h4>{editing ? "Edit your expression" : "Bring back a sentence you wanted to use"}</h4>
    <p>Save a situation and checked English. Personal learning and spaced review are stored separately from Course results.</p>
    <form className="studio-form" onSubmit={(event) => void save(event)}>
      {formError && <p className="studio-alert" role="alert">{formError}</p>}
      <label htmlFor="personal-scenario">Situation or meaning</label><textarea id="personal-scenario" maxLength={1000} onChange={(event) => setPrompt(event.target.value)} required value={prompt} />
      <label htmlFor="personal-english">Confirmed English expression</label><input id="personal-english" maxLength={500} onChange={(event) => setEnglish(event.target.value)} required value={english} />
      <label htmlFor="personal-source">Where you checked the expression</label><input id="personal-source" maxLength={1000} onChange={(event) => setSource(event.target.value)} required value={source} />
      <label className="studio-checkbox"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />I checked this English expression and want to practise it.</label>
      <div className="practice-actions"><button className="primary-button" disabled={studio.pending} type="submit">{editing ? "Save expression" : "Add personal sentence"}</button>
        {editing && <button className="secondary-button" onClick={() => { setEditing(null); setPrompt(""); setEnglish(""); setSource(""); setConfirmed(false); }} type="button">Cancel edit</button>}</div>
    </form></section>
    <section className="studio-panel"><h4>Your private expressions</h4><p>{due} due · {document.personalSentences.length} total</p>
      <button className="primary-button" disabled={!due || studio.pending} onClick={() => onPractise("due")} type="button">Practise due personal sentences</button>
      <ul className="studio-personal-list">{document.personalSentences.map((sentence) => <li key={sentence.id}><div><strong>{sentence.card.prompt}</strong><span>{sentence.learningState.firstPassedAt ? "Acquired" : "Learning"} · next {new Date(sentence.reviewState.dueAt).toLocaleString()}</span></div>
        <button className="secondary-button" onClick={() => onPractise(sentence.id)} type="button">Practise</button><button className="secondary-button" onClick={() => edit(sentence)} type="button">Edit</button>
        <button aria-label={`Remove personal sentence: ${sentence.card.prompt}`} className="icon-button" onClick={() => setRemove(sentence.id)} type="button"><Trash2 aria-hidden="true" size={18} /></button>
      </li>)}</ul>
      {!document.personalSentences.length && <p>Your inbox is empty. Add one expression from a real situation.</p>}
    </section>
    <ConfirmationDialog id="personal-remove" open={remove !== null} title="Remove this personal sentence?" description="The sentence and its personal review state will be removed. Historical aggregate exercise results remain." confirmLabel="Remove sentence" isPending={studio.pending} error={studio.error}
      onCancel={() => setRemove(null)} onConfirm={() => { if (remove) void studio.run((service) => service.removePersonal(remove)).then(() => setRemove(null)).catch(() => undefined); }} />
  </div>;
}

function WeaknessChoices({ snapshot, studio, onStart }: { snapshot: TrainingSnapshot; studio: LearningStudioController; onStart(id: string): void }) {
  const [patterns, setPatterns] = useState<ObservedLanguagePattern[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => { let cancelled = false;
    studio.loadWeaknesses(snapshot.cards).then((next) => { if (!cancelled) setPatterns(next); }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Patterns could not be loaded."); });
    return () => { cancelled = true; };
  }, [snapshot.cards, studio.loadWeaknesses, retry]);
  return <section className="studio-panel"><h4>Observed patterns across sentences</h4><p>Based on first, unsupported submissions from the last 30 days. A pattern needs at least two distinct sentences; it is a practice suggestion, not a diagnosis of what you know.</p>
    {error ? <><p role="alert">{error}</p><button className="secondary-button" onClick={() => { setError(null); setRetry((value) => value + 1); }} type="button">Retry patterns</button></>
      : patterns === null ? <p role="status">Reading recent evidence…</p> : patterns.length === 0 ? <p>No reliable recurring pattern yet. Keep practising; isolated typos do not create a weakness label.</p>
        : patterns.map((pattern) => <div className="studio-pattern-row" key={pattern.id}><h4>{pattern.title}</h4><p>{pattern.description}</p><p>{pattern.observations} observations across {pattern.distinctCards} sentences</p><button className="primary-button" onClick={() => onStart(pattern.id)} type="button">Practise this contrast</button></div>)}
  </section>;
}
