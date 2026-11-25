---
id: "F100-12"
type: "feature"
title: "Audit trail"
aliases: ["Audit trail", "Audit events", "Audit log", "Audit export", "Export JSONL", "Allow audit export", "security_audit_logs", "enterprise_audit_events", "S100.28 Audit-event store"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.28"]
depends_on: ["SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "surface:web", "mode:cloud", "table:security_audit_logs", "table:enterprise_audit_events", "F100-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-12 Audit trail

Writes a durable record when someone does something that matters, such as starting a checkout, changing a plan, inviting a member or creating a key. Workspace admins can browse the audit trail and export it as JSONL, unless the workspace policy switches export off. Every export, allowed or denied, is itself recorded.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.28](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10028).

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

**What it does.** recordAuditEvent writes to security_audit_logs and, when the event has an organization, to the workspace trail enterprise_audit_events through a database function (apps/web/lib/security-audit.ts:610-731). The workspace audit route lists events and the export route streams them as JSONL (apps/web/app/api/settings/organization/audit/route.ts; apps/web/app/api/settings/organization/audit/export/route.ts:50-155). Audit logs cannot be updated or deleted by the runtime role (apps/web/db/neon/0043_audit_log_immutability.sql; 0123_audit_log_immutability_trigger.sql).

**Why it exists.** So billing and admin actions can be reviewed later, by customers and by staff. The brief asks that commercial and administrative actions write durable audit events that can be queried later (doc: knowledge-base/data/area-briefs/100-commercial-and-administrative-components.md S100.28).

**Who uses it.** Workspace owners and admins with audit.read, security reviewers, workspace API keys scoped to audit.read, and staff investigating incidents.

**Problems it solves**

- Shows who changed a plan, a role, a key or a seat.
- Lets a customer take its audit trail into its own tools.
- Lets a policy stop bulk export.
- Proves that exports themselves were requested.

**Use cases**

- An admin filters by outcome denied and by severity warning on /workspace/audit.
- An admin presses 'Export JSONL' and gets agi-audit-<org>-<date>.jsonl.
- A script with an audit.read key pulls the trail nightly.
- An owner turns off 'Allow audit export' and later export attempts are refused and logged.

## 2. User experience

**Where to find it**

- Web: /workspace/audit, label 'Audit', hint 'Trail and export', heading 'Audit trail' with an 'Export JSONL' link (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:123; apps/web/features/settings/sections/WorkspaceAuditSection.tsx:131-153; apps/web/app/workspace/audit/page.tsx:21).
- Web policy: Workspace policy row 'Audit export' with toggle 'Allow audit export' (apps/web/features/settings/sections/WorkspacePolicySection.tsx:507-516).
- Audit streaming to an external endpoint: 'Audit destination endpoint' (apps/web/features/workspace-console/components/WorkspaceAuditStreaming.tsx:333-334).
- Desktop, mobile, CLI, VS Code, Chrome: no audit screen found.

**Before you start**

- Team or Enterprise plan (team admin access) and the audit.read permission (apps/web/lib/server/compliance-caller.ts:36-100; apps/web/app/api/settings/organization/audit/export/route.ts:50-55).
- For API access: a workspace key scoped audit.read from an active Team or Enterprise workspace.

**Screens and controls**

- Filters 'Filter by action', 'Filter by outcome', 'Filter by severity' (apps/web/features/settings/sections/WorkspaceAuditSection.tsx:167-196).
- Text noting events cannot be edited or removed and that exporting is recorded (apps/web/features/settings/sections/WorkspaceAuditSection.tsx:137).
- Footer 'Showing the most recent N. Export to get every matching event.' (apps/web/features/settings/sections/WorkspaceAuditSection.tsx:330).
- Export query filters: actorUserId, action, resourceType, outcome, severity, from, to (apps/web/app/api/settings/organization/audit/export/route.ts:28-37).

**Journey**

1. Admin opens Audit; the page loads recent events with filters.
2. Admin presses 'Export JSONL'.
3. Server checks the caller, validates filters, reads the saved policy.
4. If policy refuses, a denied data_exported event is recorded and 403 returned with the policy reason.
5. Otherwise a success event is recorded first, then the file streams one JSON object per line.
6. The browser saves agi-audit-<organizationId>-<date>.jsonl.

**What the person sees and gets**

- JSONL file with Content-Type application/x-ndjson and no-store caching (apps/web/app/api/settings/organization/audit/export/route.ts:140-150).
- Refusal message from the policy evaluator reason (apps/web/app/api/settings/organization/audit/export/route.ts:88).
- 'The workspace audit trail is unavailable. Try again.' when the workspace trail cannot be written for an export (apps/web/lib/security-audit.ts:723-727).
- Role refusal: 'Your workspace role does not allow exporting the audit trail.' (apps/web/app/api/settings/organization/audit/export/route.ts:53).

**Settings**

- auditExportEnabled in the saved organization policy (apps/web/app/api/settings/organization/policy/route.ts:67, 261).
- Audit streaming destination and signing secret (apps/web/db/neon/0143_audit_event_streaming.sql; 0269_audit_destination_signing_secret.sql).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Audit writer with detail scrubbing, resource inference, domain event, product analytics and workspace trail (apps/web/lib/security-audit.ts:610-731).
- Billing events: checkout_started (apps/web/app/api/checkout/route.ts:563; apps/web/app/api/billing/top-up/route.ts:261), plan_changed (apps/web/app/api/upgrade/route.ts:398), refund_requested (apps/web/app/api/billing/refund-requests/route.ts:124), plus overage, auto-reload, downgrade-preview and resume-cancellation routes import the writer.
- Admin events: member_invited (apps/web/app/api/settings/team/invitations/route.ts:140), admin_api_key_created and admin_api_key_revoked, SCIM sync events (apps/web/lib/server/scim/scim-provisioning-service.ts:459, 493), usage promotions saves (apps/web/app/api/admin/usage-promotions/route.ts:82), operator grants as admin_action (apps/web/app/api/operator/route.ts).
- Export with audit.read, policy gate, denied event, success event before stream, truncation on stream failure (apps/web/app/api/settings/organization/audit/export/route.ts:50-155).
- An organization without a saved policy is allowed (apps/web/app/api/settings/organization/audit/export/route.ts:76-79).
- Immutability migrations and RLS (apps/web/db/neon/0043_audit_log_immutability.sql; 0170_security_audit_logs_row_level_security.sql).
- Audit coverage report route for admins (apps/web/app/api/admin/audit-coverage/route.ts).

**Incomplete**

- A failed write to security_audit_logs or the workspace trail is logged and swallowed unless the caller passes requireWorkspaceTrail (apps/web/lib/security-audit.ts:690-731). Only the export success path sets it in the files read.
- Billing events written outside request context lack IP and user agent (apps/web/app/api/stripe-webhook/lib/seats.ts: recordAuditEvent without request).

**Present but disconnected or switched off**

- none found

**Not available**

- Referral rewards, bonus credit grants and support ticket actions write no audit events (no recordAuditEvent in apps/web/lib/services/referral-service.ts, apps/web/app/api/stripe-webhook/lib/referral-events.ts, apps/web/lib/support/tickets/service.ts).
- Audit screens on desktop, mobile, CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- Commercial and administrative actions write durable audit events that can be queried later. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.28)
- Export needs audit.read and is refused by a saved organization policy; a refused export is recorded as denied; an organization without a policy is allowed. (source: apps/web/app/api/settings/organization/audit/export/route.ts:50-80)
- Security behaviour fails closed; validate at trust boundaries; collect minimum data. (source: AGENTS.md section 6)
- No silent failures in production code. (source: AGENTS.md section 9)

