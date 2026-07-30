# AGI Documentation Foundation (Layer 00)

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Every human and AI agent working in this repository
Layer: docs/00-foundation
Document ID: AGI-DOC-0001
Related: [documentation-constitution.md](documentation-constitution.md), [master-documentation-index.md](master-documentation-index.md), [canonical-glossary.md](canonical-glossary.md), `AGENTS.md`, `docs/current/source-of-truth.md`

---

## What this layer is

`docs/00-foundation/` is the **canonical foundation** of the AGI documentation system. It defines the rules, vocabulary, IDs, and indexes that **every other current and future document must obey**. It does not document features; it documents _how the platform and its documentation are described_, so that any agent can become productive within minutes.

This layer was bootstrapped on 2026-06-25 as an **additive** set. It does not modify, move, archive, or rename existing repository files. It treats the **implementation as the single source of truth** (`AGI-DOC-0002` in [documentation-constitution.md](documentation-constitution.md)); where existing prose disagrees with code, the code wins and the prose is marked for update in [documentation-status-inventory.md](documentation-status-inventory.md).

## Read in this order

1. [documentation-constitution.md](documentation-constitution.md) — the non-negotiable rules for all AGI docs (`AGI-DOC-0002`).
2. [canonical-glossary.md](canonical-glossary.md) — the authoritative terms (brand, trust modes, surfaces, primitives) with source citations (`AGI-DOC-0004`).
3. [architecture-manifest.md](architecture-manifest.md) — the canonical current architecture, the target AGI-platform architecture, and the gap (`AGI-DOC-0003`).
4. [requirement-id-system.md](requirement-id-system.md) — the `AGI-<DOMAIN>-<NNNN>` requirement-ID scheme and seed registry (`AGI-DOC-0005`).
5. [documentation-standards.md](documentation-standards.md) — front-matter, structure, naming, citation rules (`AGI-DOC-0006`).
6. [cross-reference-system.md](cross-reference-system.md) — how documents link and avoid duplication (`AGI-DOC-0007`).
7. [documentation-compiler.md](documentation-compiler.md) — the validation rules a doc set must pass (`AGI-DOC-0008`).
8. [master-documentation-index.md](master-documentation-index.md) — the map of all canonical docs + the planned `docs/` IA (`AGI-DOC-0009`).
9. [adr-index.md](adr-index.md) — the Architecture Decision Record index (`AGI-DOC-0010`).
10. [documentation-status-inventory.md](documentation-status-inventory.md) — every existing doc marked Current / Needs Update / Deprecated / Superseded (`AGI-DOC-0011`).
11. [documentation-migration-plan.md](documentation-migration-plan.md) — the staged plan from today's repo to the AGI-platform documentation vision, including the branding/naming migration sub-plan (`AGI-DOC-0012`).

## Relationship to existing canonical docs

This layer **complements, does not replace**, the existing entry points:

- `AGENTS.md` / `CLAUDE.md` — agent operating rules and critical safety invariants (still authoritative; this layer references them).
- `docs/current/source-of-truth.md` — the compact product source of truth (still authoritative).
- `docs/agent-context/*` — machine-readable repo map, known flaws, risk map, commands.
- `docs/decisions/CURRENT_DECISIONS.md` — locked decisions and conflict resolution.

The [migration plan](documentation-migration-plan.md) describes how these converge over time without disrupting current functionality, CI, or architecture.

## Scope boundary (bootstrap)

This foundation was produced under an explicitly bounded mandate: **foundation + status inventory + migration plan only**. Feature documentation (layers `01`–`12`) is **not** authored here and must wait for review and approval of this foundation. See [documentation-migration-plan.md](documentation-migration-plan.md) §Sequencing.
