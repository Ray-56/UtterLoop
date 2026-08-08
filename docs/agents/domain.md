# Domain Docs

How engineering skills should consume UtterLoop's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant decisions under `docs/adr/`.

If one of these resources does not exist, proceed silently. Create or extend domain documentation only when the work resolves a real term or architectural decision.

## File structure

UtterLoop is a single-context repository:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, specification, proposal, test name, or implementation—use the term as defined in `CONTEXT.md`. Do not drift to a synonym that the glossary explicitly avoids.

If a required concept is absent, first reconsider whether existing language already covers it. When the distinction is durable and meaningful, update the glossary as part of the same change.

## Flag ADR conflicts

Surface any conflict with an existing ADR explicitly rather than silently overriding it.
