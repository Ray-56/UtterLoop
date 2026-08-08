# UtterLoop Guided Sentence Learning Design

Date: 2026-07-31
Status: Approved in conversation

## Goal

Make the first UtterLoop experience approachable for beginner English learners without weakening the product's sentence-recall core.

The learning loop becomes:

`understand the target -> notice form and pronunciation -> guided recall -> independent recall -> spaced review`

This document refines the [Course and Practice Flow Design](./2026-07-19-course-learning-flow-design.md). Where the two conflict, the First Pass, acquisition phase, completion, and requeue rules in this document supersede the earlier `first perfect` and `ReviewState.stage >= 1` rules.

The change has four outcomes:

1. A learner is taught a previously unseen Target Sentence before being tested on it.
2. Context, sentence patterns, keywords, grammar, IPA, and the full answer remain separately framed learning attributes, while the Recall UI records their combined written disclosure as one explicit level 4 Answer action.
3. Only an independent perfect recall creates a durable First Pass and advances spaced review normally.
4. Course coverage remains stable after a First Pass while ReviewState continues to rise and fall with long-term retention.

## Product Position

UtterLoop remains a focused output trainer, not a general grammar course, translation checker, pronunciation scorer, or AI tutor.

Learning Support exists to help the learner acquire the exact Target Sentence that UtterLoop will later ask them to retrieve. It does not replace retrieval practice, fill the learner's word slots, or turn Practice into a reading lesson.

The default experience uses General American pronunciation (`en-US`) and Chinese instructional support because the default catalog uses Chinese Prompts. Imported Courses may omit Learning Support and remain usable through the minimal First Exposure fallback and existing recall controls.

## Approved Product Rules

- A previously unseen card begins with First Exposure inside the stable Practice surface. First Exposure may show the full Target Sentence, audio, IPA, phrase chunks, grammar, and meaning because it is instruction rather than assessment.
- First Exposure creates no Attempt and does not advance ReviewState.
- The first recall after First Exposure is Guided Recall with no written Learning Support visible by default. It remains Guided by phase at level 0 because an immediate post-exposure recall is not yet durable retrieval evidence. Quick Start follows the same blank-by-default Recall rule.
- A Guided Recall can teach and correct the sentence but cannot create a First Pass or advance a ReviewState stage.
- Before First Pass, a Guided Recall that reaches exact text makes the card Independent-ready; it returns later in the same round only when the spacing rule can be satisfied.
- Independent Recall allows the Prompt, communicative context, word count, word-slot geometry, live correctness signals that reveal no missing target words, and self-editing before the first complete submission.
- Only the first complete submission in an Independent Recall turn can create a First Pass.
- A First Pass requires support level 0, no prior corrective result in the turn, and a `perfect` evaluation.
- An exact instructional completion means `AnswerEvaluation.outcome === "perfect"` against either the canonical Target Sentence or a reviewed `acceptableAnswers` entry; it never requires canonical-string identity.
- After a complete `close` or `retry` result, the turn enters Corrective Practice. Reaching exact text during correction teaches the sentence but does not turn the failed retrieval into an Independent perfect or advance ReviewState.
- A perfect first submission after ordinary self-editing remains eligible for First Pass. `hadEdits` continues to shorten its interval, while a separate `receivedCorrection` flag records feedback shown after a submitted result.
- Course, Unit, Lesson, and LearningPath coverage uses First Pass evidence and never regresses after a later lapse.
- ReviewState remains the mutable spaced-review projection. A failed review can reset its stage without erasing First Pass.
- Explicit `mastered` creates a First Pass with an explicit-mastery source and removes the card from active queues. Returning it to `new` does not erase the First Pass.
- Context and communicative function do not count as target-bearing support. Pattern, keywords, frame, IPA, target audio, grammar text containing the target, and Answer Reveal do.
- The highest support level used before submission is persisted with the Attempt. Support opened after a result does not change the already-recorded evidence.
- Target audio played before submission counts as target-form support. Audio played during First Exposure or after a result does not affect recall evidence.
- Full written grammar or phrase analysis that exposes every target word has the same level 4 support strength as the Answer, but only the explicit Answer action sets `answerWasRevealed`.
- A learner who asks for target-bearing support during Review has failed independent retrieval. The card returns to focused review, but its First Pass remains.
- Before a First Pass, a `retry` evaluation outcome, reveal, skip, or support use does not increment `lapseCount`; acquisition difficulty is not counted as forgetting. After a First Pass, such an action increments the lapse when it is the first failure signal before a complete submission. Once a `close` or `retry` result is submitted, that result's scheduler decision remains authoritative for the turn.
- Opening support changes the current turn to Guided and keeps it on the current card. Only a later exact instructional completion makes an unpassed card Independent-ready.
- Answer Reveal records level 4 and remains on the current card. Exact typing afterward is instructional completion; explicit Skip ends the turn without completion. Ordinary navigation or refresh performs no best-effort learning write and leaves the last durable AcquisitionStatus unchanged.
- The five visible Practice shortcuts and their order remain unchanged. Written Learning Support is disclosed with the existing Answer action rather than adding another shortcut or default panel.
- `Ctrl+Quote` remains target audio, `Ctrl+;` remains full Answer or voluntary Try again after a correct result, and `Ctrl+/` remains reserved for a future optional tutor and never reveals the Answer.
- Inside `voluntary-practice`, ordinary support, Audio, Answer, Skip, and submissions record practice evidence but never change ReviewState, lapse count, First Pass, or AcquisitionStatus. Mastered and Vocabulary retain their explicit independent semantics.
- Quick Start uses real Starter cards and does not create a separate tutorial Course or Lesson.
- The initial authored rollout covers the 20 cards in Starter Foundations. Cards without authored support use the minimal First Exposure and Guided fallback defined below, while retaining the existing recall controls.

## Domain Language

### Learning Support

Structured instructional information attached to the canonical Target Sentence. It contains context, communicative function, a sentence pattern, progressive cues, pronunciation, and grammar analysis.

Learning Support is content. Opening part of that content during recall produces Recall Support evidence.

### First Exposure

The non-assessment phase for an unintroduced card. It may show the complete Target Sentence and Learning Support, creates no Attempt, and prepares the mandatory first Guided Recall.

### Recall Support

The strongest target-bearing aid used before a recall is submitted. Recall Support is ordered from context-only independent work through complete target exposure.

### Guided Recall

An instructional recall turn. It is either the mandatory first recall after First Exposure or any turn in which target-bearing support is used. Guided Recall teaches the target and produces practice evidence, but it cannot create a First Pass.

### Independent Recall

A recall turn whose first complete submission occurs without target-bearing support or prior corrective feedback. A perfect Independent Recall may create a First Pass and advance ReviewState.

### Corrective Practice

The same-card instructional phase after a submitted `close` or `retry`. It helps the learner reach exact text but cannot replace the scheduler decision or First Pass eligibility of the first submission.

### Exact Instructional Completion

