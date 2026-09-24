# Current Decisions

Status: Current
Owner: Founder + platform lead
Last reviewed: 2026-09-22
Last updated: 2026-09-22

This is the conflict-resolution index for current product and architecture decisions. It is intentionally shorter than the archived PRD corpus.

## Decision Sources

Current sources of truth:

- `docs/product/definition.md` - single product definition, v1 target, current repo position, parity baseline, P0 gaps, docs rule, and verification rule.
- `docs/product/requirements.md` - long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements.
- `docs/work/implementation-status.md` - feature, option, component, contract, surface, source, and current-status matrix for implementation agents.
- `docs/architecture/byok-provider-strategy.md` - BYOK provider classes, hosted open-model APIs, open model priorities, and developer-surface model-selector rules.
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

4. Normal synced app chat is shared by Web, Mobile Cloud, and the public Electron Desktop. Chrome remains cloud-only and keeps `chrome.storage.local` authoritative, but every conversation whose turns all carry Managed Cloud provenance automatically mirrors into the same signed-in account conversation store so it is available on Web, Mobile Cloud, and Desktop. Unknown-provenance or any Local/BYOK turn fails closed and permanently disqualifies that Chrome conversation. CLI and VS Code remain local/workspace/task scoped unless the user explicitly hands off selected, redacted context. D-2026-09-15-04 supersedes the earlier two-Desktop-shell language.
   Evidence: `docs/product/suite.md`, `docs/architecture/trust-boundaries.md`, `apps/extension/docs/threat-model.md`.

5. Mobile v1 ships as Local + Cloud; Mobile does not expose BYOK. Managed Free
   is public alpha and enabled after sign-in (founder decision 2026-06-27).
   Paid upgrades remain waitlist/access-code gated (founder clarification
   2026-09-21), while existing paid entitlements continue to resolve across the
   suite. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response
   kill-switch only. Ledgering and abuse controls keep pace with Free usage;
   payment, fraud, refund, chargeback, and provider-term evidence gate opening
   self-serve paid acquisition. Local/BYOK are never silently routed into
   managed cloud.
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

19. BYOK provider/model work must use provider-plus-model-plus-capability metadata, not model names alone. `docs/architecture/byok-provider-strategy.md` is the current priority map for direct provider keys, hosted open-model APIs, local runtimes, model families, and developer-surface model-selector grouping. The public Electron Desktop accepts no provider key.
    Evidence: `docs/architecture/byok-provider-strategy.md`, `packages/contracts/types/src/models.json`, `docs/architecture/provider-routing.md`.

20. Surface completion ordering (updated 2026-09-21, founder decision): work
    proceeds one platform at a time in this order: Website, Mobile, Desktop,
    Chrome, CLI, VS Code. The active platform must pass its release gates before
    the next begins, except for shared-contract work required by the active
    platform. Connection verification follows each surface pass. This
    supersedes the 2026-08-05 shortest-remaining-work-first order, the
    2026-08-01 Desktop-first note, the 2026-07-11 Mobile-first sequence, and the
    2026-08-09 cross-surface capability exception. The routing substrate remains
    shared prerequisite work. D-2026-09-15-04 makes Electron the sole public
    Desktop; retained Tauri work is not part of the public Desktop completion
    claim.
    Evidence: `docs/product/definition.md`, `docs/product/requirements.md`,
    `docs/specs/website-launch/AGENT_GOAL.md`.

21. BYOK tool orchestration defaults to Native First when BYOK is active and the selected provider/model supports native tools, but only with visible provider/model/tool labels, retention/cost disclosure, and consent for risky payloads. Native First never applies to Local mode.
    Evidence: `docs/product/requirements.md`, `docs/architecture/byok-provider-strategy.md`.

