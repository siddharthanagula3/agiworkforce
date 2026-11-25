---
id: "REF-glossary"
type: "glossary"
title: "Glossary"
basis: "code inspection and project documents"
second_reader: "not challenged; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Glossary

Glossary of about 150 terms that reconciles the user-facing name, the interface label and the code name for AGI Workforce: apps, plans (tier ids versus labels such as pro = Premium), the three modes (local, byok, managed shown as Local, BYOK, Cloud), features such as Scheduled, agents and tools, billing terms and repository jargon. Every row cites code. Nothing was run.

## How to read this glossary

This page lines up three vocabularies for the same thing:

1. **User-facing name**: what marketing and the product call it.
2. **Interface label**: the exact string a person sees on a button, tab or menu. These strings live in the English locale files.
3. **Internal name**: the identifier in code (a type, a tier id, a route, a table, a panel id).

The three often differ. Example: the plan whose internal tier id is `pro` is labelled "Premium" (T/billing-catalog.ts:191, I/pricing.json:5).

**Path shortcuts used in every table.**

| Shortcut | Full path |
| --- | --- |
| `T/` | `packages/contracts/types/src/` |
| `I/` | `packages/ui/i18n/locales/en/` |
| `W/` | `apps/web/` |
| `D/` | `apps/desktop/src/` |
| `M/` | `apps/mobile/` |

**Evidence basis.** Every row is `[code]` (I opened the file at the cited line) unless the row says otherwise. `[inferred]` means reasoning from code with no explicit statement. `[unknown]` means I could not establish it. `[requirement]` means a project document states it.

**Implementation status versus verification status.** Implementation status says whether code exists and is wired. Verification status says whether anyone ran it. I ran nothing and read no project document that records a run of these screens, so the verification status of every row is `[unknown]`. Where a row says "defined", it means only that the code is present.

**Plan spelling.** Plans are written as the tier id in backticks, for example `max_15x`, followed by the label in quotes when it differs. Relationship names use `plan:<tier id>`.

**Modes.** Three trust modes exist. Their internal ids are `local`, `byok`, `managed`. Their labels are "Local", "BYOK", "Cloud". In relationship names they are `mode:local`, `mode:own-key`, `mode:cloud`. The word "mode" is overloaded; see the Modes section for every separate meaning.

**Overloaded words with their own rows.** mode, tier, Code, Work, Scheduled, Agent, Managed, Cloud. Search the sections for these.

**Model names.** This page never names a model. The model list is generated from `packages/ai/model-registry/catalog/models.curation.json` into `T/models.json`; routing is in `packages/ai/model-registry/catalog/routing-policies.json`.

## Products and apps

