# AGI — Owner Decision Register & Handoff

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-27
Last verified against implementation: 2026-06-25
Audience: Repository owner (decision-maker) and any agent resuming this work
Layer: docs/00-foundation
Document ID: AGI-DOC-0014
Related: [documentation-migration-plan.md](documentation-migration-plan.md), [documentation-status-inventory.md](documentation-status-inventory.md), [platform-constitution.md](platform-constitution.md), [adr-index.md](adr-index.md)

---

## Purpose

This is the single **decision surface** for the AGI documentation/platform effort. It exists because the work is deliberately **staged and permission-gated**: progress beyond the documentation foundation requires either an explicit product decision from the owner or an implementation change. This document **identifies and documents conflicts** and **collects every recommendation requiring human judgment** — it does **not** resolve anything that needs the owner's call (per [documentation-constitution.md](documentation-constitution.md) Article I and the project's "resolve only when sufficient evidence exists" rule).

It is non-mutating: no implementation, no renames, no Phase B reconciliation, no new milestone has been started. Detail for any row lives in the referenced foundation docs; this register adds the **decision / authority** lens those docs do not own ([cross-reference-system.md](cross-reference-system.md) single-owner rule).

## 1. Where the work stands

- **Documentation foundation (Phase A): complete.** `docs/00-foundation/` holds the foundation set (`AGI-DOC-0001`–`0016`), the **Platform Constitution** (`AGI-DOC-0013`, refined per owner instruction: Local Mode = user-owned compute + storage; hierarchy Platform → Cloud Services → Surfaces → Experiences → Capabilities → Features), and this register (`AGI-DOC-0014`).
- All foundation documents are registered in `docs/agent-context/doc-status.json` and pass `check:doc-status`.
- **The Architecture Constitution (A3) is authored and registered** (`architecture-constitution.md`, `AGI-DOC-0015` — engineering philosophy, 60 sections, a 100-rule immutable canon, Design Decision Framework, and 14 scoped inheriting runtime books). Beyond it, `docs/` layers `01`–`12` remain planned (not authored); Phase B reconciliation is not started; no implementation, pricing, security, or CI fix has been made.

## 2. Why the work is paused (and why that is correct)

The remaining work cannot proceed autonomously because **every remaining blocker is gated on the owner** (a product decision) or on an implementation change. Resolving them without that input would either invent direction or contradict the staged-approval pattern the owner has used at every step. This register is the artifact that lets the owner unblock the next stage.

## 3. Decision queue — product calls only the owner can make

These require the owner's judgment; an agent must not pick. Each becomes an ADR ([adr-index.md](adr-index.md)) once decided.

| ID  | Decision needed                                                                                                         | Options                                                                                                                                   | Recommendation                                                                                                                                                                                                                                                                                     | Evidence                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Canonical pricing.** Three sources disagree.                                                                          | (a) `billing-catalog.ts` ($20/$100/$25) as SSOT; (b) desktop UI tiers (hobby/pro_plus); (c) design-system comment ($29.99/$49.99/$299.99) | (a) `billing-catalog.ts` as SSOT; reconcile others to it                                                                                                                                                                                                                                           | `packages/contracts/types/src/billing-catalog.ts`; `apps/desktop/src/constants/pricing.ts`; `packages/contracts/types/src/design-system/user-identity.ts`                                                       |
| D2  | **India / ₹ "Cheapest" tier** — does it exist?                                                                          | exists / does not exist                                                                                                                   | Owner-only; **not present in repo** today                                                                                                                                                                                                                                                          | No INR pricing constants found in repo                                                                                                                                                                          |
| D3  | **`hobby` and `pro_plus` tiers** — real or remove?                                                                      | keep (add to SSOT) / remove (UI-only artifacts resolving to $0)                                                                           | Owner-only                                                                                                                                                                                                                                                                                         | desktop UI defines them; SSOT does not                                                                                                                                                                          |
| D4  | **Credit top-ups** — offered or not?                                                                                    | yes / no                                                                                                                                  | **RESOLVED — yes**, by founder Decision #22 in `docs/decisions/CURRENT_DECISIONS.md` (opt-in, off by default, capped, 12-month expiry, per-tier payout parity; supersedes the earlier "no top-ups" memo). Not yet buyable: fulfillment exists but no surface starts the purchase (ledger BIZ-022). | `apps/web/app/api/stripe-webhook/lib/db.ts` (`handleCreditTopUp`), `apps/web/app/api/cron/reset-credits/route.ts`. There is no `api/.../credit-topup` route — the path this row used to cite has never existed. |
| D5  | **AGI Code** — mount the Desktop experience or formally gate it?                                                        | mount / gate-and-hide                                                                                                                     | **RESOLVED 2026-08-04 — mount.** Mounted as `CodeWorkspace`, Local-only (nav hidden, navigate guard, and eviction on a switch to Managed Cloud). The `CodeModeHome` stub was deleted in `c39eba06c`.                                                                                               | `apps/desktop/src/features/code/CodeWorkspace.tsx`; `apps/desktop/src/features/v3/DesktopShellV3.tsx`                                                                                                           |
| D6  | **Mobile BYOK timing** — confirm "not in v1; later when secure key storage ships."                                      | confirm / change                                                                                                                          | Confirm (matches `trust-mode-surface-matrix.md` + `v1FeatureFlags.byokKeys=false`)                                                                                                                                                                                                                 | `apps/mobile/lib/v1FeatureFlags.ts`                                                                                                                                                                             |
| D7  | **Managed Cloud GA criteria & timeline** — when do `pro/max` leave waitlist?                                            | define gates/date                                                                                                                         | **RESOLVED / SUPERSEDED 2026-06-27** — managed cloud is now public alpha, open by default; the private-beta/waitlist launch gate is removed (env kill-switch only). See the recorded decision below §3 and adr-index #5.                                                                           | `commercial-and-launch.md`; `billing-catalog.ts` (`waitlist:true`)                                                                                                                                              |
| D8  | **Local Mode vs Cloud Mode product separation in code** — how far to formalize the two-product split in implementation. | scope to define                                                                                                                           | Owner-only; constitution sets intent (`AGI-PROD-0002`), code is shared-engine today                                                                                                                                                                                                                | [architecture-manifest.md](architecture-manifest.md) §12                                                                                                                                                        |
| D9  | **Post-Mobile surface sequencing** — trigger to start the next surface.                                                 | per `CURRENT_DECISIONS.md` #20                                                                                                            | Owner-only                                                                                                                                                                                                                                                                                         | `docs/current/source-of-truth.md` launch lock                                                                                                                                                                   |

### Recorded decision — 2026-06-27 — Managed Cloud → Public Alpha (resolves D7; supersedes adr-index #5)

**Decision (founder, 2026-06-27).** AGI's Managed Cloud / managed compute moves from private beta to **public alpha, open by default**. The private-beta/waitlist _launch gate_ is removed. The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env now exists only as an optional **incident-response kill-switch** (set to `0`/`false`/`off` to re-gate). Billing, metering, abuse, fraud, refund, chargeback, retention, deletion, and provider-term controls must **keep pace with public usage** but **no longer gate access**.

**Scope preserved (unchanged by this decision).** Local, BYOK, and Managed Cloud remain **separate trust boundaries**; Local/BYOK chats, files, tools, and telemetry MUST NEVER be silently routed into managed cloud. Managed cloud remains the only metered egress and the only writer to the shared cloud chat store, and access stays **gated by subscription/entitlement** (entitlement gating ≠ the removed launch gate). The marketing/waitlist UX persists only for genuinely unavailable hosted capacity.

