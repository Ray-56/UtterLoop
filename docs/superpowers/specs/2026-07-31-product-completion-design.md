# UtterLoop Product Completion Design

Date: 2026-07-31
Status: Approved for implementation by user request

## Goal

Complete the local-first learning product around the guided sentence-learning core.

The [Guided Sentence Learning Design](./2026-07-31-guided-sentence-learning-design.md) defines how a sentence is introduced, recalled, corrected, passed, and scheduled. This document defines the surrounding product behavior required to make those rules safe, recoverable, understandable, portable, and verifiable in everyday use.

The change has eight outcomes:

1. Review can be inspected and filtered without exposing an answer before recall.
2. Review, Vocabulary, and Mastered items can be managed without entering a full queue.
3. Replay course actually traverses the complete Course, and a completed Lesson offers a direct Next lesson action.
4. Failed local writes are recoverable and destructive operations require explicit confirmation.
5. Progress distinguishes instructional coverage from retention and reports all-time values truthfully even after more than 500 log rows.
6. A versioned full backup can restore curriculum, learning evidence, review state, Vocabulary, and preferences atomically.
7. Practice scopes are deep-linkable, and an interrupted local session can resume its current turn and draft.
8. Public test seams, component coverage, end-to-end checks, and real-browser visual acceptance make the completed behavior auditable.

## Relationship To Existing Specifications

The specifications have the following priority when their wording overlaps:

1. The Guided Sentence Learning Design is authoritative for First Pass, SentenceLearningState, PracticePhase, Recall Support, ReviewState scheduling, lapse counting, requeue behavior, idempotent turn writes, and true Lesson completion.
2. This document is authoritative for Review disclosure, Review management, complete Course replay selection, Next lesson navigation, operation recovery UI, destructive confirmation, Progress projections, full backups, app routes, resumable UI checkpoints, and the final browser gate.
3. The [Scalable Course Catalog Design](./2026-07-19-scalable-course-catalog-design.md) remains authoritative for catalog discovery, Course detail, filters, and Course URL behavior except where this document generalizes URL handling into one application route model.
4. The [Course and Practice Flow Design](./2026-07-19-course-learning-flow-design.md) remains the baseline for the shell and Practice scopes, subject to the explicit superseding rules above.

This document does not redefine an Attempt, First Pass, exact instructional completion, Guided versus Independent evidence, or review intervals. For example, complete Course replay changes which cards are selected, but scheduling each resulting turn still follows the Guided Sentence Learning Design.

Implementation priority is:

- **P0 dependency:** complete the Guided Sentence Learning domain, schema version 4 migration, and atomic turn persistence first.
- **P1 completion:** Review safety and management, real Course replay, Next lesson, command recovery, and destructive confirmations.
- **P2 depth:** truthful Progress, full backup, session and route continuity, component/end-to-end coverage, and browser acceptance.

Schema version 5 in this document must be layered after the approved version 4 migration. It must not fold version 4 backfill into a new one-step migration.

## Product Rules

- No Review queue preview, accessible label, tooltip, or metadata field may contain `SentenceCard.english`, an acceptable answer, full-sentence IPA, target audio, or target-bearing Learning Support.
- Review shows Due and Upcoming as distinct groups. An item can appear in exactly one group.
- The selected Review Course filters the visible counts, lists, and the queue started by `Start review`.
- The filter is optional. `All courses` starts an unscoped Review.
- Mastered cards remain out of active PracticeQueue instances but are visible in a management section and can be returned to `new` explicitly. Unmastering retains First Pass as required by the Guided Sentence Learning Design.
- Vocabulary remains independent from ReviewState. A saved item can be removed from Review, and an active saved item can start a one-card Vocabulary practice scope.
- A mastered Vocabulary item remains removable but cannot start active practice until the learner returns it to `new`.
- `Replay course` resolves `{ kind: "course", courseId }`; it never aliases the first Lesson.
- Course replay follows Course Unit, Lesson, and card array order and includes every non-mastered referenced card exactly once.
- `Next lesson` is shown only after true Lesson completion. A pending Guided or Independent card produces Round complete, not Lesson complete, and cannot expose Next lesson.
- A failed write never advances the UI optimistically past the current durable state. The exact failed command remains retryable.
- Practice routes render the cockpit as their first visible content. They omit the visible page-level Practice heading and routine sync strip while retaining a screen-reader-only `Practice session` heading.
- Routine local-save success, normal speech-synthesis availability, and successful pronunciation playback are silent. They do not create `Saved locally`, audio-ready, playback-success, toast, or live-region noise.
- A non-blocking continuity-save failure uses a compact, action-specific Retry notice in the cockpit top bar and does not displace the word track. A critical Practice write failure retains the current card and draft and remains blocking until retry or another explicitly safe recovery action succeeds.
- A destructive operation never starts on its first button press. It first opens an accessible confirmation that states exactly what is kept and removed.
- Progress labels distinguish all-time aggregates from a recent-log sample. No projection may present a 500-row window as all local history.
- Course coverage is derived from First Pass. Retention is derived from ReviewState and qualifying Attempt evidence. They are never combined into one mastery percentage.
- Full backup is separate from Course bundle import/export. Course bundles share curriculum; full backups restore one local UtterLoop installation.
- Full backup restore is replacement, not merge. It validates the complete file before showing a destructive confirmation and writes nothing when validation fails or the learner cancels.
- A Practice route contains scope identity only. Draft answers, support evidence, and other private turn state never appear in the URL.
- Leaving Practice does not fabricate an Attempt, signal, lapse, or First Pass. A session checkpoint is UI continuity, not learning evidence.
- Refresh resumes only a compatible checkpoint. Invalid, stale, or content-mismatched checkpoints are discarded with a recoverable explanation instead of being applied to a different card.
- All completed behavior must pass automated tests and a real-browser inspection at the required breakpoints before implementation is declared complete.

## Review Workspace

### Safe Review Projection

Review does not receive `SentenceCard` objects for queue rows. The domain/application boundary returns an explicit safe read model:

