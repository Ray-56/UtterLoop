# Beta Measurement and Readiness

## Problem Statement

UtterLoop can now complete the full sentence-learning loop, but it cannot yet prove that the loop works reliably for Beta learners over time. A learner may finish Quick Start, open Practice, recover an interrupted round, or return for a due Review, while the product records too little durable context to distinguish completion, interruption, abandonment, assistance, and retained Independent Recall. Progress therefore describes activity and current state, but cannot yet calculate the Roadmap's North Star or the supporting activation, acquisition, retention, and habit measures with explicit evidence coverage.

The remaining gaps also affect the learner-facing daily loop. Reloading during Quick Start can lose the intended onboarding entry path, the default Practice entry can prefer new learning while Review is due, and a weak SentenceCard shown in Progress does not yet start focused practice. Older local data can contain target-bearing Prompt text that bypassed current import validation, while legacy PracticeLog rows can be interpreted as independent retrieval even when their evidence is incomplete or revealed. These gaps make a real-user Beta harder to trust even though the underlying Guided Learning foundation is complete.

UtterLoop needs a local-first evidence and entry-point hardening phase before Touch Typing work begins. It must preserve current learning behavior, avoid answer leakage, migrate existing IndexedDB data without fabricating history, and make every reported Beta measure explain what evidence was included or excluded.

## Solution

UtterLoop will add a durable, target-free Practice Session evidence model around the existing PracticeQueue and PracticeLog. A small application-level Practice Session Lifecycle will own session identity, round identity, engagement, checkpoint recovery, terminal outcomes, and idempotent persistence. Existing attempt and signal records will receive optional context for new activity without invalidating legacy rows. Checkpoint and Full Backup schemas will advance compatibly so active work can resume while completed historical evidence remains portable.

The default Practice entry will become due-aware: due Review wins over suggested new learning unless the learner explicitly chooses another scope. Quick Start will preserve its identity through reload and resume from the durable checkpoint. Progress weak-card actions will open a single-card Focused Practice scope whose attempts remain voluntary practice rather than silently changing the normal Review schedule.

A local Beta Readiness projection will calculate the Roadmap measures from SentenceLearningState, ReviewState, PracticeLog, and Practice Session Evidence. Strict measures such as Weekly Retained Independent Sentences will require complete qualifying evidence; legacy or incomplete rows will be excluded and reported as coverage instead of being guessed into success. Progress will present understandable measures and denominators without uploading raw learner data.

Existing persisted SentenceCards will pass through the same target-bearing content safety rules as new imports. Unsafe Prompt text will never be rendered in Review, Progress, or recall Practice. The learner will receive a recoverable, target-free explanation while the original local data remains available for backup or replacement.

The completed slice will be verified at four public seams: the Beta Readiness projection, the Practice Session Lifecycle, the public repository integration, and the running application in automated and real browsers.

## User Stories

