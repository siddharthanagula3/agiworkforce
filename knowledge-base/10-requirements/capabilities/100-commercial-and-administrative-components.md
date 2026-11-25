---
id: "REQ-AREA-100"
type: "requirements"
title: "Requirement items: Commercial and administrative components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 100. Commercial and administrative components

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S100.01

**Plan catalog.** A single plan catalog defines each plan's tier, capabilities and limits and is what checkout and enforcement read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-01 Plans, prices and what a plan allows](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Competitor trace: CAP-subscriptions-and-plans-02

## S100.02

**Price catalog.** A price catalog maps each plan, interval and currency to a real charged price that pricing and checkout use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-01 Plans, prices and what a plan allows](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Competitor trace: CAP-subscriptions-and-plans-02

## S100.03

**Entitlement resolver.** One service resolves what an account is entitled to (plan, seat, grace) and every enforcement point asks it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-01 Plans, prices and what a plan allows](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Competitor trace: CAP-subscriptions-and-plans-17

## S100.04

**Limit/quota resolver.** Per-plan limits and quotas (rolling windows, unit quotas) are resolved from the plan and applied when a request is admitted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-02 Limits, rate and spend controls](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)

## S100.05

**Usage-event ingestion.** Each metered operation records a usage event (who, what model, how much, cost) into durable storage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-03 Metered usage ledger (reserve, settle, release, cost)](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)

## S100.06

**Usage ledger.** An append-only usage ledger holds every reservation, settlement and release so balances and windows can be recomputed correctly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-03 Metered usage ledger (reserve, settle, release, cost)](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)

## S100.07

**Credit reservation.** Before a metered operation runs, its estimated cost is reserved against the account's limits and balance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-03 Metered usage ledger (reserve, settle, release, cost)](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Competitor trace: CAP-subscriptions-and-plans-15

## S100.08

**Credit settlement.** After a metered operation, the reservation is settled at the actual cost and credits are deducted exactly once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-03 Metered usage ledger (reserve, settle, release, cost)](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Competitor trace: CAP-subscriptions-and-plans-15

## S100.09

**Credit refund/release.** Unused or failed reservations are released, stranded ones are recovered, and refunded purchases reverse their credits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-03 Metered usage ledger (reserve, settle, release, cost)](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)

## S100.10

**Cost attribution.** Costs are attributed to account, project, feature and model, and the provider cost is kept separately from what the user is billed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-03 Metered usage ledger (reserve, settle, release, cost)](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)

## S100.11

**Rate-limiting service.** A shared rate-limiting service limits requests per user/route/plan across instances.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-02 Limits, rate and spend controls](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)

## S100.12

**Concurrency-limiting service.** A concurrency limiter caps simultaneous managed turns per account according to plan.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-02 Limits, rate and spend controls](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)

## S100.13

**Budget manager.** A budget manager holds spending limits and stops managed usage when a budget is reached.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-02 Limits, rate and spend controls](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Competitor trace: CAP-subscriptions-and-plans-22

## S100.14

**Checkout adapter.** A checkout adapter creates a payment-provider checkout for any eligible user and returns them to a verified result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-04 Buying a plan and paying](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Competitor trace: CAP-subscriptions-and-plans-05

## S100.15

**Subscription synchronization.** Subscription state is kept in sync with the payment provider, in order, with periodic reconciliation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-04 Buying a plan and paying](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Competitor trace: CAP-subscriptions-and-plans-09

## S100.16

**Payment webhook processor.** A webhook endpoint verifies provider signatures, processes each event exactly once and handles the billing event types.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-04 Buying a plan and paying](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)

## S100.17

**Mobile receipt validation.** Receipts from Apple and Google are validated server-side and grant the matching plan or credits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-05 Mobile store purchases (Apple and Google)](../../20-features/100-commercial-and-administrative-components/F100-05-mobile-store-purchases-apple-and-google.md)
- Competitor trace: CAP-subscriptions-and-plans-10

## S100.18

**Invoice service.** An invoice service produces and lists invoices for each account with downloadable documents.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-06 Invoices, refunds and disputes](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)

## S100.19

**Refund/dispute workflow.** Refunds and disputes are processed end to end: issued, reflected in plan and credits, and reversed when a dispute is won.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-06 Invoices, refunds and disputes](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Competitor trace: CAP-subscriptions-and-plans-13

## S100.20

**Tax calculation integration.** Tax is calculated by an integrated tax engine for every charge, including tax IDs and reverse charge.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-04 Buying a plan and paying](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)

## S100.21

**Seat/license service.** A seat/license service tracks purchased seats, assigns them to members and enforces the count.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-08 Seats, team admin and admin API](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md)
- Competitor trace: CAP-subscriptions-and-plans-23

## S100.22

**Promotion service.** A promotion service creates and applies promo codes, bonus credits and invite grants to accounts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-07 Promotions and referrals](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Competitor trace: CAP-subscriptions-and-plans-18

## S100.23

**Referral service.** A referral service issues referral codes, attributes sign-ups and grants rewards.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-07 Promotions and referrals](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Competitor trace: CAP-subscriptions-and-plans-18

## S100.24

**Usage reporting.** Usage reporting aggregates the ledger by time, model and feature for accounts and workspaces, with export.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-09 Usage reporting and export](../../20-features/100-commercial-and-administrative-components/F100-09-usage-reporting-and-export.md)

## S100.25

**Enterprise billing integration.** Enterprise contracts (committed seats, invoicing terms, PO, offline payment) are stored and drive billing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-10 Enterprise contracts](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Competitor trace: CAP-subscriptions-and-plans-23

## S100.26

**Administrative API.** Organization admins can manage their workspace programmatically through an authenticated, scoped administrative API.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-08 Seats, team admin and admin API](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md)

## S100.27

**Support-case integration.** Support cases are created with account context, routed to staff and threaded with replies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-11 Support cases](../../20-features/100-commercial-and-administrative-components/F100-11-support-cases.md)

## S100.28

**Audit-event store.** Commercial and administrative actions write durable audit events that can be queried later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F100-12 Audit trail](../../20-features/100-commercial-and-administrative-components/F100-12-audit-trail.md)
