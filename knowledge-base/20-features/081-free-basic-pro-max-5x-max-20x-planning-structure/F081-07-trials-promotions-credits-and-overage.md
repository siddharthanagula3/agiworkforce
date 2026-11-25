---
id: "F081-07"
type: "feature"
title: "Trials, promotions, credits and overage"
aliases: ["Trials, promotions, credits and overage", "Free trial", "Code-granted trial", "Promotion code", "Promo code", "Bonus credits", "Top-up", "Buy credits", "Purchased credits", "Usage credits", "Keep going after a usage limit", "Overage", "Extra usage", "S81.18 Trial entitlements", "S81.19 Promotional entitlements", "S81.20 Purchased credit balances", "S81.21 Optional overage"]
area: "81 Free / Basic / Pro / Max 5x / Max 20x planning structure"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S81.18", "S81.19", "S81.20", "S81.21"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-observability-and-operations", "surface:web", "surface:desktop", "mode:cloud", "plan:pro", "table:subscriptions", "table:token_credits", "table:credit_transactions", "file:apps/web/app/api/billing/overage/route.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F081-07 Trials, promotions, credits and overage

Four linked billing features of AGI Cloud. A plan can be a trial that ends and reverts to Free. Promotion codes and bonus credits give extra value. Bought top-up credits form a separate balance. An opt-in switch lets bought credits pay for turns after a plan limit stops you. It is built on web, and on the Tauri desktop only partly.

Area: [81. Free / Basic / Pro / Max 5x / Max 20x planning structure](README.md). Requirement items: [S81.18](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8118), [S81.19](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8119), [S81.20](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8120), [S81.21](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8121).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** It lets an account (1) hold a trialing plan with an end date, (2) get a discount through a promotion code or extra bonus credits, (3) buy credit top-ups that sit in a purchased balance apart from the plan allowance, and (4) switch on overage, so purchased credits fund a turn once a 5-hour, weekly or flagship-weekly plan window is used up. Overage is off by default. The trial-end job moves ended code-granted trials to Free (apps/web/lib/services/code-trial-expiry.ts:14-31).

**Why it exists.** Heavy users of a capped plan need a way to keep working without moving to a bigger plan. New users need a low-risk way to try a paid plan. Operators need a way to give goodwill value. The commercial document says the plan allowance and the purchased balance are two different entitlements (doc: docs/product/commercial.md:229-246).

**Who uses it.** Paying individual subscribers billed by Stripe, Apple or Google (buy credits, switch overage). New or referred users (trial). Anyone with a promotion code. Operators (grant bonus credits, configure usage-limit promotions). A person on an organization-managed plan cannot buy or switch; the refusal names the plan manager (doc: docs/product/commercial.md:260-264).

**Problems it solves**

- A person who hits a rolling usage limit has no way to continue except waiting or upgrading
- A trial must not turn into a free plan for ever
- Bought money must not vanish at renewal, and must not be spent without the person's opt-in
- Discounts and goodwill need to be visible to the person

**Use cases**

- A Pro subscriber hits the 5-hour limit, buys credits and turns on 'Keep going after a usage limit'
- A friend invited through a referral gets a 7-day Pro trial at checkout
- A person types a promotion code on the upgrade screen and sees the discount before paying
- An operator grants bonus credits to a customer as goodwill

## 2. User experience

**Where to find it**

