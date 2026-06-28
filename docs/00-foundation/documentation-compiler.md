# AGI Documentation Compiler (Rules)

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: AI agents and tooling that generate or validate AGI documentation
Layer: docs/00-foundation
Document ID: AGI-DOC-0008
Related: [documentation-constitution.md](documentation-constitution.md), [documentation-standards.md](documentation-standards.md), [cross-reference-system.md](cross-reference-system.md), [requirement-id-system.md](requirement-id-system.md)

---

The "compiler" is the **ruleset and validation procedure** that any document set must satisfy to be considered canonical and internally consistent. It is a specification, not an implementation; a future tooling task may automate it. Until then, agents apply these checks manually before declaring documentation work complete.

## 1. Inputs

- The documents under `docs/00-foundation/` (and, later, the `01`–`12` layers).
- The registry `docs/agent-context/doc-status.json`.
- The implementation (the source of truth, [documentation-constitution.md](documentation-constitution.md) Article I).

## 2. Validation rules (must all pass)

1. **Front-matter present.** Each canonical doc has a title and the metadata block from [documentation-standards.md](documentation-standards.md) §1, including `Status:`, `Owner`, `Last updated:`.
2. **Registered & green.** Each canonical doc is listed in `docs/agent-context/doc-status.json` and passes `pnpm check:doc-status` (`AGI-OPS-0001`).
3. **IDs resolve.** Every `AGI-<DOMAIN>-<NNNN>` referenced in any doc is defined in [requirement-id-system.md](requirement-id-system.md). Every `AGI-DOC-<NNNN>` is unique.
4. **Terms resolve.** Every load-bearing term is defined in [canonical-glossary.md](canonical-glossary.md).
5. **Links resolve.** Every relative doc link points to an existing file; every cited source path exists in the repo.
6. **No duplication.** No concept is defined in two places ([cross-reference-system.md](cross-reference-system.md) §1).
7. **Status consistency.** A doc's `Status:` matches its row in [documentation-status-inventory.md](documentation-status-inventory.md).
8. **Implementation-grounded.** Every present-tense claim about behavior cites a source path or is marked UNKNOWN; no aspiration written as fact (Article I, II).
9. **Naming lock honored.** No document instructs a repository-wide rename of `agiworkforce` identifiers (`AGI-NAME-0001`).
10. **CI preserved.** The change set keeps `pnpm check:llm-operability` green.

## 3. Reconciliation procedure (implementation wins)

When validation rule 8 fails (doc disagrees with code):

1. Re-read the cited implementation.
2. Correct the document to match the code.
3. Set `Last verified against implementation:` to today.
4. If the doc cannot yet be made correct, set `Status: Needs Update` and log the divergence in [documentation-status-inventory.md](documentation-status-inventory.md).
5. Never change the code to match the doc as part of a documentation task.

## 4. Build/verify commands

The repository's existing guardrails are the compiler's executable surface:

```bash
pnpm check:doc-status            # required headers on registered docs
pnpm check:agent-context         # agent-context invariants
pnpm check:repo-organization     # structure / root-clutter rules
pnpm check:llm-operability       # full operability gate (aggregates the above)
```

A documentation change is "compiled" only when these pass and the manual rules in §2 hold.

## 5. Completion gate

Documentation work is complete only when: all §2 rules pass; the relevant checks in §4 are green; and (for this bootstrap) the foundation set + [documentation-status-inventory.md](documentation-status-inventory.md) + [documentation-migration-plan.md](documentation-migration-plan.md) exist and cross-reference correctly. Per the approved scope, work **stops** here pending review.