A Guided or Corrective submission whose AnswerEvaluation outcome is `perfect` against the canonical Target Sentence or a reviewed acceptable answer. Before First Pass it may set `ready-independent`, but it is not itself a First Pass.

### First Pass

The first durable evidence that a learner independently produced an accepted Target Sentence or explicitly marked the card mastered. First Pass drives course coverage and is monotonic.

### Sentence Learning State

The durable record that a SentenceCard has been introduced, its next acquisition mode, and whether it received a First Pass. It is independent from ReviewState.

### Acquisition Status

The mutable pre-pass readiness of an introduced card. `needs-guided` means the learner still needs an instructional recall; `ready-independent` means the next eligible recall may establish a First Pass.

## Content Model

`SentenceCard.note` remains an optional general content note. Guided learning uses a structured model rather than conventions embedded in one free-form string.

```ts
type PronunciationDialect = "en-US";

type GrammarRole =
  | "subject"
  | "predicate"
  | "object"
  | "complement"
  | "adverbial"
  | "modal"
  | "auxiliary"
  | "determiner"
  | "conjunction"
  | "other";

interface PronunciationChunk {
  text: string;
  ipa: string;
}

interface GrammarToken {
  text: string;
  ipa: string;
  gloss: string;
  partOfSpeech: string;
}

interface GrammarChunk {
  text: string;
  role: GrammarRole;
  label: string;
  tokens?: GrammarToken[];
}

interface SentenceLearningSupport {
  context: string;
  communicativeFunction: string;
  pattern: string;
  keywords: string[];
  frame: string;
  pronunciation: {
    dialect: PronunciationDialect;
    sentenceIpa: string;
    chunks: PronunciationChunk[];
  };
  grammar: {
    structure: string;
    explanation: string;
    points: string[];
    chunks: GrammarChunk[];
  };
}

interface SentenceCard {
  // existing fields
  learningSupport?: SentenceLearningSupport;
}
```

The model describes the canonical `english` value. `acceptableAnswers` do not require separate IPA or grammar analysis.

The first release uses plain strings for `structure` and `pattern` instead of a complete grammar taxonomy. For example:

```ts
{
  context: "礼貌地请求别人做事。",
  communicativeFunction: "礼貌请求",
  pattern: "Could + 主语 + 动词原形 + 宾语?",
  keywords: ["open", "window"],
  frame: "Could you ___ the ___?",
  pronunciation: {
    dialect: "en-US",
    sentenceIpa: "/kʊd ju ˈoʊpən ðə ˈwɪndoʊ/",
    chunks: [
      { text: "Could", ipa: "/kʊd/" },
      { text: "you", ipa: "/ju/" },
      { text: "open", ipa: "/ˈoʊpən/" },
      { text: "the", ipa: "/ðə/" },
      { text: "window", ipa: "/ˈwɪndoʊ/" }
    ]
  },
  grammar: {
    structure: "Modal + S + V + O",
    explanation: "Could 放在主语前，用动词原形构成礼貌请求。",
    points: ["情态动词 could", "动词原形"],
    chunks: [
      {
        text: "Could",
        role: "modal",
        label: "情态动词",
        tokens: [{ text: "Could", ipa: "/kʊd/", gloss: "能；可以", partOfSpeech: "情态动词" }]
      },
      {
        text: "you",
        role: "subject",
        label: "主语 S",
        tokens: [{ text: "you", ipa: "/ju/", gloss: "你", partOfSpeech: "代词" }]
      },
      {
        text: "open",
        role: "predicate",
        label: "谓语 V",
        tokens: [{ text: "open", ipa: "/ˈoʊpən/", gloss: "打开", partOfSpeech: "动词" }]
      },
      {
        text: "the window",
        role: "object",
        label: "宾语 O",
        tokens: [
          { text: "the", ipa: "/ðə/", gloss: "这／该", partOfSpeech: "限定词" },
          { text: "window", ipa: "/ˈwɪndoʊ/", gloss: "窗户", partOfSpeech: "名词" }
        ]
      }
    ]
  }
}
```

### Content Validation

Catalog validation adds these rules when `learningSupport` is present:

- context, communicative function, pattern, frame, IPA, grammar structure, and grammar explanation are non-empty;
- context and communicative function do not reproduce the complete normalized Target Sentence; target-bearing English belongs in a measured support level;
- the pronunciation dialect is `en-US` in schema version 1;
- pronunciation and grammar chunks are non-empty and retain canonical written order;
- normalized pronunciation chunk text and grammar chunk text each reconstruct the canonical Target Sentence;
- keywords contain one or two trimmed, case-insensitively unique items that occur in the canonical Target Sentence after written-answer normalization and do not reconstruct the complete target;
- the frame contains at least one blank marker (`___`) and does not equal the full Target Sentence;
- grammar points are trimmed, unique, and limited to two per card;
- each grammar role is from the supported role set;
- token analysis is optional for backward compatibility; when present, every token field is curated, non-empty, and trimmed, and token text reconstructs its parent grammar chunk in order;
- General American IPA is curated content and is never synthesized or guessed at runtime.

Independent-prompt validation applies to every card, including cards without Learning Support. The Prompt must not contain the complete normalized Target Sentence or an acceptable answer, and it must not autoplay target audio. A rejected import identifies the card and asks the author to move target form into First Exposure or explicit support.

Default content tests require complete Learning Support for every Starter Foundations card after the first rollout. Imported cards may omit it.

## Recall Support Levels

Support is ordered by the maximum amount of target form disclosed before submission.

| Level | Name | Available information | Recall status |
| --- | --- | --- | --- |
| 0 | Context | Non-target-bearing Prompt, context, communicative function, word count, slot geometry | Independent-eligible |
| 1 | Pattern | Sentence pattern or grammar summary without the complete target | Guided |
| 2 | Lexical | Target keywords, first word, or initial-letter cues | Guided |
| 3 | Target form | Partially filled frame, full-sentence IPA, or target audio | Guided |
| 4 | Full target | Full written Target Sentence or analysis containing every target word | Guided, full target exposed |

Rules:

- Support levels are monotonic within one recall turn; hiding a hint does not lower the recorded level.
- First Exposure is not a recall turn, so showing complete support there records no support level.
- The first Guided Recall after First Exposure begins at level 0 with the support slot visually empty. Its `guided-recall` phase still prevents a First Pass; support evidence rises only after the learner actually uses an aid.
- Phase, prior correction, and support level jointly determine independence; level 0 alone does not guarantee an Independent Recall.
- A learnable card must have a non-target-bearing Prompt. Import validation rejects a Prompt that exposes the complete Target Sentence or autoplays target audio; target form belongs in First Exposure or explicit support.
- The support taxonomy remains available for historical data and future independent entry points. The current combined written disclosure records only `answer` at level 4; it does not pretend that the learner opened each framed attribute separately.
- The existing Answer action jumps directly to level 4.
- Playing target audio before submission promotes the turn to level 3 without opening the written panel.
- If a future independent grammar, keyword, frame, or IPA control is reintroduced, it must record its own support kind and level instead of piggybacking on Answer.
- The result state may expose full pronunciation and grammar without changing the submitted evidence.
- Word count, fixed slot widths, and matched words originally supplied by the learner remain level 0 support.

