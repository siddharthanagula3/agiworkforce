---
id: "F105-03"
type: "feature"
title: "Service accounts (workspace admin)"
aliases: ["Service principals", "Service accounts", "Workspace API keys", "admin API keys", "Identity page service principals card", "S105.03"]
area: "105 Developer platform and console"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.03"]
depends_on: ["surface:web", "surface:desktop", "table:organization_service_principals", "table:admin_request_idempotency", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "plan:team", "plan:enterprise"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-03 Service accounts (workspace admin)

In a shared workspace, an admin can see non-human service identities that own workspace API keys, and disable or re-enable them. Disabling stops all of its keys at once. A principal is created by issuing a workspace key without naming one. Workspace keys carry workspace permissions, not model-gateway scopes.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.03](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10503).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows a 'Service principals' card on the workspace Identity page and a 'Workspace API keys' card on the workspace audit page. A workspace admin can issue and revoke workspace API keys, each owned by a service principal that is bounded by a ceiling of workspace permissions, and can disable or enable a principal (apps/web/app/api/settings/organization/admin-api-keys/route.ts:106-208; apps/web/app/api/settings/organization/service-principals/route.ts:51-86).

**Why it exists.** Automations such as audit export or member sync need credentials that outlive any one person and can be switched off together (apps/web/lib/server/service-principal.ts:27-31, 100-110 comments; doc: area brief S105.03).

**Who uses it.** A workspace admin or owner on a Team or Enterprise workspace.

**Problems it solves**

- Keys tied to a departed employee stop working.
- One switch stops an automation whose keys live in many systems.
- Keys cannot exceed the permissions of the principal or the creator.

**Use cases**

- Issue a key that only reads the audit trail for a compliance export job.
- Disable a principal during an incident and enable it after.
- Narrow a principal's ceiling so keys already issued lose reach.

## 2. User experience

**Where to find it**

- Web: workspace console page /workspace/identity titled 'Identity' shows the card 'Service principals' (apps/web/app/workspace/identity/page.tsx; apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:73).
- Web: card 'Workspace API keys' is on /workspace/audit (apps/web/app/workspace/audit/page.tsx:5, 23).
- Desktop: brief says done; same hosted pages expected [inferred from doc: AGENTS.md section 5]; not opened.
- CLI, VS Code, Chrome, Mobile: none found.

**Before you start**

- Signed in and switched to a shared workspace; a personal workspace shows a message to switch (WorkspaceIdentityPanels.tsx before line 60).
- Team or Enterprise subscription for team administration (apps/web/app/api/settings/team/team-admin-access.ts:70-88 requires an active Team or Enterprise subscription).
- Role holding identity.read to view and identity.manage to create, revoke, disable or enable (admin-api-keys/route.ts:85-91, 113-118; service-principals/route.ts:44).

**Screens and controls**

- 'Service principals' card: text 'Non-interactive actors, limited by their keys. They can reach only: <routes>.'; rows with name, permissions list, 'Created <time>', 'Disabled <time>'; button 'Disable' or 'Enable' (WorkspaceServicePrincipals.tsx:173-222).
- Confirm 'Disable "<name>"?' with button 'Disable principal' (WorkspaceServicePrincipals.tsx:153-160).
- 'Workspace API keys' card: 'Workspace API key name' field, expiry select (30 days, 90 days, 1 year, No expiry), scope checkboxes, button 'Create key', row button 'Revoke', confirm 'Revoke key' (WorkspaceApiKeys.tsx:37-41, 133, 185, 254-323).

**Journey**

1. Open Workspace, then Audit, and use 'Workspace API keys' to create a key; a principal is minted with it (admin-api-keys/route.ts:225-232).
2. Complete the fresh sign-in check; copy the key shown once.
3. Open Identity and read the new principal in 'Service principals'.
4. Choose 'Disable', confirm; the principal's keys stop at once.
5. Choose 'Enable' (no confirmation) to restore the same keys.

**What the person sees and gets**

- Empty text 'No service principals yet. One is created with the first workspace API key.' (WorkspaceServicePrincipals.tsx:187).
- Button shows 'Saving…' while a change is pending (line 220).
- Errors: 'We could not load service principals' with 'Try again' (lines 115-128).
- Server refusals: 'This service principal is disabled. Re-enable it before issuing a key.' (admin-api-keys/route.ts:239-241); 'The service principal "<name>" does not allow: <scopes>.' (245-249); role messages (89, 117, 265).

