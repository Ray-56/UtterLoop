# UtterLoop Course and Practice Flow Design

Date: 2026-07-19
Status: Approved in conversation

## Goal

Turn UtterLoop from a flat demo deck into a course-led sentence recall app while preserving its local-first, keyboard-first practice loop.

The change has two coupled outcomes:

1. A learner cannot leave a SentenceCard until the attempt is complete and evaluates as `perfect`.
2. Learning content is organized into independent courses with an ordered outline, a recommended learning path, lesson progress, and safe default content.

## Approved Product Rules

- An incomplete attempt does not create an Attempt, update ReviewState, or advance the learner.
- Enter on an incomplete attempt shows an actionable notice.
- A complete attempt that evaluates as `close` or `retry` records feedback, keeps matched words, clears mismatches and extras, and focuses the first cleared slot without revealing its answer.
- A `perfect` result enables the next SentenceCard. An explicit skip also advances the in-memory round but keeps the SentenceCard in focused review.
- The same rule applies to keyboard and button interactions, with a defensive guard below the event handler.
- Lesson practice always returns the first not-yet-passed SentenceCard in lesson order. It does not use `dueAt` to choose first-pass lesson content.
- Navigating away or refreshing cannot skip a failed lesson card because it remains the first unpassed card.
- A lesson is complete when every referenced SentenceCard has received at least one perfect recall or has been explicitly marked mastered.
- Course completion and long-term spaced-review mastery are distinct progress measures.
- Courses are independent. The previous Deck model and old IndexedDB data do not need to be supported.
- The app will use a new IndexedDB database and schema. The old database is not read or migrated, but it is not silently deleted.

## Domain Model

### LearningPath

An ordered recommendation across independent courses.

```ts
interface LearningPath {
  id: string;
  title: string;
  description: string;
  courseIds: string[];
}
```

A Course can exist without a LearningPath. The default catalog ships with one path that orders the three default courses.

### Course

Course owns the instructional outline. Array order is the canonical order; no prerequisite graph or enrollment aggregate is required.

```ts
interface Course {
  id: string;
  title: string;
  description: string;
  level: string;
  revision: number;
  license: ContentLicense;
  units: CourseUnit[];
}

interface CourseUnit {
  id: string;
  title: string;
  description: string;
  lessons: CourseLesson[];
}

interface CourseLesson {
  id: string;
  title: string;
  objective: string;
  sourceUrl?: string;
  cardIds: string[];
}

interface ContentLicense {
  name: string;
  url: string;
  attribution: string;
}
```

Course bundles are validated before persistence:

- path, course, unit, lesson, and card IDs are unique in their required scope;
- every lesson card reference resolves;
- a card appears at most once in a course;
- all required titles, objectives, prompts, target sentences, and license fields are non-empty.

### SentenceCard

`SentenceCard` remains the atomic recall item but removes `deckId`. Course membership and order are owned by the Course outline.

Optional provenance fields allow a card to retain a more specific source than the enclosing course:

```ts
interface SentenceCard {
  id: string;
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
```

### Course Progress

Progress is a derived projection and is not stored as a percentage.

- attempted: ReviewState has `lastReviewedAt` or an explicit mastered status;
- passed: ReviewState stage is at least 1, or status is mastered;
- lesson completed: all lesson cards are passed;
- unit/course completed: all child lessons are completed;
- recommended lesson: first incomplete lesson in path/course order.

Mastery remains a separate projection of ReviewState stage and explicit mastered status.

## Practice Scopes

The application layer owns content selection through an explicit scope:

```ts
type PracticeScope =
  | { kind: "lesson"; courseId: string; lessonId: string; mode: "learn" | "replay" }
  | { kind: "review"; courseId?: string }
  | { kind: "course"; courseId: string };
```

- `lesson/learn` selects the first unpassed card in lesson order.
- `lesson/replay` practices all lesson cards in outline order.
- `review` selects only already-attempted cards whose ReviewState is due.
- `course` reinforces cards from one course without altering its outline.

React receives a resolved queue/read model. Course filtering, completion rules, and recommended-next logic do not live in components.

## Attempt Gate and State Machine

Attempt completeness is a domain rule based on normalized token counts across the canonical target and all acceptable answers. An attempt is ready for evaluation when it contains at least as many normalized tokens as one accepted candidate. This allows a shorter valid alternative while still blocking a visibly unfinished canonical answer. Extra tokens are evaluated normally and cannot produce `perfect` unless normalization matches an accepted answer.

The application use case checks readiness again before writing, so UI event paths cannot create incomplete Attempt records.

```text
Typing
  ├─ Enter + incomplete -> notice; remain Typing; no persistence
  └─ Enter + complete -> Evaluating

Evaluating
  ├─ perfect -> persist result -> Passed
  └─ close/retry -> persist result -> clear mismatches/extras -> focus first cleared slot -> NeedsRetry

NeedsRetry
  └─ fill cleared slots without automatic answer hints -> Enter checks same card

Passed
  └─ Enter or next button -> next unpassed card or LessonComplete
```

Keyboard resolution receives attempt completeness and the evaluation outcome instead of collapsing all feedback into `hasResult`. The advance function also checks for `perfect`, so mouse clicks and future callers cannot bypass the gate.

