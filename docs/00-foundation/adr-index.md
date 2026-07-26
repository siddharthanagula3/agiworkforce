# AGI Architecture Decision Record Index

Status: Current
Owner: Platform lead
Last updated: 2026-06-27
Last verified against implementation: 2026-06-25
Audience: Architects and AI agents making or referencing decisions
Layer: docs/00-foundation
Document ID: AGI-DOC-0010
Related: [architecture-manifest.md](architecture-manifest.md), [requirement-id-system.md](requirement-id-system.md), [documentation-status-inventory.md](documentation-status-inventory.md), `docs/decisions/CURRENT_DECISIONS.md`

---

This is the index of recorded architecture/product decisions. AGI keeps decisions in two complementary forms: the **locked decision register** (`docs/decisions/CURRENT_DECISIONS.md`) and individual **decision records** (`docs/decisions/*.md`). This index catalogs both and defines the forward process.

## 1. Locked decision register (`docs/decisions/CURRENT_DECISIONS.md`)

21 numbered locked decisions, each with evidence. The load-bearing ones are mirrored as requirement IDs in [requirement-id-system.md](requirement-id-system.md):

| Decision | Summary                                                   | Requirement      | Status                                                                                                                                                                                                                                    |
| -------- | --------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1       | Application suite, not a model lab                        | —                | Current                                                                                                                                                                                                                                   |
| #2, #15  | Brand AGI; identifiers stay `agiworkforce`; CLI `agi`     | `AGI-NAME-0001`  | Current                                                                                                                                                                                                                                   |
| #3       | Six first-class surfaces                                  | `AGI-SURF-0001`  | Current                                                                                                                                                                                                                                   |
| #4       | App-chat sync only Web/Mobile/Desktop                     | `AGI-SYNC-0001`  | Current                                                                                                                                                                                                                                   |
| #5       | Managed cloud waitlist/private-beta until controls proven | `AGI-BILL-0001`  | **Superseded** (2026-06-27) — managed cloud is now public alpha, open by default; the private-beta/waitlist launch gate is removed (`AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is a kill-switch only). See §3 and owner-decision-register D7. |
| #6       | Local→BYOK is a fork, not a flip                          | `AGI-TRUST-0002` | Current                                                                                                                                                                                                                                   |
| #7, #12  | SDKs are adapters; `provider-protocol` canonical          | `AGI-ARCH-0001`  | Current                                                                                                                                                                                                                                   |
| #8       | Vercel AI Gateway only behind Managed                     | `AGI-TRUST-0003` | Current                                                                                                                                                                                                                                   |
| #9       | No hardcoded model IDs; catalog SSOT                      | `AGI-AI-0001`    | Current                                                                                                                                                                                                                                   |
| #10      | Explainable auto-routing; no silent substitution          | `AGI-AI-0002`    | Current                                                                                                                                                                                                                                   |
| #11      | One chat layout across surfaces                           | `AGI-PROD-0001`  | Current                                                                                                                                                                                                                                   |
| #13      | Enterprise managed compute prerequisites                  | `AGI-BILL-0001`  | Current (cites a Supabase migration path — see §3)                                                                                                                                                                                        |
| #14, #18 | docs/current + code win over archive                      | `AGI-DOC-0002`   | Current                                                                                                                                                                                                                                   |
| #16      | Repo naming/structure conventions                         | —                | Current                                                                                                                                                                                                                                   |
| #17      | "Production stays on Supabase until Clerk/Neon verified"  | `AGI-DATA-0001`  | **Superseded** — implementation is fully Neon + Clerk (`packages/platform/data-layer`, `apps/web`)                                                                                                                                        |
| #19      | BYOK provider+model+capability metadata                   | `AGI-AI-0001`    | Current                                                                                                                                                                                                                                   |
| #20      | Serial surface order; Mobile active                       | —                | Current                                                                                                                                                                                                                                   |
| #21      | BYOK Native First with labels/consent                     | `AGI-TRUST-0002` | Current                                                                                                                                                                                                                                   |

## 2. Individual decision records (`docs/decisions/*.md`)

Strategic:

- `2026-05-20-openai-anthropic-application-suite-thesis.md` — the suite thesis (anchors #1). Current.
- `2026-05-21-unified-chat-as-suite-spine.md` — `unified-chat` as the shared engine. Current.
- Cross-surface sync boundary stance — superseded by the delta-sync design now recorded in `architecture-manifest.md` §6 and implemented in `packages/client/sync`.
- Signed-upload contract — executed; the contract itself now lives in `packages/contracts/types/src/chat.ts` (`SignedUploadRequest`, `MAX_ATTACHMENT_BYTES`).
- `2026-05-09-strategic-*` — acquisition optionality, customer focus, foundation-first sprint, maximalist surface coverage, 3-VM parallel. Current (strategic posture).

Tactical (engineering decisions): `2026-05-09-bridge-over-rewrite-store-migration.md`, `depth-counter-circularity.md`, `dispatch-supabase-rpc-injection.md`, `dispatch-two-layer-dedup.md`, `onchange-fires-before-listeners.md`, `per-endpoint-auth-ladder.md`, `per-surface-queue-factory.md`, `sticky-retry-context.md`, `stream-watchdog-promise-race.md`, `try-with-rust-context.md`, `worksecret-codec-in-types.md`, `zoom-unsupported-until-tabs-permission.md`.

> Note: records referencing **Supabase** (`dispatch-supabase-rpc-injection.md`, and #13/#17 above) describe a retired data layer. They are retained as history; the canonical data layer is Neon (`AGI-DATA-0001`). Verify against `packages/platform/data-layer` before reuse.

## 3. Stale / superseded decisions to reconcile

- **#5 (Managed cloud waitlist/private-beta)** → Superseded by the founder decision of 2026-06-27: managed cloud / managed compute is now **public alpha, open by default**. The private-beta/waitlist launch gate is removed; `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as an incident-response kill-switch. Billing/metering/abuse/fraud/refund/chargeback/retention/deletion/provider-term controls must keep pace with public usage but no longer gate access. The separate trust-boundary rule still holds: Local, BYOK, and Managed Cloud are distinct boundaries and Local/BYOK are never silently routed into managed cloud. Recorded in owner-decision-register (D7 resolved).
- **#17 (Supabase production)** → Superseded by the Neon+Clerk implementation. Reconciliation tracked in [documentation-status-inventory.md](documentation-status-inventory.md) and [documentation-migration-plan.md](documentation-migration-plan.md).
- **#13** references `supabase/migrations/...` for evidence; the live migrations are `apps/web/db/neon/*`. Update the evidence pointer, keep the decision.

## 4. Forward ADR process

1. New architecture/product decisions are recorded as `docs/decisions/<YYYY-MM-DD>-<slug>.md` and, if load-bearing, added to `CURRENT_DECISIONS.md` and mirrored as a requirement ID.
2. Each ADR states: context, decision, status (`Proposed | Accepted | Superseded`), consequences, and the requirement IDs it creates or changes.
3. Superseding a decision sets the old record `Superseded` with a pointer; the old requirement ID is retired per [requirement-id-system.md](requirement-id-system.md) §4.
4. Any change touching an `AGI-TRUST-*` invariant **requires** an ADR ([architecture-manifest.md](architecture-manifest.md) §13).
