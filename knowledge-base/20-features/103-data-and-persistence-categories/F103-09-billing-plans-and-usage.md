---
id: "F103-09"
type: "feature"
title: "Billing, plans and usage"
aliases: ["Billing, plans and usage", "Plans and subscriptions", "Usage and credit ledger entries", "Invoices and payment references", "subscriptions", "token_credits", "credit_transactions", "organization_billing_invoices", "stripe-webhook"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.31", "S103.32", "S103.33"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "mode:cloud", "surface:web", "table:subscriptions", "table:credit_transactions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-09 Billing, plans and usage

Server records of what a person pays and uses: the subscription row, the credit account and ledger of every charge, and workspace invoices mirrored from the payment provider. Managed turns write ledger rows; a turn paid from purchased credits is tagged overage so plan windows ignore it. Financial rows follow a retention schedule.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.31](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10331), [S103.32](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10332), [S103.33](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10333).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps one subscription row per account (plan tier, status, period), a credit account per period, a signed credit ledger of allocations, deductions, purchases and refunds, a managed usage request record per turn, and for workspaces a copy of Stripe invoices (apps/web/db/neon/0003_subscriptions.sql; apps/web/db/neon/0004_token_credits.sql; apps/web/db/neon/0163_enterprise_billing_contracts.sql:66).

**Why it exists.** The AGI Subscription system needs durable entitlement and usage accounting for managed turns so plan windows, extra usage and refunds are enforced and provable.

**Who uses it.** Every Cloud-mode user (by use), billing admins (invoices), operators (reconciliation crons).

**Problems it solves**

- Attribute each managed turn to plan or overage so purchased credits are not charged and then counted again against plan windows (apps/web/lib/server/rolling-usage.ts:25-60).
- Never double charge: idempotency keys on settlement (apps/web/lib/billing/financial-record-retention.ts:40-47).
- Keep books for the statutory period and drop metadata earlier (apps/web/lib/billing/financial-record-retention.ts:1-8,100-140).

**Use cases**

- Subscribe through checkout; the webhook creates the subscription row.
- Send a managed chat turn; reservation and settlement ledger rows are written.
- Hit a rolling limit with usage credits on; the turn runs as overage.
- A workspace admin reads its invoices.

## 2. User experience

**Where to find it**

- Web: Settings > Billing, headings 'Billing' and 'Invoices' (apps/web/features/settings/sections/BillingSection.tsx:650,1056).
- Invoice empty copy: 'Invoices appear here once you are billed on a paid plan.' and 'Invoices for this plan are provided by your organization and are not available here.' (apps/web/features/settings/sections/BillingSection.tsx:1173-1177).
- API: GET /api/billing/invoices, /api/billing/credit-history, /api/billing/top-up and others under apps/web/app/api/billing.
- Other apps: plan and usage reading on desktop, mobile, CLI, VS Code and Chrome not traced in this pass.

**Before you start**

- Signed in.
- Paid plan for invoices; subscription sales state per policy was not checked.

**Screens and controls**

- Billing page with plan, usage credits, invoices list, payment methods, auto reload (routes exist: apps/web/app/api/billing/auto-reload, payment-methods).

**Journey**

1. Person checks out with the payment provider.
2. Provider sends signed webhook events; server verifies signature, dedupes the event, and updates the subscription and credit account.
3. Each managed turn reserves, then settles, ledger rows.
4. If a rolling limit is reached and usage credits cover it, the turn is admitted as overage.
5. Person opens Billing to see invoices and credit history.

**What the person sees and gets**

- Limit refusals name the limit and the next step, for example 'Turn on usage credits in Settings > Billing to keep going with the credits you bought, or wait for the limit to reset.' (apps/web/lib/services/managed-usage-request-service.ts:545-565).
- Invoice list shows number, status, amount, PDF and hosted link (apps/web/lib/services/billing-invoice-service.ts:8-27).

**Settings**