- Web (and public Desktop, which shows the hosted web app, doc: AGENTS.md section 5): Settings > Billing. Visible labels: 'Buy credits' (apps/web/features/billing/components/TopUpPanel.tsx:92), 'Keep going after a usage limit' switch (apps/web/features/settings/sections/BillingSection.tsx:1207), 'Credit history' (BillingSection.tsx:1239), subscription status label 'Free trial' (BillingSection.tsx:150) and period row 'Trial ends on' (BillingSection.tsx:68).
- Web: Settings > Usage shows 'Credit balances' with 'Bonus credits' and 'Purchased credits' rows and a 'Buy credits' link (apps/web/features/settings/sections/UsageSection.tsx:421-431).
- Web upgrade flow: link 'Add a promotion code', field 'Promotion code', button 'Apply', link 'Remove' (apps/web/features/billing/components/UpgradePromotionCode.tsx:72-109).
- Web checkout (Stripe page): promotion codes are allowed on the page (apps/web/app/api/checkout/route.ts:522).
- Tauri desktop (internal build): Settings billing shows status 'Trial' (apps/desktop/src/features/settings/BillingSettings.tsx:12) and a 'Buy credits' panel (apps/desktop/src/features/settings/CreditTopUp.tsx:93). No overage switch or promotion field was found in desktop sources [inferred from a search].
- Mobile: a 'Usage top-ups' section and a 'Trial ends' row exist in apps/mobile/src/features/settings/cloud-billing/index.tsx:370,752 but the billing feature flag is false (apps/mobile/lib/v1FeatureFlags.ts:6).
- CLI: usage summary prints the status 'trial' (apps/cli/src/usage_summary.rs:634). VS Code and Chrome: no trial, promo, top-up or overage control found; the Chrome 'freeTrialClient' file is the free-tier chat client, not a plan trial (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:94,112).

**Before you start**

- Signed in to AGI Cloud (mode:cloud).
- Buying credits and overage need an active or trialing paid plan billed by Stripe, Apple or Google (apps/web/features/settings/sections/BillingSection.tsx:424,454; apps/web/app/api/billing/top-up/route.ts:149-158).
- Top-up checkout must be enabled on the server (STRIPE_CHECKOUT_ENABLED not off and a Stripe secret configured) (apps/web/app/api/billing/top-up/route.ts:92-100).
- Free-plan accounts see 'Credit packs are available on paid plans.' with an upgrade prompt (apps/web/features/billing/components/TopUpPanel.tsx:88-101).

**Screens and controls**

- Top-up panel: preset packs of 20, 50, 100, 250 and 1000 dollars, an 'Other' amount, and a 'Buy <credits>' button (packages/contracts/types/src/billing-topups.ts:13; TopUpPanel.tsx:228).
- Overage switch labelled 'Keep going after a usage limit' with the text 'Spend your credits when a usage limit stops you.' and the available credits, or 'Buy credits above to use this.' (BillingSection.tsx:1212-1214).
- Promotion code box on the upgrade dialog, with Remove and an inline alert for errors (UpgradePromotionCode.tsx:105-111).
- Credit history table (BillingSection.tsx:1239).
- Trial cancel page reached by an emailed link (apps/web/app/trial/cancel/TrialCancelControls.tsx).

**Journey**

1. Buy credits: open Settings > Billing, pick a pack or an amount, press Buy; the app calls POST /api/billing/top-up and hands off to a Stripe payment page (TopUpPanel.tsx:106-113; top-up/route.ts:180-236); Stripe returns to /settings/billing?topup=success; the webhook adds the credits to the purchased balance (apps/web/app/api/stripe-webhook/lib/handlers.ts:79; db.ts:407).
2. Turn on overage: switch 'Keep going after a usage limit'; the page sends PUT /api/billing/overage with { enabled } and rolls the switch back with an error line if it fails (BillingSection.tsx:301-324; overage/route.ts:56-91).
3. Hit a limit: with overage on and headroom, the turn is admitted and paid from credits; otherwise the refusal text tells the person to turn credits on, buy more, or wait for the reset (apps/web/lib/services/managed-usage-request-service.ts:545-557).
4. Promotion code on upgrade: press 'Add a promotion code', type it, press Apply; the server checks it and shows the discount ('Promotion CODE: 20% off this payment.') or an error (UpgradePromotionCode.tsx:15-27,74-76; apps/web/lib/server/stripe-upgrade-subscription.ts:206-217).
5. Trial: the person starts checkout for a plan that has trial days; the checkout page states the end date and the charge; a reminder email arrives 2 days before the end; the person can cancel from the emailed link or Settings > Billing (apps/web/app/api/checkout/route.ts:60-80; trial-reminder-service.ts:15).

**What the person sees and gets**