**Settings**

- Key lifetime 1 to 365 days or none (admin-api-keys/route.ts:43-52).
- Rate limits settings-org and settings-org-patch (route files).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- List principals with their ceiling and state (service-principals/route.ts:37-49).
- Disable and enable through PATCH, interactive members only, with an audit event admin_policy_changed (service-principals/route.ts:51-86).
- A disabled principal's keys fail verification (apps/web/lib/server/admin-api-keys.ts:208-212).
- Key scopes are bounded by the principal's ceiling on every call, not only at creation (admin-api-keys.ts comment near line 213-216).
- Create a workspace key: scopes must be permissions the creator holds; step-up required; idempotency key supported; principal and key written in one transaction (admin-api-keys/route.ts:122-207).
- Revoke a workspace key with audit event admin_api_key_revoked (route.ts:254-295).
- Create audit includes subjectRef service_principal:<id> (route.ts:180).

**Incomplete**

- There is no standalone 'create service principal' control or route; a principal exists only as the owner of a key (route.ts:225-232; service-principals route exports GET and PATCH only, line 88-89). The brief says create, list, disable or revoke.
- The revoke audit event carries no service principal reference (route.ts:279-292).

**Present but disconnected or switched off**

- The Service principals card returns nothing when the list request returns 403 (WorkspaceServicePrincipals.tsx:66, 133), so a non-admin sees no card.

**Not available**

- Mobile, CLI, VS Code and Chrome: none found.
- Editing a principal's name, description or ceiling from the UI: not found.

## 4. Required behaviour

**Established requirements**

- A workspace admin can create non-human service identities with scoped keys, list them and disable or revoke them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.03)
- Creating a workspace key for a disabled principal is refused. (source: apps/web/app/api/settings/organization/admin-api-keys/route.ts:238-242)
- A key can only carry scopes within the principal's ceiling; others are refused and named. (source: apps/web/app/api/settings/organization/admin-api-keys/route.ts:243-250)
- Disabling asks first and names the consequence; enabling does not ask. (source: apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:151-160; test WorkspaceServicePrincipals.test.tsx)
- A service principal cannot perform actions that act on behalf of a person. (source: apps/web/lib/server/service-principal.ts:81-95)

**Acceptance criteria**

