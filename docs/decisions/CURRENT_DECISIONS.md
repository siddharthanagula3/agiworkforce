# Current Decisions

Status: Current
Owner: Founder + platform lead
Last reviewed: 2026-07-11
Last updated: 2026-07-11

This is the conflict-resolution index for current product and architecture decisions. It is intentionally shorter than the archived PRD corpus.

## Decision Sources

Current sources of truth:

- `docs/current/source-of-truth.md` - single product definition, v1 target, current repo position, parity baseline, P0 gaps, docs rule, and verification rule.
- `docs/current/agi-product-requirements.md` - long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements.
- `docs/current/parity-implementation-matrix.md` - feature, option, component, contract, surface, source, and current-status matrix for implementation agents.
- `docs/current/byok-open-model-provider-strategy.md` - BYOK provider classes, hosted open-model APIs, open model priorities, and Desktop model-selector rules.
- `docs/current/product-suite.md` - product thesis, surfaces, trust modes, and sync boundary.
- `docs/current/technical-architecture.md` - monorepo shape, runtime boundaries, provider strategy, generated files, and enterprise control plane.
- `docs/current/commercial-and-launch.md` - Local/BYOK/Managed launch posture, waitlist, payment, and enterprise gates.
- `docs/current/agent-and-repo-operability.md` - repo/docs/agent workflow rules.
- `PLAN.md` - active transition plan.
- `TODO.md` - active execution queue.
- `AGI_WORKFORCE.md` - broad platform snapshot and entry point.

Archived source material:

- `docs/archive/2026-05-21-docs-consolidation/` contains the former top-level PRD, mobile PRD, appendices, vision, roadmap, pricing, architecture, hosting, scaling, performance, ownership, handoff, and strategy docs.
- Archived docs can be mined for detail, but they do not override `docs/current/`, `PLAN.md`, `TODO.md`, or this file.

## Locked Decisions

1. AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app or CLI. The differentiation is local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute across Web, Desktop, Mobile, CLI, VS Code, and Chrome.
   Evidence: `docs/current/product-suite.md`, `docs/decisions/2026-05-20-openai-anthropic-application-suite-thesis.md`, `audit/anthropic-apps-parity/application-suite-thesis-2026-05-20.md`.

2. Public brand is AGI. The formal platform name is AGI Workforce. Repo paths, package names, crates, database identifiers, and internal identifiers stay `agiworkforce`.
   Evidence: `AGI_WORKFORCE.md`, `README.md`, `docs/engineering/naming-conventions.md`, `memory/locks/brand-agi-2026-05-15.md`.

3. The six-surface product boundary is Web, Desktop, Mobile, CLI, VS Code, and Chrome.
   Evidence: `docs/current/product-suite.md`, `docs/surfaces/*.md`, `PLAN.md`.

4. Normal synced app chat is only for Web, Mobile, and Desktop. CLI, VS Code, and Chrome stay local/workspace/task scoped unless the user explicitly hands off selected, redacted context into a synced app chat.
   Evidence: `docs/current/product-suite.md`, `PLAN.md`, `TODO.md`.