- Trial period row reads 'Trial ends on' with the date; status badge 'Free trial' (BillingSection.tsx:68,150).
- Switch error: 'Could not update the setting.' or 'Your overage setting could not be read.' (BillingSection.tsx:321,503).
- Top-up errors: 'Choose a whole-dollar top-up from $20 to $1000.', 'Top-ups are available on active paid plans. Start or restore your plan first.', daily-cap message 'You can add up to ... a day.' (apps/web/app/api/billing/top-up/route.ts:121-124,155-158,206-211).
- Promotion errors: 'That promotion code is not valid.', 'has ended', 'has expired', 'has been fully redeemed', 'only for a first purchase' (stripe-upgrade-subscription.ts:179,206-217).
- Usage > Credit balances shows balances and expiry text: 'Purchased credits don't expire.' or the lots that expire under local law (UsageSection.tsx:402-413).

**Settings**

- overage_enabled preference on the subscription row, default false (apps/web/db/neon/0118_managed_usage_overage.sql:51).
- Personal spend limit that caps credit spend (doc: docs/product/commercial.md:251-253; migration 0378_personal_spend_limit.sql).
- Auto-reload panel for Stripe-billed accounts (BillingSection.tsx:1185-1190).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web top-up purchase: POST /api/billing/top-up validates amount 20 to 1000 whole dollars, daily cap 2000 dollars, paid plan and USD billing, then creates a Stripe payment session (apps/web/app/api/billing/top-up/route.ts:41-46,100-236; packages/contracts/types/src/billing-topups.ts:5-14).
- Volume discounts of 5, 10, 20 and 30 percent at 50, 100, 250 and 1000 dollars (billing-topups.ts:17-23).
- Webhook credits the purchase through add_credits_microusd with type 'purchase' (apps/web/app/api/stripe-webhook/lib/db.ts:407-415; handlers.ts:79).
- Purchased balance is kept apart from plan allowance in token_credits.top_up_allocated_cents and carries across renewals (apps/web/db/neon/0111_credit_top_up_carry.sql:1-8; doc: docs/product/commercial.md:229-246).
- Overage GET and PUT route, with CSRF, rate limit, strict body schema and an audit event (apps/web/app/api/billing/overage/route.ts:46-91).
- Admission tags a turn funded from credits as is_overage for its whole life, and the plan windows exclude tagged rows (apps/web/db/neon/0281_managed_usage_overage_classification.sql:51-57,119-123,252-264).
- Refusal wording changes with the overage state (managed-usage-request-service.ts:545-557).
- Code-granted trial expiry: hourly job at minute 6 moves trialing rows with no Stripe, Apple or Google id and a past end date to Free, 200 per batch, up to 10 batches, with an audit event (vercel.json cron entry for /api/cron/expire-code-trials; apps/web/lib/services/code-trial-expiry.ts:14-31; apps/web/app/api/cron/expire-code-trials/route.ts:12-45).
- Stripe-side trial plumbing in checkout: trial days, payment method required, missing payment method cancels, disclosure text with the end date and charge, reminder email 2 days before (apps/web/lib/billing/trial-policy.ts:20-35; checkout/route.ts:60-80; trial-reminder-service.ts:15; cron /api/cron/remind-trials hourly at minute 13).
- Referral friend trial of 7 days applies to Pro checkout for a referred user (apps/web/lib/services/referral-service.ts:223-236; referral-program.ts:9).
- Promotion code check on an upgrade of an existing Stripe subscription, bound to the signed preview (apps/web/app/api/upgrade/route.ts:256-292).
- Bonus credits: grant, 90-day expiry, daily expiry job, shown in Usage (apps/web/lib/services/bonus-credit-service.ts:7,66-90; vercel.json /api/cron/expire-bonus-credits; UsageSection.tsx:421-431).
- Purchased lots expire only where local law requires, via a daily job (vercel.json /api/cron/expire-purchased-credits; purchased-credit-expiry-service.ts; migration 0298).
- Operator goodwill grants (apps/web/app/api/operator/route.ts:173) and usage-limit promotions behind the flag billing.usage_promotions (apps/web/lib/feature-flags/usage-promotions.ts:4; migration 0390).

**Incomplete**