## Sentence Learning State

Course coverage needs a durable projection that does not collapse into ReviewState.

```ts
type FirstPassSource =
  | "independent-recall"
  | "explicit-mastery"
  | "legacy";

type AcquisitionStatus = "needs-guided" | "ready-independent";

interface SentenceLearningState {
  cardId: SentenceCardId;
  introducedAt?: string;
  acquisitionStatus?: AcquisitionStatus;
  firstPassedAt?: string;
  firstPassSource?: FirstPassSource;
}
```

Invariants:

- `introducedAt` and `firstPassedAt` are write-once timestamps.
- `firstPassSource` is present exactly when `firstPassedAt` is present.
- `acquisitionStatus` is present exactly when the card is introduced but has no First Pass.
- Completing First Exposure sets `acquisitionStatus: "needs-guided"`.
- Before First Pass, an exact Guided or Corrective completion sets `acquisitionStatus: "ready-independent"`.
- Before First Pass, target-bearing support, reveal, skip, or a failed Independent Recall sets it back to `needs-guided`; it returns to `ready-independent` only after the learner completes the instructional or corrective recall exactly.
- Creating a First Pass clears `acquisitionStatus` because acquisition readiness no longer governs the card.
- `firstPassedAt` never clears after retry, reveal, skip, lapse, or a change from `mastered` back to `new`.
- An Independent Recall can set `firstPassedAt` only when its evaluation is `perfect`, its practice phase is `independent-recall`, and its support level is 0.
- Explicit mastery may set `introducedAt`, `firstPassedAt`, and `firstPassSource: "explicit-mastery"` in one operation.
- If a First Pass exists without an introduction timestamp during migration, `introducedAt` is set to the First Pass timestamp.
- Reset learning progress clears SentenceLearningState together with ReviewState and PracticeLog.
- Vocabulary remains independent and is not cleared by Reset learning progress.

Course progress changes from `ReviewState.stage >= 1 || mastered` to `SentenceLearningState.firstPassedAt`.

Lesson, Unit, Course, and LearningPath completion therefore remains stable after later review failure. Long-term retention continues to use ReviewState stage, due time, streak, and lapse count.

## Attempt Evidence

Attempt evidence gains the highest support level used before submission.

```ts
type RecallSupportLevel = 0 | 1 | 2 | 3 | 4;

type RecallSupportKind =
  | "pattern"
  | "keywords"
  | "frame"
  | "pronunciation"
  | "audio"
  | "grammar"
  | "copy-target"
  | "answer"
  | "correction";

interface AttemptEvidence {
  answerWasRevealed: boolean;
  hadEdits: boolean;
  audioPlayCount: number;
  durationMs: number;
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: RecallSupportKind[];
  receivedCorrection: boolean;
}

type PracticeSignalKind = "support-used" | "revealed" | "skipped";
type PersistedPracticePhase = PracticePhase | "legacy";

interface PracticeLogBase {
  id: string;
  turnId: string;
  cardId: SentenceCardId;
  phase: PersistedPracticePhase;
  submittedAt: string;
}

interface PracticeAttemptLogEntry extends PracticeLogBase, AttemptEvidence {
  kind: "attempt";
  id: `turn-attempt:${string}:${number}`;
  submissionIndex: number;
  answer: string;
  outcome: "perfect" | "close" | "retry";
  accuracy: number;
}

interface PracticeSignalLogEntry extends PracticeLogBase, AttemptEvidence {
  kind: "signal";
  id: `turn-signal:${string}`;
  updatedAt: string;
  signalKinds: PracticeSignalKind[];
  reviewFailureRecorded: boolean;
  answer: "";
  accuracy: 0;
}

type PracticeLogEntry = PracticeAttemptLogEntry | PracticeSignalLogEntry;
```

Attempt rows and learning-signal rows are deliberately distinct. Submission and accuracy projections use `kind: "attempt"` and exclude `voluntary-practice`; support, reveal, and skip signals never enter those metrics. A raw activity count may include voluntary Attempts when it labels them Practice only. Existing rows without `kind` normalize from their legacy outcome: `perfect`, `close`, and `retry` are Attempts; `revealed` and `skipped` are signals.

Before each submission, the presentation layer allocates and retains `submissionIndex` plus deterministic ID `turn-attempt:${turnId}:${submissionIndex}` until the command succeeds. The application transaction checks that ID before evaluating or scheduling; if it already exists, the command returns the persisted result without adding a log or changing ReviewState again. Corrective submissions increment the index, so they remain distinct Attempts while retries of the same command stay idempotent.

`supportKindsUsed` is a unique list of every aid action or corrective signal used in the turn, while `supportLevelUsed` is the highest ordered target-bearing level reached and is the value used by domain policy. Viewing Pattern, Keywords, Frame, and IPA inside the combined Answer panel remains one `answer` action rather than four fabricated actions. `hadEdits` describes learner editing before submission and does not by itself disqualify Independent Recall. `receivedCorrection` becomes true after the first complete non-perfect result in a turn and never returns to false for that turn.

`answerWasRevealed` remains during the first implementation for compatibility and equals `supportKindsUsed.includes("answer")` for new writes. The Answer kind always raises support to level 4, but level 4 grammar does not set the Answer flag. Removing the flag is a later cleanup rather than part of this change.

New scheduling decisions use practice phase, First Pass presence, support level, and whether a turn consequence was already recorded. `answerWasRevealed` is no longer a standalone scheduling shortcut.

Target-bearing support requested before the first complete submission must survive abandonment or refresh. Every turn has at most one aggregate signal row with deterministic ID `turn-signal:${turnId}`. Support, Answer Reveal, and Skip add to its unique `signalKinds`; support escalation updates its maximum level, support kinds, and `updatedAt` without changing the first-action `submittedAt`.

On a card with a First Pass, the first failing signal and the focused-review reset are written atomically with `reviewFailureRecorded: true`. Before applying another consequence, the transaction checks the deterministic signal plus Attempt rows for the same indexed `turnId`; a retried command or a Skip after a `retry` result cannot increment lapse again. Support opened only after a submitted result may help correction or study, but it neither rewrites that Attempt nor applies a second scheduling consequence. Signal rows keep `answer: ""` and `accuracy: 0` solely for storage compatibility; consumers must use the `kind` discriminator.

## Learning And Review Policy

The policy combines practice phase, evaluation, support, and previous First Pass state.