- Usage credits switch and auto reload (billing routes); personal spend limit table (migration 0378).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Webhook route verifies Stripe signature, dedupes events, dispatches checkout, subscription, invoice, refund and dispute events (apps/web/app/api/stripe-webhook/route.ts:12,48; apps/web/app/api/stripe-webhook/lib/handlers.ts:76-322).
- Subscription upsert resolves the plan tier from the registered price, which is authoritative over metadata (apps/web/app/api/stripe-webhook/lib/db.ts:700-735).
- Ledger writes go through database functions (enqueue_credit_settlement_microusd, reserve_managed_usage_request_with_limits_microusd) (apps/web/lib/services/credit-service.ts:266-290; apps/web/lib/services/managed-usage-request-service.ts).
- Rolling-window sums exclude rows tagged is_overage; overage spend per account is summed separately (apps/web/lib/server/rolling-usage.ts:49-100).
- Financial retention cron applies the schedule in batches of 5000 rows (apps/web/app/api/cron/enforce-billing-retention/route.ts; apps/web/lib/billing/financial-record-retention.ts:9).
- Workspace invoices upserted from invoice events with ordering rules (apps/web/lib/services/enterprise-billing-service.ts:707-800).
- User invoices are read live from Stripe, 24 per page (apps/web/lib/services/billing-invoice-service.ts:30-31; apps/web/app/api/billing/invoices/route.ts:28).

**Incomplete**

- Migration 0281 (overage classification), 0305, 0420 and others carry the header 'NOT YET APPLIED : draft only'; applied state is not recorded in the repository (apps/web/db/neon/0281_managed_usage_overage_classification.sql:3).
- 0281 header text says only the reservation row is tagged; its body copies the tag to every row of the request via a trigger. The header is stale (same file, lines 5-20 vs 120-140).
- Later migrations 0347 and 0420 replace the 0281 function bodies, so the live rule is the newest body (apps/web/db/neon/0347_managed_usage_headroom_under_lock.sql; apps/web/db/neon/0420_managed_usage_plan_finishes_crossing_turn.sql).

**Present but disconnected or switched off**

- No financial retention rule exists for organization_billing_invoices; it is deleted only with the workspace (apps/web/lib/server/organization-erasure.ts:93; apps/web/lib/billing/financial-record-retention.ts:38-140).

**Not available**

- Plan limits are not described here; they come from the plan catalog, not read in this pass.
- Ledger behaviour for own-key mode: not examined.

## 4. Required behaviour

**Established requirements**

- Plans and subscriptions are durably stored and classified (financial retention). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.31)
- Usage and credit ledger entries are durably recorded, classified and attributed to plan or overage. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.32)
- Invoices and payment references are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.33)
- An overage turn is paid from purchased credits and must not count against rolling plan windows; the classification belongs to the whole request. (source: apps/web/db/neon/0281_managed_usage_overage_classification.sql:5-35)
- Ledger rows are kept 2922 days then purged; metadata is removed after 730 days; usage events minimised at 180 and purged at 730; Stripe event dedupe purged at 180. (source: apps/web/lib/billing/financial-record-retention.ts:1-8,38-140)
- Subscriptions and credit balance have no maximum age; they are erased with the account. (source: apps/web/lib/billing/financial-record-retention.ts:148-160)
- Every subscription capability on every app connects to one AGI Subscription system. (source: Product context given for this task)

**Acceptance criteria**

