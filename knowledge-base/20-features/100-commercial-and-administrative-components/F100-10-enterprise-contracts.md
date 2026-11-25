---
id: "F100-10"
type: "feature"
title: "Enterprise contracts"
aliases: ["Enterprise contracts", "Commercial agreements", "Enterprise billing integration", "Billing contract", "Order form", "Offline payment", "S100.25 Enterprise billing integration"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.25"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "SYS-security-and-privacy", "surface:web", "mode:cloud", "plan:enterprise", "table:organization_commercial_agreements", "F100-08", "F100-11", "F100-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-10 Enterprise contracts

Stores a signed enterprise agreement per workspace: committed seats, term, payment terms, purchase order, payment method policy and support tier. Stripe subscription and invoice events keep a billing-contract record in sync, and admins can record bank payments or end a contract. Creating agreements has no screen or caller in the code read.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.25](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10025).

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

**What it does.** A versioned agreement store keeps each commercial agreement as a new row that supersedes the last (apps/web/lib/services/enterprise-contracts/agreement-store.ts:193-358). Stripe webhooks sync a billing-contract summary and invoice records from subscriptions and invoices (apps/web/app/api/stripe-webhook/lib/handlers.ts:127-160; apps/web/lib/services/enterprise-billing-service.ts:359-556, 707-810). Invoicing code computes invoice positions, checks them against the agreement and records offline payments idempotently (apps/web/lib/services/enterprise-contracts/invoicing.ts:144-330). The workspace console shows contract terms and invoices (apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx).

**Why it exists.** Enterprise customers buy by contract, pay by invoice or transfer and need purchase order numbers. The brief says enterprise contracts (committed seats, invoicing terms, PO, offline payment) are stored and drive billing (doc: knowledge-base/data/area-briefs/100-commercial-and-administrative-components.md S100.25).

**Who uses it.** Sales and staff who author agreements, workspace admins with billing.read who read them, and operators with billing.contracts.manage who report offline payments or end a contract.

**Problems it solves**

- Keeps the signed terms as the record, with history of amendments.
- Stops payment methods the contract does not allow.
- Lets a bank payment be recorded once, even if the form is submitted twice.
- Lets support priority follow the contracted support tier.

**Use cases**

- An admin opens the workspace billing page and reads term, committed seats, payment terms and purchase order.
- An operator reports a wire payment against an invoice with a bank reference.
- Sales records an amendment that raises committed seats.
- A contract ends and the workspace is returned to the self-serve state.

## 2. User experience

**Where to find it**

- Web workspace console: /workspace/billing, label 'Billing', with the 'Enterprise contract' card and invoices (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:137-138; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx; apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:252-302).
- Web Team settings: 'Seats & billing' shows a 'Review contract' button when the workspace is contract priced (apps/web/features/settings/sections/TeamSection.tsx:925).
- No desktop, mobile, CLI, VS Code or Chrome screen found.

**Before you start**

- Enterprise workspace with an executed agreement.
- billing.read to view; billing.contracts.manage to report payments or terminate (apps/web/app/api/settings/organization/billing-contract/route.ts:95-110).
- Team admin plan access (apps/web/app/api/settings/organization/billing-contract/route.ts:93).

**Screens and controls**

- Rows: Legal entity, Term, Billing cadence, Committed seats, Payment terms, Tax status, Purchase order, Support tier, Usage written off at contract end, Billing contact, Procurement contact (apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:274-302).
- Invoices list with 'View' and 'Download as PDF' links (apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:180-192).
- Card title 'Enterprise contract' or 'Enterprise contract (ended)'.
- API actions report_offline_payment and terminate (apps/web/app/api/settings/organization/billing-contract/route.ts:75-100).

**Journey**

1. Sales or staff record a signed order as an executed agreement version (function recordSignedOrder; no caller found).
2. Stripe creates the subscription and invoices; webhooks sync the contract and invoice records.
3. Admin opens Billing and reads the terms and invoices.
4. When a wire arrives, an operator posts report_offline_payment with invoice id, method, amount, remittance reference and date.
5. At the end, terminate with a reason ends the contract.

**What the person sees and gets**

- Contract card values or 'Not on record' (apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:30).
- Payment terms shown as 'Due on receipt', 'Net <days>' or 'As stated on each invoice' (apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:64-65).
- Offline payment response: recorded flag, payment record and invoice position (apps/web/app/api/settings/organization/billing-contract/route.ts:63-67).
- Not-found message 'That invoice does not belong to this workspace.' (apps/web/lib/services/enterprise-contracts/invoicing.ts:285-290).

