# UtterLoop Product Roadmap

Date: 2026-08-01
Status: Active
Horizon: 12–18 months
Review cadence: Monthly for active Now evidence; quarterly for the full Roadmap

## Purpose

This document records UtterLoop's product direction after completion of the Guided Learning Foundation. It is an outcome-oriented Product Roadmap: each phase states what the product must prove, the product investments most likely to produce that result, and the evidence required before expanding further.

The horizons are confidence ranges rather than release commitments. A later phase does not begin merely because a date arrives; it begins when the preceding product assumption has enough evidence. Detailed behavior remains governed by the relevant product specifications and domain language rather than by this summary.

Roadmap status has the following meaning:

- **Current — Completed:** implemented baseline that future work must preserve.
- **Now — Committed validation:** the active product-learning priority, not a promise to ship every candidate solution.
- **Next — Candidate:** the preferred direction if Now passes its gate.
- **Later — Direction:** a lower-confidence outcome area whose ordering may change with evidence.
- **Explore — Hypothesis:** an uncommitted bet that may become a UtterLoop Track, a separate product, or no product at all.

## Product Direction

### Vision

> 通过高频句子的主动回忆与真实键盘输入，帮助英语学习者把“看得懂的英语”练成“能够主动表达、流畅输入的英语”。

### Current Product Promise

UtterLoop is currently a local-first, keyboard-first English sentence trainer. It teaches a Target Sentence, moves the learner from Guided Recall to Independent Recall, provides word-level feedback, and returns the sentence through spaced Review. On supported desktop keyboards, the non-predictive Finger Guide shows the recommended finger for keys the learner has already pressed.

The current product does not yet claim to measure or improve real finger use, typing speed, or typing fluency. Those are hypotheses for the Touch Typing phase.

“Active output” in the current product means independently producing a Target Sentence in typed form. It is not evidence of spontaneous conversation, pronunciation quality, or spoken fluency. Likewise, “high-frequency” remains a content-strategy aspiration until UtterLoop documents a corpus or other frequency-based selection method; external copy should prefer “practical, high-reuse sentences” when that evidence is absent.

### Strategic Hierarchy

1. **Core value — active English recall and retention.** Learners can independently retrieve useful English sentences after the original lesson.
2. **Enhancing value — touch-typing guidance and input fluency.** Already learned sentences become deliberate physical-keyboard practice without weakening recall.
3. **Future option — independent input-skill Learning Tracks.** Double Pinyin may be explored only after the English and touch-typing value propositions are validated.

### Initial Audience

The initial audience is Chinese-speaking English learners who understand more English than they can actively produce and who practice primarily with a desktop or laptop keyboard. Mobile remains a supported recall surface, but standard physical-keyboard finger training is not promised on software keyboards.

### Core Learning Loop

`understand the target -> guided recall -> independent recall -> word-level feedback -> spaced review`

The future typing extension follows the language result rather than competing with recall:

`independent recall -> language feedback/correction -> optional Fluency Pass -> typing feedback`

## Product Principles

- **Recall first.** The product must help learners retrieve English, not merely copy displayed text quickly.
- **Teach before testing.** A new SentenceCard receives First Exposure and appropriate Learning Support before independent evidence is expected.
- **Separate learning outcomes.** Language recall and typing performance use separate evidence, progress, and feedback. They are never collapsed into one score.
- **Do not leak the answer.** Recall views, Review previews, accessibility labels, Finger Guide states, and typing assistance must not reveal an upcoming Target Sentence character.
- **Practice remains the center.** Courses, Review, Progress, Vocabulary, and Settings support the practice loop rather than becoming independent product centers.
- **Local-first by default.** Learning data remains usable without an account, backend, cloud sync, or remote analytics. Future services must be optional and preserve local-first use.
- **Evidence before expansion.** Content scale, touch typing, personalization, and Double Pinyin advance only after the preceding user outcome is demonstrated.
- **Leave an extension seam; avoid premature platforms.** English domain rules remain explicit. Shared training infrastructure is extracted only after a second validated Learning Track creates a real common need.
- **Accessible and keyboard-friendly.** Visible focus, screen-reader instructions, live result announcements, button alternatives, reduced motion, and mobile/IME support remain product requirements.