```ts
type ReviewReadiness = "acquisition" | "retention";

interface ReviewDashboardItem {
  cardId: SentenceCardId;
  prompt: string;
  courseIds: CourseId[];
  courseTitles: string[];
  source: string;
  stage: MasteryStage;
  dueAt: string;
  isDue: boolean;
  readiness: ReviewReadiness;
  isInVocabulary: boolean;
}

interface MasteredDashboardItem {
  cardId: SentenceCardId;
  prompt: string;
  courseIds: CourseId[];
  courseTitles: string[];
  source: string;
  masteredAt?: string;
  isInVocabulary: boolean;
}

interface VocabularyDashboardItem {
  cardId: SentenceCardId;
  prompt: string;
  courseIds: CourseId[];
  courseTitles: string[];
  source: string;
  savedAt: string;
  isMastered: boolean;
}

interface ReviewDashboard {
  selectedCourseId: CourseId | null;
  courseOptions: Array<{
    courseId: CourseId;
    title: string;
    dueCount: number;
    upcomingCount: number;
  }>;
  due: ReviewDashboardItem[];
  upcoming: ReviewDashboardItem[];
  mastered: MasteredDashboardItem[];
  vocabulary: VocabularyDashboardItem[];
}
```

These interfaces deliberately have no `english`, `acceptableAnswers`, `note`, `learningSupport`, or audio field. Presentation code must not join queue rows back to the complete Card collection. Starting Practice passes `cardId` or a Review scope to the application layer, which resolves the full Card only inside Practice.

The safe-projection test serializes both the read model and rendered Review markup and asserts that unique target strings and acceptable answers are absent. This includes visually hidden text, `aria-label`, `title`, and data attributes.

### Course Membership And Filtering

Course membership is derived from Course outlines. A card referenced by more than one stored Course receives every Course ID and title in deterministic catalog order. Selecting a Course includes a card when that Course references it; the item is still emitted once.

The Review Course selector:

- begins with `All courses`;
- includes every stored Course with attempted, mastered, or Vocabulary activity, even when its current due count is zero;
- displays the Course's current due count;
- persists `reviewCourse` in the application URL;
- falls back to All courses with a polite notice when a copied Course ID no longer exists;
- scopes Due, Upcoming, Mastered, Vocabulary, and their counts so the page remains internally consistent;
- passes the same Course ID into `{ kind: "review", courseId }` when Review starts.

Standalone Cards that are not referenced by a Course remain visible under All courses and are labelled `Imported / uncategorized`. They cannot be selected through a nonexistent Course filter.

### Due And Upcoming

Due contains attempted, non-mastered items with `dueAt <= now`. Upcoming contains attempted, non-mastered items with `dueAt > now`. Both use the review-queue eligibility rules in the Guided Sentence Learning Design, including acquisition-stage focused review.

Ordering is deterministic:

1. earliest `dueAt`;
2. lowest ReviewState stage;
3. Course catalog order;
4. Card ID.

The sections are always separately labelled. Due shows its full filtered count and `Start review`. Upcoming initially renders the first eight items and states `Showing 8 of N` when truncated; `Show all upcoming` expands it without changing the Practice queue. A zero-Due state does not hide Upcoming.

Rows display only the Prompt, Course, source, stage/readiness, and relative/absolute due time. They provide no play-audio or reveal action.

### Vocabulary And Mastered Management

Vocabulary and Mastered are supporting management sections below the queue. They may be collapsed by default when empty, but their item count and heading remain discoverable.

Vocabulary item actions are:

- `Practice one` -> `{ kind: "vocabulary", cardId, courseId? }` for a non-mastered saved Card;
- `Remove` -> delete only VocabularyEntry;
- `Return to new` -> available when the saved Card is mastered, then permits Practice one.

The existing bulk `Practice vocabulary` action starts `{ kind: "vocabulary", courseId? }` and includes all filtered, saved, non-mastered Cards in `savedAt` order. The optional Course ID is present when the Review filter is scoped and absent for All courses. Removing one item does not alter First Pass or ReviewState.

Mastered item actions are:

- `Return to new` -> apply the Guided Sentence Learning unmastering rule;
- Vocabulary `Save` or `Remove` -> modify VocabularyEntry independently.

Returning a card to `new` sets its ReviewState to focused review using the approved scheduling rule and retains its monotonic First Pass. It does not make a completed Course incomplete.

Every row action has its own pending state, disables duplicate invocation, exposes `aria-busy`, and reports success or failure next to the row. Focus stays on the initiating action after success when the row remains. When removal removes the row, focus moves to the section heading or the next item.

## Practice Scope Completion

### Complete Course Replay

The existing PracticeScope union is refined to support one-card Vocabulary practice while retaining the already-approved Course scope:

```ts
type PracticeScope =
  | { kind: "lesson"; courseId: CourseId; lessonId: CourseLessonId; mode: "learn" | "replay" }
  | { kind: "review"; courseId?: CourseId }
  | { kind: "vocabulary"; cardId?: SentenceCardId; courseId?: CourseId }
  | { kind: "course"; courseId: CourseId };
```

`buildCourseReplayQueue` resolves a Course scope by walking canonical Unit, Lesson, and Card order. It:

- validates every Card reference before returning a session;
- excludes mastered Cards from the active queue;
- emits every other Card once;
- attaches item-level Course, Unit, and Lesson context so the Practice breadcrumb changes as the replay crosses Lesson boundaries;
- returns an explicit empty reason when the Course is missing, has no cards, or every Card is mastered;
- delegates each turn's learning/scheduling phase to the Guided Sentence Learning policy.

The completed-Course primary action in Course detail dispatches `onReplayCourse(courseId)`. `onReplayLesson` remains a separate Lesson-row action. Labels and callbacks may not alias one another.

Course replay completion says `Course replay complete`, keeps `Practice again`, and offers `View course`. It never claims a new Course completion solely because the replay itinerary ended.

### Direct Next Lesson

The application exposes a pure recommendation:

```ts
interface NextLessonAction {
  courseId: CourseId;
  courseTitle: string;
  lessonId: CourseLessonId;
  lessonTitle: string;
  scope: Extract<PracticeScope, { kind: "lesson" }>;
}

function resolveNextLessonAction(input: {
  completedCourseId: CourseId;
  completedLessonId: CourseLessonId;
  learningPaths: LearningPath[];
  courses: Course[];
  courseProgress: CourseProgress[];
}): NextLessonAction | null;
```

For a Course in a LearningPath, it returns the current post-write LearningPath recommendation, which is the earliest Lesson still lacking First Pass evidence. This naturally selects the following Lesson after an in-order completion while also recovering an earlier incomplete Lesson after out-of-order study.

