---
id: "F058-07"
type: "feature"
title: "Organization-approved server catalog"
aliases: ["Workspace MCP servers", "Published MCP servers", "Organization MCP servers", "orgmcp- connector", "organization_mcp_servers", "S58.15", "MCP servers console page"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S58.15"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "table:organization_mcp_servers", "table:organization_policy_revisions", "api:GET /api/settings/organization/mcp", "api:POST /api/settings/organization/mcp", "api:PATCH /api/settings/organization/mcp", "file:apps/web/app/api/settings/organization/mcp/route.ts", "file:packages/contracts/types/src/connector-release.ts", "SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-07 Organization-approved server catalog

A workspace administrator publishes MCP server addresses so every member of the workspace gets those servers in their connector list without adding anything. The web admin page at /workspace/mcp lists, publishes, unpublishes and retires them. Today the server code refuses publishing and re-publishing because connectors are marked 'coming soon'.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.15](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5815).

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

**What it does.** Lets a person with the policy.manage permission keep a list of MCP servers (https address, name, optional description) that belongs to the workspace. A published server is offered to every member automatically. Members never see or hold its credentials (apps/web/features/workspace-console/components/WorkspaceMcpServers.tsx:237-240).

**Why it exists.** Before this, a workspace that ran its own MCP gateway had to ask every member to add it by hand, and a member who left took their copy away. Nothing said 'this server belongs to the workspace', so nothing could be audited, retired or handed over (apps/web/db/neon/0250_organization_mcp_servers.sql, header comment).

**Who uses it.** Workspace administrators and owners (people with policy.manage) publish. Every member of the workspace consumes the result through their connector list.

**Problems it solves**

- Members do not have to find, add and configure a company MCP server themselves.
- A published server survives the administrator who made it leaving (row belongs to the workspace).
- Retiring is an update, not a delete, so the audit trail and the short id are kept and never reused.
- A server the workspace's own host policy would block is refused at publish time instead of failing for every member.

**Use cases**

- An IT admin publishes the company's internal MCP gateway so all staff can use its tools.
- An admin saves a server as a draft (unpublished) while checking it, then publishes it to everyone.
- An admin retires a server that was decommissioned so every member loses it at once.

## 2. User experience

**Where to find it**

- Web: workspace console, left nav item 'MCP servers' (hint 'Servers this workspace publishes to its members'), route /workspace/mcp, page title 'MCP servers' (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:101-105; apps/web/app/workspace/mcp/page.tsx:12-18).
- Desktop: the public Electron desktop shows the hosted web app, so the same page is reached inside the desktop window (doc: apps/desktop/README.md). The Tauri source under apps/desktop/src has no reference to this page: unknown whether any Tauri screen exists.
- Mobile, CLI, VS Code, Chrome: no screen found; the brief marks them not applicable.

**Before you start**

- Signed in to a workspace (organization).
- To change anything: the policy.manage permission (apps/web/app/api/settings/organization/mcp/route.ts:138-142).
- To publish or re-publish: connectors released on the server (see gaps; currently not released).

**Screens and controls**