**Settings**

- Payment method policy: invoice_ach_wire, invoice_ach_wire_card or card_only (apps/web/lib/services/enterprise-contracts/payment-methods.ts:3-9).
- Stripe metadata keys that carry negotiated terms (apps/web/lib/services/enterprise-contracts/stripe-metadata.ts:5-21).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Agreement authoring and termination functions with versioning, supersede and lifecycle rules (apps/web/lib/services/enterprise-contracts/agreement-store.ts:193-424).
- Billing-contract GET and POST route (apps/web/app/api/settings/organization/billing-contract/route.ts).
- Webhook sync of contract and invoices on subscription and invoice events (apps/web/app/api/stripe-webhook/lib/handlers.ts:127-160).
- Offline payment recording with a unique key on invoice and remittance reference (apps/web/lib/services/enterprise-contracts/invoicing.ts:269-330; apps/web/db/neon/0288_enterprise_offline_payment_records.sql).
- Contract and invoice UI in the workspace console.

**Incomplete**

- Correction to the draft: the invoicing module does not build invoices. Invoices come from Stripe events; the module computes positions, due dates and offline payments (apps/web/lib/services/enterprise-contracts/invoicing.ts:101-198; apps/web/app/api/stripe-webhook/lib/handlers.ts:152-170).

**Present but disconnected or switched off**

- authorCommercialAgreementVersion and recordSignedOrder have no caller in apps, packages or scripts; only tests and documents mention them (searched the repository; docs/compliance/enterprise-operations.md:105-109). The 'internal tools' in the draft were not found.

**Not available**

- Any self-serve screen for authoring a contract.
- Enterprise contract on desktop, mobile, CLI, VS Code, Chrome.
- Self-serve seat purchase for Enterprise: stated as not offered (doc: docs/compliance/enterprise-operations.md:109).

## 4. Required behaviour

**Established requirements**

- Enterprise contracts (committed seats, invoicing terms, PO, offline payment) are stored and drive billing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.25)
- An expansion is a new agreement version, an amendment or renewal; an existing agreement is superseded, never edited; no self-serve seat purchase for Enterprise. (source: docs/compliance/enterprise-operations.md:105-109)
- Usage and money actions that cannot be undone ask first and name the consequence. (source: AGENTS.md section 9)
- Contract data belongs to the commercial terms documents. (source: docs/compliance/enterprise-commercial-terms.md, docs/compliance/enterprise-order-form-template.md (existence found by search; contents not read))

**Acceptance criteria**