## Roadmap Overview

| Phase | Outcome to prove | Primary product investment | Gate to the next phase |
| --- | --- | --- | --- |
| **Current baseline — complete** | The product reliably completes one full learning loop | Preserve Guided Learning, Review, Progress, backup, interruption recovery, measurement integrity, and browser quality | The functional baseline remains regression-safe |
| **Now — 0–3 months** | Learners genuinely acquire sentences and recall them later | Run Now-B real-user learning validation on the accepted Now-A evidence foundation | Recall effectiveness and Review behavior are validated with trustworthy evidence |
| **Next — 3–9 months** | Touch typing adds value without weakening English recall | Fluency Pass, separate typing measures, keyboard heatmap, and weak-key practice | Typing gains transfer to other learned sentences and language retention does not materially decline |
| **Later — 6–12 months** | The product creates a sustained, personalized practice habit | Daily plan, separate language/key weaknesses, content expansion, and guidance preferences | Learners repeatedly complete useful practice rather than only trying the product once |
| **Explore — 9–18+ months** | Double Pinyin is valuable as a repeatable, independent training direction | One-scheme prototype, mapping practice, IME feasibility work, and a small pilot | Repeated demand exists and the direction fits UtterLoop's brand and technical boundaries |

The overlapping horizons are intentional. Discovery for a later phase may begin before the preceding delivery window ends, but major implementation remains gated by evidence.

## Measurement Framework

### North Star

**Weekly Retained Independent Sentences**: the number of distinct SentenceCards in a rolling seven-day window whose scheduled Review is completed with support level 0, no prior correction in the turn, and a `perfect` first complete submission.

This metric joins acquisition and retention. It does not reward copying, assisted completion, raw activity, or a high WPM score by itself.

### Supporting Measures

| Area | Measures |
| --- | --- |
| Activation | Quick Start completion/dismissal, first session completion, time to first First Pass |
| Acquisition | Same-round independent pass rate, highest support level used, Reveal/Skip rate before First Pass, repeated requeue-cap cards |
| Retention | Due Review completion, next-day/7-day/30-day independent retention, lapse rate, repeated non-perfect retrievals |
| Habit | Completed practice sessions, active practice days, return to due Review, unfinished due backlog |
| Typing — from Next | Net WPM, uncorrected character accuracy, backspace rate, pause distribution, weak physical keys and key sequences, transfer to other learned sentences |
| Guardrails | No answer leakage, no learning-record loss, language retention after typing is introduced, session abandonment, accessibility and IME regressions |

UtterLoop does not require remote telemetry for these measures. Early validation uses local projections, observed usability sessions, voluntary pilot follow-up, and aggregated findings that do not require uploading a learner's full backup or answer history.

Numeric thresholds below are initial Beta hypotheses. The first real baseline may justify changing them; a target should not be preserved merely because it appeared in the original Roadmap.

Support use is diagnostic evidence, not a vanity metric to minimize. A higher support rate may indicate difficult content, an effective learning scaffold, confusing prompts, or premature Review; interpretation requires the surrounding outcome and observed learner behavior.

## Current Baseline — Guided Learning Foundation

Status: **Complete; Now-A evidence and entry acceptance passed**

### Outcome

UtterLoop is no longer only a sentence-recall test. It can introduce an unseen sentence, teach it with measured support, require a later Independent Recall, preserve First Pass separately from mutable retention, and support safe long-term use.

### Delivered Product Capabilities

