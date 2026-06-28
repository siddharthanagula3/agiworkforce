# AGI Documentation Status Inventory

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Documentation maintainers and AI agents reconciling docs with code
Layer: docs/00-foundation
Document ID: AGI-DOC-0011
Related: [documentation-migration-plan.md](documentation-migration-plan.md), [adr-index.md](adr-index.md), [documentation-constitution.md](documentation-constitution.md), `docs/agent-context/doc-status.json`

---

This inventory marks existing documentation against the implementation, per [documentation-constitution.md](documentation-constitution.md) Article I. Status values are defined in [documentation-standards.md](documentation-standards.md) §2. **No document is deleted automatically**; "Superseded/Deprecated" items are archived only after verification (Article VI).

Verification basis: the implementation review behind this foundation (surfaces, `packages/types/src/models.json`, `billing-catalog.ts`, `apps/web/db/neon`, `trust-mode-surface-matrix.md`, `docs/agent-context/known-flaws.md`, GitHub state) as of 2026-06-25.

## 1. Foundation layer (this bootstrap)

All `docs/00-foundation/*` (AGI-DOC-0001…0017) — **Current** (authored/verified 2026-06-25). `AGI-DOC-0017` is the **Engineering Constitution Authority Map** — a non-duplicative inheritance router (domain → governing AC §§/rules + roadmap owner); it defines no new law and proposes ≤4 AC amendments awaiting founder approval. Includes the Platform Constitution (`AGI-DOC-0013`), the owner decision register (`AGI-DOC-0014`), and the **Architecture Constitution** (`AGI-DOC-0015`) — the highest engineering authority (**v1.1**: 63 sections, a **107-rule** immutable canon, Design Decision Framework), and the **Master Documentation Roadmap** (`AGI-DOC-0016`, **v1.0-RC**: 42 volumes / 201 books / 782 chapters). Beyond the foundation, the first generated engineering book — **`AGI-DOC-0018`** (VOL-11/BK-11.01 Deterministic Context Assembly, `docs/03-runtimes/context-runtime/`) — and the canonical **implementation backlog `AGI-DOC-0019`** (`docs/implementation-backlog.md`, 17 book-audit findings) are registered. All are registered in `doc-status.json` and pass `check:doc-status`.

## 2. Current canonical docs

| Doc                                                                  | Status           | Evidence / divergence                                                                                   | Recommended action                                                       |
| -------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `docs/current/source-of-truth.md`                                    | **Current**      | Dated 2026-06-06; matches trust model + P0 gaps.                                                        | Keep; re-verify quarterly.                                               |
| `docs/current/trust-mode-surface-matrix.md`                          | **Current**      | Dated 2026-06-20; authoritative per-surface trust modes; matches code.                                  | Keep as canonical for `AGI-TRUST-*`.                                     |
| `docs/current/product-suite.md`                                      | **Current**      | Matches thesis + sync boundary.                                                                         | Keep.                                                                    |
| `docs/current/commercial-and-launch.md`                              | **Current**      | Matches gating posture.                                                                                 | Keep.                                                                    |
| `docs/current/agi-product-requirements.md` (PRD)                     | **Needs Update** | Dated 2026-05-28; omits dollar pricing; model/migration counts drift vs implementation.                 | Refresh to current code; align with `billing-catalog.ts`, `models.json`. |
| `docs/current/parity-implementation-matrix.md`                       | **Needs Update** | Dated 2026-05-28; "Partial" labels lag fixes; counts stale.                                             | Re-verify each row against source.                                       |
| `docs/current/byok-open-model-provider-strategy.md`                  | **Needs Update** | States "25 providers / 84 model entries"; implementation has 57 entries / 15 populated providers.       | Reconcile to `models.json`.                                              |
| `docs/current/technical-architecture.md`                             | **Needs Update** | Pre-dates some structural changes; verify against [architecture-manifest.md](architecture-manifest.md). | Cross-check, update.                                                     |
| `docs/current/provider-capability-matrix.md`                         | **Needs Update** | Verify against `models.json` capability flags.                                                          | Reconcile.                                                               |
| `docs/current/agent-and-repo-operability.md`                         | **Current**      | Matches guardrail set.                                                                                  | Keep.                                                                    |
| `docs/decisions/CURRENT_DECISIONS.md`                                | **Needs Update** | #17/#13 reference Supabase; implementation is Neon+Clerk.                                               | Mark #17 Superseded; fix #13 evidence ([adr-index.md](adr-index.md)).    |
| `docs/agent-context/known-flaws.md`                                  | **Current**      | Dated 2026-06-23; tracks `LOCAL-CHAT-NOINVOKE-01` etc.                                                  | Keep; primary risk source.                                               |
| `docs/agent-context/repo-map.json`, `commands.json`, `risk-map.json` | **Current**      | Machine-readable; match repo.                                                                           | Keep.                                                                    |
| `docs/agent-context/doc-status.json`                                 | **Current**      | Registry; updated this bootstrap to add foundation docs.                                                | Keep in sync.                                                            |

