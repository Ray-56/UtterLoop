# UtterLoop

UtterLoop is a local-first sentence recall trainer for building English fluency through guided acquisition, repeated output, and spaced review.

> Practice sentences until they come naturally.

## Product Shape

UtterLoop is a practice-first trainer, not a general-purpose learning-management system or AI tutor. Independent courses organize the content while one loop remains the center of the product:

`understand the target -> guided recall -> independent recall -> word-level feedback -> spaced review`

A `LearningPath` recommends what to study next across independently accessible `Course`s. Each Course contains ordered `Unit`s and objective-driven `Lesson`s, and each Lesson references the `SentenceCard`s used for recall practice. The path is guidance rather than a prerequisite lock.

The first Web version stores all learning data in the browser with IndexedDB, so it can be hosted as a static site on GitHub Pages.

Learning Studio offers optional multi-context recall, five authored Sentence Families, three short task rehearsals, a confirmed personal sentence inbox, cross-sentence contrast practice and visible-target Fluency Passes. Its transfer, personal and typing evidence stays separate from Course retention. Bounded 3/8/15-minute Return Plans use the ordinary learning and Review rules. These capabilities are governed by the [Learning Expansion specification](./docs/superpowers/specs/2026-10-22-learning-expansion-design.md); real-user learning-effect validation remains open.

## Architecture

The codebase uses a small DDD-style frontend architecture:

- `src/domain` contains pure learning concepts and rules, such as answer evaluation and review scheduling.
- `src/application` coordinates use cases through repository ports.
- `src/infrastructure` adapts those ports to IndexedDB with Dexie.
- `src/presentation` contains React views and interaction state.

The shared domain language is recorded in [CONTEXT.md](./CONTEXT.md), and the outcome-led product direction lives in the [Product Roadmap](./docs/PRODUCT_ROADMAP.md). The default catalog includes five original UtterLoop courses and one curated VOA Learning English course; their terms and source links are recorded in [CONTENT_LICENSES.md](./CONTENT_LICENSES.md).

Current behavior is specified by the [Guided Sentence Learning Design](./docs/superpowers/specs/2026-07-31-guided-sentence-learning-design.md), [Product Completion Design](./docs/superpowers/specs/2026-07-31-product-completion-design.md), and [Beta Measurement and Readiness Design](./docs/superpowers/specs/2026-08-01-beta-measurement-readiness-design.md). The local-first architecture decision is recorded in [ADR 0001](./docs/adr/0001-local-first-ddd-web-architecture.md), while durable target-free session evidence is recorded in [ADR 0003](./docs/adr/0003-durable-practice-session-evidence.md). Now-A's automated and in-app browser evidence is recorded in the [Beta Readiness Browser Acceptance](./docs/testing/2026-08-01-beta-readiness-browser-acceptance.md), and Now-B human validation should follow the [Beta English Learning Validation Guide](./docs/research/2026-08-01-beta-learning-validation-guide.md).

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
```

Audit all default course content with `npm run audit:content`. The opt-in long-history baseline is available through `npm run test:performance`; its [report](./docs/testing/2026-10-22-long-history-performance.md) distinguishes adapter measurements from browser interaction timing.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds the Vite app and deploys `dist` to GitHub Pages on pushes to `main`.

Engineering coverage and measurement limits: [Learning Expansion Acceptance](docs/testing/2026-10-23-learning-expansion-acceptance.md).
