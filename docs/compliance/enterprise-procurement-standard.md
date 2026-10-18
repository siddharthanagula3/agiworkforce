# Enterprise procurement standard

Status: Current
Owner: Legal/compliance
Last updated: 2026-10-18

The one route an enterprise deal takes, from a quote to a billed subscription,
and the code that enforces each step. The two documents a customer signs are
`enterprise-order-form-template.md` (deal specific) and
`enterprise-msa-draft.md` (the framework it is executed under). This file is
the process around them, so nobody has to reconstruct it from the two drafts.

Nothing here is a commitment to a customer. The MSA is still a draft pending
counsel review, and the Order Form template says so on its first line.

## 1. The route a deal takes

| Step               | What happens                                                                | Where it is enforced                                                                             |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Quote              | Seats, cadence, term, payment terms and tax status are agreed               | Nothing in code yet; the Order Form is filled in by hand                                         |
| Order Form issued  | The template is completed and sent for signature                            | Outside the product; no e-signature provider is integrated                                       |
| Signature          | Both parties execute; the signed order is recorded                          | `recordSignedOrder` writes `organization_commercial_agreements`; no route calls it yet           |
| Agreement authored | The signed terms become version N of a commercial agreement                 | `authorCommercialAgreementVersion`; an amendment supersedes rather than edits                    |
| Activation         | Billing should start only against an executed agreement                     | Not enforced in code; each invoice is checked against the agreement when its webhook arrives     |
| Stripe sync        | Contract fields are generated from the agreement, not read back from Stripe | `enterprise-billing-service.ts` `syncEnterpriseContractFromSubscription`                         |
| Drift detection    | A term retyped in the Stripe dashboard is reported, never adopted           | `compareStripeContractMetadata`                                                                  |
| Invoice routing    | Invoices address the billing contact; procurement gets the PO reference     | `organization_billing_contracts.billing_contact_*`, `procurement_contact_*`                      |
| Issuance           | Each invoice is checked against the agreement after Stripe issues it        | `auditInvoiceAgainstAgreement` re-runs the six refusal checks listed below; a failure is flagged |
| Payment method     | Only the methods the signed policy permits should collect                   | Checked as `payment_method_not_permitted` by the same audit; flagged, not refused                |

## 2. Invoice routing

Every enterprise invoice event carries four routing facts that come from the
signed Order Form and are stored on the contract row:

- `billing_contact_name` / `billing_contact_email`: who receives the invoice.
- `procurement_contact_name` / `procurement_contact_email`: who reconciles it
  against the purchase order.
- `procurement_reference`: the customer's PO number, resolved from the signed
  agreement first and from the Stripe invoice custom field only as a fallback.
- `payment_terms_days`: the net terms the due date is computed from
  (`resolveInvoiceDueAt`), capped at 180 days.

The six reasons `invoiceIssuanceRefusals` returns
(`packages/contracts/types/src/enterprise/invoice-terms.ts`) are the whole
list, and any one of them flags the document:

| Refusal                        | What is missing or wrong                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| `contract_not_in_force`        | No executed agreement covering the date, grace period included   |
| `purchase_order_required`      | The agreement requires a PO and `procurement_reference` is blank |
| `invoice_recipient_missing`    | `invoice_recipient_emails` holds no non-blank address            |
| `negotiated_rate_missing`      | `seat_unit_price_cents` is null or not positive                  |
| `currency_not_contracted`      | The requested currency is not the agreement's `billing_currency` |
| `payment_method_not_permitted` | A collection method or instrument the signed policy excludes     |

Invoices are issued from the Stripe dashboard. Each one is checked against the
agreement when its webhook arrives (section 3), so a document that fails a
check is flagged, not prevented. Fill in section 1 of the Order Form template
and re-author the agreement version before issuing.

## 3. Payment methods

The signed Order Form states which methods may collect. The collection method
and every payment method type are checked as `payment_method_not_permitted`;
card-on-file for an invoiced account is the case this exists to catch.

No check can refuse an invoice. One created in the Stripe dashboard already
exists by the time its webhook arrives, so `recordEnterpriseInvoiceEvent`
writes it to the ledger and then calls `auditInvoiceAgainstAgreement`, which
re-runs the same six checks, logs at error level and records a
`plan_changed` audit event with the refusal reasons. It does not void the
invoice and it does not stop the ledger write. Finance has to void that
document by hand.

## 4. Two decisions this process still needs

Both are recorded here rather than guessed in code, and both are named in the
launch checklist.

**Discount authority.** `CommercialAgreementTerms` now carries
`seatUnitPriceCents`
(`apps/web/lib/services/enterprise-contracts/types.ts`), stored on
`organization_commercial_agreements.seat_unit_price_cents`, and an invoice
against an agreement with no positive rate is flagged
`negotiated_rate_missing`. What is still missing is the authority to set it:

1. A product decision on discount thresholds and who approves each band. The
   Enterprise tier is `contractPriced: true`, so there is no list price in
   `BILLING_PLAN_PRICING` to measure a discount against.
2. A gate in `authorCommercialAgreementVersion`
   (`apps/web/lib/services/enterprise-contracts/agreement-store.ts`) that
   refuses to author a discounted agreement without a recorded approver,
   alongside the existing `authoredBy` and `amendmentReason`. No such gate
   exists today: any seat price an operator types is authored as signed.

**Contract-derived security controls.** Retention, DLP and customer-managed
keys are set by a workspace admin today. A contract that promises a retention
ceiling does not enforce one. Closing this needs those controls to read their
bounds from the executed agreement rather than from admin state, which is
owned by the workspace-policy surfaces, not by billing.

## 5. Sending an Order Form for signature

Order Forms are sent and signed outside the product; no e-signature provider is
integrated. A signed order reaches the system only through `recordSignedOrder`.

## 6. The security pack a reviewer asks for

A procurement security review asks the same five questions every time. Each one
already has an authoritative answer in this repository, and the answer is cited
here rather than restated, because a restated answer drifts from the one the
code enforces.

| Question a reviewer asks  | Where the answer lives                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Security overview         | `docs/security/security.md`, the single security document                                                                             |
| Data flow and boundaries  | `docs/architecture/trust-boundaries.md` for Local, BYOK and Managed Cloud per surface; `docs/architecture/overview.md` for the system |
| Access control            | The enterprise authorization contract in `packages/contracts/types/src/enterprise`, and the permission each admin route resolves      |
| Retention and deletion    | `docs/architecture/RETENTION_MATRIX.md` per store, and `docs/security/security.md` section 5 for the posture                          |
| Legal hold and eDiscovery | `docs/compliance/legal-hold-and-ediscovery.md`, with the operator procedure in `docs/runbooks/legal-hold.md`                          |
| Vulnerability management  | Root `SECURITY.md` for the reporting policy and scope                                                                                 |
| Incident response         | `docs/runbooks/incident-response.md`, with `docs/runbooks/personal-data-breach.md` for a personal-data incident                       |

Three answers a reviewer will ask for and this repository does not have. Say so
rather than deferring:

1. **No SOC 2 report, no ISO 27001 certificate and no HIPAA position.** `/trust`
   carries the dated status. A questionnaire answered as "in progress" where
   nothing is in progress is a misrepresentation, not optimism.
2. **No third-party penetration test report.** The security work in this
   repository is internal review plus the guards in `scripts/`.
3. **Managed Cloud is in public alpha.** Say so wherever an answer bears on an
   availability or durability commitment.

A questionnaire answer that is not one of the cited documents needs the document
written first. Do not answer from memory of what the product used to do.