- Six default Courses and 120 unique SentenceCards organized into an independent Course catalog and recommended LearningPath.
- First Exposure, structured Learning Support, Guided Recall, Independent Recall, Corrective Practice, voluntary practice, and Quick Start.
- First Pass and SentenceLearningState separated from ReviewState so later lapses do not erase Course coverage.
- Support evidence, answer reveal, skip, corrective completion, requeue spacing, focused review, and idempotent atomic learning writes.
- Structured Learning Support for the 20 Starter Foundations cards, with a safe fallback for content without authored support.
- Safe Review projections, Due/Upcoming grouping, Course filtering, Vocabulary/Mastered management, complete Course replay, and Next lesson navigation.
- Truthful Progress projections for coverage, retention, trends, streaks, mastery distribution, and weak cards.
- Local full backup/restore, destructive-operation confirmation, recoverable writes, deep-linked scopes, and compatible session/draft recovery.
- Direct-input Practice, word-level feedback, synthesized sentence/key audio, and a non-predictive Finger Guide.
- Automated domain/application/presentation coverage plus end-to-end and real-browser acceptance requirements.

### Baseline Guardrails

- Old learning data must retain its migrated First Pass and Course completion.
- Review and Progress must not expose Target Sentences before recall.
- Retried commands must not duplicate an Attempt, lapse, First Pass, or schedule change.
- Full backup restore must remain validated, atomic, and replacement-based.
- Changes to the Practice cockpit must preserve shortcut order, accessibility, reduced motion, mobile/IME behavior, and local persistence.
- `npm test`, `npm run typecheck`, and `npm run build` remain required before implementation work is considered complete; relevant user journeys also require browser verification.

### Current Typing Boundary

The Finger Guide reflects an accepted physical key after the learner presses it and demonstrates a recommended standard finger assignment. It neither predicts the next answer character nor detects the learner's actual finger. It currently stores no typing history and calculates no finger accuracy, WPM, rhythm, or weak-key schedule.

## Now — Validate English Learning

Horizon: **0–3 months**
Primary status: **Active — Now-A complete; Now-B human validation ready to begin**

### Outcome to Prove

Target learners can understand a new sentence, progress through supported practice, independently retrieve it, and recall it again in a later Review without needing a developer to explain the product.

### Key Questions

- Do learners understand why a Guided completion is not yet an Independent First Pass?
- Is the support ladder helpful without making learners dependent on the answer?
- Can learners recover from a non-perfect result without feeling trapped or punished?
- Do learners know whether to continue a Course or complete due Review?
- Does the current schedule create useful spacing rather than immediate repetition or forgotten backlog?
- Which content or product friction prevents a second and third practice session?

### Now-A — Beta Evidence and Entry Hardening

Status: **Completed 2026-08-01**

Before collecting a Beta baseline, UtterLoop must make the remaining evidence and entry behavior trustworthy:

- preserve Quick Start identity and progress through checkpoint recovery;
- resume a compatible active Practice Session before choosing a new default scope;
- otherwise prioritize due Review before recommended new learning;
- connect Progress Weak Cards to single-card Focused Practice without advancing Review scheduling;
- separate Practice Session/Practice Round lifecycle evidence from turn-level PracticeLog evidence;
- calculate strict local Beta measures with explicit denominators, cohort maturity, measurement epoch, and legacy coverage;
- quarantine target-bearing stored Prompts without deleting history or making old Full Backups unrestorable;
- preserve these semantics through IndexedDB migration, Full Backup, reset, automated browser tests, and real-browser acceptance.

Now-A is governed by the Beta Measurement and Readiness specification and its ADR. Technical completion means the evidence is available and reliable; it does not mean the product-learning hypotheses below have passed.

### Now-B — Real-user Learning Validation

Status: **Ready to begin; requires participant recruitment and follow-up observation**

#### Product Investment