1. As a returning learner, I want the main Practice action to start my due Review when reviews are waiting, so that new learning does not hide work that is ready to be recalled.
2. As a learner with no due Review, I want the main Practice action to continue the recommended Lesson, so that the existing learning path remains easy to follow.
3. As a learner who deliberately chooses a Course, Lesson, Review filter, Vocabulary item, or weak SentenceCard, I want that explicit choice to override the default entry, so that the product does not redirect my intent.
4. As a learner entering a course-scoped Review, I want only due cards from that Course, so that the session matches the choice I made.
5. As a learner whose due queue changes after completing a card, I want the next main entry decision to use fresh ReviewState, so that the daily entry does not rely on stale counts.
6. As a first-time learner, I want Quick Start to resume at the same sentence and step after a reload, so that an interruption does not force me to restart onboarding.
7. As a first-time learner, I want Quick Start recovery to remain available after First Exposure has changed SentenceLearningState, so that normal onboarding progress does not make the checkpoint ineligible.
8. As a first-time learner, I want completing Quick Start to be recorded once, so that refreshes or repeated callbacks do not duplicate completion evidence.
9. As a first-time learner, I want dismissing Quick Start to remain distinct from abandoning ordinary Practice, so that my onboarding choice is represented truthfully.
10. As a learner, I want reloading or closing a tab with a resumable draft to count as an interruption rather than abandonment, so that normal browser behavior does not make the product look unusable.
11. As a learner, I want an unsupported, stale, or content-mismatched checkpoint to be invalidated safely, so that corrupt state cannot reopen an incorrect Target Sentence.
12. As a learner, I want starting over to discard the current resumable round only after confirmation and to create one terminal record, so that my deliberate reset is recoverable and measurable.
13. As a learner, I want a late autosave from an unmounted Practice screen to be unable to revive a finished session, so that completed work stays completed.
14. As a learner, I want repeated save or finish retries to be idempotent, so that a transient storage failure cannot duplicate learning evidence.
15. As a learner, I want a storage failure during session completion to keep a clear retry path, so that my successful work is not silently lost.
16. As a learner, I want merely opening Practice without interacting to remain outside the abandonment denominator, so that accidental navigation is not treated as a failed learning session.
17. As a learner, I want my first meaningful interaction to mark the session as engaged, so that completion and abandonment measures describe actual attempts to practice.
18. As a learner, I want typing, continuing First Exposure, using support or audio, revealing, skipping, and submitting to count as meaningful engagement, so that non-typing learning actions are not ignored.
19. As a learner, I want every Practice Session to have a stable identity across reloads, so that one learning intent is not split into multiple sessions.
20. As a learner, I want every Practice Round and scheduled card occurrence to have stable identities, so that same-round learning and requeue behavior can be measured without confusing repeated cards.
21. As a learner, I want a Guided completion that returns later for Independent Recall to remain linked to the same round, so that same-round acquisition is measured correctly.
22. As a learner, I want a requeued sentence to report whether it was inserted, deferred because there was no spacing room, or blocked by a cap, so that the product can explain and measure the actual queue outcome.
23. As a learner, I want the requeue cap to prevent an endless round, so that difficult sentences do not trap me in Practice.
24. As a learner, I want a weak SentenceCard action in Progress to open that one card, so that the diagnosis leads directly to useful practice.
25. As a learner, I want Focused Practice to be labeled as voluntary practice, so that it does not masquerade as a scheduled Review.
26. As a learner, I want Focused Practice not to advance an unrelated Review schedule merely because I chose extra practice, so that the scheduler remains trustworthy.
27. As a learner, I want a missing, mastered, or no-longer-eligible weak card to fail with a clear empty state, so that I am not dropped into a broken Practice screen.
28. As a learner, I want the weak-card Practice URL and checkpoint to preserve only stable identifiers, so that it can reload without storing or leaking the Target Sentence.
29. As a learner, I want unsafe target-bearing Prompt text from older local data to be hidden before Review, Progress, or Independent Recall renders it, so that the product never gives away the answer.
30. As a learner with unsafe legacy content, I want a target-free explanation and a way to replace or re-import the content, so that safety does not look like unexplained data loss.
31. As a learner with unsafe legacy content, I want my ReviewState, SentenceLearningState, Vocabulary, and PracticeLog to remain intact, so that content safety handling does not erase learning history.
32. As a learner, I want safe imported and default SentenceCards to continue working without extra prompts, so that runtime safety checks do not add friction to valid content.
33. As a privacy-conscious learner, I want Beta measures calculated locally, so that my answers and complete learning history do not need to leave the browser.
34. As a learner, I want Progress to show Weekly Retained Independent Sentences, so that I can see how many distinct sentences I recalled successfully after they became due.
35. As a learner, I want that North Star to count only a first complete `perfect` Review submission with support level 0, no reveal, and no correction, so that assistance or retries do not inflate retained recall.
36. As a learner, I want the North Star to require proof that the Review was scheduled and due when attempted, so that ordinary voluntary practice is not mislabeled as retention.
37. As a learner, I want multiple qualifying attempts for one SentenceCard in seven days to count once, so that repetition does not inflate breadth.
38. As a learner, I want Progress to show Quick Start completion and dismissal separately, so that onboarding friction can be diagnosed honestly.
39. As a learner, I want Progress to show engaged Practice Session completion and abandonment with numerators and denominators, so that a percentage remains interpretable.
40. As a learner, I want Progress to show median time from introduction to First Pass, so that difficult acquisition is visible without confusing it with long-term Review.
41. As a learner, I want Progress to show same-round Independent First Pass, so that the learning scaffold can be evaluated within the round where a sentence was taught.
42. As a learner, I want Progress to show the distribution of highest Recall Support used, so that support is treated as diagnostic evidence rather than a hidden penalty.
43. As a learner, I want Progress to show Reveal and Skip before First Pass, so that confusing or premature content can be identified.
44. As a learner, I want Progress to show repeated requeue-cap outcomes, so that sentences that make rounds difficult can be investigated.
45. As a learner, I want Progress to show due Review completion and current due backlog, so that I can distinguish finishing presented work from accumulating work.
46. As a learner, I want Progress to show next-day, 7-day, and 30-day Independent Recall cohorts when enough evidence exists, so that retention can be evaluated at meaningful intervals.
47. As a learner, I want Progress to show completed sessions and active practice days, so that habit evidence is separate from raw Attempt volume.
48. As a learner with older data, I want legacy revealed or corrected attempts excluded from independent retrieval measures, so that historical activity is not upgraded into unsupported success.
49. As a learner with older data, I want legacy rows that lack scheduled-due or session context to remain visible as historical activity but excluded from strict measures, so that no history is fabricated.
50. As a learner, I want every strict measure to show evidence coverage and excluded legacy counts, so that a low or high result is not mistaken for complete data when instrumentation started recently.
51. As a learner, I want an empty metric to say that evidence is not yet available rather than display a misleading zero-percent failure, so that new installations and migrated installations are understandable.
52. As a learner, I want dates and rolling windows calculated in my chosen local time zone, so that active days and seven-day windows align with my calendar.
53. As a learner, I want restoring a current Full Backup to restore durable Practice Session Evidence with the rest of my learning history, so that local measures survive device replacement.
54. As a learner, I want older valid Full Backups to restore with an empty session-evidence collection, so that the schema upgrade does not strand existing backups.
55. As a learner, I want active checkpoints excluded from Full Backup, so that restoring a backup never resurrects a half-finished draft from another browser state.
56. As a learner, I want Reset progress and Clear all to clear the corresponding session evidence and active checkpoint atomically, so that Progress does not retain ghost sessions.
57. As a learner, I want a failed restore to leave my existing catalog, learning history, preferences, and session evidence unchanged, so that validation remains replacement-safe.
58. As a learner, I want the app to remain usable on Chromium, Firefox, and WebKit-class browsers at its supported routes, so that Beta findings are not specific to one engine.
59. As a keyboard learner, I want shortcuts, direct input, caret restoration, paste, and IME composition to keep working after session instrumentation, so that measurement does not damage Practice.
60. As a learner using reduced motion or system theme, I want Practice and Progress to respect those preferences, so that Beta hardening preserves accessibility.
61. As a learner on GitHub Pages, I want direct routes and assets to work under the repository base path, so that production behavior matches local acceptance.
62. As a product owner, I want an explicit real-browser acceptance record with browser, viewport, flow, console result, and observed outcome, so that Beta readiness is auditable rather than inferred only from unit tests.

