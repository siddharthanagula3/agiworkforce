---
id: "F083-11"
type: "feature"
title: "Team seats and enterprise billing"
aliases: ["Team seats", "Seat purchase", "Seat assignment", "Plan and seats", "Seats used", "Enterprise contract", "Enterprise contacts", "Purchase order", "Offline payment", "billing-contract", "S83.28", "S83.29", "S83.30", "S83.31"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "partial", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.28", "S83.29", "S83.30", "S83.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:POST /api/checkout", "api:POST /api/upgrade", "api:GET /api/settings/organization/billing-contract", "api:POST /api/settings/organization/billing-contract", "api:GET /api/settings/team/invitations", "table:enterprise_offline_payment_records", "table:organization_billing_invoices", "table:subscriptions", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-11 Team seats and enterprise billing

A team owner buys seats on the Business tab of /pricing and adds seats later through the upgrade dialog. The workspace console shows seats used out of seats licensed. Enterprise admins see a read-only contract, contacts, purchase order and invoices. Bank-transfer recording exists as an API only, with no screen.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.28](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8328), [S83.29](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8329), [S83.30](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8330), [S83.31](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8331).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a team owner choose standard and premium seat counts at checkout, raise the count through the upgrade route, see 'Seats used N of M' in the workspace console, and lets enterprise administrators read their contract, contacts, purchase-order reference and invoices. An API records offline payments (wire, check, bank transfer) against an invoice. (apps/web/app/api/checkout/route.ts:208-216; apps/web/app/api/upgrade/route.ts:277-290; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:104-135; apps/web/app/api/settings/organization/billing-contract/route.ts:114-204)

**Why it exists.** Teams pay per seat and enterprises pay by contract and invoice; admins need to see what they are licensed for and billed (S83.28-S83.31).

**Who uses it.** Team owners, workspace administrators, enterprise finance and procurement contacts, and operators who reconcile bank transfers.

**Problems it solves**

- No way to size a team purchase.
- Admins cannot see licensed versus used seats.
- Procurement cannot find the PO number, terms or invoices.
- Bank transfers cannot be matched to invoices safely.

**Use cases**

- An owner types seat counts on /pricing, Business tab, and buys.
- An admin sees 'Seats used 3 of 5' in the workspace console.
- A finance contact reads the contract's payment terms and purchase order reference.
- An operator reports a wire against an invoice with its bank reference through the API.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): /pricing, Business tab, seat inputs labelled by the 'seatCountLabel' text (apps/web/app/pricing/page.tsx:1104-1120).
- Web and Desktop: Settings, Billing shows the plan price per Standard and Premium seat for a team (BillingSection.tsx:318-327 region 'per Standard seat').
- Web and Desktop: workspace console, 'Plan and seats' section with rows 'Plan', 'Seats used', 'Members' (WorkspaceBillingSummary.tsx:99-135).
- Web and Desktop: workspace console sections 'Enterprise contract', 'Contacts' and 'Invoices' for organization administrators (WorkspaceEnterpriseContract.tsx:253,270-312).
- Mobile: workspace settings screen line '<plan> · N of M seats used' (apps/mobile/app/(app)/settings/workspace.tsx:578).
- Invitation list reports seats (apps/web/app/api/settings/team/invitations/route.ts:81-88).

**Before you start**

- Signed in; for the first Team purchase the account needs upgrade access (a beta_redemptions row) unless paid upgrades are open (apps/web/lib/server/billing-waitlist-access.ts:42-52; apps/web/app/api/checkout/route.ts:293-307).
- Enterprise views need a workspace admin role and the permission billing.read (apps/web/app/api/settings/organization/billing-contract/route.ts:96-111).
- Writing contract actions needs billing.contracts.manage (same file, line 106).

**Screens and controls**

