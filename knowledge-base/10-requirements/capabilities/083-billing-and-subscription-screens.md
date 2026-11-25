---
id: "REQ-AREA-083"
type: "requirements"
title: "Requirement items: Billing and subscription screens"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 83. Billing and subscription screens

33 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S83.01

**Plan-comparison dialog.** A plan-comparison view/dialog lets the user compare plans (price, usage, features) before choosing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F083-01 Compare plans and pick monthly or yearly](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Competitor trace: CAP-subscriptions-and-plans-04

## S83.02

**Monthly/annual toggle.** A monthly/annual toggle changes displayed prices and the cadence charged.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-01 Compare plans and pick monthly or yearly](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Competitor trace: CAP-subscriptions-and-plans-03

## S83.03

**Upgrade checkout.** A signed-in user can start and complete a paid upgrade checkout.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Feature: [F083-02 Start a paid plan (checkout, access gate, confirmation)](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)
- Competitor trace: CAP-subscriptions-and-plans-05, CAP-subscriptions-and-plans-10
- An owner decision is open on this item.

## S83.04

**Downgrade review.** Before a downgrade the user reviews what changes (price, features, limits, when it applies) and confirms.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-09 Cancel, resume, downgrade and end-of-term](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Competitor trace: CAP-subscriptions-and-plans-07

## S83.05

**Proration explanation.** Upgrades explain proration: credit for unused time, the charge today and when the next renewal happens.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F083-03 Upgrade a live plan with proration and promotion code](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Competitor trace: CAP-subscriptions-and-plans-06

## S83.06

**Tax and total-price display.** Before paying, the user sees tax and the total price.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Feature: [F083-04 Tax, billing address and tax ID](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md)
- Competitor trace: CAP-subscriptions-and-plans-11

## S83.07

**Coupon entry.** Users can enter a coupon/promotion code when buying.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-03 Upgrade a live plan with proration and promotion code](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Competitor trace: CAP-subscriptions-and-plans-18

## S83.08

**Trial terms.** When a plan starts as a trial, the user sees the trial terms: length, end date, what is charged after and how to cancel.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F083-05 Trial terms](../../20-features/083-billing-and-subscription-screens/F083-05-trial-terms.md)
- Competitor trace: CAP-subscriptions-and-plans-18

## S83.09

**Payment-method entry.** Users can add a payment method.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-06 Payment methods](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Competitor trace: CAP-subscriptions-and-plans-11

## S83.10

**Payment-method management.** Users can see and manage saved payment methods (default card, update, remove).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-06 Payment methods](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Competitor trace: CAP-subscriptions-and-plans-11

## S83.11

**Billing address.** Users can enter and update a billing address.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-04 Tax, billing address and tax ID](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md)
- Competitor trace: CAP-subscriptions-and-plans-11

## S83.12

**Tax identifier.** Business buyers can enter a tax identifier (VAT/GST) that is applied to their invoices.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-04 Tax, billing address and tax ID](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md)
- Competitor trace: CAP-subscriptions-and-plans-11

## S83.13

**Purchase confirmation.** After paying, the user sees a confirmation of what was bought and that it is active.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Feature: [F083-02 Start a paid plan (checkout, access gate, confirmation)](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)

## S83.14