- Run observed usability and learning pilots with approximately 10–15 target learners.
- Use Starter Foundations as the reference Course for validating the complete authored-learning experience.
- Refine prompts, accepted answers, context, sentence patterns, keywords, frames, IPA, grammar, and explanatory copy where observation reveals confusion.
- Improve Quick Start and first-session explanations without turning onboarding into a long questionnaire or modal tour.
- Validate and, if needed, simplify the daily entry point so due Review is visible before new learning while Course choice remains available.
- Surface or inspect the existing local success measures: time to First Pass, same-round independent pass, support use, Reveal/Skip, next-day retention, and requeue-cap cases.
- Fix reliability, comprehension, accessibility, and content-quality problems before adding broad new modes.

#### Initial Success Hypotheses

- At least 80% of observed learners complete a first practice round without intervention.
- Most observed learners can explain the practical difference between Guided and Independent Recall.
- At least 60% of pilot learners return within seven days and complete at least one due Review.
- At least 70% of sentences with a First Pass are independently recalled at their first due Review.
- No reproducible flow causes lost learning evidence, duplicated scheduling consequences, or answer leakage.

#### Gate to Next

- The complete loop has been observed across multiple sessions, not only during a first-screen usability test.
- The main unresolved request has shifted from “I do not understand how to learn here” to “I want to practice this output more fluently.”
- Recall and retention measures have a usable baseline.
- Data integrity, scheduling semantics, and support boundaries are stable enough that typing experiments cannot invalidate the language evidence.

#### Explicitly Not in This Phase

- Double Pinyin, multiple training tracks, or a generalized training platform.
- A typing leaderboard, generic speed race, or WPM reward during hidden-answer Recall.
- Backend accounts, mandatory cloud sync, social mechanics, or complex game economies.
- Automatic expansion of full Learning Support to every remaining card before usage identifies the next valuable Course.

#### Risks and Dependencies

- Pilot results depend on recruiting learners who match the initial audience and return for more than one observed session.
- A small early cohort is vulnerable to novelty and facilitator effects; qualitative evidence and local measures must be interpreted together.
- Local-only data boundaries make centralized cohort analysis intentionally limited. Any learner-provided summary requires explicit consent and must not default to sharing full backups or raw answers.
- Content-quality problems can masquerade as scheduler problems, so prompt, accepted-answer, and Learning Support review must accompany behavioral diagnosis.

## Next — Validate Touch Typing

Horizon: **3–9 months**
Primary status: **Candidate, gated by English-learning evidence**

### Outcome to Prove

Already learned English sentences can improve physical-keyboard accuracy and fluency without reducing the quality, completion, or retention of Independent Recall.

### Experience Model

```text
hidden-answer Recall
        -> language result and correction
        -> optional visible-target Fluency Pass
        -> separate typing feedback
```

The target may be visible during Fluency Pass because the language-recall judgment is already complete. The product must not calculate typing speed across the time spent thinking of an answer.

### Product Investment

- Specify and implement an optional Fluency Pass after correct, corrected, or explicitly revealed target exposure.
- Create typing-practice evidence separate from Attempt, AnswerEvaluation, SentenceLearningState, and ReviewState.
- Measure net WPM, uncorrected character accuracy, backspace rate, pause rhythm, weak physical keys, and recurring key sequences locally.
- Add a typing-focused result and Progress area that remains visually and semantically separate from Language progress.
- Add a keyboard heatmap and focused weak-key exercises sourced from sentences the learner has already acquired.
- Evaluate transfer on learned sentences that were not repeatedly used as the learner's exact training passage.
- Keep Recall's Finger Guide non-predictive; richer next-key/finger guidance is allowed only in a visible-target typing context.
- Treat desktop/laptop hardware keyboards as the primary touch-typing surface; retain recall support on mobile without claiming equivalent finger training.

### Initial Success Hypotheses

- At least 50% of pilot learners voluntarily use Fluency Pass in three or more sessions.
- At least 80% of observed learners understand that Language and Typing are different result dimensions.
- After roughly ten typing sessions, median net WPM improves by about 10%, or uncorrected accuracy improves by about three percentage points, on transfer material.
- Weak-key error rate falls without increasing answer copying or random guessing.
- 7-day and 14-day language retention decline by no more than approximately three percentage points after typing practice is introduced.
- Practice completion and abandonment do not materially worsen.