The product has six apps (surfaces). The registry of plain product names is `T/product-names.ts:7-15`. The status and display names used by the web site are in `W/lib/surface-status.ts`.

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Brand | AGIWORKFORCE | "AGIWORKFORCE home" (header link) | `PRODUCT_BRAND` | Brand string; the plain app names hang off it | T/product-names.ts:1; I/common.json:84 |
| Short brand | AGI | none | `PRODUCT_COPYRIGHT_NAME` | Name used in copyright lines | T/product-names.ts:3 |
| Company / site | AGI Workforce | none | `COMPANY_SITE_NAME` | Company and site name; it names no product | T/product-names.ts:5; docs/standards/naming-conventions.md:23 |
| Product names | Chat, Mobile, Desktop, CLI, Extension, Code, Work | same | `PRODUCT_NAMES` keys `chat mobile desktop cli extension code work` | Plain product names; UI copy builds "Get Desktop" and similar from them | T/product-names.ts:7-15; W/lib/surface-status.ts:59-75 |
| Web app | Web | "Web" | `surface:web`, `SurfaceId` `web`, `apps/web` | Next.js app; the only surface marked "Available now" | W/lib/surface-status.ts:6-13, 29-36; ARCHITECTURE.md:37 |
| Desktop app | Desktop | "Desktop" | `surface:desktop`, `apps/desktop` | Mac app (platform list is macOS only); shown "Coming soon" in the status map | W/lib/surface-status.ts:6-13, 40-47 |
| Desktop, Electron shell | Desktop (public build) | window title: Desktop | `apps/desktop/electron`, productName `Desktop` | Public Desktop; it loads the hosted web app, so `apps/desktop/src` never reaches it | ARCHITECTURE.md:37, 51; apps/desktop/electron-builder.yml:11-12 |
| Desktop, Tauri shell | not public | productName `AGI` | `apps/desktop/src-tauri`, `apps/desktop/src` | Retained internal Rust shell with a Vite renderer; the only host where Local app mode is supported | ARCHITECTURE.md:50; apps/desktop/src-tauri/tauri.conf.json:3; D/lib/runtimeEnvironment.ts:21 |
| Desktop, GPUI host | none | none | `apps/desktop/gpui` | Opt-in native host begun 2026-11-08; talks to the CLI developer runtime over stdio | ARCHITECTURE.md:56 |
| Mobile app | Mobile | iOS display name "AGI Mobile" | `surface:mobile`, `apps/mobile`, bundle id `com.agiworkforce.app` | Expo / React Native app for iOS and Android | M/app.config.js:81, 165; W/lib/surface-status.ts:40-47 |
| CLI | CLI | "Get the CLI" | `surface:cli`, `apps/cli`, crate `agiworkforce-cli`, binary `agi`, alias binary `agiworkforce` | Rust command line agent; `agi` is the primary command | apps/cli/Cargo.toml:3, 15-21; docs/standards/naming-conventions.md:25-26 |
| VS Code extension | Code | store display name "AGI Code" | `surface:vscode`, `apps/extension-vscode`, package `agi-workforce` | IDE assistant; the plain name is "Code" but the manifest says "AGI Code" | T/product-names.ts:13; apps/extension-vscode/package.json:2-3; W/lib/surface-status.ts:66-70 |
| Chrome extension | Extension | manifest name "AGI Extension" | `surface:chrome`, `apps/extension`, package `@agiworkforce/extension` | Chrome MV3 browser assistant with a native-host bridge | apps/extension/manifest.json:3; W/lib/surface-status.ts:71-75 |
| Surface id list | n/a | n/a | `SourceSurface` = web, desktop, mobile, cli, vscode, chrome | Which app produced a row or event | T/suite-contracts.ts:22 |
| Origin surface | n/a | n/a | column `origin_surface`; values include `api` | Table column naming the producing app; adds `api` to the six | T/concept-registry.json:~40 (`originSurfaces`) |
| Synced app surfaces | n/a | n/a | `SyncedAppSurface` = web, desktop, mobile | The three apps whose Cloud chats sync | T/suite-contracts.ts:26 |
| Developer surfaces | n/a | n/a | `DeveloperSessionSurface` = cli, vscode, chrome | Apps that share developer sessions | T/suite-contracts.ts:28 |
| Available now / Coming soon | "Available now", "Coming soon" | same | `AVAILABLE_NOW_LABEL`, `COMING_SOON_LABEL`, `SURFACE_STATUS` | Release status shown per app | W/lib/surface-status.ts:3-13 |
| Get notified | "Get notified" | same | `NOTIFY_CTA` | Call to action for unreleased apps that keep a notify list (mobile, VS Code, Chrome) | W/lib/surface-status.ts:51-75 |
| Core engines (Rust) | n/a | n/a | crates `agiworkforce-agent-core`, `-llm`, `-mcp`, `-protocol`, `-app-server`, `-worktree` and others | Shared Rust used by desktop and CLI | crates/*/Cargo.toml (description lines) |
| Hosted API surface | n/a | n/a | `apps/web/app/api` | Server routes every app calls; named `apiRoot` | T/terminology.json (`namedSurfaces`) |
| Provider package | n/a | n/a | `provider:<folder>` under `packages/ai/providers` (anthropic, deepseek, google, groq, lmstudio, minimax, moonshot, nvidia, ollama, openai, openrouter, perplexity, qwen, vercel-gateway, workers-ai, xai, zhipu; plus `factory`) | One adapter per model API or local runtime | packages/ai/providers/README.md (Current leaf packages) |

Implementation status: all rows above are defined in code. Verification status: `[unknown]`.

## Plans and billing

### Plan tiers

One tier type, `BillingPlanTier`, names every plan (T/billing-catalog.ts:5-15). The label a person sees is `BILLING_PLAN_PRICING[tier].label` (T/billing-catalog.ts:166-232). Prices below are the catalog values at the cited lines; they are configuration, so read the file for current numbers.

| Tier id (`plan:`) | User sees | Interface label | Meaning | Defined |
| --- | --- | --- | --- | --- |
| `local-only` | Local | "Local Mode" (catalog); "Local-only" (pricing page) | Free of charge; no plan credits; no managed cloud use | T/billing-catalog.ts:167; I/pricing.json:3 |
| `byok` | BYOK | "Local Mode + BYOK" (catalog); "BYOK" (pricing page) | Free of charge; the user's own provider key pays the provider | T/billing-catalog.ts:173; I/pricing.json:4 |
| `free` | Free | "Free" | Entry Cloud plan with a managed allowance | T/billing-catalog.ts:179; I/pricing.json:2 |
| `basic` | Basic | "Basic" | First paid plan (catalog price 7 USD a month) | T/billing-catalog.ts:185 |
| `pro` | Premium | "Premium" | Renamed label; the id still says `pro` (catalog price 20 USD a month) | T/billing-catalog.ts:191; I/pricing.json:5 |
| `max` | Max | "Max" | 100 USD a month in the catalog | T/billing-catalog.ts:197; I/pricing.json:26 |
| `max_15x` | Ultra | "Ultra" | Top individual plan, 200 USD a month in the catalog; the id carries the old multiplier name | T/billing-catalog.ts:203 |
| `team` | Team | "Team" | Per-seat plan, standard seat; yearly billing offered | T/billing-catalog.ts:209 |
| `team_premium` | Team Premium | "Team Premium"; seat type label "Premium" | A premium seat inside a Team; wire form is `team` plus `seat_type: premium` | T/billing-catalog.ts:62-65, 73-76, 218 |
| `enterprise` | Enterprise | "Enterprise" | Contract priced; sold by sales | T/billing-catalog.ts:225; I/pricing.json:27 |
| Legacy tier spellings | hobby, pro_plus | none | `hobby` folds to `basic`; `pro_plus` folds to `max` | T/billing-catalog.ts:1029-1033 |
| Unknown tier | Free | none | `normalizeBillingPlanTier` returns `free` for anything unknown | T/billing-catalog.ts:1035-1041 |
| Self-serve ladder | Basic, Premium, Max, Ultra | none | `SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER`; `getNextUpgradeTier` walks it | T/billing-catalog.ts:32-37, 847 |
| Team seat type | Standard, Premium | "Standard", "Premium" | `TeamSeatType` `standard` or `premium` | T/billing-catalog.ts:57-76 |
| Plan catalog version | n/a | n/a | `BILLING_PLAN_CATALOG_VERSION` (4); stored with each subscription | T/billing-plan-catalog.ts:18 |
| Grandfathered yearly | "yearly billing no longer available" notice | notice text | `WITHDRAWN_BILLING_INTERVALS` withdraws yearly for `pro` | T/billing-plan-catalog.ts:43-46 |

### Entitlements, limits and capabilities

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Entitlement | what your plan includes | "Your plan does not include ..." | `BillingPlanCapability`, `BILLING_PLAN_CAPABILITY_TIERS` | One list of capabilities and the tiers that carry each | T/billing-catalog.ts:302-370; T/terminology.json (`entitlement`) |
| Capability (platform) | n/a | n/a | `PlatformCapability` in `T/capabilities.ts` | What the product can do on an app before asking who may; different from an entitlement | T/terminology.json (`capability`) |
| Policy | n/a | n/a | `WORKSPACE_FEATURES` | What an organization lets members do, whatever the plan | T/terminology.json (`policy`) |
| Permission | n/a | n/a | `ADMIN_PERMISSION_AREAS` | What a member's role may administer | T/terminology.json (`permission`) |
| Cloud chat | "Cloud chat on web, desktop, mobile and Chrome" | same | capability `managed_chat` | Available on `free` and every paid tier | T/billing-catalog.ts:343-350, 402-404 |
| AGI Work (billing) | "AGI Work" | same | capability `agi_work` | Needs `pro` or above; note the billing label keeps the "AGI" prefix while the app label is "Work" | T/billing-catalog.ts:354, 412 |
| Remote Control (billing) | "Remote Control" | same | capability `remote_control` | Paid tiers only | T/billing-catalog.ts:352 |
| Cloud in the CLI and VS Code | same | same | capability `developer_surfaces` | `pro` and above | T/billing-catalog.ts:359, 417 |
| Video generation | "Video generation" | same | capability `video_generation` | Only `max_15x` and `enterprise` | T/billing-catalog.ts:357 |
| Team administration | same | same | capability `team_admin` | team, team_premium, enterprise | T/billing-catalog.ts:361 |
| AGI Code (plan test) | "AGI Code" in usage breakdown | "AGI Code" | `planIncludesAgiCode`, `agiCodeMinimumPlan` | True when a plan has sandboxes and a daily coding budget; a different test from the `developer_surfaces` capability | T/billing-catalog.ts:449-456, 839-845 |
| Usage workload | Chat, AGI Work, Deep Research, AGI Code, Browser, Not attributed | same | `USAGE_WORKLOAD_LABELS` keys chat, work, research, code, browser, unknown | Labels in usage breakdowns | T/billing-catalog.ts:449-456 |
| Plan product limits | n/a | n/a | `BILLING_PLAN_PRODUCT_LIMITS` | Per plan: projects, MCP servers, concurrent turns, sandboxes, connector tools, scheduled tasks, attachment sizes | T/billing-catalog.ts:524-541, 580-730 |
| Sandbox ceiling | n/a | n/a | `MAX_MANAGED_SANDBOXES_PER_USER` | Hard per-user cap on live managed sandboxes | T/billing-catalog.ts:473 |
| Free daily caps | n/a | n/a | `FREE_DAILY_CAPS` | Daily caps on writes, conversations, egress, emails, vector queries for Free | T/billing-catalog.ts:484-490 |
| Entitled statuses | active, trialing | n/a | `ENTITLED_SUBSCRIPTION_STATUSES` | Subscription states that count as entitled | T/subscription-entitlement.ts:3 |
| Subscription row | n/a | n/a | `table:subscriptions` (concept `subscription`) | The stored plan record | T/concept-registry.json:1019 |

### Credits, usage and top-ups

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Credit | credits | "{n} credits", "~{n} credit" | `MICROUSD_PER_CREDIT` = 5000 so `CREDITS_PER_USD` = 200 | Unit of managed usage; an allocation of spend, not a currency | T/credits.ts:1-6; I/chat.json (`approxCredits`) |
| microUSD | n/a | n/a | integer amounts in `token_credits`, `credit_transactions` | Balance stored as whole millionths of a dollar so rounding cannot drift | T/product-plan.ts:~60-68; T/credits.ts:1 |
| Credit bucket | n/a | n/a | `table:token_credits`, `table:credit_transactions`, `table:bonus_credit_grants`, `table:expiring_credit_purchases` | Where credit balances live | T/concept-registry.json:1051 |
| Usage reservation | n/a | n/a | `table:managed_usage_requests` | A hold placed before a managed turn settles | T/concept-registry.json:1097 |
| Top-up | "Top up" | amounts 20, 50, 100, 250, 1000 USD presets | `TOP_UP_UNITS_PER_USD` = 50, `quoteTopUp`, `api:POST /api/billing/top-up` | One-off credit purchase; this constant (50) differs from the 200 above, see open questions | T/billing-topups.ts:5-15, 63-79; W/app/api/billing/top-up/route.ts:280 |
| Auto-reload | "Auto-reload" | threshold in credits (default 500) | `AUTO_RELOAD_*`, `api:GET /api/billing/auto-reload`, `api:PUT /api/billing/auto-reload` | Automatic top-up when balance falls below a threshold; adds a 5 percent extra discount | T/billing-topups.ts:9-12; W/app/api/billing/auto-reload/route.ts:109, 116 |
| Top-up discount brackets | discount % | n/a | `TOP_UP_DISCOUNT_BRACKETS` 5, 10, 20, 30 percent from 50, 100, 250, 1000 USD | Bigger top-ups cost less per credit | T/billing-topups.ts:17-23 |
| Purchased-credit expiry | n/a | n/a | `PURCHASED_CREDIT_EXPIRY_RULES` (a JP rule of 6 months) | Country rule that makes bought credits expire | T/billing-topups.ts:201-203 |
| Usage credits (overage) | "usage credits" | "Turn them on in Settings > Billing" | `overage_enabled`, `api:GET /api/billing/overage`, `api:PUT /api/billing/overage` | Switch that lets paid use continue by billing credits after the plan allowance | T/fast-mode.ts:1-6; W/app/api/billing/overage/route.ts:98-99 |
| Current session | "Current session" | "for this 5-hour window" | `ManagedUsageBucket` `session`; limit field `fiveHourCredits` | Rolling five-hour allowance | T/usage-vocabulary.ts:21-42; T/managed-usage-limits.ts:11-17 |
| This week | "This week" | same | bucket `weekly`; `weeklyCredits` | Rolling weekly allowance across models | T/usage-vocabulary.ts:43-48 |
| Most capable models | "Most capable models" | same | bucket `weeklyFlagship`; `FLAGSHIP_OF_WEEKLY_BUDGET_RATIO` = 0.3 | Share of the weekly allowance reserved for the largest models | T/usage-vocabulary.ts:49-54; T/managed-usage-limits.ts:27 |
| This billing period | "This billing period" | same | bucket `period`; `monthlyCredits` | Monthly allowance; resets on the billing date | T/usage-vocabulary.ts:55-60 |
| Managed usage limits | n/a | n/a | `MANAGED_USAGE_LIMITS`, `PLAN_CREDIT_ALLOWANCES` | Per-plan credit allowance table (monthly, weekly, 5-hour) | T/managed-usage-limits.ts:31-85, 294 |
| Usage urgency | info, warning, critical | usage bar colour | `getUsageUrgency` (90 and 95 percent) | One severity ladder for every usage meter | T/usage-vocabulary.ts:5-19 |
| Quota block kind | n/a | upgrade or reset card | `ManagedQuotaBlockKind`: free_trial, rolling_window, billing_period, rate_limit, plan_capability | Why a managed request was refused | T/billing-catalog.ts:862-872 |
| Paywall feature | "You have reached your ... limit" | headline text | `PaywallFeature`, `PAYWALL_FEATURE_COPY` | Keys naming what a paywall is about (one key names a model family; the file does not need repeating here) | T/paywall-vocabulary.ts:1-70 |
| Usage recovery | add credits, enable usage credits, upgrade, wait | button text | `WorkUsageRecovery` | What the UI offers after a usage block | T/work-usage.ts:20-40 |
| Cap modal | "You've hit your message limit" | buttons: Switch to a smaller model, Wait until reset, Dismiss until next reset | `capModal` | Desktop dialog when a limit is reached | I/v3.json:143-149 |
| Rate card | n/a | n/a | `FEATURE_RATE_CARD`, `RATE_CARD_FEATURES` | Table of non-chat costs (search, images, voice, sandboxes, storage); `AGENTIC_SEARCH_LABEL` = "Agentic search" | T/rate-card.ts:25-60, 125 |
| Currencies | USD, INR | "Show pricing in", "India" | `BILLING_CURRENCIES`, GST included for INR terms | Display and charge currencies | T/billing-catalog.ts:1131; I/pricing.json (`currencyLabel`) |
| Upgrade waitlist / access code | "Join the {plan} waitlist", "Enter access code" | same | pricing page CTAs; copy in `PAID_UPGRADE_ACCESS_NOTE` | Paid upgrades can be closed per account; the page offers a waitlist or code | I/pricing.json:213-215; W/lib/billing/paid-upgrade-copy.ts:3 |
| Managed-compute kill switch | n/a | n/a | env `AGI_MANAGED_COMPUTE_PRIVATE_BETA` set to 0, false or off | Incident switch that refuses Cloud compute | W/lib/managed-compute-gate.ts:40, 55-58 |
| Native purchases flag | n/a | n/a | `nativePurchases: false` in `M/src/features/billing/storePurchases.json` | When false the mobile build shows no purchase control | M/src/features/billing/storePurchases.json:2 |
| Mobile store products | n/a | n/a | `MOBILE_IAP_SUBSCRIPTION_PRODUCT_KEYS`, `MOBILE_IAP_TOP_UP_AMOUNTS_USD` (10, 20, 50, 100) | Product keys for store sales, dormant while the flag is false | T/mobile-iap.ts:15-31 |
| Trial days | n/a | "Start free trial" | `trialDays`, `getPlanTrialDays` | Optional per-plan trial length | T/billing-catalog.ts:150, 1047 |

Implementation status: defined and consumed in the cited files. Verification status: `[unknown]`.

## Modes and execution

"Mode" means at least six different things in this repository. Each has its own row.

### The three trust modes

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Local (`mode:local`) | Local | "Local" | `PrivacyMode` `local`; `ChatExecutionMode` `local_only` labelled "Local Mode + Local LLMs"; `ProviderMode` `Local` | Runs on the device or local host; must not call Cloud or a BYOK provider; never syncs | T/suite-contracts.ts:18, 67-72, 118-125; T/trust-mode-contract.ts:50-59 |
| Own key (`mode:own-key`) | BYOK | "BYOK"; "Local Mode + BYOK" | `PrivacyMode` `byok`; `ChatExecutionMode` `byok`; `ProviderMode` `DirectByok` | Requests go straight to the user's own provider key; no plan credits spent; same-trust-boundary failover | T/suite-contracts.ts:73-78, 99-103, 126-132; T/trust-mode-contract.ts:61-68 |
| Cloud (`mode:cloud`) | Cloud | "Cloud" | `PrivacyMode` `managed`; `ChatExecutionMode` `cloud_managed`; `ProviderMode` `ManagedGateway` (label "Cloud gateway") or `ManagedNative` ("Cloud service") | Uses our hosted provider access; spends plan credits; syncs across devices | T/suite-contracts.ts:79-83, 105-115, 133-140; T/trust-mode-contract.ts:69-76 |
| Usage implication | one sentence per mode | n/a | `PRIVACY_MODE_USAGE_IMPLICATION` | Local and BYOK spend no plan credits; Cloud spends them | T/suite-contracts.ts:85-89 |
| Provider id `managed_cloud` | Cloud | provider list entry "Cloud" | `Provider` value `managed_cloud` | The provider name for our own hosted route | T/provider.ts:78; I/models.json:3 |
| Trust mode contract | n/a | n/a | `TRUST_MODE_CONTRACTS` (storage, key attribution, failover, cloud egress, sync, fallback approval) | One object stating what each mode promises | T/trust-mode-contract.ts:50-84 |
| Failover policy | n/a | n/a | `refuse`, `same-trust-boundary`, `any-eligible-route` | What may serve a turn when the chosen route fails | T/trust-mode-contract.ts:27 |
| Downgrade | n/a | refusal reasons | `isDowngrade`, `TRUST_TRANSITION_REFUSAL_REASONS` | Moving to a weaker mode is a refusal a caller must handle, not a silent fallback | T/trust-mode-contract.ts:100-113 |
| Fork | "Opens a separate BYOK chat. This Local chat stays on this device." | same | rule "Local to BYOK is a fork" | A Local chat is never converted; a new chat starts | I/models.json:87; docs/product/suite.md (Trust Modes) `[requirement]` |
| Managed (word) | Cloud | n/a | `managed`, `Managed Cloud` in `ManagedCloud*Wire` types | The internal word for Cloud; do not show it to users | T/suite-contracts.ts:37; T/concept-registry.json:60 |

### Other things called "mode"

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Desktop app mode | Local / Cloud toggle | "Local", "Cloud", "Switch between Local and Cloud" | `AppMode` `local` or `cloud` (two values only) | Desktop shell switch; `local` is coerced to `cloud` when the host cannot do Local | D/stores/appModeStore.ts:9, 32; I/v3.json:61-71 |
| Mobile app mode | Local / Cloud | same | `MobileChatAppMode` | Same two-value switch on the phone; every write passes an admission check | M/src/features/chat/store/appModeStore.ts:5, 36-60 |
| Supports local app mode | n/a | toast and tooltip "Local mode runs in CLI through Ollama or LM Studio. Desktop conversations use cloud." | `supportsLocalAppMode` = Tauri or a dev flag | The public Electron Desktop cannot enter Local; see open questions | D/lib/runtimeEnvironment.ts:6-21; I/v3.json:68 |
| Shell mode (V3) | n/a | n/a | `V3Mode` = `'chat'` only; "V3" names the current desktop shell and `v3.json` | Legacy type kept by the V3 shell | D/features/v3/DesktopShellV3.tsx:116 |
| Interaction mode | Chat, Work, /search, Deep Research, /code, Create Office files, Create image, Create video, Start voice mode, Study | labels from the registry | `InteractionModeId`: chat, agiwork, search, research, code, office, image, video, voice, study | The ways to address the product; each names its selector, request field, gate and trust modes | T/interaction-modes.json:3-381; T/interaction-modes.ts:1-60 |
| Work mode (request) | Chat or Work | n/a | request field `work_mode`; `CLOUD_WORK_MODES` = chat, agiwork | Which of the two chat-completions work modes a request asks for | T/runtime.ts:17-20; T/interaction-modes.json:3-60 |
| Response style | Default, Concise, Detailed, Technical, Creative | "Response Style" | composer styles | Tone setting; not a mode of execution | I/chat.json (`composer.styles`) |
| Agent mode (legacy setting) | "Agent Mode", "Compact Mode" | settings toggles | `agentMode`, `compactMode` | Old chat settings strings | I/settings.json (`agentMode`); I/chat.json (`agentMode`) |
| Thinking / Effort | Direct, Brief, Quick, Balanced, Deep, Extended, Maximum | effort picker | `Effort` none, minimal, low, medium, high, xhigh, max | Reasoning depth setting | T/design-system/effort.ts:1-11 |
| Fast mode | "Fast mode" | "Fast mode is available on paid plans and is billed to usage credits." | `resolveFastModeAvailability`, feature `fast_mode` (beta) | Faster route; needs paid plan, workspace consent and usage credits | T/fast-mode.ts:1-30; T/feature-registry.json:593 |
| Temporary chat | "Temporary chat" | "Won't be saved to your history and skips memory for this turn." | header.temporaryChat; purge cron `purge-temporary-chats` | Chat that is not kept | I/chat.json:249; T/concept-registry.json:97 |

### Model routing terms

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Auto | Auto | "Auto (Recommended)", "Best (auto)" | alias `auto` (profile `balanced`) | Routes each message to a model by task, plan and cost | I/models.json:20, 47; packages/ai/model-registry/catalog/routing-policies.json:384-410, 538-560 |
| Economy, Balanced, Best | not selectable directly | Economy, Balanced, Best | aliases `auto-economy`, `auto-balanced`, `auto-premium` | The three Auto profiles; `premium` is shown as "Best" | packages/ai/model-registry/catalog/routing-policies.json:538-560 |
| Picker tier | economy, balanced, premium | n/a | `PickerModelTier` | Model tier in pickers; a different "tier" from plan tiers | T/model-catalog.ts:249 |
| Subscription access tier | free, basic, pro, max, enterprise | n/a | `SubscriptionAccessTier` | Plan level a model requires; a second spelling of plan tiers, flagged for merge by 2026-12-01 | T/model-catalog.ts:1962; T/concept-registry.json:1415-1425 |
| Task Routing | "Task Routing" | "Configure different models for different task types" | `taskRouting` | Settings for per-task model choice | I/models.json:35-36 |
| Model family slot | n/a | n/a | `family:<provider>/<family>` | Which generation of a model family is live | packages/ai/model-registry/catalog/model-families.json; AGENTS.md:69 |
| Local runtime names | Ollama, LM Studio | "Set up a local model" | `provider:ollama`, `provider:lmstudio`; on-device runtimes in `OnDeviceRuntime` | Where Local mode finds models | T/on-device-models.ts:1; I/models.json:76-78 |
| Local LLM tiers | n/a | n/a | `tier1`, `tier2`, `tier3` in `@agiworkforce/local-llm`; `Tier1Status` | Levels of on-device inference, with tier 1 being the system model | packages/platform/local-llm/src/types.ts:5-13 |

Implementation status: defined in code. Verification status: `[unknown]`. Execution boundaries per mode are stated in `T/trust-mode-contract.ts:50-84` (storage and egress) and come from code, not from this page.

## Features

### The Scheduled chain

One feature carries five names. They all point at a task the product runs later without being asked again.

| Where | Label the user sees | Code name | Defined |
| --- | --- | --- | --- |
| Feature registry | "Schedules" | feature id `schedules`, domain `scheduler`, entitlement `agi_work`, trust boundary managed-cloud | T/feature-registry.json:201-217 |
| Web sidebar | "Scheduled" (`navSchedules`) | nav id `schedules`, route `/chat/schedules` | W/shared/components/layout/app-nav-items.ts:152-160; I/common.json:101 |
| Desktop sidebar | "Schedules" | nav id `scheduled` mapped to view `work-scheduled`; panel `scheduled` (device) or `cloud-schedules` (Cloud mode); component `AgiWorkScheduled`; Cloud component `DesktopCloudSchedules` | D/features/v3/Sidebar.tsx:150, 323; D/features/v3/DesktopShellV3.tsx:656-664; D/features/v3/AgiWorkScheduled.tsx:488; D/features/schedules/DesktopCloudSchedules.tsx:898; I/v3.json:89 |
| Desktop screen heading | "Scheduled tasks" | `agiWork.scheduled` strings; "Keep this Mac awake for scheduled tasks" | I/v3.json:366-372 |
| Desktop task panel tab | "Scheduled" (hard-coded, not translated) | tab id `scheduled` in `AgentTaskPanel` | D/features/agi/AgentTaskPanel.tsx:12-15 |
| Mobile drawer | "Schedules" | `drawer.schedules`; `ScheduleTriggersScreen` | M/src/features/drawer/components/DrawerContent.tsx:132; I/common.json:213; M/src/features/schedules/ScheduleTriggersScreen.tsx |
| API | n/a | `api:GET /api/schedules`, `api:POST /api/schedules`; triggers `api:GET /api/triggers`, `api:POST /api/triggers` | W/app/api/schedules/route.ts:138-139; W/app/api/triggers/route.ts:114-115 |
| Database | n/a | `table:scheduled_tasks`, `table:scheduled_task_runs`; concept `schedule` labelled "Scheduled task" | T/concept-registry.json:218-250 |

### Product features

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Work | Work | "Work", "What should we get done?" | interaction mode `agiwork`; capability `agi_work`; feature `work`; desktop nav id `tasks`; i18n namespace `agiWork`; mode id in `AGI_WORK_MODE` | Multi-step tasks with tools, files and reviewable deliverables. Many names for one thing | T/interaction-modes.json:45-86; T/runtime.ts:17; I/v3.json:87, 313; I/chat.json:90, 193 |
| Code (feature) | Code | "Code" | feature `code`, interaction mode `code` (`/code`), capability `developer_surfaces` | Three different things share it: the developer features, the `/code` run-in-sandbox command, and the VS Code app | T/feature-registry.json:20; T/interaction-modes.json:171; I/common.json:73 |
| Dispatch | Dispatch | "Send tasks from your phone, run them on this Mac" | `dispatch.ts` HMAC envelope | Phone-to-Mac task sending with signed messages | I/v3.json:335; T/dispatch.ts:1-30 |
| Remote Control | Remote Control | "Pair your phone to follow the AGI sessions" | feature `remote_control` (experimental), capability `remote_control` | Phone follows and approves desktop or editor sessions | T/feature-registry.json:175; I/vscode.json (`remote.intro`) |
| Pairing | Pairing code | "Pairing code" | `api:POST /api/pair/initiate` | Links a phone to a host | W/app/api/pair/initiate/route.ts:47; I/vscode.json (`remote.pairingCode`) |
| Ask from Siri | "Ask from Siri" | setting on mobile | `askIntentToken`, `table:mobile_intent_tokens` | Siri entry; cloud only | M/src/features/siri/askIntentToken.ts; T/concept-registry.json:~1266 |
| Quick ask | n/a | n/a | web route `/quick-ask` | Fast entry page | W/app/quick-ask |
| Library | Library | "Library" | nav id `library`, route `/chat/library` | One place for artifacts and files; `/chat/artifacts` redirects here | W/shared/components/layout/app-nav-items.ts:108-121 |
| Artifact | Artifact | "Artifact", "Open artifact" | concept `artifact`, tables `web_artifacts`, `published_artifacts` | A document or program the assistant made that the user keeps | T/concept-registry.json:329; T/terminology.json (`artifact`) |
| Live artifacts | Live artifacts | "Live artifacts" | nav id `live-artifacts`, route `/chat/live-artifacts`, capability `artifact_connectors` | Published apps that can use AI and connected apps | W/shared/components/layout/app-nav-items.ts:162; I/common.json:102 |
| Sites | Sites | "Sites", "Published sites" | nav id `sites`, route `/chat/sites` | Published pages | W/shared/components/layout/app-nav-items.ts:124-132; I/common.json:99 |
| Agents (nav) | Agents | "Agents" | nav id `agents`, route `/chat/agents`, `api:GET /api/custom-agents`, `api:POST /api/custom-agents` | User-made custom agents | W/shared/components/layout/app-nav-items.ts:171; W/app/api/custom-agents/route.ts:44-45 |
| Health | Health | "Health" | nav id `health`, needs the health space | Health area, shown only when enabled | W/shared/components/layout/app-nav-items.ts:133-141 |
| Study | Study | "Study" | nav id `study`, interaction mode `study`, feature `study` | One-idea-at-a-time learning | W/shared/components/layout/app-nav-items.ts:143-150; T/interaction-modes.json:381 |
| Projects | Projects | "Projects" | concept `project`, `table:user_projects`, `api:GET /api/projects`, `api:POST /api/projects` | Grouping of chats, files and instructions | T/concept-registry.json:144; W/app/api/projects/route.ts:255-256 |
| Memory | Memory | "Memory" | concept `memory`, `table:user_memories` | Facts the assistant keeps about the user | T/concept-registry.json:179 |
| Skill | Skills | "Skills", "Add skill" | concept `skill`, `api:GET /api/skills` | Reusable instruction bundle; some ship to customers | T/concept-registry.json:252; W/app/api/skills/route.ts:261; AGENTS.md:113-116 |
| Plugin | Plugins | "Plugins", "Installed plugins" | feature `plugins` (beta) | Server-side tools the assistant can call; different from connectors | T/feature-registry.json:71; I/v3.json (`plugins.installedDesc`) |
| Connector | Connectors | "Connectors", "Connected apps" | concept `connector`, capability `connectors` | A connection to a third party the account authorized; permission per tool is Allow, Ask or Never | T/concept-registry.json:284; I/v3.json (`connectors.perm`) |
| Customize | Customize | "Customize" with tabs Skills, Connectors, Plugins | desktop nav id `customize` mapped to view `settings` | Desktop hub; chat strings call it "Customize Hub" | D/features/v3/Sidebar.tsx:150, 325; I/v3.json:209; I/chat.json:263 |
| Workspace | Workspace | "Workspace" (settings tab for teams) | `table:workspaces`; settings key `nav.team` | Container a member switches between; not the same as organization | I/settings.json:82; T/terminology.json (`workspace`) |
| Deep Research | Deep Research | "Research complete", "Planning research" | interaction mode `research`, `api:GET /api/research/reports` is not asserted | Planned multi-round investigation with a sourced report | T/interaction-modes.json:129; I/chat.json:282 |
| Computer use | Computer use | "Computer use" | feature `computer_use` (experimental) | Agent drives the device; needs the desktop | T/feature-registry.json:149; I/settings.json:101 |
| Browser | Browser | "/browser", "Browser" | feature `browser` (beta); browser extension host | Page-aware assistant | T/feature-registry.json:123 |
| Voice | Voice | "Start voice mode" | feature `voice`; routes under `/api/voice/live/sessions` | Live speech | T/feature-registry.json:397; W/app/api/voice/live/sessions/route.ts |
| Rewind checkpoints | "Rewind checkpoints" | same | `rewind`, crate `agiworkforce-worktree` | Restore files to a point before an agent turn | I/chat.json:265; packages/ui/unified-chat/src/lib/slashCommands.ts:202; crates/agiworkforce-worktree/Cargo.toml |
| Goal handoff | "Run as task" | "This reads like a goal. Run it as an agent task instead?" | `goalHandoff` | Offer to turn a chat into an agent task | I/chat.json:237-242 |
| Agent Tasks | "Agent Tasks" panel | tabs Scheduled, Agents, Background | `agent-tasks` panel id | Desktop list of running and scheduled agent work | I/chat.json:237; D/features/v3/shellPanels.ts:5-18 |
| Automations / Routines | "Automations", "Routines" | sidebar labels | desktop panel id `automation` (device only); `routines` label exists | `automation` is a device panel; I did not find a consumer for the Routines label `[unknown]` | I/v3.json:92, 95; D/features/v3/shellPanels.ts:18 |
| Event triggers | n/a | n/a | feature `event_triggers` (beta) | Run work when an event arrives | T/feature-registry.json:218 |
| Cloud tasks | n/a | n/a | feature `cloud_tasks` | Cloud agent runs; tables `cloud_agent_runs` | T/feature-registry.json:542; T/concept-registry.json:1310 |
| Feature maturity | n/a | n/a | general_availability, beta, experimental | Registry maturity levels | T/feature-registry.json:3-593 |
| Reflect, Time and focus | "Reflect", "Time and focus" | settings tabs | `nav.reflect`, `nav.time-focus` | Settings areas; behaviour not traced `[unknown]` | I/settings.json:91-92 |
| Referrals | Referrals | "Referrals" | settings tab `nav.referrals` | Referral settings | I/settings.json (`nav.referrals`) |

Implementation status: all rows exist as labels or code; connection of each screen to a working backend was not traced except where a route is cited. Verification status: `[unknown]`.

## Agents and tools

| Term | User sees | Interface label | Internal name | Meaning | Defined |
| --- | --- | --- | --- | --- | --- |
| Agent (product) | Agent, Agents | "Agents" nav, "AGI Agent" in the naming policy | custom agents API; `AGI Agent` is a naming-policy term | Delegated tool-using session or a user-made agent; the policy word is `[requirement]` | docs/standards/naming-conventions.md:35; W/app/api/custom-agents/route.ts:44 |
| Developer session | developer session | "Open a workspace folder before starting a developer session." | `agiworkforce-protocol`, `agiworkforce-app-server` | A local coding session shared by CLI, VS Code and Desktop | crates/agiworkforce-app-server/Cargo.toml; I/vscode.json (`chatNotice.openWorkspace`) |
| Handoff | "reviewed handoff" | "Start a session in this window from the {source} thread?" | context-handoff and developer-session-handoff URIs | The explicit way to move work between contexts | T/context-handoff-uri.ts; I/vscode.json:80 |
| Agent run | n/a | n/a | concept `agent-run`, tables `cloud_agent_runs`, `cloud_agent_events`, `cloud_agent_approval_checkpoints` | Stored record of a cloud agent run | T/concept-registry.json:1310 |
| Agent turn loop | n/a | n/a | crate `agiworkforce-agent-core`, trait `TurnHost` | Host-agnostic loop that drives a model stream and tool calls | crates/agiworkforce-agent-core/Cargo.toml |
| Tool primitive | n/a | n/a | `ToolDefinition`, `ToolApprovalRequest`, `ToolResult` (generated from Rust) | The one tool shape every app maps onto | T/tool-primitive.ts:1-50 |
| Tool approval | "Tool approvals", Allow / Ask / Never | approval prompts | feature `approvals`; `tool-approval-policy.ts` | User gate before a risky tool runs | T/feature-registry.json:474; I/v3.json (`connectors.perm`) |
| Chat tool ids | web search, code execution, office creation | "Web search and browsing", "Code execution" | `web_search`, `code_execution`, `office_creation` | Tool ids the interaction modes require or allow | T/interaction-modes.json:3-381; I/v3.json (`compose.toolWebSearch`) |
| Built-in tool names | Read, Write, Edit, MultiEdit, ApplyPatch, LS, Glob, Search, Grep, CodeSearch, Bash, WebSearch, WebFetch, Memory, Git, ImageGen | tool icons in the chat | `TOOL_ICON_NAME` | Names the UI knows how to draw | T/tool-display.ts:22-40 |
| Tool display category | search, browser, code, file, terminal, media, data, communication, system | icon group | `ToolDisplayCategory` | Group used for tool icons | T/tool-display.ts:1-11 |
| Slash commands | /search, /think, /image, /code, /browser, /terminal, /database; plus rewind, plan, clear, compact, model, memory, help | same | `BUILT_IN_SLASH_COMMANDS` | Composer shortcuts shared by apps | packages/ui/unified-chat/src/lib/slashCommands.ts:30-300 |
| Plugin cards | Calculator, Python Sandbox, Image Generation, TypeScript REPL | same | `plugins.card` | Built-in plugins listed in Customize | I/v3.json:302-309 |
| MCP | MCP | "MCP server" | feature `mcp` (beta), crate `agiworkforce-mcp`, package `packages/tools/mcp` | Model Context Protocol tool servers | T/feature-registry.json:448; crates/agiworkforce-mcp/Cargo.toml |
| Hooks | Hooks | n/a | feature `hooks` (beta) | User scripts on tool events | T/feature-registry.json:97 |
| Exec policy | n/a | n/a | crate `agiworkforce-execpolicy` | Prefix rules that decide shell commands | crates/agiworkforce-execpolicy/Cargo.toml |
| Sandbox policy | n/a | n/a | crate `agiworkforce-sandbox-policy`, `infrastructure/sandbox` | Policy model for sandboxes | crates/agiworkforce-sandbox-policy/Cargo.toml |
| Managed sandbox | n/a | n/a | `maxSandboxes`, `SANDBOX_COMPUTE_RATE_ENV` | A hosted code environment, counted per plan | T/billing-catalog.ts:473; T/rate-card.ts:491 |
| Apply patch tool | n/a | n/a | `packages/tools/apply-patch` | Patch-applying tool | packages/tools |
| Browser tool | n/a | n/a | `packages/tools/browser-tool` | Browser automation tool | packages/tools |
| Operator | n/a | n/a | web route `/operator` | An operator console page; purpose not traced `[unknown]` | W/app/operator/page.tsx |
| orch-scout | n/a | n/a | `.claude/agents/orch-scout.md` | Read-only finder agent for bounded questions | .claude/agents/orch-scout.md:1-8 |
| orch-builder | n/a | n/a | `.claude/agents/orch-builder.md` | Coding and execution worker | .claude/agents/orch-builder.md:1-10 |
| orch-principal | n/a | n/a | `.claude/agents/orch-principal.md` | Judgment-heavy general worker | .claude/agents/orch-principal.md:1-10 |
| orch-assessor | n/a | n/a | `.claude/agents/orch-assessor.md` | Independent second reader | .claude/agents/orch-assessor.md:1-8 |
| Explore | n/a | n/a | `.claude/agents/Explore.md` | Read-only codebase search agent | .claude/agents/Explore.md:1-8 |
| Orchestrator | n/a | n/a | `.agents/skills/orchestrator` | Skill that chooses how to delegate and which model family to use | CLAUDE.md:14-19 |

These last six rows are developer-tool agents for people working on the repository. They are not product features. The product agents are the rows above them.

## Engineering terms

| Term | Meaning | Where defined |
| --- | --- | --- |
| AGENTS.md | Canonical rules for every coding agent; `CLAUDE.md` only adapts it | AGENTS.md:1-12; CLAUDE.md:8-10 |
| Source-of-truth precedence | Schemas and code outrank tests, then docs; prose is rank 6 | AGENTS.md:29-43 |
| Ownership | One canonical owner per mutable concept | AGENTS.md:45-52 |
| Model catalog | Generated model list; edit `models.curation.json`, run `pnpm sync:models`; the only place a model id may be a literal | AGENTS.md:53-80 |
| Family slot | `family:<provider>/<family>` names which generation of a family is live | AGENTS.md:69-77; packages/ai/model-registry/catalog/model-families.json |
| Trust boundary | The line between Local, BYOK and Managed; nothing crosses silently | AGENTS.md:118-130 |
| Egress guard | Desktop outbound network funnel `egressGuard.ts` | AGENTS.md:123-127 |
| Protocol types | Rust types exported by ts-rs into `T/generated/protocol`; regenerate with `pnpm generate:protocol-types` | AGENTS.md:88-92 |
| Public Desktop shows hosted web | A change to `apps/desktop/src` never reaches Electron | AGENTS.md:93-96 |
| Neon migration chain | Append-only checksummed migrations in `apps/web/db/neon` | AGENTS.md:97-99 |
| `proxy.ts` | Web routing middleware file, exports `proxy`; do not restore `middleware.ts` | AGENTS.md:100-103 |
| Unified chat | `packages/ui/unified-chat`, shared UI for desktop, web, Chrome and VS Code | AGENTS.md:104-106 |
| Product skill | A skill with `audience: product` in `skills-lock.json`; ships to customers | AGENTS.md:111-114 |
| skills-lock | Pins skill content hashes; regenerate with `node scripts/verify-skills-lock.mjs --regenerate` | CLAUDE.md:44-49 |
| Guard | A script that fails the build on a rule break, for example `check:model-id-literals` | AGENTS.md:81-82, 130 |
| Guard chain | `pnpm check:llm-operability`, runs every guard four at a time | AGENTS.md:225-236 |
| Priority tiers | Test groups matched to `apps/*/__tests__` paths; only `priority-level-1` and `security` resolve | AGENTS.md:239-241 |
| Lane | A write-scope with disjoint paths for parallel agents | docs/agent-context/lanes.json:1-60 |
| Integrator lane | Owner of shared files (lockfiles, CI, contracts, migrations) | docs/agent-context/lanes.json:7-26 |
| Known flaws | Register of open defects, cited by ID; fixed rows are deleted | AGENTS.md:255-258; docs/agent-context/README.md |
| audit/ | Folder of unfinished work trackers; deleted as work completes | audit/README.md:1-12 |
| Documentation taxonomy | Where each kind of knowledge lives | AGENTS.md:188-215 |
| Heavy job / light job | Scripts that run builds and full suites one at a time (`heavy-job.sh`) or scoped checks (`light-job.sh`) | CLAUDE.md:24-31; scripts/dev/ |
| Concept registry | Machine list of stored concepts, their tables, owners, sync and retention | T/concept-registry.json:1-60 |
| terminology.json | Checked glossary; maps each term to its owning artifact and lists retired words (org, ws, msg, convo, usr, acct, perm, ent) | T/terminology.json:1-120 |
| Tenant / organization / workspace / account | Four different words: tenant is a row scope, organization a billed company, workspace a switchable container, account a person | T/terminology.json:81-85 |
| Duplicate vocabulary | Same idea spelled twice (plan tier vs access tier, effort lists); merge due 2026-12-01 | T/concept-registry.json:1413-1480 |
| Column roles | owner `user_id`, tenant `organization_id`, `server_version`, `deleted_at`, `origin_surface` | T/concept-registry.json:3-50 |
| Feature registry | Machine list of features with maturity, gates and required host | T/feature-registry.json:1-593 |
| Client capability manifest | Per-app declaration of what a client can do | T/client-capability-manifest.ts |
| Interaction-mode guard | `scripts/check-interaction-modes.mjs` resolves each mode's selector, request and gate | scripts/check-interaction-modes.mjs |
| Plan-tier predicate guard | `scripts/check-plan-tier-predicates.mjs` | scripts/check-plan-tier-predicates.mjs |
| File naming guard | `scripts/check-file-naming.mjs`; `.tsx` is PascalCase | docs/standards/naming-conventions.md:79 |
| Structure conventions | Folder per feature, barrels, one concern per file, no `helpers.ts` | docs/standards/naming-conventions.md:88-102 |
| Conventional commits | Lowercase subject; capitalised tokens such as filenames go in the body | AGENTS.md:244-248 |
| Cowork | A competitor term; allowed only as an attributed competitor reference | docs/standards/naming-conventions.md:36 |
| Product-name registry | `PRODUCT_NAMES`; product strings must come from it | AGENTS.md:55-56; T/product-names.ts:7 |

Verification status of all guards named here: `[unknown]` (I did not run them).

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Three trust modes exist with internal ids local, byok, managed and user labels Local, BYOK, Cloud. | read in the code | `packages/contracts/types/src/suite-contracts.ts:18`; `packages/contracts/types/src/suite-contracts.ts:67-83` |
| The chat execution mode ids are local_only, byok and cloud_managed, labelled 'Local Mode + Local LLMs', 'Local Mode + BYOK' and 'Cloud'. Provider modes are Local, DirectByok, ManagedGateway and ManagedNative. | read in the code | `packages/contracts/types/src/suite-contracts.ts:20-24`; `packages/contracts/types/src/suite-contracts.ts:91-140` |
| Local mode never reaches Cloud and never syncs; own-key mode bills the user's key and fails over only inside its trust boundary; Cloud uses the platform key and syncs across devices. | read in the code | `packages/contracts/types/src/trust-mode-contract.ts:50-84` |
| Plan tier ids differ from labels: pro is Premium, max_15x is Ultra, team_premium is Team Premium. Legacy hobby maps to basic and pro_plus maps to max. | read in the code | `packages/contracts/types/src/billing-catalog.ts:166-232`; `packages/contracts/types/src/billing-catalog.ts:1029-1033`; `packages/ui/i18n/locales/en/pricing.json:5` |
| Ten tiers exist: local-only, byok, free, basic, pro, max, max_15x, team, team_premium, enterprise. Unknown values normalise to free. | read in the code | `packages/contracts/types/src/billing-catalog.ts:5-15`; `packages/contracts/types/src/billing-catalog.ts:1035-1041` |
| Team premium is a seat type; on the wire it is the team plan with seat_type premium. | read in the code | `packages/contracts/types/src/billing-catalog.ts:57-76`; `packages/contracts/types/src/billing-catalog.ts:95-103` |
| Plain product names (Chat, Mobile, Desktop, CLI, Extension, Code, Work) come from PRODUCT_NAMES; brand string is AGIWORKFORCE and company name is AGI Workforce. | read in the code | `packages/contracts/types/src/product-names.ts:1-15` |
| Only Web is marked 'Available now' in the web site status map; Desktop, CLI, Mobile, VS Code and Chrome are 'Coming soon'. Desktop platform list is macOS only. | read in the code | `apps/web/lib/surface-status.ts:6-13`; `apps/web/lib/surface-status.ts:40-47` |
| The Scheduled screen has different names per app: web label 'Scheduled' (nav id schedules, /chat/schedules); desktop label 'Schedules' (nav id scheduled, view work-scheduled, component AgiWorkScheduled, Cloud variant cloud-schedules); mobile label 'Schedules'; tables scheduled_tasks and scheduled_task_runs. | read in the code | `apps/web/shared/components/layout/app-nav-items.ts:152-160`; `apps/desktop/src/features/v3/Sidebar.tsx:150`; `apps/desktop/src/features/v3/DesktopShellV3.tsx:656-664`; `packages/contracts/types/src/concept-registry.json:218-250` |
| Work has many internal names: interaction mode id agiwork, capability agi_work, feature work, request field work_mode, desktop nav id tasks, i18n namespace agiWork. The app label is 'Work' but billing labels still say 'AGI Work'. | read in the code | `packages/contracts/types/src/interaction-modes.json:45`; `packages/contracts/types/src/runtime.ts:17-20`; `packages/contracts/types/src/billing-catalog.ts:412`; `packages/ui/i18n/locales/en/v3.json:87` |
| One credit is 5000 microUSD, so 200 credits per USD; the top-up constant is 50 units per USD. Both constants exist and were not reconciled here. | read in the code | `packages/contracts/types/src/credits.ts:3-4`; `packages/contracts/types/src/billing-topups.ts:5` |
| Managed usage has windows: current session (5-hour), this week, most capable models (30 percent of weekly) and this billing period. | read in the code | `packages/contracts/types/src/usage-vocabulary.ts:21-60`; `packages/contracts/types/src/managed-usage-limits.ts:27` |
| The public Electron Desktop cannot enter Local app mode: supportsLocalAppMode is true only for Tauri or a dev flag, and the app mode is forced to cloud otherwise. | read in the code | `apps/desktop/src/lib/runtimeEnvironment.ts:21`; `apps/desktop/src/stores/appModeStore.ts:32`; `apps/desktop/src/features/v3/Sidebar.tsx:171-180` |
| Desktop and mobile app mode have two values (local, cloud) while trust modes have three; BYOK is a separate trust mode, not an app mode toggle. | read in the code | `apps/desktop/src/stores/appModeStore.ts:9`; `apps/mobile/src/features/chat/store/appModeStore.ts:5`; `packages/contracts/types/src/suite-contracts.ts:18` |
| Ten interaction modes are registered: chat, agiwork, search, research, code, office, image, video, voice, study. Only chat and code list local among their trust modes; agiwork, research, office, image, video, voice and study are managed only. | read in the code | `packages/contracts/types/src/interaction-modes.json:3-381` |
| Per-app display names are inconsistent with the registry: Electron productName is Desktop, Tauri productName is AGI, iOS display name is AGI Mobile, VS Code displayName is AGI Code, Chrome manifest name is AGI Extension. | read in the code | `apps/desktop/electron-builder.yml:12`; `apps/desktop/src-tauri/tauri.conf.json:3`; `apps/mobile/app.config.js:81`; `apps/extension-vscode/package.json:3`; `apps/extension/manifest.json:3` |
| Auto routing has three profiles shown as Economy, Balanced and Best; the selectable alias is auto labelled 'Auto' and the picker shows 'Auto (Recommended)'. | read in the code | `packages/ai/model-registry/catalog/routing-policies.json:538-560`; `packages/ui/i18n/locales/en/models.json:20` |
| Plan 'tier' has at least three meanings: BillingPlanTier (what is paid), SubscriptionAccessTier (what a model requires; merge due 2026-12-01) and PickerModelTier (economy, balanced, premium). | read in the code | `packages/contracts/types/src/billing-catalog.ts:5`; `packages/contracts/types/src/model-catalog.ts:1962`; `packages/contracts/types/src/model-catalog.ts:249`; `packages/contracts/types/src/concept-registry.json:1413-1425` |
| Mobile sells nothing in the current build: nativePurchases is false, which hides purchase controls and drops the Play Billing permission. | read in the code | `apps/mobile/src/features/billing/storePurchases.json:2`; `apps/mobile/app.config.js:316` |
| Paid upgrades can be closed per account; the pricing page then offers a waitlist or access code. An environment variable acts as a Cloud kill switch. | read in the code | `apps/web/lib/billing/paid-upgrade-copy.ts:3`; `apps/web/lib/managed-compute-gate.ts:40-58`; `packages/ui/i18n/locales/en/pricing.json:213-215` |
| The CLI primary command is agi with alias agiworkforce; the Cargo package is agiworkforce-cli. | read in the code | `apps/cli/Cargo.toml:3`; `apps/cli/Cargo.toml:15-21` |
| Code means three things: the VS Code app (product key Code), the /code run-in-sandbox interaction mode, and AGI Code the plan test (sandboxes plus a daily coding budget) which differs from the developer_surfaces capability. | read in the code | `packages/contracts/types/src/product-names.ts:13`; `packages/contracts/types/src/interaction-modes.json:171`; `packages/contracts/types/src/billing-catalog.ts:839-845` |
| Free managed monthly credits (2000) exceed Basic's (400) in the allowance table. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:31-50` |
| The repository keeps a checked glossary (terminology.json) that retires abbreviations org, ws, msg, convo, usr, acct, perm, ent. | read in the code | `packages/contracts/types/src/terminology.json:81-110` |
| Four ways to say 'a thing that holds your stuff' differ: account (person), tenant (row scope), organization (billed company), workspace (switchable container). | read in the code | `packages/contracts/types/src/terminology.json:1-30`; `packages/contracts/types/src/terminology.json:81-85` |
| Verification status: none of the glossary rows were run or exercised in an app; all statuses are unknown. | unknown | `no project document read records a run of these screens` (not found) |

