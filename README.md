# UtterLoop

UtterLoop is a local-first sentence recall trainer for building English fluency through repeated output and spaced review.

> Practice sentences until they come naturally.

## Product Shape

UtterLoop is a practice-first trainer, not a general-purpose learning-management system or AI tutor. Independent courses organize the content while one loop remains the center of the product:

`Prompt -> recall -> type the target sentence -> word-level feedback -> spaced review`

A `LearningPath` recommends what to study next across independently accessible `Course`s. Each Course contains ordered `Unit`s and objective-driven `Lesson`s, and each Lesson references the `SentenceCard`s used for recall practice. The path is guidance rather than a prerequisite lock.

The first Web version stores all learning data in the browser with IndexedDB, so it can be hosted as a static site on GitHub Pages.

## Architecture

The codebase uses a small DDD-style frontend architecture:

- `src/domain` contains pure learning concepts and rules, such as answer evaluation and review scheduling.
- `src/application` coordinates use cases through repository ports.
- `src/infrastructure` adapts those ports to IndexedDB with Dexie.
- `src/presentation` contains React views and interaction state.

The shared domain language is recorded in [CONTEXT.md](./CONTEXT.md). The default catalog includes two original UtterLoop courses and one curated VOA Learning English course; their terms and source links are recorded in [CONTENT_LICENSES.md](./CONTENT_LICENSES.md). The local-first architecture decision is recorded in [docs/adr/0001-local-first-ddd-web-architecture.md](./docs/adr/0001-local-first-ddd-web-architecture.md).

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

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds the Vite app and deploys `dist` to GitHub Pages on pushes to `main`.
