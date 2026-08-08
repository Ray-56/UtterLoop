# UtterLoop Finger Guide Design

Date: 2026-07-28
Updated: 2026-08-02
Status: Approved in conversation and implemented

## Goal

Provide non-predictive touch-typing guidance after each accepted physical keystroke without revealing any part of the Target Sentence. The Finger Guide is supporting feedback, not a second input stage, answer hint, or learning-data source.

## Product Rules

- The guide mirrors only supported physical keystrokes accepted by Practice. It never highlights the next expected character.
- It recommends a standard finger assignment; it does not claim to detect which finger the learner used.
- Correct and incorrect characters receive identical neutral guidance.
- Four persisted device modes are available: `Auto`, `Compact`, `Full`, and `Off`. The default is `Auto`.
- `Auto` and `Compact` use the post-key compact strip during editable recall. `Auto` may hide it when a desktop viewport is too short; explicit `Compact` keeps it present when width permits. `Full` opens the complete ANSI map without increasing page height. Any visible compact strip can temporarily expand or collapse the map.
- First Exposure, Pause, submitting/updating states, and a passed result return to a static compact home-row reminder. They do not retain a predictive-looking active key.
- `Off`, the existing `700px` mobile breakpoint, and very short touch landscape viewports hide the guide without leaving an empty row.
- The visual keyboard cannot be clicked to type and does not emit per-key screen-reader announcements.
- The guide does not store keystrokes, calculate finger accuracy, or alter Attempt, AnswerEvaluation, ReviewState, or PracticeQueue behavior.
- Paste, voice input, and IME composition remain supported but do not fabricate key or finger feedback.

## Practice Composition

Practice is a viewport-bound cockpit rather than a stack of independent cards:

Practice navigation reveals this cockpit immediately. It has no visible page-level title, view number, or routine sync strip above the stage; a screen-reader-only `Practice session` heading preserves the page landmark and route announcement.

```text
Top bar: scope, controls, score, Words / Match / Tags
Progress
Status band: Prompt + live result feedback
Focus shell:
  shared Learning Support / Answer slot
  word track
  compact Finger Guide (or no row when hidden)
Five Practice shortcuts
```

The root stage uses five explicit grid rows. The focus shell owns remaining height. Long word tracks scroll inside their own area; expanded support and First Exposure details scroll inside the support body. The Learning Support action footer and five Practice shortcuts remain visible.

The top bar reserves only a compact exceptional-status slot. Routine local saves, normal speech availability, and successful pronunciation playback produce no visible or live-region success message. A non-blocking save failure may occupy that slot with an action-specific Retry control; a critical Practice write failure remains a blocking error and does not advance or clear the current turn.

The Answer owns one stable slot above the word track. Ordinary Recall leaves that slot visually empty. `Ctrl+;` reveals only the single-row grammar map, with a plain target-row fallback for content without complete token annotations. During recall, hiding Answer removes the whole row and must not leave a level-four support copy behind.

The complete ANSI map is an anchored overlay inside the focus shell. Expanding it does not move the word track, Prompt, HUD, or shortcut bar.

## Compact Strip

The default strip is approximately 48–64px high and contains:

- `Finger guide` label;
- a tactile keycap showing the last accepted physical key, or `F J` at rest;
- `Pressed F · Recommended: Left index` style copy;
- a separate modifier line for Shift when needed;
- a simplified ten-finger outline with primary and modifier fingers visually distinct;
- a real 44px Expand/Collapse button with `aria-expanded` and `aria-controls`.

The active recommendation is at least 13–14px. Passive labels may use the app's compact monospace scale. Shift uses an informational blue treatment while the primary key uses attention yellow, so the two roles are not conflated.

## Full ANSI Map

Use a compact US ANSI QWERTY main typing block:

- `Esc` merged into the number row to avoid a wasteful dedicated row;
- number and symbol row;
- letters and punctuation;
- `Tab`, `Caps`, `Shift`, `Space`, `Enter`, and `Backspace`.

Function keys, navigation clusters, arrow keys, and the numeric keypad are excluded. `F` and `J` retain home-row markers. Key labels remain legible and render above the hand layer.

Ghost hands are restrained outlines rather than opaque palms. Resting shapes stay subordinate to the keys; only the assigned fingertip or fingertips become prominent. Small reach offsets are illustrative and must not imply anatomical precision.

## Finger Assignment