1. A checkout.session.completed event for a registered price creates or updates exactly one subscription row for the user.
2. Replaying the same Stripe event does not change balances.
3. A turn admitted as overage has every ledger row tagged is_overage true and does not raise the rolling plan sums.
4. A refused turn names the limit and the next step.
5. The retention cron minimises credit_transactions.metadata older than 730 days and purges rows older than 2922 days.
6. A user's invoices page lists at most 24 items per page and shows the empty copy when none exist.
7. Account erasure removes the subscriber's credit rows but keeps provider cost records without the subject.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plan names are the catalog tiers free, basic, pro, max, max_15x, team, team_premium, enterprise [inferred from packages/contracts/types/src/billing-catalog.ts:5-15].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a retention rule or an explicit reason for organization_billing_invoices.
- [proposed] Fix the stale header of 0281.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | Stripe webhook | `apps/web/app/api/stripe-webhook/route.ts` | Verify, dedupe, dispatch events. |
| service | webhook handlers | `apps/web/app/api/stripe-webhook/lib/handlers.ts` | Event switch for checkout, subscription, invoice, refund, dispute. |
| service | webhook db helpers | `apps/web/app/api/stripe-webhook/lib/db.ts` | Subscription upsert, credit top-up grants. |
| table | subscriptions | `apps/web/db/neon/0003_subscriptions.sql` | One row per account: tier, status, period. |
| table | token_credits and credit_transactions | `apps/web/db/neon/0004_token_credits.sql` | Credit account and signed ledger. |
| schema | overage classification | `apps/web/db/neon/0281_managed_usage_overage_classification.sql` | is_overage on managed_usage_requests and ledger rows. |
| schema | headroom under lock | `apps/web/db/neon/0347_managed_usage_headroom_under_lock.sql` | Reads purchased headroom under the per-user lock. |
| schema | plan finishes crossing turn | `apps/web/db/neon/0420_managed_usage_plan_finishes_crossing_turn.sql` | Newer admission rule for windows. |
| service | CreditService | `apps/web/lib/services/credit-service.ts` | Balance, durable settlement, period reset. |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | Reserve, extend, settle managed turns; refusal messages. |
| service | rolling-usage | `apps/web/lib/server/rolling-usage.ts` | Window sums that skip overage rows. |
| service | financial-record-retention | `apps/web/lib/billing/financial-record-retention.ts` | Purge and minimise schedule. |
| job | enforce-billing-retention cron | `apps/web/app/api/cron/enforce-billing-retention/route.ts` | Runs the schedule daily at 01:00 (vercel.json). |
| job | credit crons | `apps/web/app/api/cron/reset-credits/route.ts` | Daily reset; sibling crons expire bonus and purchased credits and reconcile. |
| service | enterprise-billing-service | `apps/web/lib/services/enterprise-billing-service.ts` | Contracts and workspace invoices from Stripe events. |
| table | organization_billing_invoices | `apps/web/db/neon/0163_enterprise_billing_contracts.sql` | Workspace invoice mirror; admin read policy. |
| service | billing-invoice-service | `apps/web/lib/services/billing-invoice-service.ts` | Reads a user's invoices from Stripe. |
| endpoint | Invoices | `apps/web/app/api/billing/invoices/route.ts` | GET invoice page. |
| component | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Billing screen, invoices list. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies money tables and states ages. |
| service | account-erasure financial disposition | `apps/web/lib/server/account-erasure.ts` | Explains why subject money rows are deleted and platform rows anonymised (lines 347-362). |
| other | billing plan catalog | `packages/contracts/types/src/billing-catalog.ts` | Tiers and capability table. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person pays at the payment provider checkout. | outside service | apps/web/app/api/stripe-webhook/lib/handlers.ts:76 |
| Provider posts a signed event; server verifies and dedupes it. | our servers | apps/web/app/api/stripe-webhook/route.ts:48-65 |
| Handler resolves the plan from the price and upserts the subscription and credit account. | our servers | apps/web/app/api/stripe-webhook/lib/db.ts:454,700-735 |
| A managed turn reserves an estimate under a per-user lock; if a window is full and purchased headroom covers it, the request is marked overage. | our servers | apps/web/db/neon/0281_managed_usage_overage_classification.sql:200-285; 0347 replaces body |
| Settlement writes the actual-cost delta; every ledger row inherits flags from the request. | our servers | apps/web/db/neon/0281_managed_usage_overage_classification.sql:120-145 |
| Nightly cron minimises and purges aged rows. | our servers | apps/web/app/api/cron/enforce-billing-retention/route.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Subscription row | subscriptions | Server; apps read plan through API | No maximum age; erased with the account (apps/web/lib/billing/financial-record-retention.ts:148-153) |
| Credit ledger | credit_transactions | Server only | Metadata cleared at 730 days, row purged at 2922 days; erased with the account (apps/web/lib/server/account-erasure.ts:171) |
| Stripe event ids | processed_stripe_events | Server only | Error text cleared at 30 days, row purged at 180 |
| Workspace invoices | organization_billing_invoices | Server only | Deleted with the workspace; no age rule |