1. With a role lacking identity.manage, creating a key returns 403 'Your workspace role does not allow creating workspace API keys.' and the card shows no Disable control.
2. Creating a key without servicePrincipalId makes a new principal whose ceiling equals the requested scopes.
3. Disabling a principal makes its keys fail on the next call; enabling restores them.
4. Naming a disabled principal at key creation is refused with the re-enable message.
5. Requesting a scope above the principal's ceiling is refused and the response names the scope.
6. Create and revoke each write an audit event; create carries subjectRef service_principal:<id>.
7. Retrying creation with the same Idempotency-Key replays the first response and does not make a second key.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The workspace key list is limited to Team or Enterprise because requireTeamAdminAccess demands that subscription [inferred from team-admin-access.ts:70-88].
- Desktop parity relies on the hosted web pages [inferred from doc: AGENTS.md section 5].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an explicit 'New service principal' control and route.
- [proposed] Add the principal reference to the revoke audit event.
- [proposed] Show each principal's keys on its row.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | WorkspaceIdentityPage | `apps/web/app/workspace/identity/page.tsx` | Page 'Identity'. |
| component | WorkspaceIdentityPanels | `apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx` | Renders SSO, directory sync, and the service principals card (line 73). |
| component | WorkspaceServicePrincipals | `apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx` | List, disable and enable with confirm. |
| screen | Workspace audit page | `apps/web/app/workspace/audit/page.tsx` | Mounts the Workspace API keys card (line 23). |
| component | WorkspaceApiKeys | `apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx` | Create, list and revoke workspace keys. |
| hook | use-admin-api-keys | `apps/web/features/workspace-console/hooks/use-admin-api-keys.ts` | Query and mutations with step-up for workspace keys. |
| endpoint | GET/PATCH /api/settings/organization/service-principals | `apps/web/app/api/settings/organization/service-principals/route.ts` | List principals; disable or enable. |
| endpoint | GET/POST/DELETE /api/settings/organization/admin-api-keys | `apps/web/app/api/settings/organization/admin-api-keys/route.ts` | List, create and revoke workspace keys. |
| service | service-principal library | `apps/web/lib/server/service-principal.ts` | Create, list, read, disable principals; scope ceiling logic. |
| service | admin-api-keys library | `apps/web/lib/server/admin-api-keys.ts` | Mint, list, revoke, verify workspace keys; disabled principals refused. |
| config | WORKSPACE_ROUTE_ACCESS | `apps/web/lib/server/service-principals/route-access.ts` | The routes a workspace key can reach and the permission each needs. |
| service | service principal caller | `apps/web/lib/server/service-principals/caller.ts` | Resolves member or key callers; assertInteractiveCaller. |
| service | team admin access | `apps/web/app/api/settings/team/team-admin-access.ts` | Requires Team or Enterprise subscription. |
| table | organization_service_principals | `apps/web/db/neon/0245_admin_write_idempotency_and_service_principals.sql` | Principal rows with max_scopes and disabled_at. |
| table | organization_admin_api_keys | `apps/web/db/neon/0302_workspace_api_key_namespaced_scopes.sql` | Workspace key rows (table name from admin-api-keys.ts SQL; migration 0302 changes scope vocabulary). |
| table | admin_request_idempotency | `apps/web/db/neon/0245_admin_write_idempotency_and_service_principals.sql` | Replay receipts for idempotent creates. |
| service | requireStepUp | `apps/web/lib/server/step-up-auth.ts` | Fresh sign-in check on workspace key creation. |
| service | organization permission service | `apps/web/lib/services/organization-permission-service.ts` | requireMemberPermission for identity.read and identity.manage. |
| test | WorkspaceServicePrincipals tests | `apps/web/features/workspace-console/components/__tests__/WorkspaceServicePrincipals.test.tsx` | Reachable routes, disable consequence text, enable without confirm, no control without permission. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Identity page loads principals with the person's bearer token. | device and our servers | WorkspaceServicePrincipals.tsx:59-73 |
| Server resolves the caller as member or key, applies the route access table and returns principals and reachable routes. | our servers | service-principals/route.ts:37-49 |
| Disable: browser sends PATCH with principalId and disabled flag; server updates disabled_at and writes an audit event. | our servers | WorkspaceServicePrincipals.tsx:75-96; service-principals/route.ts:51-86; service-principal.ts setServicePrincipalDisabled |
| Create key: server checks team admin access, permission, scope grant, step-up, then in one transaction mints or reads the principal and inserts the key. | our servers | admin-api-keys/route.ts:106-208 |
| Automation presents the key; the verifier updates last_used_at, refuses revoked, expired or disabled-principal keys and intersects scopes with the ceiling. | our servers | admin-api-keys.ts:195-225 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Service principal (name, ceiling scopes, creator, disabled time) | table organization_service_principals | Server only. | Not deleted by disable; deletion path not found (unknown). |
| Workspace key hash, scopes, expiry, principal link | workspace admin key table (admin-api-keys.ts) | Server only. | Revoked rows retained with revoked_at. |
| Audit events admin_api_key_created, admin_api_key_revoked, admin_policy_changed | audit store | May stream to audit sinks (cron drain-audit-streams exists; details unknown). | Retention per workspace policy not established (unknown). |