**Acceptance criteria**

1. A plain member or viewer is refused on the audit list and export.
2. With auditExportEnabled false, export returns 403 and a denied data_exported event exists.
3. With export allowed, a success data_exported event exists before the first byte of the file.
4. If the workspace trail cannot be written for an export, the export is refused with a 503.
5. A key scoped only for audit.read can export; a key without it is refused.
6. Audit rows cannot be updated or deleted by the application role.
7. Export filters from, to, outcome and severity narrow the file; a start after the end is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Audit write failures for ordinary actions do not block the action by design, since the writer returns normally after logging (apps/web/lib/security-audit.ts:690-731); this may conflict with 'no silent failures' and should be reviewed.
- [inferred] The brief says 'durable' and 'queried later', which the immutability and listing routes support.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make billing-money events (refund, plan change, seat change) write with requireWorkspaceTrail or a retry queue.
- [proposed] Add audit events for referral grants, clawbacks and support staff access.
- [proposed] Surface audit-write failures in an operator metric.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | recordAuditEvent | `apps/web/lib/security-audit.ts` | Single writer to both audit stores. |
| table | security_audit_logs | `apps/web/db/neon/0014_security.sql` | Account-level audit table. |
| table | enterprise_audit_events | `apps/web/db/neon/0076_enterprise_control_plane_tables.sql` | Workspace audit trail table. |
| schema | enterprise audit write function | `apps/web/db/neon/0087_enterprise_audit_event_writes.sql` | record_enterprise_audit_event database function. |
| schema | immutability | `apps/web/db/neon/0043_audit_log_immutability.sql` | Denies update and delete. |
| schema | immutability trigger | `apps/web/db/neon/0123_audit_log_immutability_trigger.sql` | Trigger form of the same rule. |
| endpoint | GET /api/settings/organization/audit | `apps/web/app/api/settings/organization/audit/route.ts` | List events for admins. |
| endpoint | GET /api/settings/organization/audit/export | `apps/web/app/api/settings/organization/audit/export/route.ts` | JSONL export with policy gate. |
| service | enterprise-audit-service | `apps/web/lib/services/enterprise-audit-service.ts` | Read and iterate events with filters. |
| service | compliance-caller | `apps/web/lib/server/compliance-caller.ts` | Member or workspace key caller for audit routes. |
| service | organization-policy-evaluator | `apps/web/lib/services/organization-policy-evaluator.ts` | audit_export decision with code audit_export_disabled. |
| endpoint | /api/settings/organization/policy | `apps/web/app/api/settings/organization/policy/route.ts` | Saves auditExportEnabled. |
| screen | WorkspaceAuditSection | `apps/web/features/settings/sections/WorkspaceAuditSection.tsx` | Audit trail page. |
| screen | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Audit export toggle. |
| component | WorkspaceAuditStreaming | `apps/web/features/workspace-console/components/WorkspaceAuditStreaming.tsx` | Streams audit events to a destination. |
| job | drain-audit-streams cron | `apps/web/app/api/cron/drain-audit-streams/route.ts` | Delivers queued audit stream events. |
| endpoint | /api/admin/audit-coverage | `apps/web/app/api/admin/audit-coverage/route.ts` | Reports which routes write audit events. |
| endpoint | /api/settings/audit-logs | `apps/web/app/api/settings/audit-logs/route.ts` | Personal audit log listing. |
| service | admin-data-access | `apps/web/lib/server/admin-data-access.ts` | Records admin reads such as usage export. |
| event | billing audit writers | `apps/web/app/api/upgrade/route.ts` | plan_changed after an upgrade. |
| event | refund request audit | `apps/web/app/api/billing/refund-requests/route.ts` | refund_requested. |
| event | stripe webhook audit | `apps/web/app/api/stripe-webhook/lib/seats.ts` | plan_changed warning for blocked seat expansion. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A route calls recordAuditEvent with event type, user, organization and detail; detail is scrubbed. | our servers | apps/web/lib/security-audit.ts:610-650 |
| The writer inserts into security_audit_logs. | our servers | apps/web/lib/security-audit.ts:676-690 |
| With an organization id, the writer calls record_enterprise_audit_event to add a workspace trail row; for exports a failure here throws a 503. | our servers | apps/web/lib/security-audit.ts:700-731 |
| Admin lists events or exports; the server resolves the caller, checks audit.read and the policy, records the export and streams the file in batches. | our servers | apps/web/app/api/settings/organization/audit/export/route.ts:50-155 |
| Optional streaming sends events to an external destination by a cron job. | our servers | apps/web/app/api/cron/drain-audit-streams/route.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audit events (type, severity, outcome, ip, user agent, endpoint, details) | table security_audit_logs | Server only | Immutable to the runtime role (apps/web/db/neon/0043_audit_log_immutability.sql); retention after organization deletion handled by 0167_retain_audit_events_after_organization_deletion.sql |
| Workspace audit events | table enterprise_audit_events | Server only; optional stream to a customer endpoint | Kept after organization deletion per migration 0167; exact period unknown |
| Exported file | Downloaded by the admin; not stored by the server | No | no-store caching |
| Product analytics copy of audited events | product analytics via trackAuditedProductEvent | Outside service, details not read | Unknown |

