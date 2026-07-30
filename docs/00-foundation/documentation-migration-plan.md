# AGI Documentation Migration Plan

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Founder, platform lead, and AI agents executing the documentation rollout
Layer: docs/00-foundation
Document ID: AGI-DOC-0012
Related: [master-documentation-index.md](master-documentation-index.md), [documentation-status-inventory.md](documentation-status-inventory.md), [architecture-manifest.md](architecture-manifest.md), [adr-index.md](adr-index.md), `docs/current/source-of-truth.md`

---

The staged plan to evolve AGI's documentation from today's state to the AGI-platform vision **without disrupting functionality, CI, or architecture** ([documentation-constitution.md](documentation-constitution.md) Articles I, VII; objectives 6–8 of the approved scope). Nothing in this plan authorizes a code rename or a mass refactor.

## 1. Sequencing (gated)

```
Phase A (DONE) ─ Foundation: docs/00-foundation/* + status inventory + this plan
        │  ◀── REVIEW GATE (approval required before Phase B) ──▶
Phase B ─ Reconcile current docs to implementation (the reconciliation queue)
Phase C ─ Build layers 01–02 (product + architecture) from verified content
Phase D ─ Build layers 03–09 (runtimes, platforms, features, backend, security, api, data)
Phase E ─ Build layers 10–12 (devops, testing, operations) + references
Phase F ─ Wire documentation into CI as a first-class gate
```

**Per the approved scope, work stops at the end of Phase A pending review.** Phases B–F are not started until this foundation is approved (`documentation-compiler.md` §5).

## 2. Review gate (exit criteria for Phase A)

- [x] `docs/00-foundation/` contains all 12 foundation documents (AGI-DOC-0001…0012).
- [x] Every foundation doc carries required headers and cross-references resolve.
- [x] [documentation-status-inventory.md](documentation-status-inventory.md) marks existing docs.
- [x] This migration plan exists with a branding sub-plan.
- [ ] **Founder/platform-lead review and approval** (manual gate — not satisfiable by an agent).

## 3. Reconciliation queue (Phase B backlog, priority order)

From [documentation-status-inventory.md](documentation-status-inventory.md) §6. Each item: correct the doc to match implementation, set `Last verified`, update status.

1. **Data layer** — Mark `CURRENT_DECISIONS.md` #17 Superseded; fix #13 evidence pointer (Supabase → Neon). (`AGI-DATA-0001`.)
2. **README honesty** — Correct model/provider counts (57/15), migration count (42), workflow count (13), and desktop build-target claims (mac/win disabled).
3. **Canonical product trio** — Refresh PRD, parity matrix, BYOK strategy to current code; align model counts and pricing.
4. **Pricing** — see §4.
5. **Security docs** — Re-verify RLS (dormant on live path), egress guard (opt-in/fetch-scoped), `codeql.yml` (runs cargo-audit + clippy, not CodeQL).

Each reconciliation is a small, reviewable change; none moves or deletes files. Archiving of any superseded doc happens **only after** verification that no current doc depends on it ([documentation-constitution.md](documentation-constitution.md) Article VI).

## 4. Pricing reconciliation (cross-cutting)

The repository currently encodes pricing in three places that disagree:

- `packages/contracts/types/src/billing-catalog.ts` (SSOT): `pro $20`, `max $100`, `team $25`; tiers `local-only/byok/free/pro/max/team/enterprise`.
- `apps/desktop/src/constants/pricing.ts` (UI): adds `hobby` ($5 target) and `pro_plus` ($49.99) that resolve to `$0` through the SSOT function.
- `packages/contracts/types/src/design-system/user-identity.ts` (comment): `Pro $29.99 / Pro+ $49.99 / Max $299.99`.

The India/₹ "Cheapest" tier referenced externally is **not present in the repository**. Documentation **must not** assert a pricing number until the implementation is unified. Recommended canonical: `billing-catalog.ts`. This is primarily a **code** divergence; the documentation records it as UNKNOWN-pending-resolution and points future authors at the SSOT. Tracked as a doc+code reconciliation item; the code fix is out of scope for this documentation bootstrap.