For a standalone Course, it returns the first incomplete Lesson after the completed Lesson in that Course's canonical order, then the first earlier incomplete Lesson if study occurred out of order. It returns `null` when no incomplete Lesson remains.

The Lesson summary renders `Next lesson: {title}` as the primary action only when:

- the current scope is `lesson/learn`;
- every Card in the Lesson now has First Pass or explicit mastery;
- there is a valid recommendation.

Clicking it starts a new `lesson/learn` scope and pushes a Practice URL. When no recommendation remains, the primary action is `View learning path`; `Practice again` remains secondary. `lesson/replay`, Course, Review, Vocabulary, and Round-complete summaries do not fabricate a Next lesson action.

## Recoverable Operations

### Command State

Every mutating learner command uses one shared state shape:

```ts
type OperationState<T> =
  | { status: "idle" }
  | { status: "pending"; commandId: string }
  | { status: "succeeded"; value: T }
  | {
      status: "failed";
      commandId: string;
      message: string;
      retry: () => Promise<T>;
    };
```

This shape can be implemented by a hook/controller, but domain results and repository errors remain framework-independent. Commands retain immutable arguments until success. Practice attempt and signal retries reuse the deterministic IDs required by the Guided Sentence Learning Design; they do not allocate another turn or submission index.

Required recovery behavior:

- A debounced checkpoint or equivalent UI-continuity save may fail non-blockingly only when the current durable learning state remains valid and continued typing cannot fabricate an Attempt or learning signal. Its top-bar notice persists until Retry succeeds or the learner explicitly dismisses it.
- Attempt failure retains draft, caret, phase, support evidence, result eligibility, and current item.
- Reveal, support, Skip, Mastered, and Vocabulary failures retain the current card and show an inline Retry action.
- Review-row management failure keeps the row and selected filter.
- Import, restore, reset, clear, and backup failure keep the Settings controls and parsed file available.
- Startup/snapshot failure renders `Retry loading local data`; it does not stop at an error paragraph.
- A response lost after a committed idempotent command can be retried and resolves to the committed result without a duplicate log, lapse, or schedule change.
- Pending state disables only conflicting actions, not unrelated navigation or accessible Cancel actions where cancellation remains safe.
- Material command completion and failures are announced when they change the learner's workflow. Routine checkpoint/local-save success and successful pronunciation playback remain silent. Practice failures that block progress use an assertive announcement once, without repeating on every render.
- Practice has no persistent global save-success pill. A current non-blocking write failure is represented by the compact cockpit top-bar Retry notice; a critical write failure uses the blocking in-cockpit recovery state.

Errors shown to learners use a stable product message plus an optional development detail. Raw IndexedDB stacks are never rendered. Console logging may retain the original Error in development.

### Destructive Confirmation

Use one reusable accessible `ConfirmationDialog` rather than `window.confirm`. It has a labelled title, consequence text, Cancel, and a specifically named destructive action. Opening moves focus to Cancel; Escape cancels; closing restores focus to the opener. The destructive button is visually and semantically distinct.

| Operation | Removed | Preserved | Confirmation action |
| --- | --- | --- | --- |
| Reset learning progress | SentenceLearningState, ReviewState, PracticeLog, active checkpoint | Courses/Cards, Vocabulary, preferences, Quick Start preference | `Reset learning progress` |
| Clear this device | all catalog and learning tables, Vocabulary, preferences, Quick Start preference, active checkpoint | nothing user-created; default catalog is reinstalled after clear | `Clear this device` |
| Restore full backup | all current catalog, learning, Vocabulary, preferences, active checkpoint | nothing from current data unless present in backup; default upgrade may run afterward | `Replace with backup` |

`Restore default courses` is idempotent content installation and does not erase learning evidence, imported Courses, Vocabulary, or preferences; it does not require destructive confirmation. Its pending and failure behavior still follows the shared operation rules.

The confirmation remains open while its transaction is pending. Duplicate activation is disabled. It closes only after success. On failure it displays the error and `Try again`; Cancel remains available and makes no additional write.

After Clear this device succeeds, the application runs default installation as a fresh local device before refreshing the snapshot. The learner sees default Courses with zero learning evidence rather than an unusable empty shell.

## Progress Model

### Recent Rows Versus All-Time Statistics

The repository contract stops using `listPracticeLog()` for two incompatible meanings. It exposes:

```ts
const RECENT_PRACTICE_LOG_LIMIT = 500 as const;

interface RecentPracticeActivity {
  entries: PracticeLogEntry[];
  limit: typeof RECENT_PRACTICE_LOG_LIMIT;
  totalEntries: number;
  isTruncated: boolean;
}

interface PracticeStatistics {
  allTime: AllTimePracticeStatistics;
  daily: DailyPracticeStatistics[];
  byCard: CardPracticeStatistics[];
}

interface TrainingRepository {
  listRecentPracticeActivity(limit?: number): Promise<RecentPracticeActivity>;
  getPracticeStatistics(now: Date, days: number): Promise<PracticeStatistics>;
  // Full backup only; never used by the normal snapshot.
  listAllPracticeLog(): Promise<PracticeLogEntry[]>;
}
```

The normal snapshot contains `recentPracticeActivity` and a derived `progressDashboard`; it no longer exposes an ambiguously named `practiceLog` array. Dexie calculates all-time and per-day aggregates by scanning the complete table with a cursor/reducer instead of loading an unbounded array into React. `totalEntries` comes from the complete table count.

The reducer used by Dexie is also exported as a pure function so fixtures can prove that streaming aggregation and in-memory aggregation have identical results. Full backup deliberately reads every log row and is not capped at 500.

UI wording is exact:

- all-time totals say `All local history`;
- a recent list says `Latest 500 of 1,234 events` when truncated;
- when not truncated it says `123 events recorded locally`;
- no metric computed from the recent window is labelled all-time.

### Metric Semantics

The log discriminator and phase rules in the Guided Sentence Learning Design are authoritative:

