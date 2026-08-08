# Real-browser acceptance gaps

Playwright covers the deterministic browser contract: Chromium core flows;
Firefox/WebKit startup, navigation, recall, recovery, and error-free loading;
GitHub Pages base-path assets; emulated system theme and reduced motion;
responsive Finger Guide boundaries; shortcuts; focus; paste; and synthetic
composition events.

The following still require a real-device acceptance pass because headless
automation cannot make a trustworthy claim about the hardware or OS surface:

- Use at least one installed Chinese IME to select and commit candidates. Verify
  the candidate window, composition underline, Enter handling, caret, and final
  committed text on macOS and one mobile virtual keyboard. Synthetic composition
  events only prove the app does not submit while `isComposing` is true.
- Hear `Ctrl+Quote` sentence audio and the locally synthesized character,
  editing, space, and action sounds. Verify voice availability, two-copy playback,
  mute persistence, latency, and browser autoplay policy. Automation only proves
  that the shortcut queues two Web Speech utterances.
- Type on a physical keyboard and confirm the visible Finger Guide assignment,
  pressed-key feedback, and comfortable layout at 700/701 px and in a short
  landscape window. Automation cannot verify which physical finger was used.
- Toggle the operating system's light/dark and reduced-motion settings while the
  app is open. Confirm the browser propagates the real OS change without a reload;
  automation uses media emulation rather than the OS control panel.
- Paste through the platform menu and mobile long-press UI, then use a screen
  reader to confirm focus announcements and dialog Escape behavior. Automation
  covers keyboard paste and DOM focus, not native menu or assistive-technology
  speech output.
