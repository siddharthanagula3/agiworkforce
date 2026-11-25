---
id: "F087-05"
type: "feature"
title: "Service accounts and admin API keys"
aliases: ["Workspace API keys", "Admin API keys", "Service principals", "Service accounts", "API keys (Audit page)", "Administrative API access", "admin key prefix", "S87.12", "S87.40", "WorkspaceApiKeys", "WorkspaceServicePrincipals"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.12", "S87.40"]
depends_on: ["surface:web", "surface:desktop", "plan:team", "plan:enterprise", "api:GET /api/settings/organization/admin-api-keys", "api:POST /api/settings/organization/admin-api-keys", "api:DELETE /api/settings/organization/admin-api-keys", "api:PATCH /api/settings/organization/service-principals", "table:organization_admin_api_keys", "table:organization_service_principals", "SYS-authorization-and-workspaces", "SYS-api-and-contracts", "SYS-security-and-privacy", "F087-02", "F087-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-05 Service accounts and admin API keys

Admins create workspace API keys for automations. Each key belongs to a service principal (a non-human account), carries limited scopes and an optional expiry up to one year, is shown once, and can be revoked. Disabling a principal stops all its keys. Keys can reach only a short list of admin endpoints.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.12](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8712), [S87.40](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8740).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Mints keys whose secret begins with a fixed admin-key prefix, stores only a hash, binds each key to a principal whose maximum scopes cap what the key can do on every call, and lets automations read the audit trail, list and manage members and invitations, and read usage (admin-api-keys.ts:19,108-130,191-235; route-access.ts:24-114).

**Why it exists.** Automations need administrative access that does not depend on one person's login and can be limited and revoked.

**Who uses it.** Owners and admins with identity.manage (create, revoke, disable); automations as callers.

**Problems it solves**

- Scripts using a person's session.
- Keys that die when their creator leaves.
- Over-broad automation access.

**Use cases**

- Nightly job exports the audit trail to a SIEM or archive.
- HR system invites and removes member and viewer accounts.
- Finance reads the per-member usage report.
- Admin disables a principal after an incident.

## 2. User experience

**Where to find it**

- Web: key panel titled 'Workspace API keys' sits at the bottom of the console Audit page (/workspace/audit) (audit/page.tsx:23).
- Web: 'Service principals' panel on the Identity page (WorkspaceIdentityPanels.tsx:73).
- Desktop: hosted web pages [inferred].
- Mobile, CLI, VS Code, Chrome: not available.

**Before you start**

- Team or Enterprise plan (admin-api-keys/route.ts:78-83; compliance-caller.ts:62-66).
- identity.manage to create or revoke; identity.read to list (admin-api-keys/route.ts:91-116).
- Fresh identity confirmation (step-up) to create a key (admin-api-keys/route.ts:140-146).

**Screens and controls**

- Create form: 'Key name' (aria 'Workspace API key name'), expiry select '30 days', '90 days', '1 year', 'No expiry', 'Permissions' checkboxes limited to scopes the creator holds (WorkspaceApiKeys.tsx:37-42,250-300).
- Key rows with revoke; confirm 'Revoke "<name>"?' with button 'Revoke key' (WorkspaceApiKeys.tsx:181-186).
- Principal rows with 'Enable' or 'Disable' and confirm 'Disable principal' (WorkspaceServicePrincipals.tsx:154-157).

**Journey**

1. Open Audit, scroll to 'Workspace API keys'.
2. Enter a name, pick an expiry and permissions, create; complete identity confirmation.
3. Copy the key from the one-time notice into the automation.
4. Call a permitted endpoint with the key as a bearer token.
5. To stop it: 'Revoke key', or 'Disable' the principal on the Identity page.

**What the person sees and gets**

- One-time key notice; empty states 'No workspace API keys' and 'No service principals yet. One is created with the first workspace API key.'
- Errors such as 'A key cannot carry a permission you do not hold or that only the Primary Owner has'.
- Revoked key listed with revoked time.

**Settings**

- Expiry choices 30, 90, 365 days or none; API allows 1 to 365 days or null (admin-api-keys/route.ts:50).
- Principal maximum scopes act as a ceiling.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Key creation with scope checks, step-up, optional idempotency key, principal minting or reuse, critical audit event (admin-api-keys/route.ts:104-180).
- Key verification: hash lookup, not revoked, not expired, principal not disabled, scopes cut to the principal ceiling, last-used stamped (admin-api-keys.ts:191-235).
- Route access table: only listed routes and methods are open to keys; one route is members-only (route-access.ts:24-114).
- Keys also require the workspace to be on Team or Enterprise and pass the IP allow-list check (compliance-caller.ts:62-71).
- Key may assign only member and viewer roles and act only on members with no admin permissions (organization-member-admin-service.ts:62,97-134).
- Revocation and principal disable endpoints with audit (admin-api-keys/route.ts:244-298; service-principals/route.ts:51-90).

**Incomplete**

- Keys can be created with no expiry ('No expiry' option; schema nullable), so 'keys expire' is not guaranteed (admin-api-keys/route.ts:50; WorkspaceApiKeys.tsx:41).

**Present but disconnected or switched off**

- None found.

**Not available**

- Service principals cannot be created on their own in the UI; one is made with its first key (WorkspaceServicePrincipals.tsx:187).
- CLI, mobile: none.

## 4. Required behaviour

**Established requirements**

- An administrator creates non-human service accounts with bounded permissions and keys that outlive their creator, and can disable them or revoke their keys. (source: S87.12 Should)
- An administrator issues scoped, expiring API keys for automations through a documented API, and can revoke them. (source: S87.40 Should)
- Workspace API keys require an active Team or Enterprise subscription. (source: apps/web/lib/server/compliance-caller.ts:62-66 (code))

**Acceptance criteria**

1. A key created by an admin still works after that admin is removed from the workspace.
2. A revoked key returns 401 on its next call.
3. A key whose principal is disabled returns 401; enabling restores it.
4. A key asking for a scope its creator does not hold is refused at creation.
5. A key cannot call an endpoint missing from the access table or the members-only endpoint.
6. A key cannot assign admin roles.
7. An expired key returns 401.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- 'Expiring' is only optional today; the brief's Should says expiring [inferred gap].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Require an expiry, or warn on 'No expiry'.
- [proposed] Let admins create a principal without a key.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | WorkspaceApiKeys | `apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx` | Key list, create form, revoke. |
| component | WorkspaceServicePrincipals | `apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx` | Principals list, disable and enable. |
| screen | Audit page | `apps/web/app/workspace/audit/page.tsx` | Hosts the key panel. |
| endpoint | /api/settings/organization/admin-api-keys | `apps/web/app/api/settings/organization/admin-api-keys/route.ts` | GET list, POST create, DELETE revoke. |
| endpoint | /api/settings/organization/service-principals | `apps/web/app/api/settings/organization/service-principals/route.ts` | GET list, PATCH disable or enable. |
| service | admin-api-keys | `apps/web/lib/server/admin-api-keys.ts` | Generate, hash, verify, revoke. |
| service | service-principal | `apps/web/lib/server/service-principal.ts` | Principal storage and scope ceiling. |
| config | WORKSPACE_ROUTE_ACCESS | `apps/web/lib/server/service-principals/route-access.ts` | Table of routes open to keys. |
| service | resolveWorkspaceApiCaller | `apps/web/lib/server/service-principals/caller.ts` | Member or key resolution against the table. |
| service | resolveComplianceCaller | `apps/web/lib/server/compliance-caller.ts` | Bearer key verification, plan and IP checks. |
| service | organization-member-admin-service | `apps/web/lib/services/organization-member-admin-service.ts` | Limits what keys can do to members. |
| service | workspace-usage-report-service | `apps/web/lib/services/workspace-usage-report-service.ts` | Usage report read by keys. |
| endpoint | Audit read and export | `apps/web/app/api/settings/organization/audit/route.ts` | Endpoint open to keys with audit.read. |
| table | organization_admin_api_keys | `apps/web/db/neon/0206_organization_admin_api_keys.sql` | Key hash, scopes, expiry, revocation. |
| table | organization_service_principals | `apps/web/db/neon/0245_admin_write_idempotency_and_service_principals.sql` | Principal and its ceiling. |
| service | step-up-auth | `apps/web/lib/server/step-up-auth.ts` | Fresh identity confirmation on key creation. |
| service | idempotency | `apps/web/lib/server/idempotency.ts` | Safe retry of key creation. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin submits name, scopes, expiry; the route checks plan, identity.manage and that each scope is held by the creator and grantable. | our servers | admin-api-keys/route.ts:104-135 |
| Step-up confirmation is required, then a transaction finds or creates the principal and inserts the key hash. | our servers | admin-api-keys/route.ts:140-166 |
| The raw key is returned once; only a SHA-256 hash is stored. | our servers | admin-api-keys.ts:98-100,148-160 |
| The automation calls an endpoint with the bearer key; the key is verified, plan and IP allow-list checked, scope compared to the route table. | our servers | compliance-caller.ts:41-85; caller.ts:39-60 |
| Revoke sets revoked_at; principal disable makes verification fail. | our servers | admin-api-keys.ts:175-189; admin-api-keys.ts:212 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Key record (prefix, hash, scopes, expiry, last used, revoked) | table organization_admin_api_keys | Server only | Revoked keys stay listed; deletion not found |
| Service principal (name, max scopes, disabled time) | table organization_service_principals | Server only | Kept after the creator leaves |
| Audit events admin_api_key_created and admin_api_key_revoked | audit trail | Server only | Per audit retention |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Interactive: signed-in owner or admin. Automation: bearer key beginning with the admin-key prefix. |
| Permissions | identity.read to list, identity.manage to create or revoke or disable; scopes bounded by creator permissions and the principal ceiling; Primary Owner only permissions excluded (admin-api-keys.ts:108-130). |
| Subscription | Team, Team premium or Enterprise; checked again on every key call (compliance-caller.ts:62-66). |
| Limits and metering | 1 to 16 scopes, name up to 120 characters, lifetime up to 365 days or none; rate-limit buckets settings-org and settings-org-patch. No usage metering found. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable; these are cloud administration keys, unrelated to Local inference. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | 'No workspace API keys' and 'No service principals yet.' | WorkspaceApiKeys.tsx:225; WorkspaceServicePrincipals.tsx:187 |
| Read-only viewer | Create form hidden when identity.manage is missing (canManageKeys). | admin-api-keys/route.ts:98; WorkspaceApiKeys.tsx:250 |
| Principal disabled | Issuing a key refused until re-enabled. | admin-api-keys/route.ts:225-229 |
| Key invalid, expired or revoked | 401 'invalid, expired or revoked'. | compliance-caller.ts:58-60 |
| Retry of create | Idempotency key replays without a second key. | admin-api-keys/route.ts:182-200 |
| Key on a members-only route | 403 'not available to workspace API keys'. | caller.ts:46-52 |
| Session cookie with a bearer header | Refused; the cookie is not used for automations. | compliance-caller.ts:49-56 |
| Offline / timeout | not handled in the code beyond errors. | searched WorkspaceApiKeys.tsx and the key routes; no offline or timeout handling found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/admin-api-keys/__tests__/route.test.ts`: Key route.
- `apps/web/app/api/settings/organization/service-principals/__tests__/route.test.ts`: Principal route.
- `apps/web/lib/server/service-principals/__tests__/route-access.test.ts`: Access table.
- `apps/web/lib/server/__tests__/compliance-caller.test.ts`: Caller resolution.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceApiKeys.test.tsx`: Key UI.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceServicePrincipals.test.tsx`: Principal UI.
- `apps/web/lib/services/__tests__/organization-member-admin-service.test.ts`: Key limits on member changes.

**Test scenarios**

- **Key outlives creator**
  1. Admin A creates a key.
  2. Remove A from the workspace.
  3. Call the audit endpoint with the key.
  - Expected: Call still succeeds.
- **Revoke**
  1. Revoke the key.
  2. Call again.
  - Expected: 401.
- **Disable principal**
  1. Disable the principal on Identity.
  2. Call with its key, then enable and retry.
  - Expected: 401 then success.
- **Scope limit**
  1. Create a key with only audit read.
  2. Call member removal.
  - Expected: 403.
- **Role limit**
  1. With a members key PATCH a member to admin.
  - Expected: 403 saying only member and viewer can be assigned.
- **Downgrade**
  1. Move the workspace off Team/Enterprise.
  2. Call with a valid key.
  - Expected: 403 subscription required.

**Where to look when it fails**

- Audit events admin_api_key_created, admin_api_key_revoked; last_used_at on the key row.
- Error text 'This workspace API key is invalid, expired or revoked.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **'No expiry' allowed, though the brief says expiring keys.** Affects: Admins, security reviewers. Evidence: admin-api-keys/route.ts:50; WorkspaceApiKeys.tsx:41. Work needed: Decide policy: require expiry or flag.
- **Principals cannot be created without a key.** Affects: Admins. Evidence: WorkspaceServicePrincipals.tsx:187. Work needed: Optional.
- **API reference location for the scopes not verified.** Affects: Integrators. Evidence: WorkspaceApiKeys.tsx text links to an API reference; target not opened. Work needed: Verify the doc exists.
- **No CLI, mobile support.** Affects: CLI. Evidence: no references. Work needed: Product decision.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- plan:team
- plan:enterprise
- api:GET /api/settings/organization/admin-api-keys
- api:POST /api/settings/organization/admin-api-keys
- api:DELETE /api/settings/organization/admin-api-keys
- api:PATCH /api/settings/organization/service-principals
- table:organization_admin_api_keys
- table:organization_service_principals
- SYS-authorization-and-workspaces
- SYS-api-and-contracts
- SYS-security-and-privacy
- F087-02
- F087-01

## Unknown

- Whether a public API reference page lists the scopes.
- Deletion or archive policy for revoked keys.
- What the IP allow-list check does for keys beyond the call seen (ip-allow-list-gate.ts not opened).
- Test assertions were not opened.
