# UtterLoop Finger Guide Design

Date: 2026-07-28
Status: Approved in conversation

## Goal

Add a non-predictive Finger Guide to the Practice stage so learners can see the recommended touch-typing finger for each physical key they press without revealing any part of the Target Sentence.

The guide is immediate visual instruction, not a second input method, an answer hint, or a new source of learning data.

## Approved Product Rules

- The Finger Guide mirrors only supported physical keystrokes that Practice accepts. It never highlights the next expected character.
- It demonstrates a recommended finger assignment; the browser cannot detect which finger the learner actually used.
- It does not compare the pressed key with the Target Sentence. Correct and incorrect characters receive the same neutral guidance.
- It is always visible on desktop and tablet, with no collapse control or persisted preference.
- It is hidden at the existing `700px` mobile breakpoint. Mobile keeps the native software keyboard and current word-track experience.
- It is visual-only and cannot be clicked to type.
- It does not store keystrokes, calculate finger accuracy, or alter Attempt, AnswerEvaluation, ReviewState, or PracticeQueue behavior.
- Pasted text, voice input, and IME composition remain supported but do not fabricate key or finger animation.

## Practice Layout

The Finger Guide remains inside the existing bordered `game-shell`. It becomes a stable row after Prompt and before the current Words / Match / Tags HUD:

```text
Top bar and progress
Result feedback
Answer hint and word track
Prompt
Finger Guide
Words / Match / Tags
Five practice shortcuts
```

This placement keeps the guide close to the learner's input while preserving the established word track, Answer location, HUD, and five-shortcut order.

The desktop `game-shell` grid grows from seven to eight rows. The Finger Guide occupies an `auto` row after Prompt. At the mobile breakpoint, CSS hides that row's child and the implicit row collapses to zero height.

The guide is a flat band rather than a nested card. It uses a soft-paper background and one top border. The HUD keeps its existing top border as the guide/HUD divider; do not add a second adjacent line. The keyboard is centered with a maximum width so it does not stretch across the full 1480px Practice workspace.

## Visual Direction

Follow `design-system/utterloop/MASTER.md` without introducing a new visual language:

- top-down, flat vector presentation;
- graphite and white structure;
- 4–6px key radii and one-pixel high-contrast borders;
- system and monospace fonts already used by the app;
- no gradients, glass effects, neumorphism, remote fonts, raster hand assets, or ornamental motion.

### Keyboard

The resting keyboard is neutral so it cannot be mistaken for AnswerEvaluation feedback. `F` and `J` retain visible home-row markers.

The current key, or key pair for a shifted character:

- changes to the existing yellow active color;
- compresses with the established 105ms keycap motion;
- remains identifiable by position and label, not color alone.

The guide header shows:

```text
FINGER GUIDE                         F · LEFT INDEX
```

For a shifted character, the label names both recommended fingers:

```text
A · LEFT PINKY + RIGHT PINKY SHIFT
```

At rest, the right-hand label reads:

```text
HOME ROW · ASDF / JKL;
```

Labels use the app's existing English UI language and monospace treatment.

### Hands

Two translucent “ghost hands” sit over the keyboard:

- resting palms remain near the home-row position;
- hand fill stays translucent enough to preserve every key label;
- a thin outline keeps the hand shape legible against white and soft-paper surfaces;
- the active finger or fingers become substantially more opaque while the other fingers remain subdued;
- key labels render above the translucent hand layer.

Each palm remains anchored to its home-row position. It may use a small local offset for a realistic reach, but it must not relocate or jump across the keyboard. The target finger performs the primary extension and press motion.

## Keyboard Scope

Use a compact US ANSI QWERTY main typing block:

- `Esc`;
- number and symbol row;
- letters and punctuation;
- `Tab`, `Caps`, `Shift`, `Space`, `Enter`, and `Backspace`.

Function keys, navigation clusters, arrow keys, and the numeric keypad are not rendered. `Tab` and `Caps` are present to preserve the recognizable ANSI shape but are not Finger Guide commands.

The first version demonstrates:

- letters;
- digits;
- punctuation;
- shifted characters;
- `Space`;
- `Backspace`;
- `Enter`;
- `Escape`.

