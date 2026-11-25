---
id: "F089-12"
type: "feature"
title: "Support staff access to customer data"
aliases: ["Administrative access service (S89.24)", "Break-glass access", "Support access grants", "Support access", "Operator access to customer data"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.24"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "mode:cloud", "surface:web", "table:support_access_grants", "table:support_access_events", "file:apps/web/lib/server/support-access-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-12 Support staff access to customer data

Platform staff can read a workspace's data only under a grant that has a reason, a ticket, a purpose, named scopes, a limited window and approval by a second operator. Every request, decision, read, refusal and expiry is written to a hash-chained trail the workspace can read.

Area: [89. Account and access components](README.md). Requirement items: [S89.24](../../10-requirements/capabilities/089-account-and-access-components.md#s8924).

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

**What it does.** Provides request, approve, deny and revoke actions on support access grants, a gate that refuses reads no live grant covers, an expiry sweep, and a verifier for the hash chain (apps/web/app/api/admin/support-access/route.ts; apps/web/lib/server/support-access-service.ts).

**Why it exists.** Customers must be able to trust that staff cannot read their data without their knowledge; the brief requires a recorded reason, second operator, time limit and logging (S89.24; doc: docs/compliance/soc2-controls.json AC-04).

**Who uses it.** Platform operators on the allow-list, workspace owners and admins who read their own grants and events, and auditors.

**Problems it solves**

- One person granting themselves access: refused in code and by a database constraint (support-access-service.ts:489-491 area; migration 0229).
- Open-ended access: the window defaults to one hour and is capped at eight hours (support-access-service.ts:58-59).
- Edited logs: each event hashes the previous one, so removal or edits are detectable (support-access-service.ts:342-369).
- Silent refusals: a refused read is recorded before the error (support-access-service.ts:705-726).

**Use cases**

- An operator opens a ticket-based grant to read a workspace's conversations to debug an issue; a colleague approves for one hour.
- A security investigation grant allows reading data that a normal support grant withholds (Google user data).
- An operator lists background jobs across workspaces and sees content only for workspaces a live grant covers.
- An auditor verifies the trail for a workspace.

## 2. User experience

**Where to find it**

- Web admin API only: GET and POST /api/admin/support-access (apps/web/app/api/admin/support-access/route.ts:94-215). No admin screen for it was found by search [inferred].
- Workspace owners and admins read their own grants and events through database row policies (apps/web/db/neon/0229_support_access_grants.sql header comment); a screen for this was not found.
- Desktop, mobile, CLI, VS Code and Chrome: none.

**Before you start**

- The caller's id is on the platform operator allow-list set by the PLATFORM_ADMIN environment setting; otherwise every platform-admin surface answers 404 (apps/web/lib/auth-guards.ts:26-50).
- A desktop device token is refused for this surface (auth-guards.ts:40-42).
- CSRF token and rate limit 'admin-security' on writes (route.ts:96-100).

**Screens and controls**

- Request body: action 'request', organizationId, reason (at least 20 characters), ticketRef (3 to 128 characters), purpose (support, security, abuse, legal, customer_consent), scopes (conversations, files, projects, connectors, billing, audit_logs, workspace_settings, background_jobs) (route.ts:34-41; support-access-service.ts:14-34,61-64).
- Decision body: action approve, deny or revoke, grantId, optional ttlMs up to eight hours (route.ts:43-47).
- List query: organizationId, status, limit, and action=verify to check the trail (route.ts:94-135).

**Journey**

1. 1. Operator A posts action 'request' with reason, ticket, purpose and scopes; a pending grant and a 'requested' event are written; response 201.
2. 2. Operator B posts action 'approve'; the server refuses if B is the requester, sets the expiry as the smaller of the chosen window and eight hours from the request, and appends 'approved'.
3. 3. While the grant is live, the gate allows reads in its scopes for operator A only; each read appends an 'accessed' event with row count.
4. 4. The grant ends by expiry sweep (cron route), revoke, or deny; the trail records it.
5. 5. Anyone may verify the chain with GET action=verify.

**What the person sees and gets**

- 201 with the grant on request; the grant object includes status, requested_by, approved_by, expires_at (route.ts:76-90).
- Error 'A break-glass grant needs a second operator: the requester cannot approve their own access.' (support-access-service.ts:489-491).
- Refusal text: 'Support access to workspace ... for "scope" is refused: no approved, unexpired grant covers it. Request a break-glass grant and have a second operator approve it.' (support-access-service.ts:100-110, 726).
- Audit events 'admin_policy_changed' with resourceType support_access_grant, and 'data_accessed' for each read (route.ts:167-181; admin-data-access.ts:24-37).

**Settings**

- Default window one hour, maximum eight hours (support-access-service.ts:58-59).
- Minimum reason length 20 characters (support-access-service.ts:60).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Request, approve, deny, revoke, list, verify routes with platform-admin gating (support-access/route.ts).
- Second-operator rule in code and in a database check constraint (support-access-service.ts:473-491; migration 0229 constraints support_access_grants_needs_a_second_approver).
- Expiry written only on approval, capped by the requested time plus eight hours (support-access-service.ts:497-505).
- Hash chain with versioned digest and canonical JSON, verifier, legacy digest support (support-access-service.ts:342-400).
- Expiry sweep in batches of 100, idempotent, per-grant failures counted (support-access-service.ts:598-650); cron route /api/cron/expire-support-access-grants scheduled in vercel.json.
- The gate refuses and records a read that no live grant covers (support-access-service.ts:705-726).
- Operator listing of background jobs serves content only for workspaces under a live grant and withholds Google user data unless the purpose allows it (support-access-service.ts:785-830; apps/web/app/api/admin/background-jobs/route.ts:25).
- Key custody for customer-managed encryption requires a support-access check (apps/web/lib/crypto/cmek.ts:32; organization-encryption-keys.ts:318-330).

**Incomplete**

- Only the background-jobs listing and the customer-managed key path were found calling the gate; other operator reads were not traced, so coverage of 'every read' is not established. A repository script scripts/check-support-access-coverage.mjs is named in the control mapping but was not opened.
- logAdminDataAccess catches and logs failures to write the audit and trail entries instead of failing the read (apps/web/lib/server/admin-data-access.ts:38-60); whether a read can then happen without a log entry depends on the caller.

**Present but disconnected or switched off**

- The control is marked 'not-yet-operated' because one operator cannot both request and approve (doc: docs/compliance/soc2-controls.json AC-04 gap).

**Not available**

- No screen for customers or operators; no use on any user-facing app.

## 4. Required behaviour

**Established requirements**

- Administrative access to customer data requires a recorded reason, a second operator's approval, a time limit, and is logged. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S89.24)
- Approval by the requester is refused. (source: apps/web/lib/server/support-access-service.ts:489-491)
- The window defaults to one hour and is at most eight hours. (source: apps/web/lib/server/support-access-service.ts:58-59,214-226)
- Expired grants move to an expired state in the trail. (source: apps/web/lib/server/support-access-service.ts:598-625)
- Each event is written to a hash chain. (source: apps/web/lib/server/support-access-service.ts:342-369)
- Every grant creation writes an audit event; each data read is also recorded. (source: apps/web/app/api/admin/support-access/route.ts:167-181; apps/web/lib/server/admin-data-access.ts:24-50)
- Operator access to a workspace's data requires a grant the workspace can see in a hash-chained trail. (source: doc: docs/compliance/soc2-controls.json AC-04)

**Acceptance criteria**

1. A request with a reason shorter than 20 characters is refused.
2. The requester approving their own grant is refused.
3. An approved grant's expiry is never more than eight hours after the request.
4. A read under no live grant throws SupportAccessDeniedError and writes a 'refused' event first.
5. A read by another operator using a colleague's grant is refused.
6. After revoke or expiry the same read is refused.
7. Changing any trail row makes verify report the broken entry.
8. Unapproved background-job listing shows no content for a workspace without a grant.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Support access applies to Cloud data only; Local data never reaches the servers [inferred].
- Workspace-visible trail depends on row policies in migration 0229 [inferred from its header].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a workspace-facing screen listing grants and events.
- [proposed] Make a failed trail append fail the read for operator reads, not only log it.
- [proposed] Resolve the single-operator limitation recorded in the control register before claiming operation.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | support-access-service | `apps/web/lib/server/support-access-service.ts` | Grants, approval, gate, hash chain, expiry sweep, content filter |
| endpoint | /api/admin/support-access (GET, POST) | `apps/web/app/api/admin/support-access/route.ts` | Request, approve, deny, revoke, list, verify |
| service | admin-data-access | `apps/web/lib/server/admin-data-access.ts` | Audit record per admin read and trail append |
| service | auth-guards requirePlatformAdmin | `apps/web/lib/auth-guards.ts` | Operator allow-list and desktop-token refusal |
| job | expire-support-access-grants | `apps/web/app/api/cron/expire-support-access-grants/route.ts` | Runs the expiry sweep |
| endpoint | /api/admin/background-jobs | `apps/web/app/api/admin/background-jobs/route.ts` | Operator listing using readOperatorContentUnderGrants |
| service | organization-encryption-keys | `apps/web/lib/server/organization-encryption-keys.ts` | Customer-managed key use passes assertSupportAccess |
| service | cmek | `apps/web/lib/crypto/cmek.ts` | Refuses when no support gate is wired |
| table | support_access_grants | `apps/web/db/neon/0229_support_access_grants.sql` | Grants with second-approver and time-box constraints |
| table | support_access_events | `apps/web/db/neon/0229_support_access_grants.sql` | Append-only hash-chained trail |
| config | PLATFORM_ADMIN allow-list setting | `apps/web/lib/auth-guards.ts` | Names who is an operator (value not recorded) |
| config | cron schedule | `vercel.json` | Schedule for expire-support-access-grants |
| service | security-audit | `apps/web/lib/security-audit.ts` | recordAuditEvent for grant changes and data reads |
| config | break-glass runbook | `docs/runbooks/break-glass-production-access.md` | Operating procedure named in the control register |
| config | coverage guard | `scripts/check-support-access-coverage.mjs` | Repository guard named in the control register (not opened) |
| test | support-access-service.test.ts | `apps/web/lib/server/support-access-service.test.ts` | Request, approval, gate, expiry, chain, operator listing |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Operator A calls POST with action 'request'; the server validates and writes a pending grant and a trail event. | our servers | apps/web/app/api/admin/support-access/route.ts:141-181 |
| Operator B calls approve; a transaction locks the grant, refuses the requester, sets the expiry and appends 'approved'. | our servers | support-access-service.ts:473-520 |
| A support read calls the gate, which looks up a live grant for that operator, workspace and scope. | our servers | support-access-service.ts:690-730 |
| With a grant the read proceeds and an 'accessed' event with row count is appended. | our servers | admin-data-access.ts:45-54 |
| A scheduled job closes lapsed grants as 'expired' with an event. | our servers | support-access-service.ts:598-650 |
| A verifier recomputes the chain per workspace. | our servers | support-access-service.ts (verifySupportAccessTrail); route.ts:122-131 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Grant rows: reason, ticket, purpose, scopes, requester, approver, status, times | table support_access_grants | No | Kept; trail has no foreign keys so it outlives the grant and workspace (migration 0229 header) |
| Trail events with previous_hash and entry_hash | table support_access_events | Readable by workspace owners and admins | Append-only; update and delete refused by trigger |
| Workspace audit events data_accessed | security audit log | No | purge-security-audit-logs cron applies |

**Models and providers.** No model or provider takes part. Google user data is withheld unless the grant purpose is security, abuse, legal or customer consent (support-access-service.ts:36-48).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in operator whose id is on the platform allow-list; not available to ordinary users. |
| Permissions | Platform operator; the approver must differ from the requester. |
| Subscription | No plan gate found; it is an internal control and applies to all workspaces. |
| Limits and metering | Window one hour default, eight hours maximum; at most 100 grants per page and 100 expiry closures per sweep (support-access-service.ts:62-64); rate limit 'admin-security'. |
| Feature flags | none found. The tenant lockdown flag is separate. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found. |
| Local mode | Local mode data never reaches our servers, so this service cannot read it [inferred]. Own-key mode and Cloud data stored on our servers fall under the grant rules. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Approve a non-pending grant | Request error naming its status | support-access-service.ts:479-484 |
| Requester approves | Refused | support-access-service.ts:485-491 |
| Window too long | Refused; expiry also capped in SQL | support-access-service.ts:214-226,497-505 |
| Grant lapsed | Gate refuses; sweep marks expired | support-access-service.ts:598-650 |
| Trail append fails when serving a listing | Workspace served without content | support-access-service.test.ts:954 |
| Trail append fails for a data read through admin-data-access | Logged only; the read is not stopped there | admin-data-access.ts:55-60 |
| Database unavailable | 503 'Database temporarily unavailable' | support-access/route.ts failure() |
| Offline, retry, accessibility | not handled in the code; API only | n/a |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/support-access-service.test.ts`: Request validation, second-operator approval, TTL cap, gate refusals, scope and operator mismatch, revoke and expiry, sweep batching, hash chain verification, operator listing under grants

**Test scenarios**

- **Self approval**
  1. Request as operator A
  2. Approve as A
  - Expected: Refused with the second-operator message
- **Window cap**
  1. Approve with ttlMs above eight hours
  - Expected: Refused by schema or capped
- **No grant read**
  1. Call a gated read with no grant
  - Expected: Denied error and a 'refused' event
- **Expiry**
  1. Approve a grant
  2. Advance past expiry
  3. Run the sweep route
  - Expected: Status expired, event appended, read refused
- **Tamper**
  1. Alter one trail row in a test database
  2. GET action=verify
  - Expected: Broken entry reported
- **Operator allow-list**
  1. Call the route as a non-operator
  - Expected: 404

**Where to look when it fails**

- Tables support_access_grants, support_access_events.
- Log 'Support access refusal could not be appended to the break-glass trail', 'Support data access could not be appended to the break-glass trail', 'Support access grant could not be closed as expired'.
- Error class SupportAccessDeniedError; verify route output.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Only one operator exists, so the two-person rule cannot operate** Affects: Compliance claims. Evidence: doc: docs/compliance/soc2-controls.json AC-04 gap text. Work needed: Add a second operator or change the control.
- **Coverage of 'every read' is not demonstrated: only the background-jobs listing and the customer-managed key path were found using the gate** Affects: Customers' workspaces. Evidence: Search for assertSupportAccess and readOperatorContentUnderGrants usage. Work needed: Open the coverage script and map each operator read.
- **Failure to log a read through logAdminDataAccess does not stop the read** Affects: Audit completeness. Evidence: apps/web/lib/server/admin-data-access.ts:38-60. Work needed: Decide fail-closed for operator reads.
- **No customer-facing screen to see grants and trail** Affects: Workspace owners and admins on every app. Evidence: No UI file found by search. Work needed: Design and build a view.

**Depends on**

- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- mode:cloud
- surface:web
- table:support_access_grants
- table:support_access_events
- file:apps/web/lib/server/support-access-service.ts

## Unknown

- Whether other operator reads beyond background-jobs and customer-managed keys pass the gate; scripts/check-support-access-coverage.mjs was not opened.
- The exact line numbers for some cited functions differ slightly from the draft; the cited ranges were read from the opened file.
- Whether any operator screen exists.
- Row policy details for customer reads of the trail.
- The PLATFORM_ADMIN setting's real value is not recorded and was not read.
