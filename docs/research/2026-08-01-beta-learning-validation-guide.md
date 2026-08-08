# Beta English Learning Validation Guide

Date: 2026-08-01
Status: Ready to run; Now-A passed [technical acceptance](../testing/2026-08-01-beta-readiness-browser-acceptance.md) on 2026-08-01

## Research objective

Determine whether UtterLoop helps its initial audience learn a practical English SentenceCard, complete an Independent Recall without facilitator help, and retrieve it again in scheduled Review. The study also identifies content, support, scheduling, and entry-point friction before Touch Typing work begins.

This pilot does not validate spontaneous conversation, pronunciation, generic typing speed, or long-term retention beyond the observation windows that have matured.

## Target participants

Recruit approximately 10–15 Chinese-speaking English learners who:

- understand more English than they can actively produce;
- normally practice on a desktop or laptop keyboard;
- can complete one observed first session and independent follow-ups;
- are not already highly familiar with every Starter Foundations target sentence;
- represent a useful spread of keyboard confidence without recruiting specifically for typing speed.

Record whether a participant uses Windows or macOS, browser name, approximate English level, primary learning goal, and usual keyboard layout. Do not require a real name in the study notes.

## Consent and local-first boundary

Before the session, explain that UtterLoop stores learning data locally in the browser and that the study observes product use rather than testing the participant's intelligence or English worth.

Ask separately for permission to:

1. observe and take notes;
2. record the screen or audio, if recording is useful;
3. inspect the local Beta summary;
4. copy an aggregate summary into research notes.

Do not request or collect a Full Backup, raw answers, complete PracticeLog, or Target Sentence history by default. If diagnosis genuinely needs raw local data, explain exactly what is needed and obtain separate consent before export. Participants may stop, skip a question, or request deletion of researcher-held notes at any time.

## Starting state

- Use a production-equivalent build with an empty or documented local profile.
- Confirm there is no unexpected prior checkpoint, due Review, or Quick Start preference.
- Confirm the app loads without console errors and that the participant's preferred theme and audio settings are usable.
- Use Starter Foundations as the reference authored-learning Course unless the sentence is already fully familiar; document any substitution.

## Session 1 — observed acquisition

Target duration: 25–35 minutes.

1. Ask the participant to describe what they think the product does from the first screen. Do not teach the interface yet.
2. Let the participant enter Quick Start and complete a first Practice Round.
3. If they become blocked, wait long enough to distinguish discoverability from hesitation, then provide the smallest neutral prompt. Record every intervention.
4. Ask the participant to explain the difference between Guided Recall and Independent Recall in their own words.
5. Observe whether they understand First Exposure, Recall Support, word-level feedback, Corrective Practice, and the returned Independent Recall.
6. Ask them to leave or reload once during an unfinished item, then resume. Do not announce the expected state.
7. If Review is due, observe whether the default Practice entry makes the priority clear. Otherwise explain that follow-up Review will appear later without revealing the schedule internals.
8. At the end, open Progress and the local Beta summary. Ask what each learner-facing result appears to mean before explaining it.
9. Ask three closing questions: what felt useful, what felt confusing or unfair, and what they would expect to do tomorrow.

## Follow-up sessions

Participants practice without the facilitator when Review becomes due. Request short check-ins near these windows where feasible:

- next day: complete the first due Review;
- within seven days: complete at least one further due Review and report any backlog or avoidance;
- after the 7-day cohort matures: inspect the local summary together;
- 30-day follow-up only for participants who remain active; do not treat an immature cohort as failure.

The participant may use other explicit scopes, but note when Course, Vocabulary, Focused Practice, or voluntary replay was chosen instead of due Review.

## Observation record

Create one de-identified record per participant with:

| Field | Record |
| --- | --- |
| Participant ID | Study-local identifier |
| Date / time zone | Local session date and IANA time zone when known |
| Device / browser / keyboard | Environment relevant to observed behavior |
| Starting state | Fresh, resumed, due backlog, or documented seed |
| First-round outcome | Completed without help, completed with interventions, or stopped |
| Interventions | Exact point and minimal facilitator help |
| Guided vs Independent explanation | Participant's own interpretation, paraphrased |
| Content friction | Prompt, meaning, accepted answer, support, grammar, IPA, or audio issue |
| Product friction | Entry, focus, shortcut, feedback, scheduling, recovery, or Progress issue |
| Emotional signal | Confidence, frustration, confusion, relief, or boredom with context |
| Return behavior | Dates and whether due Review was completed |
| Local measures | Aggregate values and evidence coverage only |
| Follow-up decision | Continue, content fix, product fix, investigate, or stop |

When reporting a bug, include reproducible actions, browser, visible result, expected result, and whether learning evidence was preserved. Do not paste a participant's raw answer unless it is essential and separately consented.

## Reading the local measures

- Weekly Retained Independent Sentences is the main outcome. It counts distinct due Review SentenceCards recalled perfectly on the first complete unsupported submission in the rolling seven-day window.
- Session completion uses engaged sessions. A merely opened screen is not a failure; after 24 hours an engaged checkpoint may appear as inferred abandonment and must be read with that label. It remains recoverable for 30 days, so resumption can reverse that inference before durable expiry.
- Same-round Independent Pass evaluates acquisition within the round where the card was introduced. It does not prove later retention.
- Recall Support, Reveal, Skip, and requeue-cap measures are diagnostic. Higher values may identify difficult content or useful scaffolding; they are not learner penalties.
- Due Review completion excludes Skip and Reveal-only outcomes. Current backlog is a snapshot, not a moral score.
- Next-day, 7-day, and 30-day cohorts appear only after their complete observation windows close.
- Evidence coverage must accompany every strict result. Legacy or pre-instrumentation activity remains historical activity but is not silently upgraded into retained recall.

## Initial decision hypotheses

Use the Roadmap hypotheses as starting points, not immutable pass/fail laws:

- at least 80% complete the first Practice Round without intervention;
- most can explain Guided versus Independent Recall;
- at least 60% return within seven days and complete a due Review;
- at least 70% of First Pass sentences are independently recalled at their first due Review;
- no reproducible flow loses evidence, duplicates scheduling consequences, or leaks the Target Sentence.

Always pair the small-sample numbers with observed behavior and evidence coverage. A miss can indicate product interaction, content quality, recruitment mismatch, schedule timing, or instrumentation—not just a failed learning method.

## Stop and fix conditions

Pause recruitment and fix the product before collecting more baseline data when any participant can reproducibly encounter:

- lost or duplicated First Pass, ReviewState, Attempt, or Practice Session Evidence;
- a Target Sentence exposed by Review, Progress, URL, accessibility text, checkpoint, or unsafe Prompt;
- a due Review silently replaced by unintended new learning;
- an unrecoverable Practice checkpoint or restore operation;
- a keyboard, IME, focus, or accessibility regression that prevents completion;
- a local summary whose numerator, denominator, coverage, or maturity label contradicts the stored evidence.

## Synthesis

After each group of three to five participants, group findings by content, learning scaffold, daily entry, scheduling, reliability, accessibility/input, and measurement. Fix high-confidence reliability and answer-leakage problems immediately. Delay broad content expansion, Touch Typing, personalization, and Double Pinyin decisions until the complete loop and a usable retention baseline have been observed across multiple sessions.