## Persistence

Use a new IndexedDB database, `utterloop-courses`, starting at schema version 1:

- `learningPaths`
- `courses`
- `sentenceCards`
- `reviewStates`
- `practiceLog`

The previous `utterloop` database is ignored and remains recoverable through browser storage tools. No compatibility parser or migration is implemented.

Default content installation is idempotent by stable ID and revision. On startup it installs missing default paths, courses, and cards. It does not pre-create ReviewState rows, because untouched course cards must not appear in Review.

Import/export uses one versioned format:

```ts
interface CourseBundleExport {
  schemaVersion: 1;
  learningPaths: LearningPath[];
  courses: Course[];
  cards: SentenceCard[];
}
```

Invalid bundles are rejected before any write. Import is atomic.

## Default Learning Path

Ship one path with three independent courses. Each course has two units, four lessons, and five cards per lesson: 60 cards total.

1. **Starter Foundations** — original UtterLoop content released under CC0. Introductions, routines, needs, and clarification.
2. **Everyday English with VOA** — a curated selection from VOA Learning English beginner lessons. Only VOA-produced course material is used; every lesson retains its source URL and required VOA credit. AP, Reuters, AFP, and other third-party material is excluded.
3. **Work & Study Essentials** — original UtterLoop content released under CC0. Status updates, requests, planning, and feedback.

Tatoeba is not included in the initial default catalog. Its CC0 subset may become a future reviewed import source, but community sentences require additional language-quality review.

Add `CONTENT_LICENSES.md` and surface the same attribution, license, and source links inside Settings and course details. Code licensing and course-content licensing remain separate.

## Information Architecture

Keep the existing five-part application shell and Practice as the center of gravity.

### Practice

- Defaults to the recommended lesson when no explicit scope is selected.
- Shows Course / Unit / Lesson breadcrumb and lesson-card progress.
- Keeps the stable direct-input stage and uses the Julebu-compatible five-shortcut order: Audio, Master, Vocabulary, Check/Next, Answer/Retry.
- The primary shortcut label is Check, Edit answer, Next, or Complete lesson according to state.
- A LessonComplete state summarizes the lesson and recommends the next lesson.

### Courses

Replace Library with Courses.

- A path header shows overall completion and a Continue action.
- Independent course blocks show level, completion, unit count, lesson count, and license.
- Selecting a course reveals a vertical Unit/Lesson outline.
- Lesson rows show objective, card count, status, and Start/Continue/Practice again.
- The path is a recommendation, not a hard lock; any course remains accessible.

### Review

- Shows due items only from cards that have been attempted.
- Supports an optional course filter.
- Starting review opens Practice with review scope.
- Unseen future lesson cards never enter Review.

### Progress

- Shows path/course/lesson completion separately from recall mastery.
- Keeps practice accuracy, perfect recalls, retries, streak, and attempt counts.

### Settings

- Imports and exports versioned course bundles.
- Shows Content licenses.
- Separates Restore default courses, Reset learning progress, and Clear this device.

## Accessibility and Interaction

- Preserve focused practice-stage input with no visible textarea; use a visually hidden native input for mobile and IME support.
- Preserve screen-reader instructions and polite live announcements.
- Announce incomplete, retry, success, and lesson-complete states distinctly.
- Buttons and keyboard shortcuts share the same action policy.
- Preserve the five visible shortcut hints and their order.
- Keep the persistent mute control outside the shortcut list.
- Preserve reduced-motion behavior and 44px minimum targets.

## Error Handling

- Repository startup failures render the existing error state.
- Invalid default bundles fail fast during development tests.
- Invalid imported bundles show a non-destructive validation message.
- Atomic bundle installation prevents partially installed courses.
- Missing course/card references produce explicit validation errors rather than empty practice screens.
- A failed persistence operation leaves the learner on the current card and restores controls.

## Test Strategy

Follow red-green-refactor for each behavior.

Domain tests:

- attempt completeness across canonical and acceptable answers;
- only perfect evaluations can advance;
- course-bundle validation;
- lesson, unit, course, and path progress derivation;
- lesson learning queues keep failed cards first and ignore `dueAt`;
- review queues exclude untouched cards.

Application tests:

- incomplete submission performs no writes;
- close/retry persists feedback but resolves the same lesson card;
- perfect advances to the next unpassed card;
- default installation is idempotent;
- bundle import is validated and atomic.

Presentation tests:

- Enter maps incomplete, retry, and perfect states correctly;
- buttons use the same labels and disabled states;
- lesson completion selects the recommended next lesson;
- course outline and progress projections render from controller data.

Final verification:

- `npm test`
- `npm run typecheck`
- `npm run build`
- browser checks at 375px, 768px, 1024px, and 1440px, including keyboard-only practice.

## Non-Goals

- Backend, authentication, cloud sync, or AI-generated lessons.
- Compatibility with the previous Deck schema or IndexedDB database.
- A visual course authoring tool.
- Hard course prerequisites, enrollment, certificates, social features, or game economy.
- Remote audio assets; speech synthesis and local key sounds remain sufficient.
