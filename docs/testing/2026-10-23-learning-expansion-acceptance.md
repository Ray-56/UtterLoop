# Learning expansion engineering acceptance

Date: 2026-10-23 (Asia/Shanghai)
Status: Local engineering gates passed; final-commit Linux CI tracked in the pull request
Scope: [the complete authorized specification](../superpowers/specs/2026-10-22-learning-expansion-design.md)

This report records engineering evidence, separately from the participant and real-device evidence needed for learning-effect claims. No backend, account, cloud synchronization, remote analytics or AI grading was introduced. The five primary destinations and the default Course learning path remain.

## Delivery ledger

| Requirement | Implementation and evidence |
| --- | --- |
| Content quality | All 120 default cards across six Courses pass the repeatable structural/content audit. Work & Study adds 20 authored Learning Support records, bringing the supported total to 40. Editorial decisions and their primary references are in [CONTENT_REVIEW](../content/CONTENT_REVIEW.md); the generated [catalog audit](../content/catalog-audit.md) records the full inventory. Browser acceptance teaches, hides and recalls a Work & Study sentence. |
| Long-history performance | Ordinary Practice uses bounded recent history and an indexed turn query; Progress shares one complete history read between its statistics and Beta projection. Equal-statistics, request deduplication, stale-response, freshness and error/retry tests preserve truthful results. [Same-process baseline/comparison](./2026-10-22-long-history-performance.md) and [real Chrome 10k/100k results](./performance/2026-10-23-chrome-long-history.md) distinguish their measurement environments. |
| Multi-tab safety | Native lock, expiring durable token and a persistent ownership epoch give one active Practice writer. The epoch rejects a superseded writer even after both leases are released; the newest writer can still flush its own draft when leaving. Vocabulary management uses the same ownership boundary. Explicit takeover invalidates the earlier writer. Generation checks reject old writes after restore/reset/clear, including the initiating page. Two-page browser journeys cover reload, takeover and replacement; independent-repository tests cover transactions and stale writes. |
| Fluency Pass | Visible-target typing follows a language result or acquired-sentence selection. Timing, net WPM, final character accuracy, editing, pauses and physical-key aggregates remain independent. [Detailed acceptance](./2026-10-22-fluency-acceptance.md) covers real input, persistence, IME events, pause semantics, blocked paste/drop/replacement, cancellation, storage failure/idempotent retry and separate progress. |
| Multi-context recall | Twenty acquired Starter cards have authored training and held-out contextual cues. The expression being retrieved remains the taught expression. Browser acceptance verifies hidden-target recall and draft/caret recovery. |
| Sentence Families | Five authored structures each have three taught variants and two held-out combinations. Completing all training variants unlocks the test; training, first-encounter test results, supported attempts and repeats remain explicit. Tests prevent authored test-answer leakage into teaching material. |
| Task rehearsal | Three tasks—requesting an extension, clarifying a misunderstanding and getting hotel help—each have four specified-expression steps. Instruction, checking, skip signals and saved-session recovery are verified. These are constrained rehearsals, not arbitrary English grading. |
| Personal inbox | Confirmed local situation/English/source supports add, edit, remove, guided introduction, independent acquisition and spaced review. Target edits create a new identity. Reveal/skip consequences, future-due voluntary practice, frozen due-round recovery and late-draft navigation are tested. Strict backup validation, round trip, reset retention, replacement and transaction rollback cover durable data. |
| Return Plans | Explainable approximate 3/8/15-minute plans cap their itinerary at 3/6/10 items, place oldest due work first, bound other work and do not add retries beyond that budget. Ordinary due Review evidence retains its strict meaning. Fixed-clock tests and three browser journeys cover priorities, exhaustion, stale plans and recovery. |
| Observed weakness practice | Recent first unsupported submissions must show a narrow recurring pattern across at least two distinct sentences. Article omissions, for/since and selected agreement contrasts have explicit exclusions for isolated typos, corrections, assisted/future/legacy evidence. Authored contrast practice follows the diagnosis without merging its results into Course retention. |

## Verification commands

Local verification used macOS 27.0.1 arm64, Node 22.23.3 and Playwright 1.62.1.
The default matrix launched Chromium 151.0.7922.34 and WebKit 26.5; the separate
performance run used installed Google Chrome 155.0.8059.85. Firefox 153.0 ran in
the official Linux image, as documented below.

