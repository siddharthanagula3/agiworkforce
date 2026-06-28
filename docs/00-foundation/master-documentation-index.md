# AGI Master Documentation Index

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Every human and AI agent; the canonical map of all AGI documentation
Layer: docs/00-foundation
Document ID: AGI-DOC-0009
Related: [README.md](README.md), [documentation-status-inventory.md](documentation-status-inventory.md), [documentation-migration-plan.md](documentation-migration-plan.md), `docs/current/README.md`, `AGENTS.md`

---

The single map of where AGI knowledge lives. Start here, then follow the reading order. Status of each doc is tracked in [documentation-status-inventory.md](documentation-status-inventory.md).

> **Highest authority:** [platform-constitution.md](platform-constitution.md) (AGI-DOC-0013) — The AGI Platform Constitution defines _what AGI fundamentally is_; every document in this repository inherits from it. Only the implementation and explicit ADRs override it. Read it first for identity and intent, then this map for where everything lives.

> **Highest engineering authority:** [architecture-constitution.md](architecture-constitution.md) (AGI-DOC-0015) — The AGI Architecture Constitution defines _how AGI is engineered_; every runtime, API, database, security, and feature specification inherits from it. It inherits from the Platform Constitution and is overridden only by the implementation and explicit ADRs.

## 1. Start here (canonical entry points)

| Doc                                  | Role                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `AGENTS.md`                          | Tool-neutral agent operating rules + critical safety invariants. First read for any agent. |
| `CLAUDE.md`                          | Claude-specific mirror of critical rules.                                                  |
| [00-foundation/README.md](README.md) | Entry to the documentation foundation (this layer).                                        |
| `docs/current/source-of-truth.md`    | Compact product source of truth, trust modes, P0 gaps.                                     |
| `docs/agent-context/repo-map.json`   | Machine-readable surface/owner/check map.                                                  |

## 2. Foundation layer (`docs/00-foundation/`)

| Document ID  | File                                                                                   | Purpose                                                                      |
| ------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| AGI-DOC-0001 | [README.md](README.md)                                                                 | Foundation entry + reading order                                             |
| AGI-DOC-0002 | [documentation-constitution.md](documentation-constitution.md)                         | Non-negotiable documentation rules                                           |
| AGI-DOC-0003 | [architecture-manifest.md](architecture-manifest.md)                                   | Canonical current + target architecture                                      |
| AGI-DOC-0004 | [canonical-glossary.md](canonical-glossary.md)                                         | Authoritative terminology                                                    |
| AGI-DOC-0005 | [requirement-id-system.md](requirement-id-system.md)                                   | `AGI-<DOMAIN>-<NNNN>` system + seed registry                                 |
| AGI-DOC-0006 | [documentation-standards.md](documentation-standards.md)                               | Front-matter, IA, naming, writing rules                                      |
| AGI-DOC-0007 | [cross-reference-system.md](cross-reference-system.md)                                 | Linking + no-duplication system                                              |
| AGI-DOC-0008 | [documentation-compiler.md](documentation-compiler.md)                                 | Validation ruleset + completion gate                                         |
| AGI-DOC-0009 | [master-documentation-index.md](master-documentation-index.md)                         | This map                                                                     |
| AGI-DOC-0010 | [adr-index.md](adr-index.md)                                                           | Architecture Decision Record index                                           |
| AGI-DOC-0011 | [documentation-status-inventory.md](documentation-status-inventory.md)                 | Doc-vs-implementation status                                                 |
| AGI-DOC-0012 | [documentation-migration-plan.md](documentation-migration-plan.md)                     | Migration + branding plan                                                    |
| AGI-DOC-0013 | [platform-constitution.md](platform-constitution.md)                                   | Highest **product** authority — what AGI is                                  |
| AGI-DOC-0014 | [owner-decision-register.md](owner-decision-register.md)                               | Owner decision/approval queue + conflicts                                    |
| AGI-DOC-0015 | [architecture-constitution.md](architecture-constitution.md)                           | Highest **engineering** authority — how built                                |
| AGI-DOC-0016 | [master-documentation-roadmap.md](master-documentation-roadmap.md)                     | Canonical doc-generation roadmap (Volumes→Books→Chapters)                    |
| AGI-DOC-0017 | [engineering-constitution-authority-map.md](engineering-constitution-authority-map.md) | Engineering-constitution inheritance router (domain→AC §§/rules; no new law) |
| AGI-DOC-0018 | `docs/03-runtimes/context-runtime/bk-11.01-deterministic-context-assembly.md`          | First generated engineering book — VOL-11/BK-11.01 (Context Runtime)         |
| AGI-DOC-0019 | `docs/implementation-backlog.md`                                                       | Canonical implementation backlog (engineering-book audit findings)           |

## 3. Existing canonical docs (current source of truth)

Tracked in `docs/agent-context/doc-status.json` → `currentSourcesOfTruth`. Foundation docs **reference** these; they remain authoritative for their domains.

- `docs/current/source-of-truth.md` — product definition, launch lock, trust modes, P0 gaps.
- `docs/current/agi-product-requirements.md` — long-form PRD (status: Needs Update — see inventory).
- `docs/current/parity-implementation-matrix.md` — feature×surface×status grid (Needs Update).
- `docs/current/byok-open-model-provider-strategy.md` — provider/model strategy (Needs Update).
- `docs/current/product-suite.md` — product thesis, surfaces, trust modes.
- `docs/current/trust-mode-surface-matrix.md` — authoritative per-surface trust modes.
- `docs/current/technical-architecture.md` — monorepo shape, contracts, control plane.
- `docs/current/commercial-and-launch.md` — launch posture, managed-cloud gates.
- `docs/current/provider-capability-matrix.md`, `docs/current/agent-and-repo-operability.md`.
- `docs/decisions/CURRENT_DECISIONS.md` + `docs/decisions/*` — locked decisions / ADRs (see [adr-index.md](adr-index.md)).
- `docs/agent-context/*` — repo-map, known-flaws, risk-map, commands, lanes, llm-failure-taxonomy.
- `docs/surfaces/*` — per-surface docs (web/desktop/mobile/cli/chrome-extension/vscode-extension).
- `docs/engineering/*` — naming, service-layer, agent-native, harness-rollout.
- `docs/enterprise/*`, `docs/security/*`, `docs/api/*` (incl. `openapi.yaml`).
- Root: `README.md`, `AGI_WORKFORCE.md`, `PLAN.md`, `TODO.md`, `CHANGELOG.md`, `BUILD.md`, `ONBOARDING.md`.

## 4. Planned IA (target; authored after foundation review)

`01-product/` · `02-architecture/` · `03-runtimes/` · `04-platforms/` · `05-features/` · `06-backend/` · `07-security/` · `08-api/` · `09-data/` · `10-devops/` · `11-testing/` · `12-operations/` · `references/`. Mapping of existing docs into these layers is in [documentation-migration-plan.md](documentation-migration-plan.md).

## 5. Evidence & historical (not source of truth)

`audit/` (use `audit/INDEX.md`), `reports/`, `tasks/`, `docs/archive/**` — evidence/working notes only, per `docs/agent-context/doc-status.json` and [documentation-constitution.md](documentation-constitution.md) Article VI.