## Implementation Decisions

### Domain language and boundaries

- Add three explicit domain terms. A **Practice Session** is one learner intent from opening a Practice scope until a terminal outcome. A **Practice Round** is the scheduled set of Practice occurrences within a session. **Practice Session Evidence** is the durable, target-free summary used for lifecycle and Beta measures.
- The current product creates one Practice Round per Practice Session, but both identities are persisted. This keeps today's implementation simple without collapsing concepts needed for future round-level behavior.
- Practice Session Evidence complements rather than replaces PracticeLog, SentenceLearningState, and ReviewState. It records lifecycle and queue summaries; PracticeLog remains the evidence for attempts and learner signals.
- The implementation will not event-source every keyboard or Practice command. Durable lifecycle evidence plus minimal attempt context is sufficient for the approved measures and avoids turning presentation interactions into a new event platform.
- All queue selection, metric eligibility, requeue classification, and content-safety rules remain pure domain or application rules. React renders their results and requests actions but does not own the rules.

### Practice Session Lifecycle

- Introduce a public `PracticeSessionLifecycle` application interface with `open` and `commit` operations. `open` owns checkpoint restoration, stable identity creation, v1-to-v2 checkpoint upgrade, catalog compatibility, and invalidation. It returns the active `sessionId`, `roundId`, and per-occurrence PracticeLog context so Submit, Reveal, Skip, Support, First Exposure, and Mastered use cases do not recreate lifecycle identity in React. `commit` owns monotonic checkpoint revisions and idempotent terminal persistence.
- A session is unengaged when merely opened. It becomes engaged after accepted text input, First Exposure continuation, Recall Support use, target audio, Answer Reveal, Skip, or submission.
- Closing, reloading, backgrounding, or navigating away while a valid checkpoint remains is an interruption and creates no abandonment terminal.
- Terminal evidence is a discriminated result: `completed` for scope, round, or Quick Start completion; `dismissed` for Quick Start dismissal; `abandoned` for an engaged learner-confirmed start-over, explicit replacement, or expired valid checkpoint; and `invalidated` for unsupported, corrupt, catalog-mismatched, or otherwise non-attributable checkpoints.
- Unengaged sessions are excluded from completion and abandonment denominators. Invalidated and dismissed sessions are reported separately from abandonment. An engaged active checkpoint that has exceeded the measurement inactivity threshold is projected as `presumed-abandoned` until it is resumed or durably finalized; the projection is reversible and visibly marked as inferred.
- Terminal persistence and deletion of the matching active checkpoint occur in one repository transaction. Repeating the same terminal commit returns the existing receipt; a conflicting terminal commit returns a typed error.
- Quick Start completion or dismissal updates the Quick Start preference, persists its terminal evidence, and removes its matching checkpoint in that same transaction.
- Checkpoint writes carry a monotonically increasing revision. Repeating the same revision is a no-op, a lower revision is rejected as stale, and no checkpoint write may recreate a terminal session.
- Stable IDs are generated at the lifecycle boundary and supplied to deterministic domain/application operations. Tests can inject clocks and ID factories without exposing those mechanisms in the UI.
- `open` resolves identity in this order: resume a compatible active checkpoint; otherwise honor an eligible Quick Start entry; otherwise use the explicit requested scope; otherwise resolve due Review before the recommended Lesson. A same-scope open resumes. Replacing an engaged different scope requires the existing learner confirmation, then atomically terminates the old session and creates the new session/round. Practice Again always creates new session and round IDs after the prior terminal commit.