| Gate | Result |
| --- | --- |
| `npm test` | 740 passed; four opt-in performance cases skipped in the ordinary run |
| `npm run typecheck` | Passed |
| `npm run audit:content` | Six Courses, 120 cards, 40 authored supports, zero structural errors |
| Complete Chromium suite | 76 passed; combined Chromium/WebKit command: 84 passed in 1.2 minutes, zero retries |
| WebKit smoke | Eight passed |
| Firefox smoke | Eight passed on official Linux arm64 image; see [environment and raw evidence](./2026-10-23-firefox-linux-smoke.md) |
| `npm run test:e2e:preview` | Two passed under `/UtterLoop/` |
| `npm run build` | Passed; core JS 753.22kB / 223.35kB gzip, optional Studio/typing chunks separate; existing 500kB advisory remains |
| `git diff --check` | Passed |
| `UTTERLOOP_PERFORMANCE=1 npx vitest run scripts/performance.test.ts` | Both 10k/100k application benchmarks passed, with identical complete statistics and Beta projections |
| `RUN_STUDIO_BENCHMARK=1 npx vitest run src/infrastructure/persistence/dexie/LearningStudio.performance.test.ts` | Both 10k/100k checkpoint benchmarks passed |

Earlier complete runs exposed test-readiness boundaries and a real retired-session input window; none were skipped or retried away. Recovery read its final checkpoint before the asynchronous Finish transaction completed; its helper now waits for the exact next index or null. Its original final-null assertion remains, and the failing case passed ten concurrent repeats. The Fluency timing test advanced global Date/time past the ownership lease without allowing real renewal; it now controls only the measurement's monotonic clock. The lease guard remains unchanged, all time exclusions remain asserted, and the case passed three production-preview repeats. A further regression found a short editable window after Quick Start had durably closed. Practice input now requires a ready checkpoint belonging to its current scope; late completions cannot mutate another scope, and scope initialization resets its own busy state. The regression observes actual DOM editability, and another delays delivery of a real IndexedDB completion while navigating Back within the same Workbench. Both original and new journeys passed repeated parallel runs before the final complete matrix.

Optional performance commands are deliberately outside the default test run; no CI timing threshold or chunk-size warning was weakened.

## Interaction and visual acceptance

The Studio runner uses hidden native input and renders the learner's text in its word track. Answer support occupies a stable reference band above it. Audio, reveal and skip remain recorded signals; composition Enter does not submit. Local synthesized key feedback shares a persistent mute setting and respects reduced motion. The five displayed hints retain their existing order. Linked Course sentences use the original Master and Vocabulary actions; mastered sources are excluded from active progression. Authored extensions and personal expressions have no Course Vocabulary identity, so those Course actions are explicitly disabled. Previous has both Shift+Left and a button; revisits retain submission counts/drafts and become supported practice. Paused shortcuts cannot reveal the answer.

Automated layout acceptance covers 375×812, 768×1024, 1024×768, 1440×1000 and 844×390 short landscape, in light and dark themes. The controls remain in the viewport without horizontal overflow, with 44px button targets. Screenshots at mobile, tablet and short landscape were visually inspected. Interactive in-app-browser inspection at 1280×720 also completed a family recall through actual input and observed the saved 100% result.

Optional Studio and Fluency chunks load only when needed. A real aborted module request reaches a recoverable error boundary. Production preview verifies that all optional chunks use `/UtterLoop/assets/`, do not load on Settings, and preserve native-input focus after loading.

## Performance boundaries

On this machine, real Google Chrome 155 measured 10k/100k event histories at 83/79ms to editable Practice, 33/32ms from submission to both visible and durable result, and 340/2433ms for complete Progress rendering. These use warm HTTP assets, fresh pages and seeded IndexedDB; they are not cold-network or other-device guarantees. Browser history, scheduling, unique submission persistence and strict evidence denominators were asserted, rather than timing an empty screen.

Studio checkpoint writes use a small state row with global compare-and-swap revisions; validated immutable durable content is cached by content revision and generation. A fake-indexeddb benchmark reduced 100k-history checkpoint autosave from roughly 1.4 seconds to roughly 1ms. A fresh repository still needs about 207ms to read that Studio history in the same Node benchmark; real content appends and complete analytics still scale with history. The initial core JavaScript bundle still exceeds Vite's 500kB advisory.

## Explicit limits

Browser-event tests do not prove native Chinese IME candidate-window behavior, screen-reader speech, audible sound quality or actual finger use. Participant recruitment, delayed retention, sustained return behavior, unprompted conversational use and transfer of typing gains remain unmeasured. [The real-device gap checklist](../../e2e/REAL_BROWSER_GAPS.md) and [learning validation guide](../research/2026-08-01-beta-learning-validation-guide.md) remain active. No first-encounter counter can establish what the learner saw outside its observable Studio history and available personal content. Authored default teaching/test answers are audited as disjoint; unknown retired/imported identities and material seen only elsewhere cannot always be reconstructed. Expression keys prevent equivalent accepted answers or changed IDs from fabricating a new encounter. [The exposure audit](../content/STUDIO_EXPOSURE_REVIEW.md) states this boundary.

The last async character cannot be guaranteed durable if the browser process is forcibly terminated before IndexedDB commits. Explicit Save and leave waits for success; ordinary navigation/unmount/pagehide attempts to flush the current draft. A completed UI transition is observed before reload tests assert durable recovery.