## 5. Target IA mapping (Phases C–E)

Existing docs migrate (by reference first, by move later, never by deletion) into the numbered layout from [documentation-standards.md](documentation-standards.md) §3:

| Existing                                                                                 | Target layer       |
| ---------------------------------------------------------------------------------------- | ------------------ |
| `docs/current/source-of-truth.md`, PRD, product-suite, parity-matrix                     | `01-product/`      |
| `docs/current/technical-architecture.md`, `architecture-manifest.md`, `docs/decisions/*` | `02-architecture/` |
| trust-mode-surface-matrix, byok strategy, provider-capability-matrix                     | `03-runtimes/`     |
| `docs/surfaces/*`                                                                        | `04-platforms/`    |
| (new feature specs)                                                                      | `05-features/`     |
| `services/*` docs, enterprise control-plane                                              | `06-backend/`      |
| `docs/security/*`, `apps/extension/THREAT_MODEL.md`, compliance                          | `07-security/`     |
| `docs/api/openapi.yaml` + examples                                                       | `08-api/`          |
| `apps/web/db/neon` schema docs (to be authored)                                          | `09-data/`         |
| `.github/workflows`, deployment, `BUILD.md`                                              | `10-devops/`       |
| test strategy (to be authored)                                                           | `11-testing/`      |
| runbooks, observability (to be authored)                                                 | `12-operations/`   |

Moves obey "do not combine file moves with behavior changes" and update `docs/agent-context/doc-status.json` in the same change.

## 6. Branding & naming migration (objective 9 — documentation only)

**Principle:** introduce AGI-platform product terminology in **documentation** now, while the codebase keeps `agiworkforce` identifiers. **No repository-wide rename** (`AGI-NAME-0001`; [documentation-constitution.md](documentation-constitution.md) Article IV).

- **Documentation terminology (now):** use AGI product names — AGI Chat, AGI Code, AGI Agent, AGI Cloud, AGI Desktop, AGI Mobile, AGI CLI, AGI VS Code Extension, AGI Browser Extension, AGI Website — defined in [canonical-glossary.md](canonical-glossary.md). Map each to its implementation surface; do not imply a code rename.
- **Code identifiers (unchanged):** `agiworkforce` for repo/packages/crates/db/state paths; `agi` CLI command with `agiworkforce` alias.
- **Future user-facing rename (separate, staged plan — not executed here):** any change to user-visible strings/assets toward the AGI product naming is a deliberate, reviewed effort with its own ADR ([adr-index.md](adr-index.md)), behind feature flags where it affects shipped UI, and never bundled with structural moves. It is explicitly out of scope for this documentation bootstrap.

## 7. Local Mode vs Cloud Mode product framing (toward the vision)

Documentation will increasingly describe **Local Mode** and **Cloud Mode** as two intentionally separate products sharing one platform (`AGI-PROD-0002`, [architecture-manifest.md](architecture-manifest.md) §12), while honestly recording the current shared-engine reality. The product-separation narrative is authored in `01-product/`/`03-runtimes/` during Phases C–D, grounded in the trust-mode matrix — never weakening a trust-boundary invariant.

## 8. CI integration (Phase F)

- Register every canonical doc in `docs/agent-context/doc-status.json` (done for the foundation in this bootstrap).
- Keep `pnpm check:doc-status` and `pnpm check:llm-operability` green for all documentation changes (`AGI-OPS-0001`).
- Consider (future, separate task) automating the [documentation-compiler.md](documentation-compiler.md) §2 rules as a check script.

## 9. Out of scope for this bootstrap

- Any code change (pricing unification, RLS activation, rename, refactor).
- Authoring feature documentation (layers 01–12).
- Moving or deleting any existing document.
- Re-enabling builds, fixing CI redness, or other product work.

These are recorded here so future agents do not mistake them for completed or authorized work.