It does not choreograph `Ctrl`, `Alt`, `Meta`, or multi-key Practice shortcuts. Those commands remain explained by the existing shortcut and navigation controls.

## Finger Assignment

Use this fixed mapping:

| Finger | Keys |
| --- | --- |
| Left pinky | `Esc`, `` ` ``, `1`, `Q`, `A`, `Z`, left `Shift` |
| Left ring | `2`, `W`, `S`, `X` |
| Left middle | `3`, `E`, `D`, `C` |
| Left index | `4`, `5`, `R`, `T`, `F`, `G`, `V`, `B` |
| Right index | `6`, `7`, `Y`, `U`, `H`, `J`, `N`, `M` |
| Right middle | `8`, `I`, `K`, `,` |
| Right ring | `9`, `O`, `L`, `.` |
| Right pinky | `0`, `-`, `=`, `P`, `[`, `]`, `\`, `;`, `'`, `/`, right `Shift`, `Backspace`, `Enter` |
| Right thumb | `Space` |

For an uppercase letter or shifted symbol, the character key uses its assigned finger and the opposite hand's pinky demonstrates `Shift`.

The character key, recommended Shift key, and both assigned fingers become active together.

The mapping deliberately fixes common variations:

- `B` uses the left index finger;
- `6` uses the right index finger;
- `Space` uses the right thumb.

Unknown and non-ANSI physical codes do not animate.

## Animation Model

### Accepted Key

For each supported keystroke:

1. The active key or keys and recommended finger or fingers become visually prominent.
2. The active finger or fingers travel or extend toward the key in approximately 150ms.
3. The key performs the existing 105ms compression near the end of that reach.
4. The visible label updates to the key and recommended finger assignment.

The guide reuses the existing Practice motion range and key-feedback rhythm. It does not add a second sound system; the current local key sound and mute preference remain authoritative.

### Rapid Input

Animations never queue. A new supported keystroke immediately supersedes the previous target and restarts the motion from the current finger pose.

This latest-key-wins rule prevents the guide from falling behind the learner during fast typing. Repeated presses of the same key must still restart key compression.

### Return To Home Row

During continuous typing, the active finger pose follows the latest supported key. After approximately 450ms without another supported keystroke:

- the active highlight fades;
- active fingers and any small palm offsets settle back to the `ASDF` / `JKL;` resting pose;
- the label returns to the home-row message.

There is no looping idle animation.

### Reduced Motion

With `prefers-reduced-motion: reduce`:

- disable every press, travel, return, and opacity transition;
- keep both palms and fingers in their resting positions;
- update only the static key highlight, assigned resting finger emphasis, and text label.

The mapping remains understandable without motion.

## Input And State Behavior

Use `KeyboardEvent.code` as the physical ANSI position. Key position, keycap legend, and the guide label all come from the fixed ANSI mapping plus the physical Shift state. Letter legends remain uppercase like their keycaps. Do not use `event.key` as the displayed character because another keyboard layout can assign a different character to the same physical key.

Only supported input and editing keys handled by Practice update the guide:

- ordinary accepted text keystrokes animate;
- incorrect accepted characters animate normally;
- ignored browser or system commands do not animate;
- `Ctrl`, `Alt`, and `Meta` chords do not animate;
- AltGraph and IME composition do not animate;
- an `input` change without a corresponding supported physical key does not animate.

Shifted characters show the character finger and the recommended opposite-hand Shift pinky together. The guide recommends the standard chord; it does not claim to detect which physical finger was used.

The correction-mode Space branch currently resolves before the common Practice command path. It must explicitly send the same accepted Space command to the Finger Guide resolver so correction navigation receives the same Space animation as ordinary typing.

The guide stays in place through all Practice states:

- Typing and correction states are fully active.
- `isPaused`, `isSubmitting`, and `isUpdatingStatus` return the hands home and visually mute the guide, except that an accepted Enter press keeps its static highlight for the minimum hold described below.
- A `perfect`/Passed result retains the same occupied space, returns home, and visually mutes the guide.
- `close` or `retry` becomes fully active again when Practice returns to editable correction.
- Moving to the next SentenceCard resets the guide to home row after any accepted Enter press has remained visible for at least 150ms. This affects only the guide; it must not delay submission or navigation.