- a **submission** is `kind === "attempt"` and `phase !== "voluntary-practice"`;
- a **retrieval check** is a submission with `submissionIndex === 0` in Independent or Review Recall; compatible legacy Attempts may count as checks when no stronger phase data exists;
- **independent accuracy** is the mean accuracy of retrieval checks, not signals or corrective completions;
- **perfect recall** is a retrieval check with outcome `perfect`;
- **retry/close counts** are retrieval-check outcomes, while a separate `corrections completed` count may include later submissions;
- **reveal/skip counts** come from unique signal rows and their `signalKinds`, never from artificial zero-accuracy submissions;
- **practice activity** may include voluntary Attempts only when the label explicitly says activity, never retention or accuracy;
- **First passed** comes from SentenceLearningState, not inferred from a recent log window;
- **due now**, stages, streak, and lapses come from current ReviewState plus complete qualifying history as defined below.

A practice day is a local calendar date containing at least one non-voluntary Attempt. Current streak is the number of consecutive local dates ending today, or ending yesterday when today has no qualifying Attempt yet. Longest streak is calculated over the complete history. The browser's current time zone is displayed beside streak/trend wording because old logs do not store a time-zone identifier.

The trend contains 14 local calendar-day buckets including today. Each bucket contains retrieval checks, perfect recalls, average independent accuracy, and First Pass count. Missing days are emitted as zero-value buckets so charts never compress time.

Mastery distribution displays mutually exclusive current groups:

- Untouched: no SentenceLearningState and no ReviewState learning evidence;
- Acquiring: introduced without First Pass;
- Stage 0 focused review: First Pass present, non-mastered, ReviewState stage 0;
- Stages 1 through 6: First Pass present, non-mastered, exact current stage;
- Mastered: ReviewState learning status is mastered.

A missing ReviewState for a First-passed, non-mastered Card is an explicit data-integrity warning, not silently counted as a stage.

Weak Cards are non-mastered Cards with First Pass and either at least one lapse or at least two non-perfect retrieval checks in the last 30 days. Rank them deterministically by:

1. lapse count descending;
2. recent non-perfect retrieval checks descending;
3. independent accuracy ascending;
4. most recent check descending;
5. Card ID.

Show at most eight. The row uses Prompt, Course, stage, lapses, recent result, and due time; it does not expose the Target Sentence before a future recall. Weak-card ranking uses complete ReviewState plus the required 30-day aggregate, not the recent 500-row sample.

### Progress Interface

Progress contains four calm, block-based sections:

1. **Overview:** First passed / total, due now, independent accuracy, and current streak.
2. **Learning path coverage:** Path, Course, Unit, and Lesson First Pass counts with accessible disclosures. It never regresses after lapse.
3. **Retention health:** mastery-stage distribution, all-time perfect/retry/reveal/skip counts, longest streak, and the 14-day trend.
4. **Needs attention:** up to eight Weak Cards and an honest empty state.

Charts use semantic text values and CSS bars without adding a chart dependency. Every bar has an accessible label containing the value and denominator; color is not the only distinction. Zero-data states explain what first action will create data instead of rendering misleading 0% success claims.

## Full Local Backup

### Format

Course bundles remain schema version 2 and continue to contain curriculum only. A full backup uses a distinct discriminator and version:

```ts
const FULL_BACKUP_SCHEMA_VERSION = 1 as const;

interface UtterLoopFullBackup {
  format: "utterloop-full-backup";
  schemaVersion: typeof FULL_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  databaseSchemaVersion: 5;
  catalog: {
    categories: CourseCategory[];
    learningPaths: LearningPath[];
    courses: Course[];
    cards: SentenceCard[];
  };
  learning: {
    sentenceLearningStates: SentenceLearningState[];
    reviewStates: ReviewState[];
    practiceLog: PracticeLogEntry[];
    vocabularyEntries: VocabularyEntry[];
  };
  preferences: AppPreferences;
}
```

`AppPreferences` includes theme, preferred speech voice URI, key-sound mute state, and the versioned Quick Start preference. Unknown localStorage values and browser/system voice inventories are not backup data.

Active Practice checkpoints are deliberately excluded. Restoring an old draft could replay a stale turn against newer durable evidence. Restore clears the current checkpoint and opens the normal recommended Practice state.

The export filename is `utterloop-full-backup-YYYY-MM-DD.json`. Settings explains that the file may contain typed answers and learning history and should be stored privately. Export reads complete tables in one consistent read transaction so related log, learning, and review records describe the same point in time.

### Validation And Restore

`validateFullBackup` is a pure, side-effect-free boundary. It validates before any confirmation or write:

- exact format and supported schema version;
- valid exported timestamp and known database schema version;
- complete Course catalog validation, including Learning Support;
- unique primary keys in every collection;
- every ReviewState, SentenceLearningState, PracticeLog, and VocabularyEntry references an included Card;
- Guided Sentence Learning invariants for learning state, PracticeLog kinds/turn IDs, and ReviewState;
- finite, valid timestamps and bounded numeric fields;
- valid known preference values.

An invalid backup reports a path-oriented message such as `learning.practiceLog[42].cardId references a missing Card` and writes nothing.

After validation, Settings shows a summary with Course, Card, First Pass, ReviewState, log, and Vocabulary counts plus exported date. The learner then confirms `Replace with backup`.

Restore uses one version-5 Dexie transaction that clears and bulk-writes every catalog, learning, Vocabulary, and preferences table. It also clears the active checkpoint. If any write fails, the transaction rolls back completely and the current installation remains available. After success, default installation may add or revision-update built-in content by stable ID but must not overwrite restored learning state.

Import does not merge by timestamp or ID, and it does not partially accept valid sections from an invalid file. Forward versions are rejected with a message that the app must be updated.

## Application Routes

### Unified URL State

The Course-only URL helper becomes one pure application URL model without adding a Router dependency:

```ts
interface AppUrlState {
  view: AppView;
  catalog: {
    query: CourseCatalogQuery;
    selectedCourseId: CourseId | null;
  };
  reviewCourseId: CourseId | null;
  practiceScope: PracticeScope | null;
}
```

Canonical examples are:

```text
?view=practice&scope=lesson&practiceCourse=starter-foundations&practiceLesson=sf-l01&practiceMode=learn
?view=practice&scope=review&practiceCourse=work-study-essentials
?view=practice&scope=course&practiceCourse=starter-foundations
?view=practice&scope=vocabulary&practiceCard=sf-011
?view=practice&scope=vocabulary&practiceCourse=starter-foundations
?view=review&reviewCourse=starter-foundations
?view=courses&course=starter-foundations&q=starter&sort=progress
```

