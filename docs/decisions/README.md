# Current Decisions

Status: Current
Owner: Founder + platform lead
Last reviewed: 2026-07-11
Last updated: 2026-09-03

This is the conflict-resolution index for current product and architecture decisions. It is intentionally shorter than the archived PRD corpus.

## Decision Sources

Current sources of truth:

- `docs/product/definition.md` - single product definition, v1 target, current repo position, parity baseline, P0 gaps, docs rule, and verification rule.
- `docs/product/requirements.md` - long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements.
- `docs/work/implementation-status.md` - feature, option, component, contract, surface, source, and current-status matrix for implementation agents.
- `docs/architecture/byok-provider-strategy.md` - BYOK provider classes, hosted open-model APIs, open model priorities, and Desktop model-selector rules.
- `docs/product/suite.md` - product thesis, surfaces, trust modes, and sync boundary.
- `docs/architecture/overview.md` - monorepo shape, runtime boundaries, provider strategy, generated files, and enterprise control plane.
- `docs/product/commercial.md` - Local/BYOK/Managed launch posture, waitlist, payment, and enterprise gates.
- `docs/development/agent-operability.md` - repo/docs/agent workflow rules.
- `PLAN.md` - active transition plan.
- `docs/work/restructure-execution-queue.md` - the dated execution queue (root `TODO.md` was retired in commit `906fe5cda`).
- `ARCHITECTURE.md` - the compact repository map.

Archived source material:

- The former `docs/archive/2026-05-21-docs-consolidation/` corpus (top-level PRD, mobile PRD, appendices, vision, roadmap, pricing, architecture, hosting, scaling, performance, ownership, handoff, and strategy docs) was removed from the working tree on 2026-06-28; retrieve from git history if needed.
- Archived docs can be mined for detail, but they do not override the `docs/` taxonomy, `PLAN.md`, or this file.

## Locked Decisions

1. AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app or CLI. The differentiation is local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute across Web, Desktop, Mobile, CLI, VS Code, and Chrome.
   Evidence: `docs/product/suite.md` (the 2026-05-20 application-suite thesis docs were removed from the working tree, git history only; the decision stands per this index).

2. Public brand is AGI. The formal platform name is AGI Workforce. Repo paths, package names, crates, database identifiers, and internal identifiers stay `agiworkforce`.
   Evidence: `ARCHITECTURE.md`, `README.md`, `docs/standards/naming-conventions.md` (the cited `memory/locks/` file never landed in-repo; this index is the lock).

3. The six-surface product boundary is Web, Desktop, Mobile, CLI, VS Code, and Chrome.
   Evidence: `docs/product/suite.md`, `docs/architecture/desktop.md`, `PLAN.md`.