- Card 'Workspace MCP servers' with explanation 'A published server appears in every member's connector list without them adding it. Members never see or hold its credentials.' (WorkspaceMcpServers.tsx:234-240).
- List 'Published MCP servers': each row shows name, URL and a state label 'Published to everyone', 'Draft, not yet published' or 'Retired' (WorkspaceMcpServers.tsx:129-132,254-269).
- Row buttons for managers on non-retired rows: 'Unpublish' or 'Publish to everyone', and 'Retire' (WorkspaceMcpServers.tsx:270-292).
- Retire confirmation dialog 'Retire <name>?' with buttons 'Retire for everyone' and 'Keep it published'; text says every member loses the server at once and that publishing again gives a new id (WorkspaceMcpServers.tsx:209-221).
- Add form 'Add a server': fields 'Name members will see', 'Server URL' (https://mcp.example.com), 'Description' (optional), button 'Publish' (shows 'Checking the server…' while working), note 'The server is checked once before it is published.' (WorkspaceMcpServers.tsx:299-356).

**Journey**

1. Admin opens 'MCP servers' in the workspace console.
2. The page loads the list (spinner text 'Loading workspace MCP servers…').
3. Admin types a name and an https URL, optionally a description, and presses 'Publish'.
4. The server contacts the MCP server once to check it (probe) before saving; the button reads 'Checking the server…'.
5. On success the form clears and the list refreshes with the new row labelled 'Published to everyone'.
6. To stop offering a server the admin presses 'Unpublish'; to remove it for good presses 'Retire' and confirms.

**What the person sees and gets**

- Empty list: 'This workspace has not published an MCP server yet.' (WorkspaceMcpServers.tsx:250).
- Load error: 'We could not load this workspace's MCP servers' with a 'Try again' button (WorkspaceMcpServers.tsx:161-178).
- Publish error shown in red under the form via toUserMessage (WorkspaceMcpServers.tsx:334-342).
- Server messages include: not https, host blocked by workspace policy, server could not be reached, needs authorization first, edge-blocked, already published at that URL, limit of 32 reached (route.ts:98-103,168-177; org-mcp-servers.ts publishOrgMcpServer).
- Permission refusal text: 'Your workspace role does not allow publishing an MCP server to this workspace.' or '...changing this workspace's MCP servers.' (route.ts:141,241).

**Settings**

- Workspace connector policy (allowed hosts) is read at publish time and must permit the URL (route.ts:150-151).
- No per-member setting: membership is the grant (apps/web/lib/user-connector-tools.ts:1703-1707).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET lists servers, the caller's canManage flag and the workspace revision, with ETag headers (apps/web/app/api/settings/organization/mcp/route.ts:123-129,108-121).
- POST publishes: CSRF check, rate limit, policy.manage check, connectors-released check, revision check, https and host-policy check, a live probe of the server, insert, audit event, optional idempotency key (route.ts:131-229).
- PATCH publishes, unpublishes or retires, writes an audit event and returns the refreshed list (route.ts:231-297).
- Every successful change records an 'admin_policy_changed' audit event with resourceType organization_mcp_server, severity warning (route.ts:192-204,263-275).
- A workspace is capped at 32 non-retired servers; duplicate URL per workspace is refused by a unique constraint (apps/web/app/api/settings/organization/mcp/org-mcp-servers.ts MAX_ORG_MCP_SERVERS; apps/web/db/neon/0250_organization_mcp_servers.sql unique constraint).
- Members' connector list and tool calls include published, non-retired rows, with no credential header (apps/web/lib/user-connector-tools.ts:1709-1735,1825-1830).
- Admin page with confirm-before-retire using useConfirmAction (WorkspaceMcpServers.tsx:143,209-221).

**Incomplete**

- Un-retire through the API: PATCH with retired:false is accepted but the SQL only ever sets retired_at, never clears it, so a retired row stays retired (org-mcp-servers.ts updateOrgMcpServer, 'retired_at = case when $4::boolean then coalesce(retired_at, now()) else retired_at end'). The page tells admins to publish again instead.
- Optimistic concurrency: the server enforces If-Match when sent, but the web page's send() never sends If-Match, so two admins can still overwrite each other from the page (WorkspaceMcpServers.tsx:70-83; route.ts:147-148).
- Published servers are read by members with a null credential header, so a server that needs authorization can pass the admin's probe but may fail for members: not confirmed either way (user-connector-tools.ts:1712-1714).

**Present but disconnected or switched off**

- Publishing and re-publishing are switched off in the current build: assertConnectorsReleased throws 'Connectors are coming soon.' because CONNECTOR_RELEASE_STATE is 'coming_soon' (packages/contracts/types/src/connector-release.ts:12; apps/web/lib/connectors/connector-capability.ts:27-29; route.ts:143,245). Retiring and unpublishing still work (test: route.test.ts 'still lets an administrator retire a server').
- Whether members actually receive published servers also depends on the same connector release and plan gate (apps/web/lib/connectors/connector-capability.ts:44-52): exact member-side outcome while coming-soon is unknown.

**Not available**

- Mobile, CLI, VS Code and Chrome have no admin screen for this (brief S58.15 lists web and desktop only).
- No per-member or per-group targeting: a published server goes to every member (WorkspaceMcpServers.tsx:238).

## 4. Required behaviour

**Established requirements**

- An organization admin maintains a catalog of approved MCP servers that members can use (web done, desktop done). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S58.15)
- A change requires policy.manage; otherwise it is refused with a message naming the workspace role. (source: route.ts:138-142,238-242)
- Publishing or un-publishing-to-restore calls assertConnectorsReleased first. (source: route.ts:143,245)
- Each change writes an admin_policy_changed audit event. (source: route.ts:192-204,263-275)
- A change is checked against the workspace revision (when the caller states one) so two edits do not overwrite each other. (source: route.ts:147-148,247-251; apps/web/lib/server/workspace-revision.ts)
- Founder decisions list the remaining product rules for connectors; no document under docs/product or docs/decisions describing this catalog was found. (source: search of docs/product and docs/decisions (no match for the org catalog))

