---
id: "F087-12"
type: "feature"
title: "Billing, compliance, legal holds and support access"
aliases: ["Billing console", "Legal holds", "eDiscovery export", "Compliance export", "Support access", "Break-glass access", "S87.34", "S87.35", "S87.36", "S87.37"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.34", "S87.35", "S87.36", "S87.37"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:team", "plan:team_premium", "plan:enterprise", "table:legal_holds", "table:legal_hold_custodians", "table:support_access_grants", "table:support_access_events", "api:GET /api/settings/organization/legal-holds/[holdId]/export", "api:POST /api/settings/organization/legal-holds", "api:POST /api/admin/support-access", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "F087-09", "F087-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-12 Billing, compliance, legal holds and support access

The Billing page shows plan, seats and enterprise contract and invoices, and links out for payment. Admins place and release legal holds and export held records with a custody trail. Platform support access uses two-operator approval and a hash-chained log, but workspace admins have no screen to approve or review it.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.34](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8734), [S87.35](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8735), [S87.36](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8736), [S87.37](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8737).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows workspace plan, seats, contract and invoices; creates legal holds on the workspace or one member; exports records preserved by a hold as JSONL with a manifest and custody entry; and lets platform operators request, approve and revoke time-limited access to workspace data with a tamper-evident log (WorkspaceBillingSummary.tsx:113-162; legal-holds/route.ts:105; legal-holds/[holdId]/export/route.ts:61; support-access-service.ts:478).

**Why it exists.** Enterprises must know what they pay, preserve data under legal obligation, hand records to counsel, and control who inside the vendor can read their data.

**Who uses it.** Owners and admins for billing; roles with content.govern for holds and export (legal-holds/route.ts:68); platform operators for support access (admin/support-access/route.ts:103).

**Problems it solves**

- Data deleted while under legal obligation.
- No evidence package for counsel.
- Opaque vendor access to customer data.

**Use cases**

- Place a hold on one member during a dispute.
- Export held records with a manifest.
- Check seats used against allowance.
- Operator gets approved, time-limited access for a support ticket.

## 2. User experience

**Where to find it**

- Web: Workspace > Records > 'Billing' (/workspace/billing) and 'Data' (/workspace/data) (WorkspaceConsoleNav.tsx:126,138).
- Desktop: [inferred] same hosted pages (doc: AGENTS.md section 5).
- Support access: operator-only API /api/admin/support-access; no workspace page found.
- Mobile, CLI, VS Code, Chrome: none found.

**Before you start**

- Admin access; billing needs billing.read, contract actions billing.contracts.manage (billing-contract/route.ts:106); holds need content.govern (legal-holds/route.ts:68).
- Plan team, team_premium or enterprise; the enterprise contract section only for contract-priced plans (WorkspaceBillingSummary.tsx).

**Screens and controls**

- Billing: 'Plan and seats' (Plan, Seats used, Members), 'Enterprise contract', 'Contacts', 'Invoices', 'Manage billing' with links 'Billing settings' and 'Usage' (WorkspaceBillingSummary.tsx:113,149,162; WorkspaceEnterpriseContract.tsx:253-309).
- Data > legal holds: name input 'Legal hold name', scope select 'Whole workspace' or 'One member', reason input, per-hold 'Export records', 'Release hold' (WorkspaceDataControls.tsx:376,387,155,216), plus sweep table.

**Journey**

1. Open Billing to read plan and seats; use 'Billing settings' for payment and invoices.
2. Open Data; name the hold, choose scope, give a reason, create.
3. Use 'Export records' on a hold to download JSONL.
4. Release a hold after the confirmation that names the consequence (WorkspaceDataControls.tsx:248-253).
5. Operators handle support access outside the workspace UI.

**What the person sees and gets**

- Banner for past-due collection (EnterpriseCollectionBanner, WorkspaceBillingSummary.test.tsx:113).
- Hold list with active and released holds; deletion backlog figures (WorkspaceDataControls.tsx:111-150).
- Export includes a manifest line and a custody line (legal-holds/[holdId]/export/route.ts:124-148).
- Errors such as 'This workspace already has an active organization-wide hold.' (legal-holds/route.ts:145).

**Settings**

