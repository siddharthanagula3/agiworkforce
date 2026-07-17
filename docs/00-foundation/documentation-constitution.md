# AGI Documentation Constitution

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Every human and AI agent that reads or writes documentation in this repository
Layer: docs/00-foundation
Document ID: AGI-DOC-0002
Related: [README.md](README.md), [documentation-standards.md](documentation-standards.md), [documentation-compiler.md](documentation-compiler.md), [canonical-glossary.md](canonical-glossary.md), `AGENTS.md`, `docs/decisions/CURRENT_DECISIONS.md`

---

These are the non-negotiable rules governing all AGI documentation. They mirror and extend the repository's existing invariants in `AGENTS.md`, `CLAUDE.md`, and `docs/decisions/CURRENT_DECISIONS.md`. When a future document conflicts with this constitution, the document is wrong.

## Article I — Implementation is the single source of truth

1. The running code, schemas, configuration, and tests are the **only** authoritative description of current behavior. Documentation describes the system; it does not define it.
2. When prose disagrees with implementation, **the implementation wins**. The prose is corrected and its status set to `Needs Update` (see Article VI), never the reverse.
3. Every claim about _current_ behavior must cite a source path (e.g., `packages/contracts/types/src/models.json`, `apps/web/proxy.ts`). Claims that cannot be grounded in the repo are marked **UNKNOWN**, never invented. (Mirrors `AGENTS.md` "Do not invent APIs, routes, env vars, schemas, prompts, docs, or release status.")

## Article II — Current vs Target must always be separable

1. Documents must clearly distinguish **Current** (what the code does today) from **Target** (the AGI-platform vision). Aspirations are never written as present-tense facts.
2. The gap between current and target lives in [documentation-migration-plan.md](documentation-migration-plan.md), not buried inside descriptive docs.

## Article III — Single definition, many references (no duplication)

1. Every concept is **defined once**, in its owning document, and **referenced** everywhere else (see [cross-reference-system.md](cross-reference-system.md)).
2. Terminology comes from [canonical-glossary.md](canonical-glossary.md). Requirements are cited by ID from [requirement-id-system.md](requirement-id-system.md). Do not restate a definition or a requirement; link to it.

## Article IV — Naming lock

1. The public brand is **AGI**. Internal repository, package (`@agiworkforce/*`), crate (`agiworkforce-*`), database, and on-disk state identifiers (`~/.agiworkforce`) remain **`agiworkforce`**. (Source: `docs/decisions/CURRENT_DECISIONS.md` #2, #15; `docs/engineering/naming-conventions.md`; `package.json`.)
2. Documentation may introduce AGI-platform product terminology (AGI Chat, AGI Cloud, AGI Code, etc. — see [canonical-glossary.md](canonical-glossary.md)). It must **not** instruct or perform a repository-wide code rename. Branding migration is a separate, staged plan (see [documentation-migration-plan.md](documentation-migration-plan.md) §Branding).

## Article V — Trust boundaries are sacred and must be documented honestly

1. Local, BYOK, and Managed Cloud are separate trust boundaries (`AGI-TRUST-0001`…`AGI-TRUST-0004`). Documentation must never describe a flow that silently crosses them.
2. Where the implementation's enforcement is incomplete (e.g., dormant row-level security, opt-in egress guard), the document states the **real** enforcement state and references the gap, rather than the intended one. (Honesty rule; mirrors `AGENTS.md` "Treat unusual product behavior as a bug.")

## Article VI — Status lifecycle; never delete automatically

1. Every canonical document carries a `Status:` of `Current`, `Needs Update`, `Deprecated`, or `Superseded` (defined in [documentation-standards.md](documentation-standards.md)).
2. Documentation is **never deleted automatically**. Obsolete documents are moved to `docs/archive/` **only after verification** that no current document depends on them, preserving history. (Mirrors `docs/current/source-of-truth.md` "Do not delete evidence casually.")
3. `docs/current/` and code win over `docs/archive/`. Archived material is evidence, not source of truth. (Source: `CURRENT_DECISIONS.md` #14, #18.)

## Article VII — Documentation must keep CI green

1. New canonical documents must satisfy `pnpm check:doc-status` (require `Status:`, `Owner`, `Last updated:` headers) and must be registered in `docs/agent-context/doc-status.json` when promoted to canonical.
2. Documentation changes must not break `pnpm check:repo-organization`, `pnpm check:agent-context`, or other guardrails. (Objective: preserve existing CI.)

## Article VIII — Agent-first readability

1. Documents are written so an AI agent can act on them: explicit IDs, explicit source paths, explicit status, explicit cross-references, no ambiguity, no marketing tone.
2. The reading order in [README.md](README.md) and [master-documentation-index.md](master-documentation-index.md) is the canonical onboarding path for any new agent.

## Article IX — Change discipline

1. A change to behavior and a change to its documentation belong in the **same** unit of work; do not let docs drift. (Mirrors `CURRENT_DECISIONS.md` conflict rule: "verify code behavior first, then update the doc and decision index in the same change.")
2. Do not combine file moves with behavior changes. (Mirrors `AGI_WORKFORCE.md` architecture lock.)

## Article X — This constitution is amendable, not ignorable

Amendments are made by editing this document, bumping `Last updated:`, and recording the rationale in [adr-index.md](adr-index.md). Until amended, every rule here is binding.
