# Enterprise Order Form template, draft for counsel

Status: Draft. Not reviewed by counsel. Do not send to a customer.
Owner: Founder, pending counsel review
Last updated: 2026-09-17

An Order Form is the deal-specific document a Customer signs alongside the
Master Services Agreement draft at `docs/compliance/enterprise-msa-draft.md`.
This template exists so every field an Order Form needs maps onto an actual
column this repository persists, in
`apps/web/db/neon/0163_enterprise_billing_contracts.sql`
(`public.organization_billing_contracts`), rather than drifting from what the
product can record. The mapping table in section 2 exists for that reason:
whoever fills out a signed Order Form should be able to hand it to
engineering and have every field land somewhere real.

This template creates no obligation on its own. It is a form to be filled in,
signed by both Parties, and executed under the MSA once that MSA has cleared
counsel review.

---

## Order Form No. [____]

This Order Form is entered into under, and incorporates by reference, the
Master Services Agreement between AGI Automation LLC ("AGI") and the
Customer named below, dated [____] ("MSA"). Capitalized terms not defined
here have the meaning given in the MSA.

## 1. Fields to complete

| Field                     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Customer legal entity     | [Full legal name of the contracting entity]                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Customer billing address  | [Street, city, state/province, postal code, country]                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Customer tax id           | [VAT / GST / EIN / other, as applicable]                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AGI workspace             | [The AGI organization id or workspace name this Order Form provisions]                                                                                                                                                                                                                                                                                                                                                                                                         |
| Product                   | AGI Enterprise                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Committed seats           | [Number]                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Contract term             | Start: [date] End: [date]                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Billing cadence           | ☐ Annual, in advance (default) ☐ Quarterly (negotiated exception, state reason: [____])                                                                                                                                                                                                                                                                                                                                                                                        |
| Per-seat price            | [Amount] USD per seat per [year / quarter]                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Included usage per month  | [Amount] USD-equivalent of managed usage per calendar month                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Committed usage block     | [Amount] USD, or "none"                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Minimum annual spend      | [Amount] USD, or "none"                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Overage pricing           | [Rate] per [unit], billed monthly in arrears against Stripe Billing Meter [meter id, filled in at provisioning], or "not applicable, no overage pricing negotiated"                                                                                                                                                                                                                                                                                                            |
| Payment terms             | Net [30] from invoice date. Currency: USD only.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Permitted payment methods | `invoice_ach_wire` (default): invoice on net terms, settled by ACH debit, ACH credit transfer or bank transfer. `invoice_ach_wire_card`: the same, plus card. `card_only`: automatic card charge, no net terms. Choose one. It is stored on the agreement and every enterprise invoice is checked against it; an invoice offering a rail this Order Form did not permit raises an audit event rather than settling quietly.                                                    |
| Invoice routing           | Invoices are issued to the billing contact named below and copied to the procurement contact. Both are stored on the agreement, there is no other routing path, and changing either requires a new agreement version.                                                                                                                                                                                                                                                          |
| Order Form reference      | [The reference this document is filed and billed under, e.g. OF-2026-001. Required: enterprise billing does not activate without it.]                                                                                                                                                                                                                                                                                                                                          |
| Signature method          | `docusign` (e-signature) or `manual_countersigned` (a countersigned PDF recorded by hand). Choose one.                                                                                                                                                                                                                                                                                                                                                                         |
| Purchase order number     | [PO number, or "not applicable"]                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Renewal terms             | ☐ Auto-renews for successive [term length] periods unless either Party gives [__] days' written notice of non-renewal ☐ Requires a new signed Order Form (choose one; see MSA §6.2, flagged for counsel)                                                                                                                                                                                                                                                                       |
| Effective date            | [Date this Order Form takes effect]                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| MSA reference             | Master Services Agreement dated [date]                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| DPA reference             | Data Processing Addendum at `/dpa`, incorporated per MSA §7                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Support tier              | Enterprise: a named contact; first response within four business hours (Central Time) for a service-down report, and within one business day otherwise; an escalation path; and the status page, per `/support` and `/sla` as of [date]. Not a credit-bearing SLA unless a separate SLA Exhibit is attached; see MSA §8.2. Premium support (faster response, on-call) is available only as a separately negotiated line on this Order Form, stated below if purchased: [____]. |
| SLA exhibit attached      | ☐ Yes, attached as Exhibit A ☐ No                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Authorized signatories    | Named in the signature block below                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 2. Field-to-schema mapping

For engineering and billing operations reference. Fill this in when the
Order Form is provisioned, not when it is signed; it is not part of the
document sent to the Customer.

The signed values live in `public.organization_commercial_agreements`
(`apps/web/db/neon/0228_enterprise_commercial_agreements.sql`), one row per
version. `public.organization_billing_contracts` carries the same fields as the
operational copy the webhook keeps in step, and Stripe subscription metadata is
generated from the signed row by
`apps/web/lib/services/enterprise-contracts/stripe-metadata.ts`. The direction
matters: a term typed into the Stripe dashboard that disagrees with the signed
agreement is reported as a mismatch and the agreement is kept. Nothing reads a
negotiated term out of Stripe once an agreement exists.

