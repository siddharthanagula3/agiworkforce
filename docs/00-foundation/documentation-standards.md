# AGI Documentation Standards

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Anyone authoring AGI documentation (human or agent)
Layer: docs/00-foundation
Document ID: AGI-DOC-0006
Related: [documentation-constitution.md](documentation-constitution.md), [cross-reference-system.md](cross-reference-system.md), [documentation-compiler.md](documentation-compiler.md), [master-documentation-index.md](master-documentation-index.md), `docs/engineering/naming-conventions.md`

---

## 1. Required front-matter

Every canonical document begins with a level-1 title followed by this metadata block (the first three markers are enforced by `pnpm check:doc-status`):

```
# <Title>

Status: <Current | Needs Update | Deprecated | Superseded>
Owner: <role, e.g. Platform lead>
Last updated: <YYYY-MM-DD>
Last verified against implementation: <YYYY-MM-DD>
Audience: <who this is for>
Layer: <docs/NN-name>
Document ID: AGI-DOC-<NNNN>
Related: <links to related docs / IDs>

---
```

`Status:`, `Owner`, and `Last updated:` are **mandatory** for any doc registered in `docs/agent-context/doc-status.json` (`AGI-OPS-0001`).

## 2. Status values

- **Current** — verified against implementation on `Last verified` date; safe to act on.
- **Needs Update** — still useful but known to diverge from implementation; the divergence is logged in [documentation-status-inventory.md](documentation-status-inventory.md).
- **Deprecated** — no longer the recommended source; retained for reference; points to its replacement.
- **Superseded** — replaced by a specific newer document/decision; cite the successor.

## 3. The documentation layout (target IA)

The `docs/` tree converges on this numbered information architecture. Only `00-foundation/` is populated in this bootstrap; the rest are **planned** and authored only after foundation review ([documentation-migration-plan.md](documentation-migration-plan.md)).

| Layer              | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `00-foundation/`   | Rules, glossary, IDs, indexes (this layer)                       |
| `01-product/`      | Product vision, PRDs, personas, journeys, feature matrix         |
| `02-architecture/` | System & per-surface architecture, ADRs                          |
| `03-runtimes/`     | Local/BYOK/Managed runtimes, provider abstraction, AI runtime    |
| `04-platforms/`    | Per-surface platform docs (web/desktop/mobile/cli/vscode/chrome) |
| `05-features/`     | Feature specifications                                           |
| `06-backend/`      | Services, gateway, signaling, control plane                      |
| `07-security/`     | Threat models, trust-boundary enforcement, compliance            |
| `08-api/`          | Public/internal API references                                   |
| `09-data/`         | Schema, migrations, sync model, storage                          |
| `10-devops/`       | CI/CD, deployment, release, environments                         |
| `11-testing/`      | Test strategy, quality gates                                     |
| `12-operations/`   | Runbooks, incident response, observability                       |
| `references/`      | Cross-cutting reference material                                 |

This IIA does not replace the existing `docs/current/`, `docs/agent-context/`, `docs/decisions/`, `docs/surfaces/`, `docs/engineering/` trees; the [migration plan](documentation-migration-plan.md) maps existing docs into it over time.

## 4. Naming

- Files: kebab-case `.md` (e.g., `architecture-manifest.md`).
- Folders: `NN-name` numbered layers.
- Product terms: from [canonical-glossary.md](canonical-glossary.md). Brand = **AGI**; never rename code identifiers (`AGI-NAME-0001`).

## 5. Writing rules

- **Cite sources.** Every statement about current behavior cites a repo path. Unprovable claims are marked **UNKNOWN** (`documentation-constitution.md` Article I).
- **Separate Current from Target** (Article II). Never write aspiration as fact.
- **Reference, don't restate** (Article III). Link to glossary terms, requirement IDs, and other docs.
- **Agent-first tone.** Declarative, precise, no marketing language.
- **States.** User-facing flows document loading/empty/error/disabled/success states where relevant.
- **Size.** Prefer focused documents; split when a doc exceeds a single coherent topic.

## 6. Engineering standards (pointers)

Domain coding standards (TypeScript, React, Expo, Rust, backend, testing, security, logging, errors, telemetry, API design, database, accessibility, performance, observability, CI/CD) will live under `02-architecture/` and `10-devops/` and are authored **after** foundation review. Until then, the authoritative engineering rules are:

- `docs/engineering/naming-conventions.md`
- `docs/engineering/service-layer-architecture.md`
- `docs/engineering/agent-native-development.md`
- `docs/engineering/agent-harness-rollout.md`
- `AGENTS.md` "LLM Failure Prevention Rules" + `docs/agent-context/llm-failure-taxonomy.json`

These are referenced, not duplicated, by future standards docs.
