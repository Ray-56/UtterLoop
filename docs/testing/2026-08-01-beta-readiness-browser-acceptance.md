# Beta Readiness Browser Acceptance

Date: 2026-08-01
Result: Passed
Specification: [Beta Measurement and Readiness Design](../superpowers/specs/2026-08-01-beta-measurement-readiness-design.md)

## Environment

- Application: local Vite development build at `http://127.0.0.1:43117/`
- Browser surface: Codex In-app Browser; underlying engine/version was not exposed by the browser surface
- Viewport: 1280 × 720 CSS pixels
- Time zone shown by the product: Asia/Shanghai
- Console result: no warning or error entries after the complete acceptance pass

Two documented local states were used:

1. A fresh origin with the production default catalog and no prior learning data, used for Quick Start and keyboard recovery.
2. A validated synthetic Full Backup containing one Course, two first-passed cards, two due ReviewStates, one contextual due-review Attempt, one completed Practice Session Evidence row, one Vocabulary entry, and a light-theme preference. One card was safe; the other deliberately stored its Target Sentence in Prompt to exercise runtime quarantine. Restoring the backup also restored the six default Courses, producing 122 cards in the running catalog.

The synthetic file contained only local test data and was removed after acceptance.

## Automated Gate

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test -- --run` | 74 files, 537 tests passed |
| `npm run build` | Passed; the existing 500 kB chunk-size advisory remains |
| Chromium, Firefox, and WebKit matrix | 44 tests passed |
| GitHub Pages `/UtterLoop/` preview | 1 test passed |

## Real-browser Journeys

| Journey | Actions and seeded state | Visible result |
| --- | --- | --- |
| Quick Start immediate recovery | On a fresh origin, opened Quick Start step 1, selected **Start recall**, and reloaded immediately without waiting for a React autosave | Restored step 2 of 6, removed First Exposure, retained `Guided recall` at level 0, and kept the written support slot empty until `Ctrl+;` |
| Keyboard-driven recall | Entered `Hello, my name is Emma.` in the hidden native capture and pressed Enter | Word track reached 5/5 and 100%; result was Guided and explained that Quick Start would return the card for an independent check |
| Full Backup restore | Selected the synthetic v2 backup, reviewed its counts, opened the confirmation dialog, and confirmed replacement | Validation reported 1 Course, 2 Cards, 2 First Passes, 2 ReviewStates, 1 PracticeLog row, and 1 Vocabulary entry; restore reported `Restored 1 courses, 2 cards, and 1 learning events.` |
| Full Backup export | Selected **Export full backup** after restore | The application reported `Exported a private full backup with 2 learning events.` The in-app automation surface did not expose the Blob download event; serialized export and replacement round-trip remain covered by the automated gate |
| Theme | Switched the restored light preference to Dark | Dark remained selected and the root `data-theme` became `dark` |
| Due-first entry | Entered Practice from Settings with no active checkpoint and two due cards | URL resolved to `?view=practice&scope=review`; Review Recall opened before recommended new learning |
| Unsafe stored Prompt | Restored one card whose Prompt exactly contained its Target Sentence, then inspected Review, Progress, and Practice | Review showed the generic replacement message, Progress contained neither safe nor unsafe target text, and Practice reported only `1 sentence was quarantined`; the unsafe Target Sentence never appeared |
| Beta learner summary | Opened Progress with one contextual completed due Review | Weekly retained independent sentences showed 1 of 1; Due Review completion showed 100%, Active practice days showed 1 of 14, and backlog showed 2 |
| Beta Inspector | Expanded local diagnostics | Weekly retained and Due Review coverage each showed `1 / 1 contextual · 0 legacy · 0 pre-context`; the measurement epoch was visible |
| Focused Practice | Used **Practice this card** from the only safe Weak Card and submitted `I am ready.` | URL used the single-card focused scope, the turn was labeled Voluntary practice, and the result stated `Practice only. Review and Course progress are unchanged.` Returning to Review still showed two due cards at Stage 1 |

## Acceptance Decision

Now-A Beta Evidence and Entry Hardening passes its technical acceptance gate. The product preserves a target-free, recoverable learning path across interruption, due-first entry, Focused Practice, backup replacement, runtime content quarantine, and local Beta projection.

The remaining work is Now-B human learning validation. Native Chinese IME candidate selection, audible Web Speech/key-sound quality, physical-finger comfort, OS-level live theme/reduced-motion propagation, and screen-reader speech remain real-device checks documented in [Real-browser acceptance gaps](../../e2e/REAL_BROWSER_GAPS.md); they are not substituted by this browser pass.
