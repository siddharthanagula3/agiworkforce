# AGI Requirement ID System

Status: Current
Owner: Platform lead
Last updated: 2026-06-27
Last verified against implementation: 2026-06-25
Audience: Architects, PMs, and AI agents authoring requirements or referencing them
Layer: docs/00-foundation
Document ID: AGI-DOC-0005
Related: [canonical-glossary.md](canonical-glossary.md), [architecture-manifest.md](architecture-manifest.md), [cross-reference-system.md](cross-reference-system.md), [adr-index.md](adr-index.md)

---

## 1. Scheme

Every product requirement, invariant, or non-negotiable rule receives a stable ID:

```
AGI-<DOMAIN>-<NNNN>
```

- `<DOMAIN>` — one of the registered domains below.
- `<NNNN>` — zero-padded sequence, unique within the domain, **immutable once assigned**.

IDs are referenced (never restated) by other documents, ADRs, tests, and code comments. A retired requirement keeps its ID with `Status: Superseded` and a pointer to its replacement; the number is **never reused**.

## 2. Domains

| Domain  | Scope                                                   |
| ------- | ------------------------------------------------------- |
| `PROD`  | Product-level invariants (one chat, product separation) |
| `ARCH`  | Architecture & dependency rules                         |
| `TRUST` | Trust-boundary invariants (Local/BYOK/Managed)          |
| `PRIV`  | Privacy & telemetry                                     |
| `SEC`   | Security enforcement                                    |
| `AI`    | Model catalog, routing, provider abstraction            |
| `DATA`  | Storage, schema, persistence                            |
| `SYNC`  | Cross-surface synchronization                           |
| `BILL`  | Billing, pricing, managed-cloud gating                  |
| `SURF`  | Surface scope and roles                                 |
| `UX`    | User-experience locks                                   |
| `DX`    | Developer & agent experience                            |
| `COMP`  | Compliance & legal                                      |
| `OPS`   | Deployment, CI, observability                           |
| `NAME`  | Naming & branding                                       |
| `DOC`   | Documentation system (Document IDs use `AGI-DOC-*`)     |

## 3. Seed registry

This is the canonical seed set, extracted from the implementation and current docs. Each requirement cites its source. Status reflects **enforcement reality**, not intent (per [documentation-constitution.md](documentation-constitution.md) Article V).

