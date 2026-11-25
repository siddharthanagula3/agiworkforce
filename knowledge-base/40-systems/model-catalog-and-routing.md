---
id: "SYS-model-catalog-and-routing"
type: "system"
title: "Model catalog and routing"
basis: "code inspection and project documents"
second_reader: "challenged and corrected; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Model catalog and routing

Models come from one generated catalog (curated JSON compiled into a registry for TypeScript and Rust). Family slots say which generation is live. Auto picks a model per message from plan, task, capability, privacy rules, health and expected cost. Manual choice is plan-gated. Each app warns or falls back when a model lacks an ability. Two resolvers (TypeScript, Rust) share one policy and a conformance fixture. Review update: 8 of 28 live family defaults were promoted without the eval gate, and 27 of 28 family fallback chains are empty. Local needs no account (Mobile after its age confirmation, CLI, VS Code); the Local Mode plan is listed for web, desktop and mobile in the plan table only, and web and the public Electron Desktop have no Local mode.

## What it is and why it exists

This page covers how AGI Workforce lists models and chooses one for each message. It supports two requirements: the product is **model agnostic** (one experience over many models) and **provider agnostic** (many inference hosts, none required). [requirement] (AGENTS.md:§4, §7; docs/architecture/provider-routing.md:7-10)

**Plain terms**
- *Catalog*: the list of models with their facts (price, limits, abilities). Hand-edited input is `packages/ai/model-registry/catalog/models.curation.json`; the compiler writes the generated files. [code] (packages/ai/model-registry/scripts/compile.mjs:35-58; AGENTS.md:§4)
- *Registry*: the compiled catalog plus routes, harnesses, runtime profiles and Auto policy. [code] (packages/ai/model-registry/generated/registry.ts)
- *Family slot*: a named seat such as "the balanced model of one vendor". The slot, not the code, says which generation sits in it. [code] (packages/ai/model-registry/catalog/model-families.json)
- *Route*: one way to serve a model (a provider host plus a harness, which is the adapter that talks to that host). The same model can have several routes at different prices. [code] (packages/contracts/types/src/model-catalog.ts:143-162; docs/architecture/provider-routing.md:36-58)
- *Trust mode*: where a request may run. The code names `local`, `on_device`, `byok` (own key) and `managed_cloud`. The product modes are mode:local, mode:own-key and mode:cloud. [code] (packages/ai/routing/src/auto.ts:36)
- *Auto*: the default choice. The router picks a model for every message. *Manual*: the user names a model. [code] (packages/ai/routing/src/auto.ts:1722-1760)
- *Slot* in Auto policy: a named preference such as a cheap general slot or a coding slot, listed in `routing-policies.json`. There are 47 of them. [code] (packages/ai/model-registry/catalog/routing-policies.json, auto.slots)

The rule is that no consumer keeps its own copy of model data, and a model ID may be a literal only inside the catalog. [requirement] (AGENTS.md:§3, §4)

Sources of truth, highest rank first: generated registry and policy JSON, then the resolver code, then tests, then prose. Where this page and a doc disagree, the code wins. [requirement] (AGENTS.md:§2)

## How it works today

### 1. Build the catalog
1. A person edits `packages/ai/model-registry/catalog/models.curation.json` (and the other catalog files: routes, harnesses, gateways, developers, governance, retired models, routing policies, family slots). [code] (packages/ai/model-registry/scripts/compile.mjs:40-58)
2. `pnpm sync:models` runs the compiler. It checks the output against `schema/registry.schema.json` with Ajv, resolves `family:<provider>/<family>` references to the live model, and writes: `packages/ai/model-registry/generated/registry.json` and `registry.ts`, `packages/contracts/types/src/models.json`, and Rust mirrors in `crates/agiworkforce-protocol/src/generated/` and `crates/agiworkforce-model-registry/src/generated/`. [code] (compile.mjs:26-31,40-79,135-146; package.json:386-388)
3. `pnpm sync:models:check` fails when generated files drift. Never hand-edit `models.json`. [requirement] (AGENTS.md:§4) [code] (packages/ai/model-registry/package.json scripts)
4. Guards fail an inline model-ID literal: `check:model-id-literals` (TS/JS) and a Rust script. [code] (package.json:219; AGENTS.md:§4)

The generated registry today has 394 models, 463 routes, 38 harnesses and 15 runtime profiles (counted by reading `generated/registry.json` for this page; this is a snapshot, not a stable fact). [executed-by-reading, not a test run] 389 models are `live`.

### 2. Capability data per model
Every model carries one fixed vocabulary of 22 capability names (text/image/audio/video in and out, streaming, structured output, function calling, reasoning, image editing, realtime, reranking, tool schema support, computer use, agentic, web search, deep research, code execution, prompt caching). `null` means "not verified" and consumers treat it as not offered. [code] (packages/ai/model-registry/schema/registry.schema.json:729-800)

The registry splits these into **intrinsic** (about the model) and **route-dependent** (needs a provider route or an AGI harness, so never sufficient alone). [code] (registry.schema.json:1027-1050; model-catalog.ts:190-194) The docs say the same: web search, memory, MCP, code execution and computer use are not intrinsic model abilities. [requirement] (AGENTS.md:§4)

Apps read a simpler 13-flag view (`streaming`, `tools`, `vision`, `json`, `thinking`, `computerUse`, `agentic`, `imageGen`, `videoGen`, `search`, `research`, `codeExecution`, `caching`) mapped from the registry names. [code] (model-catalog.ts:172-188) Surfaces must read this metadata, never guess from a model name. [requirement] (docs/architecture/provider-routing.md:34)

### 3. Which generation is live (family slots)
`model-families.json` has 28 family slots. Each has an `active` model, a `previous` one, a bounded `fallbackChain` (policy limit 3), a history, and a snapshot of price, capabilities and limits taken at promotion. [code] (model-families.json policy.fallbackChainLimit; families.*) Promotion gates are: provider availability, family identity, lifecycle eligibility, capability coverage, regression thresholds (cost rise limit 25%), registry validation. Preview models never take a stable slot. [code] (model-families.json policy)

Commands: `pnpm models:families` (inspect), `models:families:promote`, `models:families:rollback`, each with `--slot <id> --apply`. [code] (package.json:394-396; AGENTS.md:§4)

Routes and defaults point at `family:<provider>/<family>`, so swapping a model edits only the family file. [code] (routing-policies.json auto.slots, e.g. `modelKey` values of the form `family:...`)

Current state (read 2026-11-24): of the 28 slots, 13 are marked `seeded` (taken from the authored roster, no gate run) and 15 carry a real promotion record. [code] (model-families.json) **Eight active records say the eval gate was not run**: openai/gpt-frontier, gpt-balanced, gpt-fast, gpt-image; (model name), (model name); google/(model name) (different wording, same meaning) and google/gemini-flash-image. At least one says it was made on the owner's instruction. [code] (model-families.json, families.*.active.promotionReason; re-counted by script on 2026-11-24) So several live defaults skipped the promotion gate that AGENTS.md:§4 describes. [inferred]