1. A second agreement for the same workspace without an amend or renew event is refused.
2. An amendment marks the previous version superseded and writes version n+1 with its change kind.
3. An executed agreement without a signature is refused.
4. Reporting the same remittance reference twice for one invoice writes one payment record.
5. A card-only agreement allows no offline payment method.
6. terminate requires a reason and ends the agreement.
7. A member without billing.read cannot read the contract; one without billing.contracts.manage cannot post actions.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Contract support tier feeds support ticket priority, because resolveSupportPriority reads support_tier (apps/web/lib/support/handoff/priority.ts:65).
- [inferred] Stripe stays the invoice source of truth and the contract tables mirror it, because invoice events are recorded from webhooks (apps/web/app/api/stripe-webhook/lib/handlers.ts:152-170).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Provide a staff tool or command that calls the authoring function, with audit and confirmation.
- [proposed] Show contract terms on a read-only page in the other apps or link to the web.
- [proposed] Add a test that proves the webhook and the agreement store agree on committed seats.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | agreement-store | `apps/web/lib/services/enterprise-contracts/agreement-store.ts` | Read, author, terminate versioned agreements; audit writes. |
| service | invoicing | `apps/web/lib/services/enterprise-contracts/invoicing.ts` | Invoice positions, permitted payment methods, offline payments. |
| service | activation | `apps/web/lib/services/enterprise-contracts/activation.ts` | Activation state and recordSignedOrder. |
| config | payment-methods | `apps/web/lib/services/enterprise-contracts/payment-methods.ts` | Payment method policies. |
| config | stripe-metadata | `apps/web/lib/services/enterprise-contracts/stripe-metadata.ts` | Metadata keys and comparison with the agreement. |
| schema | contract types | `apps/web/lib/services/enterprise-contracts/types.ts` | Agreement, terms and status types. |
| service | enterprise-billing-service | `apps/web/lib/services/enterprise-billing-service.ts` | Syncs the billing contract and invoice events from Stripe. |
| event | stripe webhook handlers | `apps/web/app/api/stripe-webhook/lib/handlers.ts` | Calls syncEnterpriseContractFromSubscription and recordEnterpriseInvoiceEvent. |
| endpoint | /api/settings/organization/billing-contract | `apps/web/app/api/settings/organization/billing-contract/route.ts` | Read contract; report offline payment; terminate. |
| component | WorkspaceEnterpriseContract | `apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx` | Contract and invoices UI. |
| component | WorkspaceBillingSummary | `apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx` | Hosts the contract card. |
| hook | use-enterprise-contract | `apps/web/features/workspace-console/hooks/use-enterprise-contract.ts` | Loads the contract response. |
| table | organization_commercial_agreements | `apps/web/db/neon/0228_enterprise_commercial_agreements.sql` | Agreement versions. |
| schema | agreement lifecycle and procurement terms | `apps/web/db/neon/0287_commercial_agreement_procurement_terms.sql` | Procurement terms columns. |
| table | organization_billing_contracts, organization_billing_invoices | `apps/web/db/neon/0163_enterprise_billing_contracts.sql` | Synced contract and invoice mirror. |
| table | enterprise_offline_payment_records | `apps/web/db/neon/0288_enterprise_offline_payment_records.sql` | Offline payments with idempotency key. |
| schema | overage closeout | `apps/web/db/neon/0402_overage_contract_closeout.sql` | Usage written off at contract end. |
| service | priority (support tier) | `apps/web/lib/support/handoff/priority.ts` | Maps contracted support tier to ticket priority. |
| service | team-admin-access | `apps/web/app/api/settings/team/team-admin-access.ts` | Plan gate for the route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Agreement version is written inside a transaction; prior version marked superseded; audit event written. | our servers | apps/web/lib/services/enterprise-contracts/agreement-store.ts:214-358 |
| Stripe sends subscription and invoice events; the webhook syncs the contract summary and records invoices. | outside service | apps/web/app/api/stripe-webhook/lib/handlers.ts:127-170 |
| Admin opens Billing; the page calls GET billing-contract which returns contract, invoices, agreement view, available lifecycle events, history and invoice positions. | our servers | apps/web/app/api/settings/organization/billing-contract/route.ts:57-70 |
| Operator posts report_offline_payment; server finds the invoice position, checks permitted methods and amount, inserts a payment record once, and audits. | our servers | apps/web/lib/services/enterprise-contracts/invoicing.ts:269-330 |
| Terminate ends the agreement with a reason and audits. | our servers | apps/web/lib/services/enterprise-contracts/agreement-store.ts:359-424 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agreement versions with terms, contacts, signature reference | table organization_commercial_agreements | Server only | Superseded, never edited; financial record retention policy lives in apps/web/lib/billing/financial-record-retention.ts (content not read) |
| Contract and invoice mirror from Stripe | tables organization_billing_contracts and organization_billing_invoices | Updated by webhooks | Unknown |
| Offline payment records | table enterprise_offline_payment_records | Server only | Unknown |
| Audit events for authoring, termination and offline payment | audit tables with surface enterprise_contracts | Server only | See F100-12 |

