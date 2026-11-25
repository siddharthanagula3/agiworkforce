---
id: "F055-04"
type: "feature"
title: "Organization-shared connectors"
aliases: ["Organization-shared connectors", "Shared connectors", "Share connector with organization", "Workspace sharing, connectors", "Organization-managed authorization", "S55.11", "orgmcp server id"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.11"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "F055-03", "SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "table:organization_shared_connectors"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-04 Organization-shared connectors

A workspace admin shares one of their own custom or key-based connectors so members can use its tools in chat without ever holding the credential. Built on Web (Sharing page and settings) and Desktop (same hosted web). The share route currently refuses while connectors are coming soon, and OAuth grants cannot be shared.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.11](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5511).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Admin picks one of their connectors under 'Shared connectors', presses 'Share connector with organization'; members then get that server's tools in chat under an id like orgmcp-<short id>, called by our server with the owner's stored credential. Unsharing stops member access. (apps/web/features/settings/sections/OrganizationSharingSection.tsx:533-660; apps/web/lib/user-connector-tools.ts:1682-1870)

**Why it exists.** Teams should authorize an app once instead of every member holding a key. Brief S55.11 requires members to use it without holding the credential (doc: area brief).

**Who uses it.** Workspace admins and sharing managers share; members use.

**Problems it solves**

- Key sprawl: only the owner's sealed key exists. (user-connector-tools.ts:1687-1700)
- Lost control: unshare removes access and evicts caches. ([connectorId]/route.ts:96-110)
- Over-sharing: share needs a sharing manager and a quota check. (org-shared-connector-service.ts:118-150; [connectorId]/route.ts:45-52)

**Use cases**

- Admin shares a team's internal MCP server with all members.
- Member asks a question; the assistant calls the shared server.
- Admin stops sharing; member's next call fails with 'no longer available'.

## 2. User experience

**Where to find it**

- Web: page /workspace/sharing titled Sharing (apps/web/app/workspace/sharing/page.tsx:6-15) with the 'Shared connectors' section (OrganizationSharingSection.tsx:555).
- Desktop (Electron): same hosted web (doc: AGENTS.md section 5).
- Mobile, CLI, VS Code, Chrome: no sharing screen found.

**Before you start**

- Signed in as a member who can manage sharing (requireSharingManager).
- An organization exists; otherwise the page says 'Create an organization in Team to share projects, chats, artifacts and connectors.' (OrganizationSharingSection.tsx:705).
- The admin has an own custom or key connector (the select lists the person's own connectors).
- Organization entitlement allows shared connectors (sharedConnectorLimit not 0).

**Screens and controls**

- Select 'Connector to share' with first option 'Select one of your connectors...'.
- Button 'Share connector with organization' ('Sharing...' while pending).
- List of shared connectors with the id orgmcp-<id> and a stop-sharing button.
- Confirm dialog 'Stop sharing <name>?' naming the consequence (OrganizationSharingSection.tsx:645-648).
- Empty copy 'No connectors are shared yet.'

**Journey**

1. Admin opens Workspace, Sharing.
2. Chooses a connector in the select and presses Share.
3. Server records the share and the list shows it.
4. A member opens a chat; the member's tool catalogue includes the shared server.
5. Admin presses stop sharing and confirms; the connector leaves the list.

**What the person sees and gets**

- Toast 'Connector is no longer shared' on unshare (use-settings-queries.ts:1861).
- Error messages through toUserMessage; retry for failed own-connector load ('Your connectors could not be loaded. Try again.').
- Member side: errors 'This shared connector is not available for this account.' or '...no longer available for this organization.' (user-connector-tools.ts:1795-1830).

**Settings**

- Workspace connector policy (admin 'these connectors only') applies to members' use (user-connector-tools.ts:1648-1675).
- Workspace-published MCP servers (admin publishes, membership is the grant) are a related path (apps/web/app/api/settings/organization/mcp/route.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- PUT and DELETE routes for sharing with CSRF, rate limit, manager check and audit events organization_share_granted and organization_share_revoked. (apps/web/app/api/settings/organization/shared/connectors/[connectorId]/route.ts:26-110)
- Share service verifies the connector row belongs to the actor and applies a quota guard. (apps/web/lib/services/org-shared-connector-service.ts:118-165)
- Members list shared servers that belong to other users and run them server side without seeing the key. (user-connector-tools.ts:1682-1700,1787-1870)
- Unshare evicts the shared catalogue cache. ([connectorId]/route.ts:99)

**Incomplete**

- Only rows in user_custom_connectors can be shared; OAuth grants in connector_oauth_grants are not shareable. (org-shared-connector-service.ts:128-137)
- Member visibility in the member's own Settings list was not found; members get the tools in chat (user-connector-tools.ts:2123-2130).

**Present but disconnected or switched off**

- The share route calls assertConnectorsReleased, which needs the whole-connector release, not the selective list; with the constant coming_soon, sharing is refused for everyone. (route.ts:48; apps/web/lib/connectors/connector-capability.ts:28-30; connector-release.ts:14)

**Not available**

- Mobile, CLI, VS Code and Chrome have no sharing control found.
- Admin approval requests by members are declined by the owner (doc: docs/decisions/2026-09-27-founder-decisions.md:90-93).

## 4. Required behaviour

**Established requirements**

- An organization admin authorizes a connector once and members use it without holding the credential. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.11)
- Members have no approval-request flow; one account per connector. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:90-93)
- Workspace connector policy must bind at the point of connection. (source: apps/web/lib/services/connector-policy-gate.ts:20-34)