| Finger | Keys |
| --- | --- |
| Left little finger | `Esc`, `` ` ``, `1`, `Q`, `A`, `Z`, left `Shift` |
| Left ring | `2`, `W`, `S`, `X` |
| Left middle | `3`, `E`, `D`, `C` |
| Left index | `4`, `5`, `R`, `T`, `F`, `G`, `V`, `B` |
| Right index | `6`, `7`, `Y`, `U`, `H`, `J`, `N`, `M` |
| Right middle | `8`, `I`, `K`, `,` |
| Right ring | `9`, `O`, `L`, `.` |
| Right little finger | `0`, `-`, `=`, `P`, `[`, `]`, `\`, `;`, `'`, `/`, right `Shift`, `Backspace`, `Enter` |
| Right thumb | `Space` |

For an uppercase letter or shifted symbol, the character key uses its assigned finger and the opposite hand's little finger uses Shift. The mapping fixes `B` to left index, `6` to right index, and `Space` to right thumb. Unknown physical codes do not animate.

## Input And Feedback

Use `KeyboardEvent.code` as the physical ANSI position. Key position, legend, and recommendation come only from the fixed mapping and physical Shift state.

Only supported accepted input/editing keys update the guide:

- accepted characters, Space, Backspace, Enter, and Escape update it;
- incorrect accepted characters update it normally;
- ignored browser/system commands do not;
- `Ctrl`, `Alt`, `Meta`, AltGraph, and IME composition do not;
- an input change without a corresponding physical key does not.

The latest supported key supersedes the previous one; animations do not queue. Repeated presses still restart tactile compression. After approximately 450ms without another accepted key, the guide returns to the home-row state.

With `prefers-reduced-motion: reduce`, disable press/travel transitions while retaining the static keycap, finger role, and readable recommendation.

## Accessibility

- The visually hidden Practice heading remains in the heading hierarchy even though the cockpit has no visible page-level title.
- The full keyboard and hand artwork are `aria-hidden` and use `pointer-events: none`.
- The visible recommendation is ordinary readable text, not an `aria-live` region.
- The Expand/Collapse button is keyboard reachable, at least 44px, and exposes its state.
- Existing hidden-input labeling, screen-reader instructions, result announcements, focus rings, and button alternatives remain unchanged.
- Text, position, outline, and role-specific styling accompany color.
- Expanding/collapsing the visual guide never changes the hidden input's accepted-command behavior.

## Responsive Behavior

- Above `700px`, show the compact strip unless the persisted mode is `Off`.
- `Full` and a temporary expansion render as an overlay, not a vertically scaled second stage.
- At `700px` and below, hide the guide with CSS and preserve the five-button shortcut row.
- In very short landscape viewports, particularly coarse-pointer devices, hide the guide rather than shrinking labels below legibility.
- The Practice shell itself is constrained by `100dvh`. Ordinary recall must fit at 1440×900, 1366×768, 1280×720, and 390×844 without page scrolling.
- Exceptional banners such as Quick Start or checkpoint recovery may make the Practice wrapper internally scrollable; they must not silently clip controls.

## Persistence Boundary

`fingerGuideMode` is part of the existing device `AppPreferences` record. Adding it does not require a Dexie schema version because the field is not indexed.

- Existing IndexedDB rows missing or containing an invalid value normalize to `auto`.
- Existing v1/v2 full backups may omit the field and normalize to `auto`.
- New exports include the field; invalid backup values are rejected.
- The Settings save flow keeps its existing optimistic state, failure rollback, and Retry behavior.

Finger movement remains presentation-only. The resolver receives the accepted command snapshot and returns a neutral display assignment; it never receives expected text, target position, evaluation status, or scheduling state.

## Verification

Automated checks cover:

- complete ANSI row data with merged Esc row;
- fixed assignments and opposite-hand Shift;
- ignored modifiers, unknown codes, and IME;
- `Off`, compact `Auto`, expanded `Full`, and muted home-row rendering;
- preference persistence, rollback, legacy row normalization, and old backup compatibility;
- one-screen ordinary Practice at the four target viewports;
- First Exposure action footer and shortcuts remaining visible while details scroll;
- reduced motion, 700/701 behavior, and short-landscape hiding.

Manual checks include rapid/repeated typing, wrong input, correction Space, Enter hold, Answer show/hide, pause/result transitions, keyboard-only focus, key sound on/off, and full-map expansion at desktop/tablet widths.