**Models and providers.** No model or inference provider takes part. Stripe is the outside service for subscriptions, invoices and payment collection; DocuSign is a named signature provider value (apps/web/lib/services/enterprise-contracts/types.ts:25).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace member with the permission below (apps/web/app/api/settings/organization/billing-contract/route.ts:88-110). |
| Permissions | billing.read to read; billing.contracts.manage to act (apps/web/app/api/settings/organization/billing-contract/route.ts:95-105). |
| Subscription | Team admin plan access is required; the contract is meaningful for Enterprise (apps/web/app/api/settings/organization/billing-contract/route.ts:93). |
| Limits and metering | Contract fields include included usage cents per period, committed usage block and minimum annual spend (apps/web/lib/services/enterprise-contracts/agreement-store.ts:34-36). Rate limits for the route not read. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | Stripe required; payment method policy restricts collection methods and instrument types (apps/web/lib/services/enterprise-contracts/payment-methods.ts:14-34). |
| Local mode | Not applicable: a server-side commercial record. Local inference needs no contract. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No contract | UI shows an Enterprise contract card with a not-on-record message. | apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:252-264 |
| Contract ended | Title reads 'Enterprise contract (ended)'. | apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:270 |
| Loading | Spinner labelled 'Loading the enterprise contract'. | apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:221 |
| Duplicate offline payment | Returns the existing record, recorded false. | apps/web/lib/services/enterprise-contracts/invoicing.ts:292-310 |
| Amend with no agreement or wrong state | Refused with a plain message. | apps/web/lib/services/enterprise-contracts/agreement-store.ts:228-250 |
| Unknown Stripe price | Audited by auditUnknownStripePriceIfEnterpriseConfigured. | apps/web/lib/services/enterprise-billing-service.ts:99 |
| Out-of-order webhooks | Handled by event sequence and term ordering migration. | apps/web/db/neon/0243_billing_contract_term_ordering.sql; apps/web/app/api/stripe-webhook/lib/handlers.ts:127-134 |
| Offline, timeout, retry on the page | not handled in the code beyond standard query states (not read in detail) | apps/web/features/workspace-console/hooks/use-enterprise-contract.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/enterprise-contracts/__tests__/commercial-agreements.test.ts`: Authoring, versioning, termination.
- `apps/web/lib/services/enterprise-contracts/__tests__/enterprise-invoicing.test.ts`: Invoice positions and offline payments.
- `apps/web/lib/services/enterprise-billing-service.test.ts`: Contract sync.
- `apps/web/lib/services/enterprise-billing-service.summary.test.ts`: Contract summary.
- `apps/web/lib/services/enterprise-billing-service.issuance.test.ts`: Invoice issuance recording.
- `apps/web/lib/services/enterprise-collection-state.test.ts`: Collection state.
- `apps/web/app/api/stripe-webhook/lib/__tests__/enterprise-billing-events.test.ts`: Webhook events for enterprise billing.
- `apps/web/db/neon/enterprise-commercial-agreements-migration.test.ts`: Agreement migration shape.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceEnterpriseContract.test.tsx`: Contract UI.

**Test scenarios**

- **Amend an agreement**
  1. In a test database record an executed agreement.
  2. Record an amendment with higher committed seats.
  - Expected: Version 2 current; version 1 superseded with terms intact.
- **Duplicate wire**
  1. Post report_offline_payment twice with the same invoice and reference.
  - Expected: One record; second response recorded false.
- **Card-only refusal**
  1. Use an agreement with card_only policy; post an offline payment.
  - Expected: Refused: no offline method permitted.
- **Admin view**
  1. Sign in as an admin with billing.read on an Enterprise workspace; open /workspace/billing.
  - Expected: Terms match the stored agreement and invoices link to Stripe.
- **Permission split**
  1. Sign in with billing.read only; POST terminate.
  - Expected: Refused for missing billing.contracts.manage.

**Where to look when it fails**

- Audit surface enterprise_contracts with reasons commercial_agreement_version_authored, commercial_agreement_terminated, enterprise_offline_payment_reported (apps/web/lib/services/enterprise-contracts/agreement-store.ts:21-23; invoicing.ts:30).
- Tables organization_commercial_agreements, enterprise_offline_payment_records.
- Stripe webhook logs in apps/web/app/api/stripe-webhook/lib/handlers.ts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No caller or screen creates agreements; the draft's 'internal tools' were not found.** Affects: Sales and staff; all apps.. Evidence: authorCommercialAgreementVersion and recordSignedOrder appear only in tests, index.ts and docs.. Work needed: Build or document the staff path, with audit and confirmation.
- **Brief says the invoicing module builds invoices; it reads and reconciles them.** Affects: Documentation.. Evidence: apps/web/lib/services/enterprise-contracts/invoicing.ts:101-198. Work needed: Correct the brief wording.
- **No contract view outside the web.** Affects: Desktop, mobile, CLI, VS Code, Chrome.. Evidence: No client code found.. Work needed: Decide if a link is enough.
- **Retention of contract and payment records is not stated in files read.** Affects: Compliance.. Evidence: apps/web/lib/billing/financial-record-retention.ts not read.. Work needed: Read and document.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- SYS-security-and-privacy
- surface:web
- mode:cloud
- plan:enterprise
- table:organization_commercial_agreements
- F100-08
- F100-11
- F100-12

## Unknown

- Who authors agreements today and with what tool.
- Retention of contract, invoice and payment records.
- Rate limits on the billing-contract route.
- Whether the signature provider integration (DocuSign) is connected anywhere.