**Acceptance criteria**

1. Admin shares a connector: the list shows it with an orgmcp id.
2. A member's chat can call a tool of the shared connector; the member never sees the key in any response.
3. Admin unshares: the member's next call returns 'no longer available'.
4. A non-admin cannot call PUT or DELETE (refused by requireSharingManager).
5. A second share of the same connector does not create a duplicate (on conflict update).
6. Sharing a connector owned by another user fails (owned check).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Members' use is limited by the workspace connector policy because discovery runs the policy gate for orgmcp ids (user-connector-tools.ts:1655-1673).
- [inferred] The member's own plan check may not apply to a shared server; not traced.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Allow sharing selectively released connectors without waiting for the whole release.
- [proposed] Show shared connectors in the member's Connectors list as 'Shared by your organization'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:PUT /api/settings/organization/shared/connectors/{connectorId} | `apps/web/app/api/settings/organization/shared/connectors/[connectorId]/route.ts` | Share a connector row. |
| endpoint | api:DELETE /api/settings/organization/shared/connectors/{connectorId} | `apps/web/app/api/settings/organization/shared/connectors/[connectorId]/route.ts` | Stop sharing. |
| endpoint | api:GET /api/settings/organization/shared | `apps/web/app/api/settings/organization/shared/route.ts` | Overview with shared connectors. |
| service | org-shared-connector-service | `apps/web/lib/services/org-shared-connector-service.ts` | List, share, unshare, quota. |
| service | org-sharing-service | `apps/web/lib/services/org-sharing-service.ts` | requireSharingManager and membership resolution. |
| service | org entitlements | `apps/web/lib/services/org-entitlements.ts` | sharedConnectorLimit. |
| service | user-connector-tools | `apps/web/lib/user-connector-tools.ts` | Member catalogue and execution of org-shared tools. |
| service | org shared catalog cache | `apps/web/lib/connectors/org-shared-catalog-cache.ts` | Cache and eviction. |
| component | OrganizationSharingSection | `apps/web/features/settings/sections/OrganizationSharingSection.tsx` | Sharing UI. |
| hook | useShareConnectorWithOrganization | `apps/web/features/settings/hooks/use-settings-queries.ts` | Mutations for share and unshare. |
| screen | Workspace Sharing page | `apps/web/app/workspace/sharing/page.tsx` | Page host. |
| table | table:organization_shared_connectors | `apps/web/db/neon/0086_org_shared_ecosystem.sql` | Share rows with org short id. |
| table | table:user_custom_connectors | `apps/web/db/neon/0086_org_shared_ecosystem.sql` | Owner row with sealed credential. |
| table | table:organization_mcp_servers | `apps/web/lib/user-connector-tools.ts` | Admin-published servers path. |
| service | connector-policy-gate | `apps/web/lib/services/connector-policy-gate.ts` | Workspace policy checks. |
| test | org-shared-connector-service test | `apps/web/lib/services/__tests__/org-shared-connector-service.test.ts` | Service tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin presses Share; client sends PUT with CSRF. | device and our servers | OrganizationSharingSection.tsx:588-595 |
| Server rate-limits, checks CSRF, resolves membership, requires a sharing manager, then asserts connectors released. | our servers | [connectorId]/route.ts:26-50 |
| Service checks sharedConnectorLimit, allocates an org short id and inserts the grant only for a row owned by the actor, guarded by a quota function. | our servers | org-shared-connector-service.ts:118-165 |
| Audit event organization_share_granted written. | our servers | [connectorId]/route.ts:55-61 |
| Member's chat turn builds a catalogue from rows shared by others plus workspace-published servers. | our servers | user-connector-tools.ts:1710-1735,2123 |
| Tool call: our server loads the shared row, checks the public hostname, connects to the shared MCP server with the owner's stored credential and returns the result to the member. | our servers | user-connector-tools.ts:1787-1870 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Share grant (organization, connector row, short id, who shared) | table organization_shared_connectors | Server | Deleted on unshare |
| Owner's sealed credential | user_custom_connectors.auth_header_enc | Never sent to members | Untouched by unshare (confirm text says so, OrganizationSharingSection.tsx:646) |