**Payment failure.** When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F083-07 Payment failure and retry](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Competitor trace: CAP-subscriptions-and-plans-14

## S83.15

**Retry payment.** After a failed payment the user can retry it (pay the open invoice or update the card) from the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-07 Payment failure and retry](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Competitor trace: CAP-subscriptions-and-plans-14

## S83.16

**Billing-history list.** Users can see a list of past bills (invoices and credit purchases).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Seen in a real run: Web UI_ONLY
- Feature: [F083-08 Billing history, invoices, receipts, refunds and credit purchases](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Competitor trace: CAP-subscriptions-and-plans-12

## S83.17

**Invoice download.** Users can download an invoice (PDF).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-08 Billing history, invoices, receipts, refunds and credit purchases](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Competitor trace: CAP-subscriptions-and-plans-12

## S83.18

**Receipt download.** Users can download a receipt for every payment, including one-off credit purchases.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-08 Billing history, invoices, receipts, refunds and credit purchases](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Competitor trace: CAP-subscriptions-and-plans-12

## S83.19

**Credit-note display.** Users can see credit notes issued against their invoices.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F083-08 Billing history, invoices, receipts, refunds and credit purchases](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Competitor trace: CAP-subscriptions-and-plans-12

## S83.20

**Refund status.** Users can see the status of a refund (requested, processing, refunded).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-08 Billing history, invoices, receipts, refunds and credit purchases](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Competitor trace: CAP-subscriptions-and-plans-12, CAP-subscriptions-and-plans-13

## S83.21

**Cancel subscription.** Users can cancel their subscription themselves.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-09 Cancel, resume, downgrade and end-of-term](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Competitor trace: CAP-subscriptions-and-plans-08

## S83.22

**Resume subscription.** A user who scheduled a cancellation can resume the subscription before it ends.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-09 Cancel, resume, downgrade and end-of-term](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Competitor trace: CAP-subscriptions-and-plans-08

## S83.23

**Scheduled cancellation.** A scheduled (end-of-period) cancellation is shown with its date.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done
- Feature: [F083-09 Cancel, resume, downgrade and end-of-term](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Competitor trace: CAP-subscriptions-and-plans-08

## S83.24

**End-of-term access explanation.** After cancelling, the user is told what they keep until the end of the term and what happens after.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F083-09 Cancel, resume, downgrade and end-of-term](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Competitor trace: CAP-subscriptions-and-plans-08

## S83.25

**Mobile purchase restoration.** On mobile, users can restore store purchases (re-send receipts) without being charged again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile partial
- Feature: [F083-10 Store-billed plans, duplicate-subscription warning and purchase restore](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Competitor trace: CAP-subscriptions-and-plans-10

## S83.26

**Store-managed subscription instructions.** Users whose subscription is billed by Apple or Google are told to manage it in that store, with a link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F083-10 Store-billed plans, duplicate-subscription warning and purchase restore](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Competitor trace: CAP-subscriptions-and-plans-09

## S83.27

**Duplicate-subscription warning.** Before a purchase that would double-bill, the user is warned (existing subscription elsewhere).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F083-10 Store-billed plans, duplicate-subscription warning and purchase restore](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Competitor trace: CAP-subscriptions-and-plans-09

## S83.28

**Team seat purchase.** A team owner can buy seats (choose a seat count at purchase and add seats later).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop partial
- Feature: [F083-11 Team seats and enterprise billing](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Competitor trace: CAP-subscriptions-and-plans-05, CAP-subscriptions-and-plans-20

## S83.29

**Seat assignment.** Admins can assign seats to members and see seats used vs licensed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F083-11 Team seats and enterprise billing](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Competitor trace: CAP-subscriptions-and-plans-21

## S83.30

**Enterprise billing contacts.** Enterprise admins can see (and have on record) billing and procurement contacts for their contract.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-11 Team seats and enterprise billing](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Competitor trace: CAP-subscriptions-and-plans-21, CAP-subscriptions-and-plans-23

## S83.31

**Purchase-order and invoicing workflows.** Enterprise customers can buy through purchase orders and invoices (PO numbers on invoices, invoice terms, offline payment reporting).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F083-11 Team seats and enterprise billing](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Competitor trace: CAP-subscriptions-and-plans-23

## S83.32

**Credit-purchase history.** Users can see a history of their credit purchases.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Seen in a real run: Web UI_ONLY
- Feature: [F083-08 Billing history, invoices, receipts, refunds and credit purchases](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Competitor trace: CAP-subscriptions-and-plans-12

## S83.33

**Auto-reload history.** Users can see a history of automatic credit reloads.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F083-08 Billing history, invoices, receipts, refunds and credit purchases](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Competitor trace: CAP-subscriptions-and-plans-12