| ID               | Requirement                                                                                                                                                                                                                                                                                                                                                                                 | Source                                                                    | Status                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `AGI-PROD-0001`  | One unified chat across surfaces; file work is a state of a conversation, not a separate surface (non-regression).                                                                                                                                                                                                                                                                          | `CURRENT_DECISIONS.md` #11; PRD §4                                        | Enforced                                              |
| `AGI-PROD-0002`  | Local Mode and Cloud Mode are intentionally separate products sharing one platform.                                                                                                                                                                                                                                                                                                         | Platform vision; [architecture-manifest.md](architecture-manifest.md) §12 | Target                                                |
| `AGI-ARCH-0001`  | SDKs are adapters, not architecture; AGI owns runtime schemas, event stream, tool contracts, usage accounting.                                                                                                                                                                                                                                                                              | `CURRENT_DECISIONS.md` #7, #12                                            | Enforced                                              |
| `AGI-ARCH-0002`  | apps must not import apps; packages must not import apps; services must not import UI.                                                                                                                                                                                                                                                                                                      | `AGI_WORKFORCE.md`; `check:boundaries`                                    | Enforced                                              |
| `AGI-TRUST-0001` | Local mode never silently routes chats/files/tools/telemetry to BYOK or Managed; Local fails closed.                                                                                                                                                                                                                                                                                        | `suite-contracts.ts`; `egressGuard.ts`; cli `agent/mod.rs`                | Partially enforced (egress guard opt-in/fetch-scoped) |
| `AGI-TRUST-0002` | Local→BYOK is an explicit fork (selection, secret scan, preview, label, consent); the original Local thread stays Local.                                                                                                                                                                                                                                                                    | `LocalByokHandoffDialog.tsx`; `@agiworkforce/utils`                       | Enforced (desktop/CLI)                                |
| `AGI-TRUST-0003` | Managed Cloud is the only metered egress and the only writer to the shared cloud chat store; in public alpha, open by default since 2026-06-27 (env kill-switch only; controls keep pace, do not gate access).                                                                                                                                                                              | `trust-mode-surface-matrix.md`; `commercial-and-launch.md`                | Active — public alpha (env kill-switch)               |
| `AGI-TRUST-0004` | BYOK is available only on Desktop/CLI/VS Code; absent on Mobile/Web/Chrome.                                                                                                                                                                                                                                                                                                                 | `trust-mode-surface-matrix.md`; mobile `v1FeatureFlags.byokKeys=false`    | Enforced                                              |
| `AGI-PRIV-0001`  | Telemetry is consent-gated; never raw prompts, files, local paths, tool output, screenshots, or Local-origin content.                                                                                                                                                                                                                                                                       | PRD §22; `apps/mobile/services/cloudSettingsMapping.ts`                   | Enforced                                              |
| `AGI-SEC-0001`   | User data isolation enforced server-side. RLS policies exist (`0037`,`0039`) but are dormant on the live path; active isolation is app-layer `where user_id`.                                                                                                                                                                                                                               | `apps/web/db/neon/0037`; `apps/web/lib/server`                            | Partially enforced (RLS dormant)                      |
| `AGI-AI-0001`    | Model IDs and capabilities come from `packages/types/src/models.json` SSOT; never hardcoded.                                                                                                                                                                                                                                                                                                | `CURRENT_DECISIONS.md` #9                                                 | Enforced                                              |
| `AGI-AI-0002`    | Auto-routing must be explainable; silent model substitution is rejected.                                                                                                                                                                                                                                                                                                                    | `CURRENT_DECISIONS.md` #10                                                | Enforced                                              |
| `AGI-DATA-0001`  | `apps/web/db/neon` is the canonical migration root; raw SQL, no ORM.                                                                                                                                                                                                                                                                                                                        | `AGI_WORKFORCE.md`; `0001`–`0042`                                         | Enforced                                              |
| `AGI-SYNC-0001`  | Normal app-chat sync is only Web/Desktop/Mobile; CLI/VS Code/Chrome are workspace/task scoped unless explicitly handed off.                                                                                                                                                                                                                                                                 | `CURRENT_DECISIONS.md` #4                                                 | Enforced                                              |
| `AGI-BILL-0001`  | Managed cloud and credits are in public alpha, open by default since 2026-06-27; the private-beta/waitlist launch gate is removed (env kill-switch only). Metering, fraud, refunds, chargebacks, retention, and provider terms must keep pace with public usage but no longer gate access. Credit **top-up** availability remains a separate, undecided product question (see register D4). | `CURRENT_DECISIONS.md` #5; `commercial-and-launch.md`                     | Active — public alpha (env kill-switch)               |
| `AGI-SURF-0001`  | Six first-class surfaces (Web, Desktop, Mobile, CLI, VS Code, Chrome) + the Sandbox renderer.                                                                                                                                                                                                                                                                                               | `CURRENT_DECISIONS.md` #3                                                 | Enforced                                              |
| `AGI-UX-0001`    | Empty-chat state and settings IA are locked (composer controls; General/Account/Privacy/Billing/Usage/Capabilities/Connectors/AGI Code/AGI in Chrome/Extensions/Developer).                                                                                                                                                                                                                 | PRD §6, §16                                                               | Partially enforced                                    |
| `AGI-DX-0001`    | The repo is agent-native: layered `AGENTS.md`, machine-readable `docs/agent-context`, lane ownership, CI guardrails.                                                                                                                                                                                                                                                                        | `AGENTS.md`; `docs/engineering/agent-native-development.md`               | Enforced                                              |
| `AGI-COMP-0001`  | EU AI Act Article 50(1)/(2) disclosure + provenance markers; Chinese-HQ provider opt-in gate before any provider request.                                                                                                                                                                                                                                                                   | `packages/compliance/llm-gate.ts`                                         | Enforced                                              |
| `AGI-OPS-0001`   | Documentation and code changes must keep `pnpm check:llm-operability` green; do not break CI.                                                                                                                                                                                                                                                                                               | `package.json`; `AGENTS.md`                                               | Enforced                                              |
| `AGI-NAME-0001`  | Public brand is AGI; internal repo/package/crate/state identifiers stay `agiworkforce`. No repository-wide rename.                                                                                                                                                                                                                                                                          | `CURRENT_DECISIONS.md` #2, #15                                            | Enforced                                              |

## 4. Rules for adding requirements

1. Assign the next free number in the domain; record source path and a real `Status`.
2. Reference the ID from any document that depends on it; do not restate the rule.
3. If enforcement reality differs from intent, the `Status` reflects **reality** and the gap is logged in [documentation-status-inventory.md](documentation-status-inventory.md) or the migration plan.
4. Superseding a requirement: set the old ID `Superseded`, add the replacement ID, and record an ADR ([adr-index.md](adr-index.md)).