### Checkpoint version 2

- Advance the active Practice checkpoint to schema version 2 while accepting valid version 1 checkpoints. Version 2 adds `sessionId`, `roundId`, `entryPoint`, `startedAt`, nullable `engagedAt`, monotonic `revision`, and explicit requeue evidence.
- `entryPoint` distinguishes ordinary Practice from `quick-start-v1`. Quick Start recovery checks this durable value before normal eligibility rules so that First Exposure progress cannot orphan onboarding.
- Requeue evidence distinguishes inserted SentenceCards, deferred SentenceCards for which the round had no valid spacing room, and SentenceCards that reached the round cap.
- Checkpoints remain target-free. They may contain stable card and occurrence identifiers, phase/support state, a learner draft, and queue state, but not a copied Prompt, Target Sentence, accepted answer, or target audio.
- Invalid checkpoint reasons are stable values so they can be shown safely, stored in invalidation evidence, and asserted at the repository and browser seams.
- A structurally and catalog-compatible checkpoint remains resumable for 30 days. The 24-hour measurement threshold only projects a reversible `presumed-abandoned` state; it does not invalidate the checkpoint. After 30 days, an engaged checkpoint is atomically finalized as `abandoned/expired`, while an unengaged checkpoint is discarded without learner-attributed abandonment.
- Only a structurally valid, compatible version 1 checkpoint is upgraded and assigned new session/round IDs. An unreadable legacy checkpoint is discarded without inventing historical Practice Session Evidence.

### Durable Practice Session Evidence