Catalog discovery parameters may remain latent when another view is active so returning to Courses restores discovery context. `course` is reserved for Course detail; Practice uses `practiceCourse` to avoid ambiguous parsing.

Parsing is defensive:

- unknown views fall back to Practice with no scope;
- an incomplete scope becomes `null`, never a partially valid object;
- unknown enum values are ignored;
- after the snapshot loads, missing Course/Lesson/Card references produce a recoverable `Practice link is no longer available` state with `Continue recommended` and `Browse courses`;
- an invalid `reviewCourse` falls back to All courses with a notice.

The URL never includes Card target text, draft answer, turn ID, support level, elapsed time, score, or preference values.

### Browser History

History behavior is consistent across views:

- sidebar navigation, starting a Practice scope, opening Course detail, and Next lesson push a meaningful entry;
- search, Course filters, Review Course filter, sort, and load-window changes replace the current entry;
- typing and Practice checkpoint changes do not touch history;
- browser Back restores the prior view and parsed scope without starting a second session;
- a copied Practice scope URL opens that scope after refresh;
- direct Course-detail entry retains the existing safe `All courses` fallback rather than navigating away from the application.

One `popstate` handler applies a parsed `AppUrlState`; components do not call History APIs independently.

## Resumable Practice Checkpoint

### Stored Shape

Schema version 5 adds a local UI checkpoint:

```ts
interface PracticeSessionCheckpoint {
  id: "active";
  schemaVersion: 1;
  scope: PracticeScope;
  scopeKey: string;
  catalogFingerprint: string;
  itinerary: ResolvedPracticeOccurrence[];
  currentOccurrenceId: string;
  draft: string;
  selectionStart: number;
  selectionEnd: number;
  turn: {
    turnId: string;
    phase: PracticePhase;
    supportLevelUsed: RecallSupportLevel;
    supportKindsUsed: RecallSupportKind[];
    receivedCorrection: boolean;
    reviewFailureRecorded: boolean;
    submissionIndex: number;
  };
  elapsedSeconds: number;
  itemElapsedSeconds: number;
  stats: PersistedSessionStats;
  updatedAt: string;
}
```

Each itinerary occurrence has its own stable ID as required by the Guided Sentence Learning Design. The fingerprint covers the referenced Course revision, ordered Lesson/Card IDs, and Card `updatedAt` values; it contains no target text.

Checkpoint persistence is separate from the transaction that records an Attempt or signal. It never changes SentenceLearningState or ReviewState. Draft changes are debounced by at most 250ms; phase changes, support changes, navigation, successful commands, pause, and `visibilitychange` to hidden request an immediate checkpoint write. The app does not rely solely on `beforeunload`.

### Resume And Reconciliation

On Practice entry:

1. Parse and validate the URL scope.
2. Load the active checkpoint.
3. Resume automatically when its scope matches, fingerprint is current, occurrence still exists, and durable learning state does not contradict the saved turn.
4. Reconcile deterministic Attempt/signal IDs with stored logs. If a command committed before the response was lost, use its persisted result rather than submitting again.
5. Restore item, draft, caret, turn phase, maximum support, elapsed values, and session statistics. Audio playback and key-depression animation never resume automatically; Pause resumes as unpaused with a notice.

Navigating to another app view retains the checkpoint. Returning to Practice resumes it. Starting a different explicit Practice scope replaces the active checkpoint because that action intentionally starts another session. `Start over` clears the checkpoint and rebuilds the same scope; if the checkpoint contains a non-empty draft or pending in-round returns, it uses a small confirmation.

A checkpoint is incompatible when:

- its schema version is unknown;
- scope or occurrence references no longer resolve;
- its catalog fingerprint changed;
- the Card became mastered or was removed;
- its submission index/turn evidence conflicts with durable log rows;
- its timestamp is more than 30 days old.

An incompatible checkpoint is deleted without changing learning evidence. The UI explains `Your previous practice could not be resumed because the course changed` and offers the current recommended scope. Successful Lesson/Course/Review/Vocabulary completion, Reset learning progress, Clear this device, and full restore clear the checkpoint.

## Persistence Version 5

After version 4 from Guided Sentence Learning, Dexie adds:

```text
appPreferences: "id"
practiceSessionCheckpoints: "id, updatedAt"
```

There is one `AppPreferences` row with ID `device` and at most one active checkpoint with ID `active`.

Startup performs an idempotent preference migration after the database opens:

- read the recognized legacy localStorage keys for personalization and key sound;
- validate and write a single AppPreferences row only when no row exists;
- include the Quick Start preference when its guided-learning implementation still uses localStorage;
- remove recognized legacy keys only after the IndexedDB write succeeds;
- leave unrelated localStorage keys untouched.

This move makes full backup and Clear this device transactional for application-owned preferences. A storage failure leaves the legacy values readable for the next startup attempt.

Version 5 repository operations include:

- safe Review and Progress projections;
- complete Course replay resolution through application use cases;
- preference load/save;
- checkpoint load/save/delete;
- consistent full-backup read;
- atomic full-backup replacement;
- atomic Reset and Clear table sets.

Reset clears the checkpoint in the same transaction as learning state. Clear and restore include both new tables in their transactions.

## Architecture And Component Boundaries

### Domain

- safe Review dashboard projection and deterministic Course membership;
- Due/Upcoming and Weak Card ordering;
- all-time PracticeLog reducer and 14-day bucket derivation;
- mastery distribution and retention/coverage separation;
- complete Course replay selection;
- Next lesson resolution from First Pass progress;
- full-backup structural and cross-reference validation where it concerns domain records.

No React, Dexie, URL, Blob, or browser API enters these functions.

### Application

- compose ReviewDashboard and ProgressDashboard from repository data;
- start exact Review, Course, Lesson, and Vocabulary scopes;
- coordinate final-state Review management actions;
- provide immutable retryable command descriptors;
- export and replace full backup;
- validate scope/checkpoint compatibility against the current snapshot;
- reconcile deterministic turn persistence before resume.

### Infrastructure

- Dexie version 5 tables and ordered migration after version 4;
- cursor-based complete-log aggregation and recent-500 query;
- consistent backup read transaction and atomic replacement transaction;
- preference migration from recognized localStorage keys;
- checkpoint persistence and clearing semantics.