5. Mobile v1 ships as Local + Cloud; Mobile does not expose BYOK (see `docs/current/source-of-truth.md` surface roles — updated 2026-07-08; the earlier "Local + explicit BYOK" mobile wording was stale). Managed Cloud / AGI Compute Credits / subscriptions are in public alpha and open by default (founder decision 2026-06-27); the private-beta/waitlist launch gate is removed and `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch only. Ledgering, payment rails, fraud, refund, chargeback, and provider-term controls must keep pace with public usage but no longer gate access; managed access stays subscription/entitlement-gated, and Local/BYOK are never silently routed into managed cloud. (Updated 2026-06-27: superseded the prior "remain waitlist or private beta until ... verified" wording.)
   Evidence: `docs/current/commercial-and-launch.md`, `docs/current/product-suite.md`, `docs/enterprise/profit-first-enterprise-readiness.md`.

6. Local to BYOK is a fork, not a silent transfer or mode flip. The original Local thread remains local forever. The required flow is context selection, secret redaction, payload preview, provider label, and explicit consent.
   Evidence: `docs/current/product-suite.md`, `PLAN.md`, `TODO.md`.

7. SDKs are adapters, not architecture. AGI owns runtime schemas, event streams, privacy modes, provider routing, tool contracts, usage accounting, artifact manifests, and generated-file metadata.
   Evidence: `docs/current/technical-architecture.md`, `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`.

8. Vercel AI Gateway and other managed proxy paths are never default for Local or strict BYOK. They can only be used behind explicit Managed labeling and consent.
   Evidence: `docs/current/technical-architecture.md`, `docs/current/commercial-and-launch.md`.

9. Do not hardcode model IDs or provider capabilities. Use the shared model catalogs and provider metadata.
   Evidence: `packages/contracts/types/src/models.json`, `AGI_WORKFORCE.md`, `memory/locks/rule-models-json-canonical.md`.

10. Auto-routing must be explicit and explainable; silent model substitution is a rejected anti-pattern.
    Evidence: `docs/current/product-suite.md`, `memory/locks/auto-routing-decision-2026-05-16.md`.

11. One chat layout across six surfaces remains a non-regression rule.
    Evidence: `docs/current/product-suite.md`, `docs/design/design-spec-2026-05-15.md`, `docs/surfaces/*.md`.

12. `@agiworkforce/provider-protocol` is the canonical app-level cross-provider contract.
    Evidence: `AGI_WORKFORCE.md`, `packages/ai/provider-protocol/`, `docs/current/technical-architecture.md`.

13. Enterprise managed compute requires organization policy, audit logs, support workflow, usage ledger, provider cost snapshots, managed-credit controls, and release-fix traceability before public claims.
    Evidence: `docs/current/commercial-and-launch.md`, `docs/enterprise/control-plane.md`, `packages/contracts/types/src/enterprise/`, `apps/web/db/neon/`.

14. Current docs live in `docs/current/`; historical docs live in `docs/archive`. If they conflict, current docs win.
    Evidence: `docs/current/README.md`, `docs/current/agent-and-repo-operability.md`.

15. The primary CLI command is `agi`. `agiworkforce` remains a compatibility alias, not the preferred user-facing command. User docs and command examples should prefer `agi`; packages, crates, release archives, repo URLs, and existing `~/.agiworkforce` state paths keep `agiworkforce` unless a separate migration plan is approved.
    Evidence: `docs/engineering/naming-conventions.md`, `apps/cli/Cargo.toml`, `apps/cli/npm/package.json`, `scripts/install.sh`.

16. Repo naming follows the locked engineering convention: root `PLAN.md` for strategy, `TODO.md` for active work, `CHANGELOG.md` for completed work, current docs in `docs/current`, plans in `docs/plans`, evidence in `audit`, generated reports in `reports`, and historical material in `docs/archive`.
    Evidence: `docs/engineering/naming-conventions.md`, `docs/current/agent-and-repo-operability.md`, `scripts/check-structure-conventions.mjs`.

17. The cloud foundation is Clerk for managed identity and Neon for Postgres. The migration off Supabase is complete: no `@supabase`/Supabase client usage remains in app/package/service code, there is no root `supabase/` directory, and the canonical migrations live in `apps/web/db/neon`. Do not reintroduce Supabase or switch providers by docs-only claims. (Updated 2026-06-27: superseded the prior "production stays on Supabase until verified" wording, which was stale.)
    Evidence: `packages/platform/data-layer/src/adapters/clerk.ts`, `packages/platform/data-layer/src/adapters/neon.ts`, `apps/web/db/neon/`, `packages/platform/data-layer/README.md`, `apps/web/.env.example`.

18. `docs/current/source-of-truth.md` is the first product read for agents and humans, and `docs/current/parity-implementation-matrix.md` is the first implementation read for feature/component parity. Older PRDs, generated parity reports, `tasks/**`, `reports/**`, `docs/archive/**`, and local screenshot/reference corpora are evidence or working notes unless current docs explicitly promote a conclusion.
    Evidence: `docs/current/source-of-truth.md`, `docs/current/parity-implementation-matrix.md`, `docs/current/README.md`, `docs/agent-context/doc-status.json`.

19. BYOK provider/model work must use provider-plus-model-plus-capability metadata, not model names alone. `docs/current/byok-open-model-provider-strategy.md` is the current priority map for direct provider keys, hosted open-model APIs, local runtimes, model families, and Desktop model-selector grouping.
    Evidence: `docs/current/byok-open-model-provider-strategy.md`, `packages/contracts/types/src/models.json`, `docs/current/provider-capability-matrix.md`.

20. Development is serial by surface: Mobile, Website, Desktop, CLI, Chrome Extension, then VS Code Extension. The active surface is Mobile, and normal Website work does not begin until Mobile v1 is publicly released on the App Store. During QA, testing, App Store review, or other manual waiting periods, next-surface work can start only when the founder explicitly asks for it.
    Evidence: `docs/current/agi-product-requirements.md`, `docs/current/source-of-truth.md`.

21. BYOK tool orchestration defaults to Native First when BYOK is active and the selected provider/model supports native tools, but only with visible provider/model/tool labels, retention/cost disclosure, and consent for risky payloads. Native First never applies to Local mode.
    Evidence: `docs/current/agi-product-requirements.md`, `docs/current/byok-open-model-provider-strategy.md`.

22. Managed-Cloud pricing/metering reconciliation (founder decision, 2026-07-11 — supersedes the 2026-06-30 ladder wherever it was cited as Free/Basic $8/Pro/Max/Enterprise with no Team and no top-ups). The subscription ladder is Free / Basic ($7/mo US, ₹399/mo India, IAP-first — purchasable only via App Store/Play Store, with Stripe USD/INR test prices kept as a dormant fallback) / Pro ($20/mo, $200/yr) / Max ($100/mo and $200/mo, monthly-only) / Team ($30/seat/mo, $299/seat/yr — reinstated as a real, separate per-seat tier between Max and Enterprise, not "served by Enterprise") / Enterprise (custom). Metering is token/value-based (a micro-dollar ledger, never flat prompt counts), displayed to users as credits everywhere except at actual Stripe checkout; internal ledgering stays cents/micro-dollars. Credit top-ups are enabled for paid tiers: opt-in, off by default, capped (~5x plan price or $100, user-raisable), 12-month expiry, with per-tier payout parity (a tier's top-up credits-per-$ matches its subscription credits-per-$) — this supersedes the prior no-top-ups policy. No discount anchors of any kind (no strikethroughs, no "% off," no "was $X"); flat prices, with real annual options on Pro/Team framed honestly. Web search is a server-side tool offered wherever a model supports tool-calling and a deployment has search available; the `capabilities.search` flag in `models.json` denotes provider-native grounding only, a narrower and separate concept from server-offered search. E2B code-execution is enabled-by-decision for production (staged behind `AGI_E2B_EXECUTION` plus a key; activates when the branch ships; unsetting the flag is the kill-switch).
    Evidence: `docs/plans/tier-metering-reconciliation-wave2-2026-07-11.md`, `docs/current/unit-economics-and-pricing-model.md`, `docs/products/README.md`.

## Outdated Or Historical

- Former top-level PRD, mobile PRD, appendices, vision, roadmap, pricing, architecture, hosting, scaling, performance, ownership, handoff, and strategy docs are archived under `docs/archive/2026-05-21-docs-consolidation/`.
- `memory/locks/byok-first-launch-2026-05-16.md`, `subscription-tiers-2026-05-15.md`, and `pricing-billing-decisions-2026-05-16.md` remain platform-pricing evidence, but they do not make AGI-managed cloud or credits part of mobile v1.
- `memory/locks/auto-routing-spec-2026-05-07.md` is superseded on silent routing by `memory/locks/auto-routing-decision-2026-05-16.md`.
- `docs/archive/**`, `tasks/**`, and generated audit reports are evidence unless a current doc explicitly promotes a conclusion.

## Conflict Rule

If a current doc conflicts with code, verify code behavior first, then update the doc and decision index in the same change. If archived material conflicts with current docs, do not patch the archive; update current docs only when the current decision itself changes.