**Fallback chains are almost always empty.** 27 of 28 slots have a `fallbackChain` of length 0 and one has length 1, though the policy limit is 3. For most families the only recovery from a bad promotion is rollback to the `previous` model, not a fallback chain. [code] (model-families.json, counted by script; packages/ai/model-registry/scripts/families.mjs:374)

To see the live model for a slot, read that file or run `pnpm models:families`; this page does not name models.

### 4. Choosing a model: Auto
The resolver is `resolveAutoRoute` in `packages/ai/routing/src/auto.ts`. A request carries: the selection (`auto`, a profile alias, or a model), task type, plan tier, trust mode, current model, and optional rules (US-only, zero data retention, no-training, residency region, workspace model policy, excluded providers and hosts, budget left, health data). [code] (auto.ts:165-376)

Steps for an Auto request:
1. **Refuse early** if the trust mode is not permitted, a mandatory session capability is missing (`mandatory_capability_unavailable`), or the runtime profile does not fit. [code] (auto.ts:1722-1740, 568-612)
2. **Pick a cost band.** Aliases are `auto` (default, computed per task), `auto-economy`, `auto-balanced`, `auto-premium`. For `auto`, the task chooses the band (for example simple chat and general use economy, coding and reasoning premium, long context balanced). Then `resolveRoutingLane` clamps the band by the plan's entry in `tierMaximumProfiles`: free and basic economy, pro balanced, max, enterprise and byok premium. The plan id is first passed through `normalizeTier`, because `tierMaximumProfiles` has no keys for `max_15x`, `team` or `team_premium`; an unknown result defaults to economy. [code] (routing-policies.json auto.aliases, autoProfileByTask, tierMaximumProfiles; auto.ts:1198-1206)
3. **Take the ordered slots** for that task and band, restricted to the plan's allow-list `tierAllowedSlots` (six entries: free, basic, pro, max, enterprise, byok). Free gets three slots. A separate `fallbackSlot` is also chosen per tier from that list. This allow-list, not only the band clamp, decides which models a plan can reach. [code] (auto.ts:1205-1207; routing-policies.json auto.tierAllowedSlots)
4. **Optional reorder stages**: task-family stage (quality floor then cost order; kill switch `AGI_ROUTING_TASK_FAMILY_STAGE`), caller `preferSlots` (reorder only), canary and shadow. [code] (auto.ts:1198-1225; task-family-routing.ts; packages/ai/routing/README.md)
5. **Prefer the conversation's current model** (continuity, protects prompt cache) while it is still eligible, affordable and, under the task-family stage, not more than 2 times the cost of the cheapest candidate that meets the floor. [code] (auto.ts:755, 1840-1900; routing-policies.json auto.continuity)
6. **Walk the slots**: each candidate must pass eligibility; the first dispatchable, affordable one wins. A slot whose model would bill a long prompt at a dearer input tier hands over to a cheaper backup. [code] (auto.ts:1960-2030)
7. **Fallbacks**: if only unhealthy candidates remain, try health fallbacks, then the fallback slot, then a jurisdiction fallback slot, else `no_eligible_route`. The decision lists up to 4 fallback routes, with at most 2 same-model routes before another model. [code] (auto.ts:757-764, 2030-2125)

**Eligibility of one model** (`evaluateEligibility`): the model must be in the account's admitted set, live, not deprecated or past its retirement date, allowed for the plan, allowed by US-only / excluded-provider / no-training / developer-country rules, have a route in the request's trust mode, hold every intrinsic capability the task needs, and meet the task's minimum context. [code] (auto.ts:1340-1430)

**Eligibility of one route** (`routeAdmissionRejections`): not on an excluded host, inside the required region, allowed by the workspace policy, commercial status not blocked (experimental routes cannot serve managed traffic), selectable and live, harness runs on the calling app, zero-retention satisfied if asked, no-training satisfied if asked, harness features the task needs are `implemented`. [code] (auto.ts:1042-1140)

### 5. How routing weighs cost, quality, latency, privacy
| Factor | Where it acts | Evidence |
|---|---|---|
| Privacy and policy | Admission, a hard filter before any ranking. Trust mode, zero data retention, no-training, region, US-only, developer country, workspace policy | auto.ts:1042-1140, 1340-1430 |
| Quality | Slot order per task and band; per-family `qualityFloor` in the task-family stage | routing-policies.json auto.tasks, auto.taskFamilies; task-family-routing.ts |
| Cost | Inside the floor-meeting set, order by expected cost of the route actually dispatched; routes then rank by expected cents; budget left can skip a model; long-prompt price tiers trigger a backup | docs/architecture/provider-routing.md:78-98; auto.ts:1144-1170, 1623-1690 |
| Latency and health | Routes rank healthy first, then credentialed, then lower observed penalty (failure rate and time to first token in bands), then cost, then the model default route, then route id. Switch `AGI_ROUTING_OBSERVED_HEALTH` | auto.ts:859-980, 1144-1160 |
| Cache | A route holding a warm cache is kept unless it costs more than 1.25 times the cheapest | auto.ts:735, 1160-1178 |

The named profiles (Instant, High, Code, Research) carry quality, cost and latency weights, but `weightedScore` is exported and not called by `resolveAutoRoute`; only the profile id is attached to the decision. [code] (packages/ai/routing/src/profiles/index.ts:137-169; auto.ts:1466) So latency has no direct weight in slot ordering today. [inferred]

### 6. Manual choice
If the selection is not an alias, the resolver checks that model alone with the same eligibility rules and returns it as `explicit`. A pinned route (`requiredRouteId`) must be healthy and credentialed or the call fails with `explicit_route_ineligible`. A named model ignores the Auto-only `excludedProviders` list but still obeys excluded hosts, region and developer-country rules. [code] (auto.ts:1750-1850, 150-235 comments) Same-model routes rotate before any substitution. [requirement] (docs/architecture/provider-routing.md:55-57)

### 7. Preview
`previewAutoRoute` explains a decision (candidates, admission, reasons) with no upstream call, and shares helpers with the real resolver so it cannot name a different winner. [code] (packages/ai/routing/README.md; auto.ts:2204) It is exposed as api:POST /api/llm/v1/route/preview. [code] (apps/web/app/api/llm/v1/route/preview/route.ts:200)

## Implementation map

