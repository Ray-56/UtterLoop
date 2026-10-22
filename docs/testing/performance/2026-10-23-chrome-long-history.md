# Chrome long-history measurements

Re-measured the final frozen application on 2026-10-23, **01:27 Asia/Shanghai**,
after the Practice checkpoint-readiness guard, ownership-epoch correction and native voice identity fix and synchronous Studio caret correction.
The acceptance browser matrix and preview run had finished before this isolated measurement.
These measurements use the production
application and real Chrome IndexedDB. They complement the separate
[fake-indexeddb comparison](../2026-10-22-long-history-performance.md); they do not
provide a previous-version Chrome baseline or establish a browser speedup ratio.

## Reproduce

```bash
npm run typecheck
GITHUB_ACTIONS=true GITHUB_REPOSITORY=local/UtterLoop npx vite build --outDir node_modules/.cache/performance-dist
UTTERLOOP_BROWSER_PERFORMANCE=1 npx playwright test --config playwright.performance.config.ts
```

The config uses an isolated frozen production directory, port 4288, and the
`/UtterLoop/` deployment base. It launches the locally installed Google Chrome
with `channel: "chrome"`, one worker, no retries, and no tracing. Chrome must be
installed. The main acceptance configuration excludes `performance.spec.ts`.
Running this dedicated config without the opt-in environment variable skips both
cases, as verified separately.

The final successful command reported **2 passed (7.3s)**. `npm run typecheck` and
`npm run build` also passed. Vite still reports the existing initial-bundle size
advisory; it has not been suppressed.

Environment: Google Chrome **155.0.8059.85**, headless, Darwin 27.0.0 arm64,
Node v22.23.3, Playwright 1.62.1, viewport 1280 × 720, time zone Asia/Shanghai.
There is no device user-agent override. Frozen main asset:
`index-CubFWRnI.js`, SHA-256
`7ec31e3f39d88ec2559415f4182fc0a436671d710747df05357c909867eaa550`.
Both browser result attachments independently record that exact loaded asset
in their `mainScript` field. These values come from the final rerun rather than
relabeling the earlier 00:01, 00:22, 00:42 or 01:16 measurements.

## Results

| Synthetic history events | Startup to editable Practice | Enter to durable, visible result | Progress to complete analytics | Seed setup, excluded from interaction times |
| ---: | ---: | ---: | ---: | ---: |
| 10,000 | 84 ms | 40 ms | 341 ms | 299 ms |
| 100,000 | 69 ms | 31 ms | 2,418 ms | 1,984 ms |

| Synthetic history events | JS heap after startup | JS heap after submission | JS heap after complete analytics |
| ---: | ---: | ---: | ---: |
| 10,000 | 9.27 MiB | 12.77 MiB | 19.33 MiB |
| 100,000 | 9.58 MiB | 13.60 MiB | 45.09 MiB |

Raw measurements, retained outside the source tree in this task's local verification artifacts, were copied directly
from the test's JSON attachments. Every opt-in run writes the same fields to
its Playwright output directory and prints `BROWSER_PERFORMANCE` JSON lines.

Startup is a full document navigation into an existing local profile after
Settings has initialized the production schema/catalog and seeded data. HTTP
assets are warm. Its browser `performance.now()` sample is taken after the
Practice capture is editable and focused. This is a warm-asset startup, not a
first visit or cold browser launch.

Submission starts at the real Enter keydown. The endpoint requires the visible
Next result, a direct IndexedDB read of its unique attempt, and the persisted
schedule update. Progress starts at the real navigation button click and ends
after both the complete all-history statistics and contextual Beta metrics are
rendered and checked. Playwright checks and direct reads add observation cost;
these are elapsed upper bounds, not isolated React render durations. No clock,
repository, evaluation, scheduling, or analytics implementation is mocked.

Heap samples use Chrome's nonstandard `performance.memory.usedJSHeapSize` with
`--enable-precise-memory-info`. The test writes `"unavailable"` if the API is
absent. These are opportunistic JS-heap samples, not total browser memory, peak
memory, retained-size analysis, or a measured memory reduction. Garbage
collection is not forced; individual samples must not be treated as a
deterministic memory budget.

## Correctness checked during each measurement

Each fresh browser context installs 120 production catalog cards and seeds
10,000 or 100,000 synthetic attempt rows across 365 days. Half are explicitly
legacy and half are review-recall rows without session context. Every fifth row
is close rather than perfect. These fixtures exercise storage and full-history
aggregation; none claims real learner retention or real historical sessions.

The ordinary root URL selects the single due sentence. Actual browser typing
and submission persist exactly one new unassisted perfect Review attempt with
the real session/round/occurrence context and the original due timestamp. Its
schedule advances from stage 1/streak 1 to stage 2/streak 2 with a future due
date. Finishing the round produces one completed session and one completed due
occurrence. No synthetic terminal session evidence is inserted.

The complete Progress view reports 10,001/100,001 durable events while showing
that the recent feed contains only 500. Its retrieval counts are 5,001/50,001
and perfect recall counts are 4,001/40,001: legacy rows remain excluded from
retrieval statistics. Strict weekly retention counts only the one contextual
browser submission, **1 of 1 eligible sentences**. Its coverage explicitly
excludes 98/959 recent legacy rows and 98/959 recent pre-context rows. Due Review
completion is **1 of 1 actual occurrences**. These tiny synthetic-test
denominators are correctness checks, not learner success-rate evidence.

This same-device run supports the intended separation: normal Practice avoids
the long-history analytics cost, while opening complete Progress still incurs
an approximately 2.42-second calculation at 100k rows. It does not establish
performance on low-end/mobile devices, cold assets, other browsers, or larger
histories. There is no latency threshold asserted as a universal performance
guarantee.