### Gate to Later

- Learners demonstrate transfer rather than merely memorizing the motor pattern of one repeated sentence.
- English recall remains the primary reason to use UtterLoop, with typing clearly understood as an enhancing outcome.
- Local key capture and aggregate typing evidence are technically reliable across supported desktop browsers.
- Repeated user evidence, not architectural enthusiasm alone, suggests value in adaptive language and key practice.

### Explicitly Not in This Phase

- Combining Language and Typing into one overall score.
- Claiming that the browser detects which physical finger the learner actually used.
- Predicting the next Target Sentence key during hidden-answer Recall.
- Turning UtterLoop into a general-purpose typing race.
- Promising standard touch-typing instruction on mobile software keyboards.
- Building Double Pinyin or abstracting every English concept into a generic multi-track domain model.

### Risks and Dependencies

- Language metrics and scheduling semantics must remain stable before typing evidence is introduced.
- Recall time, hesitation, and correction cannot be treated as typing latency; measurement begins only after the visible-target Fluency Pass starts.
- Raw key capture creates privacy and storage risks. The implementation should retain only the minimum local evidence needed for useful feedback and avoid unnecessary replayable key histories.
- Repeating one sentence can produce motor memorization without transfer. Evaluation therefore depends on held-out, already learned material.
- Physical-layout assumptions, especially US ANSI mappings, must be explicit for supported desktop keyboards.

## Later — Build a Sustained, Personalized Practice Habit

Horizon: **6–12 months**
Primary status: **Direction, reprioritized using Now/Next evidence**

### Outcome to Prove

Learners repeatedly complete the right mix of acquisition, due Review, weak-language practice, and typing practice without having to manually assemble every session.

### Product Investment

- Introduce a clear daily plan that prioritizes due Review, adds a bounded amount of new learning, and includes a small optional typing component.
- Keep language weaknesses and physical-key weaknesses separate while allowing the daily plan to schedule both.
- Turn repeated lapses, non-perfect retrievals, support dependence, and weak-key patterns into focused practice actions.
- Add a guidance preference such as `More guidance / Automatic / Minimal` after actual support-use patterns are understood.
- Expand authored Learning Support from Starter Foundations to additional Courses in usage-driven batches rather than completing all content speculatively.
- Evaluate a simple personal sentence inbox before considering a visual Course-authoring system.
- Improve long-term Language and Typing trends while keeping every measure understandable without a composite mastery score.

### Success Measures

Specific thresholds are set after the Now phase establishes a real habit baseline. The phase should improve:

- completed useful sessions per learner;
- active practice days and return to due Review;
- percentage of due work completed before backlog growth;
- 7-day and 30-day retained independent sentences;
- weak-card recovery without increased Reveal dependence;
- weak-key recovery without reduced language retention.

### Gate to Explore

- A meaningful group of learners sustains practice across multiple weeks.
- Personalized scheduling demonstrably reduces manual choice or improves recovery from weak areas.
- The Touch Typing layer has repeatable value and stable evidence boundaries.
- Discovery shows that learners want the same recall/input mechanism for a distinct input skill, rather than merely expressing casual curiosity.

### Explicitly Not in This Phase

- A social feed, public leaderboard, social streak pressure, or complex game economy.
- Mandatory accounts, cross-device merge, or a cloud dependency for ordinary practice.
- A full learning-management system, certificate program, or hard Course enrollment model.
- A large visual Course editor before the simple personal-content need is validated.

### Risks and Dependencies

- Daily planning can reduce learner control or create an intimidating backlog if it is not bounded and explainable.
- Adaptive language and key practice require distinct evidence; a combined weakness score would hide the reason an item was selected.
- Scaling authored Learning Support faster than editorial review can reduce trust and retention even when Course quantity increases.
- Habit targets cannot be set responsibly until Now establishes return and Review-completion baselines.

