# Learning expansion engineering acceptance

Date: 2026-10-23 (Asia/Shanghai)
Status: macOS and Linux engineering gates passed; GitHub CI tracked in the pull request
Scope: [the complete authorized specification](../superpowers/specs/2026-10-22-learning-expansion-design.md)
Pull request and current GitHub CI: [#6](https://github.com/Ray-56/UtterLoop/pull/6)

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
performance run used installed Google Chrome 155.0.8059.85. The full Linux arm64 matrix used the official Playwright 1.62.1 Noble image,
Node 24.18.1, Chromium 151.0.7922.34, Firefox 153.0 and WebKit 26.5.
Its exact application/test source was commit `de85375`; raw environment,
source fingerprints and result evidence are retained in this task’s verification artifacts.

| Gate | Result |
| --- | --- |
| `npm test` | 743 passed; four opt-in performance cases skipped in the ordinary run |
| `npm run typecheck` | Passed |
| `npm run audit:content` | Six Courses, 120 cards, 40 authored supports, zero structural errors |
| Complete Chromium suite | 77 passed; combined Chromium/WebKit command: 85 passed in 38.8 seconds, zero retries |
| WebKit smoke | Eight passed |
| Firefox smoke | Eight passed in the final complete Linux matrix; the [earlier isolated environment report](./2026-10-23-firefox-linux-smoke.md) also records the macOS launch limitation |
| Complete Linux browser matrix | 93 passed in 1.3 minutes, two workers, zero retries: Chromium 77, Firefox eight, WebKit eight |
| `npm run test:e2e:preview` | Two passed under `/UtterLoop/` |
| `npm run build` | Passed; core JS 753.39kB / 223.39kB gzip, optional Studio/typing chunks separate; existing 500kB advisory remains |
| `git diff --check` | Passed |
| `UTTERLOOP_PERFORMANCE=1 npx vitest run scripts/performance.test.ts` | Both 10k/100k application benchmarks passed, with identical complete statistics and Beta projections |
| `RUN_STUDIO_BENCHMARK=1 npx vitest run src/infrastructure/persistence/dexie/LearningStudio.performance.test.ts` | Both 10k/100k checkpoint benchmarks passed |

Earlier complete runs exposed test-readiness boundaries and a real retired-session input window; none were skipped or retried away. Recovery read its final checkpoint before the asynchronous Finish transaction completed; its helper now waits for the exact next index or null. Its original final-null assertion remains, and the failing case passed ten concurrent repeats. The Fluency timing test advanced global Date/time past the ownership lease without allowing real renewal; it now controls only the measurement's monotonic clock. The lease guard remains unchanged, all time exclusions remain asserted, and the case passed three production-preview repeats. A further regression found a short editable window after Quick Start had durably closed. Practice input now requires a ready checkpoint belonging to its current scope; late completions cannot mutate another scope, and scope initialization resets its own busy state. The regression observes actual DOM editability, and another delays delivery of a real IndexedDB completion while navigating Back within the same Workbench. Both original and new journeys passed repeated parallel runs before the final complete matrix.

Linux WebKit exposed a separate Settings defect: four native English voices all reported an empty URI, producing duplicate React keys and making explicit selection indistinguishable from Automatic. Voice selections now use a stable URI/name/language/local-service identity and still resolve historical raw-URI preferences. Three new regressions first reproduced the failure; the targeted test then passed and all eight Linux WebKit smoke tests passed. A native-voice probe confirmed distinct options, IndexedDB persistence, reload recovery and the intended voice object passed to preview. The probe intercepted audio output; speaker sound quality remains unverified.

A later Linux full-matrix run exposed a second caret race: the retry animation frame could select a character typed after the retry began, turning “the” into “he”. A deterministic browser regression holds that frame until after the first character. Caret restoration now happens synchronously with the committed React state, including normalized correction edits; no delayed selection callback remains. The original natural-input case and the deterministic case each passed ten Linux repeats.

The first native Linux CI run also found blank pages during the two 24-navigation layout matrices. Failure-only startup diagnostics identified `net::ERR_INSUFFICIENT_RESOURCES` while Chromium fetched many unbundled development modules. Those two matrices now exercise an isolated production build on port 4175. Their viewports, routes, assertions, timeouts and retry policy are unchanged; the other 91 browser cases retain the development server and React development diagnostics. The workflow keeps failure traces even when retries later recover, and includes subpath-preview failures.

Optional performance commands are deliberately outside the default test run; no CI timing threshold or chunk-size warning was weakened.

## Interaction and visual acceptance

The Studio runner uses hidden native input and renders the learner's text in its word track. Answer support occupies a stable reference band above it. Audio, reveal and skip remain recorded signals; composition Enter does not submit. Local synthesized key feedback shares a persistent mute setting and respects reduced motion. The five displayed hints retain their existing order. Linked Course sentences use the original Master and Vocabulary actions; mastered sources are excluded from active progression. Authored extensions and personal expressions have no Course Vocabulary identity, so those Course actions are explicitly disabled. Previous has both Shift+Left and a button; revisits retain submission counts/drafts and become supported practice. Paused shortcuts cannot reveal the answer.

Automated layout acceptance covers 375×812, 768×1024, 1024×768, 1440×1000 and 844×390 short landscape, in light and dark themes. The controls remain in the viewport without horizontal overflow, with 44px button targets. Screenshots at mobile, tablet and short landscape were visually inspected. Interactive in-app-browser inspection at 1280×720 also completed a family recall through actual input and observed the saved 100% result.

Optional Studio and Fluency chunks load only when needed. A real aborted module request reaches a recoverable error boundary. Production preview verifies that all optional chunks use `/UtterLoop/assets/`, do not load on Settings, and preserve native-input focus after loading.

## Performance boundaries

On this machine, real Google Chrome 155 measured 10k/100k event histories at 84/69ms to editable Practice, 40/31ms from submission to both visible and durable result, and 341/2418ms for complete Progress rendering. These use warm HTTP assets, fresh pages and seeded IndexedDB; they are not cold-network or other-device guarantees. Browser history, scheduling, unique submission persistence and strict evidence denominators were asserted, rather than timing an empty screen.

Studio checkpoint writes use a small state row with global compare-and-swap revisions; validated immutable durable content is cached by content revision and generation. A fake-indexeddb benchmark reduced 100k-history checkpoint autosave from roughly 1.4 seconds to roughly 1ms. A fresh repository still needs about 207ms to read that Studio history in the same Node benchmark; real content appends and complete analytics still scale with history. The initial core JavaScript bundle still exceeds Vite's 500kB advisory.

## Explicit limits

Browser-event tests do not prove native Chinese IME candidate-window behavior, screen-reader speech, audible sound quality or actual finger use. Participant recruitment, delayed retention, sustained return behavior, unprompted conversational use and transfer of typing gains remain unmeasured. [The real-device gap checklist](../../e2e/REAL_BROWSER_GAPS.md) and [learning validation guide](../research/2026-08-01-beta-learning-validation-guide.md) remain active. No first-encounter counter can establish what the learner saw outside its observable Studio history and available personal content. Authored default teaching/test answers are audited as disjoint; unknown retired/imported identities and material seen only elsewhere cannot always be reconstructed. Expression keys prevent equivalent accepted answers or changed IDs from fabricating a new encounter. [The exposure audit](../content/STUDIO_EXPOSURE_REVIEW.md) states this boundary.

The last async character cannot be guaranteed durable if the browser process is forcibly terminated before IndexedDB commits. Explicit Save and leave waits for success; ordinary navigation/unmount/pagehide attempts to flush the current draft. A completed UI transition is observed before reload tests assert durable recovery.