- Add an IndexedDB collection for schema-versioned Practice Session Evidence. Each record includes stable session and round IDs; scope and entry point; started, engaged, and ended times; terminal kind/reason; and a target-free round summary.
- The round summary stores target-free occurrence identity sets rather than independently recomputed counters: initial, scheduled, attempted, completed, skipped, remaining, due-Review scheduled/completed, inserted returns, deferred-no-room cards, requeue-cap cards, introduced cards, and First Pass cards. Completed, skipped, and remaining occurrence IDs form a disjoint partition of scheduled IDs; attempted IDs are a subset of scheduled IDs and may overlap any terminal status. Inserted return IDs are scheduled but not initial. Derived counts come from these sets.
- New PracticeLog rows gain optional context containing `sessionId`, `roundId`, `occurrenceId`, `queueReason`, and the `scheduledReviewDueAt` captured when the occurrence was opened. `queueReason` distinguishes `new-learning`, `due-review`, `focused-practice`, and `voluntary-practice`. Existing rows remain valid without context.
- Every learning write receives the context returned by `open`. Attempt and signal creation copy it into PracticeLog; First Exposure and First Pass outcomes update the round summary through the lifecycle. The Workbench never synthesizes or parses these IDs from UI indexes.
- The same occurrence identity is reused across autosave, reveal/skip signals, correction submissions, and terminal completion. A returned occurrence receives its own stable occurrence identity while retaining the same card and round identities.
- No Practice Session Evidence is synthesized for legacy activity. Historical rows contribute only to measures whose existing evidence is sufficient, and strict metric coverage reports their exclusion.
- Historical Practice Session Evidence may retain stable card, Course, or scope references that no longer exist in the active catalog. Backup validation treats those as history rather than invalid live queue references.

### Practice entry and Focused Practice

- Introduce one deterministic default-entry resolver. If at least one non-mastered ReviewState is due at the supplied time, the default scope is Review. Otherwise the resolver uses the current recommended incomplete Lesson and the existing empty-state fallback.
- Explicit URL or UI scopes always win over the resolver. Browser Back and deep links preserve the existing route behavior.
- Add a `focused` PracticeScope carrying one SentenceCard ID. Progress uses it for weak-card practice; it is not overloaded onto Vocabulary because a weak card need not be a Vocabulary Entry.
- Focused Practice resolves exactly one card that exists, is not mastered, already has a First Pass, and still satisfies the current Weak Card rule; otherwise it returns a typed empty reason. Its recall phase is voluntary practice, so a successful extra attempt does not create or advance ReviewState and cannot establish a First Pass.
- Focused Practice preserves Answer Reveal, Skip, Vocabulary, Mastered, accessibility, checkpoint, and failure-retry behavior. Attempt, Reveal, and Skip remain persisted signals but create no Review scheduling consequence in this scope; explicit Vocabulary and Mastered actions retain their existing independent state changes.
- The new scope is handled exhaustively by URL parsing/serialization, route availability, scope key, catalog fingerprint, checkpoint parsing/recovery, queue building, labels, empty reasons, and Full Backup validation wherever scope values are persisted.
- The requeue rule returns a discriminated `inserted`, `deferred-no-room`, or `cap-reached` result. The application persists this result and presentation only renders it.

### Content safety for stored cards

- Reuse one pure Target Sentence safety detector for default catalog validation, Course import, Full Backup restore, and already-persisted SentenceCards. The detector checks Prompt and other pre-attempt recall surfaces for complete target-bearing content using the established normalization behavior, but detection and admission are separate policies.
- Default content and Course imports reject unsafe cards. Full Backup performs structural and referential validation, restores legacy unsafe cards, and immediately quarantines them at runtime; this preserves round-trip recovery without admitting unsafe content to recall. A backup containing malformed data or target-bearing fields inside Practice Session Evidence remains invalid.
- Existing unsafe cards are quarantined at projection/queue boundaries rather than destructively rewritten. Review and Progress receive a generic target-free placeholder; Independent Recall does not start the unsafe occurrence; and the learner receives a recovery message that points to replacement or re-import.
- ReviewState, SentenceLearningState, PracticeLog, Vocabulary Entry, and backup access remain intact. A previously earned First Pass still contributes to Course coverage. An unpassed quarantined card remains explicitly `blocked-content`, is counted separately from learnable pending cards, and gives the Lesson a recoverable blocked empty state rather than being silently completed or queued forever.
- Safety diagnostics may identify a card by stable ID and Course context, but must not log or display the unsafe target-bearing Prompt on pre-attempt surfaces.

### Beta Readiness projection

