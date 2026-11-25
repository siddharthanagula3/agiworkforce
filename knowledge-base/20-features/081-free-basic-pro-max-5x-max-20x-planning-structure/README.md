---
id: "AREA-081"
type: "area"
title: "Free / Basic / Pro / Max 5x / Max 20x planning structure"
features: ["F081-01", "F081-02", "F081-03", "F081-04", "F081-05", "F081-06", "F081-07"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

This area is the set of plans a person can be on, and what each plan gives: how much cloud AI usage, which features, which limits, and what it costs. It decides what a person sees on the pricing page, what happens when they upgrade or downgrade, and whether a request to the managed cloud is allowed. It matters because one account plan must mean the same thing on every app, and the server (not the app) must enforce it.

**Who uses it.** Every signed-in person sees a plan (Free if they have none). Paid plans (Basic, Premium/pro, Max, Ultra/max_15x) unlock more usage and features. Team and Enterprise plans are per-seat and are managed by workspace admins. Developers reach the same plan rules through the API, CLI and VS Code extension. Local-only and BYOK (own key) modes are free of charge and are not managed-cloud plans.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F081-01](F081-01-plan-catalog-and-plan-lineup.md) | Plan catalog and plan lineup | built | built | built | built | built | partly |
| [F081-02](F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md) | Usage allowance and the multiplier baseline (5x, 15x) | built | built | built | built | built | partly |
| [F081-03](F081-03-per-plan-limits.md) | Per-plan limits | partly | partly | built | built | built | built |
| [F081-04](F081-04-feature-access-by-plan.md) | Feature access by plan | built | built | built | built | built | partly |
| [F081-05](F081-05-shared-or-dedicated-usage-pools.md) | Shared or dedicated usage pools | built | built | n/a | n/a | n/a | n/a |
| [F081-06](F081-06-pricing-billing-cadence-upgrades-and-downgrades.md) | Pricing, billing cadence, upgrades and downgrades | built | built | partly | built | built | built |
| [F081-07](F081-07-trials-promotions-credits-and-overage.md) | Trials, promotions, credits and overage | built | built | n/a | n/a | n/a | no |

Requirement items for this area: [10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md).

## How this area works in the code

1. **Plan definitions and prices.** The plan list lives in code: id, label, monthly and yearly price, and whether a plan is per seat. Basic is 7 USD, Premium (id pro) 20, Max 100, Ultra (id max_15x) 200, Team 25 per seat, Team Premium 125 per seat, Enterprise is contract priced. Free, Local Mode and Local Mode plus own key cost 0. (`packages/contracts/types/src/billing-catalog.ts:166-231`)
2. **Which surfaces may pick a plan.** Each plan lists the surfaces (web, desktop, mobile) where it can be selected. Currently every plan lists all three. (`packages/contracts/types/src/billing-catalog.ts:235-253`)
3. **Plan capabilities.** A table lists, for each capability (for example managed chat, connectors, image generation, team admin), the plans that include it. The check function is canUseBillingPlanCapability. Labels and upgrade messages are built from the same table. (`packages/contracts/types/src/billing-catalog.ts:302-372`, `packages/contracts/types/src/billing-catalog.ts:394-433`)
4. **Usage allowances and catalog versions.** Credit allowances per plan (monthly, weekly, five-hour, unlimited flag) are in one table. A separate map keys the table by catalog version; versions 1 to 3 and the current version all use the same table today. Multipliers are computed as the ratio to the baseline plan (Premium to Basic, Max to Premium, Ultra to Premium, Team to Premium, Team Premium to Team). (`packages/contracts/types/src/managed-usage-limits.ts:31-85`, `packages/contracts/types/src/managed-usage-limits.ts:89-115`, `packages/contracts/types/src/managed-usage-limits.ts:158-165`, `packages/contracts/types/src/managed-usage-limits.ts:175-216`)
5. **Who the person is entitled to.** Entitlement is resolved in one place. For a seat member the code finds the workspace subscription first, then any other seat. The bundle says which plan, catalog version and source apply. The usage window subject is the paid plan while it is entitled, and Free after it lapses. (`apps/web/lib/services/entitlement-resolution.ts:133-167`, `apps/web/lib/services/entitlement-resolution.ts:217-248`)
6. **Seat usage ledger.** For a seat member with a budget above zero, a monthly credit account is created for the subscription period, tagged with the catalog version. (`apps/web/lib/services/entitlement-resolution.ts:169-209`)
7. **Gate on each request.** The managed cloud gate checks the signed-in surface against the plan. The response header that tells the app its paid plan lapsed is named here. Surfaces are mapped to capabilities (web, mobile, desktop and chrome all map to managed chat). (`apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:68`, `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:77-84`, `apps/web/lib/free-chat-surface-policy.ts:55-104`)
8. **Per-plan product limits.** One table holds per-plan limits: projects, storage, download bytes, concurrent turns, artifact AI calls, sandboxes, connector tools, scheduled tasks, chat file sizes and daily upload bytes. Free daily caps (messages, conversations, egress, email, vector queries) are separate constants. (`packages/contracts/types/src/billing-catalog.ts:484-490`, `packages/contracts/types/src/billing-catalog.ts:548-690`)
9. **Pricing page copy.** The pricing page builds the comparison columns from the plan prices and capability table. It shows the baseline-relative multiplier lines through the managed-usage comparison helpers. (`apps/web/app/pricing/page.tsx:735-776`, `packages/contracts/types/src/managed-usage-limits.ts:197-216`)
10. **Overage preference.** The overage endpoint reads and writes the person's overage on/off setting, then returns the saved row. (`apps/web/app/api/billing/overage/route.ts:94-99`)