| Piece | File | Notes |
|---|---|---|
| Hand-edited catalog | file:packages/ai/model-registry/catalog/models.curation.json | Canonical model rows. Other catalog files sit beside it |
| Family slots | file:packages/ai/model-registry/catalog/model-families.json | 28 slots, promote and rollback via script |
| Auto policy | file:packages/ai/model-registry/catalog/routing-policies.json | Aliases, 47 slots, 11 tasks, 12 task families, tier tables, continuity, rate limits |
| Routes, harnesses, runtime profiles | file:packages/ai/model-registry/catalog/model-routes.json, file:packages/ai/model-registry/catalog/harnesses.json, file:packages/ai/model-registry/catalog/gateways.json | Where and how a model is served; runtime profiles per app and mode |
| Compiler | file:packages/ai/model-registry/scripts/compile.mjs | Validates and emits all generated files |
| Family tooling | file:packages/ai/model-registry/scripts/family-slots.mjs, file:packages/ai/model-registry/scripts/families.mjs, file:packages/ai/model-registry/scripts/lifecycle-stages.mjs | Evaluate, promote, roll back; lifecycle vocabulary (discovered to removed) |
| Generated TS registry | file:packages/ai/model-registry/generated/registry.ts and registry.json | Imported as `@agiworkforce/model-registry` |
| Generated app catalog | file:packages/contracts/types/src/models.json | Re-exported as `modelsCatalogJson` |
| Catalog API for apps | file:packages/contracts/types/src/model-catalog.ts | 3127 lines: lookups, capability mapping, tier policies, Auto profile views, family registry, plan access |
| Resolver (TS) | file:packages/ai/routing/src/auto.ts | `resolveAutoRoute`, `previewAutoRoute` |
| Task classification | file:packages/ai/routing/src/classify.ts, file:packages/ai/routing/src/task-family.ts | Local heuristic; structural family fast path |
| Cost-ordered stage | file:packages/ai/routing/src/task-family-routing.ts | Floor then cost; permutation only |
| Free Auto stage | file:packages/ai/routing/src/free-auto.ts | Filters to routes verified at zero cost to us; may strand a request |
| Health | file:packages/ai/routing/src/route-health-store.ts, file:packages/ai/routing/src/capability-health.ts, file:packages/ai/routing/src/runtime-state.ts | Observed failure, latency, lost capability |
| Workspace policy | file:packages/ai/routing/src/model-policy.ts | Admin allow/deny by vendor, host and model |
| Picker logic | file:packages/ai/routing/src/model-picker.ts | Short list, capability icons, price band, plan lock |
| Cache warning | file:packages/ai/routing/src/model-switch-cache.ts | Warns that switching drops a warm cache |
| Capability handshake | file:packages/contracts/types/src/capability-handshake/evaluator.ts | Typed admission for mandatory capabilities |
| Rust resolver | file:crates/agiworkforce-model-registry/src/lib.rs | `resolve_auto_route`, `slot_model`, `runtime_profile`, 1722 lines |
| Server admission | file:apps/web/lib/server/managed-cloud-routing/admission.ts, file:apps/web/lib/server/managed-cloud-routing/routing-request.ts | Builds the request for cloud calls (chat, utility, background, unattended, preview, platform) |
| Chat route | api:POST /api/llm/v1/chat/completions (apps/web/app/api/llm/v1/chat/completions/route.ts:1526) | Serves turns |
| Model list routes | api:GET /api/models (apps/web/app/api/models/route.ts:127), api:GET /api/llm/v1/models (apps/web/app/api/llm/v1/models/route.ts:327), api:GET /api/models/catalogue (apps/web/app/api/models/catalogue/route.ts:117) | Lists for clients |
| Web composer checks | file:apps/web/features/chat/components/Composer/model-compatibility.ts, file:apps/web/features/chat/components/Composer/ComposerFooter.tsx | Pre-switch warnings |
| Mobile cloud dispatch | file:apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts | Runs the TS resolver on the phone |
| Mobile picker and local models | file:apps/mobile/src/features/model-picker/service.ts, file:packages/platform/local-llm/src/catalog.ts | On-device catalog is separate |
| Chrome routing | file:apps/extension/src/features/cloud-bridge/managedChatRouting.ts | Resolver with capability fallback to Auto |
| VS Code picker | file:apps/extension-vscode/src/features/model-picker/modelConstants.ts, file:apps/extension-vscode/src/core/commandSetup.ts | Switch-loss warning |
| CLI | file:apps/cli/src/model_catalog.rs, file:apps/cli/src/routing/classify.rs | Calls the Rust crate |
| Rollout | api:GET /api/cron/evaluate-model-rollout (route folder apps/web/app/api/cron/evaluate-model-rollout), file:apps/web/lib/feature-flags/routing-flags.ts | HTTP method not read; flags listed below |

Tests: test:packages/ai/routing/src/__tests__/auto.test.ts, test:packages/ai/routing/src/__tests__/capability-routing.test.ts, test:packages/ai/routing/src/__tests__/auto-route-conformance.test.ts, test:packages/ai/routing/src/__tests__/model-picker.test.ts, test:packages/ai/routing/src/__tests__/free-auto.test.ts, test:packages/ai/routing/src/__tests__/zero-data-retention.test.ts, test:packages/ai/model-registry/tests/model-families.test.mjs, test:packages/ai/model-registry/tests/registry-contract.test.mjs, test:crates/agiworkforce-model-registry/tests/auto_route_conformance.rs, test:crates/agiworkforce-model-registry/tests/plan_tier_conformance.rs, test:apps/web/lib/server/managed-cloud-routing/__tests__ (folder). Whether any of these passes today is [unknown]; no run was made for this page.

Providers in `packages/ai/providers/`: provider:anthropic, provider:deepseek, provider:factory, provider:google, provider:groq, provider:lmstudio, provider:minimax, provider:moonshot, provider:nvidia, provider:ollama, provider:openai, provider:openrouter, provider:perplexity, provider:qwen, provider:vercel-gateway, provider:workers-ai, provider:xai, provider:zhipu. [code] (directory listing)

## Data and state

**Static data (in the repo, compiled)**
- Catalog and policy JSON under `packages/ai/model-registry/catalog/` and the generated outputs listed above. Hand edits go only in catalog files. [code]
- Per-route price sheets, cache class, commercial status (`agi_direct`, `customer_byok`, `authorized_marketplace`, `free_commercial`, `experimental_only`, `blocked`) and data retention (`zero_retention`, `provider_default`, `conditional`, `unknown`). [code] (auto.ts:55-70)
- Promotional free pools: `apps/web/config/free-pools.json`; an exhausted pool is a routing event (`quota_exhausted`), not a credential failure. [requirement] (docs/architecture/provider-routing.md:60-65) [code] (file exists)
- Lifecycle stages from `discovered` through `observed`, `deprecated`, `removed`. Managed traffic admits models at stage `registered` or later (per the doc; the TypeScript resolver reads `availability`, so where the stage check lives was not located). [requirement] (provider-routing.md:57-58) [unknown] for the enforcing line.

**Live state (server)**
- Route health and observed latency, capability health, runtime state, served-route affinity: stores read by `apps/web/lib/services/free-lane/` and passed into the pure resolver as snapshots. [code] (apps/web/app/api/llm/v1/route/preview/route.ts imports; packages/ai/routing/src/route-health-store.ts)
- table:routing_decision_traces holds one structured trace per decision, completed with outcome, latency and cost, and deleted after a bounded window. table:model_rollout_benchmarks holds canary and shadow comparisons. Both created in migration 0212. [code] (apps/web/db/neon/0212_routing_decision_traces.sql) [requirement] (provider-routing.md:146-152)
- Usage ledger: billing debits the model's official price while provider cost is recorded from the served route. [requirement] (provider-routing.md:66-76) The ledger table name was not read. [unknown]

**Device state**
- Mobile on-device model installs and the favourites list: `apps/mobile/src/features/model-picker/installStore.ts` and `store.ts`. Exact store names not read. [unknown]
- Web favourite and local selection: Zustand stores `useLocalModelSelection` and favourites used by the composer. [code] (ComposerFooter.tsx:1130-1140)