- Introduce a public `BetaReadiness.measure` application seam. It accepts an as-of instant, the current `Intl` time zone, a reporting-window length, and an inactivity threshold, then projects a typed `BetaReadinessSnapshot` from repository data including the active checkpoint. Historical instants are reprojected in the supplied time zone; this phase adds no separate time-zone preference.
- The production Progress projection uses a 14-local-day reporting window and treats an engaged active checkpoint as presumed abandoned after 24 hours without an update. Both values remain explicit inputs at the measurement seam rather than persisted learner preferences.
- Every rate is returned as numerator, denominator, and an explicit availability state. Strict measures also include evidence coverage: context-bearing eligible rows, all `phase: legacy` rows excluded from strict measures, other pre-context rows excluded, the persisted measurement epoch, and whether an abandonment count contains inferred active checkpoints.
- Weekly Retained Independent Sentences counts distinct SentenceCards in the rolling seven local-day window. A qualifying record is a `review-recall` attempt with `submissionIndex` 0, `perfect` outcome, Recall Support level 0, no Answer Reveal, no prior correction, and a context `scheduledReviewDueAt` at or before `submittedAt`.
- Multiple qualifying attempts for the same SentenceCard count once. Voluntary, Guided, Corrective, First Exposure, not-yet-due, revealed, corrected, retried, signal-only, and context-free legacy rows do not qualify.
- Supporting measures follow the contracts below. “Reporting window” uses local calendar boundaries ending at `asOf`; “strict retrieval” means the same evidence rules as the North Star unless a row says otherwise.

| Measure | Aggregation and denominator | Success / numerator | Anchor and maturity |
| --- | --- | --- | --- |
| Quick Start disposition | Quick Start terminal sessions in the reporting window | Separate completed and dismissed counts; no combined success claim | Terminal `endedAt`; immediately mature |
| Session completion | Engaged sessions whose `engagedAt` is in the reporting window and have completed, explicit/expired abandoned, or currently presumed-abandoned outcomes | Durable completed sessions | Active checkpoint is presumed abandoned only after the supplied inactivity threshold; dismissed, invalidated, unengaged, and younger interruptions are separate |
| Time to First Pass | Cards whose First Pass occurs in the reporting window and has a valid `introducedAt <= firstPassedAt` pair | Median elapsed milliseconds | First Pass time; immediately mature |
| Same-round Independent Pass | Distinct introduced card IDs in terminal round summaries within the reporting window | IDs also present in that round's First Pass set | Round `endedAt`; only context-complete rounds qualify |
| Recall Support distribution | Context-complete cards introduced in the reporting window | Highest level observed before First Pass or `asOf`, grouped 0–4 | Introduction time; diagnostic, immediately available |
| Reveal / Skip before First Pass | Same context-complete introduced-card denominator | Any Reveal respectively Skip signal before First Pass, or before `asOf` if not passed | Introduction time; diagnostic, immediately available |
| Requeue cap | Card-round pairs in terminal summaries | Count and repeated-card count from cap sets | Round `endedAt`; immediately mature |
| Due Review completion | Due-Review occurrence IDs scheduled in terminal Review rounds | Occurrence completed by at least one submitted Attempt; Skip, Reveal-only, and remaining do not count | Round `endedAt`; immediately mature |
| Next-day retention | First Pass cards whose complete 20–48 hour observation window has closed | At least one strict retrieval inside that window | First Pass; mature after 48 hours |
| 7-day retention | First Pass cards whose complete day 6 through day 9 observation window has closed | At least one strict retrieval inside that window | First Pass; mature after day 9 |
| 30-day retention | First Pass cards whose complete day 27 through day 34 observation window has closed | At least one strict retrieval inside that window | First Pass; mature after day 34 |
| Active practice days | Local days in the reporting window | At least one engaged session or persisted Attempt/Signal on the day | Event time; immediately mature |
| Due backlog | Current non-mastered ReviewStates due at `asOf` | Count only; no rate | `asOf` snapshot |