- No plan in the catalog sets trial days: the field exists on the type but no entry sets it, so checkout trials come only from the referral program today (packages/contracts/types/src/billing-catalog.ts:150,1047-1052; a search for 'trialDays' in packages found only the type, the getter and product-plan.ts). [inferred from the search]
- The code that creates a non-Stripe 'trialing' subscription (a code-granted trial) was not found; only its expiry job exists (apps/web/lib/services/code-trial-expiry.ts). Unknown who grants it.
- Promotion-code entry exists on the upgrade flow of an existing Stripe subscription; first checkout relies on the code box on the Stripe page (upgrade/route.ts:256; checkout/route.ts:522). There is no promo field in Billing for plain Free users beyond that.
- Tauri desktop shows a top-up panel and 'Trial' label but no overage switch or promotion box was found (apps/desktop/src/features/settings/CreditTopUp.tsx; BillingSettings.tsx:12).

**Present but disconnected or switched off**

- Mobile top-up and trial rows are built but the billing feature is off: FEATURES.billing is false (apps/mobile/lib/v1FeatureFlags.ts:6); also server MOBILE_IAP_ENABLED (doc: brief S81.23).
- Usage-limit promotions are off until an operator enables the row and the flag billing.usage_promotions (migration 0390 header; apps/web/lib/feature-flags/usage-promotions.ts:4).
- Migrations 0281, 0402 and 0414 state 'NOT YET APPLIED : draft only' in their own headers (apps/web/db/neon/0281_managed_usage_overage_classification.sql:3; 0402 header; 0414 header). The current production state is unknown; a project memory note says production is at 0425 but that is not a file in this repository.

**Not available**

- VS Code extension and CLI: no control to buy credits, switch overage, enter a promotion code or start a trial (CLI only prints the status 'trial', apps/cli/src/usage_summary.rs:634).
- Chrome extension: no plan trial, promotion, top-up or overage control found; the brief's 'trials done' for Chrome refers to the shared plan status handling, which could not be traced to a visible control [unknown].
- Local mode: none of this applies; there is no plan, credit or overage locally.

## 4. Required behaviour

**Established requirements**

- A plan can be granted as a time-limited trial that is shown as a trial and ends (reverts or bills) when its period is over. (source: S81.18 (brief))
- Promotional entitlements (promo codes, bonus credits, invite grants) exist, are applied to the account and are visible to the user. (source: S81.19 (brief))
- Users can buy credit top-ups that form a separate purchased balance, which carries over and is shown apart from the plan allowance. (source: S81.20 (brief))
- Users can opt in to spending purchased credits past a plan limit (overage), off by default, and overage use is accounted separately from the plan windows. (source: S81.21 (brief))
- Purchased credits are never spent while usage credits are off; a credit turn is tagged is_overage for its whole life and plan windows exclude it. (source: doc: docs/product/commercial.md:249-258)
- Only accounts billed by Stripe, Apple or Google buy and switch credits; others are told the plan manager controls them. (source: doc: docs/product/commercial.md:260-264)
- Purchased top-ups remain separate and usage never resets on upgrade. (source: doc: docs/product/definition.md:395)

**Acceptance criteria**

