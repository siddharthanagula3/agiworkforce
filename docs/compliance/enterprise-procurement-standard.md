# Enterprise procurement standard

Status: Current
Owner: Legal/compliance
Last updated: 2026-09-20

The one route an enterprise deal takes, from a quote to a billed subscription,
and the code that enforces each step. The two documents a customer signs are
`enterprise-order-form-template.md` (deal specific) and
`enterprise-msa-draft.md` (the framework it is executed under). This file is
the process around them, so nobody has to reconstruct it from the two drafts.

Nothing here is a commitment to a customer. The MSA is still a draft pending
counsel review, and the Order Form template says so on its first line.

## 1. The route a deal takes

| Step               | What happens                                                                | Where it is enforced                                                                              |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Quote              | Seats, cadence, term, payment terms and tax status are agreed               | Nothing in code yet; the Order Form is filled in by hand                                          |
| Order Form issued  | The template is completed and sent for signature                            | `enterprise-contracts/e-signature.ts` (`sendOrderForm`), unconfigured without DocuSign env        |
| Signature          | Both parties execute; the envelope is recorded                              | `recordSignedOrderFromEnvelope` writes `organization_commercial_agreements`                       |
| Agreement authored | The signed terms become version N of a commercial agreement                 | `authorCommercialAgreementVersion`; an amendment supersedes rather than edits                     |
| Activation         | Billing may start only against an executed agreement                        | `assertEnterpriseBillingActivated` rejects with 403; the sync records `activation_blocked_reason` |
| Stripe sync        | Contract fields are generated from the agreement, not read back from Stripe | `enterprise-billing-service.ts` `syncEnterpriseContractFromSubscription`                          |
| Drift detection    | A term retyped in the Stripe dashboard is reported, never adopted           | `compareStripeContractMetadata`                                                                   |
| Invoice routing    | Invoices address the billing contact; procurement gets the PO reference     | `organization_billing_contracts.billing_contact_*`, `procurement_contact_*`                       |
| Payment method     | Only the methods the signed policy permits may collect                      | `auditPaymentMethodPolicy` audits a violation on every enterprise invoice event                   |

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

An invoice with no billing contact on the contract is a gap in the signed
Order Form, not a defect in the code. Fill in section 1 of the template.

## 3. Payment methods

The signed Order Form states which methods may collect. The code checks each
enterprise invoice's collection method and payment method types against that
policy and audits a violation; it does not silently accept a method the
agreement excludes. Card-on-file for an invoiced account is the case this
exists to catch.

## 4. Two decisions this process still needs

Both are recorded here rather than guessed in code, and both are named in the
launch checklist.

**Discount authority.** The repository models a list price for every
self-serve plan (`BILLING_PLAN_PRICING`), but the Enterprise tier is
`contractPriced: true` and `CommercialAgreementTerms` carries no negotiated
per-seat amount. There is therefore nothing to compute a discount against and
no ladder to approve it with. Closing this needs, in order:

1. A product decision on discount thresholds and who approves each band.
2. A negotiated seat price on `CommercialAgreementTerms`
   (`apps/web/lib/services/enterprise-contracts/types.ts`) and its store, with
   a migration adding the column.
3. A gate in `authorCommercialAgreementVersion` that refuses to author a
   discounted agreement without a recorded approver, alongside the existing
   `authoredBy` and `amendmentReason`.

**Contract-derived security controls.** Retention, DLP and customer-managed
keys are set by a workspace admin today. A contract that promises a retention
ceiling does not enforce one. Closing this needs those controls to read their
bounds from the executed agreement rather than from admin state, which is
owned by the workspace-policy surfaces, not by billing.

## 5. Sending an Order Form for signature

The e-signature provider reports itself unconfigured rather than throwing when
its environment is unset, so a deployment without these variables degrades to
manual signature rather than failing at import:

`DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`,
`DOCUSIGN_PRIVATE_KEY`, `DOCUSIGN_OAUTH_BASE_URL`, `DOCUSIGN_API_BASE_URL`.

No route calls `sendOrderForm` or `readEnvelope` yet. Until one exists, a
signed Order Form reaches the system through
`recordSignedOrderFromEnvelope` only.

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
