# Studio teaching and test separation

Reviewed on 2026-10-23 against the learning-expansion specification and ADR 0004.

The two transfer activities use different independence boundaries. Context recall
tests a different authored cue for an already acquired expression. Sentence
families test an untaught combination of a taught structure. Neither activity
establishes spontaneous conversation ability or proves that a learner has never
encountered the English outside the recorded practice.

## Catalog audit

The audit covers 120 default cards, 25 family variants, 12 rehearsal steps and
nine contrast exercises: 156 teaching items and ten held-out family items.
Canonical targets and every accepted answer are compared using the same
normalization as answer evaluation, including contractions, case and punctuation.
The 40 contextual cues intentionally reuse acquired Starter expressions.

One family test leaked into teaching: `duration-4`, “I've worked here since
Monday.”, also appeared in the for/since contrast exercise. Its replacement is
`duration-since-tuesday`, “I've worked here since Tuesday.” The old ID continues
to mean Monday when interpreting historical evidence. No default card or
existing teaching target changed. After this correction, all ten family tests
are disjoint from the complete teaching answer set and from one another.

Training reuse remains valid: for example, a sentence already taught in Starter
may introduce a family or appear in a rehearsal. The exclusion applies to
held-out family answers, including their accepted variants. Catalog validation
also checks contrast-exercise prompt safety.

## Evidence and backup compatibility

New attempts and signals can carry `answerKeys`, a versioned identifier for each
normalized canonical or accepted expression. These keys are generated from the
authored answers, never the learner's submitted text. They let a later test
recognize recorded exposure even when an exercise ID changes. They are identity
metadata, not a security or authentication mechanism.

For sentence-family evidence, an earlier matching attempt, reveal or skip makes
the expression repeated. A currently saved personal sentence matching a test
answer also prevents a new-expression claim. Context evidence continues to
count the first recorded encounter with its cue separately from earlier recall
of the same expression. Revealing the current test still leaves that first
submitted encounter in the denominator, with assistance recorded.

The fields are optional in the local Studio schema and Full Backup v3. Older
records remain readable; known authored IDs, including retired `duration-4`, can
be resolved to their historical expressions. Unknown old IDs with no answer
metadata cannot be reconstructed. Existing historical flags are retained; the
new rules govern new submissions. Deleted personal content that was never
practised does not leave a separate exposure ledger.

Full-backup validation round-trips the optional keys, rejects malformed or
duplicate keys, and prevents new keyed attempts from claiming a practised
expression is new under a different ID. Restored keys participate in the same
submission rule. Active drafts remain excluded from backups.

## Repeatable verification

```sh
npx vitest run src/domain/studio src/application/studio \
  src/domain/backup/studioExposureBackup.test.ts \
  src/domain/backup/validateFullBackup.test.ts \
  src/infrastructure/persistence/dexie/LearningStudioStore.integration.test.ts
npx playwright test --project=chromium e2e/studio-recovery.spec.ts
npm run typecheck
npm run build
```

The regression cases cover cross-ID and accepted-answer overlap, contraction
equivalence, the retired Monday/new Tuesday distinction, contextual-cue
independence, assisted first encounters, legacy records without keys, and
reclassification after full-backup restore. Browser recovery tests wait for the
native input to become editable before issuing typing events.