4. Normal synced app chat is shared by Web, Mobile Cloud, and both Desktop Cloud shells. Chrome remains cloud-only and keeps `chrome.storage.local` authoritative, but every conversation whose turns all carry Managed Cloud provenance automatically mirrors into the same signed-in account conversation store so it is available on Web, Mobile Cloud, Tauri Cloud, and Electron Cloud. Unknown-provenance or any Local/BYOK turn fails closed and permanently disqualifies that Chrome conversation. CLI and VS Code remain local/workspace/task scoped unless the user explicitly hands off selected, redacted context. (Founder decision, 2026-08-13; supersedes Chrome's separate-store rule.)
   Evidence: `docs/product/suite.md`, `docs/architecture/trust-boundaries.md`, `apps/extension/docs/threat-model.md`.

5. Mobile v1 ships as Local + Cloud; Mobile does not expose BYOK (see `docs/product/definition.md` surface roles, updated 2026-07-08; the earlier "Local + explicit BYOK" mobile wording was stale). Managed Cloud / AGI Compute Credits / subscriptions are in public alpha and open by default (founder decision 2026-06-27); the private-beta/waitlist launch gate is removed and `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch only. Ledgering, payment rails, fraud, refund, chargeback, and provider-term controls must keep pace with public usage but no longer gate access; managed access stays subscription/entitlement-gated, and Local/BYOK are never silently routed into managed cloud. (Updated 2026-06-27: superseded the prior "remain waitlist or private beta until ... verified" wording.)
   Evidence: `docs/product/commercial.md`, `docs/product/suite.md` (the profit-first enterprise-readiness doc was retired in `906fe5cda`; git history only).

6. Local to BYOK is a fork, not a silent transfer or mode flip. The original Local thread remains local forever. The required flow is context selection, secret redaction, payload preview, provider label, and explicit consent.
   Evidence: `docs/product/suite.md`, `PLAN.md`.

7. SDKs are adapters, not architecture. AGI owns runtime schemas, event streams, privacy modes, provider routing, tool contracts, usage accounting, artifact manifests, and generated-file metadata.
   Evidence: `docs/architecture/overview.md` (the SDK-strategy audit doc was removed from the working tree; git history only).

8. Vercel AI Gateway and other managed proxy paths are never default for Local or strict BYOK. They can only be used behind explicit Managed labeling and consent.
   Evidence: `docs/architecture/overview.md`, `docs/product/commercial.md`.

9. Do not hardcode model IDs or provider capabilities. Use the shared model catalogs and provider metadata.
   Evidence: `packages/contracts/types/src/models.json`, `ARCHITECTURE.md` (the cited `memory/locks/` file never landed in-repo; this index is the lock).

10. Auto-routing must be explicit and explainable; silent model substitution is a rejected anti-pattern.
    Evidence: `docs/product/suite.md` (the cited `memory/locks/` auto-routing file never landed in-repo; this index is the lock).

11. One chat layout across six surfaces remains a non-regression rule.
    Evidence: `docs/product/suite.md`, `docs/architecture/desktop.md`.

12. `@agiworkforce/provider-protocol` is the canonical app-level cross-provider contract.
    Evidence: `ARCHITECTURE.md`, `packages/ai/provider-protocol/`, `docs/architecture/overview.md`.

13. Enterprise managed compute requires organization policy, audit logs, support workflow, usage ledger, provider cost snapshots, managed-credit controls, and release-fix traceability before public claims.
    Evidence: `docs/product/commercial.md`, `packages/contracts/types/src/enterprise/`, `apps/web/db/neon/` (the enterprise control-plane doc was retired in `906fe5cda`; git history only).

14. Documentation is current by default and lives in the `docs/` taxonomy described in `AGENTS.md`; historical material lives only in git history. If a live doc conflicts with historical material, the live doc wins.
    Evidence: `docs/README.md`, `docs/development/agent-operability.md`.

15. The primary CLI command is `agi`. `agiworkforce` remains a compatibility alias, not the preferred user-facing command. User docs and command examples should prefer `agi`; packages, crates, release archives, repo URLs, and existing `~/.agiworkforce` state paths keep `agiworkforce` unless a separate migration plan is approved.
    Evidence: `docs/standards/naming-conventions.md`, `apps/cli/Cargo.toml`, `apps/cli/npm/package.json`, `scripts/install.sh`.

16. Repo naming follows the locked engineering convention: root `PLAN.md` for strategy, `docs/work/` for dated execution queues, root `TODO.md` was retired in commit `906fe5cda`, `CHANGELOG.md` for completed work, durable knowledge in the `docs/` taxonomy described by `docs/README.md`, and evidence ledgers in the live root `audit/` directory. The former `reports/`, `tasks/`, and `docs/archive/` roots were removed on 2026-06-28 (git history only).
    Evidence: `docs/standards/naming-conventions.md`, `docs/development/agent-operability.md`, `scripts/check-structure-conventions.mjs`.

17. The cloud foundation is Clerk for managed identity and Neon for Postgres. The migration off Supabase is complete: no `@supabase`/Supabase client usage remains in app/package/service code, there is no root `supabase/` directory, and the canonical migrations live in `apps/web/db/neon`. Do not reintroduce Supabase or switch providers by docs-only claims. (Updated 2026-06-27: superseded the prior "production stays on Supabase until verified" wording, which was stale.)
    Evidence: `packages/platform/data-layer/src/adapters/clerk.ts`, `packages/platform/data-layer/src/adapters/neon.ts`, `apps/web/db/neon/`, `apps/web/.env.example`.

18. `docs/product/definition.md` is the first product read for agents and humans, and `docs/work/implementation-status.md` is the first implementation read for feature/component parity. Older PRDs, generated parity reports, removed corpora retrievable only from git history (`tasks/**`, `reports/**`, `docs/archive/**`), and local screenshot/reference corpora are evidence or working notes unless current docs explicitly promote a conclusion.
    Evidence: `docs/product/definition.md`, `docs/work/implementation-status.md`, `docs/README.md`, `docs/agent-context/doc-status.json`.

19. BYOK provider/model work must use provider-plus-model-plus-capability metadata, not model names alone. `docs/architecture/byok-provider-strategy.md` is the current priority map for direct provider keys, hosted open-model APIs, local runtimes, model families, and Desktop model-selector grouping.
    Evidence: `docs/architecture/byok-provider-strategy.md`, `packages/contracts/types/src/models.json`, `docs/architecture/provider-routing.md`.

20. Surface completion ordering (updated 2026-08-05, founder decision, supersedes both the 2026-07-11 serial order "Mobile, Website, Desktop, CLI, Chrome, VS Code" and the 2026-08-01 "Desktop to zero first" note): the six surfaces are completed shortest-remaining-work-first, estimate remaining Class-1 (partial/unwired/stub/broken) work per surface, complete the fastest surface first, then the next fastest, until all six are at zero. The routing substrate (registry dated pricing + cache-write billing, ExecutionPlan/CPST design, CPST telemetry, rules-based router) completes before surface closure begins. The Electron cloud-only desktop shell is in scope for the completion bar alongside Tauri (founder decision 2026-08-05). The mobile README's 2026-08-06 target date no longer implies mobile-first ordering.
    Evidence: `docs/work/implementation-status.md` (2026-08-05 founder decisions section), `audit/capability-gaps.csv` (CAP-045..CAP-047), apps/mobile/README.md.

21. BYOK tool orchestration defaults to Native First when BYOK is active and the selected provider/model supports native tools, but only with visible provider/model/tool labels, retention/cost disclosure, and consent for risky payloads. Native First never applies to Local mode.
    Evidence: `docs/product/requirements.md`, `docs/architecture/byok-provider-strategy.md`.

22. Managed-Cloud pricing/metering reconciliation (founder decision, 2026-07-11, supersedes the 2026-06-30 ladder wherever it was cited as Free/Basic $8/Pro/Max/Enterprise with no Team and no top-ups). Subscriptions are globally available (founder, 2026-08-05): USD is the global default currency with founder-set INR amounts for India, and additional Stripe currency options may be added without changing availability. No market is excluded. The subscription ladder is Free / Basic ($7/mo USD globally, ₹399/mo in India, Stripe-purchasable on Web today as the live primary path; Mobile adds IAP per Apple 3.1.1 when StoreKit MS-5 ships with real store products, after which Web keeps Stripe. Updated 2026-08-05, superseding the earlier "IAP-first / Stripe dormant" wording) / Pro ($20/mo, $200/yr) / Max ($100/mo and $200/mo, monthly-only) / Team ($25/seat/mo, $240/seat/yr, founder-confirmed 2026-08-05, superseding both the earlier $30/$299 figure and the 2026-08-04 Pro-pinned $20 working-tree value; reinstated as a real, separate per-seat tier between Max and Enterprise, not "served by Enterprise"; yearly checkout wiring is a tracked web Class-1 item) / Enterprise (custom). Metering is token/value-based (a micro-dollar ledger, never flat prompt counts), displayed to users as credits everywhere except at actual Stripe checkout; internal ledgering stays cents/micro-dollars. Credit top-ups are enabled for active paid Stripe tiers: opt-in and off by default, 50 public top-up units per $1, whole-dollar purchases with a $10 minimum and ordinary $100 self-serve cap, and 12-month balance expiry. This 2026-08-11 founder decision supersedes the former per-tier payout-parity rule and the prior no-top-ups policy. No discount anchors of any kind (no strikethroughs, no "% off," no "was $X"); flat prices, with real annual options on Pro/Team framed honestly. Web search is a server-side tool offered wherever a model supports tool-calling and a deployment has search available; the `capabilities.search` flag in `models.json` denotes provider-native grounding only, a narrower and separate concept from server-offered search. E2B code-execution is enabled-by-decision for production (staged behind `AGI_E2B_EXECUTION` plus a key; activates when the branch ships; unsetting the flag is the kill-switch). Sonnet 5 is billed to users at the founder-selected standard $3/$15 per MTok regardless of Anthropic's introductory provider pricing (reaffirmed 2026-08-05, restoring the 2026-07-15/2026-07-18 catalog pins after a slice briefly reversed them): provider intro/promo windows are provider-cost facts, never product prices; the catalog's dated-pricing mechanism exists for real product price changes only. This Sonnet 5 pin is retired 2026-09-03 by founder instruction. Anthropic reclassified $2/$10 per MTok as its permanent standard price and cancelled the scheduled increase to $3/$15, so the provider-cost-versus-product-price premise no longer holds. Sonnet 5 now bills users at $2/$10 per MTok with cache read $0.20, 5m write $2.50, and 1h write $4.00, tracking Anthropic's published rate.
    Evidence: `docs/product/definition.md` (billing plan table), `packages/contracts/types/src/billing-catalog.ts`, `apps/web/lib/pricing.ts` (the originally cited tier-metering plan, unit-economics doc, and products README were retired in `906fe5cda`; git history only. Team $25/$240 confirmed by founder 2026-08-05). Sonnet 5 retirement: `packages/ai/model-registry/catalog/models.curation.json` (the Anthropic default-model entry's costOverride field), `packages/ai/model-registry/tests/catalog-policy.test.mjs`.

23. Routing thesis (founder, 2026-08-05): Different model, provider, reasoning-effort, tool-harness, and deployment configurations occupy different points on the quality–cost–latency frontier. AGI Workforce selects and governs the cheapest configuration that meets a measurable task-specific quality threshold. Implementation contract: routing selects an ExecutionPlan (model snapshot, provider endpoint, reasoning effort, service tier, execution location, harness version, cache policy, verifier, fallback policy, budget, approval policy), never a bare model name; quality thresholds are task-family-specific and measured (CPST plus the eval corpus, per the design doc); hard constraints, trust mode, capability, tier entitlement, latency lane, tenant policy, filter candidates before any cost ranking; auto-routing stays explicit and explainable per Decision #10.
    Evidence: `docs/architecture/execution-plan-contract.md`, `crates/agiworkforce-model-registry/src/lib.rs`, `docs/work/implementation-status.md` (2026-08-05 founder decisions section).

## Outdated Or Historical

- Former top-level PRD, mobile PRD, appendices, vision, roadmap, pricing, architecture, hosting, scaling, performance, ownership, handoff, and strategy docs were removed with `docs/archive/` on 2026-06-28 and are retrievable only from git history.
- The `memory/locks/` pricing and BYOK lock files cited by older docs never landed in-repo; their surviving conclusions are captured by this index (Decisions #19 and #22) and do not make AGI-managed cloud or credits part of mobile v1.
- On silent routing, the governing statement is Decision #10 in this index (the older `memory/locks/` auto-routing files never landed in-repo).
- Git-history-only material (`docs/archive/**`, `tasks/**`) and generated audit reports are evidence only unless a current doc explicitly promotes a conclusion.

## Conflict Rule

If a current doc conflicts with code, verify code behavior first, then update the doc and decision index in the same change. If archived material conflicts with current docs, do not patch the archive; update current docs only when the current decision itself changes.