- Hold scope, reason, resource types (API) and custodians (API only).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Billing page reads plan, seats and workspace overview from live data and shows contract and invoices to admins (WorkspaceBillingSummary.tsx:113-162; billing-contract/route.ts:115-157).
- Contract actions: report an offline payment or terminate the agreement, gated by billing.contracts.manage (billing-contract/route.ts:159).
- Billing holds: past-due collection blocks managed compute as billing_read_only and credit top-ups as billing_past_due (organization-policy-evaluator.ts:161-181; managed-compute-access.ts:90; billing/top-up/route.ts:124).
- Legal holds: create (workspace, member; API also custodian), list, release, audit rows legal_hold_created; held rows are excluded inside every destructive SQL statement and account or workspace erasure refuses (legal-holds/route.ts:105-181; doc: docs/compliance/legal-hold-and-ediscovery.md).
- Retention never deletes held data (retention-service.ts:204-275).
- Export: per hold, filters resource types, custodians, from, to; audit row ediscovery_export (critical) before streaming; manifest and hash-chained custody record at the end; a failed export is recorded as failed (legal-holds/[holdId]/export/route.ts:61-170; ediscovery-export-service.ts:256,447).
- Support access: scopes, purposes, request then second-operator approval, default 1 hour and maximum 8 hours, refusals and reads appended to a hash-chained log, nightly expiry sweep, trail verification (support-access-service.ts:13,58-59,478,598,943; vercel.json:98).
- Owner and admin members can SELECT their workspace's grants and events by database row security (0229_support_access_grants.sql:163-190).

**Incomplete**

- Billing page does not itself manage payment method, plan change or invoices for non-enterprise plans; it links to 'Billing settings' (WorkspaceBillingSummary.tsx:149-165). That screen was not read.
- Holds screen offers scopes 'Whole workspace' and 'One member' only; custodian lists need the API (WorkspaceDataControls.tsx:386-387).
- Compliance export is per legal hold, not a general workspace content export; a whole-workspace hold is the route to export everything the hold names.
- seat_purchase policy ask exists but no caller found (organization-policy-evaluator.ts:110).

**Present but disconnected or switched off**

- Support access has operator endpoints and database read rights for admins, but no workspace route or screen reads them (searched app, lib, features for support_access tables: only server modules).

**Not available**

- Workspace admin approval, denial or revocation of support access (S87.35 Should): not found.
- CLI, mobile, VS Code, Chrome: none.
- Seat purchase block: not wired.

## 4. Required behaviour

**Established requirements**

- Admin manages plan, seats, payment method, invoices and, for enterprise, contract terms from the console. (source: brief S87.34 Should)
- A workspace admin decides whether platform support may access workspace data and can review it. (source: brief S87.35 Should)
- Admin exports workspace content for compliance review and the export is recorded. (source: brief S87.36 Should)
- Admin places holds on workspace or members, releases after confirmation, and held data survives retention and deletion. (source: brief S87.37 Should)
- A hold preserves only the seven listed stores and never connector or mailbox data. (source: doc: docs/compliance/legal-hold-and-ediscovery.md)
- A grant needs a second operator and lasts at most 8 hours. (source: support-access-service.ts:59,478-505)

**Acceptance criteria**