**Operator switches (names and purposes only)**
| Name | Purpose | Default |
|---|---|---|
| AGI_ROUTING_TASK_FAMILY_STAGE | Task-family quality floor and cost ordering | On unless `0`, `false`, `off` |
| AGI_ROUTING_OBSERVED_HEALTH | Rank by measured failure and latency | On unless off |
| AGI_ROUTING_CANARY | Serve a canary model to a request-id fraction | On unless off |
| AGI_ROUTING_SHADOW | Mirror a copy to a shadow model, discard answer | On unless off |
| routing.observed_health, routing.canary, routing.shadow | Same three as feature flags without a deploy | Absent flag changes nothing |
| routing.response_assessment, routing.response_assessment_apply | Jev-assisted response budget (shadow, then apply) | Off by default per doc |
| AGI_CAPABILITY_HEALTH_WINDOW_MS, AGI_CAPABILITY_HEALTH_MISS_THRESHOLD | Window and miss count before a route is treated as not honouring a capability | Code defaults |
[code] (packages/ai/routing/README.md; auto.ts:766-780; capability-health.ts:25-26; apps/web/lib/feature-flags/routing-flags.ts:7-13) [requirement] (provider-routing.md:106-125)

## Rules: access, plans, modes

**Plans.** Display names come from `BILLING_PLAN_PRICING`: Local Mode, Local Mode + BYOK, Free, Basic, Premium (id `pro`), Max, Ultra (id `max_15x`), Team, Team Premium, Enterprise. [code] (packages/contracts/types/src/billing-catalog.ts:166-230) Plan ids in routing are `free`, `basic`, `pro`, `max`, `enterprise`, `byok`; `team` maps to `pro`, `max_15x` and `team_premium` map to `max`; unknown strings fall to `free`. [code] (auto.ts:650-680) Relationship names: plan:free, plan:basic, plan:pro (Premium), plan:max, plan:max_15x (Ultra), plan:enterprise.

**Local Mode is a plan tier.** It has id `local-only`, label "Local Mode", price 0 USD monthly and yearly, and is listed for web, desktop and mobile in the plan table (`PLAN_SURFACE_VISIBILITY`). That is visibility in the plan table only: Local is offered on Mobile, the CLI, VS Code and the retained Tauri build; web has no Local mode and the public Electron Desktop chat has no Local mode (apps/desktop/electron/config.ts:7-10). See SYS-local-inference. Its limits set `maxSandboxes` 0, `maxScheduledTasks` 0 and `codeHarnessDailyCeilingCents` 0, so cloud sandboxes, scheduled tasks and the cloud code harness are off in Local Mode. Projects, knowledge storage, custom MCP servers, concurrent turns and connector tools are `unlimited`. [code] (packages/contracts/types/src/billing-catalog.ts:166-172, 236, 583-597) The retained Tauri desktop code (`apps/desktop/src`, not the public Electron Desktop) builds a local device account with plan `local-only`, display name "Local Mode" and `subscriptionStatus` `none`, which is consistent with local use needing no subscription. [code] (apps/desktop/src/App.tsx:1945-1953)

**Plan limits on Auto.** Two tables in the policy: the highest cost band (`tierMaximumProfiles`) and the allowed slots (`tierAllowedSlots`), each keyed free, basic, pro, max, enterprise, byok. Free gets three slots (`free_workhorse`, `free_workhorse_fast`, `fast_anthropic`) and the economy band; basic five slots and economy; pro, max and enterprise progressively more. The selectable `auto` alias carries `tierPolicy.minTier: basic`. [code] (routing-policies.json auto.tierAllowedSlots, tierMaximumProfiles, aliases.auto.tierPolicy; auto.ts:1198-1207; model-catalog.ts:956-975) These are two mechanisms that both name Free: the alias gate says Basic, while the lane clamp and slot list serve Free an economy band. How the picker and server reconcile them was not traced. [unknown] See Gaps.

**Plan limits on manual choice.** Three tables decide a named model: `tierAllowedModels` (economy, pro additions, flagship additions) in the catalog, `minTier` on the model, and `canAccessModelForSubscriptionTier`. Free may name only economy models marked `minTier: free`. Pro adds the pro tier; Max and Enterprise add flagships. [code] (model-catalog.ts:2196-2262) A locked model shows a plan label in the picker. [code] (model-picker.ts:247-270)

**Provider switching inside one conversation** is allowed only for max, max_15x, team_premium and enterprise. [code] (packages/contracts/types/src/design-system/user-identity.ts:50-52; apps/mobile/src/features/model-picker/tierGuard.ts)

**Modes.**
| Mode | Trust mode in code | What the router does |
|---|---|---|
| mode:cloud | `managed_cloud` | Routes over AGI-held provider credentials; plan tier tables apply; managed ledger bills credits |
| mode:own-key | `byok` | Routes to direct provider routes with the user's own key; tier band is `premium`; CLI says BYOK and local models are not gated by subscription tier |
| mode:local | `local` (desktop, CLI) and `on_device` (mobile) | Routes only to harnesses that list that trust mode: for `local` the registry lists `ollama/chat` and `lmstudio/chat-completions`; for `on_device` it lists none |
[code] (auto.ts:1691-1708; registry.json runtimeProfiles read 2026-11-24; apps/cli/src/model_catalog.rs:920-935)

Nothing may move a Local chat to BYOK or cloud without an explicit, consented fork. Registry membership never authorizes crossing. [requirement] (AGENTS.md:§6) Enforced by `check:trust-boundaries` and per-surface trust-boundary tests. [requirement] The resolver refuses a trust mode the workspace does not permit (`allowedTrustModes`). [code] (auto.ts:333-338)

**Local inference is free of any paid plan.** The registry prices the `local-only` plan at 0 USD. [code] (billing-catalog.ts:166-172) [requirement] (task statement). Local needs no account. Mobile lets a signed-out user in after the on-device age confirmation and onboarding, while Cloud models stay locked behind sign-in; the CLI and VS Code need no account for Local; the public Electron Desktop chat has no Local mode. [code] (apps/mobile/src/features/auth/services/rootRouting.ts:30-60; apps/mobile/app/index.tsx:9-12; apps/desktop/electron/config.ts:7-10) See SYS-local-inference.

**Execution boundary for on-device models.** On mobile, the first use of an on-device model needs an outside service: the on-device catalog points at huggingface.co download URLs with pinned SHA-256 hashes and byte sizes. After the download, running the model is on the device. [code] (packages/platform/local-llm/src/catalog.ts:3-16) Whether any app lets a user side-load the files offline was not checked. [unknown]

**Privacy rules that admit or refuse routes** (all passed in by the caller, all fail closed): zero data retention, no-training (vendor and host must both keep inputs out of training; a provider with no recorded policy is refused), US-only (plans max and enterprise only), data residency region, workspace allow/deny policy, developer-country rule. [code] (auto.ts:165-376,1042-1140; routing-policies.json auto.providerPolicies) Managed Auto also avoids Chinese-headquartered providers entirely by a caller-supplied exclusion; a model the user names is still served. [code] (auto.ts:200-225 comment)

**Subscription link.** Plan, access rules and quotas come from the one AGI Subscription system; the router only reads the plan id and an account-admitted model set. [requirement] (task statement) [inferred] from `admittedModelKeys` and `subscriptionTier` fields. The entitlement service itself is covered by another page.