## Explore — Double Pinyin Lab

Horizon: **9–18+ months**
Primary status: **Uncommitted product bet**

### Hypothesis

UtterLoop's `recall -> physical input -> immediate feedback -> spaced practice` mechanism may help Double Pinyin learners move from remembering a layout to automatically entering real Chinese words and sentences.

This is not an English feature. It is evaluated as an independent Learning Track or, if its audience and product shape diverge, as a separate application.

```text
UtterLoop
├── English Recall
│   └── Touch Typing
└── Double Pinyin Lab
```

### Prototype Scope

- Start with one Double Pinyin scheme; do not attempt simultaneous support for every layout.
- Diagnose and train initial/final-to-key mappings.
- Practice confusing finals, weak combinations, and initial/final pairs.
- Progress from syllables to words and then to short, natural Chinese sentences.
- Separate mapping recall, raw physical keys, final IME-committed text, accuracy, and speed.
- Validate `keydown`, `beforeinput`, and IME composition behavior across the intended browser/OS/input-method combinations.
- Keep Double Pinyin content, progress, queues, and review evidence independent from English First Pass and ReviewState.
- Extract shared training infrastructure only after the prototype demonstrates real repetition and a stable common abstraction.

### Initial Success Hypotheses

- Approximately 15–20 actual target learners complete the pilot; English users' casual interest alone is insufficient.
- After roughly ten sessions, first-attempt mapping accuracy on transfer syllables improves by about 15 percentage points.
- Real short-sentence input speed improves by about 10% without an accuracy decline.
- At least 40% of pilot learners voluntarily complete five or more sessions within two weeks.
- Supported browser and IME combinations reliably distinguish the evidence required by the training design.
- Learners clearly understand English Recall and Double Pinyin as separate Learning Tracks.

### Commitment Gate

Double Pinyin becomes a committed product direction only when:

- interviews and a low-cost prototype demonstrate a recurring problem;
- learners need sustained practice rather than a one-time keyboard-layout reference;
- raw-key and IME evidence is technically reliable in the target environments;
- repeat use meets the pilot threshold;
- the direction does not blur UtterLoop's English promise or damage the primary Practice experience.

If the audience, brand expectation, interaction model, or technical architecture differs substantially, the correct result is an independent application rather than forced integration.

### Explicitly Not in This Phase

- Supporting every Double Pinyin scheme in the first experiment.
- Combining Double Pinyin and English learning progress.
- Reusing English SentenceCard, First Pass, or ReviewState semantics where their meaning does not fit.
- Claiming visibility into internal IME behavior that the browser cannot reliably observe.
- Repositioning UtterLoop as a platform for every memorization or typing task.

### Risks and Dependencies

- Double Pinyin schemes, operating systems, browsers, and IMEs expose materially different event behavior.
- Mapping-drill improvement may fail to transfer to real composition, candidate selection, and sentence entry.
- The target audience and product expectation may differ enough from English learners to require a separate brand and application.
- Premature shared abstractions could weaken the explicit English domain without producing a reusable training core.

## Decision Rules

| Evidence | Roadmap decision |
| --- | --- |
| Learners cannot complete or understand the English learning loop | Stay in Now; improve the core before expanding modes |
| Learners complete the loop but do not return for Review | Prioritize habit, scheduling, and content work before Touch Typing |
| Fluency Pass is rarely used or shows no transfer | Keep the lightweight Finger Guide and stop expanding typing analytics |
| Typing gains reduce language retention or completion | Redesign or remove the typing intervention |
| Learners want Double Pinyin only as a one-time layout guide | Do not build a persistent Learning Track |
| Double Pinyin has repeat demand but a substantially different audience/product model | Build or test it as an independent product |
| A future optional service would make local practice unusable without it | Reject or redesign the service to preserve local-first use |