| Situation | First Pass | ReviewState | Round behavior |
| --- | --- | --- | --- |
| First Exposure completed | unchanged | unchanged | start Guided Recall |
| First Exposure skipped | unchanged | stage 0, due in 10 minutes; no lapse | persist introduction with `needs-guided` and end turn |
| Guided perfect before First Pass, level 0-3 | unchanged | stage 0, due in 10 minutes | mark Independent-ready and requeue |
| Guided exact before First Pass, level 4 | unchanged | stage 0, due in 10 minutes | mark Independent-ready and requeue |
| Guided `close` or `retry` before First Pass | unchanged | stage 0, due in 10 minutes; no lapse | enter Corrective Practice; requeue only after exact completion |
| Independent perfect, level 0 | create if absent | advance one stage; edited interval remains halved | advance |
| Independent `close` or `retry` before First Pass | unchanged | stage 0, due in 10 minutes; no lapse | enter Corrective Practice; requeue only after exact completion |
| Target-bearing support requested before First Pass | unchanged | stage 0, due in 10 minutes; no lapse | change to Guided, remain current, keep `needs-guided` |
| Corrected exact before First Pass | unchanged | retain the state written by the first result | mark Independent-ready and requeue |
| Support requested after a First Pass, before first submission | retained | reset to stage 0, due in 10 minutes; increment lapse once | change to Guided and remain current |
| Guided exact after a First Pass | retained | retain the state written by the support or Reveal signal | finish current turn; focused review remains scheduled |
| `close` evaluation after a First Pass | retained | retain stage and streak, due in 6 hours; no lapse | enter Corrective Practice |
| `retry` evaluation after a First Pass | retained | reset to stage 0, due in 10 minutes; increment lapse once | enter Corrective Practice |
| Corrected exact after a First Pass | retained | retain the state written by the first result or signal | finish current turn; that prior schedule remains |
| Answer Reveal before First Pass | unchanged | stage 0, due in 10 minutes; no lapse | stay current at level 4 and keep `needs-guided` until exact |
| Skip before First Pass | unchanged | stage 0, due in 10 minutes; no lapse | end turn and keep `needs-guided` |
| Answer Reveal after First Pass, before first submission | retained | reset to stage 0, due in 10 minutes; increment lapse once | stay current at level 4; focused review remains scheduled |
| Support, Reveal, or Skip after a submitted `close` or `retry` | retained | retain the scheduler state written by that first result | help or end correction; never apply a second consequence |
| Skip after First Pass, before first submission | retained | reset to stage 0, due in 10 minutes; increment lapse once | end turn in focused review |
| Voluntary Try again after a correct result | retained | unchanged | start a non-scheduling practice turn |
| Explicit mastery | create with mastery source | set stage 6 and mastered | remove from active queues |

Additional rules:

- Acquisition-status transitions are persisted with the result that caused them. A refresh may discard unfinished input, but it must not lose whether the next recall is Guided or Independent-ready.
- A `close` evaluation retains its current six-hour interval only for an already-passed card that used level 0 support. During acquisition it remains stage 0 and due in 10 minutes.
- Lapse count describes forgetting after a First Pass, not difficulty during initial acquisition.
- One recall turn increments lapse at most once even if the learner uses audio and then reveals the answer.
- The existing review intervals remain `8h -> 1d -> 3d -> 7d -> 14d -> 30d`.
- Self-editing before the first complete submission does not disqualify a level 0 perfect. `hadEdits` still halves the interval.
- Once the first complete submission is `close` or `retry`, later correction submissions cannot advance ReviewState or create First Pass. The scheduler result from the first submission remains authoritative for that turn.
- Corrective Practice may preserve learner-supplied matched words and clear mismatches, but it sets `receivedCorrection` and support kind `correction`.
- A perfect result after level 1-4 support never advances the review stage, even if the final text is exact.
- A voluntary Try-again action plus ordinary support, Audio, Answer, Skip, and every submission inside its `voluntary-practice` turn leave ReviewState, First Pass, and AcquisitionStatus unchanged. Attempts and signals are still logged for feedback, but retention projections exclude that phase. Explicit Mastered still applies mastery, and Vocabulary remains independent.

## Guided Practice State Machine

Practice gains explicit instructional phases:

```ts
type PracticePhase =
  | "first-exposure"
  | "guided-recall"
  | "independent-recall"
  | "corrective-practice"
  | "review-recall"
  | "voluntary-practice";

interface PracticeTurn {
  id: string;
  cardId: SentenceCardId;
  phase: PracticePhase;
  supportLevelUsed: RecallSupportLevel;
  supportKindsUsed: RecallSupportKind[];
  receivedCorrection: boolean;
  reviewFailureRecorded: boolean;
}
```

```text
Unintroduced
  -> FirstExposure

FirstExposure
  |- Start/Enter -> Introduced(needs-guided) -> GuidedRecall(level 0)
  |- Audio -> stay; no recall evidence
  |- Answer -> stay; disabled because target is already visible
  |- Vocabulary -> stay; persist bookmark independently
  |- Skip -> Introduced(needs-guided) -> PendingFocusedReview
  |- mastered -> PassedAndMastered
  `- leave without Start/Skip -> Unintroduced

GuidedRecall
  |- exact before FirstPass at level 0-4 -> ReadyIndependent -> PendingIndependentRecall
  |- exact after FirstPass -> existing signal or first-result schedule remains
  |- close/retry -> CorrectivePractice
  |- more support or reveal before FirstPass -> GuidedRecall(higher level, remain current and needs-guided)
  |- more support or reveal after FirstPass -> GuidedRecall(remain current); focused review scheduled
  |- skip before FirstPass -> PendingFocusedReview(needs-guided)
  |- skip after FirstPass -> focused review
  |- exit/refresh -> discard turn; retain durable status
  `- mastered -> PassedAndMastered

CorrectivePractice
  |- exact before FirstPass -> ReadyIndependent -> PendingIndependentRecall
  |- exact after FirstPass -> first-result or signal schedule remains
  |- reveal -> GuidedRecall(level 4, remain current)
  |- skip before FirstPass -> PendingFocusedReview(needs-guided); retain first-result schedule
  |- skip after FirstPass -> end turn; retain first-result schedule
  |- exit/refresh -> discard turn; retain durable status and first-result schedule
  `- mastered -> PassedAndMastered

PendingIndependentRecall
  -> wait for two intervening turns
  -> IndependentRecall(level 0)

IndependentRecall
  |- perfect -> FirstPass -> ReviewScheduled
  |- close/retry -> CorrectivePractice
  |- target-bearing support or reveal before FirstPass -> GuidedRecall(remain current and needs-guided)
  |- target-bearing support or reveal after FirstPass -> GuidedRecall(remain current); focused review scheduled
  |- skip before FirstPass -> PendingFocusedReview(needs-guided)
  |- skip after FirstPass -> focused review
  |- exit/refresh -> discard turn; retain durable status
  `- mastered -> PassedAndMastered

ReviewRecall
  |- independent perfect -> advance ReviewState
  |- close -> CorrectivePractice; retain stage and schedule 6 hours
  |- retry -> CorrectivePractice; reset to focused review
  |- target-bearing support or reveal -> GuidedRecall(remain current); focused review scheduled
  |- skip -> focused review
  |- exit/refresh -> discard turn; no state change
  `- mastered -> PassedAndMastered

CorrectResult
  -> voluntary Try again -> VoluntaryPractice

VoluntaryPractice
  |- ordinary support/audio/answer/skip/result/exit -> no scheduling or acquisition change
  |- Vocabulary -> persist bookmark independently
  `- mastered -> PassedAndMastered
```

