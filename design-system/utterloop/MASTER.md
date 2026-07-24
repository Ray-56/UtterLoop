# UtterLoop Design System

This file is the visual source of truth for the Web app. Page-specific files under `pages/` may override these rules when they exist.

## Product Character

UtterLoop is a keyboard-first sentence training studio. It should feel focused, quick, and mature, with enough color and physicality to make practice rewarding. The interface is an application, not a landing page.

Style: block-based Swiss utility with restrained game-like feedback.

## Tokens

| Role | Value |
| --- | --- |
| Canvas | `#F2F4F1` |
| Paper | `#FFFFFF` |
| Soft paper | `#F7F8F6` |
| Ink | `#171A17` |
| Muted ink | `#667067` |
| Border | `#D3DAD3` |
| Practice accent | `#82E2B4` |
| Positive | `#137456` |
| Active/attention | `#F5CC4B` |
| Error/retry | `#EC6B5D` |
| Informational | `#4D72D6` |
| Secondary warm accent | `#D98736` |

Use graphite and white for structure. Mint is the primary practice color. Yellow marks focus and the main keyboard action. Coral is reserved for retry/destructive states. Blue and orange provide word-level variety.

## Typography

- UI: `Avenir Next`, `Avenir`, `Segoe UI`, `Helvetica Neue`, Arial, sans-serif.
- Data and shortcuts: `SFMono-Regular`, Consolas, `Liberation Mono`, monospace.
- Headings are compact and bold. Practice words may be large; panel headings remain modest.
- Letter spacing is always `0`.
- Do not load remote fonts for the static GitHub Pages build.

## Shape And Depth

- Controls and surfaces use 4-6px radii. Never exceed 8px.
- Use 1px high-contrast borders to define structure.
- Primary practice surfaces may use a `5px 5px 0 #171A17` hard shadow.
- Repeated list items stay flat until hover; do not nest cards inside cards.
- Do not use gradients, ornamental blobs, glass effects, or soft pill-heavy styling.

## Interaction

- All controls have a minimum 44px touch target.
- Hover changes color or border without moving layout.
- Keyboard focus uses a visible yellow 3px outline.
- Motion lasts 150-240ms and `prefers-reduced-motion` disables it.
- Lucide is the single icon family.
- Accepted keystrokes use a 105ms keycap compression animation and subtle local Web Audio feedback. Characters, space, editing, and action keys have distinct sound profiles; users can persistently mute them.

## Layout

- Desktop: 240px fixed dark sidebar and a fluid workspace up to 1480px.
- Tablet: compact top navigation with five evenly sized icon targets.
- Mobile: preserve all five shortcut hints in one stable row; labels may be visually hidden while accessible names remain.
- The practice stage owns the largest visual area. Supporting views use dense, scannable rows and data blocks.
- Verify at 375px, 768px, 1024px, and 1440px, plus a short landscape viewport.

## Practice Contract

- No visible input or textarea in the practice stage. A visually hidden native input may provide mobile keyboard and IME support.
- Word slots are the visible input surface. Keep their expected-answer baseline stable, but expand them with longer learner input and wrap extreme words instead of clipping text.
- Keep score, queue progress, prompt, feedback, and shortcuts in one stable bordered stage.
- Shortcut order is Audio, Master, Vocabulary, Check/Next, Show/Hide answer or Try again.
- The five core keycaps display literal `Ctrl` on every platform because these bindings use Control, not Command.
- The Answer toggle uses a stable, labeled hint above the word track. Toggling it must not move the word slots or render expected words as learner input.
- After a failed check, retain matched words, clear every mismatch and extra word without revealing replacements, and focus the first cleared slot.
- Correct words may cycle through the accent palette. Active input uses yellow focus feedback.
- The key-sound toggle lives in the stage top bar and never replaces or reorders a shortcut.