## Explicitly Outside the Current Roadmap

- Backend accounts, authentication, mandatory cloud sync, remote backup storage, or cross-device merge.
- Remote analytics, advertising telemetry, cohort comparison, or uploading complete learning histories by default.
- AI-generated Courses, AI tutor chat, translation grading, pronunciation scoring, or speech-recognition assessment.
- Social feeds, public leaderboards, certificates, hard enrollment, push-notification pressure, or complex game economies.
- A next-character hint during Independent Recall, including through Finger Guide or accessibility metadata.
- Real-finger detection claims without hardware or evidence capable of supporting them.
- A general-purpose typing racer or a generic learning platform before the English and Double Pinyin cases establish a real shared need.

These exclusions may be reconsidered only through an explicit Roadmap decision. Technical feasibility alone is not sufficient reason to add them.

## Roadmap Governance

- Review active Now evidence at least once per month. Review the full Roadmap at every phase gate and at least once per quarter.
- Move an item between `Now`, `Next`, `Later`, and `Explore` only with a recorded reason and supporting evidence.
- Treat success thresholds as hypotheses until a real baseline exists; retain the metric definition even when the target changes.
- Write a focused product/design specification before implementing a new committed phase. The specification owns detailed behavior; this Roadmap owns sequencing and outcome intent.
- Keep implementation tasks, refactors, migrations, and test work in delivery plans rather than expanding this document into a backlog.
- When a term gains or changes domain meaning, update `CONTEXT.md` in the same implementation change.
- Preserve prior Roadmap decisions in the change log so removed ideas do not silently return as “new” features. Each material entry records the date, evidence considered, phase movement, and reason.

## References

- [README](../README.md)
- [Shared domain language](../CONTEXT.md)
- [UtterLoop Design System](../design-system/utterloop/MASTER.md)
- [Guided Sentence Learning Design](./superpowers/specs/2026-07-31-guided-sentence-learning-design.md)
- [Product Completion Design](./superpowers/specs/2026-07-31-product-completion-design.md)
- [Beta Measurement and Readiness Design](./superpowers/specs/2026-08-01-beta-measurement-readiness-design.md)
- [Finger Guide Design](./superpowers/specs/2026-07-28-finger-guide-design.md)
- [Local-first architecture decision](./adr/0001-local-first-ddd-web-architecture.md)
- [Independent Courses and versioned catalog bundles](./adr/0002-independent-courses-and-versioned-catalog-bundles.md)
- [Durable Practice Session evidence decision](./adr/0003-durable-practice-session-evidence.md)
- [Beta English Learning Validation Guide](./research/2026-08-01-beta-learning-validation-guide.md)
- [Beta Readiness Browser Acceptance](./testing/2026-08-01-beta-readiness-browser-acceptance.md)

## Change Log

### 2026-08-01

- Marked the Guided Learning baseline as functionally complete while preserving it as a regression boundary.
- Split Now into Now-A Beta evidence/entry hardening and Now-B real-user learning validation so pilot results are not based on incomplete session or legacy evidence.
- Linked strict local measurement, due-first entry, Focused Practice, Quick Start recovery, stored-Prompt quarantine, migration, and browser acceptance as the technical gate before recruitment.
- Completed Now-A with durable target-free Practice Session evidence, due-first and active-session entry resolution, Quick Start immediate recovery, Focused Practice, runtime Prompt quarantine, local Beta projections, v2 Full Backup, and the full automated/browser acceptance gate.
- Moved the active Roadmap work to Now-B participant recruitment and multi-session learning validation. Next remains gated because no human recall/retention baseline has been collected yet.

### 2026-07-31

- Created the first unified Product Roadmap.
- Recorded Guided Learning Foundation and Product Completion P0–P2 as the completed baseline.
- Set English-learning validation as Now, Touch Typing as Next, sustained personalization as Later, and Double Pinyin as an uncommitted Explore bet.
