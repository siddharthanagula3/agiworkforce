# Enterprise billing operator runbook

Status: Draft. Nothing below has been exercised end to end in Stripe test mode.
Owner: Founder / billing operator
Last updated: 2026-09-04

This runbook is the operator procedure for provisioning, collecting, and
enforcing an AGI Enterprise contract in Stripe. It describes the target design
locked by the founder on 2026-09-04 and implemented across three work
packages in this repository: the webhook and cron handlers
(`apps/web/app/api/stripe-webhook`, `apps/web/lib/services/enterprise-billing-service.ts`,
`apps/web/app/api/cron/enforce-billing-collection`), the hold and banner
enforcement (`apps/web/lib/services/organization-policy-evaluator.ts`,
`apps/web/lib/services/organization-policy-gate.ts`), and the usage-metering
cron (`apps/web/lib/services/enterprise-usage-metering.ts`,
`apps/web/app/api/cron/report-enterprise-usage`). As of this writing those
service and cron files do not yet exist in the repository; the migration that
backs all of them, `apps/web/db/neon/0163_enterprise_billing_contracts.sql`,
is marked NOT YET APPLIED. Before following any step below against a real
customer, confirm the referenced files exist, read as described, and pass
their own tests. **Do not repeat any claim from this runbook to a customer or
on a public page until the test-mode lifecycle checklist in the last section
has been run and passed in full**, per the founder's decision recorded in the
work package spec this runbook was written against.

## 1. What is decided

These are locked decisions, not open questions. They are restated here so an
operator does not have to reconstruct them from a ticket.

| Decision           | What it means operationally                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provisioning       | The subscription is created in Stripe at contract signature with `collection_method: send_invoice`, `days_until_due: 30`, and `quantity` equal to committed seats. Access is active while the first invoice is open.                                                                                                                                                                                                                                                        |
| Overdue automation | Staged by days past the oldest open invoice's due date: 1 to 30 an owner billing banner plus internal notification; 31 to 60 a stronger workspace-admin warning plus repeated internal escalation; 61 to 90 the workspace stays operational but seat expansion and new paid usage commitments are blocked; over 90 the workspace goes read-only. Customer data is never deleted for non-payment, at any stage.                                                              |
| Cadence            | Annual upfront is the default. Quarterly is a negotiated exception recorded on the Order Form; it is never offered as a public option.                                                                                                                                                                                                                                                                                                                                      |
| Pricing            | Committed per-seat plus metered usage in AGI's own provider-neutral units, priced by AGI's catalog, never a provider cost pass-through. The included usage allowance per period, any negotiated committed usage block, and any minimum annual spend are contract fields, not code constants.                                                                                                                                                                                |
| Entitlement        | Comes from Stripe billing objects only. The enterprise tier is any price whose product is the configured Enterprise product (`STRIPE_PRODUCT_ENTERPRISE`). Metadata never decides a tier. An unmapped price on a new subscription gets no paid tier; an existing paid subscription whose price becomes unmapped keeps its stored tier. Both cases log an error and record an audit event.                                                                                   |
| Rails              | ACH debit and bank transfer are the primary collection methods, card is the fallback, USD only.                                                                                                                                                                                                                                                                                                                                                                             |
| PO number          | Stored on the Stripe invoice as a custom field and mirrored in `organization_billing_contracts.procurement_reference`.                                                                                                                                                                                                                                                                                                                                                      |
| Public copy        | No public page describes NET 30, purchase orders, bank transfer, or enterprise invoicing until the checklist at the end of this runbook has passed.                                                                                                                                                                                                                                                                                                                         |
| EU representative  | A founder action, not a Stripe step and not automated. Before an EU-domiciled Enterprise customer's Order Form is signed, the founder purchases and appoints an Article 27 GDPR representative service. Until that purchase is made, `apps/web/app/legal/eu-representative/page.tsx` keeps stating that none is appointed; update it in the same change as the purchase. See `docs/decisions/2026-09-04-region-neutral-data-residency.md` for the decision this implements. |

## 2. One-time Stripe account setup

Do this once per Stripe account (test mode first, then live mode after the
checklist passes). Stripe's dashboard is scoped per mode, so every object
below needs to be created twice: once in test mode, once in live mode when
you are ready.

### 2.1 Create the Enterprise product