- Seat count and premium seat inputs on /pricing, minimum 2 seats (MIN_PURCHASABLE_SEATS in packages/contracts/types/src/billing-catalog.ts:157; apps/web/lib/validations/checkout.ts:23-31).
- Console rows 'Plan', 'Seats used' with the note about billing-driven allowance, and 'Members' (WorkspaceBillingSummary.tsx:111-135).
- Enterprise rows: Legal entity, Term, Billing cadence, Committed seats, Payment terms, Tax status, Purchase order, optional Support tier; Contacts: Billing contact and Procurement contact; Invoices table with View and PDF links (WorkspaceEnterpriseContract.tsx:274-312,175-195).
- Links 'Billing settings' and 'Usage' under 'Manage billing' (WorkspaceBillingSummary.tsx:137-170).

**Journey**

1. 1. Owner opens /pricing, Business tab, sets standard and premium seat counts.
2. 2. Chooses a cadence and buys; checkout creates a session (or a 403 asks for access code or waitlist).
3. 3. Later adds seats through the upgrade dialog; the call goes to POST /api/upgrade.
4. 4. Owner invites members; the invitations route reports seat state.
5. 5. Admin opens the workspace console and reads 'Seats used N of M'.
6. 6. Enterprise admin reads the contract, contacts, PO and invoices. Operators with billing.contracts.manage can report an offline payment through the API.

**What the person sees and gets**

- Console note: 'The seat allowance follows your billing agreement and cannot be lowered below occupied seats.' (WorkspaceBillingSummary.tsx:94-95).
- No-seat error from the invitation path: 'This organization has no licensed seats available. Free a seat by removing a member or revoking a pending invitation, or purchase more seats.' (apps/web/lib/services/organization-seat-service.ts:95).
- 403 on first Team purchase: 'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.' (billing-waitlist-access.ts:19).
- Offline payment conflict: 'This transfer cannot be applied to the invoice: <reason>.' (invoicing.ts, reportOfflinePayment).

**Settings**

- Workspace Billing settings link; AGI_BILLING_WAITLIST_OPEN (operator flag, name only); the upgrade-access operator switch read by readBillingUpgradesOpen (apps/web/lib/server/billing-waitlist-access.ts:38-40).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Checkout accepts seats and premiumSeats with limits and validation (apps/web/lib/validations/checkout.ts:23-80; apps/web/app/api/checkout/route.ts:208-216).
- Seat increases use POST /api/upgrade, which sets the item quantity and refuses reductions, cadence changes and an apply with no seat count (apps/web/app/api/upgrade/route.ts:277-290; tests in apps/web/app/api/upgrade/route.seats.test.ts:168,303,317,363).
- Workspace console shows plan, seats used of licensed, members and a billing-hold banner (WorkspaceBillingSummary.tsx; test WorkspaceBillingSummary.test.tsx:81,113).
- Seat state service reads licensed_seats and seats_consumed from the organization (apps/web/lib/services/organization-seat-service.ts:38-55).
- Enterprise contract, contacts, invoices read only, with permission billing.read and an admin-access audit log (billing-contract/route.ts:114-148).
- Offline payment API: strict schema, method limited to wire, check or ACH credit transfer, bank reference required, same reference reported twice writes once, amount checked against what is outstanding, a report does not settle until reconciled (billing-contract/route.ts:70-80; apps/web/lib/services/enterprise-contracts/invoicing.ts:265-320; apps/web/db/neon/0288_enterprise_offline_payment_records.sql:4-18,33-50).
- Mobile workspace screen shows seats used (workspace.tsx:578).

**Incomplete**

- First Team purchase through POST /api/checkout is blocked with 403 for accounts without upgrade access while upgrades are staged (checkout/route.ts:293-307; billing-waitlist-access.ts:42-52). The brief says Desktop is 'partial' for this; Desktop shows the same hosted web app, so Web and Desktop are the same [inferred from apps/desktop/electron/config.ts:17,103].
- Offline payment recording has no screen: the enterprise UI hook only reads (apps/web/features/workspace-console/hooks/use-enterprise-contract.ts:17) and no component posts action report_offline_payment (searched app, features, lib, shared).
- Migration file 0288 header still says 'NOT YET APPLIED : draft only' while the file is numbered 0288 and its own header says 0287 (apps/web/db/neon/0288_enterprise_offline_payment_records.sql:1-6).
- The brief's seat-view claim for Mobile cites workspace.tsx:268, which is not the seat line; the seat text is at line 578.