**Models and providers.** The member's chat model receives only tool results. Model choice does not affect sharing. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in member of an organization. |
| Permissions | requireSharingManager for share and unshare; members need active membership to use (resolveConnectorOrganizationId throws forbidden otherwise, user-connector-tools.ts:1642-1650). |
| Subscription | Organization entitlement sharedConnectorLimit; 0 refuses sharing (org-shared-connector-service.ts:126-129). Connectors plan checks for the member were not traced: unknown. |
| Limits and metering | Quota via assert_org_resource_limit('org_shared_connectors') and settings-org-patch rate bucket. |
| Feature flags | assertConnectorsReleased on share (whole release, not selective); kill-switch not checked in the share route. |
| Model compatibility | none found in the code. |
| Provider restrictions | Shared URL must resolve to a public host and pass the MCP egress policy (user-connector-tools.ts:1846-1860). |
| Local mode | Sharing is a cloud workspace feature; there is no local equivalent. Not available in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No organization | Page shows a prompt to create one in Team. | OrganizationSharingSection.tsx:705 |
| Not a manager | Share and unshare refused by requireSharingManager. | [connectorId]/route.ts:45-48 |
| Connector id not a uuid | Validation error 'connectorId must be a uuid'. | [connectorId]/route.ts:24-28 |
| Limit 0 | Validation error with the limit message. | org-shared-connector-service.ts:126-129 |
| Unshare of a missing share | 404 'That connector is not shared with your organization'. | [connectorId]/route.ts:97-100 |
| Member not in workspace | 'This shared connector is not available for this account.' | user-connector-tools.ts:1795-1809 |
| Endpoint blocked by egress policy | 'This shared connector endpoint is not reachable from this environment.' | user-connector-tools.ts:1867-1873 |
| Owner removes own connector | unknown (cascade not read). | not traced |
| Accessibility | Select has a visually hidden label 'Connector to share'. | OrganizationSharingSection.tsx:569-571 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/org-shared-connector-service.test.ts`: Share service (by file name).
- `apps/web/app/api/settings/organization/shared/__tests__/route.test.ts`: Shared overview route (by file name); also route.cross-org-isolation.test.ts and route.request-scope.test.ts.
- `apps/web/lib/connectors/__tests__/shared-connector-runtime-parity.test.ts`: Shared connector runtime (by file name).
- `apps/web/lib/services/__tests__/connector-policy-gate.test.ts`: Policy gate (by file name).

**Test scenarios**

- **Share and use**
  1. Admin adds a key connector, then shares it.
  2. Member asks a question needing it.
  - Expected: Member's call succeeds; the key never appears in member responses.
- **Unshare**
  1. Admin unshares and confirms.
  2. Member repeats the question.
  - Expected: Tool unavailable message; share row gone.
- **Non-manager**
  1. Call PUT as a plain member.
  - Expected: Refused.
- **Release gate**
  1. Call PUT in the current build.
  - Expected: 403 'Connectors are coming soon.'
- **Cross-org**
  1. Member of org B asks for org A's orgmcp id.
  - Expected: Not found or unavailable.

**Where to look when it fails**

- Audit events organization_share_granted and organization_share_revoked.
- Table organization_shared_connectors.
- Log '[user-connector] shared workspace membership unavailable'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **Share is refused while the whole-connector release state is coming_soon, even for the 13 selectively released.** Affects: Admins on Web and Desktop. Evidence: [connectorId]/route.ts:48; connector-capability.ts:28-30. Work needed: Decide whether selective release should allow sharing.
- **OAuth-based connectors cannot be shared; only custom or key rows.** Affects: Admins wanting to share a Google or Notion sign-in. Evidence: org-shared-connector-service.ts:128-137. Work needed: Design an org-level OAuth grant or document the limit.
- **No member-side listing found in the member's own Connectors screen.** Affects: Members. Evidence: not found in useConnectorsSettingsAdapter.tsx. Work needed: Verify live; add a row if absent.
- **Brief marks Mobile, CLI, VS Code as not applicable; no sharing there.** Affects: Those apps. Evidence: area brief S55.11. Work needed: None unless the owner wants parity.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- F055-03
- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- table:organization_shared_connectors

## Unknown

- Exactly which plans give a non-zero sharedConnectorLimit (org-entitlements.ts not read).
- Whether members see shared connectors in their Connectors list.
- Whether a member's own plan must include connectors to use a shared server.
- What happens to shares when the owner deletes the connector or leaves.
- Whether the workspace-published servers route is part of this feature or of another area.