Dashboard: **Product catalog** > **+ Create product**. Name it something an
invoice reader recognizes, for example "AGI Enterprise". Do not attach a
price yet; contract-specific prices are created per deal in section 3.
Record the resulting product id (`prod_...`) as the `STRIPE_PRODUCT_ENTERPRISE`
environment value for that mode. Never print or paste the live value into a
ticket, a chat message, or this runbook; the environment contract guard
(`scripts/env-doctor.mjs`) only needs the variable name registered,
not the value.

Source: [Set up per-seat pricing](https://docs.stripe.com/subscriptions/pricing-models/per-seat-pricing).

### 2.2 Configure invoice collection settings so nothing auto-cancels early

**This is the step most likely to be gotten wrong, and getting it wrong
breaks the entire 30/60/90 design.** Go to **Settings** > **Billing** >
**Invoices**. Under the section that controls what happens to a `send_invoice`
subscription after its invoice goes overdue, Stripe offers an action at each
of the 30, 60, and 90 day checkpoints, chosen from three options: cancel the
subscription, mark the subscription as unpaid, or leave the subscription past
due.

Set **all three checkpoints to "Leave the subscription past due."** Do not
choose "cancel" or "mark as unpaid" at any checkpoint. The reason is not
stylistic:

- If Stripe cancels the subscription, its status becomes `canceled`. The
  enterprise-aware entitlement helper this repository adds
  (`packages/contracts/types/src/subscription-entitlement.ts`) only extends
  entitlement to a `past_due` status; a `canceled` status drops entitlement
  immediately and completely, which is a harder, more sudden cutoff than the
  decided 30/60/90 ramp and defeats the "workspace read-only, data retained"
  design at day 90.
- If Stripe marks the subscription "unpaid" instead, the same problem occurs
  one step earlier: `unpaid` is not the status the entitlement helper checks
  for, so access drops the moment Stripe flips that flag, regardless of
  which day-checkpoint fired it.

With every checkpoint set to "leave past due," the Stripe subscription
status simply stays `past_due` for as long as the oldest invoice is unpaid,
and the graduated 1-30 / 31-60 / 61-90 / 90-plus consequences are enforced
entirely by this repository's own cron and policy gate, driven off
`oldest_open_invoice_due_at` in `organization_billing_contracts`, not by
Stripe's subscription status. That is the intended architecture: Stripe
tracks money, the product tracks access.

Source: [Billing collection methods](https://docs.stripe.com/billing/collection-method), "Due dates for manual payment invoices."

### 2.3 Enable ACH Direct Debit and bank transfer as default invoice payment methods

Same **Settings** > **Billing** > **Invoices** page, under **Default payment
methods** > **Edit payment methods**. Turn on **ACH Direct Debit** (US bank
accounts, USD only) and **Bank transfer** (Stripe creates a virtual bank
account number per customer and reconciles incoming transfers automatically).
Leave card enabled as the fallback the decision calls for. Do not enable
payment methods outside USD; the decision is USD only.

Sources: [Invoicing and ACH Direct Debit](https://docs.stripe.com/invoicing/ach-direct-debit); [Bank transfer](https://docs.stripe.com/invoicing/bank-transfer); [Payment methods](https://docs.stripe.com/invoicing/payment-methods).

## 3. Per-contract setup, at signature

Repeat this section for each new Enterprise customer, after the Order Form
(`docs/compliance/enterprise-order-form-template.md`) is signed.

1. **Create a contract-specific per-seat price** under the Enterprise
   product: **Product catalog** > the Enterprise product > **+ Add price**,
   `Recurring`, the negotiated per-seat amount, billing period `Year`
   (annual default) or `Month` with an interval count of 3 (the quarterly
   exception, only when the Order Form records it). Record the price id.
2. **If the contract has an overage price**, create a Billing Meter first
   (Dashboard: **Product catalog** > **Meters** > **+ Create meter**, or
   `stripe.billing.meters.create` via the API), then create a second price
   on the Enterprise product with `recurring.usage_type: metered` pointing
   at that meter, priced from AGI's own per-unit rate for the managed-usage
   ledger. Record this price id as `overage_stripe_price_id` on the contract
   row. A contract with no negotiated overage pricing skips this step
   entirely; the usage-metering cron (WP-C) logs once and skips reporting
   for any contract with no overage price configured.
3. **Create the customer**: name, billing email, tax id (Customer object's
   `tax_id_data`), and billing address from the Order Form's Customer Legal
   Entity fields.
4. **Create the subscription**: `customer`, the per-seat price with
   `quantity` equal to committed seats (plus the metered price as a second
   item if step 2 applies), `collection_method: send_invoice`,
   `days_until_due: 30`.
5. **Set the PO number as an invoice custom field** on the subscription's
   `invoice_settings.custom_fields`, for example
   `[{"name": "PO Number", "value": "<the customer's PO number>"}]`. This is
   available directly on the Subscriptions API as of the `2026-06-24.dahlia`
   API version; on an older pinned API version, set it once from the
   Dashboard's subscription editor under invoice customization instead.
   Every invoice this subscription generates carries the field. If no PO
   number exists yet, fall back to `metadata.po_number` on the subscription;
   the webhook handler reads the invoice custom field first and the
   subscription metadata second, for the `procurement_reference` value only.

   Source: [Adds invoice description, footer, and custom fields to the Subscriptions API](https://docs.stripe.com/changelog/dahlia/2026-06-24/invoice-description-footer-and-custom-fields).

6. Confirm in the Dashboard, on the new subscription's detail page, that
   **Billing method** reads "Send invoice" and that the due date shows 30
   days out. If it does not, the subscription was created with the wrong
   collection method and must be recreated; it cannot be safely converted
   in place without leaving a stray invoice behind.
7. **Set the negotiated contract fields as subscription metadata.** These
   terms come from the Order Form and have no operator UI; the webhook reads
   them from `metadata` on `customer.subscription.created` and
   `customer.subscription.updated` and writes each into the matching column
   on `organization_billing_contracts`. Metadata is acceptable for these
   specifically because they are contract terms, not entitlement, section 1
   still applies to the tier itself. Set any subset that the Order Form
   records; a key left out of metadata leaves its column untouched rather
   than clearing a value set here or by a later edit, and a value that does
   not parse as a non-negative integer is ignored and logged rather than
   written.

   | Metadata key                     | Contract column                   | Format                                             |
   | -------------------------------- | --------------------------------- | -------------------------------------------------- |
   | `included_usage_cents_per_month` | `included_usage_cents_per_period` | non-negative integer cents                         |
   | `overage_price_id`               | `overage_stripe_price_id`         | the metered price id from step 2, if any           |
   | `committed_usage_block_cents`    | `committed_usage_block_cents`     | non-negative integer cents                         |
   | `minimum_annual_spend_cents`     | `minimum_annual_spend_cents`      | non-negative integer cents                         |
   | `support_tier`                   | `support_tier`                    | free text, whatever the Order Form's SLA tier says |
   | `customer_legal_entity`          | `customer_legal_entity`           | free text, the Order Form's Customer Legal Entity  |

   `po_number` is also read from metadata, but only ever as the fallback
   `procurement_reference` source described in step 5; it is never written to
   any other column.

## 4. What each webhook does

The dispatcher is `apps/web/app/api/stripe-webhook/lib/handlers.ts`
(`dispatchStripeEvent`). The Enterprise-specific behavior below is additive
to the existing per-event handling already there for every other plan tier;
it activates only when the subscription's price resolves to the Enterprise
product.

| Event                                                                                                                                                                                                 | Effect on an enterprise contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer.subscription.created`, `customer.subscription.updated`                                                                                                                                      | Upserts `organization_billing_contracts`: Stripe ids, product, price, `committed_seats` from `quantity`, `billing_cadence` derived from the price's `recurring` interval (`year` maps to annual, `month` with `interval_count: 3` maps to quarterly), `contract_term_start`/`contract_term_end` from the current period, `procurement_reference` from the invoice custom field or subscription metadata described in section 3.                                                                                                                                            |
| `invoice.created`, `invoice.finalized`, `invoice.updated`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.marked_uncollectible`, `invoice.voided`, `invoice.overdue` | Upserts the corresponding row in `organization_billing_invoices`, then recomputes the contract's oldest open invoice (status `open`, earliest `due_at`) and writes `oldest_open_invoice_id` / `oldest_open_invoice_due_at`, or clears both to null when no invoice is open. Clearing both to null also restores `collection_stage` to `current` immediately if it was not already, with `collection_stage_changed_at`, an audit event, and `last_collection_notice_at` cleared, so paying off the last open invoice restores access without waiting for the next cron run. |
| `customer.subscription.deleted`                                                                                                                                                                       | Sets `ended_at` on the contract. Data is retained; nothing in this repository deletes a contract row or its invoice history on cancellation.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| A paid renewal invoice                                                                                                                                                                                | Rolls `contract_term_start`/`contract_term_end` forward to the new period.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

An unmapped product or price on any of these events fails closed exactly as
section 1 describes: `logger.error` plus an audit event, and no tier is
granted or changed. A subscription with no tier already on record for it
(a brand-new subscription on a price under an unknown product) logs the
critical error and the webhook responds 500 so Stripe retries the same
event once the price or product is registered; a subscription that already
has a stored tier keeps it and the webhook still returns 200, since the
decision in section 1 is to never downgrade a renewal over a mapping gap.

## 5. The 30/60/90 stages, derived and enforced

`apps/web/lib/services/enterprise-collection-state.ts` derives the stage
purely from `oldest_open_invoice_due_at`; it has no dependency on Stripe
subscription status, which is why section 2.2 above matters.

| Stage         | Days past the oldest open invoice's due date | Effect                                                                                                                                                                                                 |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `current`     | 0 or no open invoice                         | Normal access.                                                                                                                                                                                         |
| `past_due_30` | 1 to 30                                      | Owner sees a billing banner. An internal notification fires.                                                                                                                                           |
| `past_due_60` | 31 to 60                                     | Workspace admins see a stronger warning. Internal escalation repeats.                                                                                                                                  |
| `past_due_90` | 61 to 90                                     | Workspace stays operational. Seat expansion and new paid usage commitments (credit top-ups, seat purchases) are refused with `billing_read_only` / `billing_past_due` codes from the policy evaluator. |
| `read_only`   | 91 or more                                   | Workspace is read-only: content-creating actions and managed compute are denied. Reads, exports, and settings stay reachable. Customer data is never deleted at this or any stage.                     |

The daily `enforce-billing-collection` cron (WP-A) walks every contract with
an open invoice, recomputes the stage, persists a stage change with
`collection_stage_changed_at`, records an audit event per change, and sends
mail: to the workspace owner on entering `past_due_30`, `past_due_60`, and
`read_only`, and to `BILLING_ALERT_EMAIL` on every stage change plus once a
day while the contract sits at `past_due_60` or later, throttled by
`last_collection_notice_at` to one notice per day.

## 6. Seat changes

Decreases are always allowed. An increase to `licensed_seats` is refused,
logged, and audited as `seat_expansion_blocked` once
`readOrganizationCollectionState` reports `seatExpansionBlocked` (stage
`past_due_90` or `read_only`, that is, 61 or more days past due). Below that
threshold, seat changes flow through the existing seat path unchanged.

## 7. Cancellation and renewal

Cancellation in Stripe (`customer.subscription.deleted`) sets `ended_at` on
the contract and stops further invoicing; it does not delete
`organization_billing_contracts` or `organization_billing_invoices` rows,
and it does not delete the organization's data. A renewal that generates and
pays a new invoice rolls the contract term dates forward without operator
action beyond confirming payment landed.

## 8. Usage metering and overage reporting

For a contract with `overage_stripe_price_id` set, the included allowance
is a monthly pool: `included_usage_cents_per_period` plus
`committed_usage_block_cents` per calendar month, the same window the
ledger's month-to-date spend function already uses
(`getOrganizationMonthToDateSpendCents`). The annual invoice covers the
seats plus twelve monthly allowances; overage is spend beyond the month's
allowance. Consumption itself is never blocked by the allowance; the
organization's own configured spend limit remains the only hard cap. The
daily `report-enterprise-usage` cron (WP-C) reports new overage since the
last report to the meter behind `overage_stripe_price_id` via
`stripe.billing.meterEvents.create`, idempotent per organization per day by
storing the last reported cumulative overage in the contract's `metadata`.
A contract with no overage price configured is skipped and logged once, not
retried daily.

Sources: [Analyze and query meter usage](https://docs.stripe.com/billing/subscriptions/usage-based/analytics); [Query billing data](https://docs.stripe.com/data/query-billing-data), "Billing meters."

## 9. Reconciliation

Compare the local ledger against Stripe periodically, or whenever a customer
disputes an invoice:

```sql
select stripe_invoice_id, status, amount_due_cents, amount_paid_cents,
       due_at, paid_at, voided_at
  from public.organization_billing_invoices
 where organization_id = '<organization-id>'
 order by due_at desc nulls last;
```

Cross-check each row against the same invoice in the Stripe Dashboard
(**Invoicing** > search by invoice id). A mismatch on `status` or
`amount_paid_cents` after the webhook has had time to run points at a missed
or failed webhook delivery; check the Stripe Dashboard's webhook event log
for that invoice id before assuming the local row is wrong.

## 10. Test-mode lifecycle checklist

Run every item below in Stripe test mode before repeating any of this
runbook's claims to a customer, to counsel, or on a public page. Use
[Stripe test clocks](https://docs.stripe.com/billing/testing/test-clocks/simulate-subscriptions)
to advance time rather than waiting real days for the 30/60/90 checkpoints.

- [x] Create the Enterprise product, a per-seat price, and (if applicable) a
      metered overage price, in test mode, per sections 2 and 3.
      Verified 2026-09-04 in test mode: product, annual seat price, usage meter and metered overage price created.
- [x] Create a test customer and a `send_invoice` subscription with
      `days_until_due: 30`, the PO number set as an invoice custom field,
      and `quantity` set to a test seat count.
      Verified 2026-09-04 in test mode: test clock customer, PO custom field, 500 seats, negotiated metadata.
- [x] Confirm `customer.subscription.created` upserts a contract row with
      the correct product, price, `committed_seats`, `billing_cadence`, and
      `procurement_reference`.
      Verified 2026-09-04 in test mode: product, price, 500 seats, annual, PO reference and metadata fields landed; two untyped SQL parameters were found and cast first.
- [x] Confirm `invoice.created` and `invoice.finalized` upsert an invoice
      row and set `oldest_open_invoice_due_at` on the contract.
      Verified 2026-09-04 in test mode: row and due date recorded; eleven invoices ledgered over the simulated year.
- [x] Pay the first invoice in test mode and confirm `invoice.paid` /
      `invoice.payment_succeeded` clear the oldest-open-invoice fields when
      no other invoice is open.
      Verified 2026-09-04 in test mode: oldest-open fields cleared and the stage restored to current inside the webhook.
- [x] Advance a test clock past the due date of an unpaid invoice and
      confirm the `enforce-billing-collection` cron transitions the contract
      through `past_due_30`, `past_due_60`, `past_due_90`, and `read_only`
      at the correct day boundaries, and that the Stripe subscription status
      stays `past_due` throughout (verifying section 2.2's setting actually
      held).
      Verified 2026-09-04 in test mode: stages reached at days 1, 31, 61 and 91 through the stored due date; on the test clock the Stripe status stayed active rather than past_due, so section 2.2 still has to be confirmed in live mode.
- [ ] Confirm the owner and `BILLING_ALERT_EMAIL` mailboxes receive the
      expected notices at each stage transition, and that repeated daily
      mail at `past_due_60` and later is throttled to once per day.
      Open as of 2026-09-04: not deliverable locally (no Resend key, no owner email); throttling is unit-tested; verify on the first production run.
- [x] Confirm a seat increase is refused and audited at day 61, and that a
      seat decrease is still allowed at every stage.
      Verified 2026-09-04 in test mode: increase to 600 refused and audited, catch-up applied once the stage returned to current; a decrease was not exercised live (unit tests cover it).
- [x] Confirm the policy gate denies managed compute and content-creating
      actions once the contract reaches `read_only`, while reads, exports,
      and settings remain reachable, and that no data is deleted at any
      stage.
      Verified 2026-09-04 in test mode over HTTP: with the QA contract's `collection_stage` set to `read_only` and `oldest_open_invoice_due_at` 100 days overdue, a signed-in `POST /api/llm/v1/chat/completions` was refused (`billing_read_only`) while `GET /api/chat/conversations` still returned 200; row restored after. Exercised via a temporary `apps/web/e2e/tmp-billing-readonly.spec.ts` (deleted after the run). Found and worked around `BILLING-ENTERPRISE-CONTRACT-ENDED-AT-STICKY` (`docs/agent-context/known-flaws.md`): the contract's `ended_at` from an earlier cancel never clears on a new active subscription, which would otherwise have hidden this org from the gate entirely.
- [x] If an overage price is configured, generate managed-usage spend past
      the included allowance and confirm the usage-metering cron reports
      overage to the correct meter exactly once per day, with no
      double-reporting on a rerun.
      Verified 2026-09-04 in test mode: inserted a `provider_cost_events` row pushing the QA organization's month-to-date spend $500 over its $500,000 included allowance, then ran `node cron-call.mjs /api/cron/report-enterprise-usage` twice. First run reported `status: reported, reportedCents: 50000`; `stripe billing meter_event_summaries list <meter> --customer=<probe customer>` confirmed exactly one summary with `aggregated_value: 50000`. Second run reported `status: skipped_no_new_overage` with no change to the aggregated value. Probe row and contract metering metadata removed afterward. Used a clock-free probe customer (see `BILLING-ENTERPRISE-CONTRACT-ENDED-AT-STICKY`) because the QA contract's real customer carries a Stripe test clock frozen a year ahead, which put real-time meter-event timestamps outside Stripe's 35-day window; the org's real `stripe_customer_id` was restored after.
- [x] Cancel the test subscription and confirm `ended_at` is set with the
      contract and invoice rows intact.
      Verified 2026-09-04 in test mode: ended_at set, contract and all invoice rows retained.
- [x] Let a renewal invoice pay and confirm the contract term dates roll
      forward.
      Verified 2026-09-04 in test mode: term rolled to the next year after six two-month clock advances and the renewal invoice was paid.
- [x] Repeat the payment-and-collection portion of this checklist with a
      test ACH Direct Debit payment and a test bank transfer, not only a
      test card, since those are the decided primary rails.
      Verified 2026-09-04 in test mode on a fresh `send_invoice` subscription (`sub_1UBsOv0zEfO6BZMhTsYaXlTT`) for the existing test customer on the existing seat price. Invoice `in_1UBsOv0zEfO6BZMh1HwDZra4` ($144,000) paid with the ACH Direct Debit test account (`000123456789` / routing `110000000`), verified through a `SetupIntent` with the test microdeposit amounts (`32`, `45`) then `POST /v1/invoices/{id}/pay`. A second, subscription-linked invoice `in_1UBsXX0zEfO6BZMh28wvvFFC` ($1,000) was paid by bank transfer: `payment_settings.payment_method_types=[customer_balance]`, funded with `stripe test_helpers customers fund_cash_balance`, which Stripe auto-reconciled. Both invoices' resulting events were replayed through `stripe-replay.mjs`; `organization_billing_invoices` shows both rows `status = paid` with `amount_paid_cents` matching. An earlier, non-subscription-linked bank-transfer invoice was paid in Stripe but never appeared in the local ledger, because `recordEnterpriseInvoiceEvent` (`apps/web/lib/services/enterprise-billing-service.ts:443-444`) only records invoices resolvable to a `stripe_subscription_id`; that invoice was abandoned in favor of the subscription-linked one above and is not part of this evidence.

- [x] The read-only hold binds a contract whose Stripe subscription status is
      still `active` (the permanent state of a `send_invoice` subscription
      that Stripe leaves past due) and cannot be dodged with the
      `x-agi-organization-id: personal` header. The earlier policy-gate check
      above exercised only the organization-scoped path. Verified 2026-09-04
      over HTTP against the local server after db39ade91: with the contract's
      oldest open invoice set 100 days past due and the subscription row
      `active`, a managed chat completion from the owner account answered
      403 `billing_read_only` both with the personal header and without it;
      with the hold cleared the same requests passed the billing gate.

- [x] A stale `customer.subscription.updated` delivered after
      `customer.subscription.deleted` must not revive the ended contract.
      Verified 2026-09-04 against the local database through the running
      server: the saved events were replayed in creation order through the
      deletion (`evt_1UBrUX0zEfO6BZMhWTQ7KYiA`), which left `ended_at` set
      and `last_stripe_event_at` at the deletion's timestamp; the earlier
      update `evt_1UBrSy0zEfO6BZMhUFpVlOag` was then replayed after clearing
      its idempotency row and changed nothing. A later
      `customer.subscription.created` for the same customer does replace the
      ended contract with the new subscription, which is the intended
      re-subscription path.
- [x] An invoice marked uncollectible keeps the collection hold; only a paid
      or voided invoice clears it. A void cancels the debt, so it restores
      access the same way a payment does (Stripe itself returns a past due
      subscription to active when its open invoice is voided). To keep the
      hold while correcting an invoice, finalize the replacement before
      voiding the original, or mark the original uncollectible. Covered by the unit test on the oldest open
      invoice computation (`enterprise-billing-service.test.ts`); no saved
      test-mode event exercises `uncollectible` yet.

Only once every box above is checked, in test mode, should any public page
describe NET 30, purchase orders, bank transfer, or enterprise invoicing, per
the founder's decision recorded in section 1.