1. A new account has overage off; GET /api/billing/overage returns enabled=false.
2. PUT /api/billing/overage { enabled: true } on a plan returns enabled=true and a refusal on a Free account with no subscription row says to start a plan.
3. A top-up of 20 dollars completed in Stripe raises Purchased credits by 1000 credits and does not change the plan or renewal date.
4. With overage off, a turn past a rolling limit is refused with text that says to turn on credits; with overage on and enough credits, the turn is admitted and the 5-hour and weekly meters do not rise.
5. A trialing subscription with no store or Stripe id and a past end date becomes Free after the next job run; one with a Stripe id is not touched.
6. An invalid or expired promotion code shows an error and leaves the plan and the price unchanged.
7. Usage shows Bonus credits and Purchased credits as rows separate from the plan meters.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A trial should show its end date on every app that shows the plan; only web, Tauri desktop, mobile (switched off) and CLI text were found to show a trial status. [inferred]
- Mobile and Chrome should tell the person where to buy credits when a limit stops them. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one place that grants a code-granted trial, with an audit event, so the expiry job has a producer in the repository.
- [proposed] Reconcile the commercial document (purchases older than 12 months excluded) with the interface copy (purchased credits do not expire except where local law requires).
- [proposed] Show the overage switch state in the CLI and VS Code usage summary.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/billing/top-up | `apps/web/app/api/billing/top-up/route.ts` | Validates and starts a Stripe payment session for a credit pack |
| endpoint | GET and PUT /api/billing/overage | `apps/web/app/api/billing/overage/route.ts` | Reads and saves the overage preference and the available credits |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Creates plan checkout with trial days, trial disclosure and promotion codes allowed |
| endpoint | POST /api/upgrade | `apps/web/app/api/upgrade/route.ts` | Upgrades an existing subscription and applies a checked promotion code |
| service | resolveUpgradePromotion | `apps/web/lib/server/stripe-upgrade-subscription.ts` | Looks up a promotion code in Stripe and returns specific error messages |
| service | trial-policy | `apps/web/lib/billing/trial-policy.ts` | Decides trial eligibility and builds Stripe trial parameters |
| service | referral-service referralTrialDays | `apps/web/lib/services/referral-service.ts` | Gives a 7-day Pro trial to a referred user |
| service | code-trial-expiry | `apps/web/lib/services/code-trial-expiry.ts` | SQL that ends non-Stripe trials and sets the plan to Free |
| job | expire-code-trials cron | `apps/web/app/api/cron/expire-code-trials/route.ts` | Hourly batch runner with audit events |
| job | remind-trials cron | `apps/web/app/api/cron/remind-trials/route.ts` | Sends the trial-ending reminder email |
| service | trial-reminder-service | `apps/web/lib/services/trial-reminder-service.ts` | Reminder timing (2 days) and cancel-link state |
| service | bonus-credit-service | `apps/web/lib/services/bonus-credit-service.ts` | Grants bonus credits, 90-day expiry, balance lots |
| service | purchased-credit-expiry-service | `apps/web/lib/services/purchased-credit-expiry-service.ts` | Expires purchase lots where local law requires |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | Admission and refusal wording for limit and credit turns |
| service | spendable-credits | `apps/web/lib/server/spendable-credits.ts` | Reads overage_enabled and available credits for a user |
| config | billing-topups constants | `packages/contracts/types/src/billing-topups.ts` | Pack sizes, limits, discounts, quote function shared by apps |
| component | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Trial row, overage switch, credit history |
| component | TopUpPanel | `apps/web/features/billing/components/TopUpPanel.tsx` | Buy credits UI |
| component | UpgradePromotionCode | `apps/web/features/billing/components/UpgradePromotionCode.tsx` | Promotion code input and summary |
| component | UsageSection CreditBalancesCard | `apps/web/features/settings/sections/UsageSection.tsx` | Shows bonus and purchased balances |
| table | subscriptions.overage_enabled | `apps/web/db/neon/0118_managed_usage_overage.sql` | Stores the opt-in, default false |
| table | token_credits, credit_transactions, expiring_credit_purchases | `apps/web/db/neon/0298_purchased_credit_lifetime.sql` | Plan and purchased balances, ledger, purchase lots |
| schema | managed_usage_requests.is_overage | `apps/web/db/neon/0281_managed_usage_overage_classification.sql` | Marks a request as funded from credits |
| table | usage_limit_promotions and grants | `apps/web/db/neon/0390_usage_limit_promotions.sql` | Operator-configured resets and uplifts, flag-gated |
| component | desktop CreditTopUp | `apps/desktop/src/features/settings/CreditTopUp.tsx` | Tauri desktop credit pack panel for Stripe-billed active or trialing accounts |
| component | mobile cloud-billing | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Trial row and store top-ups, switched off by v1 flag |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Buy in Settings > Billing; the web page (or the hosted page in the public Desktop) sends the amount. | device | apps/web/features/billing/components/TopUpPanel.tsx:106-113 |
| Server checks CSRF, rate limit, plan-change gate, organization policy, amount, paid plan, USD billing and the daily cap, then creates a Stripe payment session with the credit metadata. | our servers | apps/web/app/api/billing/top-up/route.ts:100-236 |
| Person pays on the Stripe page. | outside service | apps/web/app/api/billing/top-up/route.ts:218-221 (success and cancel URLs) |
| Stripe webhook adds credits to the purchased balance and writes a 'purchase' ledger row and an expiring-lot row. | our servers | apps/web/app/api/stripe-webhook/lib/handlers.ts:79; db.ts:407-415 |
| Person switches overage; PUT writes subscriptions.overage_enabled and records an audit event. | our servers | apps/web/app/api/billing/overage/route.ts:70-91 |
| On each managed turn, a database function reserves cost under a per-user lock; if a rolling cap would be crossed and credit headroom covers the estimate it admits the turn as overage, else it refuses. | our servers | apps/web/db/neon/0281_managed_usage_overage_classification.sql:196-238 |
| Hourly cron ends code-granted trials; daily crons expire bonus credits and local-law purchase lots; hourly cron sends trial reminders. | our servers | vercel.json cron entries; apps/web/app/api/cron/expire-code-trials/route.ts:19-45 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| overage_enabled flag | table:subscriptions | Read by every app from the server; not stored on the device | Kept with the subscription row |
| Purchased balance and top_up_allocated amount | table:token_credits | Server is the source; apps read it through the usage and billing endpoints | Carries across renewals; owner is immutable (doc: docs/product/commercial.md:264-267) |
| Purchase and bonus ledger rows | table:credit_transactions | Server only | Credit history shown to the person; deleted with the account (apps/web/app/trust/page.tsx lists bonus and purchase tables in erasure) |
| Purchase lots | table:expiring_credit_purchases | Server only | Expire only under local-law rules via a daily job |
| Overage classification | table:managed_usage_requests (is_overage) | Server only | Inherited by every ledger row of the request |
| Trial state | table:subscriptions (status trialing, current_period_end) | Server only | Set to canceled and Free at expiry for code-granted trials |