### Presentation

- `ReviewView` consumes only ReviewDashboard, never raw Cards for queue rows;
- `ProgressView` consumes ProgressDashboard and does not derive metrics from recent rows;
- `SettingsView` separates curriculum bundles from private full backup;
- `ConfirmationDialog` and `OperationFeedback` provide consistent pending/error/retry behavior;
- `PracticeWorkbench` is split into session controller/reducer, stable board, learning-support/result surface, and summary components so persistence policy is not trapped in one large component;
- `App` owns one parsed route state and delegates History writes to route helpers.

Splitting PracticeWorkbench is an implementation boundary, not a visual redesign. The stable direct-input surface, hidden native input, shortcut order, tactile behavior, and accessibility rules remain unchanged.

## Public Test Seams

The following are exported, deterministic seams intended for both implementation and tests. They are public within the source tree, not a promise of an external npm API.

| Seam | Contract tested without UI/private internals |
| --- | --- |
| `buildReviewDashboard(input, now)` | target-free DTO, membership, filter, grouping, ordering, counts |
| `buildCourseReplayQueue(course, cards, reviewStates, learningStates, now)` | complete canonical traversal, mastered exclusion, context, errors |
| `resolveNextLessonAction(input)` | path and standalone recommendation, null completion |
| `reducePracticeStatistics(state, log)` and `finalizePracticeStatistics` | complete-history metrics, signal/phase exclusions, day buckets |
| `deriveProgressDashboard(input, now, timeZone)` | coverage, distribution, streak, Weak Cards, zero-data states |
| `parseAppUrlState(search)` / `buildAppUrlState(state)` | canonical round trip, safe invalid values, parameter cleanup |
| `practiceScopeKey(scope)` / `catalogFingerprint(scope, catalog)` | stable identity and checkpoint compatibility |
| `reducePracticeSession(state, event)` | item/draft/phase/command recovery without rendering |
| `validateFullBackup(unknown)` | complete path-oriented validation with no writes |
| `exportFullBackup(repository, now)` / `restoreFullBackup(repository, backup)` | complete read and one replacement call |
| Repository `replaceAllData` contract | exact version-5 transaction table set and rollback behavior |

Test fixtures use fixed `now`, explicit time zone, stable IDs, and dependency-injected download/clock/history adapters. Tests do not monkey-patch component-private state or assert deep CSS selectors.

Export focused presentation components or view-model renderers for:

- Review Due/Upcoming groups and management rows;
- Progress overview, coverage, retention, and Weak Card sections;
- ConfirmationDialog pending/failure states;
- Practice empty, recoverable error, Round-complete, Lesson-complete, and Course-complete summaries.

Static markup tests prove disclosure and accessible semantics. Real interaction belongs in the browser suite.

## Accessibility And Visual Behavior

- Review filters have visible labels. Counts update through `aria-live="polite"` without moving focus.
- Target-free Review markup includes no hidden answer. Screen-reader-only text follows the same disclosure rule as visible content.
- Due, Upcoming, Vocabulary, and Mastered use labelled regions with heading/count relationships.
- Row status never relies only on mint, yellow, coral, or blue.
- ConfirmationDialog traps focus while open, restores focus on close, and exposes pending/error status.
- Operation retry buttons have action-specific labels such as `Retry saving Vocabulary`, not a page full of indistinguishable `Retry` buttons.
- Progress charts expose textual values and do not rely on hover.
- Route changes move focus to the destination heading. Practice uses its screen-reader-only heading for route structure, then moves focus to the hidden input when the cockpit is ready; resuming Practice does the same after announcing the restored item.
- Checkpoint restore does not speak the learner's draft or the Target Sentence automatically.
- The established graphite navigation, white training surfaces, high-contrast borders, restrained hard shadows, radii of 6px or less, and accent palette remain in force.
- No new gradients, ornamental illustration, marketing hero, remote audio, or one-color treatment is introduced.
- Review, Progress, Settings, and summaries have no horizontal overflow at 375px. Actions retain 44px targets and visible keyboard focus.
- `prefers-reduced-motion` continues to remove nonessential transition, pulse, and scrolling animation.

## Test Strategy

### Domain Tests

- Review safe DTO omits every target-bearing property and rendered fixtures contain no target or acceptable answer;
- Due/Upcoming boundaries at equal `now`, deterministic ties, Course filtering, multi-Course cards, and standalone cards;
- Mastered and Vocabulary projections remain independent;
- complete Course replay across multiple Units/Lessons, mastered exclusion, missing references, and all-mastered empty state;
- Next lesson for in-order, out-of-order, cross-Course path, standalone Course, and all-complete cases;
- aggregate metrics with signals, corrections, voluntary Attempts, legacy Attempts, and more than 500 rows;
- local-day streak at day/month/year and daylight-saving boundaries using an explicit time zone;
- 14-day zero buckets, First Pass counts, mastery distribution, missing-review integrity warning, and Weak Card ranking/ties;
- full-backup duplicate IDs, missing references, invalid dates/preferences, unsupported version, and Guided invariants;
- route parse/serialize round trips and incomplete/unknown scope fallback;
- checkpoint reducer, fingerprint mismatch, stale checkpoint, and deterministic-command reconciliation.

### Application Tests

- selected Review Course produces the same filtered count and Practice scope;
- one-card and bulk Vocabulary scopes include only eligible saved Cards;
- returning Mastered to new retains First Pass and schedules focused review;
- Replay course dispatches Course scope rather than Lesson replay;
- true Lesson completion resolves Next lesson after the refreshed atomic write;
- each failed command retains an immutable retry descriptor and retry reuses its command ID;
- startup load exposes Retry and can recover;
- snapshot exposes recent activity metadata plus complete Progress, not ambiguous recent logs;
- full export contains every table row including log 501+ and current preferences;
- invalid/cancelled full restore makes no repository call;
- successful restore performs one replacement call and clears checkpoint;
- Reset, Clear, and Restore use the exact preservation matrix;
- resumed committed commands return stored results without duplicate consequences.

### Infrastructure Tests

