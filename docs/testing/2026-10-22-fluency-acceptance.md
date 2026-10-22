# Fluency Pass acceptance

Date: 2026-10-22

## Delivered behavior

- An optional entry follows a correct/corrected result or an explicitly visible
  Answer. Hidden-answer Recall does not offer it. Bounded Return plans leave this
  separate activity outside their queue budget.
- Previously acquired material can also start a pass from Learning Studio.
- The target is visible; a hidden, labeled native input captures text while the
  learner's output appears in the word track. Timing starts with the first
  committed character, not with Recall, target exposure, or uncommitted IME text.
- Enter finishes, Control+P pauses/resumes, and Escape cancels. Buttons provide
  equivalents. Window blur and a hidden document pause; resumption is explicit.
- Clipboard paste, drop, and native beforeinput replacement are blocked. IME
  composition can commit text; composing Enter does not finish the pass.
- A result reports net WPM, final character accuracy, Backspace presses, active
  duration, and between-input gaps with their meanings stated. A failed save
  retains the same measured result for an idempotent retry.
- Persisted results contain aggregate evidence, not the target sentence, typed
  answer, or raw replayable keystroke history. English learning/review state is
  unchanged by a typing pass.
- The independent progress view aggregates sampled physical-key presses and
  mismatches. US ANSI labels do not claim layout or finger detection. Weak-key
  suggestions require at least three sampled presses. Recommendations use safe
  acquired material and favor different, previously untyped sentences.

## Verification

```bash
npx vitest run src/domain/studio/fluency.test.ts src/domain/studio/fluencyProgress.test.ts src/presentation/components/FluencyPass.test.tsx src/presentation/components/FluencyProgress.test.tsx src/presentation/components/PracticeWorkbench.test.tsx
npx playwright test e2e/fluency.spec.ts --project chromium --workers 1
npm run typecheck
npm run build
```

The focused domain, keyboard, and server-rendered interface suite passed 32
tests. All seven Chromium journeys passed:

| Journey | Evidence |
| --- | --- |
| Visible-target completion | Actual browser key input; one persisted aggregate result; key mismatch and Backspace counts; unchanged learning/review rows; reload preserves history |
| IME and timing | Composition Enter leaves the pass open; a 60-second pre-input period is excluded; a 120-second pause is excluded while the real elapsed timestamps include it |
| Paste/replacement | Real clipboard paste and dropped text leave the capture empty; native replacement beforeinput is canceled; the timer remains unstarted |
| Storage retry | The first real IndexedDB Studio write fails; retry sends the identical result ID and payload; a double click produces one successful retry and one durable result |
| Cancellation | Escape exits a partially typed pass without creating typing evidence |
| Recall boundary | A hidden-answer turn has no Fluency entry; explicit Answer exposure enables it; the saved source is `revealed` and its ReviewState remains unchanged |
| Visibility/commands | A hidden document pauses input, visibility alone does not resume, and Control+P explicitly resumes/pauses |

The completion journey also passed at 375×812 without horizontal page overflow.
With reduced motion emulated, the active word's computed animation is `none`.
Input and result screenshots were visually inspected: the target, word track,
buttons, labels, and metric columns remain readable on this mobile viewport;
the result scrolls within the workspace. Screenshot WPM values come from
automated key input and are not human performance evidence.

Typecheck and the production build passed. The current production bundle still
emits Vite's chunk-size advisory; that is separate from this behavior acceptance.

## Limits

Composition, blur, and visibility tests exercise browser events; native IME
candidate windows, real hardware finger use, and audible sound quality retain
the real-device acceptance requirements in `e2e/REAL_BROWSER_GAPS.md`.
The pass reuses the persistent local key-sound control and reduced-motion policy.
This acceptance proves measurement and interaction behavior, not improved
typing transfer, English retention, or spontaneous conversation ability.

## Quick Start transition regression, 2026-10-23

An original ten-run repetition produced eight passes and two failures. Its
Reveal baseline could be read before the real signal/schedule transaction had
completed. A separate full-matrix trace showed the negative First Exposure
assertion passing during the temporary “Restoring local practice” screen.

Diagnosis also found a real interaction window: after Quick Start dismissal
closed its checkpoint, the retired capture briefly became editable before the
standard session initialized. Sending Enter at that exact DOM mutation boundary
reproduced the stale operation in three of three diagnostic runs. The retained
regression uses a passive MutationObserver to assert that this retired capture
never becomes editable; that assertion failed before the production fix.

Practice now requires its current checkpoint identity to be ready before accepting
commands. A discarded checkpoint's replacement initializes the same identity
field. First Exposure completion checks its identity after awaits and before
updating the interface, and a new scope resets its busy state. A second retained
browser case holds delivery of a successfully persisted IndexedDB write, switches
the same Workbench with browser Back, and verifies that the new scope accepts and
durably preserves its own draft after the old completion arrives. That case
failed as read-only before the busy reset was added.

The original case now waits for the positive standard First Exposure, editable
focused capture, durable Guided Recall checkpoint, and real saved Answer Reveal
signal before recording its ReviewState baseline. It still checks that the
Fluency pass leaves that complete baseline unchanged. No fixed sleep, retry, or
relaxed outcome assertion was added.

The repaired original case passed ten serial and ten four-worker repetitions.
After the scope-reset correction, both retained cases passed ten repetitions
each with four workers: **20 passed (11.7s)**. Temporary event/IndexedDB diagnostic
logging and synthetic boundary-input injection were removed. The retained
scope-change test delays only the old IndexedDB success callback; it does not
change the persisted learning rows, clock, evaluation, or scheduling rules.

```bash
npx playwright test e2e/fluency.spec.ts --project chromium --grep 'hidden-answer Recall|scope change during First Exposure' --repeat-each=10 --workers=4
```
