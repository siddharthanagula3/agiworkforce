---
id: "GAPS-AREA-081"
type: "gap-list"
title: "Gaps: Free / Basic / Pro / Max 5x / Max 20x planning structure"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

89 open gaps that touch this area. Area page: [20-features/081-free-basic-pro-max-5x-max-20x-planning-structure](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/README.md).

## CMP-C14

**Admin per-member and pooled group spend budgets**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: The CLI has only the user's own /budget; no admin-set member caps or shared pools.
- Evidence: searched: pooled, group budget, member cap in apps/cli/src, crates/agiworkforce-licensing

## CMP-D4

**Request a higher personal usage limit from Usage**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No in-product request for a higher limit.
- Evidence: searched: limit increase, request more usage in apps/web/features/settings and billing

## CMP-DP5

**Admin spend limits with alerts**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No per-user or per-group caps A workspace monthly cap with alert threshold and notify or block mode exists; no per-user or per-group caps.
- Evidence: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx

## CMP-MP12

**Subscription bought on another platform alert**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md), [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: There is no pop-up alert The Billing row says where the plan is managed (web, store, organization); there is no pop-up alert.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:378

## CMP-MP9

**List of what each plan includes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: 'What your plan includes' lists only the current plan's benefits 'What your plan includes' lists only the current plan's benefits; the side-by-side plan list is hidden with purchases off.
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:100

## CMP-V2

**Ask a workspace owner for more credits or limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: A user who hits a limit sees upgrade or top-up links but cannot message an admin from the editor.
- Evidence: searched: ask admin, workspace owner in apps/extension-vscode/src

## CMP-VP3

**Plan usage and limits shown in the editor for paid plans**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: No usage bars in the chat panel itself Account & Usage is a pick list with credit-window rows for paid plans; no usage bars in the chat panel itself.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:2149-2260; searched: usageBar, usage bar in src/features/sidebar-webview

## CMP-W21

**Monthly API credits bundled with top plans, claimed by linking an API org**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: Paid plans include no monthly developer API credits and there is no organization-linking claim step.
- Evidence: searched: monthly API credits, apiCredits, link organization in apps/web/lib/billing, apps/web/app/api/billing

## CMP-W23

**Per-member, group and seat-type monthly spend limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Only one workspace cap and one personal cap exist; no group, role or member limits with overrides.
- Evidence: searched: memberCap, perMember, group budget, usage limit in apps/web/lib/services, app/api/settings/organization/groups, roles

## CMP-W25

**Request more usage from an admin when capped**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: A blocked member sees the limit but has no in-product button to ask an admin for more.
- Evidence: searched: request more usage, request increase in apps/web/app, apps/web/features

## CMP-W26

**$500 plan**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md), [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Detail: No plan above $200 for individuals.
- Evidence: packages/contracts/types/src/billing-catalog.ts:23-30 (self-serve tiers end at max_15x and team)

## CMP-W27

**Admin view of who is blocked or near a limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Workspace usage analytics lists usage per member but not who is blocked or close to a cap.
- Evidence: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:243

## CMP-W29

**Annual billing for individual plans**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: Individual plans are monthly only; yearly prices exist only for Team.
- Evidence: packages/contracts/types/src/billing-catalog.ts:229-231 (individual tiers: yearlyPriceUsd?: never)

## CMP-W44

**Linked billing: third-party apps bill your own API org**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: No way to let outside apps bill a customer account or set a per-app limit.
- Evidence: searched: linked billing, linked platforms, per-app spend limit in apps/web/app/api, apps/web/lib/developer-api

## CMP-W45

**Member Request more button when team budget runs out**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No member request flow for more budget or credits.
- Evidence: searched: request more, credit request, ask admin in features, app, lib, unified-chat

## CMP-W46

**Notice that you are now running on credits after a limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: No message tells the user that a turn is being paid from credits.
- Evidence: searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: using credits, now on credits, continuing with credits, drawing credits (no hits)

## CMP-W49

**Per-user usage limits with group and individual overrides**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Workspace has one monthly spend cap with enforcement and alert threshold; no per-member or per-group limits.
- Evidence: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:82

## CMP-WP19

**Credit expiry rules**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md), [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Purchased credits show 'No expiry date recorded' when none is set Bonus credits show an expiry date; purchased credits show 'No expiry date recorded' when none is set.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:370-398

## CMP-WP20

**Developer console usage, cost and billing pages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: No cost-by-model charts or CSV Developer console has monthly usage, per-project spend caps, logs and a credit balance call; no cost-by-model charts or CSV.
- Evidence: apps/web/app/api/developers/usage/route.ts:8; apps/web/lib/developer-api/project-spend.ts:27

## CMP-WP23

**API rate-limit tiers that rise automatically**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: They do not rise with usage and no increase request exists The developer page lists per-endpoint limits by plan tier; they do not rise with usage and no increase request exists.
- Evidence: apps/web/lib/developer-api/rate-limit-summary.ts:16

## CMP-WP30

**Usage alerts at chosen thresholds sent to chosen people**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No several thresholds or recipient list The workspace spend cap has one alert percentage and a notify mode; no several thresholds or recipient list.
- Evidence: apps/web/app/api/settings/organization/spend-limit/route.ts:37

## GAP-AREA081-LW02

**The Ultra (max_15x) allowance is 10 times Premium on the monthly and weekly windows (20,000 vs 2,000 monthly; 5,000 vs 500 weekly), and the five-hour window is unlimited. The code's own ratio is therefore 10x, not the 15x name. Pricing copy was not opened to confirm what it says.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-081
- Detail: Area 81. Free / Basic / Pro / Max 5x / Max 20x planning structure
- Evidence: packages/contracts/types/src/managed-usage-limits.ts:63-69 and 158-165

## GAP-AREA081-LW04

**The team knowledge storage limit is a hard-coded byte number, while other team-style limits are computed from prices.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-081
- Detail: Area 81. Free / Basic / Pro / Max 5x / Max 20x planning structure
- Evidence: packages/contracts/types/src/billing-catalog.ts:693

## GAP-AREA081-LW05

**Mobile billing is switched off, so the upgrade-timing item is partial on mobile.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-081
- Detail: Area 81. Free / Basic / Pro / Max 5x / Max 20x planning structure
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:6

## GAP-CAP-subscriptions-and-plans-01

**Free plan with limited usage: Two seen defects: Free upgrade page shows a usage meter against the owner decision (W-16, W-18). Known flaw: Free allowance is above Basic in some windows (audit/registers/known-flaws.md PLAN-PAID-ALLOWANCES-BELOW-FREE-01).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Requirement items: S81.02, S81.27
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-02

**Individual paid plan ladder: No equivalent of ChatGPT's $500 tier (W26). Whether to add one is an owner choice.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md), [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Requirement items: S100.01, S100.02, S81.03, S81.04, S81.05, S81.06, S81.07
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-03

**Annual billing for individual plans: No yearly price for Basic, Premium, Max or Ultra.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Requirement items: S81.17, S83.02
- Detail: Claude yes, ChatGPT no; AGI partly built

## GAP-CAP-subscriptions-and-plans-04

**Plan comparison and plan-gated feature explanations: Seen defect: Basic plan card 'What changes' omits scheduled tasks (W-16). Mobile list partial (MP9). Chrome unverified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Requirement items: S81.09, S81.28, S83.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-06

**Mid-cycle upgrade with proration: None known beyond the purchase gate.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Requirement items: S81.23, S83.05
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-subscriptions-and-plans-07

**Downgrade at end of period: Doc and ledger disagree on whether downgrade is a built path; needs a live test.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Requirement items: S81.24, S83.04
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-subscriptions-and-plans-09

**One billing owner and store-managed subscriptions: Mobile alert partial (MP12).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md), [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Requirement items: S100.15, S81.27, S83.26, S83.27
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-14

**Failed payment and grace handling: Billing says Active while the period ended and no credits exist (W-12, W-14, W-19). The error says to check Billing, which shows no period or renewal date.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-07](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Requirement items: S81.25, S83.14, S83.15
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-15

**Credits past plan limits: No 'now using credits' notice (W46); expiry display partial (WP19); seen defect: credit banner and sidebar meter stale after image generations (W-7).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Requirement items: S100.07, S100.08, S81.20, S81.21
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-17

**One subscription shared across apps and coding tools: None known; cross-app agreement not seen by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Requirement items: S100.03, S81.27
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-18

**Promotions, promo codes and trials: Promo path off while purchasing is gated; not seen live.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md), [F083-05](../../20-features/083-billing-and-subscription-screens/F083-05-trial-terms.md), [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Requirement items: S100.22, S100.23, S81.18, S81.19, S83.07, S83.08
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-20

**Team plan with standard and premium seats: Team purchase closed by the waitlist; premium seats not sold in every interval or currency (checkout route messages).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Requirement items: S81.16, S83.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-22

**Admin spend limits and requests for more usage: Per-member and group budgets, request-more flow and admin blocked view.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Requirement items: S100.13, S81.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-26

**Monthly API credits bundled with top plans: Bundled credits and linking.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Requirement items: S81.26
- Detail: Claude yes, ChatGPT yes; AGI not built

## GAP-CAP-subscriptions-and-plans-28

**Coding tool access by plan: VP3 partial; CLI missing status-line plan usage (C25) and 75/95% spend warnings (C24); /upgrade off by decision.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Requirement items: S81.09, S81.14, S81.27
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-29

**Local mode and BYOK at no charge: No competitor chat product offers free local inference; evidence only shows API-key paths for the coding tools. Not compared in the catalogue.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Requirement items: S81.02
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-CAP-subscriptions-and-plans-30

**Grandfathered plan versions and price-change notice: No notice flow or test of a version move was found.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Requirement items: S81.01, S81.22
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-F081-01-01

**Grandfathering of allowances is machinery without data: every catalog version reads the same allowance table, and no plan has been withdrawn**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Detail: Affects: Existing subscribers when a future reprice or allowance change ships; web, desktop, mobile, CLI, VS Code, Chrome. Work needed: When allowances change, add a distinct table for the new version and keep the old one; add a test that an old-version subscription still reads the old table
- Evidence: packages/contracts/types/src/managed-usage-limits.ts:89-96; packages/contracts/types/src/billing-plan-catalog.ts:39; test managed-usage-limits.test.ts:62-65

## GAP-F081-01-02

**Brief says 'Pro' and 'Max 5x/Max 20x/Max 15x'; the stored ids are pro, max, max_15x and the public labels are Premium, Max, Ultra, so the same plan has three names**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Detail: Affects: Testers, support and engineers reading code, brief and docs. Work needed: Pick one naming list in the knowledge base and rename stale test titles
- Evidence: packages/contracts/types/src/billing-catalog.ts:166-232; apps/cli/src/plans.rs:288 (test name still says max_20x)

## GAP-F081-01-03

**Mobile shows no plan lineup or price while store purchases are off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Detail: Affects: Mobile users on Free who want to compare plans. Work needed: Owner decision on whether read-only plan comparison should show on mobile before purchases open
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:99-100; apps/mobile/src/features/billing/storePurchases.json:2

## GAP-F081-01-04

**Internal Tauri plan cards use hardcoded bullets that disagree with the catalog (Free 'One Cloud project' vs 5 projects)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Detail: Affects: Internal Tauri desktop build. Work needed: Derive bullets from the catalog or retire the modal
- Evidence: apps/desktop/src/features/pricing/PlanCard.tsx:39; packages/contracts/types/src/billing-catalog.ts:580-600

## GAP-F081-01-05

**Chrome has no plan comparison and its pricing copy is unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Detail: Affects: Chrome users. Work needed: Decide whether a link-out is enough; verify the copy in the side panel
- Evidence: apps/extension/src/side_panel.ts:12083; brief S81.07/S81.28 'unverified'

## GAP-F081-01-06

**Docs say downgrade is not a code path, but the code schedules downgrades**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Detail: Affects: Readers of docs/product/commercial.md. Work needed: Update commercial.md (code wins)
- Evidence: docs/product/commercial.md section 'Plan Change, Proration, And Subscription State Transitions' vs apps/web/app/api/billing/downgrade-preview/route.ts:60-120

## GAP-F081-01-PARTLY

**Plan catalog and plan lineup: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Requirement items: S81.28

## GAP-F081-02-01

**Ultra's real multiple is 10x weekly and monthly with no session cap, which matches neither the id max_15x nor the area name 'Max 20x'**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Detail: Affects: Docs, support, testers; all apps that show the copy. Work needed: Standardise the name used in docs and tests; the on-screen copy is already correct
- Evidence: packages/contracts/types/src/managed-usage-limits.ts:63-69; __tests__/managed-usage-limits.test.ts:103-108

## GAP-F081-02-02

**Multiplier copy is computed from the base table, while INR and store subscribers get scaled allowances**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Detail: Affects: Non-USD web and store subscribers. Work needed: Decide whether to scale the copy or state that it is for the base price
- Evidence: packages/contracts/types/src/billing-revenue.ts:113-145; apps/web/lib/server/managed-usage-policy.ts:45-60

## GAP-F081-02-03

**Flagship weekly cap is enforced for every plan with a weekly budget but displayed only for Premium and up**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Detail: Affects: Free and Basic users if they can reach a flagship-class route; Premium users. Work needed: Establish whether Free and Basic can ever route to flagship-class models; align code and display
- Evidence: apps/web/lib/server/managed-usage-policy.ts:117-119; packages/contracts/types/src/managed-usage-limits.ts:254-262

## GAP-F081-02-04

**Free plan shows credit numbers in the CLI and a hidden meter on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Detail: Affects: Free users on CLI versus web. Work needed: Owner decision on what Free usage screens show, then align apps
- Evidence: apps/cli/src/plans.rs:176-190; apps/web/features/settings/sections/UsageSection.tsx:1313

## GAP-F081-02-05

**Free credit numbers are larger than Basic in every window by design, so there is no multiplier from Free to Basic**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Detail: Affects: Pricing comprehension. Work needed: Make sure pricing copy explains Free is free models only (mobile does: plans/index.tsx:64)
- Evidence: packages/contracts/types/src/__tests__/managed-usage-limits.test.ts:120-124

## GAP-F081-02-06

**Chrome plan and usage copy unverified; reset behaviour for the 'free_pool' alternative not traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Detail: Affects: Chrome users; people hitting a limit on a paid plan. Work needed: Verify Chrome side panel copy; trace plan-limit-alternative.ts
- Evidence: brief S81.07, S81.08; apps/web/lib/services/managed-usage-request-service.ts:473-500

## GAP-F081-02-PARTLY

**Usage allowance and the multiplier baseline (5x, 15x): partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Requirement items: S81.07, S81.08

## GAP-F081-03-01

**Brief says upload-size limits are missing on web and desktop; the code has them: the inline limit is 25 MiB for every plan and a 500 MiB large path for paid plans. The real gaps are that the inline limit does not differ by plan and that the large path needs a server flag**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Detail: Affects: Web and Electron desktop users; testers using the brief. Work needed: Correct the brief; owner decision on whether the 25 MiB inline limit should differ per plan; confirm production value of the flag
- Evidence: packages/contracts/types/src/billing-catalog.ts:545-570; apps/web/lib/server/attachment-allowance.ts:78-100,235-260; apps/web/lib/server/chat-file-intake/readiness.ts:41

## GAP-F081-03-02

**Context size is not a plan limit and is not enforced per plan, only shown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Detail: Affects: Pricing comparison readers; all apps. Work needed: Relabel as the largest model window or add a real plan clamp
- Evidence: packages/contracts/types/src/model-catalog.ts:3077-3090

## GAP-F081-03-03

**Draft expectation that Basic gets 3 answers at once is wrong: Basic is 1; Premium 3; Max 5; Ultra 10**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Detail: Affects: Docs and testers. Work needed: Use the catalog values in docs
- Evidence: packages/contracts/types/src/billing-catalog.ts:590-680

## GAP-F081-03-04

**Storage enforcement line in the brief (knowledge-files route line 227) does not exist; the route is 113 lines and enforcement lives in project-knowledge-files.ts**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Detail: Affects: Engineers following the brief. Work needed: Fix the brief reference
- Evidence: apps/web/app/api/projects/[id]/knowledge-files/route.ts; apps/web/lib/server/project-knowledge-files.ts:268

## GAP-F081-03-05

**Effort and manual model gating on mobile, CLI and VS Code is not established; only web and Chrome effort splits were found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Detail: Affects: Mobile, CLI and VS Code Free users. Work needed: Trace each app and add tests
- Evidence: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:313; apps/cli/src/tui/widgets/model_picker.rs:210

## GAP-F081-03-06

**Desktop upload and storage limits for the Tauri build are not traced; the public desktop uses web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Confirm Tauri build is not shipped or trace its limits
- Evidence: apps/desktop/electron/config.ts:17,64

## GAP-F081-03-NOTBUILT

**Per-plan limits: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F081-03](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Requirement items: S81.10
- Detail: Web: S81.10; Desktop: S81.10

## GAP-F081-04-01

**Connectors are included on paid plans in the table but are 'coming soon' in the release state, so the plan lists disagree with the capability table**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: Affects: All apps that list connectors. Work needed: Release the connectors or document the label as the intended presentation
- Evidence: packages/contracts/types/src/connector-release.ts:14; packages/contracts/types/src/billing-catalog.ts:343-353

## GAP-F081-04-02

**Capabilities such as agi_work, deep_research and memory have no direct server gate found by grep**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: Affects: Premium-only features if the UI is the only guard. Work needed: Trace each feature's server route and add a gate test
- Evidence: grep of canUseBillingPlanCapability under apps/web/app/api and apps/web/lib (24 files; none for these)

## GAP-F081-04-03

**CLI keeps its own copy of the capability table and labels**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: Affects: CLI plan view. Work needed: Generate the Rust table from the TypeScript source
- Evidence: apps/cli/src/plans.rs:91-140; guarded by conformance test at plans.rs:456

## GAP-F081-04-04

**Chrome feature explanations unverified; no plan list in the extension**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: Affects: Chrome users. Work needed: Verify and decide design
- Evidence: brief S81.28; apps/extension/src/side_panel.ts:12083

## GAP-F081-04-05

**Chrome blocks chat itself for a lapsed plan while the server would serve it as Free**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: Affects: Chrome users with a lapsed plan. Work needed: Owner decision on the intended behaviour
- Evidence: apps/extension/src/side_panel.ts:13427-13440; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:341-352

## GAP-F081-04-06

**Release labels mark every app except Web 'Coming soon' on pricing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Detail: Affects: Visitors reading pricing. Work needed: Update when apps ship
- Evidence: apps/web/lib/surface-status.ts:6-13

## GAP-F081-04-PARTLY

**Feature access by plan: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Requirement items: S81.09

## GAP-F081-05-01

**No pooled-usage option exists; the plan structure is dedicated per seat plus a workspace cap, and no page states 'not pooled' in plain words**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md)
- Detail: Affects: Team buyers and admins on web and Electron desktop. Work needed: State the model on pricing and Team settings or build a pool if required
- Evidence: apps/web/lib/services/entitlement-resolution.ts:169-203; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190