22. Managed-Cloud pricing/metering reconciliation (founder decision,
    2026-07-11, with the acquisition clarification of 2026-09-21): the billing
    catalog and checkout infrastructure define supported plans, currencies,
    proration, top-ups, and accounting, but they do not by themselves open
    purchasing. Free access is available after sign-in; new paid subscriptions
    and upgrades remain waitlist/access-code gated until the founder opens
    self-serve acquisition. Existing paid entitlements remain valid across all
    six surfaces. Current prices and model costs come from executable catalogs,
    not this decision prose. Metering is value-based; user-facing usage follows
    the shared percentage/reset-time contract except where an actual purchase
    must show its denomination. Web search and code execution remain separately
    capability-, deployment-, policy-, and trust-gated.
    Evidence: `docs/product/definition.md` (billing plan table), `packages/contracts/types/src/billing-catalog.ts`, `apps/web/lib/pricing.ts` (the originally cited tier-metering plan, unit-economics doc, and products README were retired in `906fe5cda`; git history only. Team $25/$240 confirmed by founder 2026-08-05). Sonnet 5 retirement: `packages/ai/model-registry/catalog/models.curation.json` (the Anthropic default-model entry's costOverride field), `packages/ai/model-registry/tests/catalog-policy.test.mjs`.

23. Routing thesis (founder, 2026-08-05): Different model, provider, reasoning-effort, tool-harness, and deployment configurations occupy different points on the quality–cost–latency frontier. AGI Workforce selects and governs the cheapest configuration that meets a measurable task-specific quality threshold. Implementation contract: routing selects an ExecutionPlan (model snapshot, provider endpoint, reasoning effort, service tier, execution location, harness version, cache policy, verifier, fallback policy, budget, approval policy), never a bare model name; quality thresholds are task-family-specific and measured (CPST plus the eval corpus, per the design doc); hard constraints, trust mode, capability, tier entitlement, latency lane, tenant policy, filter candidates before any cost ranking; auto-routing stays explicit and explainable per Decision #10.
    Evidence: `docs/architecture/execution-plan-contract.md`, `crates/agiworkforce-model-registry/src/lib.rs`, `docs/work/implementation-status.md` (2026-08-05 founder decisions section).

24. Ecosystem continuity (founder clarification 2026-09-21): one account and
    one effective entitlement span all six surfaces. Web, Mobile Cloud, Desktop
    Cloud, and eligible Chrome Managed Cloud share the Account Cloud objects.
    Desktop Code, CLI, and VS Code share host-owned local sessions, tools,
    permissions, files, and credential references. Desktop bridges the two only
    through an explicit, provenance-preserving, secret-scanned handoff. The
    product takes capability/workflow references from ChatGPT and Claude but
    does not copy their branding, layouts, assets, or private implementation.
    Evidence: `docs/product/definition.md`,
    `docs/product/experience-contract.md`,
    `docs/research/chatgpt-claude-ecosystem-delta-2026-09-21.md`.

25. Web v1 keeps a strict per-request nonce CSP and accepts dynamic rendering
    as its security cost. Do not replace the nonce with `unsafe-inline`, weaken
    the policy to regain static generation, or change the production bundler
    solely for this optimization. The current Next.js 16.3.5 CSP guide says
    nonce CSP requires dynamic rendering and identifies experimental App
    Router SRI as the static alternative. The guide no longer carries the
    older webpack-only restriction, and the installed Next config accepts the
    SRI option, but SRI remains experimental and does not handle dynamically
    generated scripts. Revisit when the path is stable and a production
    measurement shows that server rendering is material; any migration must
    preserve strict script/style enforcement and pass production CSP,
    hydration, identity, analytics-consent and public-route cache tests.
    Evidence: `apps/web/proxy.ts`, `apps/web/app/layout.tsx`, installed
    `next@16.3.5` documentation and schema, and the [official Next.js CSP
    guide](https://nextjs.org/docs/app/guides/content-security-policy), reviewed
    2026-09-22.

26. Web v1 support is the help centre, signed-in tickets and direct email to
    `contact@agiworkforce.com`. The dormant AI assistant and live-handoff widget
    are not launch scope and must not mount or enter a public bundle merely
    because their source exists. The signed-in account menu exposes the direct
    mail channel in two clicks; Free through Max promise no response time.
    Shipping the widget later requires complete endpoints, safe abstention for
    prices, plan entitlements and account state, configured staff notification
    and fallback email, and an exercised operator handoff. Code can verify the
    route and address but not that a person watches the inbox, so confirmed
    monitoring remains a founder-operated Web launch gate.
    Evidence: `apps/web/shared/components/layout/AccountMenuItems.tsx`,
    `apps/web/e2e/support-entry.spec.ts`, `docs/runbooks/support-operations.md`
    and `docs/work/founder-assistance.md`.

27. Web v1 retains the provider-first-chunk peek on direct adapter responses.
    It preserves provider HTTP status and lets managed failover rotate before
    response headers are committed. The standard managed-chat workflow already
    opens its durable response independently of visible model text, and three
    zero-cost configured free-router localhost samples on 2026-09-22 measured
    fetch-to-first-chunk at 6,135 ms with cold development compilation, then
    1,124 ms and 813 ms warm. The two warm samples reached the first-paint proxy
    at 2,635 ms and 2,016 ms. That evidence does not justify replacing real
    HTTP/provider errors with in-band SSE errors. Revisit only with deployed
    intermediary timeout evidence or a production-like SLO breach; retain the
    direct-path failure and failover semantics in any alternative.
    Evidence: `apps/web/e2e/chat-live-latency.spec.ts`,
    `apps/web/lib/client/chat-latency.ts`,
    `apps/web/app/api/llm/v1/chat/completions/route.ts` and WEB-053 in
    `WEB_PUBLIC_RELEASE_AUDIT.md`.

28. Plain managed chat gives the durable workflow 500 ms to produce its first
    event. If that opening budget expires, the route cancels the durable start
    before beginning the inline fallback and opens the shared cooldown. It must
    not race durable and inline provider execution: doing so can duplicate tool
    effects, usage settlement and provider spend. AGI Work keeps its durable
    execution contract and is not converted into an inline turn by this chat
    latency budget. The browser stream contract disables intermediary buffering
    and emits a heartbeat every 2 seconds; arrived content is held for at most
    one animation frame, never paced for presentation. Authenticated localhost
    evidence on 2026-09-22 measured the durable first event at 26 ms, route
    response at 331 ms, browser fetch-to-first-chunk at 375 ms and completion at
    2,137 ms on a zero-cost configured free-router turn.
    Evidence: `apps/web/lib/workflows/durable-stream-liveness.ts`,
    `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts`,
    `apps/web/lib/client/frame-coalesced-appender.ts`,
    `apps/web/e2e/chat-live-latency.spec.ts` and WEB-100 to WEB-102 in
    `WEB_PUBLIC_RELEASE_AUDIT.md`.

## Outdated Or Historical

- Former top-level PRD, mobile PRD, appendices, vision, roadmap, pricing, architecture, hosting, scaling, performance, ownership, handoff, and strategy docs were removed with `docs/archive/` on 2026-06-28 and are retrievable only from git history.
- The `memory/locks/` pricing and BYOK lock files cited by older docs never landed in-repo; their surviving conclusions are captured by this index (Decisions #19 and #22) and do not make AGI-managed cloud or credits part of mobile v1.
- On silent routing, the governing statement is Decision #10 in this index (the older `memory/locks/` auto-routing files never landed in-repo).
- Git-history-only material (`docs/archive/**`, `tasks/**`) and generated audit reports are evidence only unless a current doc explicitly promotes a conclusion.

## Conflict Rule

If a current doc conflicts with code, verify code behavior first, then update the doc and decision index in the same change. If archived material conflicts with current docs, do not patch the archive; update current docs only when the current decision itself changes.