| Order Form field          | `organization_billing_contracts` column                                                                                                | Notes                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Customer legal entity     | `customer_legal_entity`                                                                                                                |                                                                                                             |
| AGI workspace             | `organization_id` (primary key)                                                                                                        | Resolved to an existing organization before provisioning.                                                   |
| Product                   | `stripe_product_id`                                                                                                                    | Must equal the configured `STRIPE_PRODUCT_ENTERPRISE`.                                                      |
| Committed seats           | `committed_seats`                                                                                                                      | Also sets the Stripe subscription item `quantity`.                                                          |
| Contract term             | `contract_term_start`, `contract_term_end`                                                                                             | Sourced from the Stripe subscription's current period at creation; rolls forward on a paid renewal invoice. |
| Billing cadence           | `billing_cadence`                                                                                                                      | `annual` or `quarterly`, derived from the Stripe price's recurring interval.                                |
| Per-seat price            | `stripe_price_id`                                                                                                                      | The contract-specific price created per `docs/runbooks/enterprise-billing.md` §3.                           |
| Included usage per month  | `included_usage_cents_per_period`                                                                                                      | Stored in cents.                                                                                            |
| Committed usage block     | `committed_usage_block_cents`                                                                                                          | Stored in cents.                                                                                            |
| Minimum annual spend      | `minimum_annual_spend_cents`                                                                                                           | Stored in cents.                                                                                            |
| Overage pricing           | `overage_stripe_price_id`                                                                                                              | Null when no overage pricing is negotiated; the usage-metering cron skips a contract with this unset.       |
| Purchase order number     | `procurement_reference`                                                                                                                | Also set as the Stripe invoice custom field, per the runbook.                                               |
| Support tier              | `support_tier`                                                                                                                         | Free text, e.g. `"enterprise"`.                                                                             |
| Collection state          | `oldest_open_invoice_id`, `oldest_open_invoice_due_at`, `collection_stage`, `collection_stage_changed_at`, `last_collection_notice_at` | Written by the webhook and cron handlers, never by hand.                                                    |
| Termination               | `ended_at`                                                                                                                             | Set on `customer.subscription.deleted`; the row and its invoice history are retained.                       |
| Permitted payment methods | `payment_method_policy` on the agreement                                                                                               | Checked against every enterprise invoice's collection method and payment method types.                      |
| Invoice routing           | `billing_contact_name`, `billing_contact_email`, `procurement_contact_name`, `procurement_contact_email`                               | Invoices go to the billing contact, copied to the procurement contact.                                      |
| Order Form reference      | `order_form_reference` on the agreement, mirrored to `signed_order_reference`                                                          | Absent, `activation_blocked_reason` is set to `missing_signed_order` and the gap is audited.                |
| Signature method          | `signature_provider`, `signature_envelope_id`, `signed_at`, `signed_by_name`, `signed_by_email`                                        | Written when the envelope completes, or by hand for a countersigned PDF.                                    |
| Amendment                 | a new `version` row; the prior row keeps its values and gains `superseded_at`                                                          | An amendment never edits the terms it replaces.                                                             |

## 3. Execution, amendment and the billing gate

1. The Order Form is authored as a draft agreement version for the workspace.
2. It is sent for signature through the configured e-signature provider, or
   countersigned as a PDF and recorded by hand. Both paths end the same way: an
   executed agreement version carrying the Order Form reference, the signature
   provider, the envelope id where there is one, and the signing time.
3. Enterprise billing activates only once that executed version exists. Until
   then the billing contract records `activation_blocked_reason` as
   `missing_signed_order`, and every contract sync audits the gap, so a
   workspace being invoiced with no signed commercial basis is visible rather
   than inferred.
4. An amendment is a new version. The superseded version keeps every value it
   held, which is what lets AGI answer what a Customer had agreed to on any
   past date.

## 4. What this Order Form does not create

Signing this Order Form does not, on its own:

- Create a credit-bearing service level commitment. See MSA §8.2; that
  requires a separately signed SLA Exhibit.
- Claim SOC 2, ISO 27001, or HIPAA compliance. See MSA §9.1; `/trust` is the
  current source of truth on AGI's compliance posture.
- Commit to data residency outside the United States. See MSA §9.2.
- Authorize any deletion of Customer data for non-payment. See MSA §5.7 and
  §6.4; deletion requires a separate, explicit request regardless of payment
  status.

## Signature

| AGI Automation LLC | Customer |
| ------------------ | -------- |
| Name:              | Name:    |
| Title:             | Title:   |
| Date:              | Date:    |

---

This draft has not been sent to any customer and creates no obligation until
signed alongside the Master Services Agreement.