## 3. Root docs

| Doc                | Status           | Evidence / divergence                                                                                                                                                                                                                                       | Action                                |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `AGENTS.md`        | **Current**      | Authoritative agent rules. The 2026-06-25 v1.0 restructure had dropped the `Owner` header and the `agent-native-development.md` / `lanes.json` references; restored 2026-06-25 (additive), so `check:doc-status` and `check:agent-context` now pass (RC=0). | Keep; reference foundation.           |
| `CLAUDE.md`        | **Current**      | Mirrors critical rules.                                                                                                                                                                                                                                     | Keep.                                 |
| `AGI_WORKFORCE.md` | **Current**      | Product/architecture locks.                                                                                                                                                                                                                                 | Keep.                                 |
| `README.md`        | **Needs Update** | Claims "80+ models / 20+ providers" (actual 57/15), "34 migrations" (actual 42), "11 workflows" (actual 13), and macOS/Windows/Linux signed desktop builds (mac/win currently disabled).                                                                    | Correct counts + build-target claims. |
| `PLAN.md`          | **Current**      | Active transition plan; some counts (e.g., "83 slash commands") are registry vs wired — clarify.                                                                                                                                                            | Keep; clarify counts.                 |
| `TODO.md`          | **Needs Update** | Header date lags body entries.                                                                                                                                                                                                                              | Fix header date.                      |
| `CHANGELOG.md`     | **Current**      | Round-based completed-work log.                                                                                                                                                                                                                             | Keep.                                 |

## 4. Surface, engineering, enterprise, security docs

- `docs/surfaces/*` (6) — **Needs Update (verify)**: re-check each against its surface; promote verified content into `04-platforms/` during migration.
- `docs/engineering/*` (7) — **Current**: naming/service-layer/agent-native rules match practice.
- `docs/enterprise/*`, `docs/security/*` — **Needs Update (verify)**: control-plane is early; security summary dated 2026-05-30 (re-verify RLS/egress claims).
- `docs/api/openapi.yaml` + examples — **Needs Update (verify)**: reconcile with the 149 web route handlers.

## 5. Historical / superseded (archive — do not cite as current)

- `docs/archive/**` (≈659 files) — **Superseded / historical**. Already governed by `docs/agent-context/doc-status.json` `historicalOrCaution`. Do not delete; do not cite as current.
- `audit/**`, `reports/**`, `tasks/**` — **Evidence / working notes**, not source of truth.

## 6. Reconciliation queue (feeds the migration plan)

Priority order for doc-debt remediation (owned by [documentation-migration-plan.md](documentation-migration-plan.md)):

1. `CURRENT_DECISIONS.md` #17/#13 Supabase → Neon (correctness).
2. `README.md` counts + build-target claims (public honesty).
3. PRD + parity matrix + BYOK strategy refresh (canonical product truth).
4. Pricing reconciliation across `billing-catalog.ts` vs desktop UI vs design-system comment (a code+doc divergence; see [documentation-migration-plan.md](documentation-migration-plan.md) §Pricing).
5. Security docs re-verify (RLS dormant, egress opt-in, `codeql.yml` naming).