## GAP-F081-05-02

**Unknown meaning of the brief's 'handler unfinished' on web and desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md)
- Detail: Affects: Team admins. Work needed: Ask the brief author which handler; add it to open work
- Evidence: brief S81.16 'Unfinished: handler'; no matching code found

## GAP-F081-05-03

**Outcome after a failed ledger creation is not traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md)
- Detail: Affects: Team members whose ledger failed. Work needed: Trace the reservation path and add a test
- Evidence: apps/web/lib/services/entitlement-resolution.ts:204-210

## GAP-F081-05-04

**No seat view on mobile, CLI, VS Code or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md)
- Detail: Affects: Team members on those apps. Work needed: Confirm members still see their plan through the account endpoint
- Evidence: brief marks n/a

## GAP-F081-06-01

**Self-serve plans have no grace period; the brief asks for a defined grace rule. The rule is defined as none for self-serve and kept access for Enterprise only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Detail: Affects: All self-serve subscribers on every app. Work needed: Owner confirms the no-grace decision and records it in docs/decisions
- Evidence: apps/web/features/billing/components/BillingPlanNotices.tsx:152; packages/contracts/types/src/subscription-entitlement.ts:3,19-31

## GAP-F081-06-02

**The notice header is read only by web chat; Chrome blocks chat instead of serving Free; CLI, VS Code, mobile use their own text**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Detail: Affects: Chrome, CLI, VS Code and mobile users with a lapsed plan. Work needed: Use one wording and one behaviour per the owner's decision
- Evidence: apps/web/lib/hooks/useChatStream.ts:563; apps/extension/src/side_panel.ts:13427-13440; apps/cli/src/usage_summary.rs:639-671