1. Creating a whole-workspace hold when one is active is refused with a clear message.
2. A held conversation is not deleted by the retention sweep.
3. Releasing a hold requires a confirmation dialog and writes an audit row.
4. Exporting a hold writes an ediscovery_export audit row before bytes stream, ends with manifest and custody lines, and a failure leaves a failed custody record.
5. With enterprise collection read-only, a managed turn is refused with billing_read_only.
6. A support grant requested and approved by the same operator is refused.
7. A grant expires within 8 hours and the expiry is written to the log.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Workspace admins should be able to see support access grants because the database already allows it [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a read-only 'Support access' panel using the existing row-security reads.
- [proposed] Add a workspace approval step before an operator grant becomes active, if S87.35 requires approval.
- [proposed] Add a custodian picker to the hold form.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Billing page | `apps/web/app/workspace/billing/page.tsx` | Console page titled Billing |
| component | WorkspaceBillingSummary | `apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx` | Plan, seats, links |
| component | WorkspaceEnterpriseContract | `apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx` | Contract, contacts, invoices |
| endpoint | /api/settings/organization/billing-contract | `apps/web/app/api/settings/organization/billing-contract/route.ts` | Contract read, offline payment, terminate |
| component | WorkspaceDataControls | `apps/web/features/workspace-console/components/WorkspaceDataControls.tsx` | Legal holds, export link, sweep record |
| hook | use-legal-holds | `apps/web/features/workspace-console/hooks/use-legal-holds.ts` | Holds API client |
| endpoint | /api/settings/organization/legal-holds | `apps/web/app/api/settings/organization/legal-holds/route.ts` | List, create, release holds |
| endpoint | GET /api/settings/organization/legal-holds/[holdId]/export | `apps/web/app/api/settings/organization/legal-holds/[holdId]/export/route.ts` | eDiscovery JSONL stream |
| service | ediscovery-export-service | `apps/web/lib/services/ediscovery-export-service.ts` | Manifest, iteration, custody record |
| service | legal-hold-gate | `apps/web/lib/services/legal-hold-gate.ts` | SQL predicate used by every delete |
| service | retention-service | `apps/web/lib/services/retention-service.ts` | createLegalHold, releaseLegalHold, sweep |
| service | support-access-service | `apps/web/lib/server/support-access-service.ts` | Break-glass grants and hash-chained events |
| endpoint | /api/admin/support-access | `apps/web/app/api/admin/support-access/route.ts` | Operator request, approve, deny, revoke, verify |
| job | expire-support-access-grants cron | `apps/web/app/api/cron/expire-support-access-grants/route.ts` | Marks stale grants expired |
| service | organization-policy-evaluator billing hold | `apps/web/lib/services/organization-policy-evaluator.ts` | billing_read_only and billing_past_due |
| service | managed-compute-access | `apps/web/lib/services/managed-compute-access.ts` | Blocks managed compute when collection is read-only |
| table | legal_holds and legal_hold_custodians | `apps/web/lib/services/retention-service.ts` | Hold records |
| table | support_access_grants and support_access_events | `apps/web/db/neon/0229_support_access_grants.sql` | Grants and hash-chained events with owner/admin read policy |
| other | legal-hold-and-ediscovery document | `docs/compliance/legal-hold-and-ediscovery.md` | Describes hold scope and limits |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin opens Billing; page loads organization overview and, for contract plans, the contract and invoices. | device and our servers | WorkspaceBillingSummary.tsx:48; billing-contract/route.ts:115 |
| Admin creates a hold; server checks content.govern, writes the hold on the privileged connection, audits it. | our servers | legal-holds/route.ts:105-170 |
| Any delete or retention sweep includes the hold predicate in its own SQL, so held rows are not removed. | our servers | legal-hold-gate.ts:166; retention-service.ts:204 |
| Admin exports; server writes the ediscovery_export audit row, streams chunks, appends manifest and custody lines. | our servers | legal-holds/[holdId]/export/route.ts:87-148 |
| Operator requests support access; a second operator approves with an expiry; reads are appended to the chain; cron expires stale grants. | our servers | support-access-service.ts:433,478,598 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Holds and custodians | legal_holds, legal_hold_custodians (application role has read only) | Server only | Release marks released; record kept |
| Exported records | downloaded to the admin's device | No | With the admin |
| Custody record of exports | hash-chained export custody table via recordEdiscoveryExport | Server only | Kept |
| Support grants and events | support_access_grants, support_access_events | Server only | Events are append-only and chained; trail refuses rewrite (0229 migration notes) |

**Models and providers.** No model or provider involved. Billing data comes from the payments provider through our servers; the provider folder was not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace admin; support access needs a platform operator account. |
| Permissions | billing.read, billing.contracts.manage, content.govern (legal-holds/route.ts:68); platform admin for support access (admin/support-access/route.ts:103); owner or admin may read support tables by database policy. |
| Subscription | plan:team, plan:team_premium or plan:enterprise for the console; enterprise contract block only for contract-priced plans. |
| Limits and metering | Hold name up to 200 characters, reason 2000, custodians up to 500 (legal-holds/route.ts:20-30). Grant reason at least 20 characters, maximum 8 hours (support-access-service.ts:59-60). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | These are server-side workspace controls; Local chats stored only on a device are outside holds and exports. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No workspace | 'No workspace selected' with pointer to account settings. | WorkspaceBillingSummary.tsx:85 |
| Loading, error | 'Loading plan and seats…' and 'We could not load your plan' with retry. | WorkspaceBillingSummary.tsx:41-80 |
| Past due | Banner; managed compute read-only; top-ups on hold. | organization-policy-evaluator.ts:161-181 |
| Duplicate hold | Validation refusal. | legal-holds/route.ts:145 |
| Hold without subject or custodians | Refused because it would hold nothing. | legal-holds/route.ts:119-128 |
| Release | Dialog 'Release the hold ...?'; double click does not release. | WorkspaceDataControls.tsx:248; WorkspaceDataControls.release.test.tsx:95 |
| Export fails midway | Failed custody record written. | legal-holds/[holdId]/export/route.ts:157-170 |
| Holds unreadable | Retention aborts, deletes nothing. | retention-service.ts:200 |
| Self-approval of support grant | Refused in code and by a database constraint. | support-access-service.ts:478-495 |
| Offline | not handled in the code. | WorkspaceBillingSummary.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/workspace-console/components/__tests__/WorkspaceBillingSummary.test.tsx`: Plan and seats, billing-hold banner, contract visible to owner, member notice
- `apps/web/features/workspace-console/components/__tests__/WorkspaceEnterpriseContract.test.tsx`: Contract screen
- `apps/web/app/api/settings/organization/legal-holds/__tests__/route.test.ts`: Member refusal, list, backlog, create and audit
- `apps/web/features/workspace-console/components/__tests__/WorkspaceDataControls.release.test.tsx`: Release asks first, double click safe, names member
- `apps/web/features/workspace-console/components/__tests__/WorkspaceDataControls.backlog.test.tsx`: Deletion backlog display
- `apps/web/lib/services/__tests__/legal-hold-gate.test.ts`: Hold predicate
- `apps/web/lib/services/__tests__/legal-hold-deletion-paths.test.ts`: Deletion paths respect holds
- `apps/web/lib/services/__tests__/ediscovery-export-service.test.ts`: Export scope, references, custodian filter
- `apps/web/lib/server/support-access-service.test.ts`: Request, second-operator approval, expiry
- `apps/web/app/api/admin/support-access/route.test.ts`: Operator-only control plane
- `apps/web/lib/services/__tests__/managed-compute-access.test.ts`: Read-only enterprise refusal

**Test scenarios**

- **Hold survives retention**
  1. Create a hold on a member.
  2. Run a real retention sweep.
  - Expected: Held conversations remain; sweep record shows Held count.
- **Release confirmation**
  1. Click Release hold.
  2. Cancel; click again and confirm.
  - Expected: Nothing released on cancel; released after confirm; audit row.
- **Export a hold**
  1. Click Export records.
  2. Check the last two lines.
  - Expected: Manifest and custody lines; ediscovery_export audit row exists.
- **Past-due workspace**
  1. Put an enterprise test workspace into read-only collection.
  2. Send a managed turn.
  - Expected: Refusal with billing_read_only.
- **Support access two-person rule**
  1. Operator A requests; A tries to approve.
  - Expected: Refused; operator B approval writes expiry no later than 8 hours.
- **Admin review of support access**
  1. Look for any workspace screen listing grants.
  - Expected: None exists today (gap).

**Where to look when it fails**

- Audit eventTypes legal_hold_created, ediscovery_export, deletion_blocked_by_legal_hold.
- Support events: requested, approved, denied, revoked, expired, accessed, refused; verify via GET /api/admin/support-access?action=verify.
- Codes billing_read_only, billing_past_due, subscription_inactive.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **Workspace admins cannot approve, deny, revoke or review support access** Affects: Enterprise admins on all apps. Evidence: No workspace route or screen; DB read policy exists at 0229_support_access_grants.sql:163. Work needed: Add a workspace panel and, if required, an approval step
- **Billing page does not manage payment method or plan change itself** Affects: Admins. Evidence: WorkspaceBillingSummary.tsx:149-165 links to Billing settings. Work needed: Read Billing settings and confirm or move controls
- **Hold form lacks custodian scope** Affects: Admins with multi-person matters. Evidence: WorkspaceDataControls.tsx:386-387 vs legal-holds/route.ts:25. Work needed: Add custodian picker
- **No general workspace content export; export is per hold** Affects: Compliance reviewers. Evidence: export route is under legal-holds/[holdId]. Work needed: Clarify or add a workspace export
- **seat_purchase billing hold has no caller** Affects: Seat additions while past due. Evidence: organization-policy-evaluator.ts:110 only. Work needed: Wire the ask into the seat purchase path
- **Holds do not preserve connector or mailbox data** Affects: Legal teams. Evidence: doc: docs/compliance/legal-hold-and-ediscovery.md section 'What a hold can name'. Work needed: State clearly in product copy
- Not built on: Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:team
- plan:team_premium
- plan:enterprise
- table:legal_holds
- table:legal_hold_custodians
- table:support_access_grants
- table:support_access_events
- api:GET /api/settings/organization/legal-holds/[holdId]/export
- api:POST /api/settings/organization/legal-holds
- api:POST /api/admin/support-access
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- F087-09
- F087-10

## Unknown

- The Billing settings screen (payment method, invoices for non-enterprise plans) was not read.
- Whether support access reads by operators actually require a live grant on every operator route (assertSupportAccess exists; full coverage not traced).
- Retention or deletion of custody and support events.
- Which payments provider handles invoices and top-ups.
- Desktop loading route.
- Whether any support notification is sent to workspace admins when a grant is approved.