## Open questions

- Local inference on Desktop: the requirement says local inference on desktop needs no paid subscription, but supportsLocalAppMode is true only for the Tauri shell or a dev flag, and the Electron build coerces app mode to cloud. Whether the public Desktop is meant to gain Local mode is a product choice the code leaves undecided.
- Local mode and sign-in: the pricing copy says Local needs no account (pricing.json localFeature3), but I did not trace whether the mobile or desktop apps still require sign-in to open. Account requirements for Local are unknown.
- Credits: credits.ts gives 200 credits per USD while billing-topups.ts gives 50 credits per USD for top-ups. I did not establish whether this is a deliberate markup or a defect; both constants are in code.
- Free versus Basic: managed-usage-limits.ts gives Free 2000 monthly credits and Basic 400. I did not establish whether the Free allowance is meant to be spent on cheaper models only.
- Sales dates: a project memory note mentions a date before which no subscriptions are sold on any app. I found no such date in code; the code only shows a waitlist/access-code note and a mobile nativePurchases=false flag.
- Which name wins: PRODUCT_NAMES says Code and Extension, but the VS Code manifest says AGI Code and the Chrome manifest says AGI Extension; Desktop is Desktop in Electron and AGI in Tauri. No document resolves this.
- Work label: app labels say Work while billing labels (BILLING_PLAN_CAPABILITY_LABELS, USAGE_WORKLOAD_LABELS) still say AGI Work. Whether the billing copy should drop the prefix is undecided.
- Scheduled label: web says Scheduled, desktop and mobile say Schedules, and the desktop agent task panel hard-codes Scheduled outside i18n.
- Routines and Operator: the Routines nav label and the /operator page exist; I did not trace what they do or whether they are wired.
- Mobile store top-up amounts (10, 20, 50, 100) differ from web presets (20, 50, 100, 250, 1000); I did not check whether that is intended.
- Cloud availability on Desktop strings: v3.json says Cloud is available on Desktop and Local runs in the CLI; whether this copy matches shipped behaviour was not tested.
- Two AGI Code tests: planIncludesAgiCode (sandboxes plus coding budget, basic and up) and the developer_surfaces capability (pro and up) can disagree for a plan; not traced which one each screen uses.
- Verification status of every row is unknown; no run records were found.

## Project documents found out of date

- `docs/standards/naming-conventions.md`: Lines 22 and 34-35 say the public brand is AGI, that surfaces are AGI Desktop, AGI Web, AGI Mobile, AGI CLI, AGI in Chrome and AGI for VS Code, and that managed cloud is AGI Cloud. The code says: The brand string is AGIWORKFORCE, the product names are plain (Chat, Mobile, Desktop, CLI, Extension, Code, Work), and the managed mode label is Cloud. The apps themselves disagree: Mobile shows AGI Mobile, the VS Code manifest says AGI Code and the Chrome manifest says AGI Extension. (packages/contracts/types/src/product-names.ts:1-15; apps/web/lib/surface-status.ts:29-36; packages/contracts/types/src/suite-contracts.ts:79; apps/mobile/app.config.js:81; apps/extension-vscode/package.json:3; apps/extension/manifest.json:3)
- `docs/product/suite.md`: The Trust Modes table (lines 53-57) names the third mode Managed. The code says: Managed is the internal id; the label shown to users is Cloud. The doc also says surface UI must source labels from the types package, which defines Local, BYOK and Cloud. (docs/product/suite.md:55-57; packages/contracts/types/src/suite-contracts.ts:67-83)