Every itinerary occurrence has its own PracticeTurn ID because one SentenceCard may appear more than once in a round. Updating one turn must not accidentally mutate every pending occurrence of that card. Mastery intentionally removes every occurrence for the mastered card.

`reviewFailureRecorded` prevents support, reveal, skip, and the later Guided submission from incrementing lapse more than once in the same turn. It is recovered from the deterministic aggregate signal row when a write must be retried.

The domain owns phase transitions and requeue policy. React renders a resolved Practice turn and dispatches learner actions; it does not decide whether a result creates First Pass or when an assisted or corrected card returns.

## Requeue Policy

- An exact Guided completion before First Pass is reinserted after at least two intervening turns when the session has enough cards.
- An Independent Recall that becomes Guided is reinserted under the same rule only after exact instructional completion. Merely opening support never advances or requeues the card.
- A card is never inserted immediately after itself. If no intervening turn is available, the round ends with the card pending.
- A card may return at most twice in one round because of completed Guided or Corrective practice; Skip ends the current occurrence and may leave the card pending.
- After the cap, the card remains unpassed and due for focused review in 10 minutes; the round may end without claiming Lesson completion.
- This rule also applies when an ordinary multi-card Lesson has only one unpassed card left. An optional immediate repetition stays Guided practice and can never create a First Pass.
- Corrective Practice remains on the current card until exact text, explicit skip, exit, or mastery. Reveal changes it to level 4 Guided practice but does not advance. Exact corrected text completes the instructional turn without overwriting the first submitted retrieval result. Exit performs no new write; any already-persisted first result remains authoritative.
- Previous navigation preserves the phase and maximum support already used for that turn.
- Inside an active round, the two-intervening-turn rule is sufficient and may return a card before its stage-0 `dueAt`. The 10-minute `dueAt` is the cross-round fallback after exit, refresh, or the return cap; it never blocks a properly spaced in-round return.
- After a reload loses the in-memory round, `acquisitionStatus` restores the required mode. A `ready-independent` card whose stage-0 `dueAt` is still in the future yields to other unpassed cards; if none are eligible, the round ends pending instead of repeating the card immediately.

When a round ends:

- `Lesson complete` appears only when every card has First Pass or explicit mastery.
- If cards remain unpassed, the UI says `Round complete` and reports how many need another independent recall.
- The primary action is `Continue remaining` when another in-round turn is available, otherwise `Review when ready` or `Choose lesson`.
- A completed Lesson offers a direct `Next lesson` action in addition to Practice again.

## Learning Path And Progress

- The recommended next step is the earliest Lesson in LearningPath order containing a card without First Pass. An introduced unpassed Lesson is resumed before a later untouched Lesson.
- Lesson and Course coverage display `First passed / total` and never move backward after a lapse.
- Due Review count and current ReviewState stage remain separate retention indicators; neither is presented as Course completion.
- Lesson actions are `Start`, `Continue learning`, or `Practice again` from SentenceLearningState, while `Review due` remains a separate action.
- Completing a Lesson exposes Next lesson directly but does not hard-lock any Course, Unit, or Lesson.
- Quick Start appears only when there is no card-level learning state and its versioned UI preference has not been completed or dismissed.

## Quick Start

Quick Start is a first-run instructional wrapper around the first three real cards in Starter Foundations.

It teaches the product loop without adding tutorial-only progress:

1. Introduce card 1 with the Target Sentence, audio, meaning, and short phrase chunks.
2. Give card 1 a level 0 Guided Recall with the written support slot empty; `Ctrl+;` remains available if the learner explicitly needs the Answer and grammar attributes.
3. Give card 2 an abbreviated First Exposure followed by the same blank-by-default level 0 Guided Recall.
4. Give card 3 an abbreviated First Exposure followed by the same blank-by-default level 0 Guided Recall.
5. Return to cards 1, 2, and 3 for level 0 Independent Recall after intervening turns.
6. Explain that independent cards enter spaced Review and that support remains available when needed.

Quick Start requirements:

- It stays inside the standard Practice surface and preserves the hidden native input.
- Every Quick Start Recall begins with the stable support slot visually empty and never writes support into the learner's word slots or hidden input.
- It introduces only the control needed for the current step. The full five-shortcut bar remains visible but is not explained all at once.
- It may be skipped without creating skip logs, ReviewState, SentenceLearningState, or other card-level learning signals.
- Completing or dismissing it stores a versioned local UI preference so it does not reopen on every visit.
- Skipping Quick Start enters normal Guided Learn for the same first Lesson.
- Independent perfect recalls inside Quick Start are real learning evidence and create First Pass normally.
- A future Quick Start version change may show the flow again; ordinary content revision does not.

Quick Start is not an enrollment requirement, Course prerequisite, modal tour across unrelated screens, or separate LearningPath.

## Content Authoring Standard

### Lesson Shape

New and substantially revised beginner Lessons should use:

- one communicative objective;
- one or two reusable sentence patterns;
- three controlled substitutions;
- one structural variation;
- one transfer sentence;
- repeated high-frequency vocabulary where possible;
- a gradual length progression from roughly 4-6 words to 6-8 words before longer sentences.

The first rollout preserves the existing Starter target sentences and stable card IDs. It adds support and audits Prompt ambiguity rather than silently replacing learned targets.

### Starter Foundations Order

The first rollout keeps the current four Lesson IDs and communicative themes but orders each Lesson from shorter, more regular output toward longer or less transparent structure:

| Lesson | Card order |
| --- | --- |
| Meet Someone New | `sf-001`, `sf-002`, `sf-003`, `sf-005`, `sf-004` |
| A Simple Daily Routine | `sf-006`, `sf-007`, `sf-010`, `sf-008`, `sf-009` |
| Ask for What You Need | `sf-011`, `sf-012`, `sf-013`, `sf-014`, `sf-015` |
| Keep the Conversation Clear | `sf-017`, `sf-016`, `sf-018`, `sf-019`, `sf-020` |

This is an ordering and support revision, not a claim that every existing Lesson already has controlled substitutions. Newly authored beginner content must follow the Lesson Shape standard above; adding a larger zero-English curriculum is a separate content project.

### Prompt And Accepted Answers

- The Prompt communicates meaning and context rather than pretending to be a unique literal translation.
- When the Course intends a particular construction, Learning Support anchors it explicitly, such as `使用 Could you 开头`.
- `acceptableAnswers` includes only genuinely equivalent output that satisfies the same lesson objective.
- A different natural translation is not automatically accepted when it bypasses the target pattern being learned.
- Contractions, punctuation, names, abbreviations, and capitalization receive explicit content tests when they affect tokenization.
- A material change to the Target Sentence or its meaning requires a new SentenceCard ID. Support-only corrections keep the stable ID and increase the owning Course revision.

### Pronunciation