## GAP-F081-06-03

**Mobile in-app purchase, receipt and restore are not switched on (two build switches plus a server switch)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Detail: Affects: Mobile users who want to subscribe on the phone. Work needed: Owner switch-on with live store products and a new store build
- Evidence: apps/mobile/src/features/billing/storePurchases.json:2; apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:53-56

## GAP-F081-06-04

**Docs say a downgrade is not a code path, but the code schedules one**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Detail: Affects: Readers of commercial.md. Work needed: Update the doc
- Evidence: docs/product/commercial.md 'Plan Change...' vs apps/web/app/api/billing/downgrade-preview/route.ts:60-120

## GAP-F081-06-05

**The internal Tauri desktop handles a lower-plan choice through the billing portal, not the scheduled downgrade dialog**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Detail: Affects: Internal Tauri build. Work needed: Align or retire
- Evidence: apps/desktop/src/features/pricing/PlansModal.tsx:80-98

## GAP-F081-06-06

**Paid upgrades are gated by waitlist and access code, which the brief does not mention**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Detail: Affects: All new subscribers. Work needed: Add the gate to the area brief and the user-facing explanation
- Evidence: apps/web/lib/server/billing-waitlist-access.ts:11-55; docs/product/commercial.md line 24

## GAP-F081-06-PARTLY