## Differences between apps

**Where each app runs the router**
| App | How it chooses a model | Evidence |
|---|---|---|
| surface:web | Server-side. Admission builds the request, calls `resolveAutoRoute`, then dispatches. Client composer only warns | apps/web/lib/server/managed-cloud-routing/admission.ts:200-300 |
| surface:desktop | The public Desktop is Electron showing the hosted web app, so it uses the web path. The Tauri build is retained internal code and has Rust routing files. The public Electron Desktop chat has no Local mode | AGENTS.md:§5; apps/desktop/src-tauri/src/automation/computer_use/visual_reasoner.rs (uses crate); apps/desktop/electron/config.ts:7-10 |
| surface:mobile | Runs the TS resolver on the phone for cloud dispatch; on-device models come from a separate catalog | apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:1-100 |
| surface:cli | Rust crate through `resolve_auto_model_with_speed`; profiles `cli/managed-chat`, `cli/byok-chat`, `cli/local-chat` | apps/cli/src/model_catalog.rs:698-770 |
| surface:vscode | Uses catalog helpers in the picker; managed chat is implemented, BYOK and local profiles are `unwired` | apps/extension-vscode/src/features/model-picker/modelConstants.ts; registry.json runtimeProfiles |
| surface:chrome | TS resolver with `fallbackToAutoForCapabilityMismatch: true`; separate profiles for chat and browser tasks | apps/extension/src/features/cloud-bridge/managedChatRouting.ts:40-58 |

**Runtime profile status (generated, from the harness catalog)**: web, desktop, mobile cloud chat and cli/vscode/chrome managed profiles are `implemented`; `desktop/local-chat`, `mobile/local-chat` and `cli/local-chat` are `partial`; `vscode/byok-chat` and `vscode/local-chat` are `unwired`. `implemented` here means the catalog says so, not that anyone ran it. [code] (docs/generated/trust-mode-surface-matrix.md; registry.json)

**What the user sees when a model lacks an ability**
| App | Missing ability | What the user sees |
|---|---|---|
| surface:web | Images, tools, or context too small, on picking a model | A "Switch to <model>?" panel with one line per finding, for example that the model cannot read images so images will be ignored, or cannot call tools so tools will be off for the turn, or that older messages will be left out. Buttons: Switch anyway and cancel | apps/web/features/chat/components/Composer/model-compatibility.ts:150-200; ComposerFooter.tsx:1181-1190,1533-1560 |
| surface:web | Free promotional model, message needs files, tools, search, code, skills, apps | Message says the free model cannot do it and that Auto answered this message; the conversation model is not changed | model-compatibility.ts:96-135; packages/contracts/types/src/chat-fallback-reason.ts:56-95 |
| surface:web | Served by a different model than picked | A notice repeats the substitution reason on the last reply | ComposerFooter.tsx:1118-1130 |
| surface:mobile | No admitted model supports the request | "No available AGI Cloud model supports this request. Try a different model or remove the attachment." Other codes have their own text (plan, region, unknown selection) | cloudDispatchRouting.ts:24-47 |
| surface:mobile | Too many images for the model | "<model> can read up to N images in one message. Remove X to send it." | apps/mobile/src/features/chat/utils/attachmentValidation.ts:181-197 |
| surface:mobile | Local model not downloaded | Banner offers to switch to a ready model or open Models | apps/mobile/src/features/chat/utils/localModelRecovery.ts |
| surface:vscode | Switching to a model without tools, vision or with less context | Modal warning: "Unlike <current>, it cannot use tools, so it cannot read or edit files or run commands; ..." with a Switch anyway button | commandSetup.ts:1359-1370; modelConstants.ts:347-368 |
| surface:chrome | Chosen model lacks tools, vision or streaming for browser actions | Error: "<model> does not support browser tools, screenshots, and streaming." With Auto, the router falls back to a capable model | apps/extension/src/features/computer-use/cloudAgentClient.ts:95-103; managedChatRouting.ts:55 |
| surface:chrome | Model lacks tools in chat | Tools are not sent for that turn | apps/extension/src/side_panel.ts:8768-8772; managedChatHandler.ts:792 |
| surface:cli | Local model does not advertise tools | Notice "Local model '<m>': does not advertise tool support. Running this turn without tools." | apps/cli/src/models/streaming.rs:200-207,1197-1215 |
| surface:desktop | Same as web (hosted app) | See web rows | AGENTS.md:§5 |

The same picker rules (Auto row, recommended models, favourites, plan lock labels, capability icons for vision, thinking, tools, search, code, image, video) come from one shared module. [code] (packages/ai/routing/src/model-picker.ts:26-125,272-372) How each app renders it was only read for web, mobile and VS Code.

## Failure handling

**Resolver outcomes.** The resolver never throws for a policy refusal. It returns `unavailable` with a code: `unknown_selection`, `unknown_task`, `unknown_runtime_profile`, `runtime_profile_unavailable`, `runtime_profile_mismatch`, `explicit_model_ineligible`, `explicit_route_ineligible`, `mandatory_capability_unavailable`, `trust_mode_not_permitted`, `model_not_available_in_region`, `no_eligible_route`, plus a list of reasons. [code] (auto.ts:471-492)

**Capability mismatch.** With a named model: refuse (`explicit_model_ineligible`) unless the caller sets `fallbackToAutoForCapabilityMismatch`, in which case Auto answers and the reason is `capability_fallback`. Mobile and Chrome set it true; the web admission sets it false for an exact selection. [code] (auto.ts:1822-1836; cloudDispatchRouting.ts:94; managedChatRouting.ts:55; admission.ts:253) A *mandatory* session capability (from the capability handshake) is never replaced by a weaker substitute, and a missing capability document with mandatory needs fails closed. [code] (evaluator.ts header; auto.ts:568-612)

**Provider failure.** Candidates carry health; an unhealthy first choice is parked and healthy ones are tried first. The decision lists fallback routes, and a failure on one route rotates to same-model routes before another model. A reply that came from a fallback carries a reason code (for example `managed_failover`, `openrouter_route_failover`, `insufficient_credits`, `free_limit_reached`, `free_capacity_unavailable`, `research_unsupported_model`) through a response header and the client shows plain text for it. [code] (auto.ts:1980-2060; packages/contracts/types/src/chat-fallback-reason.ts:43-150)

**Bad family promotion.** Because 27 of 28 family fallback chains are empty, the recovery path is `models:families:rollback` to the `previous` model, not an automatic chain. [code] (model-families.json; families.mjs:374)

**Capability the route stopped honouring.** The capability-health store records misses; for a request that carries tools or a structured format, a second resolution demotes a route with recorded losses. A turn with no tools costs nothing. [requirement] (provider-routing.md:127-134) [code] (auto.ts:869-980)

**Budget.** A model that exceeds the remaining budget is skipped except for the fallback slot. [code] (auto.ts:1985-1992)

**Free Auto.** Never returns a route not verified as zero cost; every doubt means ineligible, so it can answer "no free capacity right now". [code] (free-auto.ts:1-45)