- The first release uses curated General American IPA and labels it as such.
- Sentence IPA represents the canonical Target Sentence; chunk IPA supports slower inspection.
- Audio remains local browser speech synthesis with no remote asset.
- The default voice should prefer `en-US`. If the learner explicitly selects another English voice, the UI continues to label the stored IPA `General American` instead of implying an exact match.
- IPA supplements audio; it is never required to complete a card.
- Connected speech, detailed intonation notation, and pronunciation scoring are deferred.

### Grammar

- Grammar starts with the usable pattern and communicative function, not an abstract terminology dump.
- `S`, `V`, `O`, `C`, and `A` labels always include their Chinese names.
- Color may reinforce roles but cannot be the only distinction.
- A card stores no more than two grammar points for content compatibility; the current single-row Practice UI does not render a separate notes block.
- Curated token analysis renders as an outer constituent frame plus IPA, written form, Chinese gloss, and part-of-speech rows for each word. The UI never derives a gloss, part of speech, or word IPA from an unannotated sentence at runtime.
- Full target-word grammar chunks appear as the same single row during First Exposure, after a result, or inside the level 4 Answer disclosure. Levels 1 and 2 remain part of the persisted evidence vocabulary for compatibility, but the current Recall UI does not open partial written-support panels.

## Practice Interface

The stable Practice surface reserves one Answer slot above the word track. It is visually empty during ordinary Recall and becomes one single-row sentence map only after explicit Answer disclosure. First Exposure and Result reuse that row.

### First Exposure

The panel displays only:

- the full Target Sentence as one structured grammar row when curated token analysis exists;
- one plain Target Sentence row for older or imported content without complete token analysis;
- the required `Start recall` action. Audio remains available from the persistent Practice shortcut instead of a duplicate panel button.

The learner may inspect the information without creating an Attempt.

First Exposure preserves the fixed commands with phase-specific behavior:

- `Enter` and the Start recall button atomically record `introducedAt` plus `needs-guided`, then enter Guided Recall;
- Audio plays normally and records no recall support;
- Answer is disabled because the complete target is already visible, and it writes no Reveal signal;
- Mastered applies explicit mastery immediately;
- Vocabulary toggles the independent bookmark without completing exposure;
- Shift+Right or the Skip button atomically records introduction, `needs-guided`, a no-lapse stage-0 review due in 10 minutes, and the aggregate Skip signal;
- leaving through ordinary navigation without Start or Skip writes nothing, so the card shows First Exposure again next time.

### Recall

- Prompt and live result status remain visible; the reserved support slot contains no written study content by default.
- The existing Audio action records level 3 when used before submission without opening the written panel.
- The existing Answer action opens level 4, persists Answer Reveal, and renders the single grammar row without secondary support blocks.
- Hiding Answer removes the row. The stable slot prevents the word track from moving, and recorded support evidence remains monotonic.
- The panel never writes target text into word slots or the hidden input.

### Result

Result reuses the same single grammar row and adds no secondary support blocks or duplicate audio action.

The result label uses this precedence so combined evidence remains unambiguous:

1. `Correct with answer` — the explicit Answer action was used, even if correction also occurred;
2. `Corrected` — exact output followed a submitted `close` or `retry`, without Answer Reveal;
3. `Guided` — exact output occurred in a Guided phase or with target-bearing support, including level 4 grammar without the Answer action;
4. `Great` — an Independent first-submission perfect followed ordinary self-editing;
5. `Perfect` — Independent, first-submission perfect, no edits.

Before First Pass, Guided results explain that the sentence will return for an independent recall. After First Pass, they explain that the previously scheduled review remains. Neither is described as a failure.

A voluntary-practice result adds a `Practice only` explanation and makes no scheduling or progress claim regardless of the label above.

### Preferences

The default guidance mode is automatic:

- unintroduced cards use First Exposure and Guided Recall;
- introduced, unpassed cards with `needs-guided` begin Guided Recall;
- introduced, unpassed cards with `ready-independent` begin Independent Recall when eligible;
- passed cards begin Independent or Review Recall with no target-bearing support;
- a lapsed card regains support only after the learner requests it.

No onboarding questionnaire is required. A future `More guidance / Automatic / Minimal` preference is out of scope for the first release.

## Accessibility And Interaction

- Preserve the visually hidden native input for desktop, mobile, and IME entry.
- Preserve the five visible shortcut hints in the established order.
- Support controls are real buttons with 44px minimum targets and visible focus.
- Activating support returns focus to the hidden practice input unless the learner intentionally enters an expandable study region.
- Support changes use polite live announcements, including the new level and whether the recall is now Guided.
- Grammar roles include text labels and do not rely on color.
- Each sentence-map constituent has a screen-reader description that includes its label and text; the complete Target Sentence remains available as coherent accessible text.
- IPA is marked as pronunciation notation; the audio action remains the accessible alternative for users whose screen readers do not handle IPA well.
- The complete Target Sentence is never placed in an `aria-hidden` region while visually visible.
- First Exposure, support expansion, correction, result, and round completion have distinct live announcements.
- Reduced-motion behavior and the existing tactile key feedback remain intact.

## Application And Component Boundaries

### Domain

- Learning Support types and validation;
- SentenceLearningState and First Pass invariants;
- RecallSupportLevel evidence classification;
- Guided/Independent phase transitions;
- requeue spacing and cap;
- course progress derived from First Pass;
- review scheduling under assisted and independent evidence.

### Application

- load and persist SentenceLearningState;
- resolve Guided versus Independent acquisition from AcquisitionStatus;
- build resolved Practice turns for lesson, review, course, and vocabulary scopes;
- coordinate First Exposure completion;
- submit one atomic result containing PracticeLog, ReviewState, and optional First Pass changes;
- expose the recommended next Lesson after true completion;
- provide Quick Start state without embedding card-level rules in React.

### Infrastructure

- IndexedDB table and migration for SentenceLearningState;
- atomic persistence across learning state, review state, and log;
- legacy backfill;
- default catalog revision installation;
- clearing behavior for learning progress and device data.

### Presentation

- Quick Start wrapper;
- First Exposure view inside Practice;
- Learning Support panel;
- combined Answer / Learning Support disclosure and evidence tracking;
- pronunciation and grammar rendering;
- Guided result and accurate round-completion states;
- direct Next lesson action.

## Persistence And Migration

IndexedDB advances to schema version 4. It adds SentenceLearningState and indexes the new log discriminator and turn identifier while retaining the legacy outcome index:

```text
practiceLog: "id, cardId, submittedAt, outcome, kind, turnId"
sentenceLearningStates: "cardId"
```

Migration backfills learning state without taking away existing progress:

1. Find the earliest historical perfect PracticeLog for each card where `answerWasRevealed` is false. Treat it as a legacy First Pass even when target audio was used, because the previous policy allowed audio.
2. If no qualifying log is available and the card is mastered, create a First Pass with explicit-mastery source.
3. Otherwise, if a non-mastered card has ReviewState stage at least 1, create a legacy First Pass at `lastReviewedAt` or migration time.
4. For any First Pass without an earlier introduction event, set `introducedAt` equal to `firstPassedAt`.
5. Do not create learning state for untouched cards.