**Models and providers.** No model or provider is involved. Workspace keys reach workspace administration routes such as audit and members, not the model gateway (route-access.ts header comment and entries).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in member of a shared workspace. |
| Permissions | identity.read to view, identity.manage to create, revoke, disable, enable; keys cannot carry permissions the creator lacks or Primary Owner only permissions (admin-api-keys/route.ts:122-129). A key itself cannot change a principal (assertInteractiveCaller, service-principals/route.ts:58; test 'refuses a workspace API key on the write'). |
| Subscription | Team or Enterprise subscription for team administration (team-admin-access.ts:76-85). Plan names in code: team, team_premium, enterprise. |
| Limits and metering | Key lifetime 1-365 days or none; up to 16 scopes per request and 1-16 per principal ceiling (route.ts:49; 0245 migration line 55). No credit metering found. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | none found in the code. [inferred] Server-side workspace feature with no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner in a status region. | WorkspaceServicePrincipals.tsx:104-110 |
| Empty | 'No service principals yet. One is created with the first workspace API key.' | WorkspaceServicePrincipals.tsx:182-188 |
| Error | 'We could not load service principals' and 'Try again'. | WorkspaceServicePrincipals.tsx:112-130 |
| No permission | HTTP 403 makes the card disappear; members who can read but not manage see no button. | WorkspaceServicePrincipals.tsx:66, 133, 209 |
| Disabled principal | Row shows 'Disabled <time>' and button 'Enable'. | WorkspaceServicePrincipals.tsx:192-220 |
| Retry with same Idempotency-Key | Replays the first response with Idempotency-Replayed true. | admin-api-keys/route.ts:184-207 |
| Failure mid-create | No key or principal left behind (single transaction). | admin-api-keys test names 'leaves no key and no principal behind...' |
| Offline, timeout, cancel | not handled in the code beyond the generic error text. | WorkspaceServicePrincipals.tsx:89 |
| Accessibility | Section labelled by its heading; status role on loading; icon aria-hidden. | WorkspaceServicePrincipals.tsx:106, 164-167 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/workspace-console/components/__tests__/WorkspaceServicePrincipals.test.tsx`: Reachable routes text, disable consequence, enable without confirm, no control for members who cannot manage.
- `apps/web/app/api/settings/organization/service-principals/__tests__/route.test.ts`: List for a member, key access rules, write refused to keys, disable audited, role refusal, captured-workspace ownership.
- `apps/web/app/api/settings/organization/admin-api-keys/__tests__/route.test.ts`: List without hashes, create returns secret once, scope refusals, admin without identity.manage refused, own principal per key, ceiling refusal, disabled principal refusal, idempotent replay, transactionality, revoke audit.

**Test scenarios**

- **Disable stops keys**
  1. As owner create a workspace key.
  2. Call an allowed route with it (200).
  3. Disable its principal and confirm.
  4. Call again.
  - Expected: Second call is refused (key not verified); Identity row shows Disabled.
- **Disabled principal refuses new keys**
  1. Disable a principal.
  2. POST admin-api-keys with its servicePrincipalId.
  - Expected: 403 'This service principal is disabled. Re-enable it before issuing a key.'
- **Role gate**
  1. Sign in as an admin without identity.manage.
  2. Open Identity; try POST admin-api-keys.
  - Expected: No Disable button; POST returns the role message.
- **Ceiling**
  1. Create a principal with audit read only.
  2. Request a key with members permission against it.
  - Expected: 403 naming the refused scope.
- **Idempotent retry**
  1. POST with an Idempotency-Key twice.
  - Expected: One key; header Idempotency-Replayed true on second response.

**Where to look when it fails**

- Audit event types admin_api_key_created, admin_api_key_revoked, admin_policy_changed with resourceType service_principal.
- Table organization_service_principals (disabled_at).
- Error messages quoted in current_implementation.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **No standalone create-principal control; principals appear only through keys.** Affects: Workspace admins on web and Desktop.. Evidence: service-principals/route.ts exports GET and PATCH only; admin-api-keys/route.ts:225-232.. Work needed: Decide if a separate create is wanted.
- **Revoke audit event lacks the principal reference.** Affects: Audit review.. Evidence: admin-api-keys/route.ts:279-292 vs 180.. Work needed: Add subjectRef.
- **Brief says disable or revoke; revoke is per key on a different page from the principal card.** Affects: Admin workflow.. Evidence: workspace/audit/page.tsx:23 vs workspace/identity/page.tsx.. Work needed: Cross-link or co-locate.
- **Desktop and other apps not verified.** Affects: Desktop.. Evidence: Brief says done for desktop; not opened.. Work needed: Verify in Electron.

**Depends on**

- surface:web
- surface:desktop
- table:organization_service_principals
- table:admin_request_idempotency
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- plan:team
- plan:enterprise

## Unknown

- Whether the Team admin subscription rule excludes some plans beyond team and enterprise (getTeamAdminAccess not read).
- Whether the Desktop shows /workspace pages.
- How a principal is ever deleted.
- Retention of audit events and where audit streams go.