**Pricing, billing cadence, upgrades and downgrades: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Requirement items: S81.23
- Detail: Mobile S81.23: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## GAP-F081-07-01

**No plan sets trial days, so checkout trials exist only through referral**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: Web, Desktop; every new user expecting a plan trial. Work needed: Decide if a plan trial is wanted; if yes set trialDays in the catalog and test the checkout, reminder and end flow.
- Evidence: packages/contracts/types/src/billing-catalog.ts:150,1047-1052 and no plan entry sets it

## GAP-F081-07-02

**No producer of code-granted trials found, only the expiry job**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: Operators, web. Work needed: Locate or build the grant path with audit and a visible end date.
- Evidence: apps/web/lib/services/code-trial-expiry.ts is the only match for the code-trial name

## GAP-F081-07-03

**Migrations 0281, 0402, 0414 are marked not yet applied in their headers**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: Web overage accuracy and purchased-credit carry. Work needed: Confirm the applied state with the migration status command; update the headers.
- Evidence: first lines of those files

## GAP-F081-07-04

**Documentation and interface disagree on purchase expiry (12 months vs no expiry except local law)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: All apps showing purchased credits. Work needed: Check the code of the carry function and fix the document or the copy.
- Evidence: docs/product/commercial.md:236 vs UsageSection.tsx:410-413 and TopUpPanel.tsx:122-124

## GAP-F081-07-05

**Tauri desktop has no overage switch or promotion box**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: Tauri desktop (internal). Work needed: Wire it or record that the public Electron Desktop shows the web app instead.
- Evidence: only CreditTopUp.tsx and status labels found

## GAP-F081-07-06

**Mobile trial and top-up UI is switched off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: Mobile. Work needed: Owner switch-on and store products (brief S81.23).
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:6

## GAP-F081-07-07

**No overage, promotion or trial control on CLI, VS Code or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide whether these surfaces link to web Billing and add that link.
- Evidence: no matches in apps/cli, apps/extension-vscode, apps/extension beyond status text

## GAP-F081-07-08

**No file records a run of the tests or a live check of this feature**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Detail: Affects: All. Work needed: Run the listed tests and the scenarios and record results.
- Evidence: only test sources exist; no result files read

## GAP-F081-07-NOTBUILT

**Trials, promotions, credits and overage: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Requirement items: S81.18, S81.19, S81.20, S81.21
- Detail: Chrome: S81.18, S81.19, S81.20, S81.21