**Models and providers.** No model or inference provider takes part. Audit details are scrubbed of secrets before writing (apps/web/lib/security-audit.ts sanitizeAuditDetail); the analytics copy is an outside destination whose identity was not read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace member, or a workspace API key from an entitled workspace (apps/web/lib/server/compliance-caller.ts:36-100). |
| Permissions | audit.read for list and export (apps/web/app/api/settings/organization/audit/export/route.ts:50-54); keys must carry that scope; IP allow list applies to keys (apps/web/lib/server/compliance-caller.ts:70). |
| Subscription | Team, Team Premium or Enterprise through team_admin (apps/web/lib/server/compliance-caller.ts:60-67; packages/contracts/types/src/billing-catalog.ts:362). |
| Limits and metering | Rate limit settings-org on the routes (apps/web/app/api/settings/organization/audit/export/route.ts:46). Export streams without a row cap found in the route. |
| Feature flags | Organization policy auditExportEnabled; none other found. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable: the audit store is server-side for Cloud accounts. No on-device audit store for Local mode was found in the files read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Export disabled by policy | 403 with policy reason; denied event written. | apps/web/app/api/settings/organization/audit/export/route.ts:80-99 |
| No saved policy | Allowed. | apps/web/app/api/settings/organization/audit/export/route.ts:76-79 |
| Stream fails midway | Stream errors so the file is truncated rather than looking complete; logged. | apps/web/app/api/settings/organization/audit/export/route.ts:130-140 |
| Start after end | Validation error. | apps/web/app/api/settings/organization/audit/export/route.ts:68-70 |
| Audit write fails (non-export) | Logged 'Failed to record audit event'; the action continues. | apps/web/lib/security-audit.ts:690-694 |
| Workspace trail write fails for export | 503 'The workspace audit trail is unavailable. Try again.' | apps/web/lib/security-audit.ts:723-727 |
| Bearer token that is not a workspace key | Refused; no cookie fallback. | apps/web/lib/server/compliance-caller.ts:44-52 |
| Paging on the list route | Only the first page read is recorded. | apps/web/app/api/settings/organization/audit/__tests__/route.test.ts:152 |
| Offline or loading on the page | not handled in the code beyond standard hook states (not read in detail) | apps/web/features/settings/sections/WorkspaceAuditSection.tsx:75 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/audit/__tests__/route.test.ts`: List route: refuses member and viewer, serves admin and custom role, records first page only.
- `apps/web/app/api/settings/organization/audit/export/__tests__/route.test.ts`: Export route (file present; cases not read).
- `apps/web/lib/security-audit.test.ts`: Audit writer.
- `apps/web/__tests__/security/security-audit-severity.test.ts`: Severity rules.
- `apps/web/lib/services/__tests__/enterprise-audit-service.test.ts`: Reading and filters including denied outcome.
- `apps/web/db/neon/audit-log-immutability-migration.test.ts`: Immutability migration.
- `apps/web/db/neon/enterprise-audit-write-migration.test.ts`: Workspace trail write function.
- `apps/web/app/api/admin/audit-coverage/__tests__/route.test.ts`: Coverage report.
- `apps/web/lib/server/__tests__/compliance-caller.test.ts`: Key authentication used by audit routes.

**Test scenarios**

- **Policy off**
  1. Switch off 'Allow audit export' in Workspace policy.
  2. Press 'Export JSONL'.
  - Expected: Refused; the audit list shows a data_exported event with outcome denied.
- **Policy on**
  1. Switch the toggle on and export.
  - Expected: File downloads; a success data_exported event appears with warning severity.
- **Filtered export**
  1. Export with outcome=denied and a from and to range.
  - Expected: Only matching events are in the file.
- **Key scope**
  1. Call the export route with a key lacking audit.read.
  - Expected: Refused naming the missing scope.
- **Money action recorded**
  1. Upgrade a plan in a test account; open the audit list.
  - Expected: A plan_changed event for the actor appears.
- **Tamper attempt**
  1. Try an UPDATE on security_audit_logs as the runtime role in a test database.
  - Expected: Denied.

**Where to look when it fails**

- Log 'Failed to record audit event' and 'Failed to record enterprise audit event' (apps/web/lib/security-audit.ts:692, 715).
- Log '[audit-export] stream failed mid-export' (apps/web/app/api/settings/organization/audit/export/route.ts).
- Tables security_audit_logs and enterprise_audit_events; admin coverage route.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Audit write failures are swallowed for most events.** Affects: Web admins and compliance.. Evidence: apps/web/lib/security-audit.ts:690-694, 715-730.. Work needed: Decide which events must fail closed or retry.
- **Referral rewards, bonus credit grants and support ticket staff actions write no events.** Affects: Finance and compliance.. Evidence: No recordAuditEvent in apps/web/lib/services/referral-service.ts, referral-events.ts or lib/support/tickets/service.ts.. Work needed: Add events.
- **No audit viewing outside web.** Affects: Desktop, mobile, CLI, VS Code, Chrome.. Evidence: No client code found.. Work needed: Link to web if needed.
- **Retention period of audit rows is not stated in files read.** Affects: Compliance.. Evidence: Migration 0167 name only.. Work needed: Read and record.
- **The brief cites security-audit.ts:641 for 'commercial actions write audit events'; that line is inside the generic writer, not a billing list.** Affects: Documentation.. Evidence: apps/web/lib/security-audit.ts:610-650.. Work needed: Update the brief.

**Depends on**

- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- surface:web
- mode:cloud
- table:security_audit_logs
- table:enterprise_audit_events
- F100-08

## Unknown

- Retention period of security_audit_logs and enterprise_audit_events.
- What the export route test cases cover.
- Which product analytics destination receives the audited-event copy.
- Whether any billing routes beyond those listed omit audit events.