**Acceptance criteria**

1. A member without policy.manage who calls POST or PATCH gets 403 with the workspace-role message and no row changes.
2. With connectors released, POST with an https URL that the server answers publishes the row, returns 201, and writes one admin_policy_changed audit event.
3. POST with an http URL, a host the connector policy blocks, or an unreachable server is refused and no row is written.
4. PATCH with retired:true removes the server from every member's connector list and the page shows 'Retired'.
5. A request carrying a stale If-Match returns a conflict naming the expected and current revision.
6. While connectors are 'coming soon', POST and PATCH published:true return 403 'Connectors are coming soon.' without contacting the server; retire still succeeds.
7. The 33rd non-retired server is refused with a limit message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The web page should send If-Match from the revision it loaded so the 'two edits do not overwrite each other' rule holds for page users, not only API callers [inferred].
- Retire should be the only way a server leaves the list, because the confirmation names it as irreversible [inferred from the dialog text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make un-retire either work (clear retired_at with a new id policy) or remove retired:false from the schema.
- [proposed] Have the page send If-Match and show the conflict message with a reload action.
- [proposed] Decide and document how a published server that needs authorization is credentialed for members.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Workspace MCP page | `apps/web/app/workspace/mcp/page.tsx` | Route /workspace/mcp, wraps the panel in ConsolePage with title 'MCP servers'. |
| component | WorkspaceMcpServers | `apps/web/features/workspace-console/components/WorkspaceMcpServers.tsx` | List, publish form, unpublish, retire with confirmation, error and loading states. |
| hook | useWorkspaceMcpServers / usePublishWorkspaceMcpServer / useChangeWorkspaceMcpServer | `apps/web/features/workspace-console/components/WorkspaceMcpServers.tsx` | React Query fetch (GET) and mutations (POST, PATCH) against /api/settings/organization/mcp. |
| component | WorkspaceConsoleNav entry | `apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx` | Adds the 'MCP servers' navigation item. |
| endpoint | GET/POST/PATCH /api/settings/organization/mcp | `apps/web/app/api/settings/organization/mcp/route.ts` | List, publish, change; permission, release, revision, probe, audit. |
| service | org-mcp-servers | `apps/web/app/api/settings/organization/mcp/org-mcp-servers.ts` | SQL for list, insert (with short id 'p'+hex, cap 32) and update (publish, unpublish, retire). |
| service | workspace-access | `apps/web/app/api/settings/organization/workspace-access.ts` | resolveWorkspaceConsoleAccess and requireWorkspaceConsolePermission. |
| service | workspace-revision | `apps/web/lib/server/workspace-revision.ts` | Reads the workspace revision from organization_policy_revisions; checks If-Match; sets ETag headers. |
| service | connector-capability | `apps/web/lib/connectors/connector-capability.ts` | assertConnectorsReleased and per-turn connector allowance. |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Release switch, currently 'coming_soon'; message 'Connectors are coming soon.' |
| service | probeMcpServer / transportForUrl | `apps/web/lib/connectors/mcp-custom-connections.ts` | Live check of a server before it is published. |
| service | readConnectorPolicy / evaluateMcpHostAccess | `apps/web/lib/services/connector-policy-service.ts` | Workspace host policy used to validate the URL (evaluateMcpHostAccess from @agiworkforce/client-runtime). |
| service | recordAuditEvent | `apps/web/lib/security-audit.ts` | Writes the admin_policy_changed event (type declared at line 237). |
| service | Member-side reach | `apps/web/lib/user-connector-tools.ts` | getWorkspacePublishedMcpRows (1709-1722), getOrgReachableConnectorRows (1725-1735) and the lookup at 1825-1830 give members the published servers. |
| config | ORG_SHARED_SERVER_PREFIX 'orgmcp-' | `apps/web/lib/connectors/custom-server-ids.ts` | Server id namespace shared with org-shared connectors. |
| table | organization_mcp_servers | `apps/web/db/neon/0250_organization_mcp_servers.sql` | One row per published server; unique (organization_id, url); owner-only writes; members read. |
| schema | version column | `apps/web/db/neon/0259_extension_versions_and_lifecycle.sql` | Adds optional semver column to organization_mcp_servers. |
| schema | tamper-evident trigger | `apps/web/db/neon/0291_tamper_evident_tables_survive_a_regrant.sql` | Trigger organization_mcp_servers_owner_writes_only and revoke of app writes. |
| service | organization-erasure / deletion-manifest | `apps/web/lib/server/organization-erasure.ts` | References organization_mcp_servers when a workspace is erased. |
| test | route.test.ts | `apps/web/app/api/settings/organization/mcp/__tests__/route.test.ts` | API behaviour tests. |
| test | WorkspaceMcpServers.test.tsx | `apps/web/features/workspace-console/components/__tests__/WorkspaceMcpServers.test.tsx` | Panel tests. |
| test | organization-mcp-servers-migration.test.ts | `apps/web/db/neon/organization-mcp-servers-migration.test.ts` | Migration text checks. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin presses 'Publish'; the page sends POST with a bearer token and CSRF header. | device | WorkspaceMcpServers.tsx:70-83,192-207 |
| Server checks CSRF, rate limit (settings-org-patch), resolves the workspace and requires policy.manage, then assertConnectorsReleased. | our servers | route.ts:132-143 |
| Server validates the body, compares the workspace revision when If-Match was sent, reads the connector policy, and requires https plus an allowed host. | our servers | route.ts:145-151,91-106 |
| Server connects once to the MCP server to count its capabilities; an unreachable, edge-blocked or authorization-needing server is refused. | outside service | route.ts:160-177 |
| Server inserts the organization_mcp_servers row and writes the admin_policy_changed audit event; replies 201 with the server and capability counts. | our servers | route.ts:182-206; org-mcp-servers.ts publishOrgMcpServer |
| When a member's chat turn or connector list runs, the server adds published non-retired rows of the member's workspace to the connectors they reach, after a public-hostname safety check. | our servers | apps/web/lib/user-connector-tools.ts:1709-1735,1745-1760 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published server row (name, description, url, transport, published, published_at, retired_at, created_by, updated_by, optional version) | table organization_mcp_servers in the cloud database | Server-held; every member reads it live, nothing is copied to devices as a store found in code | Retire sets retired_at; rows are not deleted by the feature; removed when the workspace is erased (apps/web/lib/server/organization-erasure.ts) |
| Audit event admin_policy_changed | security audit log written by recordAuditEvent | server only | retention rule not read: unknown |
| Idempotency record when an Idempotency-Key header is sent | server idempotency store (apps/web/lib/server/idempotency.ts) | server only | unknown |

**Models and providers.** No model or provider takes part in publishing. Members' chats that later use a published server call it as a tool, which happens in the chat turn (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace member; the console resolves the active organization (route.ts:127,138). |
| Permissions | policy.manage to publish, change or retire; GET returns canManage so the page hides controls from others (route.ts:128). Members read rows through the member-side connector path. |
| Subscription | The connector capability is plan-gated through canUseBillingPlanCapability('connectors') for turns (apps/web/lib/connectors/connector-capability.ts:23-25,44-52). No separate entitlement for the catalog page itself was found; which plans see the console page: unknown. |
| Limits and metering | 32 non-retired servers per workspace; rate limit buckets settings-org (read) and settings-org-patch (write). No usage metering of publishing found. |
| Feature flags | Connector release state (packages/contracts/types/src/connector-release.ts:12) and a kill switch read for turns (connector-capability.ts:31-42). |
| Model compatibility | Not model-specific; the feature never calls a model. |
| Provider restrictions | none found in the code |
| Local mode | Local mode is not involved: the catalog lives in the cloud database. The Electron desktop shows the hosted page, so it needs a network and sign-in. The CLI and mobile have no screen. Whether a Local-mode chat can use a published server: not found; the member path runs on our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner and 'Loading workspace MCP servers…'. | WorkspaceMcpServers.tsx:149-158 |
| Empty | 'This workspace has not published an MCP server yet.' | WorkspaceMcpServers.tsx:245-251 |
| Load error / retry | Error card and 'Try again' calls refetch. | WorkspaceMcpServers.tsx:161-178 |
| Caller not allowed to see console (403) | Query returns null and the component renders nothing. | WorkspaceMcpServers.tsx:92,182 |
| Member without policy.manage | No add form and no row buttons. | WorkspaceMcpServers.tsx:270,299 |
| Publish in progress | Button label 'Checking the server…' and disabled; double submit blocked. | WorkspaceMcpServers.tsx:186-190,350 |
| Server needs authorization / edge blocked / unreachable | User-safe validation error and no row. | route.ts:168-177 |
| Duplicate URL | Conflict: 'This workspace already publishes an MCP server at that URL.' | org-mcp-servers.ts publishOrgMcpServer |
| Stale revision | Conflict naming expected and current revision (only when If-Match was sent). | apps/web/lib/server/workspace-revision.ts assertWorkspaceRevisionUnchanged |
| Retry with same Idempotency-Key | Replays the first result with header Idempotency-Replayed. | route.ts:214-228 |
| Connectors coming soon | POST and publish PATCH return 403 'Connectors are coming soon.' | route.ts:143,245; route.test.ts |
| Unknown server id on PATCH | Not found 'That MCP server is not published by this workspace.' | route.ts:261 |
| Offline | not handled in the code beyond the generic error card | WorkspaceMcpServers.tsx:161-178 |
| Accessibility | List has aria-label 'Published MCP servers'; publish error has role='alert'; the name input has a label but URL and description use aria-label. | WorkspaceMcpServers.tsx:244,304-333,336 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/mcp/__tests__/route.test.ts`: GET with revision; POST probes before publishing, refuses unreachable server with no row, refuses disallowed host, refuses non-https, refuses a member role, refuses stale revision; PATCH retire and not-found; coming-soon refusals for publish and republish while retire still works.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceMcpServers.test.tsx`: Hides for non-admin, states which servers every member has, draft versus published labels, publish, https-only input, retire confirmation naming the consequence, no controls without permission.
- `apps/web/db/neon/organization-mcp-servers-migration.test.ts`: Short id namespace, app role cannot write, member read only, published_at required when published, retire by column, unique URL, reversal, bounded count.
- `apps/web/features/connectors/lib/__tests__/connector-release-lock.test.ts`: Mentions organization_mcp_servers in the connector release lock: details not read.
- `apps/web/lib/__tests__/user-connector-tools.test.ts`: Matches 'orgmcp'; exact member-side cases not read.

**Test scenarios**

- **Refused without permission**
  1. Sign in as a workspace member without policy.manage.
  2. POST /api/settings/organization/mcp with a valid body.
  - Expected: 403 with 'Your workspace role does not allow publishing an MCP server to this workspace.' and no new row.
- **Publish with connectors released**
  1. Use a build where the release state is 'released'.
  2. As admin publish https://<reachable server> from /workspace/mcp.
  3. Open the audit log.
  - Expected: Row shows 'Published to everyone'; one admin_policy_changed event for that server.
- **Coming-soon behaviour (current build)**
  1. As admin try to publish a server.
  2. Then press Retire on an existing row.
  - Expected: Publish shows 'Connectors are coming soon.'; Retire succeeds after confirmation.
- **Member sees published server**
  1. Publish a server.
  2. Sign in as another member and open the connector list.
  - Expected: The server is listed without the member adding it (needs live check; not shown by a test I read).
- **Concurrent edit**
  1. Read the list and note the ETag.
  2. Change another policy item as a second admin.
  3. PATCH with the old If-Match.
  - Expected: Conflict message with expected and current revision.
- **Un-retire**
  1. Retire a server.
  2. PATCH {serverId, retired:false}.
  - Expected: Row stays retired (current code): confirms the gap.

**Where to look when it fails**

- Audit events of type admin_policy_changed with resourceType organization_mcp_server.
- Error text 'Connectors are coming soon.' means the release switch is off.
- Table organization_mcp_servers (published, retired_at).
- Server log '[user-connector] shared connector endpoint blocked by SSRF policy' when a member's path blocks the host (user-connector-tools.ts:1745-1760).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **Publishing is switched off by the global connector release state.** Affects: Admins on web and desktop; all members expecting new servers.. Evidence: packages/contracts/types/src/connector-release.ts:12; route.ts:143. Work needed: Release connectors (owner decision) or give the catalog its own gate.
- **The page does not send If-Match, so the revision rule protects only API callers.** Affects: Admins using the web page and desktop window.. Evidence: WorkspaceMcpServers.tsx:70-83. Work needed: Send the loaded revision and handle the conflict response.
- **Does a workspace MCP change bump the revision counter? The route never appends to organization_policy_revisions, so two MCP edits may not conflict even with If-Match.** Affects: Admins editing at the same time.. Evidence: route.ts (no revision write); workspace-revision.ts:readWorkspaceRevision reads max(revision) of organization_policy_revisions only. Work needed: Confirm whether a trigger exists (none found in 0250, 0259, 0291) and add a revision row per change.
- **Un-retire via retired:false is accepted but does nothing.** Affects: API callers; admins.. Evidence: org-mcp-servers.ts updateOrgMcpServer. Work needed: Implement or remove the option.
- **Published servers reach members with no credential, yet the publish error tells admins to connect once so the workspace holds a credential.** Affects: Servers that need authorization.. Evidence: route.ts:171-173; user-connector-tools.ts:1712. Work needed: Verify live and define a credential path.
- **The desktop (Tauri source) has no screen; only the hosted page in Electron.** Affects: Tauri desktop build.. Evidence: apps/desktop/README.md; no match in apps/desktop/src. Work needed: Confirm Tauri is out of scope.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- table:organization_mcp_servers
- table:organization_policy_revisions
- api:GET /api/settings/organization/mcp
- api:POST /api/settings/organization/mcp
- api:PATCH /api/settings/organization/mcp
- file:apps/web/app/api/settings/organization/mcp/route.ts
- file:packages/contracts/types/src/connector-release.ts
- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether the Tauri desktop has any screen for the catalog.
- Whether any trigger bumps organization_policy_revisions on an MCP change.
- Retention period of the audit events.
- Whether a member's chat actually receives published servers while connectors are 'coming soon'.
- Which plans can open the workspace console page.
- Whether published servers needing credentials work for members.
