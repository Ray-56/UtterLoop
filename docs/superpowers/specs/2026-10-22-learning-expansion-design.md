# Learning expansion

Date: 2026-10-22
Status: Implemented; engineering verification recorded on 2026-10-23

## Outcome and scope

The user requested implementation, testing, and verification of all discussed work: content quality, long-term performance, multi-tab safety, Fluency Pass, multi-context recall, sentence families, real-task rehearsal, a personal sentence inbox, time-bounded return practice, and cross-sentence weakness practice. This document retains that complete scope. Engineering acceptance does not establish real-user learning efficacy.

The existing Guided Learning and strict retention contracts remain authoritative. New transfer and typing evidence is separate from First Pass, scheduled Review, and retained independent sentences. The user has authorized developing the proposed next-stage capabilities; their learning-effect hypotheses remain unproven until a human study supplies evidence.

## Required capabilities and acceptance

| Work | Required behavior | Evidence required for completion |
| --- | --- | --- |
| Content quality | Audit all 120 default cards; correct supported editorial errors; give Work & Study's 20 cards complete authored Learning Support; expose a repeatable audit and editorial checklist | Catalog/support safety tests, audited content report, browser lesson acceptance |
| Long-term performance | Ordinary Practice does not repeatedly load all history or compute unrelated analytics; Progress loads current truthful analytics on demand | Reproducible 10k/100k baseline and comparison, equal-statistics tests, browser startup/submission/navigation measurements |
| Multi-tab safety | One active Practice writer; stale pages cannot overwrite a replaced/reset data generation; explicit recovery/takeover path | Independent-repository concurrency tests and two-page browser journeys including restore/reset/autosave |
| Fluency Pass | Optional visible-target typing after language judgment; independently measured elapsed typing time, net WPM, accuracy, backspaces, pauses and physical-key aggregates; results and history remain separate | Deterministic timing/input tests, saved-result and backup tests, actual browser keyboard journey |
| Multi-context recall | At least 20 authored cards have multiple safe contextual cues; trained and held-out cues are distinguished; exact target expression is taught and fairness boundaries are explicit | Authored-content safety tests, cue selection/recovery tests, held-out browser exercise |
| Sentence families | Five authored reusable structures, each with at least three training variants and two held-out variants; instruction precedes testing; transfer results are separate | Validation/evaluation tests, persisted training/test distinction, browser family session |
| Task rehearsal | Three authored tasks (request an extension, clarify a misunderstanding, get hotel help), each containing 3–5 contextual steps with clear expression expectations and useful feedback | Task content and progression tests, persisted completion/recovery, full browser task |
| Personal inbox | Add/edit/remove local scenario, confirmed English and source; validate before practice; introduce and review personal content; preserve it through backup | Trust-boundary tests, durable CRUD/practice/restore tests, browser add and recall |
| Return practice | Explainable 3/8/15-minute bounded plans; prioritize due work, bound new/weak/typing work, retain true due state and prevent starvation | Fixed-clock queue-selection tests, exhausted/stale-plan behavior, browser bounded session |
| Weakness practice | Identify a small set of reliable recurring cross-sentence error patterns, distinguish observed evidence from inferred cause, and offer authored contrast practice | Pattern/typing-error/exclusion tests, minimum-evidence and result tests, browser action from diagnosis |

## Product integration

- Keep the five primary navigation destinations. Courses may offer a compact learning-studio entry; Practice remains the main cockpit.
- Preserve the hidden native recall input, five keyboard hints and order, button alternatives, live announcements, focus, mobile/IME behavior, reduced motion, local key sounds and mute.
- Keep new optional workflows out of the default first-session path. Expose what each activity practices and the evidence it records.
- Learning and typing measures never merge into a composite score. Held-out transfer, voluntary practice and real-life self-reports never inflate scheduled Review retention.
- All new learner-owned content and durable evidence is local, versioned, validated, backed up and reset consistently. No backend or mandatory online service is introduced.
- Authored variants have finite, explicit accepted answers. The app must not imply it can grade arbitrary spontaneous English.
- Changes to canonical targets create new card identities; support-only corrections retain identities and increment course revisions.

## Implementation boundaries

Pure selection, evaluation, typing aggregation, diagnosis and content validation live in `src/domain`. Application services coordinate persistence; Dexie adapters enforce data generation and transactional writes. React owns only interaction and presentation state.

A versioned Learning Studio document stores optional workflow progress and separate evidence. Main learning state, Review scheduling and existing Practice Session Evidence retain their meanings. The database upgrade is additive. Full Backup must accept historical versions and normalize new optional data without fabricating learning evidence.

## Verification and completion ledger

Each row above is accounted for in the [dated engineering acceptance report](../../testing/2026-10-23-learning-expansion-acceptance.md). Completion requires `npm run typecheck`, `npm test`, `npm run build`, the Chromium/Firefox/WebKit suites, the GitHub Pages preview suite, and interactive browser inspection at 375, 768, 1024 and 1440 pixels plus short landscape. Relevant recovery, failure, keyboard, answer-leakage and backup paths must be verified; a happy-path screenshot is insufficient.

Real Chinese IME candidate selection, audible sound quality, physical-finger behavior, assistive-technology speech and human learning/return outcomes retain their real-device or participant requirements. Automated evidence must state its actual coverage.