**Models and providers.** Which model ran decides the cost and the flagship flag on a request; the provider cost is booked separately (provider_cost_events). Model identifiers are not recorded here. The payment provider is Stripe. Own-key and Local runs do not use this ledger as far as the examined code shows [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in required; invoices route uses user-scoped database without organization resolution (apps/web/app/api/billing/invoices/route.ts:19). |
| Permissions | Workspace invoices readable by owner and admin roles (apps/web/db/neon/0163_enterprise_billing_contracts.sql row policy). |
| Subscription | This feature is the subscription system store. Capabilities by tier in billing-catalog. |
| Limits and metering | Rolling five-hour, weekly and flagship-weekly windows; period allowance; limits come from the plan catalog (not read). |
| Feature flags | none found in the code for the ledger itself. |
| Model compatibility | Flagship models have a separate weekly window (apps/web/lib/server/rolling-usage.ts:46-48). |
| Provider restrictions | none found in the code. |
| Local mode | Local inference writes no ledger rows in the code examined; free of subscription per product requirement [inferred; not verified here]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Duplicate webhook event | Returns received with 'Event already processed'. | apps/web/app/api/stripe-webhook/route.ts:65-70 |
| Unregistered price | Throws; no subscription created. | apps/web/app/api/stripe-webhook/lib/db.ts:700 |
| Rolling usage query fails | Treated as zero usage with a warning. | apps/web/lib/server/rolling-usage.ts:62-72 |
| Limit reached, no credits | Declined with limit name and wait or upgrade advice. | apps/web/lib/services/managed-usage-request-service.ts:545-565 |
| No invoices | Empty copy by plan type. | apps/web/features/settings/sections/BillingSection.tsx:1173-1177 |
| Invoice load failure | 'Invoices could not be loaded.' | apps/web/features/settings/sections/BillingSection.tsx:538 |
| Out-of-order invoice events | Older event cannot overwrite a newer one. | apps/web/lib/services/enterprise-billing-service.ts:765-775 |
| Mobile in-app purchase | tables mobile_iap_transactions exist; flow not examined | apps/web/lib/services/deletion-manifest.ts:183-184 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/stripe-webhook/lib/__tests__/route.test.ts`: Webhook route.
- `apps/web/app/api/stripe-webhook/lib/__tests__/event-replay-convergence.test.ts`: Replay gives the same result.
- `apps/web/app/api/stripe-webhook/lib/__tests__/enterprise-billing-events.test.ts`: Workspace invoice events.
- `apps/web/db/neon/managed-usage-overage-classification-migration.test.ts`: 0281 migration.
- `apps/web/db/neon/managed-usage-headroom-under-lock-migration.test.ts`: 0347 migration.
- `apps/web/db/neon/managed-usage-plan-finishes-crossing-turn-migration.test.ts`: 0420 migration.
- `apps/web/lib/services/__tests__/credit-service-durability.test.ts`: Durable settlement.
- `apps/web/lib/services/enterprise-billing-service.test.ts`: Enterprise contracts and invoices.
- `apps/web/app/api/cron/enforce-billing-retention/route.test.ts`: Retention cron.
- `apps/web/__tests__/billing-record-retention-disclosure.test.ts`: Published retention claims match the schedule.
- `apps/web/app/api/billing/invoices/__tests__/route.test.ts`: Invoices route.

**Test scenarios**

- **Webhook idempotence**
  1. Send a signed test checkout event twice to a local build.
  2. Read subscriptions and credit_transactions.
  - Expected: One subscription row, no duplicate ledger credit.
- **Overage turn tagging**
  1. Fill the five-hour window of a test account with usage credits on.
  2. Send a managed turn.
  - Expected: Request is_overage true; its ledger rows carry is_overage; rolling sum unchanged.
- **Limit refusal copy**
  1. Fill the window with credits off and some purchased balance.
  - Expected: Message advises turning on usage credits in Settings > Billing.
- **Retention run**
  1. Insert ledger rows aged 800 and 3000 days.
  2. Call the cron with the cron secret.
  - Expected: 800-day row loses metadata; 3000-day row deleted.
- **Workspace invoice order**
  1. Deliver an invoice.paid then an older invoice.updated.
  - Expected: Row keeps the newer status.

**Where to look when it fails**

- Log 'Webhook processed successfully'; 'Ignoring stale subscription metadata because the purchased Stripe Price is authoritative'.
- Log '[getRollingUsage] Failed to fetch rolling usage'.
- Tables credit_transactions, managed_usage_requests, processed_stripe_events, organization_billing_invoices.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Applied state of overage migrations is unknown; headers say draft.** Affects: All Cloud users if not applied.. Evidence: apps/web/db/neon/0281_managed_usage_overage_classification.sql:3; 0305 and 0420 headers. Work needed: Read the migration status for each environment.
- **Stale header in 0281 contradicts its body, and the file names itself 0279.** Affects: Engineers reading the migration.. Evidence: apps/web/db/neon/0281_managed_usage_overage_classification.sql:1,16-26. Work needed: Correct the header in a new documentation change; do not edit an applied migration.
- **Workspace invoices have no stated retention age.** Affects: Workspace admins and compliance.. Evidence: apps/web/lib/billing/financial-record-retention.ts:38-160. Work needed: Add a rule or documented reason.
- **App-by-app use of plans and usage on desktop, mobile, CLI, VS Code, Chrome not traced.** Affects: Those apps.. Evidence: not examined. Work needed: Trace each app to the billing and usage endpoints.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- mode:cloud
- surface:web
- table:subscriptions
- table:credit_transactions

## Unknown

- Whether migrations 0281, 0305, 0420 are applied in each environment.
- Plan limit numbers (not read).
- Whether own-key turns write any ledger rows.
- How desktop, mobile, CLI, VS Code and Chrome read plan and usage.
- Whether the subscriptions plan_tier check from 0003 was widened by a later migration.
