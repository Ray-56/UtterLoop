# AGENTS.md

Guidance for coding agents working in this repository.

## Project

UtterLoop is a local-first Web app for English sentence recall practice. The product loop is:

`Prompt -> recall -> type the target sentence -> word-level feedback -> spaced review`

The app is currently a static Vite/React application intended for GitHub Pages. Learning data lives in browser IndexedDB through Dexie.

## Commands

Use npm for this project.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Run `npm run typecheck` and `npm run build` before claiming implementation work is complete. Run `npm test` when touching domain rules or use cases.

## Agent skills

### Issue tracker

Issues and product specifications are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the canonical five-label engineering-skill vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with one root glossary and system-wide ADR directory. See `docs/agents/domain.md`.

## Git Workflow

Before any operation that writes Git state—including creating a branch, staging, committing, tagging, pushing, or opening a pull request—read and follow `docs/GIT_CONVENTIONS.md`.

Do not commit or push directly to `main`. Use the branch, commit, pull request, and release naming rules in that file unless the user explicitly requires a different workflow.

## Architecture

Use a small DDD-style frontend architecture:

- `src/domain`: pure domain model and rules. No React, Dexie, browser APIs, fetch, or UI concerns.
- `src/application`: use cases and repository ports. This layer coordinates domain rules but does not know about Dexie or React.
- `src/infrastructure`: adapters for external mechanisms such as IndexedDB.
- `src/presentation`: React components, hooks, view state, and styling.

Keep the domain language aligned with `CONTEXT.md`. If a term changes meaning, update `CONTEXT.md` in the same change.

## Domain Rules

Important domain terms:

- `SentenceCard`: a learnable unit with one target sentence and prompt.
- `Attempt`: learner-submitted output for a sentence.
- `AnswerEvaluation`: word-level judgment of an attempt.
- `ReviewState`: spaced-review status for a sentence.
- `PracticeQueue`: ordered set of cards selected for practice.

Do not put answer evaluation, review scheduling, or queue selection rules inside React components. Put those rules in `src/domain`, then call them through application use cases.

## UI Direction

The UI should feel like a focused sentence training cockpit: calm, keyboard-friendly, and slightly playful. Avoid marketing landing pages, heavy social features, decorative hero sections, and complex game economies in the MVP.

Use `design-system/utterloop/MASTER.md` as the visual source of truth. The established direction is a mature block-based learning studio: graphite navigation, white training surfaces, high-contrast borders, and mint/yellow/coral/blue accents with restrained hard shadows. Keep radii at 6px or less, use system fonts, and do not introduce gradients, ornamental blobs, or a one-color palette.

Practice should remain the center of gravity. Library, Review, Progress, and Settings support the practice loop.

The Practice view uses a Julebu-inspired direct-input stage:

- Do not show a visible textarea or text input for sentence recall. A visually hidden native input may capture desktop, mobile, and IME input while the learner's text is rendered inside the word track.
- Keep score, combo, queue progress, prompt, live word feedback, and result feedback inside one stable practice surface.
- Keep five visible shortcut hints in this Julebu-compatible order: `Ctrl+Quote` for audio, `Ctrl+M` for mastered, `Ctrl+N` to save/remove Vocabulary, `Enter` for check/next, and `Ctrl+;` to show/hide the Answer or retry after a correct result. `Ctrl+/` is reserved for a future optional tutor and must not show the answer. The Answer appears in a stable hint above the word track and must never fill the learner's word slots. Backspace and Escape remain available as ordinary editing keys but are not shown in the shortcut bar.
- Keep `Shift+Left` for previous, `Shift+Right` for skip, and `Ctrl+P` for pause, with button alternatives outside the five shortcut hints.
- Treat mastered, Vocabulary, Answer Reveal, and skip actions as persisted learning signals. Mastered sentences leave every active PracticeQueue; Vocabulary remains independent from ReviewState; revealed and skipped sentences return to focused review.
- Preserve keyboard focus visibility, screen-reader instructions, live result announcements, and button alternatives for shortcut actions.
- Preserve tactile key feedback: each accepted practice command depresses the active word slot, and locally synthesized key sounds distinguish characters, space, editing, and actions. Keep a persistent mute control outside the five shortcut hints, use no remote audio asset, and respect `prefers-reduced-motion`.

## Storage and Deployment

The current persistence adapter is local IndexedDB. Do not introduce a backend, auth, cloud sync, or AI service without making it optional and preserving local-first usage.

GitHub Pages deployment is configured in `.github/workflows/pages.yml`. Vite's `base` is derived from `GITHUB_REPOSITORY` during GitHub Actions so the app works under the repository subpath.

## Dependencies

Prefer the current stack unless there is a clear reason to change it:

- Vite
- React
- TypeScript
- Dexie
- lucide-react
- Vitest

Keep dependencies purposeful. For core learning logic, prefer small pure TypeScript functions over framework-heavy abstractions.

## File Hygiene

Do not commit generated output such as `dist`, coverage artifacts, or `node_modules`.

When adding architectural decisions that are hard to reverse and not obvious from the code, add a short ADR under `docs/adr/`.