**Models and providers.** The feature does not choose a model. Overage pays for managed (Cloud) turns made on provider routes chosen by routing; flagship-model caps are one of the windows overage can pass (migration 0281:224-237). Own-key and Local turns do not use plan credits [inferred; no overage rule appears in the own-key path, not traced].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | An AGI account signed in to Cloud is required. Only accounts billed by Stripe, Apple or Google can buy credits or switch overage (BillingSection.tsx:454-456; top-up/route.ts:149-158). |
| Permissions | Overage PUT requires a user session and a CSRF token (overage/route.ts:56-59). Top-up passes an organization policy check with resource credit_topup (top-up/route.ts:112-127). Operators need the operator or platform-admin route for grants. |
| Subscription | Top-up and overage need an active or trialing paid plan. Free accounts see only an upgrade prompt (TopUpPanel.tsx:88-101). Trial status counts as entitled (packages/contracts/types/src/subscription-entitlement.ts:3). |
| Limits and metering | Top-up 20 to 1000 dollars per purchase, 2000 dollars per day, 50 credits per dollar (billing-topups.ts:5-8). Bonus credits expire after 90 days (bonus-credit-service.ts:7). Plan windows exclude overage-tagged spend (0281). A personal spend limit also bounds credit spend (doc: docs/product/commercial.md:251-253). |
| Feature flags | STRIPE_CHECKOUT_ENABLED (top-up and checkout), billing.usage_promotions (usage-limit promotions), FEATURES.billing and MOBILE_IAP_ENABLED (mobile). Names and purposes only. |
| Model compatibility | None found in the code for credits or overage by model; flagship models have their own weekly cap which overage can pass (0281:224-237). |
| Provider restrictions | Top-ups need USD billing on Stripe and refuse other currencies (top-up/route.ts:166-174). Store-billed accounts can buy through a Stripe customer made for them (top-up/route.ts:70-95). |
| Local mode | Local inference is free of any paid subscription. No trial, promotion, credit or overage rule applies to Local mode: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Overage switch saving | Switch is disabled while pending, flips at once and reverts with an error line if the save fails | BillingSection.tsx:301-324 |
| Overage read fails | Shows 'Your overage setting could not be read.' | BillingSection.tsx:503 |
| No subscription row on PUT overage | Validation error: start a plan first | overage/route.ts:80-85 |
| Overage on but no credits | Text says buy credits to use it; a refused turn says credits do not cover the message | BillingSection.tsx:1212-1214; managed-usage-request-service.ts:545-549 |
| Free account on Billing | Sees credit packs available on paid plans and an upgrade prompt; no overage switch | TopUpPanel.tsx:88-101; BillingSection.tsx:1183,1192 |
| Non-USD plan | Top-up refused with no charge | top-up/route.ts:166-174 |
| Stripe currency lookup fails | Service-unavailable error 'No charge was made; please retry.' | top-up/route.ts:53-62 |
| Daily cap reached | Message to choose a smaller amount or try tomorrow | top-up/route.ts:206-211 |
| Trial end for Stripe trial with no card | Stripe cancels at trial end (missing_payment_method cancel) | apps/web/lib/billing/trial-policy.ts:28-31 |
| Billing notice email not configured | Checkout continues without a trial | trial-policy.ts:74-80 |
| Trial eligibility cannot be checked | Checkout continues without a trial | trial-policy.ts:45-51 |
| Expiry run interrupted | Rows are locked with skip locked; the next hourly run takes the rest | code-trial-expiry.ts:17-24; apps/web/app/api/cron/deployable-components.json:255 |
| Unauthorized cron call | 401 | expire-code-trials/route.ts:20-23 |
| Invalid promotion code | Specific error text; plan unchanged; 'could not be checked' if Stripe fails | stripe-upgrade-subscription.ts:206-217; upgrade/route.ts:272-279 |
| Accessibility | Promotion form has a hidden label and an alert role for errors; switch has aria-labelledby; touch targets enlarged on coarse pointers | UpgradePromotionCode.tsx:78-84,105; BillingSection.tsx:1230 |
| Offline | not handled in the code beyond the fetch error messages above; no offline queue was found | searched BillingSection.tsx and TopUpPanel.tsx |
| Timeout | A billing route deadline constant is imported by top-up; no UI timeout state found | top-up/route.ts:30 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/billing/overage/route.test.ts`: Overage GET and PUT route
- `apps/web/app/api/billing/top-up/route.test.ts`: Top-up route validation and checkout
- `apps/web/app/api/cron/expire-code-trials/route.test.ts`: Cron auth, batching and audit events for trial expiry
- `apps/web/app/api/checkout/route.trial.test.ts`: Trial parameters on checkout
- `apps/web/lib/billing/trial-policy.test.ts`: Trial eligibility rules
- `apps/web/lib/billing/top-up-money.test.ts`: Top-up money and quote maths
- `apps/web/db/neon/managed-usage-overage-classification-migration.test.ts`: Migration 0281 shape
- `apps/web/db/neon/overage-contract-closeout-migration.test.ts`: Migration 0402 shape
- `apps/web/db/neon/renewal-expires-due-purchases-before-carry-migration.test.ts`: Migration 0414 shape
- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: Usage section including overage and credit balances
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: Billing section
- `apps/web/lib/services/managed-usage-request-service.test.ts`: Admission and refusal wording
- `apps/web/lib/services/__tests__/usage-limit-promotion-service.test.ts`: Usage-limit promotions
- `apps/web/app/api/admin/usage-promotions/__tests__/route.test.ts`: Admin usage-promotions route

**Test scenarios**

- **Overage default and toggle**
  1. Sign in as a paid Stripe-billed test account
  2. Open Settings > Billing and read the switch
  3. Turn it on, reload, turn it off
  - Expected: Switch starts off, persists after reload, and the server returns the same state.
- **Top-up purchase**
  1. Open Buy credits
  2. Choose 20 dollars
  3. Pay with a Stripe test card
  4. Return to Settings > Usage
  - Expected: Purchased credits show 1000 more; plan and renewal date are unchanged; Credit history has a Top-up purchase row.
- **Credits fund a turn past a limit**
  1. Use an account at its 5-hour limit with credits and overage on
  2. Send a message
  3. Check the 5-hour meter and credit balance
  - Expected: Turn is answered, credits fall, the 5-hour meter does not rise.
- **Refusal with overage off**
  1. Same account with overage off
  2. Send a message
  - Expected: Refusal says to turn on usage credits in Settings > Billing or wait for the reset.
- **Code trial expiry**
  1. Prepare a trialing subscription with no store ids and a past end date in a test database
  2. Call the cron route with the cron secret
  - Expected: Row becomes canceled on Free and an audit event 'plan_changed' is recorded; a Stripe-backed trial is untouched.
- **Invalid promotion code**
  1. Open an upgrade dialog on a Stripe subscription
  2. Enter a made-up code and press Apply
  - Expected: Alert 'That promotion code is not valid.' and the price is unchanged.

**Where to look when it fails**

- Log line 'Overage preference updated' and audit event plan_changed with resourceType billing_overage (overage/route.ts:92-94)
- Log line 'Ended code-granted trials whose period is over' and 'Code trial expiry cron job failed' (expire-code-trials/route.ts:47-53)
- Top-up refusals logged as 'Top-up refused: ...' (top-up/route.ts:55,88)
- Tables: subscriptions, token_credits, credit_transactions, expiring_credit_purchases, managed_usage_requests
- Error codes ROLLING_FIVE_HOUR_LIMIT_REACHED, ROLLING_WEEKLY_LIMIT_REACHED, FLAGSHIP_WEEKLY_LIMIT_REACHED (0281 function body)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Desktop: [70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md)

## 10. Gaps and dependencies

- **No plan sets trial days, so checkout trials exist only through referral** Affects: Web, Desktop; every new user expecting a plan trial. Evidence: packages/contracts/types/src/billing-catalog.ts:150,1047-1052 and no plan entry sets it. Work needed: Decide if a plan trial is wanted; if yes set trialDays in the catalog and test the checkout, reminder and end flow.
- **No producer of code-granted trials found, only the expiry job** Affects: Operators, web. Evidence: apps/web/lib/services/code-trial-expiry.ts is the only match for the code-trial name. Work needed: Locate or build the grant path with audit and a visible end date.
- **Migrations 0281, 0402, 0414 are marked not yet applied in their headers** Affects: Web overage accuracy and purchased-credit carry. Evidence: first lines of those files. Work needed: Confirm the applied state with the migration status command; update the headers.
- **Documentation and interface disagree on purchase expiry (12 months vs no expiry except local law)** Affects: All apps showing purchased credits. Evidence: docs/product/commercial.md:236 vs UsageSection.tsx:410-413 and TopUpPanel.tsx:122-124. Work needed: Check the code of the carry function and fix the document or the copy.
- **Tauri desktop has no overage switch or promotion box** Affects: Tauri desktop (internal). Evidence: only CreditTopUp.tsx and status labels found. Work needed: Wire it or record that the public Electron Desktop shows the web app instead.
- **Mobile trial and top-up UI is switched off** Affects: Mobile. Evidence: apps/mobile/lib/v1FeatureFlags.ts:6. Work needed: Owner switch-on and store products (brief S81.23).
- **No overage, promotion or trial control on CLI, VS Code or Chrome** Affects: CLI, VS Code, Chrome. Evidence: no matches in apps/cli, apps/extension-vscode, apps/extension beyond status text. Work needed: Decide whether these surfaces link to web Billing and add that link.
- **No file records a run of the tests or a live check of this feature** Affects: All. Evidence: only test sources exist; no result files read. Work needed: Run the listed tests and the scenarios and record results.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-observability-and-operations
- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- table:subscriptions
- table:token_credits
- table:credit_transactions
- file:apps/web/app/api/billing/overage/route.ts

## Unknown

- Who or what creates a code-granted trial (no producer found in the repository).
- Whether migrations 0281, 0402 and 0414 are applied in production; headers say draft.
- Whether any plan gets a trial through Stripe-side configuration outside the repository.
- Whether Chrome extension shows trial or credits state; the brief says trials done but no control was traced.
- Whether the 12-month purchase exclusion in the commercial document is implemented or is copy only.
- Whether the own-key mode has any overage or credit rule; not traced.
- Exact local-law countries beyond the Japan example in copy; not read.
- Mobile server flag MOBILE_IAP_ENABLED value.