**Applied to:** `CLAUDE.md`, `AGENTS.md`, `scripts/check-agent-context.mjs`, `docs/current/source-of-truth.md`, `apps/web/lib/managed-compute-gate.ts` (+ tests), and the 00-foundation docs (architecture-constitution §27/§43/AC-86, canonical-glossary, requirement-id-system `AGI-TRUST-0003`/`AGI-BILL-0001`, adr-index #5).

## 4. Approval queue — within my authority, ready on your "go"

Non-product work I can execute immediately upon approval. None has been started.

| ID  | Work                                                                                                                                                                                                                                          | Effort   | Improvement                                                               | Evidence                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | **Fix `AGENTS.md`**: restore `Owner:` header + references to `agent-native-development.md` and `lanes.json`.                                                                                                                                  | ~3 lines | ✅ Done (2026-06-25) — greened `check:doc-status` + `check:agent-context` | grep: all three markers = 0 occurrences (a session commit stripped them)                                                                         |
| A2  | **Phase B doc reconciliation** (no product decisions): mark `CURRENT_DECISIONS.md` #17 Superseded + fix #13 evidence (Supabase→Neon); correct `README.md` counts (57/15 models, 42 migrations, 13 workflows) and desktop build-target claims. | small    | Documentation honesty; CI/agent-context integrity                         | [documentation-status-inventory.md](documentation-status-inventory.md) §6; [documentation-migration-plan.md](documentation-migration-plan.md) §3 |
| A3  | **Author the Architecture Constitution** (engineering philosophy + architectural principles) — the approved next milestone, before any runtime specs.                                                                                         | medium   | ✅ Done 2026-06-25 — authored, registered, CI-green                       | `architecture-constitution.md` (AGI-DOC-0015); 60 §§ + 100-rule canon                                                                            |
| A4  | **Refresh the canonical product trio** (PRD, parity matrix, BYOK strategy) to current code — after D1–D9 inputs where pricing/tiers are involved.                                                                                             | medium   | Removes the largest doc-vs-code drift                                     | inventory §2 (all "Needs Update", dated 2026-05-28)                                                                                              |
| A5  | **Author `docs/` layers 01–12** per the migration plan IA mapping.                                                                                                                                                                            | large    | Completes the documentation system                                        | [documentation-migration-plan.md](documentation-migration-plan.md) §5                                                                            |

## 5. Conflict register (implementation vs documentation vs vision)

> Architecture-level findings surfaced by the Architecture Constitution (AGI-DOC-0015) are recorded as a full structured decision backlog in **§9** below (ARCH-D1…ARCH-D17).

Documented per the project rule "identify the conflict explicitly, document it, resolve only when sufficient evidence exists." Detail in the referenced docs.

| Conflict                                                          | Canonical (recommended)              | Resolver                | Status                                           |
| ----------------------------------------------------------------- | ------------------------------------ | ----------------------- | ------------------------------------------------ |
| Pricing 3-way divergence                                          | `billing-catalog.ts`                 | Owner (D1–D4) + code    | Open — needs decision                            |
| `CURRENT_DECISIONS.md` #17/#13 say "Supabase"; code is Neon+Clerk | Neon+Clerk (`AGI-DATA-0001`)         | Me (A2)                 | Ready on approval                                |
| `README.md` counts/build claims wrong                             | Implementation                       | Me (A2)                 | Ready on approval                                |
| `AGENTS.md` missing `Owner` + required refs                       | Restore (additive)                   | Me (A1)                 | ✅ Resolved 2026-06-25 — both checks green       |
| RLS defined (`0037`/`0039`) but dormant on live path              | Implementation = app-layer isolation | Code change (owner/eng) | Open — implementation                            |
| Egress guard opt-in / fetch-scoped (not global)                   | Implementation (documented honestly) | Code change             | Open — implementation                            |
| `LOCAL-CHAT-NOINVOKE-01` — Local desktop chat invoke broken       | n/a (defect)                         | Code fix                | Open — implementation, **highest product risk**  |
| `codeql.yml` runs cargo-audit+clippy, not CodeQL                  | Implementation (rename/clarify)      | Code/CI change          | Open — implementation                            |
| Desktop macOS/Windows release builds disabled                     | Implementation                       | Code/CI change          | ✅ Resolved — protected signed release pipelines |
| Web Sentry is a no-op stub                                        | Implementation                       | Code change             | Open — implementation                            |
| CLI MCP OAuth tokens stored cleartext                             | Implementation (vault rewire)        | Code change             | Open — implementation                            |

## 6. CI / validation status

- **Foundation docs (`AGI-DOC-0001`–`0016`): pass** `check:doc-status`; `check:repo-organization` passes.
- **`check:doc-status` and `check:agent-context` both pass (RC=0)** as of 2026-06-25, after the A1 `AGENTS.md` fix (added the `Owner` field; restored the two required references). `check:repo-organization` also passes.
- **Broader CI is red** independent of this work (test suites failing per the most recent run history). Greening it requires code fixes (owner/eng), not documentation.

## 7. Assumptions & uncertainties (explicit)

- **Assumption:** `billing-catalog.ts` is the intended pricing SSOT (it is the typed source consumed by `getPlanPriceUsd`). **Uncertainty:** the design-system comment and desktop UI imply different numbers — unresolved pending D1.
- **Resolved (2026-06-25):** the `AGENTS.md` gap came from the intentional v1.0 restructure (confirmed by reading the file), which dropped the `Owner` field and two `check:agent-context`-mandated references. Fixed additively under /loop authorization, preserving the restructure; both guardrails now pass.
- **Assumption:** "Local Mode = user-owned compute + storage" and the Experiences hierarchy (owner-approved this turn) are now canonical intent; current code remains shared-engine, which is documented as the gap, not hidden.
- **Uncertainty (UNKNOWN):** api-gateway production deploy target; managed-cloud GA timeline; whether RLS is intended to be bound on the live path; intended SAST tool. These need owner/eng input.

## 8. Recommended next staged step

**A1 and A3 are complete.** The remaining within-authority, zero-product-risk step is **A2** (Phase B doc reconciliation: retire the Supabase decision; correct README counts). With the Architecture Constitution in place, the inheriting runtime-spec books it scopes (see its _Relationship to Future Documents_) are now unblocked — but authoring them is a large new milestone to be approved separately, not begun autonomously. Provide inputs for **D1–D9** to unblock **A4** (canonical product-trio refresh). Note: the constitution's Appendix A records **17 new architecture-level findings** (A1–A17) beyond the **7** already owned by the conflict register / `known-flaws.md` (A18 is a resolved editorial note). Those 17 findings are now recorded as the structured decision backlog in **§9** below (recording only — every entry Status: Open, nothing resolved or implemented), per your explicit approval.

Everything else in §3 and the implementation rows of §5 remains **outside agent authority** and awaits your decision.

## 9. Architecture decision backlog (AGI-DOC-0015 Appendix A → findings A1–A17)

The seventeen entries below are strategic architecture decisions surfaced by the Architecture Constitution (AGI-DOC-0015) and recorded here as the canonical Owner Decision Register backlog. They are RECORD-ONLY and remain unresolved (Status: Open) — none has been implemented, decided, or closed; each is a verified problem awaiting an owner's choice between convergence and a recorded divergence ADR. Each entry carries the owner-decision lens (recommendation, impact, and required decision), while the constitution's Appendix A retains ownership of the engineering pointer for each finding (its raising section and closing runtime-spec book). This register restates the decision surface, not the implementation; the constitution remains the source of truth for the AC-rule text and the spec book that will eventually close each item.

**Owner-urgency ranking (critic, highest→lowest):** ARCH-D5 → ARCH-D14 → ARCH-D12 → ARCH-D1 → ARCH-D13 → ARCH-D11 → ARCH-D4 → ARCH-D9 → ARCH-D6 → ARCH-D10 → ARCH-D7 → ARCH-D2 → ARCH-D15 → ARCH-D16 → ARCH-D17 → ARCH-D8 → ARCH-D3.

### ARCH-D1 — Provider-identity SSOT drift across three mirrors

**Maps to:** constitution Appendix A · A1 · governing rule AC-10 · raised in §14, §50 · closing book: AI Runtime Spec / Module Boundary & Dependency Governance Spec
**Related findings:** ARCH-D2, ARCH-D3, ARCH-D4
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. Verified by direct inspection: (1) packages/contracts/types/src/provider.ts:77-105 contains exactly 28 entries (counted: openai through lmstudio on line 105). (2) jq '.providers | keys | length' on packages/contracts/types/src/models.json returns…

**Problem statement.** The platform declares LLM provider identity in three canonical locations that have diverged: the TypeScript Provider union (28 entries), the models.json provider keys (25 entries), and the desktop Rust Provider enum (25 entries). Three providers (lmstudio, ollama_cloud, minimax) exist in the union but have no catalog entry. Additionally, lmstudio ships a typed adapter package with no corresponding models.json entry, leaving its capability metadata undefined at the SSOT. No CI guard detects this divergence, enabling silent capability lies.

**Current implementation.** The Provider union lives at packages/contracts/types/src/provider.ts:77-105 and exports 28 snake_case string literals: openai, anthropic, google, ollama, xai, deepseek, qwen, moonshot, perplexity, zhipu, managed_cloud, mistral, groq, together, fireworks, cerebras, deepinfra, nvidia_nim, open_router, cohere, ai21, sambanova, azure, bedrock, ollama_cloud, minimax, runway, lmstudio. The models.json provider keys (packages/contracts/types/src/models.json) enumerate exactly 25 provider objects at the top level under .providers: ai21, anthropic, azure, bedrock, cerebras, cohere, deepinfra, deepseek, fireworks, google, groq, managed_cloud, mistral, moonshot, nvidia_nim, ollama, open_router, openai, perplexity, qwen, runway, sambanova, together, xai, zhipu (missing from union: none; missing from catalog: lmstudio, minimax, ollama_cloud — ai21 IS present at models.json:386-400). The desktop Rust Provider enum (apps/desktop/src-tauri/src/core/llm/mod.rs:649-675) contains 25 enum variants: OpenAI, Anthropic, Google, Ollama, Perplexity, XAI, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, ManagedCloud, Groq, Together, Fireworks, Cerebras, DeepInfra, Cohere, AI21, Sambanova, Azure, Bedrock, NvidiaNim, OpenRouter, OllamaCloud (missing: Minimax, Runway, LmStudio). The provider.ts comment (lines 12-14) directs maintainers to update a Rust mirror at apps/desktop/src-tauri/src/core/llm/models_config.rs for the Provider enum, but that file (the model-catalog loader) does not define the enum — it only re-imports it (use super::Provider;); the enum actually lives at mod.rs:649, so the pointer is misdirected (see ARCH-D3). A typed adapter package exists at packages/ai/providers/lmstudio/package.json with dependencies on provider-runtime and types, but lmstudio has no entry in models.json, so its capabilities are undefined at the SSOT.

**Proposed architecture (target — not a build order).** Establish and enforce provider-identity SSOT correspondence via AC-10: (1) Keep the Provider union, models.json provider keys, and all Rust enum mirrors in exact one-to-one correspondence, verified by a CI guard that fails the build when an entry exists in one mirror but not the others. (2) Require every typed adapter package (packages/ai/providers/\*/package.json) to have a corresponding entry in models.json with at minimum a label field, enforced by the same CI guard. (3) Update the stale mirror pointer in provider.ts lines 12-14 to reference the correct file path (apps/desktop/src-tauri/src/core/llm/mod.rs:649). (4) For each currently-drifted provider, decide: add to catalog (if it is production-ready), or remove from the union and Rust enums (if it is deprecated). The CI guard makes this decision auditable going forward.

**Evidence.**

- packages/contracts/types/src/provider.ts:77-105 — Provider union with 28 entries including lmstudio, ollama_cloud, minimax
- packages/contracts/types/src/models.json — .providers top-level keys enumerate 25 entries; jq '.providers | keys | length' returns 25; ai21 IS present (models.json:386-400); lmstudio, minimax, ollama_cloud do not appear
- apps/desktop/src-tauri/src/core/llm/mod.rs:649-675 — Rust enum Provider with 25 variants, omitting Minimax, Runway, LmStudio
- packages/ai/providers/lmstudio/ — typed adapter package with package.json declaring dependencies on @agiworkforce/types and @agiworkforce/provider-runtime, but no entry in models.json catalog
- packages/contracts/types/src/provider.ts:12-14 — misdirected comment pointing maintainers to apps/desktop/src-tauri/src/core/llm/models_config.rs for the Provider enum; that file exists (the model-catalog loader) but only re-imports the enum (use super::Provider;) — the enum is at mod.rs:649 (see ARCH-D3)
- docs/00-foundation/architecture-constitution.md:256 — documents the current drift with counts: TS union 28, models.json 25, Rust enum 25
- docs/00-foundation/architecture-constitution.md:951 — AC-10 rule stating the three mirrors MUST be kept in correspondence and verified by a CI guard

**Architectural rationale.** AC-10 and the SSOT principle (AC-09, §14, §50 of the constitution) establish that provider identity is a single source of truth consumed by all surfaces. Divergent mirrors of one SSOT are the platform's most reliable source of capability lies. A typed adapter package for a provider signals to developers that the provider is supported, but if the catalog has no entry, the adapter's capabilities (context window, pricing, supported models) are undefined — clients reading from the canonical catalog cannot discover them. The stale mirror pointer enables the Rust drift to persist untracked. A CI guard is the only mechanical enforcement that can prevent silent drift in future changes and hold the system accountable to the constitution's trust-boundary and capability-honesty invariants.

**Alternatives considered.**

- 1. Accept as intentional divergence with a recorded ADR — rationale: lmstudio, ollama_cloud, minimax are local-only or experimental providers that do not need catalog entries. Cost: breaks the SSOT law and leaves capability metadata undefined at read time. Tradeoff: requires a documented decision explaining why each drifted provider is excluded, and a change to the constitution's AC-10 rule to permit justified divergence. Not recommended without explicit owner decision and corresponding ADR.
- 2. Converge by removing the three drifted providers from the TS union and Rust enums immediately — rationale: if they are not in the catalog, they should not be in the type system. Cost: may break code that imports Provider type. Tradeoff: requires a deprecation timeline and migration of any code that uses these providers.
- 3. Converge by adding all three missing providers (lmstudio, minimax, ollama_cloud) to models.json with catalog entries — rationale: the SSOT should be comprehensive. Cost: requires capability data (context window, pricing, capabilities) for each provider. Tradeoff: must be sourced from official provider docs and verified before adding to the catalog.
- 4. Record divergence as a deferred gap (status quo, this finding) — accepted as the immediate action: record the gap in the Owner Decision Register with evidence, recommend convergence path, and require owner decision before implementation. CI guard added in follow-up work.

**Benefits.**

- Complete accuracy of the Provider type system — the union, catalog, and Rust enums form one truthful contract for every surface
- Capability honesty — when a provider appears in the type system, clients can look it up in the catalog and find its actual capabilities, context window, pricing, and models
- Drift detection — a CI guard catches future desynchronization at commit time, not at runtime or during a support incident
- Adapter-package auditability — a typed adapter package signals support, and the CI guard ensures the catalog entry exists to back that signal
- Lower maintenance burden — the mirror-update step is now tracked and auditable rather than documented in a stale file comment

**Risks.**

- Risk if status quo persists: capability lies — lmstudio and ollama_cloud can be imported and used in type systems, but clients reading the catalog have no way to discover their capabilities, models, or pricing. An adapter package for lmstudio signals support, but the catalog does not record what that support includes.
- Risk if converge by adding to catalog without verification: incorrect capability data — if minimax, ollama_cloud, or lmstudio are added to models.json without current official capability data, the SSOT becomes stale and clients rely on outdated information.
- Risk if converge by removing from union: breaking change — any code that imports Provider and pattern-matches on these names will break. Requires a deprecation timeline and coordinated rollout across desktop, CLI, and web surfaces.
- Risk of the CI guard: false-positive breakage — if the guard is too strict (e.g., requires every Rust-enum variant to appear in the TS union), it could block legitimate local-only-provider changes. The guard logic must be carefully scoped to the three canonical mirrors and the catalog.
- Risk of partial implementation: drift resumes silently — if the provider.ts comment is fixed but the CI guard is not added, the mirror-update step remains untracked and drift can recur.

**Dependencies.**

- AC-09 and AC-10 rules in architecture-constitution.md — the SSOT and mirror-correspondence principles that govern this finding
- AI Runtime Spec (closing runtime book) — responsible for designing the provider-identity convergence and the CI guard mechanism
- Module Boundary & Dependency Governance Spec (closing runtime book) — responsible for enforcing that typed adapter packages have catalog entries
- ARCH-D2 (related finding) — the lmstudio-specific capability-honesty gap (typed adapter with no catalog entry)

**Migration considerations.** "Migration to convergence must occur in stages to avoid breaking CI or runtime behavior. Stage 1: Decide on each drifted provider (minimax, ollama_cloud, lmstudio, runway, ai21) — keep in union+catalog or remove from union+Rust. This requires owner input. Stage 2a (if keeping): add missing entries to models.json with verified capability data from official provider docs, update Rust enums to match, fix the provider.ts mirror pointer. Stage 2b (if removing): deprecate from TS union and Rust enums with a timeline, emit a migration warning, coordinate rollout across surfaces. Stage 3: Add CI guard that fails the build if .providers keys do not match the TS union keys and Rust enum keys, and if any typed adapter package (packages/ai/providers/\*) lacks a models.json entry. Stage 4: Run the guard against the canonical state to ensure it passes before committing. This prevents silent drift in future changes. No breaking changes to running code if decision is to keep the providers — only correctness improvements. If decision is to remove, requires a coordinated deprecation timeline."

**Recommendation (for the owner — not a decision).** Converge the three mirrors and add a CI guard. Specifically: (1) Declare an owner decision on each of the three missing providers (lmstudio, minimax, ollama_cloud) — keep in the SSOT or deprecate from the type system. If keeping, source verified capability data from official provider docs. (2) Once the owner decision is made, implement a CI guard script (in scripts/ or .github/workflows/) that fails the build if the TS Provider union keys do not match the models.json .providers keys and the Rust enum variants (accounting for PascalCase-to-snake_case conversion). (3) Update packages/contracts/types/src/provider.ts lines 12-14 to reference the correct Rust mirror path immediately, even before the full convergence. This recommendation aligns with the architecture constitution's AC-10 rule and the SSOT principle, and restores capability honesty across all surfaces.

**Impact analysis.** Blast radius if status quo persists: High. Any surface (desktop, web, CLI, extension, mobile) that imports the Provider type and renders a provider selector can advertise providers that have no catalog entry. A developer using lmstudio adapter can encounter a provider with undefined capabilities. The stale comment in provider.ts is a compounding honesty defect — maintainers updating the Rust enum may not notice that the TS union has drifted, or vice versa. Severity: Medium-to-High. The platform declares one of its foundational invariants (SSOT) and then violates it without detection. This is a trust-boundary honesty defect (capability lies, per §14 of the constitution). Users cannot trust the type system to be accurate. Surfaces affected: All — desktop, web, CLI, VS Code extension, mobile (indirectly, via API). Billing/pricing affected: If a provider is in the union but not the catalog, pricing data is unavailable, preventing accurate cost estimation. Support affected: When a user reports that a provider appeared but had no capabilities, there is no auditable record of why the catalog entry was missing.

**Required owner decision.** The owner must decide for each of the three missing catalog entries (lmstudio, minimax, ollama_cloud): (A) Is this provider production-ready and should remain in the type system? If yes, provide or approve verified capability data (context window, pricing, supported models, capabilities flags) from official provider documentation, so the catalog entry can be authored. Or (B) Is this provider deprecated, experimental, or local-only and should be removed from the TS union and Rust enums? If yes, declare a deprecation timeline and coordinate removal across surfaces. Once this decision is made, the AI Runtime Spec team can implement the CI guard and complete the convergence without further blocking.

---

### ARCH-D2 — lmstudio ships a typed adapter with no models.json entry

**Maps to:** constitution Appendix A · A2 · governing rule AC-10 / AC-11 · raised in §14, §50 · closing book: AI Runtime Spec
**Related findings:** ARCH-D1 (parent provider-identity drift)
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All claims reproduced: (1) lmstudio adapter exists at packages/ai/providers/lmstudio/src/index.ts with createLMStudioAdapter factory and id:'lmstudio'. (2) lmstudio is in the Provider union (packages/contracts/types/src/provider.ts:28). (3…

**Problem statement.** A typed, production-grade lmstudio provider adapter package exists and is fully imported as a dependency, yet lmstudio has no entry in the canonical provider metadata catalog (models.json), leaving its capability metadata undefined at the SSOT and creating a capability-honesty risk distinct from the general provider-identity drift.

**Current implementation.** The lmstudio adapter is implemented at packages/ai/providers/lmstudio as a fully functional ProviderAdapter that wraps an OpenAI-compatible local server (default http://localhost:1234/v1), exports a factory function createLMStudioAdapter, and implements catalog(), stream(), and auth configuration. The adapter is typed against @agiworkforce/types and @agiworkforce/provider-runtime. However, no entry for lmstudio exists in packages/contracts/types/src/models.json. The Provider union at packages/contracts/types/src/provider.ts includes 'lmstudio' (line 28), but the providers section of models.json (lines 30-539) has 25 provider keys (managed_cloud, openai, anthropic, google, xai, deepseek, qwen, moonshot, perplexity, zhipu, mistral, groq, together, fireworks, cerebras, deepinfra, cohere, ai21, sambanova, azure, bedrock, nvidia_nim, open_router, ollama, runway) with no lmstudio entry. No model entries reference provider: lmstudio in the models section (lines 541+).

**Proposed architecture (target — not a build order).** lmstudio MUST have a models.json provider entry defining its label, tokenMultiplier, defaultPricing, modelPrefixes, aliases, defaultModel, taskRouting, and canonicalization (matching the schema of other local-runtime providers like ollama). The entry MUST be populated with honest metadata reflecting lmstudio's capabilities: a dynamic catalog (queried from /v1/models), zero default pricing (user-hosted), SSE delimiter matching OpenAI (\n\n), and no pre-curated model list (matching ollama's modelPrefixes: []). A CI guard per AC-10 MUST fail the build if any typed adapter package (e.g., packages/ai/providers/lmstudio) exists without a matching models.json provider entry, preventing this class of drift.

**Evidence.**

- packages/ai/providers/lmstudio/src/index.ts:65-66 (id: 'lmstudio', label: 'LMStudio' hardcoded in adapter)
- packages/ai/providers/lmstudio/package.json:2-3 (package @agiworkforce/providers-lmstudio exported and typed)
- packages/contracts/types/src/provider.ts:28 ('lmstudio' in Provider union)
- packages/contracts/types/src/models.json:506-539 (25 provider keys in providers section; no lmstudio)
- packages/contracts/types/src/models.json:grep for 'lmstudio' returns no results (no model entries reference it)
- docs/00-foundation/architecture-constitution.md:1216 (constitution Appendix A, item A2 cites the finding)
- docs/00-foundation/architecture-constitution.md:256 (§14: 'lmstudio... even ships a typed adapter package yet has no catalog entry')

**Architectural rationale.** AC-10 and AC-11 require that all typed adapter packages MUST have matching catalog entries and that capability metadata MUST be read only from the SSOT (models.json) — not invented at runtime. lmstudio's absence from models.json means consumers cannot resolve its capabilities, pricing, token cost, or defaults from the authoritative source. This breaks the single-source-of-truth principle (AC-09, §6/§16) and creates an asymmetry: the adapter advertises itself (via createLMStudioAdapter) and can be instantiated, but no authoritative metadata about it is available for feature-code decisions (picker allowlists, capability gating, cost budgets). If a surface were to advertise lmstudio as selectable, that capability would be unsupported by published metadata, violating capability honesty (AC-11). The fix ensures adapter packages and catalog entries remain coupled.

**Alternatives considered.**

- Accept lmstudio as a local-runtime-only provider with no web-surface exposure and skip the catalog entry — violates AC-10 (typed adapter MUST have catalog entry) and creates technical debt if exposure is added later without catalog preparation.
- Mark lmstudio as deprecated/experimental in a separate catalog section — still violates the requirement that EVERY typed adapter MUST have a main-catalog entry; deprecation is a metadata property within that entry, not a reason to skip it.
- Remove the lmstudio adapter package entirely and rely on the generic openai provider with baseUrl overrides — discards the adapter's curated compatibility layer (detectOpenAICompletionsCompat) and runtime error classification, increasing cognitive load on consumers.
- Add lmstudio to models.json with full model pre-curation — contradicts lmstudio's design (dynamic /v1/models discovery); correct approach is sparse, dynamic-aware catalog entry matching ollama's pattern.

**Benefits.**

- Removes capability-honesty gap: surfaces can now author picker allowlists that reference lmstudio with confidence of metadata availability.
- Enforces AC-10 invariant: every shipped ProviderAdapter now MUST have a corresponding models.json entry; future adapter additions will fail build if catalog entry is missing.
- Enables cost budgeting: tokenMultiplier and defaultPricing become queryable from the SSOT, supporting billing/quota logic.
- Closes a class of drift: provider identity will no longer diverge between the adapter package graph and the metadata catalog.
- Prepares for safe web-surface adoption: if lmstudio is ever exposed in cloud, its capabilities and environment gating can be derived from the catalog entry.

**Risks.**

- Risk of over-populating the catalog: if every conceivable OpenAI-compatible endpoint is added as an adapter, models.json becomes a registry of local-only providers with no distinct metadata. Mitigated by the rule that ONLY shipped, typed adapter packages get entries (not ad hoc URLs).
- Risk of stale local-provider capabilities: lmstudio's /v1/models endpoint returns user-loaded models; static catalog metadata cannot reflect them. Mitigated by the adapter's dynamic catalog() method and by the catalog entry serving as identity/routing metadata, not a complete model list. Ollama uses the same pattern.
- Risk of inconsistent canonicalization: if lmstudio modelPrefixes and aliases differ from the actual local endpoint behavior, feature code will silently route requests incorrectly. Mitigated by tests on the adapter's catalog() and stream() methods covering the local endpoint contract.
- Risk of CI guard false positives: if a package in the providers/ directory is a scaffold, test, or internal library (not a shipped adapter), the CI guard must exclude it by detecting ProviderAdapter export. Mitigated by requiring the rule to check for explicit export of a ProviderAdapterFactory.

**Dependencies.**

- ARCH-D1 (Provider-identity SSOT drift): this finding is a specialization of D1; the CI guard that unifies provider sources will also enforce the lmstudio catalog entry requirement.
- AI Runtime Spec (closing runtime book): the spec MUST define the schema for local-provider entries (defaultModel, taskRouting, etc.) and the test/validation gates for dynamically-sourced catalogs.
- Module Boundary & Dependency Governance Spec: the CI guard rule (AC-10) should be formalized in the build-governance section, tied to the provider adapter package detection pattern.

**Migration considerations.**

- Non-breaking: adding lmstudio to models.json does not affect existing adapter code or routes; the adapter's stream() and catalog() methods remain unchanged.
- Staging: (1) Add provider entry to models.json with identity and metadata (label, tokenMultiplier, defaultPricing, modelPrefixes: [], aliases, defaultModel: '', taskRouting: {}, canonicalization: {}). (2) Run tests on packages/ai/providers/lmstudio to confirm no functional change. (3) Implement CI guard to validate adapter packages ↔ models.json correspondence. (4) Document the new entry in architecture-manifest.md.
- Backward compatibility: the lmstudio adapter itself does not publish models in the catalog at startup; it queries them from /v1/models dynamically. The models.json entry is identity metadata only, not a curated model list. Existing code using lmstudio (if any) will continue to work.
- Verification: add a test in packages/ai/providers that verifies every ProviderAdapterFactory export in packages/ai/providers/\* has a corresponding models.json entry.

**Recommendation (for the owner — not a decision).** Add lmstudio to packages/contracts/types/src/models.json as a provider entry (matching the ollama schema: sparse, dynamic-aware, identity-only), following the ollama pattern for local-runtime providers with zero default pricing and empty modelPrefixes. Simultaneously, implement the CI guard from AC-10 to fail the build if a typed adapter package (detected by ProviderAdapterFactory export) lacks a matching models.json entry. This achieves the capability-honesty goal without breaking the adapter's existing dynamic design.

**Impact analysis.** **Blast radius (changes required):** packages/contracts/types/src/models.json (add one provider entry); CI/build configuration (add guard rule); tests in packages/ai/providers (verify adapter ↔ catalog coupling). **Surfaces affected:** Any surface that author picker allowlists, capability-gating logic, or cost budgeting for lmstudio (none today, but structure is now prepared for safe future adoption). **Security:** No direct security impact; improves traceability of capability claims. **Billing:** Enables lmstudio cost tracking if cloud were to route to local endpoints; current impact is zero (local-only). **User impact:** None unless lmstudio is exposed in a picker; when it is, capability metadata is now auditable from the SSOT. **Severity if unaddressed:** Medium. The gap creates asymmetry and invites similar gaps for future adapters (ollama_cloud, minimax); the CI guard closes the pattern.\*\*

**Required owner decision.** Does the owner accept that EVERY typed adapter package (including future ones) MUST have a matching models.json entry verified by CI, and that lmstudio should be added to models.json as a sparse local-provider entry following the ollama pattern? If yes, proceed with the migration. If no, either (a) remove the lmstudio adapter package and rely on generic OpenAI routing, or (b) formally ADR the divergence and accept the catalog-entry-less adapter as an intentional exception for local-only providers.

---

### ARCH-D3 — Misdirected cross-language mirror pointer (provider.ts directs to models_config.rs, not mod.rs:649)

**Maps to:** constitution Appendix A · A3 · governing rule AC-85 · raised in §14, §50 · closing book: AI Runtime Spec
**Related findings:** ARCH-D1 (parent provider-identity drift)
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CORRECTED from finding. The file `models_config.rs` DOES exist (contradicting the title and §14, §50, and Appendix A). The actual defect is that the pointer directs maintainers to a file that does not define the enum (it only imports it)…

**Problem statement.** The TypeScript maintainer comment in provider.ts directs engineers to update the Rust Provider enum mirror at `core/llm/models_config.rs`, but that file does not contain the enum definition — it only imports it via `use super::Provider;`. The actual enum lives at `core/llm/mod.rs:649`. This misdirection leaves the mirror-update step untracked and prone to divergence.

**Current implementation.** provider.ts (lines 13-14) contains the instruction: "Update the Rust mirror in `apps/desktop/src-tauri/src/core/llm/models_config.rs` (Provider enum)." The referenced file (models_config.rs:14) imports the Provider enum from its parent module (`use super::Provider;`) via a module re-export (mod.rs:18, `pub mod models_config;`). The enum is actually defined at apps/desktop/src-tauri/src/core/llm/mod.rs:649. The misdirection means that when engineers follow the documented update path, they update the wrong file or find nothing to update, causing the mirror synchronization step to be skipped in reviews and migrations.

**Proposed architecture (target — not a build order).** The maintainer-facing pointer in provider.ts MUST name the actual location of the Provider enum, which is `apps/desktop/src-tauri/src/core/llm/mod.rs:649`. The comment should read: "Update the Rust mirror in `apps/desktop/src-tauri/src/core/llm/mod.rs` at line 649 (Provider enum)." Additionally, AC-85 (requirement that "any maintainer-facing pointer to a cross-language mirror MUST name paths that exist and match the build graph") mandates that this pointer, once corrected, becomes part of the automated CI guard that AC-10 and §50:781 require — the guard that fails the build when a provider entry exists in one mirror (TypeScript union, models.json keys, Rust enum) but not the others. The architecture converges when the pointer is correct and the guard is operational.

**Evidence.**

- packages/contracts/types/src/provider.ts:13-14 (misdirected pointer comment)
- apps/desktop/src-tauri/src/core/llm/models_config.rs:14 (imports enum from parent, does not define it)
- apps/desktop/src-tauri/src/core/llm/mod.rs:18 (module re-export declaration)
- apps/desktop/src-tauri/src/core/llm/mod.rs:649 (actual Provider enum definition)

**Architectural rationale.** AC-85 and AC-10 state that any maintainer-facing pointer to a cross-language mirror MUST name paths that exist and match the build graph, and that every mirror of a single SSOT (Provider union, models.json catalog, Rust enum) MUST be kept in exact correspondence, verified by a CI guard. A misdirected pointer frustrates both rules: maintainers cannot easily identify the mirror to update, and the untracked update step means the CI guard (once built) has no documented trigger point. Capability honesty demands that the pointer be correct so the operator can reliably synchronize all three mirrors. The correction is minimal — change one line — and it unblocks the larger AC-10 guard implementation.

**Alternatives considered.**

- Accept the current pointer and update the mod.rs enum location to models_config.rs — rejected because it would require structural refactoring of the module hierarchy and would gratuitously move the enum away from its current, stable location where it is used.
- Treat the misdirection as acceptable and rely on search tools to find the enum — rejected because maintainers following documented steps would fail to find it, and an undocumented step is a defect per AC-85.
- Create an alias/re-export of the enum in models_config.rs as a convenience redirect — rejected because it conflates container (the models.json loader) with identity (the Provider contract) and would obscure the canonical location.
- Accept divergence with an explicit ADR — not recommended; this is a one-line pointer fix that removes all ambiguity and costs nothing to correct.

**Benefits.**

- Maintainers following the documented pointer will find the Provider enum where indicated and can update it in the correct location.
- The CI guard for AC-10 (mirror synchronization) will have a documented, tracked trigger point in provider.ts, closing the 'untracked step' failure.
- One-time correction cost is trivial; long-term defect cost (untracked divergence, mis-updates) is eliminated.

**Risks.**

- Incomplete CI guard implementation: correcting the pointer is necessary but not sufficient; AC-10 requires the guard itself to be built and gated in CI. Without the guard, the pointer points to the right place but divergence can still occur silently.
- Delayed adoption: the three-mirror correspondence (TypeScript Provider union, models.json, Rust Provider enum) may not be caught by the guard if (1) the guard is not yet built, (2) the guard does not include all three mirrors, or (3) the guard fails non-blocking in CI (as Semgrep currently does per §57).

**Dependencies.**

- ARCH-D1 (Provider-identity SSOT drift): the three-mirror CI guard that AC-10 mandates is the structural dependency that will enforce this pointer's correctness retroactively.
- AI Runtime Spec (closing runtime book cited in Appendix A, row A3): the specification must own the exact CI guard logic that validates mirror correspondence.
- docs/00-foundation/architecture-constitution.md sections 14 and 50 and Appendix A row A3: all three contain the false claim that 'models_config.rs does not exist' and will require correction when this defect is resolved.

**Migration considerations.**

- One-line change to provider.ts:14: update the comment to point to mod.rs:649 instead of models_config.rs.
- No code changes required — the enum is already at mod.rs:649; only the documentation pointer changes.
- The pointer correction should land in the same commit as (or shortly before) the CI guard implementation for AC-10, so that the documented step and the automated check align.
- Documentation fix: update architecture-constitution.md §14 line 256, §50 line 777, and Appendix A row 1217 to remove the false claim that the file 'does not exist' and instead state that the pointer was misdirected.

**Recommendation (for the owner — not a decision).** Correct provider.ts:14 to point to `apps/desktop/src-tauri/src/core/llm/mod.rs:649` instead of `models_config.rs`. This is a necessary prerequisite for the AC-10 CI guard (ARCH-D1), not a sufficient fix by itself. The guard itself must follow on a tracked timeline. The recommendation is a low-risk, one-line change that unblocks larger alignment work.

**Impact analysis.** **Blast radius:** The misdirection affects the provider-mirror synchronization process, which touches every feature that adds a new provider (a rare, high-confidence change) and the compile-time contract that all surfaces read from the Provider union/catalog. **Frequency:** This defect is encountered infrequently (only when a provider is added or a mirror drifts), but when encountered, it leads to missed updates and false green on CI. **Severity if unaddressed:** Medium. The defect is a documentation/process failure, not a live capability leak; however, it enables the divergence that ARCH-D1 documents (28 TS literals / 25 catalog keys / 25 enum variants). **Users affected:** None directly (end-users do not care where the enum is defined); developers and code-review processes are affected because the step is untracked."

**Required owner decision.** Does the owner approve correcting the provider.ts pointer to mod.rs:649 and updating the three constitution sections (§14, §50, Appendix A) to reflect that the file exists but contains only an import (not the enum definition)? And does the owner commit to implementing the AC-10 CI guard on a documented timeline, so that the corrected pointer is paired with an automated check that enforces mirror correspondence?"

---

### ARCH-D4 — Three divergent, non-shared AI provider runtimes

**Maps to:** constitution Appendix A · A4 · governing rule AC-12 · raised in §13, §54 · closing book: AI Runtime Spec
**Related findings:** ARCH-D1, ARCH-D5 (live consequence)
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All cited paths and code structures verified against current source: (1) ProviderAdapter interface exists at packages/contracts/types/src/provider-adapter.ts:321–343. (2) api-gateway consumes it at services/api-gateway/src/lib/providerA…

**Problem statement.** The system has three independent AI provider runtimes with incompatible type systems and no shared abstraction. The TypeScript ProviderAdapter is only consumed by api-gateway; CLI and desktop each reimplement provider transport in Rust with divergent enum shapes. When a capability fix (e.g., adding a new provider, fixing model metadata, adjusting streaming behavior) is made in one runtime, it does not propagate to the others, violating AC-12.

**Current implementation.** Three independent runtimes coexist. (1) **TypeScript ProviderAdapter** (packages/contracts/types/src/provider-adapter.ts:321–343): A principled interface with four required surfaces (`id`, `label`, `auth`, `stream`) and four optional hooks (`catalog`, `buildReplayPolicy`, `normalizeToolSchemas`, `wrapStreamFn`), converting vendor SSE/NDJSON into a canonical `StreamChunk` discriminated union. Consumed only by services/api-gateway/src/lib/providerAdapters.ts:22–24, supporting four providers: anthropic, openai, ollama, google. (2) **CLI Rust Provider enum** (apps/cli/src/models/mod.rs:49–71): A three-variant union (Anthropic, Google, Ollama+OllamaMode, OpenAICompatible{name, base_url, api_key_env}, Custom{owned strings}). The `stream_completion` function (apps/cli/src/models/streaming.rs:580) dispatches on provider type and implements provider-specific transport (Anthropic, Google, Ollama, OpenAI-compatible variants) with custom serialization helpers (convert_message_to_anthropic, convert_message_to_openai, convert_message_to_gemini). (3) **Desktop Tauri Provider enum** (apps/desktop/src-tauri/src/core/llm/mod.rs:649–675): A 25-variant flat enum (OpenAI, Anthropic, Google, Ollama, Perplexity, XAI, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, ManagedCloud, Groq, Together, Fireworks, Cerebras, DeepInfra, Cohere, AI21, Sambanova, Azure, Bedrock, NvidiaNim, OpenRouter, OllamaCloud), with an `impl Provider` carrying `as_string()` and `from_string()` methods. Provider-adapter dispatch lives in desktop's provider_adapter.rs:1–3 module (3103 lines) alongside llm_router.rs (2458 lines) and sse_parser.rs (1521 lines), implementing provider-specific request translation and SSE parsing in-house. (4) Streaming normalization differs: TypeScript layers normalize through @agiworkforce/provider-runtime (packages/ai/provider-runtime/src/gateway.ts), while CLI and desktop each parse SSE independently with no shared code.

**Proposed architecture (target — not a build order).** Converge the three runtimes on a single provider-contract abstraction, enforcing it as a load-bearing invariant. (1) Promote the TypeScript ProviderAdapter to a language-neutral specification in the AI Runtime Spec book, defining: the four required surfaces, the StreamChunk discriminated union, the credential-resolution algorithm, retry and fallback semantics, and stream-idle watchdog behavior. (2) Build Rust equivalents of the ProviderAdapter interface and StreamChunk types in a shared crate (crates/provider-adapter-rs or crates/llm-types), then consume it from both CLI and desktop. (3) Migrate api-gateway, CLI, and desktop to share the same provider registry (a canonical list of 22+ providers with their metadata: id, label, base_url, api_key_env, capabilities), eliminating the divergence between the 25-variant desktop enum, the open-ended OpenAICompatible + Custom CLI union, and the four-provider TypeScript subset. (4) Establish a CI guard (check-provider-convergence.mjs / check-provider-convergence.rs) that cross-checks the TypeScript Provider union (packages/contracts/types/src/provider.ts), the Rust enum (crates/provider-adapter-rs), and the catalog (models.json or a shared registry) so no provider is added to one runtime without updating the others. (5) Unify streaming normalization by extracting the provider-runtime gateway logic (retry, idle watchdog, replay-policy building, tool-schema normalization) into language-neutral primitives and binding it to the Rust adapter equivalents.

**Evidence.**

- packages/contracts/types/src/provider-adapter.ts:321–343 (ProviderAdapter interface)
- services/api-gateway/src/lib/providerAdapters.ts:22–24 (TypeScript ProviderAdapter consumers: anthropic, openai, ollama, google only)
- apps/cli/src/models/mod.rs:49–71 (CLI Provider enum: Anthropic, Google, Ollama, OpenAICompatible, Custom)
- apps/cli/src/models/streaming.rs:580 (stream_completion dispatcher)
- apps/desktop/src-tauri/src/core/llm/mod.rs:649–675 (Desktop Provider enum: 25 variants)
- apps/desktop/src-tauri/src/core/llm/provider_adapter.rs:1–36 (Desktop provider-adapter module, 3103 lines)
- packages/ai/provider-runtime/src/gateway.ts (streaming normalization via provider-runtime, consumed by TypeScript only)
- docs/00-foundation/architecture-constitution.md:955 (AC-12: 'Divergent per-surface AI runtimes MUST converge on one provider-adapter contract')
- docs/00-foundation/architecture-constitution.md:1218 (Appendix A, item A4, identical finding)

**Architectural rationale.** AC-12 mandates convergence because divergent runtimes break capability honesty (AC-11) and the trust boundary (§13). When a model-support fix, provider authentication update, or streaming bug is fixed in one runtime (e.g., desktop gains support for a new provider), users of the CLI and web see an incomplete or divergent capability set, contradicting the constitutional promise that "a selectable model is always honestly runnable on the active surface." The ProviderAdapter contract embodies the principled shape: minimal required surfaces, optional hooks for cross-provider knowledge, and a canonical wire format. Unifying on this contract ensures that improvements to retry logic, stream-idle detection, tool-schema normalization, and replay-policy building are shared across all surfaces, and that new providers and capability additions are propagated uniformly. The abstraction already exists in TypeScript; migrating it to Rust and enforcing a shared registry closes the defect.

**Alternatives considered.**

- 1. Accept the divergence with an explicit Divergence ADR (AGI-ARCH-00XX: 'Multi-Runtime Provider Variation — Justified'), documenting why each runtime needs its own implementation and accepting the duplicate-fix cost and capability-honesty tradeoff. Disadvantage: A future model or provider addition requires three separate code paths; a fix to streaming behavior (e.g., timeout tuning) must be triaged and fixed per surface. The finding itself notes this divergence is 'uncoordinated' — an ADR would require coordination discipline that currently does not exist. Cost: ongoing engineering tax.
- 2. Replace CLI and desktop with TypeScript equivalents that call api-gateway. Disadvantage: Breaks the architectural mandate that Local mode (CLI and desktop) remain offline-capable, computing-sovereign runtimes. API gateway is a cloud-reaching service; moving inference routing through it violates trust boundary §13 and breaks BYOK/Local-mode semantics (AGI-TRUST-0001).
- 3. Implement a thin adapter layer over each divergent runtime (a 'meta-adapter') that translates between them. Disadvantage: Adds abstraction tax, delays addressing the root problem (divergent enums and implementation), and still does not fix the duplicate-fix burden or the code-review risk of missing a fix in one surface.

**Benefits.**

- Single source of truth for provider registry (name, id, base_url, api_key_env, capabilities, auth_methods).
- Capability fixes, new providers, and streaming improvements are authored once and propagate to all surfaces (CLI, desktop, web).
- Reduced code duplication: provider-specific request translation and SSE parsing logic lives in one place, not three.
- Stronger enforcement of AC-12 and AC-11 (capability honesty) via CI guard that verifies provider registry convergence across all runtimes.
- Easier onboarding of new providers: one ProviderAdapter implementation covers all surfaces.
- Reduced risk of surface-specific capability regressions: test coverage for provider behavior is concentrated, not scattered across three independent test suites.

**Risks.**

- Migration risk: moving provider dispatch from desktop's 3103-line provider_adapter.rs to a shared Rust crate requires careful refactoring to avoid breaking the desktop's complex fallback-chain and cost-calculator integrations (llm_router.rs, fallback_chain.rs both depend on Provider enum shape).
- Coordination risk: the TypeScript and Rust codebases have different release cadences and test coverage. A shared crate requires both to stay synchronized.
- Adoption lag: CLI and desktop may continue using old local implementations if the shared Rust crate is incomplete or introduces performance regressions.
- If convergence is not enforced by CI, the three runtimes will diverge again within two release cycles (evidence: the Supabase-era stale references in CURRENT_DECISIONS #13/#17 suggest manual-documentation drift is not caught).

**Dependencies.**

- ARCH-D1 (Provider-identity SSOT drift): the ProviderAdapter and registry must fix the divergence between the Provider union, models.json, and desktop enum.
- ARCH-D5 (Cloud advertises 11 providers / gateway serves 4): convergence will surface the asymmetry between cloud and desktop/CLI provider availability at picker time.
- AI Runtime Spec (Closing book): must define the canonical ProviderAdapter contract, streaming semantics, retry/fallback/idle-watchdog behavior, and credential resolution algorithm that all surfaces inherit.
- Module Boundary & Dependency Governance Spec: must enforce the CI guard that prevents provider registry divergence.

**Migration considerations.**

- Incremental adoption: phase 1 (weeks 1–2) defines the Rust ProviderAdapter interface and StreamChunk types in a new crate (crates/provider-adapter-rs), mirroring the TypeScript types. Phase 2 (weeks 3–4) adds a shared provider registry (a Rust const or lazy_static carrying the 22+ providers). Phase 3 (weeks 5–7) migrates CLI to use the shared registry and crate; desktop follows in phase 4 (weeks 8–10) with careful integration testing to ensure fallback_chain and cost_calculator behaviors remain stable. Phase 5 (weeks 11–12) implements the CI guard and removes the old local implementations.
- Trust boundary: streaming must remain direct (CLI/desktop to provider), never routed through api-gateway. The shared crate handles request translation and response parsing, but credential resolution and provider dispatch remain in the calling runtime.
- Testing: each runtime must retain integration tests against live providers (or mocked SSE) to catch provider-specific edge cases (tool-schema quirks, streaming lag, retry behavior). The shared contract ensures the test scope is identical across surfaces.
- Rollback: if the shared crate destabilizes desktop, a rollback must restore desktop's local provider_adapter.rs and CLI's streaming module. CI must gate desktop releases on the shared crate's test suite passing.

**Recommendation (for the owner — not a decision).** Adopt convergence with an enforced CI guard. The ProviderAdapter contract is already mature in TypeScript; lifting it to Rust and binding CLI/desktop to a shared crate is a bounded refactor (4–6 weeks) with immediate payoff: new providers and capability fixes reach all surfaces uniformly. The finding itself (AC-12) makes the decision: "uncoordinated parallel provider runtimes are a defect." Propose an ADR for divergence only if the technical case for local implementations is documented (e.g., "CLI requires a lighter-weight provider dispatcher than desktop's 25-provider enum"); today, the divergence appears accidental, not principled.

**Impact analysis.** **Blast radius:** CLI users, desktop users, and web users (via api-gateway) all depend on provider availability and correctness. **Severity if unaddressed:** Medium-to-high. A fix to Anthropic streaming (e.g., handling cache-control directives correctly) that lands in desktop will not reach CLI users; a new provider added to the TypeScript registry will not be available in BYOK CLI/desktop for months. This asymmetry violates AC-11 (capability honesty) and breeds user-support friction (\"why can I use this model on desktop but not CLI?\"). **Security:** Provider credential handling must remain correct across all three implementations; convergence reduces the surface of auth-handling mistakes by centralizing logic. **Cost:** duplicate-fix burden and three-way testing matrix are ongoing engineering tax. **User experience:** delayed feature parity and divergent capability sets degrade trust in platform coherence.

**Required owner decision.** Should the three AI provider runtimes converge on a single ProviderAdapter contract (TypeScript and Rust), with a shared provider registry and CI enforcement of cross-runtime consistency? If **yes**, authorize the AI Runtime Spec and Module Boundary Spec teams to schedule the refactor and bind CLI/desktop to a shared crate. If **no**, record an explicit Divergence ADR (AGI-ARCH-00XX) explaining why each runtime justifiably maintains its own implementation, accepting the ongoing duplicate-fix cost and capability-asymmetry risk.

---

### ARCH-D5 — Cloud advertises 11 providers but the gateway serves 4 (no fallback)

**Maps to:** constitution Appendix A · A5 · governing rule AC-11 · raised in §12, §13, §28, §50 · closing book: AI Runtime Spec / API Spec
**Related findings:** ARCH-D4 (root cause)
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All evidence cited reproduces exactly against current source: ALLOWED_PROVIDER_IDS names 11 providers (verified in route.ts lines 21-33); SUPPORTED_PROVIDER_IDS names 4 (verified in providerAdapters.ts line 24); the 7 provider…

**Problem statement.** The web frontend advertises 11 selectable providers to users, but the managed cloud gateway implements adapters for only 4. Requests for the other 7 providers (xai, deepseek, perplexity, qwen, moonshot, zhipu, lmstudio) pass initial validation, reserve credits, then fail with a 503 at the adapter layer with no OpenAI-compatible fallback. This violates AC-11 (capability honesty) and creates an asymmetric availability between cloud and BYOK: the 7 "missing" providers are fully supported in the Desktop and CLI Rust runtimes, so users cannot discover or use them in the cloud surface even though the platform claims support for them.

**Current implementation.** The web stream route at apps/web/app/api/v1/providers/[providerId]/stream/route.ts (lines 21-33) defines ALLOWED_PROVIDER_IDS as a Set of 11 providers: anthropic, openai, google, xai, deepseek, perplexity, qwen, moonshot, zhipu, ollama, lmstudio. This allowlist is validated before any upstream request (line 148), and credits are reserved (lines 186-196) if validation passes. The request is then forwarded to the api-gateway at /api/v1/providers/{providerId}/stream. The api-gateway's providerAdapters.ts (line 24) defines SUPPORTED_PROVIDER_IDS as only 4 providers: anthropic, openai, ollama, google. When a request arrives for an unsupported provider, the buildProviderAdapter function (lines 63-110) returns null if the provider is not in the switch statement, and the providerStream route (line 199-204) throws a 503 AppError with the message "Provider not configured (server is missing credentials)". Credits remain deducted (no refund occurs on 503 at the gateway layer). The 7 missing providers are implemented in the Desktop runtime (apps/desktop/src/App.tsx, types/provider.ts) and CLI runtime (apps/cli/src/config.rs, onboarding.rs), where they are fully supported as BYOK providers via OpenAI-compatible endpoints.

**Proposed architecture (target — not a build order).** Converge provider availability across all runtimes so that a provider advertised as selectable in one surface is either (1) implemented in all managed runtimes, or (2) gated at the selection layer so it is only advertised on surfaces where it is actually supported. For the cloud path specifically: either (A) implement the 7 missing providers in the api-gateway via their native or OpenAI-compatible adapters (preferred if there is no cost/operational objection), or (B) remove them from ALLOWED_PROVIDER_IDS on the web side and gate their UI picker to BYOK/Desktop-only flows so users cannot select an unsupported provider (acceptable as a recorded AC-11 compliance measure if provider-side credentials cannot be maintained). Credit refund logic must be guaranteed if any provider fails at the adapter layer. Per AC-11 and §50 of the constitution, the design must ensure that every advertised provider is either deliverable or never advertised in the first place, eliminating the silent 503 failure mode.

**Evidence.**

- apps/web/app/api/v1/providers/[providerId]/stream/route.ts:21-33 (ALLOWED_PROVIDER_IDS = 11 providers)
- services/api-gateway/src/lib/providerAdapters.ts:24 (SUPPORTED_PROVIDER_IDS = 4 providers: anthropic, openai, ollama, google)
- services/api-gateway/src/routes/providerStream.ts:199-204 (buildProviderAdapter returns null → 503 for unsupported providers)
- services/api-gateway/src/lib/providerAdapters.ts:63-110 (buildProviderAdapter switch statement covers only anthropic, openai, ollama, google)
- apps/web/app/api/v1/providers/[providerId]/stream/route.ts:186-196 (credits deducted before upstream call)
- apps/desktop/src/App.tsx (xai, deepseek, qwen, moonshot, perplexity, zhipu, lmstudio listed as supported providers)
- apps/desktop/src/types/provider.ts (9 first-party providers documented)
- apps/cli/src/config.rs (xai, deepseek, perplexity, qwen, moonshot, zhipu, lmstudio in providers Map)

**Architectural rationale.** AC-11 is the binding rule here: a capability MUST NOT be advertised as selectable unless the active surface, runtime tier, and required environment can actually serve it. The current state violates this rule in three ways. First, the 11-advertised / 4-served gap is a direct statement mismatch — the web surface claims the user can use 11 providers but the cloud gateway can only deliver 4, creating a capability lie. Second, users incur credit charges on a failed request, which couples the fee to the advertised capability rather than the delivered capability — a trust and fairness violation. Third, the same 7 providers work perfectly well on Desktop/CLI in BYOK mode, so the limitation is not technical but a cloud-side configuration gap, which means the architecture is declaring a capability unavailable even though the platform has it. Section 50 (§50) of the constitution makes this a constitutional requirement: the API layer MUST NOT advertise a capability the runtime cannot fulfill. The proposed architecture restores honesty by either implementing the missing providers (closing the gap truthfully) or removing them from the advertised set on the cloud path (gating to BYOK-only, closing the gap by narrowing the claim).

**Alternatives considered.**

- Option 1 (preferred): Implement the 7 missing providers in api-gateway via native or OpenAI-compatible adapters (xai, deepseek, perplexity, qwen, moonshot, zhipu, lmstudio). Tradeoff: requires credential management, SDK integration, and ongoing maintenance for 7 new adapters, but delivers full platform parity across surfaces and resolves the user-facing limitation. Risks: operational complexity if credentials cannot be maintained or vendors change their APIs.
- Option 2 (acceptable): Remove the 7 providers from ALLOWED_PROVIDER_IDS on the web side; gate their UI picker to Desktop/CLI BYOK flows only. Tradeoff: simplifies cloud operations and removes maintenance burden, but narrows the cloud surface's advertised capability. Honest because selection becomes tied to surface/tier. Acceptable as a recorded AC-11 compliance measure if option 1 is cost-prohibitive.
- Option 3 (unacceptable): Keep the current state with a known 503 fallback; document it as a limitation. Tradeoff: requires no change but violates AC-11 and capability honesty. Leaves silent credit-loss failure mode in place. This is not a viable option under the constitution.
- Option 4 (partial): Implement an OpenAI-compatible fallback so unsupported providers route to a shared endpoint. Tradeoff: requires user to configure their own API key for fallback, blurs the managed/BYOK boundary, and still violates AC-13 (fail closed). Not recommended.

**Benefits.**

- Restores capability honesty: users cannot select a provider that will fail, eliminating silent 503 failures and unexpected credit loss.
- Convergence of runtime behavior: the same provider availability story applies across web, Desktop, and CLI, simplifying support and documentation.
- Improved trust: users are not charged credits for requests that cannot be fulfilled, preserving confidence in the platform's billing integrity.
- If Option 1 (implementation) is chosen: full feature parity with Desktop/CLI, closing the long-tail provider gap and enabling more model choices on the cloud surface.

**Risks.**

- If Option 1 (implement): credential management and operational burden for 7 new adapters; API changes or vendor deprecation require ongoing updates; increased surface area for security review.
- If Option 2 (gate to BYOK-only): users expecting cloud support for these providers must switch to Desktop/CLI, potentially lower feature adoption on web.
- If neither option is chosen (status quo): continued AC-11 violation, silent credential loss for users who select unsupported providers, mismatch between advertised and delivered capability.
- Long-term risk if left unaddressed: the mismatch may grow if BYOK adds providers that cloud cannot serve, increasing the divergence and capability-honesty debt.

**Dependencies.**

- AC-10 (provider SSOT convergence): fixing the 11-advertised / 4-served gap requires ensuring all three provider mirrors — TS Provider union, models.json, Rust enum — stay synchronized; currently there is no CI guard verifying this.
- AC-12 (divergent AI runtimes): the existence of 7 providers in Desktop/CLI but not api-gateway reflects uncoordinated parallel runtimes; if AC-12 convergence is chosen, this gap will be closed as a side effect.
- AI Runtime Spec closing book: owns the final provider adapter contract, credential resolution, and fallback logic.
- API Spec closing book: owns the route-layer validation and capability advertisement rules that implement AC-11.

**Migration considerations.**

- If Option 1 (implement 7 providers): Phase in one provider at a time, starting with the most commonly requested (likely xai, deepseek, perplexity based on market presence). Add provider-specific adapter package (e.g., @agiworkforce/providers-xai), integrate into api-gateway providerAdapters.ts, add catalog entry to models.json, and wire credentials via environment config. Verify in staging that 503 no longer occurs and that requests stream correctly. Add CI guard to prevent new divergence. No breaking change to ALLOWED_PROVIDER_IDS (it already names them); just enable them one by one.
- If Option 2 (gate to BYOK-only): Remove the 7 providers from ALLOWED_PROVIDER_IDS in web/route.ts immediately. Update the UI provider picker to query the gateway's GET /api/v1/providers endpoint (which already lists only SUPPORTED_PROVIDER_IDS) rather than using a static allowlist. This ensures picker and backend stay in sync. No credit-loss risk because validation will reject unsupported IDs before upstream call. Add a feature-flag gate if gradual user communication is needed.
- Both options require updating the AI Runtime Spec and API Spec books to formalize the chosen provider-availability rule and its enforcement mechanism.
- No database migration required; no trust-boundary crossing introduced or changed; credits remain managed through the existing reservation/refund logic.

**Recommendation (for the owner — not a decision).** Implement Option 1 (add the 7 missing providers to api-gateway) if the operational and compliance cost of credential management is acceptable. This is the honest path: it closes the capability gap truthfully and delivers the platform's full provider set on all surfaces. Prioritize xai, deepseek, and perplexity (highest user demand), then qwen, moonshot, zhipu, lmstudio. If credential maintenance is cost-prohibitive, implement Option 2 (gate to BYOK-only) to restore AC-11 compliance by narrowing the advertised capability rather than lying about what is available. Do not leave the status quo in place; the current silent failure mode is a trust violation and violates constitutional rule AC-11. Whichever option is chosen must be recorded in an ADR if it represents an intentional architectural trade-off (e.g., "accept cloud parity loss to reduce ops overhead").

**Impact analysis.** Severity if unaddressed: High. The current state is a live capability-honesty violation and causes user-facing 503 failures with credit loss. Impact: (1) Users on the web surface cannot discover or use 7 providers they expect to be available. (2) Any user who selects one of these 7 providers has credits deducted and receives a cryptic 503 error with no explanation. (3) Desktop and CLI users have better provider coverage, creating a platform parity gap and support burden. (4) The violation of AC-11 is constitutional; it cannot be waived without an explicit ADR. Surfaces affected: web only; Desktop and CLI BYOK are unaffected (they work). Users affected: anyone attempting to use xai, deepseek, perplexity, qwen, moonshot, zhipu, or lmstudio on the web surface. Billing impact: users incur credit loss on failed requests. Security impact: none immediate, but the failure-mode routing (503 at the gateway) should be audited to ensure error messages do not leak internal state.

**Required owner decision.** Will the platform implement the 7 missing providers in the managed cloud api-gateway (Option 1: implementation), or will it gate them to BYOK/Desktop-only flows and remove them from the web-advertised set (Option 2: narrowed capability)? This decision determines the closing book (AI Runtime Spec for Option 1, or API Spec for Option 2) and the resource commitment. If neither option is chosen, an explicit ADR must record the platform's decision to accept the AC-11 violation and its trade-offs. The owner must also decide whether to implement a CI guard that prevents ALLOWED_PROVIDER_IDS and SUPPORTED_PROVIDER_IDS from drifting in the future, as specified in AC-10.

---

### ARCH-D6 — No unified Experience primitive

**Maps to:** constitution Appendix A · A6 · governing rule AC-16 · raised in §12 · closing book: Surface, Experience & Capability Spec
**Related findings:** ARCH-D7
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All evidence sources verified:

- **ChatIntentKind (packages/contracts/types/src/suite-contracts.ts:279–290):** Verified; export type with 11 variants: 'chat' | 'code' | 'research' | 'artifact' | 'generated_file' | 'computer_use' | 'con…

**Problem statement.** Chat/Code/Agent/Research—the four primary user modes—are modeled by four divergent type systems with no shared contract, preventing trust and capability behavior from being derivable from a single primitive. This violates AC-16 and splits the implementation surface into ad-hoc experience handling per surface, making capability honesty unenforceable.

**Current implementation.** Four distinct type systems coexist:

1. **ChatIntentKind** (packages/contracts/types/src/suite-contracts.ts:279–290): Union of 'chat' | 'code' | 'research' | 'artifact' | 'generated_file' | 'computer_use' | 'connector' | 'skill' | 'voice' | 'image' | 'handoff'. Carried by ChatIntent interface with fields for sourceSurface, conversationId, kind, executionMode, privacyMode, providerMode.

2. **FocusMode** (apps/web/features/chat/components/Composer/FocusModeButtons.tsx:5): Type 'web' | 'academic' | 'code' | 'writing' | 'research' | null. UI-only picker with button labels. ~21 usage sites in web surface only.

3. **AgentMode** (packages/contracts/types/src/design-system/agent-mode.ts:8): Type 'ask' | 'auto' | 'plan' | 'bypass'. Associated with AgentControlState interface (mode, effort, temporaryChat, source). Separate alternative at packages/ui/unified-chat/src/stores/agentModeStore.ts:15 defines 'safe' | 'plan' | 'build' | 'autopilot'.

4. **DeepResearchPanel** (apps/desktop/src/features/chat/DeepResearchPanel.tsx): Standalone component consuming ResearchTask interface (apps/desktop/src/types/chat.ts:245–255). ResearchTask has id, query, progress, status, steps[], findings[], sources[] but is defined only in desktop's local types/chat.ts with no cross-surface contract. Web has identical ResearchTask in apps/web/types/chat.ts.

Surfaces compose experiences ad-hoc: web uses FocusMode for UI routing; desktop uses DeepResearchPanel as isolated panel component; AgentMode variants exist in both design-system and unified-chat store with different value sets. No shared contract ensures that the same intent kind (e.g., 'research') maps to the same trust/capability behavior across surfaces.

**Proposed architecture (target — not a build order).** One unified Experience contract that reconciles ChatIntentKind, FocusMode, AgentMode, and research flows into a single shared primitive. This contract must:

1. **Consolidate intent representation** into a canonical Experience enum and struct that all six surfaces import from packages/contracts/types.
2. **Unify agent control modes** into a single AgentMode enum with values representing distinct approval/automation profiles (not a per-surface reinterpretation).
3. **Embed research as an Experience variant** with a shared ResearchTask contract owned by packages/contracts/types, not per-surface types/chat.ts.
4. **Derive trust/capability behavior** deterministically from the Experience contract via a single trust-mode and capability-gating predicate.
5. **Declare no Experience as selectable** by any surface unless the active runtime, trust mode, and required environment can actually serve it—enforced at picker/allowlist time via the shared contract.

The contract lives in packages/contracts/types as the single source of truth; all surfaces (web, desktop, mobile, CLI, extension, agent) import and use it directly. No per-surface re-interpretation or duplication occurs. This makes capability honesty enforceable: if a surface advertises an experience, it is because the contract and its capability gating have already certified it is available in the active configuration.

**Evidence.**

- packages/contracts/types/src/suite-contracts.ts:279–290 (ChatIntentKind enum with 11 variants)
- apps/web/features/chat/components/Composer/FocusModeButtons.tsx:5 (FocusMode web-only UI type)
- packages/contracts/types/src/design-system/agent-mode.ts:8 (AgentMode 'ask'|'auto'|'plan'|'bypass')
- packages/ui/unified-chat/src/stores/agentModeStore.ts:15 (alternative AgentMode 'safe'|'plan'|'build'|'autopilot')
- apps/desktop/src/features/chat/DeepResearchPanel.tsx:19–27 (ResearchTask import from @/types/chat)
- apps/desktop/src/types/chat.ts:237–255 (ResearchTask interface: id, query, progress, status, steps, findings, sources)
- apps/web/types/chat.ts:245–255 (duplicate ResearchTask in web)
- packages/contracts/types/src/suite-contracts.ts:294–302 (ChatIntent interface carrying kind: ChatIntentKind)
- docs/00-foundation/architecture-constitution.md §12 (Capability Architecture section naming the four divergent types)
- docs/00-foundation/architecture-constitution.md Appendix A, item A6 (lists this gap as newly surfaced)

**Architectural rationale.** AC-16 binds that Chat, Code, Agent, and Research are cross-surface Experiences composed from a shared contract, never standalone apps. The constitution §12 states: "an Experience is a shared primitive surfaces compose from — never a per-surface app — so that the trust and capability behavior of 'Code' or 'Research' is derivable from one contract regardless of where it runs."

The rationale rests on capability honesty (AC-51): a capability MUST NOT be advertised as available unless the active surface, runtime tier, and required environment can serve it. Today, because the same concept of "research" or "agent mode" is spelled as ResearchPanel (desktop only), ChatIntentKind (suite-wide but carried in a chat-specific intent), FocusMode (web UI only), and two different AgentMode enums, surfaces have no shared signal for "is this mode available in my current context?" They advertise ad hoc, and capability honesty is left to the surface's own judgment rather than enforced by a shared contract.

A unified Experience primitive fixes this: it becomes the single place where (mode, trust-mode, runtime-tier, environment) → (available: boolean) is computed, and every picker and allowlist derives from that computation, not from local heuristics.

**Alternatives considered.**

- **Accept as intentional divergence:** Record an ADR acknowledging that each surface has its own experience model and capability gating is surface-owned. Trade: violates AC-16, leaves capability honesty as an un-auditable implicit contract, and blocks any future cross-surface experience consistency (e.g., a phone-to-desktop handoff knowing the remote surface can serve 'research'). Not recommended given the constitution's explicit language.
- **Unify type system but keep experience logic distributed:** Import a shared Experience type in packages/contracts/types but leave capability gating and picker logic per-surface. Trade: partially addresses the naming divergence but fails the trust/capability behavior requirement of AC-16 ('derivable from one contract') because the gating logic remains fragmented. Intermediate but insufficient.
- **Merge into ChatIntentKind only:** Retire FocusMode, AgentMode, and the standalone Research component and use ChatIntentKind as the universal enum. Trade: simpler consolidation but ChatIntentKind's current shape (11 variants spanning intent, execution mode, and tool type) mixes concerns; untangling before reuse would be necessary. Viable if refactored to separate intent from execution mode.

**Benefits.**

- Enables mechanical enforcement of AC-16: capability honesty becomes derivable from one contract, auditable by CI.
- Eliminates duplicated ResearchTask definitions across desktop and web, creating a single authoritative contract.
- Allows cross-surface features (e.g., mobile-to-desktop experience handoff, agent skill mode detection) to be built on a shared contract rather than ad-hoc.
- Simplifies capability-gating logic: one predicate determines 'is this experience available?' for all surfaces simultaneously.
- Improves debuggability: a capability mismatch (user sees 'Research' available but the backend cannot serve it) becomes a contract violation flagged at picker time, not a runtime failure.
- Unblocks future trust-boundary and capability-honesty audits by providing a single point of truth for experience availability.

**Risks.**

- **Migration risk:** Porting six surfaces from their current experience models to a single contract is a large refactor; missteps could silently break a surface's picker or capability gating, violating AC-16 even more visibly than status quo. Requires staged rollout with per-surface testing.
- **Behavioral compatibility:** Some surfaces have local defaults and fallbacks (e.g., web's null FocusMode = 'All'). A single Experience contract must accommodate these without hardcoding surface-specific logic into packages/contracts/types.
- **Runtime-tier dispatch:** The unified contract must correctly model which experiences are available in each runtime tier (cloud-only, desktop-preferred, etc.). If the contract underspecifies this, surfaces could still advertise falsely.
- **Design-system entanglement:** AgentMode is currently owned by packages/contracts/types/src/design-system. Moving it to a unified Experience contract means decoupling it from design-system UI concerns; requires care not to introduce a new design-system-coupled contract elsewhere.
- **Incomplete current types:** ResearchTask in current code is incomplete (missing the step descriptions, findings format, etc. in some surfaces); unifying requires careful examination of what each surface actually needs, not just merging the defs as-is.

**Dependencies.**

- **AC-16 (governance):** The binding rule that makes this finding a violation, not a style preference.
- **AC-51 (capability honesty):** The guard that enforces no capability is advertised unless the route can serve it; the unified contract is the mechanism by which this becomes checkable.
- **Surface, Experience & Capability Specification** (runtime book listed in constitution Appendix §1190): The book responsible for closing this gap owns the canonical Experience model and the trust-mode/capability-gating matrix.
- **API Specification** (runtime book): The API surface that exposes experience/intent selection to clients must align with the unified contract.
- **Section 12 (Capability Architecture)** in the architecture constitution: The section that raises this gap and governs the solution.

**Migration considerations.** **Staged migration without breaking trust boundaries:**

1. **Phase 1 — Foundation:** Define the unified Experience type in packages/contracts/types, initially as an umbrella of the four current systems (ChatIntentKind | FocusMode | AgentMode | ResearchTask). All four coexist; no code moves yet.

2. **Phase 2 — Adoption per surface:** Surface by surface (starting with web, then desktop), consume the new Experience type from packages/contracts/types instead of local re-definitions. The picker and capability-gating logic for that surface is audited to ensure it consults the shared contract's availability predicate.

3. **Phase 3 — Consolidation:** Once all surfaces adopt the shared contract, eliminate the per-surface duplicate definitions (e.g., apps/web/types/chat.ts ResearchTask). Verify via CI that no remaining references to the old types remain.

4. **Phase 4 — Capability enforcement:** Implement the unified capability-gating predicate (experience, trust-mode, runtime-tier, environment) → available in packages/contracts/types. Update all pickers to call it before rendering. Add a CI check that no Surface advertises an experience the predicate denies.

**Safety gates:**

- Each phase ends with a per-surface test asserting that all experiences advertised by that surface's picker are certified available by the unified contract.
- The migration touches trust-boundary code (PrivacyMode, ProviderMode selection per experience) and MUST pass mandatory human security review (AC-92) before merge.
- No surface is allowed to have a picker that can render an experience the contract says is unavailable; this is checked by a mechanical guardrail.

**Recommendation (for the owner — not a decision).** **Prioritize this gap for closure.** The divergence is not a style difference or a convenience trade-off; it is a direct violation of AC-16 and prevents the capability-honesty invariant from being enforced at all. The current state leaves "is research available?" unanswerable by the system itself—each surface has to guess.

The unified Experience contract is a bounded, high-value refactor: it consolidates four types into one, eliminates cross-surface duplication of ResearchTask, and immediately enables the capability-gating logic that AC-51 requires. The complexity is in the migration, not in the design.

**Recommend:** Schedule the Surface, Experience & Capability Specification to own this work and deliver the unified contract within the next development cycle. Treat it as a prerequisite for any new experience mode (e.g., a future "tutoring" mode) or cross-surface feature that depends on experience parity.

**Impact analysis.** **Blast radius:** All six surfaces (web, desktop, mobile, CLI, VS Code extension, agent runtime) and the shared unified-chat package.

**Surfaces affected:**

- Web: uses FocusMode; must migrate to Experience contract.
- Desktop: uses DeepResearchPanel (local ResearchTask) and AgentMode; must consolidate ResearchTask into shared contract.
- Mobile: reimplements chat state (per A7 gap); a shared Experience contract unblocks shared-package reuse.
- CLI / VS Code Extension: currently minimal; but a shared contract is necessary for them to implement consistent experience handling if expanded.

**Security / trust-boundary impact:** Moderate. Experience selection is bound to PrivacyMode and ProviderMode (see ChatIntent struct). If the unified contract does not correctly represent which experiences require which trust modes, the system could advertise (e.g.) "research" in Local mode when only Managed can serve it—a capability-honesty breach that erodes user trust.

**Severity if unaddressed:** High. The constitution requires that "trust and capability behavior MUST be derivable from one contract." Currently it is not. Every future capability addition (e.g., new experiment mode, new tool class) will inherit the same fragmentation, and the system will never be able to enforce that a user cannot select an unavailable experience.

**Reversibility:** Low; the refactor touches multiple surfaces and centralized type definitions. A partial rollback mid-migration would require careful branch-management. This is not a trial-and-revert change.

**Required owner decision.** **Converge to a single unified Experience primitive in packages/contracts/types, or accept this divergence with a recorded ADR that justifies it?**

If yes to unification: commit to prioritizing the Surface, Experience & Capability Specification and allocate budget for staged per-surface migration and security review.

If no (accept divergence): record an ADR explaining why AC-16 does not apply or is superseded, and why capability honesty can remain surface-local. This decision would require updating the constitution to reflect the intentional departure.

---

### ARCH-D7 — No React-Native-safe shared chat core

**Maps to:** constitution Appendix A · A7 · governing rule AC-82 · raised in §9, §48 · closing book: Surface / Shared UI Spec
**Related findings:** ARCH-D6
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All cited facts reproduce against the live codebase: (1) unified-chat peer dependencies match package.json lines 28-43; (2) web and desktop both import @agiworkforce/unified-chat (confirmed in their package.json files and code…

**Problem statement.** @agiworkforce/unified-chat declares react-dom, Radix, and framer-motion as peer dependencies, making it consumable only by web (27 importers) and desktop (20 importers) and structurally unusable on mobile (0 importers). Mobile therefore reimplements chat state and UI independently, violating the architectural mandate that logic shared between web/desktop and mobile live in React-Native-safe shared packages free of web-only dependencies.

**Current implementation.** @agiworkforce/unified-chat (packages/ui/unified-chat/package.json) exports state stores (useChatStore, useChatModelStore, useChatProjectStore, useMemoryStore, etc.), UI components (ChatInterface, ModelSelector, AgentControl, Sidebar, etc.), contracts, and hooks. It declares react-dom@^19.0.0, @radix-ui/\* (dialog, dropdown-menu, popover, scroll-area, switch, tabs, toggle, tooltip), framer-motion@^11.0.0||^12.0.0, and lucide-react>=0.400.0 as peer dependencies (packages/ui/unified-chat/package.json lines 28-43). Web (apps/web/package.json) and desktop (apps/desktop/package.json) both depend on it; web has 27 importers and desktop has 20 importers across chat, projects, memory, and settings features. Mobile (apps/mobile/package.json) does not import it; mobile has no @agiworkforce/unified-chat entry and instead uses zustand, @agiworkforce/client-runtime, @agiworkforce/types, and native React Native libraries.

**Proposed architecture (target — not a build order).** Extract the framework-agnostic core (state stores, reducers, contracts, types) from unified-chat into a separate React-Native-safe shared package with no react-dom, Radix, or DOM-coupled dependencies. The web-coupled package becomes a thin rendering shell over that portable core. Mobile consumes the portable core and supplies its own mobile-native UI. Both web and desktop continue to consume the portable core for shared state and contracts, then each supplies platform-specific presentation. The boundary between portable and web-coupled must be explicit in the export surface, with clear designation of which exports are cross-platform and which are web-only. This aligns with AC-82 (§9, §48): logic or UI needed by more than one surface must live in a shared package built for reuse; cross-surface logic that mobile must consume must live in a React-Native-safe package free of web-only runtime peer dependencies.

**Evidence.**

- packages/ui/unified-chat/package.json:28-43 (peerDependencies declaration: react-dom, @radix-ui/\*, framer-motion)
- apps/web/package.json (imports @agiworkforce/unified-chat)
- apps/desktop/package.json (imports @agiworkforce/unified-chat)
- apps/mobile/package.json:36-102 (dependencies: no @agiworkforce/unified-chat entry)
- apps/web/app/projects/page.tsx (ChatMessage, ProjectGallery, useChatProjectStore imports)
- apps/web/features/chat/v3/WebShellV3.tsx (useChatStore, ChatRuntime imports)
- apps/desktop/src/App.tsx (ChatHostBridge, useChatModelStore, useChatSettingsStore imports)
- docs/00-foundation/architecture-constitution.md §9:204-212 (Current state, Target state, Migration narrative)
- docs/00-foundation/architecture-constitution.md AC-82:1105 (architectural rule)

**Architectural rationale.** The constitution's foundational principle is that the platform is one product realized across surfaces, not reimplemented per surface (§9). Reuse is constrained by runtime fitness: a package is genuinely cross-surface only if it carries no platform-coupled dependency; the React-Native surface cannot consume a package that pulls react-dom. When a concern (like chat state) needs to be shared across surfaces that span runtime environments, the architectural obligation is to partition it into a portable core and a presentation shell. This protects the shared-package reuse mandate (AC-82, §48) — the law that a new shared package must be justified by a second real consumer. Mobile is a real second consumer of chat state; forcing it to reimplement violates that mandate and creates a maintenance burden where changes to chat contracts must be synchronized across two independent implementations. Keeping the state and contracts in a portable package ensures one source of truth across all three synced-app surfaces.

**Alternatives considered.**

- Accept the current state as an intentional divergence with an explicit ADR justifying why mobile reimplements chat independently, reasoning that the web-specific rendering demands (Radix, framer-motion animations) justify a separate package. This trades code duplication for tighter UI coupling to the web platform but violates AC-82 and §11's composition principle (composition MUST NOT re-implement a lower layer to avoid importing it).
- Create a React-Native wrapper around the current web-coupled unified-chat package, shimming react-dom and Radix with React Native equivalents. This approach adds complexity and maintenance burden to the package itself and does not resolve the fundamental architecture violation — the web-coupled package remains the sole home of state that mobile needs.
- Migrate the entire unified-chat package to be React-Native-first with web renderers layered on top. This is theoretically cleanest but carries the highest implementation cost and risks disrupting the web surface during the migration.

**Benefits.**

- Single source of truth for chat state, contracts, and types across all three synced-app surfaces (web, desktop, mobile)
- Eliminates mobile reimplementation of chat state logic, reducing maintenance burden and risk of divergence
- Establishes a reusable, cross-platform chat core that future surfaces can consume without reimplementation
- Makes the portable/presentation boundary explicit in the package exports, improving clarity and reviewability
- Aligns the platform's actual structure with its constitutional reuse mandate (AC-82, §9, §48)

**Risks.**

- High implementation complexity: extracting portable state from a web-coupled codebase requires careful identification of cross-platform vs web-only code
- Risk of introducing breaking changes to web and desktop surfaces during extraction if the boundary is not cleanly defined upfront
- Mobile UI consistency risk: separating state from presentation means mobile must implement and maintain its own chat UI, which could diverge from web/desktop behavior if not synchronized through careful contract design
- Temporary increase in package count and maintenance surface during the migration; risk of creating three chat-related packages instead of consolidating to two (portable + web-shell)
- If not done carefully, the 'portable core' could still depend on abstract UI libraries (like Zustand as a peerDep) that mobile does not use, merely shifting the problem rather than solving it

**Dependencies.**

- ARCH-D6 (related finding on Experience primitives; the unified Experience contract will define the state and command surface that the portable core must expose)
- AC-82 (§9, §48 — the governing architectural rule for shared packages)
- AC-5 (§5 — modularity principle requiring a second real consumer before a shared package is justified)
- Surface, Experience & Capability Specification (closing book mentioned in Appendix A:1190 — will define how experiences compose from shared primitives)

**Migration considerations.**

- Phase 1 (definition): Audit the current unified-chat exports and identify which ones are truly cross-platform (state stores, types, contracts) vs web-specific (Radix components, framer-motion animations). Document the boundary explicitly.
- Phase 2 (extraction): Create a new package (e.g., @agiworkforce/chat-core or @agiworkforce/unified-chat-core) containing the portable state and contracts. Ensure zero web-only dependencies.
- Phase 3 (web migration): Update apps/web and apps/desktop to import state/contracts from the portable package and rendering components from a new @agiworkforce/unified-chat-web (web-specific shell). Test thoroughly to ensure no regressions.
- Phase 4 (mobile adoption): Migrate apps/mobile to import state/contracts from the portable core and implement mobile-native UI components. Verify that mobile chat behavior (state transitions, message handling) matches web/desktop.
- Safety considerations: The portable core must fail if a required runtime capability (e.g., a specific storage adapter) is not provided, rather than silently degrading. The boundary between portable and presentation must be enforced at the package-export level to prevent deep imports bypassing the architectural boundary. All three surfaces (web, desktop, mobile) must pass their own test suites independently; integration testing must verify state consistency across surfaces. The migration should not occur in-place; it should be staged before adding new chat capability to any single surface, as mandated by §9.

**Recommendation (for the owner — not a decision).** Prioritize extracting the React-Native-safe shared chat core before adding new chat capability to any surface. The current state is an architectural violation of AC-82 and §9; mobile's reimplementation is a technical debt that compounds as chat features grow. The extraction should be treated as a platform-infrastructure task, not a surface feature. Define the portable-core boundary explicitly and defensively (with compile-time checks and export maps) so the boundary cannot silently erode as mobile UI is added. Once the portable core is extracted and all three surfaces consume it, record the completion with a note in the Architecture Manifest §2 and the owner-decision register to mark the finding resolved.

**Impact analysis.** **Blast radius — surfaces affected:** All three synced-app surfaces (web, desktop, mobile) and the data synchronization layer. **Severity if unaddressed:** High. As chat features grow (new message types, agent state, artifacts), the cost of maintaining independent mobile reimplementations compounds. Each new chat feature must be designed twice — once in portable state and once in mobile UI — and the lack of a shared portable core increases the risk of state divergence (e.g., mobile missing a field added to web). The constitution's reuse mandate (AC-82) is violated, and the principle that surfaces compose from shared layers (§11) is eroded. **Users affected:** Mobile users will not receive chat features at the same pace as web/desktop, and they are at higher risk of state inconsistencies (e.g., a message rendered differently across devices). **Engineering velocity:** Currently, any chat state change requires changes in both the unified-chat package (for web/desktop) and in mobile's reimplementation. With a shared portable core, a single change reaches all surfaces, reducing coordination overhead and enabling faster feature iteration. **Data consistency and trust boundaries:** While the current state does not violate trust boundaries (each surface manages its own storage correctly), the lack of a unified state contract increases the risk of subtle divergences in how trust-mode decisions are applied across surfaces.

**Required owner decision.** Should the team proceed with extracting a React-Native-safe shared chat core before the next major chat feature is added? This requires a commitment to 2-3 weeks of infrastructure work upfront, with payoff in faster, more reliable feature velocity across all synced-app surfaces going forward. The alternative is to accept indefinite mobile reimplementation with the associated maintenance burden and risk of divergence, and to record an explicit ADR justifying that decision.

---

### ARCH-D8 — Mobile egress-guard copy documents BYOK as part of "Local mode"

**Maps to:** constitution Appendix A · A8 · governing rule AC-41 · raised in §10, §45 · closing book: Trust-Boundary Egress Spec
**Related findings:** —
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All cited evidence reproduces against the source files: (1) apps/mobile/lib/egressGuard.ts lines 4-10 document Local as on-device + BYOK; lines 40-42 state "Local Mode is on-device + BYOK only". (2) docs/current/trust-mode-sur…

**Problem statement.** The mobile egress guard's JSDoc copy (lines 4-10 and 41-42 of apps/mobile/lib/egressGuard.ts) explicitly documents BYOK as part of Local mode, but the trust-mode-surface-matrix invariant (line 41 of docs/current/trust-mode-surface-matrix.md) forbids BYOK on Mobile entirely. This is a documentation/copy defect: the feature flag `byokKeys:false` (line 54 of apps/mobile/lib/v1FeatureFlags.ts) prevents any BYOK UI/flow, and no key-entry path exists in code, so no live capability is exposed — but the copy contradicts the trust boundary and misleads maintainers about what Mobile can do.

**Current implementation.** The mobile egressGuard.ts file documents Local mode as "on-device + BYOK" (line 5) and the error message states "Local Mode is on-device + BYOK only" (line 41). However, the actual codebase enforces strict separation: (1) the feature flag `byokKeys: false` (apps/mobile/lib/v1FeatureFlags.ts:54) disables BYOK credential entry at runtime; (2) the trust-mode-surface-matrix.md (lines 19, 28, 41) explicitly states Mobile has "no BYOK" with no provider-key-entry path; (3) the code has no BYOK adapter or key-derivation logic for Mobile (unlike desktop/CLI). The egress guard's documentation is inherited from desktop (line 12 acknowledges "mirrors the desktop egress chokepoint") but was not updated to reflect Mobile's surface-specific constraint that BYOK does not exist on this platform.

**Proposed architecture (target — not a build order).** The egressGuard.ts copy must be corrected to state that Local mode on Mobile is "on-device only" — removing any reference to BYOK. The error message at lines 40-42 should be rewritten to reflect Mobile's actual two-mode contract: Local (on-device, no BYOK) and Cloud (subscription-metered). The JSDoc block (lines 4-10) must clarify that this is the Mobile-specific implementation and explicitly state that BYOK is absent on Mobile per AC-41 and the trust-mode matrix. All references to "BYOK direct-to-provider traffic" must be removed from this module's copy since they do not apply when the feature is gated to false. The proposed target is: copy that is honest about the surface's actual capabilities and does not advertise BYOK as a Local-mode capability on Mobile.

**Evidence.**

- apps/mobile/lib/egressGuard.ts:4-10 (JSDoc documents Local as on-device + BYOK)
- apps/mobile/lib/egressGuard.ts:40-42 (error message states Local Mode is on-device + BYOK only)
- docs/current/trust-mode-surface-matrix.md:19 (Mobile row shows BYOK as absent: ❌ no BYOK)
- docs/current/trust-mode-surface-matrix.md:28 (Mobile rule: no BYOK, no provider-key entry)
- docs/current/trust-mode-surface-matrix.md:41 (Invariant 2: BYOK absent on Mobile, Web, Chrome)
- apps/mobile/lib/v1FeatureFlags.ts:54 (byokKeys: false)
- docs/00-foundation/architecture-constitution.md:1017 (AC-41: BYOK absent in code, copy, and egress policy on Mobile)

**Architectural rationale.** AC-41 enforces that BYOK must be absent not just in runtime behavior and egress policy, but explicitly in copy — so that trust-mode documentation never advertises a capability the surface cannot deliver. This protects the invariant that a maintainer reading the code, or a user reading error messages, receives a truthful picture of the surface's trust-boundary capabilities. Capability honesty is a first-order constitutional principle (AC-2, AC-47): identity and trust mode are orthogonal, and the trust boundary must be legible in code and copy without requiring the reader to cross-reference feature flags or infer negations. The current copy violates this by stating BYOK is part of Local mode, which contradicts both the feature-flag gate and the trust-mode matrix. Correction ensures that the egress guard's copy is the source of truth for Mobile's actual surface-specific trust model: Local (on-device, no provider keys, no BYOK) and Cloud (subscription metered through AGI-cloud).

**Alternatives considered.**

- Accept as intentional divergence with a recorded ADR: the desktop egressGuard copy is the source of truth, and the Mobile version is an incomplete copy that will be fixed when BYOK is enabled on Mobile in a future release. Trade-off: allows Mobile to ship with desktop-parity code but creates a maintenance debt; the copy remains misleading until BYOK is actually enabled, and any future Mobile BYOK enablement must trigger a code-review to ensure the copy and the trust-mode matrix are both updated. Risk: the copy could remain stale indefinitely.
- Keep the copy, add a comment clarifying that BYOK is not available on Mobile even though the copy mentions it: this softens the contradiction but leaves misleading documentation in place and violates AC-41's explicit requirement that BYOK be absent in copy. Not recommended.
- Restructure the module to have a Mobile-specific egressGuard implementation completely separate from the desktop version, with Mobile-only documentation: this is the highest-cost option and creates code duplication, but ensures copy is never inherited from a different surface. Trade-off: maintenance burden vs. legibility.
- Correct the copy now as proposed (minimal change, highest fidelity to AC-41): update JSDoc and error message to reflect Mobile's actual surface contract (Local = on-device only, no BYOK). This is the aligned path and costs only documentation updates.

**Benefits.**

- Copy becomes honest about Mobile's trust-boundary contract, eliminating a source of maintainer confusion and potential mis-scoping of future BYOK features.
- AC-41 compliance: BYOK is removed from code-level copy on Mobile, completing the enforcement of absence in code, copy, and egress policy.
- Capability honesty: error messages now truthfully describe what Local mode can and cannot do on Mobile, improving user understanding of why certain operations fail.
- Trust-boundary legibility: the egressGuard module can now serve as the source of truth for Mobile's surface-specific trust model without requiring readers to cross-reference feature flags.
- Reduced cognitive load for code reviewers: future Mobile-feature reviews (e.g., if BYOK is ever enabled) will not need to reconcile contradiction between the copy and the matrix.

**Risks.**

- Risk of current state: the copy remains a false source of truth, and if a maintainer relies on it to understand Mobile's trust model, they may incorrectly assume BYOK is available or is part of the Local-mode contract, leading to incorrect feature scoping or security model assumptions.
- Risk of not updating copy: when feature flags change (e.g., `byokKeys: true`), the copy may no longer be out of date, but without a clear ADR explaining the divergence, the relationship between the copy, the feature flag, and the matrix becomes unclear.
- Risk of the change: if the copy update is not coordinated with the matrix and the feature-flag owner, there could be transient states where they disagree (e.g., if the flag is enabled before the copy is updated). Mitigation: coordinate the change with platform-constitution owners and the Mobile product lead, and ensure the trust-mode-surface-matrix and the updated copy are in sync before any flag change.
- Low risk of a capability leak: the feature flag `byokKeys: false` is the enforcement mechanism, so the copy correction does not change the runtime behavior — it is purely a documentation fix.

**Dependencies.**

- AC-2 (Capability honesty and trust-boundary legibility)
- AC-41 (BYOK absent in code, copy, and egress policy on Mobile)
- docs/current/trust-mode-surface-matrix.md (the source of truth for which modes are available on each surface)
- docs/00-foundation/architecture-constitution.md (the governing rules for trust-boundary honesty)
- Trust-Boundary Egress Spec (the closing runtime book that will define exact egress policy per mode)
- Platform Constitution (Part VIII, surface-capability definitions — ensures the copy aligns with product-level surface contracts)

**Migration considerations.** 1. **No breaking change:** this is a documentation-only fix. The runtime behavior (controlled by `byokKeys: false`) does not change. 2. **Coordination required:** before updating the copy, confirm with the Mobile product lead and Platform Constitution owner that Mobile's Local mode is and will remain BYOK-free. If a future BYOK-on-Mobile initiative exists, this change should be reverted as part of that feature work. 3. **Staged update:** (a) Update the JSDoc block (lines 4-10) to remove BYOK references and clarify Mobile is on-device-only in Local mode. (b) Update the error message (lines 40-42) to state the two actual modes: Local (on-device) and Cloud (subscription). (c) Add a comment at the module top stating this is the Mobile implementation of the egress guard and differs from desktop in that BYOK is not available. (d) Verify the feature-flag gate (`byokKeys: false`) remains in place and is covered by tests that confirm BYOK credentials cannot be entered. 4. **Future-proofing:** if BYOK is ever enabled on Mobile (`byokKeys: true`), the copy must be reverted to include BYOK descriptions, the error message must be updated to document the three modes (Local with BYOK, Local with local-only, and Cloud), and the trust-mode-surface-matrix must be updated to show Mobile BYOK availability. This change should trigger a full security review of the BYOK egress path on Mobile. 5. **Testing:** no new tests are required; existing tests should already confirm that BYOK paths are not reachable on Mobile. Verify that the updated error message is correctly thrown when a Local-mode request reaches an our-cloud host."

**Recommendation (for the owner — not a decision).** Recommend that the owner decide to correct the copy now as proposed. The current divergence between the copy and the trust-mode-surface-matrix violates AC-41 (BYOK absent in copy on Mobile) and creates a source-of-truth confusion for maintainers. The fix is minimal (update JSDoc and error message) and costs only documentation review, with zero impact on runtime behavior or the feature-flag gate. This is the path that maximizes architectural honesty and compliance with the constitution. If a future Mobile BYOK initiative is planned, that work should include a deliberate decision (recorded as an ADR) to enable the feature, update all copy, and re-review the trust-boundary enforcement.

**Impact analysis.** **Scope:** Mobile (apps/mobile) only. **Affected surfaces/users:** Mobile developers, maintainers, security reviewers, and users reading error messages. **Severity:** Low runtime impact (feature flag already prevents BYOK), but moderate documentation/trust-boundary impact. The current copy misleads maintainers about Mobile's capabilities and violates AC-41. If a future Mobile BYOK feature is scoped without recognizing this divergence, it could result in incomplete security review or inconsistent trust-boundary enforcement. **Blast radius:** Limited to the egressGuard module's copy and the error messages it surfaces. The correction does not change egress policy, TLS pinning, or the feature-flag gate. **No user-facing regression:** users will see an updated error message (from "Local Mode is on-device + BYOK only" to "Local Mode is on-device only") that is more accurate and does not remove any capability that currently exists."

**Required owner decision.** **Decision:** Should Mobile's egressGuard copy be corrected to reflect the trust-mode-surface-matrix invariant that BYOK is absent on Mobile (per AC-41), or is the inherited-copy-from-desktop approach intentional and to be recorded as a justified divergence with an ADR? **Blocking:** This decision unblocks the Trust-Boundary Egress Spec authoring, which must document exact egress policy per mode and surface. **Timeline:** this should be resolved before the trust-mode-surface-matrix is finalized as the canonical source of truth for surface capabilities.

---

### ARCH-D9 — Local and cloud memory models are divergent and unreconciled

**Maps to:** constitution Appendix A · A9 · governing rule AC-22 · raised in §18 · closing book: Memory Runtime Spec
**Related findings:** —
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All cited file paths and code sections verified against the actual repository. Local two-layer schema confirmed in migrations.rs:726-783. Cloud schema confirmed in 0010_memory.sql and 0040_memory_cloud_sync.sql. Known contract…

**Problem statement.** The local desktop memory system uses a two-layer decay/daily-log/TF-IDF graph architecture, while the cloud storage is a flat-fact projection with no representation of importance decay or daily logs. The reconciliation contract between these two models — what is promotable, what is projection-only, what never leaves the device — is undefined, violating AC-22 which requires an explicit, owned contract.

**Current implementation.** Local (desktop): Two-layer model in SQLite: (1) `user_memory` table (id, category, topic, content, importance 1-10, source, created_at, updated_at) with indexes on category/importance/updated_at; (2) `daily_logs` table (id, log_date, timestamp, entry_type, content, metadata) with indexes on date/type. The memory_manager.rs implements importance decay (configurable decay_rate, decay_period_days, min_importance, access_boost), automatic compaction, and a local semantic search index (TfIdfIndex per memory.rs L29). Cloud (Managed): Flat projection in Postgres table `user_memories` (id, user_id, content, category, source, is_deleted, created_at, updated_at, server_version) with no importance field, no daily_logs equivalent, and no semantic index. Delta sync transport via POST /api/memory/sync carries only {id, content, category?, source?, isDeleted?, createdAt?, updatedAt} — no importance, no topic, no decay metadata. Known contract gaps documented in memory_sync.rs L23–34: topic is synthesized from cloud_id on pull-insert (semantic loss), importance defaults to 5 on pull (not preserved), daily_logs have no wire representation.

**Proposed architecture (target — not a build order).** An explicit Memory Reconciliation Contract (owned by the Memory Runtime Specification, deferred from constitution §18) MUST define: (1) what memory state is device-only (daily_logs, importance decay tracking, semantic index state) and NEVER promoted to cloud; (2) what is projection-only (cloud `user_memories` as a reduced shadow of local `user_memory`, carrying only content/category/source without importance); (3) what local metadata must be preserved across the Local→BYOK/Managed handoff if a memory is explicitly promoted; (4) the reconciliation of the local UNIQUE(category,topic) constraint with the cloud flat-fact model (whether topic is a promotable attribute or synthesized on pull); (5) the importance-reset semantics on pull (whether pulled memories always reset to default, or whether a push-then-pull round-trip preserves importance). The contract MUST be a formal, versioned agreement in the Memory Runtime book, not absorbed into the sync code as undocumented assumptions.

**Evidence.**

- apps/desktop/src-tauri/src/core/agi/memory_manager.rs:4-5 (two-layer architecture: user_memory + daily_logs)
- apps/desktop/src-tauri/src/data/db/migrations.rs:726-783 (local schema: user_memory with importance 1-10, daily_logs)
- apps/web/db/neon/0010_memory.sql:1-14 (cloud schema: user_memories with content/category/source/is_deleted, no importance)
- apps/web/db/neon/0040_memory_cloud_sync.sql:1-56 (delta sync adds server_version, no other fields)
- apps/desktop/src-tauri/src/data/memory_sync.rs:1-34 (wire protocol and known contract gaps: topic synthesized, importance defaults to 5, daily_logs absent)
- docs/00-foundation/architecture-constitution.md:288-299 (§18 Memory Architecture, AC-22 rule)
- docs/00-foundation/architecture-constitution.md:1181 (Memory Runtime Specification owns 'explicit reconciliation contract between local two-layer memory graph and cloud flat-fact projection')

**Architectural rationale.** AC-22 (Architecture Constitution §18) and the Memory Architecture section state that memory is a state plane whose trust boundary is immutable (local memories never silently promoted to cloud) and whose reconciliation must be explicit and owned. The current state violates this by treating the cloud projection as an implicit, lossy mirror without a formal contract defining what is lost, what is intentional, and what the promotion semantics are. Capability honesty (AC-2) requires that if the system advertises cross-device memory sync, it must define what properties sync preserves — importance, daily context, semantic clustering — rather than leaving them undefined. The two-layer local model (importance decay, daily logs, TF-IDF) represents significant ML state that cannot be preserved without a reconciliation contract; silence on this contract creates a latent loss-of-function bug if future work assumes importance survived a cloud sync, or assumes daily logs are accessible from cloud.

**Alternatives considered.**

- Accept the current lossy sync as intentional: document that cloud `user_memories` is a reduced shadow carrying only content/category/source and that importance/daily_logs are device-only, never synced. Record an ADR stating this is a design choice, not a gap. This trades richer cross-device memory for simpler cloud schema but requires explicit opt-out documentation.
- Extend cloud schema to carry importance and decay metadata: add `importance`, `last_accessed`, `decay_config` columns to `user_memories` and version the wire protocol to carry these fields. This preserves more memory state but introduces decay-curve questions (does the cloud decay run on its own cadence, or does it re-sync the desktop's decay state?) and requires migration/versioning.
- Define a projection-only contract with explicit promotion gates: a memory stays local until explicitly promoted, at which point the user consents to loss of importance/daily_logs, and the promotion is a new session in the cloud. This honors the trust boundary and AC-22 but requires new UI/UX for explicit promotion, not silent sync.
- Defer the decision to the Memory Runtime book with a placeholder contract: accept the current implementation as Phase 0, document the known gaps (memory_sync.rs already does this), and record a debt item to finalize the contract in the Memory Runtime Spec. This maintains the constitution's deference without pretending the contract exists today.

**Benefits.**

- Eliminates a latent capability-honesty bug: users will know whether importance/daily_logs survive cloud sync, or are intentionally local-only
- Enables intentional design decisions: the contract will define whether future work on cross-device memory enrichment (e.g., merged importance graphs) is in scope or out
- Unblocks the Memory Runtime Specification: the deferred contract is now an explicit gate that must be cleared before the Memory Runtime book is complete
- Provides a migration path for new memory subsystems (mobile, CLI): they can consume the contract rather than reverse-engineering the local/cloud relationship from code
- Supports capability-honest sync UI: the contract can drive whether 'sync memory' is advertised as full-fidelity or lossy

**Risks.**

- Current silent loss of importance/decay metadata on cloud sync may be hiding bugs: if any code assumes importance survived a sync, it will fail silently
- Incomplete contract enables local/cloud inconsistency: a user's local and cloud memory graphs can diverge without clear intent, breaking causality debugging
- New surfaces (mobile) will independently invent reconciliation logic without a shared contract, fracturing the consistency promise across platforms
- The promotion gap (topic field absent from wire protocol) means cloud-pulled memories lose their semantic identity; future code may incorrectly treat synthesized topic as real, creating stale-data bugs

**Dependencies.**

- Memory Runtime Specification (deferred from constitution §18) — owns the reconciliation contract and its activation
- Cloud memory sync design (referenced in docs/plans/shared-cloud-state-2026-06-22.md)
- Session & Synchronization Specification (§20, §21) — owns the handoff contract (Local→Managed); the memory contract must align with handoff semantics

**Migration considerations.** Phase 0 (current): Document the existing implicit contract in memory_sync.rs as a formal comment block listing what is lost (importance, daily_logs, topic identity) and what survives (content, category, source). Phase 1: Author the Memory Reconciliation Contract in the Memory Runtime book, covering (a) device-only state (daily_logs, decay tracking), (b) projection-only definition (what the cloud shadow carries), (c) promotion consent (if a local memory is explicitly moved to cloud, what happens to importance?), (d) pull-on-collision semantics (topic synthesis, importance reset). Phase 2: If the contract decides to preserve importance, extend the wire protocol (add `importance` to PushMemory, add backfill logic for existing rows). Phase 3: Update mobile and CLI memory subsystems to consume the contract rather than deriving their own sync logic. The migration MUST NOT occur until the contract is written and reviewed — premature schema changes without a contract are exactly how the current divergence occurred.

**Recommendation (for the owner — not a decision).** Record this as a blocking debt for the Memory Runtime Specification. Do NOT implement new memory subsystems (mobile, CLI, future client) until the reconciliation contract is finalized. Immediately add a formal comment block to memory_sync.rs (and the corresponding API route comment in apps/web) explicitly naming the contract gaps and the fact that they are awaiting the Memory Runtime book. Update the architecture-constitution.md deference (§18, line 1181) to include a forward pointer: "The reconciliation contract must cover X, Y, Z (cite memory_sync.rs)" so the Memory Runtime author has a concrete list of unsolved questions. Consider a short-term ADR recording the intent to leave these questions open, so future reviewers do not mistake silence for assent.

**Impact analysis.** **Severity if unaddressed:** High. The current state is a latent data-loss bug. Any future work that assumes importance survived a sync (e.g., a cloud-based memory ranking feature, or a research assistant that relies on access-boost frequency) will silently fail. Blast radius: any surface that syncs memory (desktop, planned mobile, planned CLI), and any downstream consumer of cross-device memory (shared research, team chat, agent-training data that relies on memory importance for token budgeting). If left unreconciled, the platform risks advertising "cross-device memory" without defining what that promise is, violating capability honesty (AC-2). **Unblocked if resolved:** the Memory Runtime Specification can finalize, new surfaces can implement memory correctly, and memory UX can be honest about what syncs and what stays local.

**Required owner decision.** Should the reconciliation contract prioritize (a) preserving as much local memory metadata (importance, daily_logs) as possible across sync, even if it requires new cloud schema and wire-protocol versioning? Or (b) accepting the cloud as a lossy fact projection, treating importance and daily_logs as intentionally device-only, and designing future cross-device features (e.g., memory ranking) that operate on the cloud projection's reduced state rather than the local graph's full state? This decision drives the scope of the Memory Runtime Specification and the migration path for new memory subsystems.

---

### ARCH-D10 — Cross-page sync ordering silently skips orphaned artifacts

**Maps to:** constitution Appendix A · A10 · governing rule AC-29 · raised in §21, §44 · closing book: Session & Synchronization Spec
**Related findings:** —
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All cited facts reproduce against the current source: (1) module-level known-gap note at lines 28-30, (2) artifact orphan skip at lines 664-671, (3) message buffering at lines 906-910, (4) AC-29 rule at constitution:991, (5) c…

**Problem statement.** When a desktop client pulls an artifact whose parent conversation has not yet arrived locally in the current or previous sync page, the artifact is silently skipped rather than buffered for retry. This violates AC-29 and leaves the user with an incomplete, transient view of their cloud state—a capability honesty defect that can persist until the next full sync cycle.

**Current implementation.** In `apps/desktop/src-tauri/src/data/cloud_sync.rs`, the `apply_artifact_deltas()` function (lines 646-785) resolves a pulled artifact's parent conversation ID via a local query (lines 654-660). If the parent is not found (line 664), the function logs a debug message and continues to the next artifact (line 671), permanently skipping the orphaned artifact in that sync cycle. By contrast, `apply_message_deltas()` (lines 887-978) implements the corrected behavior: when a message's parent is absent (lines 905-912), it calls `buffer_pending_message()` to retain the message in `cloud_sync_pending_messages` for replay once the parent arrives. The sync apply order (line 1134-1139) applies conversations first, then messages (with draining of pending messages), then artifacts—so within-page orphans are usually resolved, but cross-page artifact orphans are permanently lost until the next full sync cycle. The module-level documentation (lines 28-30) explicitly acknowledges this as a "Known gap."

**Proposed architecture (target — not a build order).** Artifacts whose parent conversations are not yet present locally MUST be buffered in a `cloud_sync_pending_artifacts` table (mirroring the existing `cloud_sync_pending_messages` table) along with their full deltas. After applying conversation deltas in each pull page, a `drain_pending_artifacts()` function MUST replay any buffered artifacts whose parents have now arrived, using the same idempotent upsert logic as normal artifact apply. Unbuffered artifacts MUST NOT advance the sync cursor past them—they MUST be retained and retried in the next page or cycle. The architectural symmetry with message handling (AC-28, AC-29) is restored: no synced state is silently dropped; every unsatisfiable apply is retained for recovery.

**Evidence.**

- apps/desktop/src-tauri/src/data/cloud_sync.rs:28-30 (module-level known-gap note)
- apps/desktop/src-tauri/src/data/cloud_sync.rs:646-673 (apply_artifact_deltas() FK-map orphan skip)
- apps/desktop/src-tauri/src/data/cloud_sync.rs:887-912 (apply_message_deltas() buffering contrast)
- apps/desktop/src-tauri/src/data/cloud_sync.rs:1028-1106 (drain_pending_messages() reference implementation)
- docs/00-foundation/architecture-constitution.md:703 (constitution Appendix A.10 gap registration)
- docs/00-foundation/architecture-constitution.md:991 (AC-29 rule)
- docs/00-foundation/architecture-constitution.md:325-336 (section 21 synchronization architecture)

**Architectural rationale.** AC-29 is a foundational invariant of the sync model: the server is the single authority on ordering, and the client MUST NOT drop an apply because a dependency is not yet satisfied—that dependency may arrive in a later page and the cursor has already advanced. Silently dropping an artifact is a capability honesty failure (inherited from AGI-TRUST-0001): the user's cloud state becomes temporarily incomplete, and the user is unaware. The asymmetry with messages (which are buffered) is not a justified divergence but a discovered defect—both are FK-dependent on conversations, both cross page boundaries, and both require the same recovery path. Fixing this restores the invariant: no synced row is ever silently lost; all unsatisfiable applies are retained for retry with a recovery path.

**Alternatives considered.**

- 1. Accept as documented divergence with an ADR: explicitly record that artifacts are dropped but messages are buffered, and update AC-29 to carve out artifact-specific exception. Tradeoff: violates the principle that sync applies are deterministically convergent and violates capability honesty—users cannot trust that their cloud state is complete after a sync. Rejected.
- 2. Drop messages too (converge downward): make both artifacts and messages skip unsatisfiable applies. Tradeoff: breaks the existing retry mechanism that successfully prevents message loss across pages. Regresses on a working recovery path. Rejected.
- 3. Buffer artifacts like messages (proposed target): implement `cloud_sync_pending_artifacts` and `drain_pending_artifacts()` to retain orphaned artifacts for replay once parents arrive. Tradeoff: minimal—reuses the proven message pattern, adds one table schema and one drain function, restores symmetry. Accepted.

**Benefits.**

- Sync convergence becomes deterministic: no synced state is permanently lost due to page boundaries.
- Capability honesty is restored: the user's view of their cloud state is complete after each sync cycle, not transiently incomplete.
- Architectural symmetry with message handling: both FK-dependent entities use the same buffering and recovery pattern.
- Single-fault recovery: a conversation arriving on page N+1 automatically triggers replay of all buffered artifacts that depend on it, without requiring a full re-sync.
- No runtime performance cost: buffering uses the existing table schema pattern (cloud_sync_pending_messages) and the same drain-on-arrival logic.

**Risks.**

- Risk of regression if drain logic omits an edge case: a buffered artifact whose parent is later deleted (tombstoned) must be handled correctly (currently messages clean up buffered children on conversation deletion; line 828-832). Mitigation: mirror the existing conversation-deletion cleanup logic to `cloud_sync_pending_artifacts`.
- Risk of large pending-artifacts table if parent conversations are delayed indefinitely: the server monotonic cursor will advance and pull cycles will continue to accumulate orphaned artifacts. Mitigation: the server's cursor is the source of truth; if a conversation is delayed by server load, that is a server issue, not a client buffer issue. The buffer is a transient holding area, not a cache; it is sized to the per-page delta and drained on every arrival.
- Risk of breaking existing deployments if the schema change is not backward-compatible: the new `cloud_sync_pending_artifacts` table must be created idempotently and must not interfere with existing sync state. Mitigation: standard SQLite migration: INSERT-OR-IGNORE to create the table if it does not exist; existing syncs with empty pending messages/artifacts continue to work.

**Dependencies.**

- AGI-TRUST-0001 (trust boundary egress specification): the overall trust-boundary model that sync operates within (AC-25, §21, §44).
- Session & Synchronization Spec (referenced in constitution Appendix A.10 as the closing book): this finding is owned by that runtime specification, which must define the pending-artifacts schema, drain logic, and interaction with conversation-deletion cleanup.

**Migration considerations.**

- Schema: create `cloud_sync_pending_artifacts` table with the same fields as `artifacts` delta (id, cloud_id, conversation_cloud_id, artifact_type, content, etc.) plus (cloud_id unique, user_id, server_version for idempotency).
- Code: add `buffer_pending_artifact()` function (mirrors `buffer_pending_message()` at line 987-1011) and `drain_pending_artifacts()` function (mirrors `drain_pending_messages()` at line 1028-1106).
- Integration: call `drain_pending_artifacts()` in `apply_pull_page()` after draining pending messages and before applying artifact deltas (line 1138), or after conversation apply and before artifact apply depending on preference.
- Cleanup: mirror the conversation-deletion orphan cleanup logic (line 828-832) to delete from `cloud_sync_pending_artifacts` when a conversation is tombstoned.
- Deployment: the migration is safe to deploy without manual script—the table is created on first sync attempt; existing syncs continue with no effect; the new drain logic is no-op until an artifact is buffered (which requires a new pull response with an orphaned artifact).

**Recommendation (for the owner — not a decision).** Implement the proposed architecture: buffer orphaned artifacts and drain them when parents arrive, using the proven message-buffering pattern as a template. This closes a documented AC-29 violation, restores architectural symmetry, and eliminates a silent data-loss risk that users are unaware of. The change is low-risk, reuses existing patterns, and has no performance downside. Record the migration plan in the Session & Synchronization Spec.

**Impact analysis.** **Severity: Medium—transient incomplete views are silent capability honesty failures.** Blast radius: Desktop cloud-sync users only (artifacts are desktop-specific; mobile/web/CLI do not generate or pull artifacts). Affected surfaces: Desktop (Tauri). User impact: silent loss of synced artifacts for a few sync cycles until a full re-sync or parent arrival. Severity is mitigated because: (1) the constitution is young and the defect is pre-1.0, (2) artifacts are lower-stakes than messages/conversations (they are supplementary content, not the primary chat), (3) within-page orphans are recovered, and (4) the next full sync will eventually arrive. Business impact: low—this does not affect billing, auth, or data integrity, only completeness of a non-critical delta on desktop. **If unaddressed:** the silent drop persists, users may assume artifacts are missing from the cloud, and the deviation from AC-29 will compound if other entities adopt similar silent-drop logic.

**Required owner decision.** Should the buffering and recovery of orphaned artifacts be implemented as proposed (in the next development cycle targeting the Session & Synchronization Spec), or should this defect be explicitly carved out as a documented divergence from AC-29 (with an ADR) and deferred to a future release? The owner must decide whether the low immediate blast radius justifies deferral or whether fixing a documented AC-29 violation is a prerequisite for the specification to ship.

---

### ARCH-D11 — Production migrations lack a ledger-backed runner

**Maps to:** constitution Appendix A · A11 · governing rule AC-51 · raised in §29 · closing book: Database Spec
**Related findings:** —
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All evidence cited reproduces against the codebase as of 2026-06-25. The script exists at the cited path, reads from /tmp, executes migrations 0037–0042, and has no ledger-recording mechanism. No schema_migrations or equivalen…

**Problem statement.** Production schema changes were applied via a temporary, hand-rolled script that read the database connection from a file in `/tmp` and performed manual SQL execution without recording what was applied. The unsafe script is now deleted, but with no migration ledger table or replacement runner, drift between committed migrations in the repo and the live schema remains unverifiable and unauditable.

**Current implementation.** The former `apps/web/scripts/_prod_migrate.mjs` parsed and executed a hardcoded six-migration chain (0037–0042) and logged a verification probe without recording an applied-migration ledger. It was deleted on 2026-07-30 as part of the process-environment credential contract and must not be restored. No standard migration runner, applied-migrations tracking table, or CI/deployment job currently replaces it.

**Proposed architecture (target — not a build order).** A migration runner and durable ledger that enforce AC-51: migrations are sequentially numbered and immutable; a runner (integrated into the CI/deployment pipeline or available as a deterministic CLI) records every applied migration in a durable database table (schema_migrations or equivalent) with timestamp and idempotence token; migrations are tested and applied to a branch-first before production; the runner includes an RLS-activation probe gate (as per §29) to ensure RLS is enforced before production cut; all SQL and runner invocation flow through the vendor-neutral data-layer adapter; the applied-migrations ledger is auditable from the repository so committed-vs-live schema drift is verifiable.

**Evidence.**

- Git history for the deleted `apps/web/scripts/_prod_migrate.mjs` (former temporary runner and hardcoded 0037–0042 chain)
- `scripts/env-doctor.mjs` (enforces the process-environment-only credential contract and rejects credential-bearing `/tmp` paths)
- apps/web/db/neon/0038_cloud_sync_versioning.sql:1-78 (representative migration with no applied-migrations table created)
- docs/00-foundation/architecture-constitution.md:459 (constitution §29 acknowledges: 'production was applied by a self-described temporary script with no ledger table')

**Architectural rationale.** AC-51 mandates that migrations are the system of record for schema state and that applied-migrations are durably ledgered so committed-vs-live drift is verifiable. The current temporary script violates both: it has no ledger (unverifiable drift), it is not integrated into CI/deployment (ad-hoc, error-prone), it reads secrets from /tmp (ephemeral, unauditable), and it provides no proof of which migrations were actually applied to production. A runner with a durable ledger provides the auditability required by the constitution's trust-boundary discipline (§29), enables safe rollback/verification, and decouples migration execution from manual processes. The RLS-activation probe gate ensures that schema changes cannot outpace access-control activation (preventing a gap where schema-new columns are visible before RLS policies guard them).

**Alternatives considered.**

- 1. Keep the script and add a manual ledger post-hoc (log what was applied by hand): Violates AC-51's requirement for a runner-recorded ledger; the ledger remains disconnected from execution and is a source of human error.
- 2. Use an off-the-shelf migration framework (Flyway, Liquibase, Knex): Would require choosing a third-party tool; the data-layer adapter pattern suggests vendor-neutral design, so the runner should be authored in-house using the shared adapter interface.
- 3. Continue ad-hoc application but add a CI gate that prevents schema drift: Addresses observability but not the root problem; CI gates detect drift after-the-fact, not prevent it. The runner is still needed for deterministic, auditable application.
- 4. Accept the temporary script as intentional and issue an ADR: This is the only option if drift and ad-hoc application are deemed acceptable for business reasons, but the constitution labels this a finding precisely because it is not acceptable under AC-51.

**Benefits.**

- Verifiable schema state: applied migrations are recorded durably, so the repo and production are always reconcilable.
- Auditability: every migration application has a timestamp and idempotence key, enabling security audits and compliance.
- Determinism: CI/deployment pipeline owns migration execution; no manual /tmp files, no ad-hoc scripts.
- Safety: branch-first testing and RLS-activation probe gate prevent schema-ahead-of-access-control windows.
- Rollback clarity: a ledger shows exactly what was applied, enabling safe targeted rollback or skip on retry.
- Trust-boundary alignment: all database access flows through the vendor-neutral data-layer adapter, enforcing AC-50.

**Risks.**

- Risk of current state: drift between repo and production is undetectable until a schema query fails; a rollback or recovery path is unknown because there is no record of what was applied.
- Risk of current state: ad-hoc scripts are a security and operational risk (secrets in /tmp, no audit trail, no idempotence guarantee).
- Risk of migration: introducing a ledger table requires a 0-series baseline migration that audits the current schema and records what has already been applied (bootstrapping); if the baseline is incorrect, the ledger is unreliable.
- Risk of migration: runner must be idempotent so re-runs on failure do not double-apply; this requires the migrations themselves to use IF NOT EXISTS and guarded updates (some migrations already do this, e.g., 0038, lines 18, 28, 31, but not all).
- Risk of activation: the RLS-activation probe gate requires consensus on what constitutes RLS readiness; if RLS is incomplete or unenforced, the gate becomes a blocker, which may require resolving findings AGI-SEC-0001 (RLS enforcement) and AC-49 (per-user isolation) first.

**Dependencies.**

- AGI-SEC-0001: RLS enforcement on the live CRUD path (constitution §27) — the runner's RLS-activation probe gate depends on RLS being actually enforced, not just present in schema.
- Implied finding: Data-Layer Adapter Completeness — the runner must use the vendor-neutral adapter (packages/platform/data-layer, factory.ts) to execute migrations, not direct Neon SDK calls. Current status: factory.ts supports createDatabaseClient() but no migration-runner interface is visible in the adapter API.
- Implied finding: Idempotent Migration Audit — baseline migration (0000 or pre-0037) that records which of the existing 42 migrations have already been applied, so the ledger is bootstrapped from truth, not guessed.
- Runtime book: Database Specification (deferred from §29) — the canonical ledger schema, runner CLI, CI/deployment integration pattern, and RLS-activation probe specification are owned by the Database Spec and are out-of-scope for this constitution but required by this finding.

**Migration considerations.**

- Phase 1: Author the runner within packages/platform/data-layer — extend the adapter types to include a `runMigrations(opts: {order: 'up'|'rollback'|'verify', probes?: []})` interface; implement on NeonDatabaseAdapter using a shared migration-loader and ledger-query pattern.
- Phase 2: Author the ledger schema — create a pre-0001 (or an early migration like 0000.5) that creates the schema_migrations table with (id, name, applied_at, idempotence_key, verification_payload) and records all existing migrations as already-applied (audit query against information_schema.tables/columns to build the baseline).
- Phase 3: Integrate into CI — update .github/workflows/ci.yml or a new migration-apply job to use the runner on branch pushes (test) and main merges (production); gate production apply on successful RLS-activation probe.
- Phase 4: Keep the former temporary runner deleted; deployment documentation must direct operators only to the ledger-backed runner.
- Phase 5: Verify idempotence — audit migrations 0001–0042 to ensure all use IF NOT EXISTS, guarded updates (WHERE ... IS NULL), or CREATE OR REPLACE; flag any migration that would fail on re-run and create a 0-series corrective migration.
- Rollback plan: If the runner encounters a ledger inconsistency, stop production apply, verify the live schema against the committed chain with a read-only probe, and repair/re-bootstrap the ledger through a reviewed corrective migration. Do not restore the deleted temporary runner.

**Recommendation (for the owner — not a decision).** Adopt AC-51 and begin the migration work in Phase 1–2 immediately. The current state is a known gap acknowledged in the constitution. The runner and ledger are foundational to trust-boundary discipline (AC-32, AC-49, AC-50) and do not depend on AGI-SEC-0001 being complete — they can be authored in parallel with RLS enforcement work. Start with the ledger table design and baseline audit so that even the temporary script can be instrumented to record its actions going forward as a bridge toward the runner. This unblocks both compliance (schema drift is now verifiable) and safety (every production apply is recorded).

**Impact analysis.** **Surfaces affected:** all (web, CLI, desktop, mobile) use the managed Neon store; their schema state is unified but unverifiable. **Users affected:** any user whose data depends on the schema being consistent between the repo and live — this is everyone in Managed mode. **Security:** absence of a ledger is a compliance and audit risk (no proof of what changed, when, or by whom in production). **Billing:** schema changes that affect cost accounting (e.g., token-tracking columns added in 0038–0042) are unauditable; reconciliation relies on trust. **Severity if unaddressed:** medium-to-high. The current temporary script has worked for its limited use (6 migrations post-v1), but as the schema grows and migrations become more frequent (cross-device sync, further RLS policies, new entities), the lack of a ledger becomes a reliability and audit liability. A production schema discrepancy would be undetectable until a query fails in production (worst case: silent data loss if a migration applied partially). **Scope of work to address:** moderate — the runner and ledger are new infrastructure but reuse the existing migration files and data-layer adapter; no schema refactoring is required.

**Required owner decision.** Should AGI commit to implementing a migration runner and durable ledger table per AC-51, with the runner integrated into CI and deployed in the next sprint, or should the temporary script be sanctioned as intentional with an explicit ADR and a recorded ledger-bypass policy for as long as manual migration frequency is low?

---

### ARCH-D12 — Two divergent loggers; web logs not guaranteed secret-scrubbed

**Maps to:** constitution Appendix A · A12 · governing rule AC-67 · raised in §37 · closing book: Observability, Telemetry & Logging Spec
**Related findings:** ARCH-D13, ARCH-D14
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. apps/web/lib/logger.ts is a pino instance (lines 5–24) with no redaction. packages/platform/utils/src/logger.ts implements redactSecretsWithReport (lines 189–230) and a redacting logger facade (lines 276–289) with consoleSink/sentrySin…

**Problem statement.** Two logger implementations coexist with incompatible signatures and redaction guarantees: the pino logger (object-first, no redaction) in apps/web/lib/logger.ts is used across the web backend (158 call sites), while the redacting varargs facade in packages/platform/utils/src/logger.ts implements the shared secret-scrubbing contract. Secrets logged through the pino path are not guaranteed to be scrubbed before egress.

**Current implementation.** apps/web/lib/logger.ts exports a pino instance configured for structured logging with optional pretty-printing in development. It accepts objects as arguments (e.g. `logger.warn({ error: authError }, 'message')`) and passes them directly to pino's transport without any redaction. packages/platform/utils/src/logger.ts provides a varargs facade with a redacting sink (consoleSink, sentrySink) that applies REDACTION_PATTERNS to all arguments before output. The web pino logger is used in 158 files (primarily app/api/\* routes), while the @shared/lib/logger wrapper is used in 59 files. The @shared facade in apps/web/shared/lib/logger.ts is a thin console proxy that does not perform redaction (it defers to packages/platform/utils) but is not used in API routes where pino is imported directly.

**Proposed architecture (target — not a build order).** All log output on every surface routes through the shared secret-redacting logger facade (packages/platform/utils/src/logger.ts) before reaching any sink. The web pino logger is retired. API routes and monitoring code replace pino calls with the redacting facade, which scrubs REDACTION_PATTERNS (API keys, JWTs, bearer tokens, database URLs, card numbers, password fields, etc.) from all arguments before console or Sentry egress. The signature changes from object-first `logger.error({ error }, 'msg')` to varargs `logger.error('msg', error)`, which the redacting facade stringifies and redacts uniformly. Trust boundary is preserved: the single chokepoint ensures no raw secret escapes to console, file, or remote collector on any surface.

**Evidence.**

- apps/web/lib/logger.ts:1-24 (pino instance, no redaction)
- apps/web/lib/logger.ts usage: apps/web/app/api/admin/directory-sync/route.ts (158 import sites, object-first calls like logger.warn({ error: authError }, 'msg'))
- packages/platform/utils/src/logger.ts:1-290 (redacting facade with REDACTION_PATTERNS, lines 40-154)
- packages/platform/utils/src/logger.ts:189-230 (redactSecretsWithReport, redactSecrets, scanSecrets redaction functions)
- packages/platform/utils/src/logger.ts:232-289 (logger facade: consoleSink and sentrySink apply redactSecrets to all args)
- docs/00-foundation/architecture-constitution.md:583-593 (AC-67 rule: all log output MUST pass through shared redacting facade; current state paragraph confirms pino path is unredacted leak)
- docs/00-foundation/architecture-constitution.md:1073 (AC-67 formal rule text)
- docs/00-foundation/architecture-constitution.md:1226 (Appendix A12 entry)

**Architectural rationale.** Logs are an egress surface and a secret-leak vector. AC-67 mandates a single secret-redacting facade to ensure every log line is scrubbed before console, file, or remote egress, protecting the trust boundary from unintentional secret leakage (API keys, JWTs, credentials, card numbers, passwords logged in payloads). Two divergent loggers with incompatible signatures undermine this guarantee: the pino path bypasses redaction entirely. Converging on the shared redacting facade enforces the invariant — the single chokepoint — that makes the redaction guarantee non-optional. The varargs contract (`logger.error('msg', ...args)`) is less object-centric than pino but permissible: the redacting sink stringifies and redacts uniformly, preserving debuggability without leaking secrets.

**Alternatives considered.**

- Accept divergence with an ADR: record that pino is a sanctioned second logger and audit all pino call sites for secrets before release. Tradeoff: removes the single chokepoint and requires manual review; redaction becomes best-effort. Violates AC-67 explicitly and increases regression risk on every code change.
- Augment pino with a redacting transport: wrap pino's transport to apply REDACTION_PATTERNS. Tradeoff: adds redaction at egress point rather than call site, but still object-first; requires maintaining pino-specific redacting middleware and invokes Regex matching twice (pino+redaction). Complexity/perf cost for marginal benefit over convergence.
- Converge on pino, add redaction to pino logger: Replace the varargs facade with a pino instance + redacting transport for all surfaces. Tradeoff: pino is object-first and loses structured context from varargs calls; adds pino as a non-negotiable dependency on desktop/CLI where console is preferred. Overkill for non-web surfaces.
- Converge on the varargs redacting facade (recommended): Replace web pino with packages/platform/utils facade. Tradeoff: signature change from object-first to varargs requires updating ~158 call sites, but single facade guarantees redaction and is already ported to desktop/CLI. Aligns with existing Rust boundary and AC-67.

**Benefits.**

- Single secret-redacting chokepoint eliminates bypassable logger paths and enforces AC-67 invariant non-optionally
- Ported REDACTION_PATTERNS (from Rust apps/desktop/src-tauri/src/sys/security/log_redaction.rs) applied uniformly across web and desktop, preventing secrets from leaking on either side of the IPC boundary
- Reduces cognitive load: developers use one logger with one set of guaranteed redactions rather than choosing between two
- Enables audit trail: redactSecretsWithReport() returns findings (severity, location, redactedPreview), supporting compliance and incident response
- Eliminates manual secret-review burden on API routes and monitoring code

**Risks.**

- Migration risk: 158 pino import sites must be updated; signature change from `logger.error({ error }, 'msg')` to `logger.error('msg', error)` requires careful refactoring. Incomplete migration leaves pino calls (leaks) in production.
- Varargs contract loses some context: `logger.error({ error, requestId, userId }, 'msg')` becomes `logger.error('msg error requestId userId)` unless called as `logger.error('msg', { error, requestId, userId })`. Redaction is applied to stringified object, not parsed fields.
- If REDACTION_PATTERNS is incomplete, a secret unmatched by the patterns will still leak (patterns must be maintained). Mitigation: the existing pattern set is comprehensive (API keys, JWTs, database URLs, card numbers, passwords) and ported from Rust; add new patterns only after security review.
- Performance: redacting every arg (Regex matching across REDACTION_PATTERNS) adds overhead to every log call. Mitigation: redaction only runs in production for warn/error (debug/info dropped), so impact is bounded; bench to confirm acceptable.

**Dependencies.**

- Related finding ARCH-D13: Observability is a facade (Sentry stub, OTel no-op). Logger convergence unblocks proper instrumentation once Observability spec defines the metric/event taxonomy and Sentry/OTel backends are wired.
- Runtime book: Observability, Telemetry & Logging Spec (owns redaction patterns, logger-facade contract, durable usage persistence, OTel enablement). Spec must formalize the redacting logger contract and migration timeline.
- Security review: changes to redaction patterns (REDACTION_PATTERNS) require High-Risk Merge Gate per §59 (AGI-TRUST-SECRET is the governing invariant).

**Migration considerations.**

- Stage 1 — Prepare: Generate inventory of 158 pino import sites, categorize by surface (API route, monitoring, LLM provider, etc.). Plan call-site refactorings (object literal unpacking, varargs order, error stringification). Write codemods if feasible.
- Stage 2 — Refactor incrementally: Replace pino imports with @shared/lib/logger in low-risk surfaces first (monitoring, analytics), validating that redaction works correctly on actual secrets logged in dev/staging. Update signature from logger.warn({ error }, 'msg') to logger.warn('msg', error).
- Stage 3 — Core API routes: Refactor high-risk API routes (auth, billing, admin) with staged rollout; use feature flags to verify redaction in canary before full rollout. Audit all refactored lines for completeness (no missed pino calls).
- Stage 4 — Remove pino: Once all sites are migrated and verified, remove apps/web/lib/logger.ts. Update tsconfig if needed.
- Trust boundary preservation: The varargs facade applies redaction uniformly; no additional gates needed. Log level gating (info/debug dropped in production, warn/error retained) is already in place and enforced by the facade.
- CI gate: Add lint rule (ESLint) to forbid `import { logger } from '@/lib/logger'` and require `import { logger } from '@shared/lib/logger'` on web code, preventing regression.

**Recommendation (for the owner — not a decision).** Converge on the shared secret-redacting logger facade (packages/platform/utils/src/logger.ts). Plan a staged migration: refactor the 158 pino import sites to use @shared/lib/logger, updating call signatures from object-first to varargs. This enforces AC-67's single-chokepoint invariant non-optionally and eliminates the tracked leak risk. The facade is already in place and ported from Rust; the effort is call-site refactoring and validation. Do not accept divergence with an ADR — the redaction guarantee is non-negotiable per AC-67 and the Architecture Constitution.

**Impact analysis.** **Scope:** All web API routes, monitoring services, and LLM provider integrations that currently log errors, config, state, or debug data via pino. **Users affected:** None directly; this is an internal observability change. **Security impact:** High — eliminates a bypassable logger path and enforces secret-scrubbing uniformly. If unaddressed, secrets in error payloads, user context, or provider responses logged through pino will leak to console/Sentry unredacted. **Billing impact:** None — log volume and structure unchanged, only redaction applied. **Operational impact:** Moderate — requires coordination of ~158 call-site refactorings, dev time for testing/validation. No user-facing downtime; can be staged. **Compliance:** AC-67 is the controlling rule; non-convergence is a tracked violation flagged in the constitution's current-state paragraph. Resolution required for security posture audit.

**Required owner decision.** Should the web logger converge on the shared redacting facade (packages/platform/utils/src/logger.ts) per AC-67, accepting the ~158 call-site refactoring cost, or should divergence be recorded in an ADR with compensating manual secret-review audits before every release?"

---

### ARCH-D13 — Observability is a facade (Sentry no-op stub; OTel computed-not-exported)

**Maps to:** constitution Appendix A · A13 · governing rule AC-66 · raised in §36, §38 · closing book: Observability, Telemetry & Logging Spec
**Related findings:** ARCH-D12, ARCH-D14 (durability dimension)
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All claims verified against source: isSentryEnabled() unconditionally returns false (apps/web/shared/lib/sentry.ts:137-139), all Sentry functions are no-op stubs (apps/web/shared/lib/sentry.ts, entire file), @sentry and @opent…

**Problem statement.** Observability APIs present a functional interface that is silently non-functional: Sentry's `isSentryEnabled()` always returns false and the @sentry dependency is not installed; OpenTelemetry-shaped usage attributes are computed in cost-tracker.ts but the generated OTel attribute bags are never exported or sent to any backend. This violates AC-66, which forbids a module from presenting a functional observability API that is silently a no-op.

**Current implementation.** Sentry stub (apps/web/shared/lib/sentry.ts:137-139) exports `isSentryEnabled()` that unconditionally returns false; all Sentry methods (captureError, addBreadcrumb, logNavigation, etc.) are no-op stubs that take parameters but perform no work. The @sentry/react dependency is not installed in apps/web/package.json. OTel attributes are computed by cost-tracker.ts's `toOtelAttributes()` function (lines 258-288), which generates GenAI semantic convention attributes (gen_ai.system, gen_ai.usage.input_tokens, gen_ai.usage.output_tokens, gen_ai.usage.cache_read.input_tokens, codex.usage.cache_creation_input_tokens, codex.usage.reasoning_output_tokens, codex.usage.total_tokens) for each LLM usage event. These attributes are then destructured into the logger.info() call in response-builder.ts:137 and stream-transform.ts:494 but only as metadata in structured logs — there is no OpenTelemetry client, no meter, no tracer, no exporter, and no backend wiring (verified: zero dependencies on @opentelemetry/\* packages in apps/web/package.json).

**Proposed architecture (target — not a build order).** Observability components must report their enablement status explicitly via an `isEnabled`-style signal accessible from health/status endpoints, in conformance with AC-66. If Sentry error tracking is not wired, `isSentryEnabled()` should return false with documentation explaining the disabled state and what enablement would require (e.g. DSN configuration, dependency installation). If OpenTelemetry export is not yet implemented, `toOtelAttributes()` should either (a) remain a pure computation utility exported only when an OTel exporter is actually configured and reachable, or (b) be moved behind a feature flag or conditional export function that communicates "computed but not exported" to callers. The cost-tracker module should be refactored so that OTel attributes are only generated when an export backend is actively wired and can be verified by a health check — not computed speculatively and discarded at every request.

**Evidence.**

- apps/web/shared/lib/sentry.ts:137-139 (isSentryEnabled always returns false)
- apps/web/shared/lib/sentry.ts (entire file: all exported functions are no-op stubs)
- apps/web/package.json (no @sentry/react or @opentelemetry dependencies listed)
- apps/web/lib/cost-tracker.ts:258-288 (toOtelAttributes function generates attribute bags)
- apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:137 (toOtelAttributes output spread into logger.info, not exported)
- apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:494 (toOtelAttributes output spread into logger.info, not exported)
- docs/00-foundation/architecture-constitution.md:1071 (AC-66 rule text)

**Architectural rationale.** AC-66 mandates that a module must not present a functional observability API that is silently a no-op; an unwired backend must report disabled via an explicit `isEnabled`-style signal. The current implementation violates this principle in two ways: (1) Sentry's stub provides a full API surface with no signal that it is disabled — a developer calling `captureError()` receives no indication that the error is not being captured, (2) OTel attributes are computed at every LLM request but discarded, giving the false impression that telemetry is flowing when it is not. This creates a capability honesty gap: the system appears to have observability when it does not. The target architecture requires either active enablement with health-checkable backends or explicit disabled signals so that operators and developers understand the observability posture. This aligns with the trust boundary and determinism principles: observability must be deterministic and transparently enabled/disabled, not silently failing.

**Alternatives considered.**

- Accept the no-op stubs as intentional scaffolding and document in a design record that observability is deferred (ADR approach): this trades silent failure for explicit design intent, but requires an ADR entry and does not remove the capacity-honesty gap.
- Remove toOtelAttributes and cost-tracker computation entirely until OTel export is ready: eliminates waste and false signals, but delays cost-tracking instrumentation and requires rework when export is added.
- Replace `isSentryEnabled()` with a config-driven function that returns true only if a DSN is present and the @sentry/react package is actually installed: reduces false positives but does not address the broader OTel façade issue.
- Implement a minimal OTel exporter (stdout or in-memory for now) and wire it end-to-end: makes the system non-façade, but introduces new dependencies and backend costs before they are strategically justified.

**Benefits.**

- Developers and operators gain transparent visibility into observability enablement status
- Eliminates speculative computation of OTel attributes that are never exported (reduces CPU waste on every LLM request)
- Creates a single source of truth for observability readiness that can be checked in health endpoints
- Enforces the architectural principle that capability-honesty must be explicit, not inferred from the presence of a function
- Unblocks the Observability, Telemetry & Logging Spec (runtime book closing item) by defining the contract between modules and backends

**Risks.**

- If isSentryEnabled() is changed to report true conditionally, existing code that assumes it is always false may behave unexpectedly
- Removing OTel attribute computation breaks cost-tracking instrumentation if it is relied on elsewhere; audit for dependents first
- If observability remains disabled, the system continues to be blind to production errors and usage patterns, increasing operational risk
- Delaying enablement further risks losing early production signal that would inform prioritization and architecture refinement

**Dependencies.**

- Related finding ARCH-D14 (cost/usage telemetry is non-durable)
- Observability, Telemetry & Logging Specification (runtime book that owns the metric/event taxonomy, OTel GenAI conventions, logger-facade patterns, and durable usage/cost persistence)
- AC-65 (observability signals must be emitted only in Managed mode and gated by privacy predicates)
- AC-67 (all log output must pass through the secret-redacting logger facade)

**Migration considerations.** Phase 1: Add explicit enablement signals. Create a new health/diagnostics endpoint that reports observability component status (e.g. `{ sentry: { enabled: false, reason: 'dependency not installed' }, otel: { enabled: false, reason: 'no exporter configured' } }`). Modify Sentry stub to log a warning at startup if isSentryEnabled() is checked in production. Phase 2: Decouple OTel attribute computation from export. Move `toOtelAttributes()` behind a feature check that gates both computation and export; or move it to a separate internal utility and have cost-tracker only compute when export is wired. Phase 3: If OTel export is to be enabled, install @opentelemetry packages, wire a minimal exporter (e.g. OTLP HTTP), and modify response-builder.ts and stream-transform.ts to call exporter.addEvent() in addition to logging. Do not ship OTel export without a trust-boundary audit (AC-65) to ensure no Local- or BYOK-origin content leaks into telemetry. All phases must preserve backwards compatibility of the cost-tracker API surface.

**Recommendation (for the owner — not a decision).** Record this finding and prioritize enablement of observability in the Observability, Telemetry & Logging Spec runtime book. The owner should decide: (1) Is observability (Sentry + OTel export) intended for the R24 release? If yes, unblock it with package installation and backend wiring. If no, (2) document the deferral in an ADR, mark the stub functions as @deprecated, and add health-check signals so the disabled state is explicit. Do not ship the current state in which observability APIs are present but silently non-functional. The cost-tracking instrumentation in toOtelAttributes() is sound; the issue is that it is computed but never exported — resolve this by either wiring an exporter or removing the computation until export is ready.

**Impact analysis.** Impact Severity: High. Current state: Production errors are not captured, no performance tracing is available, and cost/usage telemetry is computed but discarded. If observability remains disabled, the system operates blind to failures and usage patterns, increasing operational risk and making it harder to diagnose issues, validate billing, and optimize resource allocation. Blast radius: all users and all LLM requests. Surface: web app API routes (apps/web/app/api/llm/v1/chat/completions/\*) and client-side Sentry integration (if ever enabled). Security: no current risk (observability is disabled). Billing: cost-tracking data is computed in-memory (AC-68 violation tracked separately as ARCH-D14); fixing ARCH-D13 does not address that but enables proper OTel export once it is wired. Unaddressed for more than one release risks loss of production signal and slower incident response.

**Required owner decision.** Does the platform owner intend to enable error tracking (Sentry) and OTel export in this release? (A) If yes: commit to unblocking package installation, DSN/exporter configuration, and trust-boundary audit (AC-65) in the upcoming sprint, and update the roadmap accordingly. (B) If no: document the deferral in a design record (ADR), mark the stub functions as @deprecated with a comment explaining the intended timeline, remove the unused OTel attribute computation (or move it behind a feature flag), and implement health-check signals that report observability as disabled. Current state (silent no-op) is not acceptable under AC-66.

---

### ARCH-D14 — Cost/usage telemetry is non-durable (in-process Map)

**Maps to:** constitution Appendix A · A14 · governing rule AC-68 · raised in §31, §38 · closing book: Observability / Background & Reliability Spec
**Related findings:** ARCH-D13 (OTel-export gap)
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All cited facts verified: (1) cost-tracker.ts does implement a module-level Map with MAX_SESSIONS=1000 and explicitly resets on cold start per the file header; (2) toOtelAttributes() is computed but never exported; (3) durable…

**Problem statement.** Cost and usage telemetry lives in a module-level, LRU-capped Map that resets on cold start in a serverless environment, making it unsuitable as an authoritative record for any user-facing charges or billing decisions. This violates AC-68, which requires user-affecting metrics to persist to the durable system of record.

**Current implementation.** Cost/usage tracking is implemented in apps/web/lib/cost-tracker.ts as a module-level nested Map structure (sessionStore: Map<sessionId, Map<modelId, ModelUsage>>) with LRU eviction after MAX_SESSIONS=1000 (line 54). The module computes usage attributes correctly per GenAI semantic conventions (cache reads at 10% of input rate per line 94, cache writes at 125% of input rate per line 107, reasoning tokens at output rate per line 113) and exports a toOtelAttributes() function (lines 258-288), but this telemetry is never persisted to the database or exported to any observability backend. The file's own documentation (lines 3-28) explicitly states that durable Neon persistence is "out of scope for R24; flagged as follow-up" (line 11-12). The recordModelUsage() function (lines 146-174) accumulates usage in-process only, and getSessionTotalCostUsd() (lines 191-199) reads from the non-durable store. Per Appendix A item A14 and §38 of the constitution, the attributes are computed correctly but not exported and not durably stored, meaning the telemetry cannot be the basis of any user-facing charge.

**Proposed architecture (target — not a build order).** Cost/usage telemetry must be persisted to Neon at the time usage is recorded, with each session/model usage record written to a durable usage ledger table. The module-level Map should be demoted to a warm-instance cache for reducing database round-trips within a single Lambda invocation but must never serve as the authoritative record. User-facing charges must derive from the database state, not the in-process Map. Telemetry export to observability backends (OpenTelemetry, Sentry) must occur after durable persistence is confirmed and must be gated by the trust-boundary privacy predicate (sections 24/42), so that only Managed-mode usage is exported externally. The shape of attributes (GenAI semantic conventions plus codex.usage.\* vendor extensions per lines 250-286) is correct and aligns with codex-cli; the gap is purely durability and export infrastructure, not attribute shape.

**Evidence.**

- apps/web/lib/cost-tracker.ts:1-28 (file header acknowledges serverless cold-start reset)
- apps/web/lib/cost-tracker.ts:54 (MAX_SESSIONS=1000 LRU cap)
- apps/web/lib/cost-tracker.ts:57 (sessionStore module-level Map declaration)
- apps/web/lib/cost-tracker.ts:146-174 (recordModelUsage accumulates in-process only)
- apps/web/lib/cost-tracker.ts:258-288 (toOtelAttributes computed correctly but never exported)
- docs/00-foundation/architecture-constitution.md:1075 (AC-68 rule: user-affecting metrics must persist to system of record)
- docs/00-foundation/architecture-constitution.md:1228 (Appendix A14 gap summary)
- docs/00-foundation/architecture-constitution.md:609 (section 38 current state: cost/usage lives in module-level Map, out of scope, never exported)

**Architectural rationale.** AC-68 and section 38 of the Architecture Constitution establish that any telemetry counter affecting a user's billing, credits, or quota must be persisted to the durable system of record, because a module-level in-process structure in a serverless context is lossy (resets on cold start) and therefore cannot be trusted for financial decisions. The principle protects capability honesty (platform-constitution.md section 12) — the system must not charge a user for usage it cannot durably account for. Durable persistence is a precondition for establishing trust in metering; without it, user-facing charges would rest on unverifiable, non-auditable data. The in-process Map is valid as a warm-instance optimization, but only after durable persistence is confirmed. Telemetry export is governed by the trust-boundary privacy rules (sections 24/42), which require that Local-origin and BYOK-origin telemetry never reach AGI managed cloud — only Managed-mode usage may be exported externally.

**Alternatives considered.**

- Accept the in-process Map as the current state and defer durable persistence to a future release with an explicit ADR acknowledging the financial and audit risk — this leaves the system unbillable and violates AC-68 as currently written, but could be recorded as an intentional divergence if leadership accepts the risk.
- Implement dual-write: compute and write to Neon synchronously on every usage record, with the in-process Map as a read-through cache — adds database latency to every chat completion but provides strong durability guarantees immediately.
- Implement batch persistence: accumulate usage in the in-process Map and flush to Neon at the end of each request via a post-response hook (using Next.js waitUntil or a manual sync) — reduces database round-trips while still providing per-request durability, aligning with section 39 performance principles.
- Implement eventual-consistency persistence: write to Neon asynchronously after returning the response, accepting a narrow window where the in-process Map is authoritative but a crash could lose the write — provides lowest latency but violates the fail-closed reliability principle of section 34.

**Benefits.**

- Enables accurate, auditable billing and credit tracking that can survive Lambda cold starts and process restarts
- Satisfies AC-68 and section 38, closing a documented architectural gap
- Provides an authoritative, queryable record of usage per session/user/model for cost analytics, refunds, and fraud detection
- Unblocks telemetry export to observability backends, enabling production visibility for cost tracking and usage patterns
- Enables enforcement of quota limits and credit ledgering on the Managed tier, a precondition for shipping metered features

**Risks.**

- Risk of persisting without durable transactional isolation: if the request crashes between computing usage and writing to Neon, the usage is lost (mitigated by batch-flush design with explicit durability checkpoints)
- Risk of database latency blocking user-facing responses if usage is written synchronously (mitigated by async/batched writes per alternative 3)
- Risk of double-counting if retry logic re-runs the same usage record without idempotency (mitigated by request-id-based deduplication on the persistence layer)
- Risk of privacy leakage if Managed-mode usage is exported without re-checking the trust boundary (mitigated by gating all exports with the fail-closed isPrivateTrustBoundary predicate)
- Current state risk: in-process Map is lossy and unauditable, making any charge derived from it contestable and any refund unverifiable; shipping metered features without durable persistence violates AC-68 and creates financial liability

**Dependencies.**

- ARCH-D13 (observability is a facade): telemetry export infrastructure does not exist and must be built before usage telemetry can be exported to observability backends
- Database schema migration: a durable usage_ledger table or similar must be added to Neon with transaction support and retention policies
- Privacy boundary enforcement (sections 24/42): the fail-closed trust-boundary predicate must gate all telemetry export so that Local and BYOK usage never leaves the private boundary
- Credit ledgering system (future Cloud Services spec): metered features and quota enforcement depend on durable usage records

**Migration considerations.**

- Stage 1 (immediate): Add a usage_ledger table to Neon with sessionId, modelId, usage columns and transaction support; add row-level security to prevent unprivileged reads
- Stage 2 (R25): Refactor recordModelUsage() to also write to Neon after computing the cost; implement request-id-based deduplication to prevent double-counts on retries; keep the in-process Map as a warm-instance cache within the same request
- Stage 3 (R25): Implement batch flush via post-response hook (waitUntil or equivalent) to ensure durable write before response is sent, with explicit acknowledgment of durability before in-process state is considered authoritative
- Stage 4 (R25+): Enable telemetry export from the usage_ledger only in Managed mode, gated by the trust-boundary predicate; export to OpenTelemetry and internal analytics backends
- Testing: implement integration tests that verify cold-start recovery (kill the process after usage is computed but before response is sent) and confirm usage is durable
- Rollback: in-process Map continues to function as a cache; existing code reading from it will still work; toggling export on/off is independent of persistence

**Recommendation (for the owner — not a decision).** Adopt the batch-flush design (alternative 3): accumulate usage in the in-process Map and persist to Neon at the end of each request via a post-response hook (Next.js waitUntil or explicit async handler). This satisfies AC-68 immediately without blocking user-facing responses with database latency, maintains backward compatibility, and stages telemetry export to be gated by the privacy boundary. Add explicit durable-write acknowledgment before the response is sent, so the system does not advertise a user-facing charge until durable persistence is confirmed. Record this decision in the Observability/Background Reliability runtime book so that the privacy-boundary gating and export rules are specified before implementation begins.

**Impact analysis.** Blast radius: Impacts all LLM usage tracking on the web surface (apps/web/app/api/llm/v1/chat/completions/route.ts and related endpoints). Affects Managed-tier billing and credit ledgering, which are currently gated. Surfaces affected: Web. Users affected: Eventually all Managed-mode users when metered features ship; currently no production impact because metered features are gated. Security impact: Current state has financial liability (charges not backed by durable records); fixing this reduces fraud surface and enables audit trails. Operational impact: Requires a new database table and post-response hooks. Severity if unaddressed: High — shipping metered features without durable usage telemetry violates AC-68, creates legal/financial exposure, and undermines capability honesty about what the system can charge for. A user-facing charge without a durable, auditable record is a correctness defect.

**Required owner decision.** Confirm whether cost/usage telemetry persistence is a release-blocking requirement for R25 or can be deferred further. If blocked: approve the batch-flush design and authorize the schema migration. If deferred: issue an explicit ADR recording the financial/audit risk and the conditions under which metered features may ship without durable persistence (recommend: never ship metered features without durable usage tracking, but leadership may override this).

---

### ARCH-D15 — Inventory-honesty gaps in the Cargo workspace

**Maps to:** constitution Appendix A · A15 · governing rule AC-85 · raised in §46, §47 · closing book: Module Boundary & Dependency Governance Spec
**Related findings:** ARCH-D16 (owns the Rust boundary-check work)
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. (1) Cargo.toml root member glob and node-version.txt file verified; (2) Cargo.toml lines 9-12 comment verified word-for-word; (3) apps/cli/Cargo.toml lines 39-43 path dependencies verified: five crates confirmed; (4) apps/desk…

**Problem statement.** The root Cargo.toml declares that shipping binaries depend only on two crates (agiworkforce-protocol and agiworkforce-sandbox-policy) yet apps/cli actually path-depends on five crates. Additionally, the crates/\* glob pattern admits a non-crate file (crates/node-version.txt) into the workspace manifest, and the comment claiming 44 other workspace crates appears stale given only 17 crate directories exist.

**Current implementation.** Root Cargo.toml (lines 9-12) contains a comment stating: "Shipping binaries (apps/cli + apps/desktop/src-tauri) only depend on `agiworkforce-protocol` and `agiworkforce-sandbox-policy` via path." However, apps/cli/Cargo.toml (lines 39-43) path-depends on five crates: agiworkforce-app-server, agiworkforce-protocol, agiworkforce-sandbox-policy, agiworkforce-command-registry, and agiworkforce-utils-image. The root Cargo.toml members glob (line 5) specifies crates/\*, which pattern-matches 17 crate directories plus one non-crate file: crates/node-version.txt (a text file containing "22.22.0"). The comment (Cargo.toml line 11) claims "Other workspace crates (44)" exist and compile, but only 17 actual crate directories are present. The root Cargo.toml comment also notes (lines 11-12) that `cargo check --workspace` runs cleanly, suggesting the glob-matched node-version.txt does not break the build, though this was not runtime-verified (read-only environment).

**Proposed architecture (target — not a build order).** Per AC-85 and §46, the declared dependency surface of a shipping binary MUST name paths that exist and match the build graph. The proposed target is: (1) update Cargo.toml lines 9-12 to document the actual five path dependencies of apps/cli (app-server, protocol, sandbox-policy, command-registry, utils-image) — either enumerate them or rewrite the claim to be precise; (2) verify and update the crate count from 44 to the actual count (17 directories observed); (3) either exclude the crates/node-version.txt file from the workspace glob by renaming or moving it, or document why non-crate files in the crates/ root are acceptable and exclude them via a more precise glob pattern (e.g., crates/\*/); (4) apply the same honesty scan to apps/desktop/src-tauri/Cargo.toml (which declares only sandbox-policy dependency, matching the stated policy). The overarching principle is that capability honesty requires the dependency surface to be kept in provable correspondence with the running build graph, not stated as a prose comment that drifts when code changes.

**Evidence.**

- Cargo.toml:5 — crates/\* member glob
- Cargo.toml:9-12 — comment claiming only 2 shipping-binary dependencies
- apps/cli/Cargo.toml:39-43 — five actual path dependencies declared
- crates/node-version.txt — non-crate file matching the glob
- Cargo.toml:11 — comment claiming 44 workspace crates
- 17 crate directories verified via ls -d crates/\*/ | wc -l
- apps/desktop/src-tauri/Cargo.toml:31 — single sandbox-policy dependency

**Architectural rationale.** AC-85 (§46, §50) establishes that the declared dependency surface of a shipping binary MUST name paths that exist and match the build graph. A stale dependency claim or update instruction is a defect that enables drift, not a comment. The current implementation violates this rule by codifying a false claim (2 dependencies) in a comment while the running code (5 dependencies) silently diverges. This is a form of capability dishonesty — a maintainer reading the root Cargo.toml cannot trust it to reflect what the binaries actually depend on. The glob-admitted non-crate file is a secondary inventory-hygiene smell: it suggests the crates/\* pattern is not tightly specified, which could admit accidental non-crate artifacts. The stale count (44 vs. 17) further erodes confidence in the workspace inventory. Per §46, "The stated minimal dependency surface is stale" — this finding repeats the constitution's own diagnosis and points to the specific defect that must be closed.

**Alternatives considered.**

- (1) Accept as intentional divergence with an ADR: record that the root Cargo.toml comment is documentation of historical intent, not a live contract, and commit to keep it updated on each new shipping-binary dependency. Risk: maintainers will continue to treat prose as authoritative, and the ADR will drift just as the comment has. (2) Move the inventory entirely to architecture-manifest.md (AGI-DOC-0003) and reference it from Cargo.toml, making the manifest the SSOT for workspace structure. Benefit: centralizes structural facts; risk: introduces a cross-file dependency that CI must verify. (3) Implement a CI check that asserts Cargo.toml metadata (member count, shipping-binary dependency set) against reality and fails on divergence. Benefit: makes the invariant mechanical; benefit: addresses all three gaps (count, dependency, non-crate files) in one gate. (4) Do nothing and accept divergence; record the gap as ARCH-DIVERGENCE-001. Risk: unacceptable per AC-85.

**Benefits.**

- Maintainers can trust the workspace manifest to accurately describe what shipping binaries depend on, eliminating silent divergence between documentation and code.
- Workspace inventory (crate count, member glob patterns) remains honest and automatically verified, improving developer velocity and reducing cargo-check surprises.
- Closes a defect-class that AC-85 explicitly forbids: dependency claims that drift from the build graph.

**Risks.**

- Risk of current state persisting: maintainers and future reviewers continue to treat a stale comment as truth, missing that five dependencies are required; this could lead to incomplete dependency-boundary audits and unplanned coupling.
- If the gap is 'fixed' by updating the comment without fixing the underlying root cause (why the dependencies were added to cli without updating the root record), the same drift will recur.
- The node-version.txt file may be intentional (e.g., a version pin for a build step); excluding it without understanding its purpose could break the build.
- The crate count may have been 44 at a prior time and is now stale; migrating to a lower count without a migration strategy could indicate that crates were removed but dependencies on them remain.

**Dependencies.**

- Related finding ARCH-D16 (if it addresses other inventory-honesty gaps); Module Boundary & Dependency Governance Spec (the runtime book cited as the closing book); AC-85 (the governing rule); AC-99 (which requires that stale governance be reconciled, not left in place to mislead).

**Migration considerations.** Stage 1: Audit. Run `cargo tree -p agiworkforce-cli --depth 1` and `cargo tree -p agiworkforce-desktop --depth 1` to establish the definitive current-state dependency set for each shipping binary, independent of comments. Verify the purpose and ownership of crates/node-version.txt (check git history and linked issues). Count the actual crate directories and cross-reference with architecture-manifest.md §1 to see if the count is known to be out of sync. Stage 2: Decide. Record in an ADR whether to (a) make the root comment precise (enumeration + machine check), (b) centralize inventory in the manifest with a CI gate, or (c) implement a cargo-level check. Stage 3: Implement. Update Cargo.toml (or the chosen SSOT) with the correct inventory and any necessary exclusions. Add a CI check if chosen. Stage 4: Verify. Run the new check and confirm it passes; confirm the workspace builds and tests still pass. No trust-boundary or Local Mode implications; this is hygiene, not structural change."

**Recommendation (for the owner — not a decision).** Recommend that the owner decide to implement a CI check (option 3) that validates Cargo.toml member structure against filesystem reality: (a) assert that every member glob resolves to actual crate directories (not arbitrary files), (b) assert that the count and names of crates match either the manifest or a pinned inventory in the workspace root, (c) assert that every dependency listed in `Cargo.toml [workspace]` or in shipping-binary manifests exists as a path in the crates/ directory. This is the approach with the least ongoing maintenance burden and the highest mechanical confidence. Secondary recommendation: clarify the purpose of crates/node-version.txt and tighten the glob from crates/_ to crates/_/ if it is not part of the Cargo workspace manifest (it should not be). This finding should be resolved before the Module Boundary & Dependency Governance Spec is closed.

**Impact analysis.** Blast radius: The workspace structure affects every contributor and every CI build. Severity if unaddressed: Medium-High. The current state enables silent drift in shipping-binary dependencies, which could lead to: (1) undetected coupling growth (a shipping binary quietly picks up a new transitive dependency and maintainers don't notice because the declared surface is stale); (2) confusion in onboarding or during crate audits (a new contributor reads Cargo.toml and thinks apps/cli has 2 dependencies, then discovers 5 and loses trust in the documentation); (3) false negatives in dependency-boundary enforcement (the Module Boundary check at §47 scans TypeScript boundary rules but does not scan Cargo at all per line 743, so the Rust side is documented but unenforced; a stale comment makes the documented boundary even less trustworthy). The node-version.txt admission into the crates/\* glob is lower severity but contributes to a smell that the workspace boundary is not tightly specified.

**Required owner decision.** Should the owner choose to (1) keep the declared dependency surface in Cargo.toml comments and commit to updating them on each shipping-binary dependency change, with a CI gate that validates the comment against the build graph; (2) centralize the workspace inventory in architecture-manifest.md and reference it from Cargo.toml, with a CI gate that verifies synchronization; (3) implement a Rust-side boundary check equivalent to the TypeScript boundary check (scripts/check-boundaries.mjs) that validates the Rust crate graph against declared rules, as AC-85 and §47 mandate; or (4) defer the decision to the Module Boundary & Dependency Governance Spec author, with a placeholder ADR? Option 3 is preferred because it is the only approach that closes the enforcement asymmetry documented at §47 line 743 (TypeScript boundaries are machine-checked; Rust boundaries are not).

---

### ARCH-D16 — Rust crate boundaries are tooling-unenforced

**Maps to:** constitution Appendix A · A16 · governing rule AC-06 · raised in §6, §47 · closing book: Module Boundary Spec
**Related findings:** ARCH-D15, ARCH-D17
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All claims verified against source files: (1) scanRoots definition at scripts/check-boundaries.mjs:120 confirms only TypeScript roots are scanned; (2) the complete check-boundaries.mjs file (lines 1–201) contains no Cargo.toml…

**Problem statement.** The platform's Rust crate-layering law (AC-06, AC-79, AC-01) is documented in the Architecture Constitution as binding with the same force as TypeScript/services boundary rules, but has no machine check to enforce it. The boundary check script (check-boundaries.mjs) scans only TypeScript roots (apps/, packages/, services/), leaving Rust crate imports (crates/) undocumented in guardrails and unverified in CI — a gap that violates the platform's constitutional principle that boundaries expressed only in prose are not enforced.

**Current implementation.** The boundary enforcement in scripts/check-boundaries.mjs line 120 defines scanRoots = ['apps', 'packages', 'services'] and scans only those directories. The script validates intra-package/service import rules (apps↛apps, packages↛apps, services↛UI) and deep-import encapsulation for TypeScript, but contains no logic for Rust crate dependency inspection and carries no mechanism to read Cargo.toml files or validate crate-layering rules. The Rust workspace (crates/, apps/cli Cargo workspace, apps/desktop/src-tauri) is therefore subject to the same layering law (§6, §47 of architecture-constitution.md, lines 163–178 and 737–750) but depends on manual review and documentation-only verification rather than machine enforcement. The boundary rules themselves are defined across the constitution (§6 Package Boundaries line 174; §47 Monorepo Strategy lines 743–749; AC-06, AC-79 in the Architectural Rules canon) and apply equally to Rust crates as to TypeScript packages.

**Proposed architecture (target — not a build order).** Establish a machine check equivalent to the TypeScript boundary check for the Rust crate graph, runnable as part of the CI guardrail suite. The check must: (1) parse the Cargo.toml workspace members (apps/cli, apps/desktop/src-tauri, crates/\*) and their dependencies; (2) validate the inward-pointing dependency law (AC-01: dependencies point inward only; AC-03 and AC-06 enforce the same rule across all languages); (3) verify that crates respect the layering law defined in architecture-manifest.md §2 (Contracts → Mechanics → Orchestration → Surfaces, with vendor specifics confined to Mechanics); (4) fail the build if a crate imports outward across layers or if a higher-layer crate imports a lower-layer crate in violation of the inward-only rule; (5) integrate with the existing pnpm check:boundaries command or add a parallel cargo check:boundaries entry point as part of the monorepo's CI discipline. The check must run against the actual Cargo.toml dependency graph, not whitelist-based validation, so that crate-level architectural guarantees are earned the same way TypeScript guarantees are — by a machine that can be audited and trusted.

**Evidence.**

- scripts/check-boundaries.mjs:1–201 (complete file; scanRoots definition at line 120)
- scripts/check-boundaries.mjs:120 (scanRoots = ['apps', 'packages', 'services'])
- docs/00-foundation/architecture-constitution.md:163–178 (§6 Package Boundaries: boundary law applies to 'package or crate' equally)
- docs/00-foundation/architecture-constitution.md:737–750 (§47 Monorepo Strategy: explicit statement of the enforcement gap at lines 743–749)
- docs/00-foundation/architecture-constitution.md:174 (direct statement: 'the boundary law is constitutional across all four artifact kinds, but only the TypeScript roots are mechanically scanned today, leaving Rust crate layering documented but unenforced')
- docs/00-foundation/architecture-constitution.md:749 (AC-06: 'Module-boundary enforcement MUST cover every workspace language; the Rust crate graph MUST be subject to a machine check equivalent to the TypeScript/services boundary check')
- docs/00-foundation/architecture-manifest.md:18 (Cargo workspace members: apps/cli, apps/desktop/src-tauri, crates/\*)

**Architectural rationale.** The Architecture Constitution states (Preamble, lines 27–28) that 'boundaries are enforced, not suggested: a rule that cannot be mechanically checked is recorded as a tracked defect, not asserted as satisfied.' This principle is stated again in §1 Engineering Philosophy (lines 116–117) as a binding discipline: 'a boundary that exists only as documentation has already failed.' AC-06 (the governing rule) formalizes this: 'a boundary expressed only in prose is not enforced.' The Rust crate law binds with the same constitutional force as the TypeScript boundary law (AC-01, AC-03), and the platform's foundational trust-boundary and capability-honesty invariants depend on the inward-pointing dependency discipline. A Rust crate that reaches outward to a higher layer or that imports a Surface/Orchestration concern into Mechanics or Contracts is precisely as dangerous as a TypeScript package that does so — it risks entangling vendor specifics into the contract layer, cross-cutting concerns across trust modes, or surface-specific logic in reusable machinery. Without machine enforcement, the gap is not a "future improvement"; it is a defect in the platform's ability to prove its architectural guarantees. A code reviewer cannot audit every crate import manually; a CI check can. The rightly-enforced principle here is that trust boundaries and architectural layering are not volunteer-honored culture — they are machine-checked law.

**Alternatives considered.**

- (1) Accept the Rust crate-layering gap as documented and defer enforcement indefinitely. Tradeoff: The platform then admits that half of its workspace (Rust crates) operates under a two-tier system — documented rules for Rust but machine-enforced rules for TypeScript. This is the 'accept as intentional divergence with a recorded ADR' option. It would require an explicit ADR stating why Rust is exempted from the enforcement discipline that TypeScript must follow, and the ADR would need to argue that the two-tier enforcement is necessary and acceptable. Today, no such ADR exists, and the constitution explicitly treats the absence of cargo-level checking as a defect (§47 lines 743–749), not a feature.
- (2) Converge by building a cargo-native check at the Rust level and integrating it into CI, so both TypeScript and Rust enforce at their respective tool level. This is the proposed architecture. It requires building a new guardrail, but it closes the gap and makes the two halves of the monorepo equal in architectural accountability.
- (3) Converge by implementing a unified, language-agnostic boundary check (perhaps a static analyzer or a metadata layer that consumes both pnpm and cargo output) that validates the same rules across both workspaces from one place. Tradeoff: more complex to author, but more likely to catch cross-language issues (e.g., a TypeScript package importing Rust crate imports indirectly). This is a future enhancement but not necessary for the baseline enforcement the constitution requires.

**Benefits.**

- Rust crates are held to the same machine-enforced architectural accountability as TypeScript packages, eliminating a two-tier enforcement model.
- The platform gains the ability to prove (not merely claim) that vendor specifics stay in the Mechanics layer and do not leak into Contracts or Orchestration.
- CI can reject a crate that reaches outward across layers in the same commit, rather than discovering the violation in manual review or at runtime.
- The Module Boundary Spec (which closes this finding) gains a complete, testable specification for Rust crate layering, not a documentation-only rule.
- When a new crate is proposed for the workspace, the machine check enforces the AC-79 'second-consumer' rule at the dependency graph level, preventing single-use crates from entering the workspace unnoticed.
- The platform can confidently assert that trust-boundary isolation, capability-honesty guarantees, and the inward-only dependency law hold uniformly across all workspace languages.

**Risks.**

- Without action, a Rust crate violating the layering law can be merged undetected, eroding the architectural invariants the platform depends on. This is a defect risk — the architecture is weaker than documented.
- The current gap creates a false sense of security: code reviews may rely on the documented rules without realizing the absence of machine enforcement, leading to approval of violations that would fail a TypeScript check.
- If another language or runtime is added to the workspace later (e.g., Go, Python service layer), the Rust-only absence of enforcement establishes a precedent that not all languages need the check, further eroding the discipline.

**Dependencies.**

- ARCH-D15: Inventory-honesty gaps (Cargo.toml path-dependency count and the stray crates/node-version.txt) must be resolved before a cargo boundary check can reliably validate the workspace shape.
- AC-06 and AC-79 (the Architectural Rules this finding serves) are already in the Architecture Constitution and require no further decision.
- The Module Boundary Spec (referenced as the closing book for this finding) must be authored to define the precise Rust boundary rules and the integration point for the cargo check in CI.
- Implementation depends on the CI/guardrail framework being in place to run the check and fail the build if violations are found.

**Migration considerations.** The migration is additive: add a cargo-based boundary check (either a new script or a Rust-native tool) without removing or changing the TypeScript check. The steps would be: (1) author the Module Boundary Spec to define the precise Rust crate layering rules (which crates belong in which layers, which layer-to-layer imports are forbidden); (2) implement a cargo boundary checker (e.g., a script that parses Cargo.toml files and validates dependency direction, or a cargo-clippy linter); (3) integrate it into the CI pipeline (add a `pnpm check:boundaries:cargo` or similar command that runs alongside the existing TypeScript check); (4) run it against the existing workspace to identify any current violations; (5) decide whether to grandfate violating crates under an ADR or fix them before the check is enforced. The check does not require any file moves or behavioral changes — it is purely a guardrail addition. Because the rule is already written into the constitution (§6, §47, AC-06), the check is merely making an existing rule verifiable, not introducing a new constraint.

**Recommendation (for the owner — not a decision).** Proceed with building a Rust crate boundary check and integrating it into CI as a complement to the TypeScript boundary check. The recommendation aligns with AC-06 and the platform's constitutional principle that boundaries must be machine-enforced. The effort is bounded (a Cargo.toml parser + dependency validator + CI integration) and the payoff is high (the platform can then prove, not just claim, uniform architectural accountability across all languages). If the team determines that the Rust half of the workspace has violated the layering law in ways that would be expensive to fix immediately, those violations should be recorded in an ADR with a migration timeline, not silently exempted from the rule.

**Impact analysis.** Severity if unaddressed: Medium-high. The platform's trust-boundary and capability-honesty invariants depend on the inward-only dependency law; a Rust crate that smuggles vendor specifics inward or reaches outward into a Surface is a defect of the same class as a TypeScript package doing so. The risk is not imminent (it requires a crate author to deliberately violate the rule, or a reviewer to miss it), but the current lack of enforcement means there is no gating mechanism when violations occur. Blast radius: All surfaces that depend on Rust crates (desktop, CLI, mobile-via-native-modules) are affected if a Rust-layer violation propagates. Surfaces not affected: Web (TypeScript-only) is unaffected by Rust crate violations but is affected by the principle that some architectural rules apply to only some languages, which weakens the platform's overall guarantees. Business impact: None directly, but reputationally, if a security or capability violation occurs in a Rust layer that would have been caught by machine enforcement on the TypeScript side, the two-tier system is revealed as a gap in engineering discipline.

**Required owner decision.** No decision required from the owner; this is a pure engineering accountability defect. The governing rule (AC-06) is already in the constitution and is binding. The owner's role is only to approve the allocation of effort to close the gap (author the Module Boundary Spec, implement the cargo check, integrate into CI). If the team discovers that the current Rust workspace contains violations that would require significant refactoring to fix, the owner may decide whether to enforce the check immediately or to record the violating crates in an ADR with a migration timeline.

---

### ARCH-D17 — Bare-string package exports defeat deep-import boundary validation

**Maps to:** constitution Appendix A · A17 · governing rule AC-05 · raised in §6, §48 · closing book: Module Boundary Spec
**Related findings:** ARCH-D16
**Status:** Open · **Resolution:** none (record-only) · **Evidence verified:** CONFIRMED. All cited evidence verified against current source files: scripts/check-boundaries.mjs confirms the empty-Set return for string exports (lines 71–85); audit of 20 packages shows 14 with bare strings and 6 with explicit maps; c…

**Problem statement.** Fourteen of twenty packages in the workspace declare `exports` as a bare string (e.g., `"./src/index.ts"`), which causes the deep-import boundary checker to return an empty set of exported subpaths. Encapsulation therefore rests on the absence of deep-import specifiers rather than on a declared public contract, making it impossible to positively validate that internal subpaths are not being imported.

**Current implementation.** The boundary check script (scripts/check-boundaries.mjs, lines 71–85) contains the function `exportedSubpaths()` which explicitly returns an empty Set when the exports field is a string: `if (!exportsField || typeof exportsField === 'string') { return new Set(); }`. This means packages like @agiworkforce/ui (packages/ui/ui/package.json line 6, exports: "./src/index.ts"), @agiworkforce/compliance (packages/contracts/compliance/package.json line 7, exports: "./src/index.ts"), and twelve others cannot have their subpath exports validated. The boundary check (lines 177–187) only flags violations when a subpath import exists but is NOT in the declared exportedSubpaths set; with an empty set from a bare string, all deep imports that do occur are silently allowed.

**Proposed architecture (target — not a build order).** All workspace packages MUST declare their public surface using explicit exports maps (as objects with subpath keys) rather than bare-string root exports. Packages with only a root-level export should declare it as `{ ".": "./src/index.ts" }` to signal intentionality. Packages with multiple public subpaths should list them explicitly (e.g., @agiworkforce/utils with its `./async`, `./format`, `./privacy-handoff`, `./signaling`, `./uuidv7`, `./voice` exports). This change allows the deep-import boundary check to positively validate that all imports resolve to declared subpaths, converting encapsulation from a convention to a contract.

**Evidence.**

- scripts/check-boundaries.mjs:71–85 (exportedSubpaths function returns empty Set for string exports)
- packages/ui/ui/package.json:6 (exports: "./src/index.ts" — bare string)
- packages/contracts/compliance/package.json:7 (exports: "./src/index.ts" — bare string)
- packages/tools/mcp/package.json:6 (exports: "./src/index.ts" — bare string)
- packages/ai/provider-protocol/package.json:6 (exports: "./src/index.ts" — bare string)
- packages/ui/unified-chat/package.json:6 (exports: "./src/index.ts" — bare string)
- packages/platform/utils/package.json:6–13 (explicit exports map with 7 subpaths — this is the target pattern)
- packages/contracts/types/package.json:6–9 (explicit exports map with 2 subpaths — this is the target pattern)
- packages/client/client-runtime/package.json:6–12 (explicit exports map with 6 subpaths — this is the target pattern)
- docs/00-foundation/architecture-constitution.md:939 (AC-05 rule: deep imports MUST resolve to declared subpaths)
- docs/00-foundation/architecture-constitution.md:174 (constitutional note on the enforcement gap: bare-string exports prevent positive validation)

**Architectural rationale.** AC-05 and §6 of the Architecture Constitution establish that encapsulation MUST be a positive contract, not a convention. A package's public surface must be explicitly declared so that consumers can only import what the author intended to expose. Bare-string exports eliminate the ability to express intent — they signal only that everything under the root is public, with no granularity. This violates the principle that "a package MUST declare its public surface rather than relying on the mere absence of subpath specifiers." The deep-import rule exists to prevent architectural violations (apps/packages boundaries) from being evaded through undeclared internal paths; when the boundary checker cannot see what subpaths are intended to be public, it cannot enforce the rule, leaving the platform's module-boundary law unenforced for those packages.

**Alternatives considered.**

- 1. Accept the current state and document it as intentional divergence via an ADR: keep bare-string exports as a workspace convention, update the constitution to reflect reality, and record the decision that encapsulation is convention-based rather than contract-based. Risk: this weakens module boundaries and violates AC-05; it also conflicts with the Constitution's stated target (§6 line 174: 'packages SHOULD migrate to explicit exports maps').
- 2. Migrate incrementally: convert one package at a time, testing each migration with boundary-check runs. This reduces blast radius and allows discovery of any undeclared deep imports before the check becomes strict. Recommended.
- 3. Migrate all at once: bulk-convert all 14 bare-string packages in a single PR, run boundary checks, and address any violations. Faster, but risks discovering many violations at once.
- 4. Make the boundary checker lax for bare strings: instead of returning an empty set, allow any deep import to a package with bare-string exports. This avoids migration but abandons the AC-05 intent entirely.

**Benefits.**

- Encapsulation becomes a declared contract, not an inferred convention.
- Deep-import violations are detectable by the boundary checker for all packages, not just the 6 with explicit exports maps.
- Future maintainers cannot accidentally commit internal-path imports that violate architecture without noticing them in CI.
- The workspace model aligns with Node.js / TypeScript best practices (explicit exports maps are standard in modern TypeScript packages).
- Packages gain the ability to deprecate or move subpaths intentionally, with CI catching breakage.

**Risks.**

- Current code may contain deep imports to internal subpaths that are not yet declared; migration will surface these, requiring review and either declaration of the subpath as public or removal of the import. Mitigation: run a dependency-graph analysis before migration to enumerate all deep imports to each package.
- Declaring an internal subpath as public creates a maintenance obligation; removing or moving it later is a breaking change. Mitigation: document that adding a subpath to exports is a conscious decision and should be minimal.
- The migration is low-risk technically (exports declarations in package.json carry no runtime cost) but requires review discipline to ensure every subpath in the new exports map is intentional.

**Dependencies.**

- AC-05 and §6 of the Architecture Constitution (Module Boundaries)
- ARCH-D16 (Rust crate boundaries are unenforced) — related, different layer
- Module Boundary Spec (closure book for this finding)
- Workspace deep-import inventory (prerequisite: scan all source to enumerate current deep imports and resolve them to package/subpath)

**Migration considerations.** 1. Audit: scan the workspace for all deep imports to packages with bare-string exports using grep or a static analysis tool; enumerate which subpaths are actually imported and by whom. 2. Convert incrementally: pick one package (recommend @agiworkforce/utils or @agiworkforce/types as reference patterns already use explicit maps), declare all currently-imported subpaths in its exports, run the boundary check to confirm no violations, and review that all declared subpaths are intentional. 3. Repeat for each of the 14 packages. 4. Once all are migrated, consider making the boundary checker reject bare-string exports at CI-gate time (fail the build if any new package.json declares a string export). 5. Trust boundary: this change does not cross trust boundaries; it is a TypeScript workspace-internal refactor. 6. CI: boundary-check passes immediately post-migration if the audit step is thorough; no runtime behavior changes.

**Recommendation (for the owner — not a decision).** Migrate all 14 packages with bare-string exports to explicit exports maps, using the 6 packages with existing explicit maps (utils, types, runtime, design-tokens, react-native-worklets, react-native-worklets-stub) as reference implementations. Conduct a pre-migration audit to enumerate all deep imports to each package, declare those subpaths intentionally, and flag any that appear internal and should be converted to relative imports. Execute the migration incrementally (1–3 packages per PR) to allow review and catch violations early. Once complete, update the boundary checker to reject bare-string exports as a style violation (per AC-05 and §6) so future packages cannot be added with this pattern.

**Impact analysis.** Blast radius: all 20 packages in packages/; services/; potential impact on any code that imports from these packages. Users/surfaces: all TypeScript consumers across apps/, packages/, services/. Severity if unaddressed: medium. The current state allows silent architectural violations (undeclared deep imports) to pass CI, risking a consumer reaching into an internal path that moves or disappears later. The violation is not live today (no known broken imports), but the absence of tooling means new violations could be added without detection. Security: none — this is module organization, not a security boundary. Billing: none.

**Required owner decision.** Do you approve migrating all bare-string exports to explicit exports maps to close the AC-05 enforcement gap? (Recommended: yes. The constitution mandates this; the migration is low-risk and brings the workspace into alignment with modern TypeScript practices. If no: record an ADR declining the migration and update §6 to reflect the convention-based alternative.)

---

_This register is the handoff. Work is stopped here by design; resume by approving specific A-items or deciding specific D-items above._