## Interaction And Accessibility

- The keyboard and hand artwork use `pointer-events: none`.
- No rendered key is a button, link, input, or tab stop.
- Clicking the surrounding non-interactive Practice area continues to focus the existing hidden native input.
- Only the decorative keyboard and hand structures are hidden from the accessibility tree.
- The visible key-and-finger label remains ordinary readable text but is not an `aria-live` region; announcing every keystroke would overwhelm screen-reader output.
- Existing Practice instructions, result announcements, focus rings, shortcut alternatives, and hidden input labeling remain unchanged.
- Key position, finger emphasis, press state, and the text label accompany color, so yellow is not the only signal.

## Responsive Behavior

### Desktop And Tablet: Above 700px

- Render the complete compact ANSI guide.
- Scale the keyboard as one unit within the available Practice width.
- Preserve legible key labels at the 768px and 1024px checks.
- Keep hands inside `game-shell`, whose overflow remains clipped.

### Short Landscape Viewports

- Reduce the guide's height and vertical padding.
- Keep the complete keyboard and both hands visible.
- Do not remove Prompt, HUD, or any of the five shortcut actions.
- Preserve the existing minimum heights of the other Practice rows. The workspace may scroll vertically when every stable row cannot fit in one short viewport.

### Mobile: 700px And Below

- Keep the component mounted and hide it with the existing `@media (max-width: 700px)` CSS breakpoint. Do not add viewport JavaScript or `matchMedia` state.
- Do not add a replacement compact hint, toggle, empty row, or stored preference.
- Preserve the existing mobile Practice layout and five-button shortcut bar.

## Minimal Component Boundary

Keep this feature in `src/presentation`; it does not require domain, application, infrastructure, or persistence changes.

The smallest maintainable implementation is:

1. one pure Finger Guide resolver under `src/presentation/keyboard`, with one focused test file. It receives a minimal keyboard-event snapshot plus the accepted `PracticeKeyCommand | null`, filters unsupported modifiers/composition, and returns the ANSI key position and finger assignment or `null`;
2. one `FingerGuide` presentation component that renders the keyboard, hands, label, and state classes;
3. minimal `PracticeWorkbench` wiring that retains an independent `{ stroke, pulse }` value and resets it on item/state changes. Do not reuse `useKeyFeedback.keyPulse`, which also changes for sounds, buttons, and non-typing commands;
4. styles added to the existing Practice stylesheet.

Use inline vector markup or CSS for the hands. Do not add an animation, graphics, keyboard-layout, or state-management dependency.

## Verification

Automated checks:

- table-driven mapping for every supported ANSI `KeyboardEvent.code`;
- fixed assignments for `B`, `6`, and `Space`;
- opposite-hand Shift for left- and right-hand characters;
- `Backspace`, `Enter`, and `Escape`;
- ignored unknown codes, `Ctrl` / `Alt` / `Meta` / AltGraph chords, and IME composition;
- accepted correction-mode Space input.

Manual browser checks:

- normal, incorrect, shifted, repeated, and rapid typing;
- repeated presses of the same key restart compression;
- Enter remains visible long enough to identify before a next-card reset;
- pause, correction, passed, and next-card transitions;
- paste and IME input without fabricated motion;
- key sounds on and off;
- reduced-motion behavior;
- hidden at 375px and 700px;
- complete and legible immediately above the breakpoint at 701px and 720px;
- complete and legible at 768px, 1024px, and 1440px;
- compressed but complete in a short landscape viewport;
- keyboard-only Practice focus and all existing shortcut controls.

Required repository checks for implementation:

- `npm test`
- `npm run typecheck`
- `npm run build`

## Non-Goals

- Predicting or revealing the next Target Sentence character.
- Detecting the learner's real finger or hand.
- Finger accuracy, typing analytics, telemetry, history, or review scheduling.
- Click-to-type on-screen keys.
- Mobile Finger Guide UI.
- Keyboard layouts other than US ANSI QWERTY.
- Practice shortcut choreography.
- Function keys, navigation clusters, arrow keys, or a numeric keypad.
- Realistic 3D hands, remote art assets, idle animation, or a new animation dependency.