**Policy cannot be read.** Admission refuses with `policy_unreadable`, `no_training_route` or `no_route`. A workspace policy read that fails deliberately fails open for ungoverned scopes. [code] (admission.ts:70-110; auto.ts:312-320 comments) Whether failing open on a read error matches the trust rules was not checked. [unknown]

**Retired models.** A model past its deprecation date is refused as an explicit choice; retired IDs keep a record so old history still shows a name. [code] (auto.ts:1710-1721; model-catalog.ts:1469-1500)

**Verification status.** Everything above is implementation status read from code, plus counts made by reading the JSON catalog files on 2026-11-24. No test, app run or production check was made for this page. Recorded runs in the project: none cited here. [unknown]

## How it should work

Requirements that bind this subject [requirement]:
- One experience over many models: surfaces read capability metadata, never model-name substrings. (docs/architecture/provider-routing.md:34; AGENTS.md:§4)
- Provider agnostic: add or swap a model by editing catalog or family files only, then `pnpm sync:models`. (AGENTS.md:§4)
- Cost is a first-class constraint; a stronger model is not the default because it is stronger. (AGENTS.md:§7)
- Local, own-key and cloud are separate trust boundaries; no silent crossing. (AGENTS.md:§6)
- Execution boundaries are explicit: what runs on the device, what needs AGI servers, what needs outside services. The `trust-mode-surface-matrix` and `docs/architecture/trust-boundaries.md` own that. (task statement; docs/generated/trust-mode-surface-matrix.md)
- Local inference is free of any paid plan and needs no account (Mobile, CLI, VS Code and the retained Tauri build).
- Documentation availability is separate from account, region and route availability. (AGENTS.md:§4)

Proposals [proposed]:
1. Make one module the owner of plan access. Today `tierAllowedSlots` (policy), `tierAllowedModels` plus `minTier` (catalog) and the hardcoded `TIER_POLICIES` (model-catalog.ts) all state it.
2. Decide which resolver is canonical (TS or Rust) and generate the other, or keep the conformance fixture and record the decision.
3. Use the profile weights in ordering, or delete the unused weights, so latency has an explicit place.
4. Give on-device models a registry record with the same capability vocabulary so the picker and warnings treat them like cloud models.
5. Show one shared wording for each capability loss on every app, from one catalog of messages, not per-app strings.
6. Fill family fallback chains, or record that rollback is the only recovery, and run the eval gate for the eight slots promoted without it.

## Gaps

Implementation gaps (the code is missing or not connected):
1. **On-device models are outside the registry.** The on-device catalog lives in `packages/platform/local-llm/src/catalog.ts` with its own five capability flags (`text`, `visionIn`, `audioIn`, `toolCalls`, `structuredOutput`) and model ID literals; it does not use the 22-name vocabulary or the `family:` slots. Mobile's `on_device` runtime profile lists zero harnesses. This sits outside AGENTS.md:§4's statement that the generated catalog is the only place for model IDs. Its files are fetched from huggingface.co. [code] (packages/contracts/types/src/on-device-models.ts:1-45; local-llm/src/catalog.ts:1-80; registry.json runtimeProfiles['mobile/local-chat'])
2. **Plan tables are stated three times.** Policy `tierAllowedSlots`, catalog `tierAllowedModels` with `minTier`, and hardcoded `TIER_POLICIES` (which has no `basic` and lists `free` slots as a short list). They can drift. [code] (routing-policies.json; model-catalog.ts:1121-1413,2196-2262)
3. **Auto alias floor vs Free.** `aliases.auto.tierPolicy.minTier` is `basic`, yet `tierAllowedSlots.free` and `tierMaximumProfiles.free` serve Free an economy Auto lane, and free-lane code adds the TypeScript-only Free Auto stage. How the picker reconciles this was not traced. [code] (routing-policies.json; auto.ts:1198-1207) [unknown] for the reconciliation
4. **Two resolvers.** The TS and Rust resolvers share one fixture, but the file header says which is canonical is an open question. Free Auto, the task-family stage, canary, shadow, health, `preferSlots` and caller exclusions exist only in TypeScript; the CLI's Rust path gets plain static policy. [code] (crates/agiworkforce-model-registry/tests/auto_route_conformance.rs:1-12; free-auto.ts:1-45; auto.ts:200-260 comments)
5. **Named profile weights are unused** by the resolver (`weightedScore` has no caller outside tests). [code] (profiles/index.ts:169; auto.ts:1466)
6. **Family promotions skipped the gate.** 13 of 28 slots were seeded without a gate run, and 8 active records say the eval gate was not run (see How it works today, section 3). 27 of 28 fallback chains are empty. [code] (model-families.json)
7. **VS Code BYOK and local** profiles are `unwired`; mobile, desktop and CLI local profiles are `partial`. [code] (registry.json runtimeProfiles)
8. **Capability warnings are per app.** Web, VS Code, Chrome, CLI and mobile each have separate copy and checks; no shared module emits them. [code] (files listed under Differences between apps)
9. **Desktop Electron has no Local mode**, so no local inference path exists in `apps/desktop/electron`. [code] (apps/desktop/electron/config.ts:7-10)
10. **Stray generated files** `generated/registry.json.orig` and `src/generated/model_registry.json.orig` exist beside tracked outputs (untracked). [code] (directory listing; git ls-files)
11. **Local Mode loses cloud features.** Sandboxes, scheduled tasks and the cloud code harness are set to 0 for `local-only`; which app screens explain this to the user was not checked. [code] (billing-catalog.ts:583-597) [unknown] for the UI.

Verification gaps: no run of any test, guard or app was made for this page; no evidence was found of a live check that each app shows the warnings above.

## How to verify

Run these (not run for this page; the project forbids builds and tests during knowledge-base writing). Prefer `scripts/dev/heavy-job.sh` or `light-job.sh` on a 16 GB machine. [requirement] (CLAUDE.md Delegation)

| Question | Command or file |
|---|---|
| Is the generated catalog current? | `pnpm sync:models:check` |
| Catalog integrity and literals | `pnpm check:model-catalog`, `pnpm check:model-id-literals` |
| Which model is live in each family | `pnpm models:families` |
| Which family promotions skipped the gate | read `active.promotionReason` and `evaluation.seeded` per slot in `model-families.json` |
| Registry and family tests | `pnpm --filter @agiworkforce/model-registry test` |
| Resolver behaviour | `pnpm --filter @agiworkforce/routing test` |
| TS and Rust agree | run the routing test with `AGI_UPDATE_ROUTING_CONFORMANCE` unset, then `cargo test -p agiworkforce-model-registry` |
| What would Auto pick for this account | call api:POST /api/llm/v1/route/preview with `selection`, `taskType`, optional `capabilitiesInUse` |
| Full guard chain | `pnpm check:llm-operability` |
| What a model can do | find its row in `generated/registry.json` (`capabilities`, `limits`, `routes`) |

Check by hand in the app: pick a text-only model with an image attached on Web (expect the Switch panel); pick a no-tools model in VS Code (expect the modal); send an image on mobile with a model at its image limit (expect the limit message). [proposed]