- version 4 migration runs before version 5 and existing learning evidence survives;
- version 5 creates preference and checkpoint indexes;
- legacy preference migration is idempotent and removes recognized keys only after success;
- recent activity returns exactly the newest 500, complete count, and `isTruncated`;
- cursor aggregation includes rows older than the recent window and matches the pure reducer;
- consistent backup read includes every table inside one read transaction;
- replacement clears and writes every required table in one transaction and rolls back on injected failure;
- Reset and Clear include SentenceLearningState plus the version-5 checkpoint semantics;
- Clear reinstalls defaults only after the clear transaction succeeds.

### Presentation Tests

- Review initial markup and accessible names contain Prompts but no targets;
- Due and Upcoming remain distinct at zero/non-zero combinations;
- Course filter count, Mastered undo, Vocabulary remove, and one-card Practice expose correct callbacks and pending/error states;
- Course detail calls `onReplayCourse`, while Lesson rows call `onReplayLesson`;
- summaries distinguish Round, Lesson, Course, Review, and Vocabulary completion and render Next lesson only when eligible;
- Practice write failure preserves the word track/draft and shows an action-specific retry;
- Practice opens directly on the cockpit with no visible page heading or routine success pill, retains its screen-reader-only heading, and distinguishes compact non-blocking save recovery from blocking critical-write recovery;
- Reset, Clear, and full restore require ConfirmationDialog and cancel restores focus;
- Progress headings, textual chart labels, sample/all-time wording, and empty states are correct;
- invalid URLs and incompatible checkpoints render recoverable actions;
- restored Practice announces continuity and focuses input without exposing the answer.

### End-To-End Browser Tests

Add a small Playwright Chromium suite and `npm run test:e2e`. It runs against the Vite app with an isolated IndexedDB/localStorage context per test and uses seeded fixture helpers rather than depending on test order.

Automated flows cover:

1. open Review, confirm target strings are absent from visible text and accessible names, filter a Course, and start only that Course's due queue;
2. remove one Vocabulary item, unmaster another, and start one-card Vocabulary practice;
3. click Replay course in a two-Lesson Course and observe Cards from both Lessons in order;
4. complete a true Lesson and use Next lesson without returning to Courses;
5. inject one failed persistence command, retain the draft, retry, and prove one log/schedule consequence;
6. cancel Reset, fail a confirmed Reset, retry it, and verify preserved Vocabulary/preferences;
7. create 501+ log rows and verify all-time metrics exceed the `Latest 500` sample;
8. export a full backup, mutate/clear local state, restore it, and verify Course progress, due state, Vocabulary, and preferences;
9. deep-link every PracticeScope, use browser Back, refresh mid-draft, and resume the same occurrence/support level;
10. change Course content under a checkpoint and verify safe invalidation instead of draft application.

The suite does not require network access, remote speech, or a real system voice. Speech synthesis is stubbed where necessary.

### Real-Browser Acceptance

After automated checks, start the built application and inspect it in a real browser. This is a required implementation deliverable, not an optional screenshot exercise.

Inspect 375px, 768px, 1024px, and 1440px widths in light and dark themes for:

- Review Due/Upcoming separation, Course filter, long Prompt/source wrapping, row actions, and no target leakage;
- Course detail Replay course and multi-Lesson breadcrumb transitions;
- Lesson/Round/Course summaries and direct Next lesson;
- compact non-blocking Practice save failure, blocking critical-write failure, Settings confirmation, pending, rollback, and retry states;
- Progress distribution/trend/Weak Card blocks with zero, normal, and 500+ data;
- full-backup validation summary and confirmation;
- refreshed draft/caret restoration and incompatible-checkpoint recovery;
- keyboard-only traversal, visible focus, dialog Escape/focus restoration, and the five Practice shortcut hints in their required order;
- no horizontal overflow, clipped focus rings, overlapping controls, unexpected layout shift, missing icons, console errors, unhandled promise rejections, or local asset 404s.

The browser record should note the tested URL, viewport, flow, result, console status, and any screenshot used to diagnose a defect. Defects found during inspection are fixed and the affected automated/manual checks rerun before completion.

### Required Final Checks

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- built-app HTTP check under the repository base-path behavior
- real-browser acceptance at 375px, 768px, 1024px, and 1440px
- browser console and local network-asset inspection

## Delivery Sequence

1. Complete the Guided Sentence Learning version-4 foundation and retain all of its tests.
2. Add safe Review projections, Course filter, Due/Upcoming sections, Mastered undo, and Vocabulary item management.
3. Wire true Course scope from Course detail and add item-level replay context.
4. Add Next lesson resolver and summary navigation after true completion.
5. Introduce shared operation state, Practice retry retention, startup retry, and accessible destructive confirmations.
6. Replace ambiguous recent logs with recent metadata plus complete cursor aggregation; build the deeper Progress projection/UI.
7. Add version-5 preferences and checkpoint tables, migrate recognized preferences, and implement unified URL state.
8. Add checkpoint save/resume/reconciliation and invalidation.
9. Add full-backup validation, consistent export, atomic replacement, privacy copy, and Settings UI.
10. Split Practice session orchestration from its board while preserving the direct-input interface.
11. Complete component tests, Playwright flows, accessibility checks, responsive styling, and real-browser acceptance.

Each step keeps Course bundle import/export and unsupported-card Practice operational. Persistence changes are delivered in migration order; later UI must not be used to conceal an incomplete migration or non-atomic use case.

## Acceptance Scenarios

### Target-Free Filtered Review

1. Starter Foundations has two due Cards and Work & Study has one.
2. The learner opens Review before practicing.
3. The DOM and accessibility tree contain Prompts, Courses, stages, and due times but no Target Sentence, acceptable answer, IPA, or target audio label.
4. They select Work & Study.
5. Due shows one item, Upcoming/Mastered/Vocabulary use the same Course scope, and `Start review` opens `{ kind: "review", courseId: "work-study-essentials" }`.

### Due And Upcoming Are Distinct

1. A Course has one ReviewState due exactly now and ten future ReviewStates.
2. Due shows the first Card once and Upcoming shows the ten future Cards without duplication.
3. Upcoming initially says `Showing 8 of 10` and expands all ten on request.
4. The learner can start the one due Card without exposing any future answer.

### Return A Mastered Vocabulary Card