- Retention denominators include matured First Pass cards even when no later Attempt exists; they never count a still-open future observation window as failure. The qualifying observation must be a due Review strict retrieval, not voluntary or Focused Practice.
- Repeated non-perfect retrieval and lapse indicators remain descriptive counts derived from explicit Review evidence; they do not alter the strict cohort numerator.
- Cohort windows use explicit local-day boundaries and report unavailable when a cohort has not matured. They do not treat a missing future observation as a failed recall.
- Legacy PracticeLog projection must carry Answer Reveal, Recall Support, and correction evidence that already exists for historical activity, but every `phase: legacy` row is excluded from strict retrieval regardless of normalized false defaults. No missing legacy field is interpreted as proof that assistance did not occur.
- Progress presents learner-understandable North Star, due, retention, and active-day results. Session abandonment, evidence coverage, requeue caps, and instrumentation diagnostics live in a separate local Beta Inspector disclosure. Neither surface makes clinical or guaranteed learning claims, and support use is never collapsed into a single mastery score.

### IndexedDB, migration, backup, and reset

- Advance the Dexie schema from version 5 to version 6. Add the Practice Session Evidence collection and the indexes needed for time-window and terminal-kind projections. Add optional nested PracticeLog indexes only where a measured query benefits; legacy rows require no rewrite.
- Database upgrade is additive. It creates no fabricated sessions, does not recalculate First Pass, and preserves existing catalog and learning tables. A singleton application-metadata record persists `measurementEpoch` when complete session/log context first becomes available; new installs set it at initialization and version-5 upgrades set it at upgrade time. The epoch is learning-evidence metadata, not an App Preference.
- Advance Full Backup to schema version 2 by adding `learning.practiceSessionEvidence`. Export always emits version 2; restore accepts version 1 and maps it to an empty evidence collection before full validation.
- Active Practice checkpoints are deliberately excluded from backup. A successful restore replaces durable session evidence with the imported evidence and clears the local active checkpoint.
- Reset learning progress clears SentenceLearningState, ReviewState, PracticeLog, Practice Session Evidence, and the active checkpoint in one recoverable operation while preserving the existing Vocabulary and preference contract. Clear all follows the same consistency rule while also clearing Vocabulary, catalog, and preferences according to its existing contract.
- Backup validation rejects duplicate session IDs, invalid timestamps, invalid terminal combinations, unknown fields, and target-bearing payload additions inside session evidence. Historical Practice Session Evidence may contain dangling catalog IDs. Version 2 stores `measurementEpoch` under `learning`; restoring version 1 initializes it to the restore instant.

### Product documentation and rollout

- Update the domain glossary with Practice Session, Practice Round, Practice Session Evidence, Focused Practice, and Beta Readiness terms, including the distinctions from PracticeQueue, PracticeLog, Review, and Progress.
- Record the lifecycle/evidence architecture as an ADR because stable identity, terminal semantics, and the decision not to event-source commands are costly to reverse after Beta history accumulates.
- Update the Product Roadmap so Current remains functionally complete while Now is split into technical Beta evidence hardening and human learning validation. Implementation completion does not claim that learner recruitment, observed usability sessions, retention targets, or Touch Typing gates have passed.
- Provide a Beta test guide that defines the target learner profile, consent boundary, session script, follow-up cadence, observation notes, and how to read local summaries without collecting raw answers by default.

## Testing Decisions