Migration reads the complete IndexedDB PracticeLog table directly and does not use the repository's recent-500 log projection. Every old row becomes its own non-resumable `legacy:${oldId}` turn with phase `legacy`:

- `perfect`, `close`, and `retry` become Attempts with ID `turn-attempt:legacy:${oldId}:0`, `submissionIndex: 0`, preserved answer and accuracy, and `receivedCorrection: false` because prior correction cannot be inferred;
- `revealed` and `skipped` become signals with ID `turn-signal:legacy:${oldId}`, `updatedAt` equal to `submittedAt`, the corresponding signal kind, and `reviewFailureRecorded: true` because a legacy turn can never resume;
- any legacy row with `answerWasRevealed: true` receives support level 4 and Answer support kind; otherwise missing support evidence normalizes to level 0, an empty support-kind list, and `receivedCorrection: false`.

New attempt persistence writes SentenceLearningState, ReviewState, and PracticeLog in one transaction when more than one changes. New aggregate signal rows use `turn-signal:${turnId}` as the primary key, so upsert and retry remain idempotent even if the client cannot tell whether an earlier transaction committed.

Support requests that change ReviewState or AcquisitionStatus use the same transaction boundary as the aggregate signal update that adds `support-used` or `revealed`. Merely hiding an already-open panel causes no write.

Every Progress and success-measure projection filters on the log discriminator and phase. Signal rows are never counted as submissions or assigned artificial accuracy; submission accuracy and retention projections exclude `voluntary-practice` Attempts.

`clearLearningProgress` clears SentenceLearningState, ReviewState, and PracticeLog. Vocabulary remains. `clearAll` also clears SentenceLearningState and the Quick Start UI preference.

Learning Support is an optional field inside SentenceCard, so Course bundle schema version 2 remains valid. Older bundles remain importable when their Prompts pass the universal non-target-bearing rule; structured support is validated only when present. Export includes it automatically.

Starter Foundations advances its Course revision so existing installations receive the authored support. Course content installation does not overwrite ReviewState or SentenceLearningState.

## Error Handling

- If First Exposure persistence fails, remain on the current card and show a retry action; do not silently proceed as though introduction was saved.
- If an atomic result write fails, retain the current answer, support level, and controls so the learner can retry.
- Invalid support content rejects the entire imported catalog before any write.
- Unsupported or missing Learning Support falls back to a simple First Exposure with full target and audio, followed by the existing recall controls in a Guided phase.
- Unavailable speech synthesis leaves IPA and text support usable and announces that audio is unavailable.
- A missing preferred voice falls back to a system `en-US` voice when possible.
- A malformed IPA string is a content-validation failure, not a runtime rendering failure.
- If previously stored content is discovered with a target-bearing Prompt, Practice blocks that card without changing ReviewState or lapse count and identifies it for corrected re-import; it never starts an automatically failed Review.
- A missing card reference or learning-state reference produces an explicit error instead of an empty Practice screen.

## Local Success Measures

The feature does not add remote analytics. Existing local logs plus support evidence should make these projections possible:

- time from First Exposure to First Pass;
- highest support level used per card and Lesson;
- percentage of cards independently passed in the same round;
- reveal and skip rate before First Pass;
- next-day retention after First Pass;
- cards repeatedly reaching the requeue cap;
- Quick Start completed versus dismissed.

Progress UI may use these later, but a new analytics dashboard is not required for the first release.

## Test Strategy

### Domain Tests

- support validation for missing text, duplicate keywords, invalid roles, invalid dialect, non-reconstructing chunks, frames without blanks, and target-bearing Prompts;
- AcquisitionStatus transitions for exposure, guided completion, correction, support, reveal, skip, and First Pass;
- First Pass qualification across every practice phase, outcome, and support level;
- only the first complete submission can qualify, while a corrected perfect cannot;
- canonical and reviewed acceptable answers both satisfy exact instructional completion in Guided and Corrective phases;
- First Pass remains after retry, reveal, skip, lapse, and unmastering;
- explicit mastery creates a First Pass and removes the card from active queues;
- acquisition failures do not increment lapse, while post-pass failures do;
- target audio and IPA promote support to level 3;
- full grammar chunks and Answer promote support to level 4;
- only the Answer kind sets `answerWasRevealed`; level 4 grammar does not;
- support levels cannot decrease within a turn;
- opening support keeps `needs-guided`; only a later exact instructional completion sets `ready-independent`;
- before First Pass, Reveal remains on the current card, exact text afterward becomes Independent-ready, and Skip remains pending;
- assisted exact after First Pass creates no AcquisitionStatus and keeps the prior review schedule;
- self-edited first-submission level 0 perfect remains independently eligible and receives the shorter interval;
- close/retry followed by corrected perfect retains the scheduler outcome of the first submission;
- support or Reveal after a submitted `close` or `retry` cannot overwrite that first-result schedule;
- Skip after a submitted `close` or `retry` also retains the first-result schedule and never increments lapse twice;
- post-pass `close` and `retry` evaluations retain their distinct six-hour and focused-review policies;
- voluntary Try-again support, Audio, Answer, Skip, and submissions never change learning or review state, while explicit Mastered still applies;
- guided perfect before First Pass stays stage 0 and is requeued;
- requeue spacing, no immediate duplicate, two-return cap, one-card and last-remaining-card fallbacks, and active-round precedence over `dueAt`;
- course and path completion use First Pass rather than current ReviewState stage.

### Application Tests

- First Exposure writes introduction without Attempt or review advancement;
- reloading an introduced unpassed card restores Guided or Independent-ready mode from AcquisitionStatus;
- Guided perfect writes evidence but no First Pass;
- Independent perfect atomically writes First Pass, ReviewState, and PracticeLog;
- support, reveal, and skip commands idempotently upsert one deterministic turn signal and apply lapse at most once;
- retrying the same deterministic Attempt command returns its persisted result without another log or schedule change;
- failed atomic write leaves the current turn recoverable;
- lesson Learn queues select cards without First Pass in outline order;
- Review queues retain current due behavior and exclude mastered cards;
- Quick Start uses the first three Starter cards and dismissing the wrapper creates no card-level signal;
- submission and accuracy projections exclude signal and voluntary-practice rows, while raw activity may label voluntary Attempts separately;
- completed Lessons resolve a direct next recommendation;
- an old bundle version 2 with safe Prompts imports without Learning Support;
- supported bundle data survives export and import.

### Infrastructure Tests

- schema version 4 creates the new table and indexes PracticeLog `kind` and `turnId`;
- migration backfills earliest qualifying legacy perfect, then mastered fallback, then non-mastered stage fallback in that order;
- migration fills every required Attempt and signal field while treating each legacy row as a non-resumable legacy turn;
- migration preserves previously completed courses after a later stage-0 lapse;
- atomic transactions include all changed records;
- deterministic signal upsert remains idempotent across an uncertain write retry;
- deterministic Attempt IDs remain idempotent while correction submissions keep distinct indexes;
- Reset learning progress and Clear this device use the required clearing semantics.

### Presentation Tests