Note: for `apps/web`, run tests through its own package script, and `tsc` needs `NODE_OPTIONS=--max-old-space-size=8192`. [requirement] (AGENTS.md:§12)

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The model catalog is generated: people edit catalog JSON under packages/ai/model-registry/catalog, and pnpm sync:models compiles registry.json, registry.ts, models.json and two Rust mirrors. | read in the code | `packages/ai/model-registry/scripts/compile.mjs:26-79`; `package.json:386-388`; `AGENTS.md:§4` (not found) |
| Never hand-edit packages/contracts/types/src/models.json; a model ID may be a literal only in the catalog, enforced by check:model-id-literals and a Rust guard. | stated requirement | `AGENTS.md:§4` (not found); `package.json:219` |
| The generated registry read on 2026-11-24 holds 394 models, 463 routes, 38 harnesses and 15 runtime profiles; 389 models are live. | read in the code | `packages/ai/model-registry/generated/registry.json` |
| Every model has one 22-name capability vocabulary; null means unverified and is treated as not offered. | read in the code | `packages/ai/model-registry/schema/registry.schema.json:729-800` |
| Capabilities are split into intrinsic (model) and route-dependent (needs route or AGI harness); route-dependent ones are never sufficient alone. | read in the code | `packages/ai/model-registry/schema/registry.schema.json:1027-1050`; `packages/contracts/types/src/model-catalog.ts:190-194` |
| model-families.json has 28 family slots; each has active, previous, fallbackChain (limit 3), history and snapshots; defaults point at family:<provider>/<family>. | read in the code | `packages/ai/model-registry/catalog/model-families.json`; `packages/ai/model-registry/catalog/routing-policies.json` |
| 13 of 28 family slots are seeded (no gate run); 8 active promotion records say the eval gate was not run (openai gpt-frontier, gpt-balanced, gpt-fast, gpt-image; anthropic (model name), (model name); google (model name), gemini-flash-image). | read in the code | `packages/ai/model-registry/catalog/model-families.json (script count on 2026-11-24: 28 slots, 8 'not run')` |
| Family fallback chains are empty for 27 of 28 slots and hold one entry in the other, though the policy limit is 3; recovery from a bad promotion is mostly rollback to the previous model. | read in the code | `packages/ai/model-registry/catalog/model-families.json (script count)`; `packages/ai/model-registry/scripts/families.mjs:374` |
| Promote or roll back a family with pnpm models:families:promote or :rollback --slot <id> --apply; inspect with pnpm models:families. | read in the code | `package.json:394-396`; `AGENTS.md:§4` (not found) |
| Auto aliases are auto (default), auto-economy, auto-balanced, auto-premium; auto computes the band per task, and resolveRoutingLane clamps it by tierMaximumProfiles (free/basic economy, pro balanced, max/enterprise/byok premium) after normalizeTier; unknown tiers default to economy. | read in the code | `packages/ai/model-registry/catalog/routing-policies.json auto.aliases, autoProfileByTask, tierMaximumProfiles`; `packages/ai/routing/src/auto.ts:1198-1207` |
| tierMaximumProfiles and tierAllowedSlots each have six keys (free, basic, pro, max, enterprise, byok); max_15x, team and team_premium rely on normalizeTier. Free's allowed slots are free_workhorse, free_workhorse_fast, fast_anthropic. | read in the code | `packages/ai/model-registry/catalog/routing-policies.json auto.tierMaximumProfiles, auto.tierAllowedSlots`; `packages/ai/routing/src/auto.ts:1198-1207` |
| The auto alias has tierPolicy minTier basic while Free has an economy band and three allowed slots; the reconciliation is not traced. | read in the code | `packages/ai/model-registry/catalog/routing-policies.json auto.aliases.auto.tierPolicy` |
| Auto policy has 47 slots, 11 task types and 12 task families. | read in the code | `packages/ai/model-registry/catalog/routing-policies.json` |
| Privacy and policy rules are hard admission filters applied before ranking: trust mode, zero data retention, no-training, region, US-only, developer country, workspace policy. | read in the code | `packages/ai/routing/src/auto.ts:1042-1140`; `packages/ai/routing/src/auto.ts:1340-1430` |
| Route ranking order: healthy, credentialed, lower observed penalty, lower expected cost, model default route, route id; a warm-cache route is kept unless it costs over 1.25 times the cheapest. | read in the code | `packages/ai/routing/src/auto.ts:735,1144-1178` |
| The task-family stage orders only the already-admitted set by expected cost among candidates meeting a quality floor; it is a permutation, with kill switch AGI_ROUTING_TASK_FAMILY_STAGE. | stated requirement | `docs/architecture/provider-routing.md:78-104`; `packages/ai/routing/README.md` |
| Auto keeps the conversation's current model for cache continuity while it stays eligible and costs at most 2 times the cheapest floor-meeting candidate. | read in the code | `packages/ai/routing/src/auto.ts:755,1840-1900` |
| A named model is served as 'explicit'; if it is ineligible the resolver returns explicit_model_ineligible, unless fallbackToAutoForCapabilityMismatch is set (mobile and Chrome set it, web exact selection clears it). | read in the code | `packages/ai/routing/src/auto.ts:1750-1850`; `apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:94`; `apps/extension/src/features/cloud-bridge/managedChatRouting.ts:55`; `apps/web/lib/server/managed-cloud-routing/admission.ts:253` |
| Billing follows the model's official price while cost follows the served route, so a cheaper host does not change what the user pays. | stated requirement | `docs/architecture/provider-routing.md:66-76` |
| Plan display names: Local Mode, Local Mode + BYOK, Free, Basic, Premium (id pro), Max, Ultra (id max_15x), Team, Team Premium, Enterprise. | read in the code | `packages/contracts/types/src/billing-catalog.ts:166-230` |
| Local Mode (plan id `local-only`) is priced at 0 USD and is listed for web, desktop and mobile in the plan table only; Local is offered on Mobile, CLI, VS Code and the retained Tauri build, not on web or the public Electron Desktop. It has maxSandboxes 0, maxScheduledTasks 0 and codeHarnessDailyCeilingCents 0; so sandboxes, scheduled tasks and the cloud code harness are off. | read in the code | `packages/contracts/types/src/billing-catalog.ts:166-172`; `packages/contracts/types/src/billing-catalog.ts:236`; `packages/contracts/types/src/billing-catalog.ts:583-597`; `apps/desktop/electron/config.ts:7-10` |
| The retained Tauri desktop code (not the public Electron Desktop) builds a local device account with plan local-only, name Local Mode and subscriptionStatus none. | read in the code | `apps/desktop/src/App.tsx:1945-1953` |
| Local needs no account: Mobile allows signed-out use after an on-device age confirmation and onboarding; the CLI and VS Code need no account; the public Electron Desktop chat has no Local mode. | read in the code | `apps/mobile/src/features/auth/services/rootRouting.ts:30-60`; `apps/mobile/app/index.tsx:9-12`; `apps/desktop/electron/config.ts:7-10` |
| Mobile on-device model files are downloaded from huggingface.co with pinned SHA-256 hashes and sizes, so first use needs an outside service. | read in the code | `packages/platform/local-llm/src/catalog.ts:3-16` |
| Free may name only economy models marked minTier free; pro adds pro models; max and enterprise add flagships. | read in the code | `packages/contracts/types/src/model-catalog.ts:2196-2262` |
| Switching provider inside one conversation is allowed only for max, max_15x, team_premium and enterprise. | read in the code | `packages/contracts/types/src/design-system/user-identity.ts:50-52` |
| Web warns before a model switch: 'Switch to <model>?' with findings for no images, no tools or context overflow, and a Switch anyway button. | read in the code | `apps/web/features/chat/components/Composer/model-compatibility.ts:150-200`; `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1181-1190,1533-1560` |
| VS Code shows a modal listing losses (no tools, no images, smaller context) before switching, with a Switch anyway choice. | read in the code | `apps/extension-vscode/src/core/commandSetup.ts:1359-1370`; `apps/extension-vscode/src/features/model-picker/modelConstants.ts:347-368` |
| Chrome browser actions fail with '<model> does not support browser tools, screenshots, and streaming.' when the chosen model lacks tools, vision or streaming; Auto picks a capable model instead. | read in the code | `apps/extension/src/features/computer-use/cloudAgentClient.ts:95-103`; `apps/extension/src/features/cloud-bridge/managedChatRouting.ts:55` |
| The CLI drops tools for a local model that does not advertise tool support and prints a notice that the turn runs without tools. | read in the code | `apps/cli/src/models/streaming.rs:200-207,1197-1215` |
| Mobile maps unavailable routing codes to fixed messages, for example 'No available AGI Cloud model supports this request. Try a different model or remove the attachment.' | read in the code | `apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:24-47` |
| The Rust crate agiworkforce-model-registry holds a second resolver (resolve_auto_route) over the same generated policy; both replay one conformance fixture, and which is canonical is undecided. | read in the code | `crates/agiworkforce-model-registry/tests/auto_route_conformance.rs:1-12`; `crates/agiworkforce-model-registry/src/lib.rs:1298` |
| Free Auto, task-family stage, canary, shadow, health ranking and preferSlots are TypeScript-only; the Rust resolver has no counterpart. | read in the code | `packages/ai/routing/src/free-auto.ts:1-45`; `packages/ai/routing/src/auto.ts:200-260` |
| Runtime profiles: local profiles for desktop, mobile and CLI are partial; mobile on_device lists zero harnesses; desktop local lists ollama and lmstudio harnesses; VS Code BYOK and local are unwired. | read in the code | `packages/ai/model-registry/generated/registry.json runtimeProfiles`; `docs/generated/trust-mode-surface-matrix.md` |
| Mobile on-device models come from a separate catalog (packages/platform/local-llm) with five capability flags, not the registry vocabulary. | read in the code | `packages/platform/local-llm/src/catalog.ts:1-80`; `packages/contracts/types/src/on-device-models.ts:1-45`; `apps/mobile/src/features/model-picker/service.ts:1-12,99-116` |
| Named routing profiles (Instant, High, Code, Research) define quality, cost and latency weights, but weightedScore is not called by resolveAutoRoute. | read in the code | `packages/ai/routing/src/profiles/index.ts:137-169`; `packages/ai/routing/src/auto.ts:1466` |
| Every routing decision is traced in table routing_decision_traces (migration 0212) and compared hourly by /api/cron/evaluate-model-rollout. | stated requirement | `docs/architecture/provider-routing.md:146-152`; `apps/web/db/neon/0212_routing_decision_traces.sql` |