1. A Card has First Pass, `learningStatus: mastered`, and a VocabularyEntry.
2. It appears in filtered Mastered and Vocabulary management but not an active queue.
3. `Practice one` explains that it must first return to new.
4. The learner chooses Return to new.
5. First Pass and Course completion remain; ReviewState becomes focused review; Practice one becomes available; Vocabulary remains saved.

### Remove And Practice One Vocabulary Item

1. Two non-mastered Cards are saved.
2. Removing the first deletes only its VocabularyEntry and leaves its learning/review state unchanged.
3. `Practice one` on the second opens a Vocabulary scope containing exactly that Card.
4. Returning to Review preserves the selected Course and the first item stays removed.

### Complete Course Replay

1. A completed Course has two Units, four Lessons, and twenty Cards; one Card is mastered.
2. The learner chooses Replay course from Course detail.
3. The route contains `scope=course` and the Course ID, not a Lesson ID.
4. Practice traverses nineteen non-mastered Cards in Unit/Lesson/Card order and updates its breadcrumb at Lesson boundaries.
5. The summary says Course replay complete and offers View course and Practice again.

### Direct Next Lesson

1. The learner completes the last pending Independent Recall in Lesson 1.
2. The atomic result refresh proves every Lesson 1 Card has First Pass.
3. The summary says Lesson complete and names Lesson 2 as Next lesson.
4. Activating it pushes a Lesson 2 Learn URL and opens its first eligible turn.
5. If Lesson 1 instead ends with a pending card, the summary says Round complete and no Next lesson is rendered.

### Lost Attempt Response

1. An Independent perfect transaction commits, but the client receives a simulated transport/storage response error.
2. The learner remains on the same Card with the same draft and sees Retry saving answer.
3. Retry sends the same turn/submission ID.
4. The stored result is returned, the UI advances once, and there is one Attempt, one First Pass, and one ReviewState advancement.

### Failed Destructive Action

1. The learner presses Reset learning progress.
2. Nothing is deleted; a dialog explains that learning state/logs/checkpoint are removed while Courses, Vocabulary, and preferences remain.
3. Cancel restores focus and all data remains.
4. On a later confirmation, an injected transaction failure keeps the dialog open and the original data intact.
5. Try again succeeds once and the preserved data matches the stated matrix.

### More Than 500 Events

1. Local PracticeLog contains 650 rows, including qualifying Attempts older than the newest 500.
2. Progress says `Latest 500 of 650 events` for recent activity.
3. All local history metrics, streak, trend where applicable, and Weak Card ranking use all required rows rather than the 500-row sample.
4. Full backup exports all 650 rows.

### Coverage And Retention Diverge

1. Every Card in a Lesson has First Pass, but one Card later lapses to stage 0.
2. Learning path coverage remains 100% for that Lesson.
3. Retention distribution shows the Card in Stage 0 focused review, Due reflects its schedule, and Needs attention ranks it from lapse evidence.
4. No UI describes the Lesson as incomplete.

### Full Backup Round Trip

1. The device contains default and imported Courses, SentenceLearningState, ReviewState, 501+ logs, Vocabulary, dark theme, a preferred voice, muted key sounds, and completed Quick Start preference.
2. Export creates a private full-backup file containing every listed durable record and no active checkpoint.
3. The learner changes and clears local state, selects the backup, reviews its counts, and confirms replacement.
4. Restore atomically returns curriculum, First Pass coverage, due schedule, all logs, Vocabulary, and preferences.
5. No stale draft resumes, and default installation does not erase restored learning state.

### Invalid Backup

1. A backup PracticeLog references a missing Card.
2. Validation identifies the exact path before confirmation.
3. Replace with backup is unavailable.
4. Current Courses, learning evidence, Vocabulary, preferences, and checkpoint remain byte-for-byte unchanged.

### Deep Link And Browser Back

1. The learner copies a Lesson Practice URL and opens it in a fresh tab.
2. After snapshot validation, the exact Lesson/learn scope opens.
3. They navigate to Courses, open Course detail, then press browser Back.
4. The prior Courses catalog state and Practice scope history restore without duplicate sessions.
5. A copied URL with a removed Lesson shows recovery actions instead of silently opening another Lesson.

### Resume A Draft

1. The learner is on the third occurrence of a Guided round, has typed part of the answer, opened level 2 support, and placed the caret in the middle.
2. They navigate to Progress and return, then refresh Practice.
3. The same occurrence, draft, caret, phase, maximum support evidence, and in-round itinerary resume.
4. No Attempt, signal, lapse, or First Pass is fabricated by navigation or refresh.
5. Focus returns to the hidden input after a polite resume announcement.

### Reject A Stale Checkpoint

1. A saved checkpoint references Course revision 3 and a Card order that has since changed in revision 4.
2. Practice detects a fingerprint mismatch.
3. It deletes only the checkpoint, leaves durable learning evidence intact, and explains why the draft cannot resume.
4. Continue recommended starts a fresh valid scope.

### Browser Acceptance Gate

1. Automated type, unit/component, build, and Playwright checks pass.
2. The built app is opened at 375px, 768px, 1024px, and 1440px in light and dark themes.
3. The required Review, replay, Next, recovery, Progress, backup, route, and resume flows are exercised keyboard-first.
4. There is no target leakage, horizontal overflow, inaccessible dialog, broken focus restoration, console error, unhandled rejection, or local asset 404.
5. Any defect found is fixed and the relevant checks are rerun before the work is reported complete.

## Non-Goals

- Backend accounts, authentication, cloud sync, cross-device merge, or remote backup storage.
- Encrypting backup files inside the browser or managing user passwords/keys.
- Incremental, differential, automatic, scheduled, or selective backup restore.
- Import conflict resolution, timestamp merging, or restoring only one Course's learning history.
- Remote analytics, telemetry, cohort comparison, leaderboards, social streaks, or push notifications.
- AI-generated weak-card advice, tutor chat, grammar generation, or pronunciation scoring.
- A new routing framework or server-side route handling.
- Multiple concurrent resumable Practice sessions or synchronizing checkpoints across tabs/devices.
- Persisting audio playback, animation frames, DOM focus nodes, or browser voice objects in a checkpoint.
- Exposing Target Sentences on Review or Progress dashboards for convenience.
- Replacing the Practice cockpit, changing its five visible shortcut order, or introducing a game economy.
- A large charting/state-management dependency when pure TypeScript projections and CSS are sufficient.