**Present but disconnected or switched off**

- Paid upgrade access is operator-gated; AGI_BILLING_WAITLIST_OPEN stays unset until the owner opens upgrades (brief S83.28 note; apps/web/lib/server/billing-waitlist-access.ts:30-32).

**Not available**

- Enterprise purchase through self-serve checkout: enterprise is not sold self-serve (apps/web/app/api/checkout/route.ts:222-227).
- Editing the contract, contacts or PO from the UI: read only.
- Seat purchase on Mobile, CLI, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- A team owner can buy seats (choose a count at purchase and add seats later). (source: S83.28)
- Admins can assign seats to members and see seats used versus licensed. (source: S83.29)
- Enterprise admins can see billing and procurement contacts for their contract. (source: S83.30)
- Enterprise customers can buy through purchase orders and invoices: PO numbers on invoices, invoice terms, offline payment reporting. (source: S83.31)
- A Free user cannot start a new paid subscription merely because a checkout route exists; the acquisition policy returns an access-code or waitlist decision first. (source: doc: docs/product/commercial.md:60-63)
- Owner holds the waitlist on until opening paid upgrades (ruling 2026-09-28 in the brief). (source: S83.28 Unfinished note)
- Offline payments are recorded against an invoice with a bank reference and cannot be double recorded; only a reconciled row counts against the invoice. (source: apps/web/db/neon/0288_enterprise_offline_payment_records.sql:4-18)

**Acceptance criteria**