## Open questions

- Which resolver is canonical, TypeScript or Rust? The conformance test header says the question is undecided.
- The default auto alias has minTier basic while tierAllowedSlots.free and tierMaximumProfiles.free exist. How do the picker and server reconcile Auto for Free accounts?
- Challenge 'free users get Auto at economy band mixes two mechanisms': partly upheld. The page now separates the alias gate (minTier basic), the lane clamp and slot list (both serve Free), and the TypeScript-only Free Auto stage. The claim that Free is served only by the free-auto path was not confirmed: resolveRoutingLane applies tierMaximumProfiles and tierAllowedSlots to free directly. The max_15x, team and team_premium points were upheld and added (normalizeTier).
- Challenge on the seeded count stands: 13 of 28 seeded was not re-counted by this check (the evaluation.seeded path did not match in a re-count script) and is kept from the earlier read and the reviewer's count; re-verify with pnpm models:families.
- Where is the lifecycle-stage rule ('registered or later' for managed traffic) enforced in code?
- Which table holds the managed usage ledger rows that record model price versus route cost? Not read.
- Should on-device models be moved into the registry with the shared capability vocabulary? Product choice left open by the code.
- Should named profile weights (quality, cost, latency) drive ordering, or be removed? Latency has no direct weight in slot ordering today.
- Is failing open on an unreadable workspace policy acceptable under the fail-closed rule in AGENTS.md section 6? Only the doc comment was read.
- How do the Chrome side panel, mobile and CLI render picker locks and capability icons? Only Web, VS Code and Mobile warning text were read.
- Have any of the routing tests, guards or conformance replays passed on the current main? No run was recorded or made.
- Should the eight family slots promoted without the eval gate be re-gated, and should family fallback chains be filled (27 of 28 are empty)?
- Does any app let a user install on-device model files without reaching huggingface.co?

## Project documents found out of date

- `docs/architecture/provider-routing.md`: Says the chat picker shows the model, its developer and the routes that can serve it now. The code says: The shared picker short list carries guidance, capability icons, price band, plan lock and family slot; no route list per model appears in its row model. (packages/ai/routing/src/model-picker.ts:82-90 (ModelPickerRowModel); the web picker UI itself was not fully read, so treat this as a partial mismatch)
- `docs/architecture/provider-routing.md`: Its capability matrix (Responses, Chat Completions, native tools and so on) is described as the product contract, while the generated docs/generated/provider-capability-matrix.md now owns harness wiring. The code says: Harness features come from packages/ai/model-registry/catalog/harnesses.json; the prose table is not derived from it and was not cross-checked. (docs/architecture/provider-routing.md:21-24; packages/ai/model-registry/catalog/harnesses.json)
- `packages/contracts/types/src/model-catalog.ts (header comment)`: Lists consumers apps/desktop/src/constants/llm.ts, apps/web/constants/llm.ts and apps/mobile 'via API responses' as the consumers. The code says: Mobile imports the shared packages directly (routing, types) and runs resolveAutoRoute on the device; the CLI and Rust crates also consume the generated registry. (apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:1-16; apps/cli/src/model_catalog.rs:16)
- `packages/ai/routing/src/index.ts (header comment)`: Describes the package as 'pure-TypeScript, zero side effects, zero shared module state'. The code says: The package also holds stateful stores (route-health-store.ts, capability-health.ts store factory) and env-var readers for stage switches. (packages/ai/routing/src/route-health-store.ts; packages/ai/routing/src/capability-health.ts:249; packages/ai/routing/src/auto.ts:766-780)
- `AGENTS.md section 4 (promotion keeps gate evidence)`: States that promotion keeps the prior model, a bounded fallback chain and gate evidence. The code says: Eight active family records say the eval gate was not run, 13 slots are seeded without a gate, and 27 of 28 fallback chains are empty. (packages/ai/model-registry/catalog/model-families.json (script count 2026-11-24))
