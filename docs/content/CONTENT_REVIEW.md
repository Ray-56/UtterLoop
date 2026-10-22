# Default-course content review

Date: 2026-10-22
Scope: the six default courses and their 120 stable SentenceCards.
Status: agent editorial review and automated content checks complete; independent human language review and learner-outcome validation remain separate.

## What was reviewed

All 120 targets, Chinese prompts, accepted alternatives, lesson objectives, card references, and source/license metadata were read together. The review checked whether the prompt communicates the intended meaning, whether the target is a natural bounded expression for that lesson, and whether an accepted alternative preserves the communicative intent. The generated [catalog inventory](./catalog-audit.md) makes every reviewed target and alternative visible for a later editorial pass.

The review does not treat a Chinese prompt as a uniquely translatable sentence. Recall still practices a specified learned expression. Different natural expressions outside that bounded exercise can remain valid English even when they are not accepted by the current evaluator.

## Delivered changes

- Work & Study Essentials revision 3 now has complete authored Learning Support for all 20 existing cards. Context, communicative function, patterns, one or two keywords, incomplete frames, US-English broad IPA, pronunciation chunks, grammar explanation, and word-level gloss/part-of-speech/IPA annotations are included.
- Both established agreement patterns for `data` are accepted on `wse-002`. The canonical target remains unchanged. [Cambridge's own dictionary entry](https://dictionary.cambridge.org/dictionary/english/data) describes both plural use and modern uncountable use with a singular verb. The annotation explains that variation instead of presenting one form as the only grammatical form.
- `wse-005` and `md-018` now express the inclusive deadline sense of `by` as “最晚到中午” / “最晚在星期四”. These are prompt clarifications, not changes to the English targets or card identities. [Cambridge English Grammar Today](https://dictionary.cambridge.org/grammar/british-grammar/until) distinguishes deadline `by` from duration `until`.
- Meetings & Decisions advances to revision 2 for the deadline-prompt clarification. Work & Study advances to revision 3 for the new support and accepted alternative. Other courses retain their revisions.
- The original 120 targets and their stable IDs remain intact. Installing the revised default catalog updates course-owned content, while existing learning records continue to refer to the same IDs.

Support coverage is now 40 authored cards out of 120. The remaining 80 intentionally retain the existing safe fallback; the audit reports them as fallback, not as complete authored support.

## Provenance

The original UtterLoop courses and the new Work & Study learning annotations use the existing CC0 dedication. No dictionary definitions or example sentences were copied into the course; reference works were consulted to resolve usage questions. IPA is an authored broad US-English teaching transcription, not a recording or a claim that all speakers pronounce each word identically. Connected-speech reductions may differ from the displayed citation-like forms.

The 20 VOA targets retain their transcript wording, per-card attribution, source URLs, and public-domain label. The official source pages and content statement were inspected on 2026-10-22:

- [Lesson 2 transcript](https://learningenglish.voanews.com/a/lets-learn-english-lesson-2-hello/3113733.html)
- [Lesson 3 transcript](https://learningenglish.voanews.com/a/lets-learn-english-lesson-3-i-am-here/3126527.html)
- [Lesson 4 transcript](https://learningenglish.voanews.com/a/lets-learn-english-lesson-4/3168920.html)
- [Lesson 5 transcript](https://learningenglish.voanews.com/a/lets-learn-english-lesson-5-where-are-you/3168971.html)
- [VOA Request Our Content](https://learningenglish.voanews.com/p/6861.html)

The automated provenance checks verify stored links and attribution, not remote availability or ongoing changes to external licensing statements. No remote audio, photographs, third-party news text, or VOA branding assets were added.

## Re-running the audit

From the repository root:

```bash
node scripts/content-audit.mjs --check
node scripts/content-audit.mjs --json
node scripts/content-audit.mjs > docs/content/catalog-audit.md
npm test -- src/application/seed
```

The audit exits with a nonzero status for structural problems. It calls the production catalog/support validators, verifies source/license references, requires complete word annotations for authored supports, and checks that chunk IPA reconstructs sentence IPA. It leaves editorial judgments to the checklist below. The report contains public course content only, never learner answers or learning history.

## Browser evidence

On 2026-10-22, `npx playwright test --project=chromium e2e/content.spec.ts` passed against the running application. Work & Study's first card displayed seven ordered grammar tokens with IPA and Chinese glosses during First Exposure. Starting recall hid the grammar map, a complete keyboard-captured answer produced a successful Guided result, and the persisted learning state became ready-independent without creating a First Pass. The journey reported no page errors. This verifies the authored content's integration with the real Practice UI; it is an automated browser observation rather than a human learning-outcome study.

## Editorial acceptance checklist

For each changed card, the reviewer should:

1. Read the lesson objective, prompt, target, and alternatives together. Confirm the exercise has a clear communicative purpose and does not reject an explicitly taught equivalent.
2. Read context and communicative function before revealing the answer. Check that neither discloses the complete target or alternative.
3. Reveal the learning attributes. Confirm the pattern generalizes, the frame retains blanks, and the selected keywords are useful without reproducing the answer.
4. Read pronunciation and grammar chunks in order. Confirm the chunks and word annotations reconstruct the target, and listen with an available US-English system voice while allowing natural accent variation.
5. Complete Guided and Independent Recall, intentionally make an error, and check corrective practice. Confirm the same support works inside the actual word track.
6. Revisit the card in a later due Review and record confusion, surprising rejections, or support dependence. These observations inform the next content revision; a green structural audit is not evidence of learning effectiveness.

The agent review found no reason to replace any target or create new card identities. Independent human signoff and actual learner observations have not been fabricated. Follow the existing [Beta validation guide](../research/2026-08-01-beta-learning-validation-guide.md) for those outcomes.