- Tests assert externally observable behavior through four public seams and avoid private helper, React state-shape, Dexie-internal, or implementation-call-count assertions. Fixed clocks, time zones, and injected ID factories make lifecycle and rolling-window behavior deterministic.
- The first seam is `BetaReadiness.measure`. Table-driven tests cover every eligibility rule, distinct-card de-duplication, local-day boundaries, immature cohorts, support/reveal/correction exclusions, legacy evidence coverage, and numerator/denominator semantics. Existing Progress dashboard projection tests provide prior art for domain-facing fixtures and truthful empty states.
- The second seam is `PracticeSessionLifecycle.open/commit`. Contract tests cover new opens, v1 checkpoint upgrade, Quick Start resume after First Exposure, engagement transitions, checkpoint revisions, interruption, every terminal kind, duplicate commits, conflicting terminals, stale autosaves, and atomic terminal/checkpoint behavior. Existing Practice Session reducer and checkpoint adapter tests provide prior art.
- The third seam is the public TrainingRepository/Dexie adapter. Fake IndexedDB integration tests upgrade a real version-5 database, prove no legacy session fabrication, persist and query new log context, exercise idempotent transactions, restore Full Backup versions 1 and 2, reject invalid evidence, and prove rollback on restore/reset failure. Existing Dexie repository and database integration suites provide prior art.
- The fourth seam is the running application. Browser tests cover due-first default entry, explicit-scope precedence, one-card Focused Practice, Quick Start reload recovery, support/occurrence checkpoint recovery, stale checkpoint invalidation, storage retry behavior, unsafe stored Prompt quarantine, Beta metric empty/coverage states, backup round trip, and reset consistency.
- Automated Chromium remains the full core-flow suite. Add Firefox and WebKit smoke coverage for startup, navigation, one recall submission, reload recovery, and absence of console/page errors. A small production-preview suite runs under the GitHub Pages repository base path rather than only the Vite development root.
- Media/input acceptance covers system theme, `prefers-reduced-motion`, the Finger Guide boundary around 700/701 pixels and short landscape, actual shortcut commands, visible focus and dialog Escape behavior, paste, IME composition, and caret restoration.
- Accessibility assertions verify that Review, Progress, URLs, checkpoints, accessible names, live regions, and error messages do not expose a Target Sentence before permitted support or evaluation.
- Real-browser acceptance uses the in-app browser after automated tests. Record browser engine/version when visible, URL, viewport, seeded state, actions, visible outcome, and console errors for Quick Start resume, due-first entry, Focused Practice, Beta Progress, backup/restore, unsafe Prompt handling, theme, and a keyboard-driven Practice round.
- Each implementation slice follows red-green-refactor TDD. A failing test must demonstrate the missing behavior before production code changes; the smallest passing change is made at the approved seam; then affected focused tests run before the full suite.
- Completion requires `npm run typecheck`, all Vitest suites, the production build, all Playwright projects, and the real-browser acceptance record. The existing bundle-size warning is tracked separately unless this work materially increases it or causes a production failure.

## Out of Scope

- Recruiting the 10–15 target learners, scheduling interviews, conducting observed sessions, or declaring the Roadmap's human-validation gates passed.
- Remote analytics, uploading raw answers, centralized cohort dashboards, accounts, authentication, cloud sync, or a backend.
- Fluency Pass, WPM, typing accuracy, keyboard heatmaps, weak-key scheduling, physical-finger detection, or any other Touch Typing phase implementation.
- Double Pinyin, IME mapping lessons, multiple Learning Tracks, or a generalized training platform.
- AI Tutor, pronunciation scoring, speech recognition, social features, leaderboards, and complex game economies.
- Authoring complete Learning Support for all remaining SentenceCards or replacing product research with speculative content expansion.
- Rewriting or inventing Practice Session Evidence for historical activity that predates this instrumentation.
- Event-sourcing every Practice command, retaining raw keystroke histories, or storing replayable input telemetry.
- Changing the core AnswerEvaluation, First Pass, or Review scheduling rules except where a bug is required to keep Focused Practice and due evidence semantically correct.
- Making active drafts portable through Full Backup or synchronizing an in-progress Practice Session across browsers.
- Claiming that local Beta measures prove spontaneous speaking ability, pronunciation quality, clinical memory improvement, or long-term retention before cohorts mature.

## Further Notes

- The Guided Learning Foundation, P0/P1/P2 completion work, backup, interruption recovery, and current browser suite are the starting baseline and must remain regression-safe.
- Implementation should proceed in vertical slices: metric evidence compatibility; lifecycle and checkpoint v2; Dexie v6 and Full Backup v2; due-first and Focused Practice; content safety; Progress/Beta materials; then expanded automated and real-browser acceptance.
- Migration must land before any UI begins relying on Practice Session Evidence. Full Backup version compatibility must land in the same persistence slice so users are never left with an export format that cannot preserve newly collected evidence.
- Strict metrics intentionally start with partial coverage. A truthful “37% of eligible activity has complete evidence” is preferable to silently reclassifying older rows.
- The approved test seams are `BetaReadiness.measure`, `PracticeSessionLifecycle.open/commit`, the public repository integration, and the running application. A new lower-level seam should be added only when behavior cannot be expressed reliably through one of these contracts.