- First Exposure shows target, audio, IPA, grammar, and Start recall;
- First Exposure commands follow the defined Enter, Audio, Answer, Mastered, Vocabulary, Skip, and leave behavior;
- Guided Recall begins at level 0 with an empty support slot and announces its Guided phase;
- `Ctrl+;` reveals one combined Answer and attribute panel without filling word slots;
- recall Audio records level 3, while the combined Answer and written attributes record level 4;
- closing a hint does not lower evidence;
- support used after submission does not mutate the submitted result;
- Reveal stays on the current card and exact typing afterward shows Correct with answer;
- the five shortcut hints remain present and ordered;
- keyboard and button paths share the same support and submission policy;
- Guided, Perfect, Great, Corrected, and Correct with answer results render distinctly;
- result precedence covers correction plus Reveal and level 4 grammar without Reveal;
- pending cards produce Round complete rather than Lesson complete;
- completed Lessons expose Next lesson;
- grammar roles remain understandable without color;
- screen-reader announcements cover phase and support changes.

### Content Tests

- all 20 Starter Foundations cards have complete Learning Support;
- every Starter grammar chunk has complete token analysis, covering 122 ordered tokens in the initial course revision;
- Starter Foundations keeps stable card and Lesson IDs while using the approved within-Lesson order;
- every Starter pronunciation entry is labeled `en-US` and has non-empty sentence and chunk IPA;
- pronunciation and grammar chunks reconstruct the canonical target;
- every frame contains blanks and every keyword occurs in the target;
- every card has at most two grammar points;
- every Prompt remains non-target-bearing, and target-bearing imported Prompts are rejected;
- ambiguous Prompts have a target-form anchor in Learning Support or a reviewed acceptable answer;
- contractions, punctuation, and proper names remain evaluable.

### Final Verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- keyboard-only browser flow for Quick Start, Guided Recall, Independent Recall, reveal, a `retry` evaluation, voluntary Try again, and next Lesson;
- mobile and desktop checks at 375px, 768px, 1024px, and 1440px;
- screen-reader review of First Exposure, IPA labeling, support changes, and result announcements;
- refresh during First Exposure, Guided Recall, and pending Independent Recall;
- offline verification with unavailable speech synthesis.

## Delivery Sequence

1. Add SentenceLearningState, First Pass progress, migration, and atomic persistence.
2. Add RecallSupportLevel, guided scheduling policy, phase transitions, and requeue tests.
3. Add structured Learning Support and catalog validation.
4. Author and review support for the 20 Starter cards, apply the approved within-Lesson order, and bump the Course revision.
5. Build First Exposure, Learning Support panel, pronunciation, grammar, and result states.
6. Add Quick Start and direct Next lesson flow.
7. Complete accessibility, responsive, migration, and browser verification.

Every step keeps the existing unsupported-card recall path operational so the feature can be delivered incrementally.

## Acceptance Scenarios

### New Beginner Card

1. The learner sees the full target, audio, General American IPA, chunks, and grammar in First Exposure.
2. They start Guided Recall with the written support slot empty.
3. A perfect answer is labeled Guided and does not complete the card.
4. The card returns after two other turns with only context support, even when 10 minutes have not elapsed because the round is still active.
5. A perfect answer creates First Pass and schedules stage 1 review.

### Answer-Assisted Acquisition

1. An unpassed card is in Independent Recall and the learner chooses Show answer.
2. The turn becomes Guided at level 4, persists one Reveal signal, remains on the same card, and keeps `needs-guided`.
3. The learner types the exact sentence and sees Correct with answer.
4. The exact instructional completion sets `ready-independent` without creating First Pass or advancing ReviewState.
5. The card returns only after the in-round spacing rule or the cross-round due time.

### Existing Passed Card Uses Audio

1. The learner starts a due Review with no target-bearing support.
2. They play target audio before submitting.
3. The turn becomes level 3 Guided Recall.
4. Even with exact text, ReviewState returns to focused review and increments lapse once.
5. Course completion remains unchanged because First Pass is retained.

### Corrective Practice After Independent Recall

1. The learner submits a complete but imperfect answer without target-bearing support.
2. Matched words remain; incorrect words clear without revealing them.
3. The first result updates ReviewState and the turn records `receivedCorrection`.
4. The learner fills the missing words and reaches exact text.
5. The result is Corrected, does not create First Pass, and does not undo the scheduler outcome of the first submission.
6. The card returns later for a fresh Independent Recall.

### Explicit Mastery Before Practice

1. The learner marks an unintroduced card mastered.
2. SentenceLearningState records introduction and First Pass with explicit-mastery source.
3. ReviewState moves to stage 6 and the card leaves every active queue.
4. If the learner later marks it new, First Pass remains while ReviewState returns to focused review.

### Unsupported Imported Card

1. The card has no structured Learning Support.
2. First Exposure shows the full target and available local audio.
3. The first recall falls back to the existing Prompt, word track, and Answer controls; it remains a Guided phase even if its active support level is 0.
4. The card still requires a later level 0 Independent Recall for First Pass.

### Target-Bearing Imported Prompt

1. An imported card's Prompt contains its complete English target or configures target audio to play automatically.
2. Catalog validation rejects the bundle before writing any card and identifies the offending card ID.
3. The author moves the target form into Learning Support or First Exposure and supplies a non-target-bearing Prompt.
4. After re-import, both acquisition and later Review can reach level 0 Independent Recall without an automatic lapse.

### First Exposure Skip

1. The learner sees an unintroduced card and uses Shift+Right before Start recall.
2. The app atomically records introduction, `needs-guided`, a no-lapse stage-0 due time, and one Skip signal.
3. It creates no Attempt or First Pass and advances to the next card.
4. The skipped card resumes in Guided Recall when eligible.

### Voluntary Try Again

1. A correct result has already applied its ordinary learning and scheduling changes.
2. The learner uses `Ctrl+;` to Try again.
3. A new `voluntary-practice` turn provides normal input, support, Audio, Answer, Skip, and feedback.
4. Those signals and its result are logged but do not change First Pass, AcquisitionStatus, ReviewState, or lapse count.
5. If the learner explicitly chooses Mastered, normal mastery semantics still apply; Vocabulary also remains independent.

### Quick Start Dismissal

1. The learner dismisses Quick Start before practicing a card.
2. No skip log, Attempt, ReviewState, or SentenceLearningState is created by dismissal.
3. The same Lesson opens in normal Guided Learn.

## Non-Goals

- AI-generated hints, grammar explanations, answers, or pronunciation.
- Speech recognition or pronunciation scoring.
- British IPA or multi-dialect pronunciation data in the first release.
- A full grammar curriculum, grammar exercise engine, or sentence-diagram editor.
- Runtime morphological analysis or automatic S/V/O inference.
- Reauthoring all 120 default cards in the first release.
- Treating every natural translation as an accepted target.
- Filling learner word slots with revealed target words.
- Changing the five visible Practice shortcut order.
- Remote audio assets, backend services, authentication, cloud sync, or telemetry.
- Hard course prerequisites or changes to the current LearningPath recommendation model.