## Files to know

| File | Role |
|---|---|
| `packages/contracts/types/src/billing-catalog.ts` | Plan list, prices, surfaces, capability table, per-plan product limits and free daily caps. Central source. |
| `packages/contracts/types/src/managed-usage-limits.ts` | Credit allowances per plan, catalog-version table, baselines and multiplier wording. |
| `apps/web/lib/services/entitlement-resolution.ts` | Single place that works out a person's plan, seat source and usage window subject; creates seat ledgers. |
| `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Server gate on managed chat requests: surface check, terms check and billing-lapsed notice header. |
| `apps/web/lib/free-chat-surface-policy.ts` | Maps each signed-in surface (web, desktop, mobile, chrome, CLI, VS Code) to the plan capability it needs. |
| `apps/web/app/pricing/page.tsx` | Public pricing page: comparison columns, prices, capability rows and multiplier copy. |
| `apps/mobile/lib/v1FeatureFlags.ts` | Mobile feature switches; billing is off here. |
| `apps/web/app/api/billing/overage/route.ts` | Read and write the overage on/off setting. |
| `apps/web/features/settings/sections/UsageSection.tsx` | Usage meter and per-window allowance display in settings. |
| `apps/web/app/upgrade/UpgradeChooser.tsx` | Upgrade choice screen and plan explanations. |

## What is stored

- Plan price list, capability table, per-plan limits, credit allowances, free daily caps: Code constants in packages/contracts/types/src/billing-catalog.ts and managed-usage-limits.ts (not database)
- Subscription row with plan tier, catalog version, period dates, Stripe ids, Apple and Google purchase ids: Database, read by apps/web/lib/services/entitlement-resolution.ts:133-167 (table name not traced)
- Monthly seat credit account (budget and period), tagged with plan catalog version: Database via CreditService.getOrCreateAccount, apps/web/lib/services/entitlement-resolution.ts:189-197
- Overage on/off preference per person: Database via db.query, apps/web/app/api/billing/overage/route.ts:94 (table not traced)
- Managed usage periods and windows: Not traced in this pass

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **BILLING_PLAN_CATALOG_VERSION and the version table**: Picks which allowance table a subscription uses; versions 1 to 3 map to the same table today. (packages/contracts/types/src/managed-usage-limits.ts:9, 89-115)
- **PLAN_SURFACE_VISIBILITY**: Which surfaces can select each plan. (packages/contracts/types/src/billing-catalog.ts:235-246)
- **BILLING_PLAN_CAPABILITY_TIERS**: Which plans include each feature capability. (packages/contracts/types/src/billing-catalog.ts:343-364)
- **FEATURES.billing (mobile)**: Set to false: mobile billing screens and purchase are not shown. (apps/mobile/lib/v1FeatureFlags.ts:6)
- **MOBILE_IAP_ENABLED (server)**: Brief says this must be on, with App Store and Play products live, before mobile purchase works. Not opened in this pass. (apps/web/lib/server/mobile-iap-catalog.ts:26 (per brief, not opened))
- **BILLING_NOTICE_HEADER**: Name of the header that tells the client a paid plan lapsed and the turn is served as Free. (apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:68)
- **MAX_MANAGED_SANDBOXES_PER_USER and FREE_DAILY_CAPS**: Hard ceilings on sandboxes and daily free use, independent of plan tables. (packages/contracts/types/src/billing-catalog.ts:473, 484-490)
- **MANAGED_USAGE_BASELINES**: Which plan each plan is compared with in multiplier copy. (packages/contracts/types/src/managed-usage-limits.ts:158-165)

## Shared between apps

Shared across apps: the plan list, prices, capability table, per-plan limits and multiplier wording (packages/contracts/types/src/billing-catalog.ts, managed-usage-limits.ts); the server entitlement resolver and chat gate (apps/web/lib/services/entitlement-resolution.ts, auth-gate.ts). Separate per app: the pricing and upgrade screens (web), the plans screen and paywall sheet (mobile, apps/mobile/src/features/settings/plans and cloud-billing), the CLI usage summary (apps/cli/src/usage_summary.rs, apps/cli/src/plans.rs), the VS Code plan comparison (apps/extension-vscode/src/features/account-auth/planComparison.ts), and the Chrome side panel and free-trial client (apps/extension/src/side_panel.ts, apps/extension/src/features/cloud-bridge/freeTrialClient.ts).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief's area title says Max 20x, and the brief's item S81.06 says Max 15x, but the code has no 20x plan. The plan id is max_15x and its label is Ultra. (packages/contracts/types/src/billing-catalog.ts:203-208)
- The Ultra (max_15x) allowance is 10 times Premium on the monthly and weekly windows (20,000 vs 2,000 monthly; 5,000 vs 500 weekly), and the five-hour window is unlimited. The code's own ratio is therefore 10x, not the 15x name. Pricing copy was not opened to confirm what it says. (packages/contracts/types/src/managed-usage-limits.ts:63-69 and 158-165)
- The brief says upload-size limits are missing on web and desktop, but the catalog defines per-plan chat-file sizes and daily upload bytes. Whether the upload route enforces them was not traced. Every plan also uses the same maxAttachmentBytes value. (packages/contracts/types/src/billing-catalog.ts:548-560, 574, 595, 612, 629, 646, 665, 685)
- The team knowledge storage limit is a hard-coded byte number, while other team-style limits are computed from prices. (packages/contracts/types/src/billing-catalog.ts:693)
- Mobile billing is switched off, so the upgrade-timing item is partial on mobile. (apps/mobile/lib/v1FeatureFlags.ts:6)

## Not established

- Rate-limit concurrency enforcement (apps/web/lib/rate-limit.ts:1223, 1234 and apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:35) was not opened.
- Upload route and knowledge-file storage check (apps/web/app/api/projects/[id]/knowledge-files/route.ts:227) was not opened.
- Checkout, upgrade and top-up routes (apps/web/app/api/checkout/route.ts, apps/web/app/api/upgrade/route.ts, apps/web/app/api/billing/top-up/route.ts) and the trial-expiry job (apps/web/lib/services/code-trial-expiry.ts, apps/web/app/api/cron/expire-code-trials/route.ts) were not opened.
- Stripe webhook plan-version storage (apps/web/app/api/stripe-webhook/lib/db.ts:773) was not opened, so grandfathering is only partly seen.
- Mobile in-app purchase server flag and product catalog (apps/web/lib/server/mobile-iap-catalog.ts:26) were not opened.
- Exact wording of the pricing copy for 5x and 15x (apps/web/app/pricing/page.tsx:741-818 covers rows, not all text) was not read in full.
- Per-window reset logic and the exact refusal messages when a limit is reached were not traced.
- Chrome status for S81.07 and S81.08 (marked unverified) was not checked; the Chrome copy source was not opened.
- Mobile app plan screen (apps/mobile/src/features/settings/plans/index.tsx) and the image generation route (apps/web/app/api/media/image/generate/route.ts:223) were not opened.
- The database table names for subscriptions, credit accounts and overage were not confirmed.
- Test coverage for this area was not examined (read-only task, no tests run).
