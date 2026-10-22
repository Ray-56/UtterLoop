# Long-history performance verification

Date: 2026-10-22

## Contract

Normal startup and Practice writes load the current catalog, learning/review states,
preferences, and at most 500 recent events. They do not load the complete event
history or calculate Progress/Beta analytics. Deferred statistics are represented
by `null`, never fabricated zeroes.

Progress loads complete analytics on demand. One complete-history read supplies
both Progress statistics and Beta evidence. A batch statistics calculation uses
the same accumulation rules as the existing immutable reducer while avoiding
copies of every day/card accumulator for every event. The original reducer stays
immutable for callers that reduce one event at a time.

The snapshot loader deduplicates concurrent analytics requests, rejects late
results after a newer refresh, exposes a recoverable analytics error, and reloads
analytics older than one minute when requested again. Practice refreshes preserve
the previously verified focused-card allowlist so a focused round does not
disappear after a submission. Catalog replacement, restore, and reset invalidate
that allowlist. Direct focused entry needs its initial analytics load.

## Reproduce

```bash
UTTERLOOP_PERFORMANCE=1 npx vitest run scripts/performance.test.ts --reporter verbose
```

This opt-in test persists 10,000 and 100,000 events in separate fake-indexeddb
databases. The data spans 365 days and all 120 default cards. It compares the
previous duplicate-read/immutable-reducer path with the new paths in the same
process, submits real application-level Review attempts, and deletes its test
databases afterwards. Default `npm test` skips the two costly benchmark cases.

The test asserts equality of the complete Progress and Beta projections, and of
batch versus immutable statistics. It also verifies that both submitted attempts
persist. Wall-clock measurements are reported rather than asserted as brittle CI
thresholds.

## Measurement

Environment: Node.js v22.23.3, macOS arm64, Vitest 4.1.10, fake-indexeddb 6.2.5.
One same-process comparison run produced the following milliseconds:

| Events | Previous startup | Practice startup | On-demand analytics | Previous submit + refresh | Submit + Practice refresh | Immutable statistics | Batch statistics |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 987 | 4 | 260 | 1,002 | 6 | 760 | 16 |
| 100,000 | 10,230 | 6 | 2,771 | 10,207 | 6 | 8,093 | 172 |

These are adapter/application measurements, not browser input latency or a
production-device guarantee. The log includes process heap usage (69/353 MB in
this run); it includes fixtures and both comparison paths, is affected by garbage
collection, and must not be interpreted as per-screen browser memory or a measured
memory reduction. Complete analytics still reads the full history; its cost is
explicitly moved out of ordinary Practice commands.

## Automated evidence

- Snapshot tests prove that Practice does not query all-history statistics or
  session evidence and that complete analytics shares its history with Beta.
- Statistics tests compare batch and immutable results across event kinds,
  assistance, correction, voluntary practice, old data, and three time zones.
- Loader tests cover deferred loading, request deduplication, focused eligibility,
  stale-response exclusion, explicit error/retry, and time-based freshness.
- The application browser acceptance must additionally verify deferred Progress
  loading, error/retry, and direct focused entry after these APIs are connected.

Real learner retention and native-device audio/IME acceptance are separate from
this performance verification.

The subsequent [real Chrome production measurements](./performance/2026-10-23-chrome-long-history.md)
cover 10k/100k IndexedDB histories, editable Practice startup, durable submissions,
full Progress rendering, schedule/statistics correctness, and available JS heap.
That report keeps browser results separate from the fake-indexeddb comparison.

## Optional activity bundles

Learning Studio, Fluency Pass, and Fluency Progress load through route-level
`React.lazy` and Suspense. The small Courses launchpad is independent of the full
Studio view, including its initial styling, so opening ordinary Courses/Settings
does not fetch the activity modules.

| Asset | Before splitting | After splitting |
| --- | ---: | ---: |
| Initial JavaScript | 788.34 kB / 232.21 kB gzip | 745.24 kB / 220.89 kB gzip |
| Initial CSS | 102.09 kB / 18.01 kB gzip | 91.15 kB / 15.99 kB gzip |
| Optional Learning Studio JavaScript | Included above | 29.53 kB / 8.54 kB gzip |
| Optional Fluency Pass JavaScript | Included above | 12.06 kB / 4.25 kB gzip |
| Optional Fluency Progress JavaScript | Included above | 6.89 kB / 2.59 kB gzip |

An accessible loading state covers module fetches. An error boundary preserves
the surrounding application and offers an explicit retry. The retry reloads the
current document because Chromium caches a failed dynamic import even when a
new React.lazy instance is created. A real-browser test aborts the first Studio
module request, observes the error/retry UI, and confirms successful loading after
retry. Reload preserves durable learning and the current URL; an unstarted
temporary Fluency selection opened from Recall returns to its original Recall
entry after reload.

The existing normal Fluency completion test also passes through Suspense and
retains native-input focus. The remaining core bundle still exceeds Vite's
500 kB advisory; no warning threshold was raised. Further core-route or catalog
splitting would be separate measured work rather than a claim made by this slice.

The production-preview suite passes both Settings and optional-activity cases
under `/UtterLoop/`. It verifies that Settings does not fetch the three optional
JavaScript modules, then opens Studio/Fluency, confirms all three chunk requests
use `/UtterLoop/assets/`, and types into the focused native capture without page
or asset errors. Reproduce with `npm run test:e2e:preview`.