1. POST /api/checkout for a Team plan without seats is rejected with a validation error; with fewer than the minimum is rejected.
2. POST /api/checkout for a first Team purchase without access returns 403 with the waitlist code; with access returns a checkout session.
3. POST /api/upgrade can raise seats and refuses a reduction.
4. The workspace console shows 'Seats used N of M' with values matching licensed_seats and seats_consumed.
5. An invitation beyond the licensed seats is refused with the seat message.
6. An admin with billing.read sees contract, contacts and invoices; a member without it sees a denial and not a 'missing contract' text.
7. Reporting the same bank reference twice creates one record and returns recorded=false the second time.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Seat assignment is done by invitation and member role, not by a separate assignment screen [inferred from the invitations route returning seats and the console showing counts only].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a read-only offline payment list to the enterprise screen so admins see reported and reconciled transfers.
- [proposed] Fix the 0288 header and record whether it is applied.
- [proposed] Show a 'Buy seats' link in the console when seats are all used.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Pricing page (Business tab seats) | `apps/web/app/pricing/page.tsx` | Seat state (teamSeats, premium seats) and inputs; sends them to checkout. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Validates seat counts; waitlist gate; owner policy; creates session. |
| config | Checkout validation | `apps/web/lib/validations/checkout.ts` | Seat limits, premium seat rules, promotion code format. |
| endpoint | POST /api/upgrade | `apps/web/app/api/upgrade/route.ts` | Applies upgrades and seat increases through the provider. |
| service | billing-waitlist-access | `apps/web/lib/server/billing-waitlist-access.ts` | hasBillingWaitlistAccess, forced-open flag and 403 response. |
| component | UpgradeConfirmDialog | `apps/web/features/billing/components/UpgradeConfirmDialog.tsx` | Carries the seats request for upgrades (lines 42,121,197). |
| component | WorkspaceBillingSummary | `apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx` | Plan and seats card; hosts the enterprise contract. |
| component | WorkspaceEnterpriseContract | `apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx` | Read-only contract, contacts and invoices. |
| hook | use-enterprise-contract | `apps/web/features/workspace-console/hooks/use-enterprise-contract.ts` | Fetches /api/settings/organization/billing-contract. |
| endpoint | GET and POST /api/settings/organization/billing-contract | `apps/web/app/api/settings/organization/billing-contract/route.ts` | Contract read; offline payment report and terminate actions with permissions. |
| service | enterprise invoicing | `apps/web/lib/services/enterprise-contracts/invoicing.ts` | Invoice positions, offline payment rules and recording. |
| service | agreement-store | `apps/web/lib/services/enterprise-contracts/agreement-store.ts` | Reads commercial agreement columns (legal entity, seats, terms, contacts, PO). |
| table | enterprise_offline_payment_records | `apps/web/db/neon/0288_enterprise_offline_payment_records.sql` | One row per remittance; unique on invoice and reference; row-level security by permission. |
| table | organization_billing_invoices | `apps/web/db/neon/0163_enterprise_billing_contracts.sql` | Enterprise invoices referenced by offline payments (named in 0288 header). |
| service | organization-seat-service | `apps/web/lib/services/organization-seat-service.ts` | Seat state: licensed, consumed, available, source. |
| endpoint | GET and POST /api/settings/team/invitations | `apps/web/app/api/settings/team/invitations/route.ts` | Invitations list returns seats; create invitation consumes a seat. |
| screen | Mobile workspace settings | `apps/mobile/app/(app)/settings/workspace.tsx` | Shows '<plan> · N of M seats used'. |
| config | billing-catalog | `packages/contracts/types/src/billing-catalog.ts` | MIN_PURCHASABLE_SEATS and seat plan definitions. |
| test | WorkspaceEnterpriseContract test | `apps/web/features/workspace-console/components/__tests__/WorkspaceEnterpriseContract.test.tsx` | Read-only contract view. |
| test | billing-contract route test | `apps/web/app/api/settings/organization/billing-contract/route.test.ts` | Contract route and offline payment cases. |
| other | enterprise billing runbook | `docs/runbooks/enterprise-billing.md` | Operational procedure (not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The pricing page keeps seat counts in the browser and sends plan, interval, seats and premiumSeats to POST /api/checkout. | device | apps/web/app/pricing/page.tsx:298-299,391-396 |
| The server validates the body, resolves seat quantities, checks the owner policy and, for a first purchase, the upgrade-access gate (403 when missing). | our servers | apps/web/app/api/checkout/route.ts:208-216,293-307; billing-waitlist-access.ts:42-52 |
| The server creates the hosted checkout session at the payment provider and the person pays there. | outside service | apps/web/app/api/checkout/route.ts:414 (session creation) [route reading incomplete] |
| Later seat increases call POST /api/upgrade, which changes the subscription item quantity at the payment provider and refuses reductions. | our servers | apps/web/app/api/upgrade/route.ts:277-345; route.seats.test.ts:168,303 |
| The console reads seat state from the organization (licensed and consumed seats). | our servers | apps/web/lib/services/organization-seat-service.ts:38-55 |
| Contract read checks admin access, billing.read, then reads contract, invoices and positions and logs the admin data access. | our servers | billing-contract/route.ts:96-148 |
| Offline payment report checks billing.contracts.manage, the agreement's allowed methods, then inserts a record unless the same bank reference exists. | our servers | billing-contract/route.ts:176-204; invoicing.ts:269-320 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Seats licensed and consumed | organizations columns licensed_seats and seats_consumed | Server side; read by Web, Desktop and Mobile | unknown |
| Commercial agreement versions (legal entity, term, cadence, seats, payment terms, tax status, PO reference, contacts) | table of commercial agreements read by agreement-store.ts (table name not opened) | Server side | Versioned history is kept (billing-contract/route.ts:144-158) |
| Offline payment reports | table:enterprise_offline_payment_records | Server side | Never updated or deleted by design (0288 header) |

**Models and providers.** No model is called. The payment provider is Stripe and is not a folder under packages/ai/providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; workspace actions need an organization membership (billing-contract/route.ts:96-100). |
| Permissions | billing.read to view contract and invoices; billing.contracts.manage to report payments or terminate; team admin access also required (billing-contract/route.ts:96-111). Invitations require invitation management permission (invitations/route.ts:58). |
| Subscription | Team plans are per seat with a minimum of 2 seats; Enterprise is contract priced and not sold self-serve (checkout/route.ts:222-227; checkout.ts:23-31). First paid purchase needs upgrade access. |
| Limits and metering | Seat limits MIN_PURCHASABLE_SEATS and MAX_PURCHASABLE_SEATS (checkout.ts:3-6); the seat constraint organizations_seats_within_license stops over-allocation (organization-seat-service.ts:72); rate limits on checkout and upgrade routes are configuration (names not opened). |
| Feature flags | AGI_BILLING_WAITLIST_OPEN forces paid upgrades open; the run-time switch is read by readBillingUpgradesOpen (billing-waitlist-access.ts:30-40). |
| Model compatibility | None found in the code. |
| Provider restrictions | Seats for web-billed plans only; store-owned plans are refused (route.seats.test.ts:235). |
| Local mode | Local inference needs no subscription or seats. Seat and contract screens are cloud account screens and need sign-in; Mobile does not read the account unless chat is in Cloud mode (apps/mobile/src/features/billing/store.ts:73). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No workspace selected | Console says 'No workspace selected' with an explanation. | WorkspaceBillingSummary.tsx:75-86 |
| Load error | 'We could not load your plan' with Try again. | WorkspaceBillingSummary.tsx:60-72 |
| No contract for a contract-priced plan | Explains a missing record; denied access is not described as missing. | WorkspaceEnterpriseContract.test.tsx:92,98 |
| Contract ended | Title 'Enterprise contract (ended)' and a write-off row. | WorkspaceEnterpriseContract.tsx:270; test lines 113,136 |
| No invoices | Text states no invoices issued. | WorkspaceEnterpriseContract.test.tsx:104 |
| Card-settled agreement and a transfer is reported | 409 'This agreement is settled by card, so a bank transfer cannot be applied to it.' | billing-contract/route.ts:186-190 |
| Same bank reference twice | Returns the existing record with recorded=false; no second row. | invoicing.ts:296-304 |
| No seats left on invite | Refused with the seat message. | organization-seat-service.ts:95 |
| Accessibility | Invoice table has caption, header directions, unique link names. | WorkspaceEnterpriseContract.test.tsx:171-204 |
| Offline | not handled in the code beyond load errors. | searched the contract and summary components |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/checkout/route.test.ts`: Checkout route; individual cases not read.
- `apps/web/app/api/checkout/route.premium-seats.test.ts`: Premium seat handling at checkout; cases not read.
- `apps/web/lib/validations/__tests__/checkout.seats.test.ts`: Seat validation; cases not read.
- `apps/web/app/api/upgrade/route.seats.test.ts`: Applies seat count as quantity (168); co-terms added seats (224); refuses store-owned plan (235); idempotency key includes seats (267); preview token bound to seat count (286); refuses seat reduction (303); refuses cadence change (317); fails if provider did not apply seats (334); Team apply needs seat count (363).
- `apps/web/features/workspace-console/components/__tests__/WorkspaceBillingSummary.test.tsx`: Plan and seats without hold banner (81); manual seat allowance (90); billing-hold banner when overdue (113); enterprise contract for owner (129); read-only notice for member viewer (137).
- `apps/web/features/workspace-console/components/__tests__/WorkspaceEnterpriseContract.test.tsx`: Terms, contacts, payment terms and tax status read only (50); missing and denied states; ended contract; table accessibility; older-invoices note.
- `apps/web/app/api/settings/organization/billing-contract/route.test.ts`: Contract route including report_offline_payment cases (lines 438, 467, 495); other cases not read.
- `apps/web/lib/services/__tests__/organization-seat-service.test.ts`: Seat service; cases not read.
- `apps/web/lib/services/enterprise-contracts/__tests__`: Enterprise contract services; files not read.
- `apps/web/db/neon/organization-seats-lifecycle-migration.test.ts`: Seat lifecycle migration.

**Test scenarios**

- **Buy a team**
  1. Sign in as an owner with upgrade access.
  2. Open /pricing, Business tab, set 3 seats.
  3. Start checkout.
  - Expected: A checkout session for 3 seats; after payment the console shows seats licensed 3.
- **Staged access**
  1. Use an account without upgrade access and paid upgrades closed.
  2. POST /api/checkout for Team.
  - Expected: 403 with the waitlist code and message; no session.
- **Add seats**
  1. Open the upgrade dialog on a Team plan and add 2 seats.
  2. Confirm.
  - Expected: POST /api/upgrade raises the quantity; the console shows the new licensed count.
- **Seat limit on invite**
  1. Fill all seats, then invite one more member.
  - Expected: Refused with the 'no licensed seats available' message.
- **Enterprise read-only**
  1. Sign in as an admin with billing.read of a contract workspace.
  2. Open the workspace console.
  - Expected: Legal entity, term, cadence, committed seats, payment terms, tax status, PO and contacts shown; invoices with View and PDF; no edit controls.
- **Offline payment idempotency**
  1. As billing.contracts.manage, POST action report_offline_payment with a bank reference for an open invoice, then repeat the same call.
  - Expected: First returns recorded=true; second recorded=false; one row in enterprise_offline_payment_records.

**Where to look when it fails**

- Logs 'Failed to verify paid upgrade access', 'Failed to verify existing subscription' (checkout/route.ts).
- Constraint name organizations_seats_within_license on over-allocation.
- Table enterprise_offline_payment_records; audit rows from logAdminDataAccess with resourceType enterprise_contract.
- Runbook docs/runbooks/enterprise-billing.md (not read).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **First Team purchase is blocked by the upgrade-access gate for accounts without a redeemed access code while upgrades are staged.** Affects: Web, Desktop and any API caller. Evidence: apps/web/app/api/checkout/route.ts:293-307; apps/web/lib/server/billing-waitlist-access.ts:42-52; brief S83.28. Work needed: Owner opens paid upgrades (AGI_BILLING_WAITLIST_OPEN or the run-time switch); no code change.
- **No UI for recording or listing offline payments; API only.** Affects: Enterprise admins and operators. Evidence: use-enterprise-contract.ts:17; no component posts report_offline_payment; route supports it at billing-contract/route.ts:176-204. Work needed: Add a screen or document the operator procedure in the runbook.
- **Migration 0288 is marked 'NOT YET APPLIED : draft only' and the header names 0287.** Affects: Enterprise offline payments in production. Evidence: apps/web/db/neon/0288_enterprise_offline_payment_records.sql:1-6. Work needed: Confirm applied status with the migration status command, then fix the header text via a new migration note, not by editing an applied file.
- **The brief calls Desktop seat purchase 'partial' but Desktop shows the hosted web app, so it equals Web.** Affects: Documentation. Evidence: apps/desktop/electron/config.ts:17,103. Work needed: Correct the brief wording.
- **No dedicated seat assignment screen; seats follow invitations and membership.** Affects: Workspace admins. Evidence: invitations/route.ts:81-88. Work needed: Decide whether the brief's 'assign seats' needs a separate control.
- **Mobile brief line for seats points to the wrong line.** Affects: Documentation. Evidence: brief cites workspace.tsx:268; seat text is at workspace.tsx:578. Work needed: Fix the reference.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:POST /api/checkout
- api:POST /api/upgrade
- api:GET /api/settings/organization/billing-contract
- api:POST /api/settings/organization/billing-contract
- api:GET /api/settings/team/invitations
- table:enterprise_offline_payment_records
- table:organization_billing_invoices
- table:subscriptions
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations

## Unknown

- Whether migration 0288 has been applied in any environment.
- The full checkout session creation code after line 414 was not read.
- The 'Business' tab label text: the pricing page uses translation keys and I did not open the message file.
- Name of the table behind agreement-store.ts.
- Whether Desktop-specific waitlist handling exists: none found, Desktop loads the hosted web app.
- What docs/runbooks/enterprise-billing.md says.
