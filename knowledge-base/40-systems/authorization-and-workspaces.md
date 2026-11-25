---
id: "SYS-authorization-and-workspaces"
type: "system"
title: "Authorization, workspaces and sharing"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Authorization, workspaces and sharing

Every cloud request resolves a user, then a workspace (Personal, or one organization the user actively belongs to). The database repeats that check with row-level security (RLS) for the restricted app_rls role. Inside a workspace, roles bundle permissions and projects, chats, artifacts and connectors can be shared. Source-reading guards keep server code from skipping RLS. Nothing here has been run by this page's author.

## What it is and why it exists

This page covers who may do what in the cloud side of AGI Workforce, and how the server ties a request to a person and a workspace.

**Terms.**
- **Account**: one person. The account id is the identity provider's subject mapped to an internal id (`userId`).
- **Organization**: the billed tenant (a team or company). Table `table:organizations`.
- **Workspace**: the container content lives in. Two kinds: Personal (the row has `organization_id` NULL) and Organization. [code] (packages/contracts/types/src/workspace.ts:1-6, apps/web/lib/server/workspace-scope/index.ts:47-50). Migration 0234 adds a `workspaces` table, but the live code scopes by `organization_id`; see Gaps.
- **Membership**: a row in `table:organization_members` with a `role` and a `status`. Only status `active` carries access. [code] (packages/contracts/types/src/workspace.ts:40-47).
- **RLS (row-level security)**: the database refuses rows the caller may not see, even if the application forgets a `where` clause.

**Why it exists.** The product sells team and enterprise controls (admin visibility, shared projects, governed content, removal of departed members). Personal content must stay personal, and an admin may read only the active workspace's content, never personal content. [code] (apps/web/db/neon/0110_active_workspace_content_scope.sql:1-14, apps/web/lib/server/workspace-scope/index.ts:98-105).

**Scope of the model.** [inferred] This is a server and database model. The six apps do not enforce it themselves; they send a bearer token (or the web session cookie) and, optionally, a workspace selector header. Local content on a device (mode:local) never reaches this layer; see Rules.

Related pages: SYS-chat-turn-pipeline (turns run under the scope resolved here).

## How it works today

### 1. Who is calling (authentication)
`getClerkAuthUser` in apps/web/lib/api-auth.ts:427 accepts three credential kinds:
1. **API key** (`sk_live_` or `sk_test_` prefix). Allowed only on routes that declare an `apiKeyScope`, and only if the key carries that scope. [code] (apps/web/lib/api-auth.ts:436-448)
2. **Bearer token**: a developer (device) token, an identity-provider session token, or a native session token. A session token that itself carries a surface claim is refused as a bearer. [code] (apps/web/lib/api-auth.ts:~340-420)
3. **Cookie session** (web), through `getCookieSessionAuthUser` (apps/web/lib/api-auth.ts:494).

After the credential is accepted, the same gates run: absolute session lifetime, account lifecycle active (`assertAccountActive`, :205), account-security step, workspace MFA policy, IP allow list, tenant lockdown. [code] (apps/web/lib/api-auth.ts:205-230, 449-520)

### 2. Which workspace (the active organization)
`resolveActiveOrganizationId` (apps/web/lib/services/active-workspace-service.ts:63) decides it in this order:
1. Request header `x-agi-organization-id` (constant `MANAGED_CLOUD_ORGANIZATION_HEADER`, packages/contracts/cloud-contracts/src/conversation-contract.json:5). The value `personal` means Personal (NULL). A malformed value gives 400. A value for an organization where the caller has no `active` membership gives 403 `You are not a member of that workspace`.
2. A cached selection (re-checked against membership; a stale one is cleared).
3. The saved selection in `user_settings.settings.workspace.activeOrganizationId`, joined to an `active` membership.
If the lookup itself fails, the request is denied with 503 (fail closed). [code] (apps/web/lib/server/rls-db.ts:56-68)

The selection is changed with `PUT /api/settings/organization/active` (body `{organizationId: uuid|null}`), under an advisory lock, with CSRF and a rate limit. [code] (apps/web/app/api/settings/organization/active/route.ts:11-40)

### 3. How the database learns the scope
`getUserScopedDb(request, options)` (apps/web/lib/server/rls-db.ts:116) returns `{db, userId, organizationId, surface}`:
- For a session token or cookie, it builds a pooled adapter `getRlsCapableDb().withUser(token).withOrg(organizationId)`. Inside each transaction the data layer runs `SET LOCAL ROLE app_rls` and sets `request.jwt.claim.sub` and `request.jwt.claim.org_id`. [code] (apps/web/lib/server/rls-db.ts:81-105, packages/platform/data-layer/src/adapters/sql-session.ts:52-56)
- `withUser` decodes the token subject without checking the signature, so it is default-deny: it throws unless the adapter was built with `unsafeAllowUnverifiedJwtSubject: true`, and the web code verifies the token first. [code] (packages/platform/data-layer/src/adapters/neon.ts:504-522, apps/web/lib/server/rls-db.ts:30-37)
- For an API key, or for an owner policy recovery route, it uses `createClaimedUserScopedDb`, which runs the same `set local role app_rls` and `set_config` calls on the service connection. It cannot be rebound to another user. [code] (apps/web/lib/server/claimed-user-scope-db.ts:20-72)
- The other handle, `getNeonDb()` (apps/web/lib/server/neon-db.ts), is the privileged owner connection. It bypasses RLS. Code using it must carry the user and workspace predicate by hand. [code] (apps/web/scripts/../../../scripts/check-rls-boundary.mjs:13)

### 4. What the database enforces
The current rule for the content tables (`web_conversations`, `user_projects`, `web_artifacts`, `user_memories`, `scheduled_tasks`, `cloud_agent_runs`, `user_connectors`, `user_custom_connectors`, `search_history`, and more) is `app_row_is_visible(user_id, organization_id)` as last defined in migration 0272:
- The owner sees a row only when its `organization_id` equals the active org (NULL equals NULL for Personal), and, for an org row, only while still an active member.
- Someone else sees an org row only if it belongs to the active org and they hold the `content.govern` permission.
- Personal rows are never visible from inside an organization, and the reverse. An admin cannot read personal content.
[code] (apps/web/db/neon/0272_active_membership_authorization.sql:76-90). `app_row_is_writable` (migration 0110, lines ~34-45) lets a caller write only their own row, in the active workspace, and only if a member of it. [code]

If the GUCs are unset, the helper functions return NULL and every comparison fails closed. [code] (apps/web/db/neon/0073_tenancy_foundation.sql, header "Fails closed")

### 5. Roles and permissions
A role is a named set of permissions. Built-in roles live in `table:organization_roles` with `organization_id` NULL: `primary_owner`, `owner`, `admin`, `member`, `viewer`. [code] (apps/web/db/neon/0200_organization_permission_grid.sql:~96-140)
- The membership column `organization_members.role` holds `owner`, `admin`, `member` or `viewer`. `owner` means the single **Primary Owner** (unique index from 0085). Only the Primary Owner holds `ownership.transfer`, `workspace.delete`, `billing.contracts.manage`; a check constraint forbids any other role from carrying them. [code] (0200 constraints `organization_roles_primary_owner_permissions`)
- A member's permissions are the union of: the built-in role for their membership role, extra roles in `organization_member_roles`, and roles of every SCIM directory group they belong to. Only `status = 'active'` members get any (migration 0272). [code] (apps/web/db/neon/0272_active_membership_authorization.sql:5-58)
- SQL helper `app_has_org_permission(org, key)` (0200:328) answers policies. TypeScript `requireMemberPermission` (apps/web/lib/services/organization-permission-service.ts:95) answers routes, calling `evaluateAuthorization`.
- Permission keys exist in two forms: legacy (`content.read`, `sharing.manage`, `members.manage` ...) stored on grants and used by RLS, and canonical (`feature.content.view`, `admin.members.manage` ...). A resolved set carries both and `manage` implies `view`. [code] (packages/contracts/types/src/enterprise/permissions.ts:1-80, apps/web/db/neon/0248_permission_namespaces_and_scim_group_membership_lock.sql header)
- A role grant is refused unless the granter holds every permission in it (no self-escalation), enforced in WITH CHECK of the grant tables and in TypeScript (`permissionsBeyondGranter`). [code] (packages/contracts/types/src/enterprise/authorization.ts:~85-100)
- `evaluateAuthorization` runs five stages in order and the first refusal wins: membership, entitlement (plan features), permission, policy (feature switches, allowed surfaces, allowed countries, reasoning-effort cap), rollout. Personal scope (organizationId null) is allowed outright. [code] (packages/contracts/types/src/enterprise/authorization.ts:20-26, 180-290)
- Team administration also needs the plan capability `team_admin` (plans team, team_premium, enterprise); SSO, SCIM and admin controls need `enterprise_controls` (enterprise only). [code] (packages/contracts/types/src/billing-catalog.ts:362-363, apps/web/app/api/settings/team/team-admin-access.ts:21)

### 6. Workspace administration routes
About 48 route files under `/api/settings/organization/*` manage the workspace (members, invitations, roles, groups, policy, audit, shared items, keys, retention, legal holds, spend limit, plugins, MCP, data region, ownership transfer, leave). Most call `resolveWorkspaceApiCaller(request, route, method)`, which looks the route up in `WORKSPACE_ROUTE_ACCESS` (route, method, one permission, whether workspace API keys are allowed). A route absent from the table is closed to automation. Order inside: member check, `team_admin` entitlement, then permission. [code] (apps/web/lib/server/service-principals/caller.ts:39-75, apps/web/lib/server/service-principals/route-access.ts:24)

Workspace admin API keys have the prefix `agiadm_` and carry permission scopes. [code] (apps/web/lib/server/admin-api-keys.ts:19)

### 7. Joining, leaving, removal
- **Invitations**: 7-day lifetime, at most 10 resends, token stored hashed; roles invitable are admin, member, viewer. [code] (apps/web/lib/services/organization-invitation-service.ts:16-19)
- **Leave**: a non-owner leaves by deleting their own membership. The Primary Owner must name an active successor who passes an entitlement check; the old owner becomes admin first. A sole owner cannot leave. Advisory locks serialise it. [code] (apps/web/lib/services/organization-membership-service.ts:117-226)
- **Removal by an admin**: `DELETE /api/settings/organization/members/{userId}` runs `removeMember`, drops the cached active-workspace entry, then `deprovisionMember`. [code] (apps/web/app/api/settings/organization/members/[userId]/route.ts:96-140)
- **Deprovision** revokes what this workspace issued: provider sessions (only if the member's recorded selection was this workspace), device refresh-token families for the (user, organization) pair, mobile Siri/intent tokens, API keys for that pair, and unshares connectors the leaver shared. Each step is independent; failures are returned as `errors`, not thrown. Personal credentials are not touched. [code] (apps/web/lib/services/deprovision-service.ts:176-291)

### 8. Sharing
| Thing | Audience options | Who may change | Mechanism |
|---|---|---|---|
| Project | whole workspace (`default_access` read), invited members only (`none`), per-member `read`/`write` grants | someone with `sharing.manage`, or the project's owner if their role holds `content.share` | `table:organization_shared_projects`, `table:organization_project_access`; RLS 0086/0200/0315/0316 |
| Project edit (write) | only an explicit per-member `write` grant, and only while the member still holds `content.share` | as above | RLS policies 0217, re-stated in 0358; the share's default never confers write |
| Conversation (shared session) | `public` (anyone with the 24-character token, until expiry) or `organization` (members holding the grant row) | the share's owner | `table:shared_sessions`, `table:organization_shared_sessions` (0186) |
| Artifact, connector, schedule, skill | workspace-wide shares | owner with `content.share` or admin | `organization_shared_artifacts` (0184), `organization_shared_connectors`, `scheduled_task_shares` (0311), skill share route |
[code] (apps/web/lib/services/org-sharing-service.ts:72-130, 216-270; apps/web/db/neon/0315_private_shared_projects.sql, 0316_project_owner_sharing.sql, 0358_shared_project_editor_needs_share_permission.sql, 0186_organization_shared_sessions.sql)

A project is readable if the caller owns it in the active workspace, or it is shared into the active org and the caller's effective access (`coalesce(grant, default_access)`) is `read` or `write`. That rule is written once as `READABLE_PROJECT_SCOPE_SQL` for statements on the privileged connection. [code] (apps/web/lib/server/project-read-access.ts:7-46)

Reading a shared session: `GET /api/share/{token}` tries the public row first on the privileged connection (needs `visibility = 'public'`), then falls back to the signed-in cookie user's RLS connection for organization-only shares. Expired shares answer 410. [code] (apps/web/app/api/share/[token]/route.ts:46-100)

### 9. Platform admin (operators) is separate
Platform operators are user ids listed in the environment variable named `AGI_PLATFORM_ADMIN_USER_IDS`. An organization `owner` or `admin` never qualifies. A non-operator, or a device token, gets 404, not 403. An unset list denies everyone. [code] (apps/web/lib/auth-guards.ts:26-52, apps/web/features/admin/lib/platform-admin-access.ts:6-24). Routes under `/api/admin/*` are checked by `check:admin-route-guards`. Operator access to a customer's content goes through time-limited support access grants with scopes (conversations, files, projects, connectors, billing, audit_logs, workspace_settings, background_jobs) and a hash-chained trail. [code] (apps/web/lib/server/support-access-service.ts:11-30)

### 10. Identity provisioning
SSO and SCIM 2.0 exist under apps/web/lib/server/sso and apps/web/lib/server/scim, with the SCIM endpoints under `/api/scim/v2`. SCIM-owned group membership may only be written by the provisioner (migration 0248). [code] (docs/compliance/directory-sync.md:1-25, apps/web/db/neon/0248_permission_namespaces_and_scim_group_membership_lock.sql header)

## Implementation map

| Concern | File | Role |
|---|---|---|
| Request to RLS-scoped db | file:apps/web/lib/server/rls-db.ts | `getUserScopedDb`, `getCurrentUserRlsDb`, `getCurrentCookieUserRlsDb`, `getVerifiedBearerUserScopedDb` |
| Claimed scope on service pool | file:apps/web/lib/server/claimed-user-scope-db.ts | binds `app_rls` and the two GUCs per statement |
| Role and GUC binding | file:packages/platform/data-layer/src/adapters/sql-session.ts | `SET LOCAL ROLE`, `set_config` |
| Credential checks | file:apps/web/lib/api-auth.ts | API key, bearer, cookie, lifetime, account, MFA, IP gates |
| Active workspace | file:apps/web/lib/services/active-workspace-service.ts | resolve, persist, list, clear selection |
| Workspace predicates | file:apps/web/lib/server/workspace-scope/index.ts | `WORKSPACE_SCOPED_CONTENT_TABLES`, `workspaceOwnedPredicate`, `workspaceAdminVisiblePredicate`, `ownerIsActiveWorkspaceMemberSql` |
| What a switch changes | file:apps/web/lib/server/workspace-scope/switch-surfaces.ts | per surface: partitioned, account-wide, organization-only |
| Project read rule | file:apps/web/lib/server/project-read-access.ts | `READABLE_PROJECT_SCOPE_SQL`, `selectReadableProject` |
| Decision function | file:packages/contracts/types/src/enterprise/authorization.ts | five stages, denial codes |
| Permission keys | file:packages/contracts/types/src/enterprise/permissions.ts | canonical and legacy keys, aliases |
| Membership vocabulary | file:packages/contracts/types/src/workspace.ts | statuses, `membershipGrantsAccess` |
| Route permission check | file:apps/web/lib/services/organization-permission-service.ts | `requireMemberPermission`, `requireOrganizationPermission` |
| Workspace API caller | file:apps/web/lib/server/service-principals/caller.ts and route-access.ts | per-route permission table |
| Sharing | file:apps/web/lib/services/org-sharing-service.ts, org-shared-session-service.ts, org-shared-artifact-service.ts, org-shared-connector-service.ts | grants and reads |
| Membership lifecycle | file:apps/web/lib/services/organization-membership-service.ts, organization-invitation-service.ts, organization-member-admin-service.ts, organization-owner-protection.ts, deprovision-service.ts | leave, invite, role change, remove, revoke |
| Operator access | file:apps/web/lib/auth-guards.ts, apps/web/features/admin/lib/platform-admin-access.ts, apps/web/lib/server/support-access-service.ts | platform admin allowlist, support grants |
| Admin UI | apps/web/features/admin, apps/web/features/workspaces, apps/web/features/workspace-console, apps/web/features/teams | screens |
| Database policies | apps/web/db/neon/0037, 0073, 0100, 0110, 0200, 0217, 0234, 0236, 0248, 0272, 0315, 0316, 0358 | RLS and helper functions |
| Guards | scripts/check-db-isolation.mjs, check-rls-boundary.mjs, check-membership-isolation.mjs, check-membership-revocation.mjs, check-membership-exit-revocation.mjs, check-membership-unattended-work.mjs, check-memory-isolation.mjs, check-admin-route-guards.mjs, check-org-permissions.mjs, check-org-role-checks.mjs, check-workspace-cache-scope.mjs, check-workspace-policy-enforcement.mjs | source-reading checks |
| Live probe | file:apps/web/scripts/rls-probe.mjs | cross-tenant probe against a real branch database |

**Routes (api:).** `api:PUT /api/settings/organization/active`; `api:GET /api/settings/workspaces`, `api:PUT /api/settings/workspaces`; `api:GET|POST|PATCH|DELETE /api/settings/organization`; `api:GET /api/settings/organization/members`; `api:GET|PATCH|DELETE /api/settings/organization/members/{userId}`; `api:PUT /api/settings/organization/members/{userId}/roles`; `api:GET|POST /api/settings/organization/invitations`; `api:DELETE /api/settings/organization/invitations/{invitationId}`; `api:DELETE /api/settings/organization/leave`; `api:POST /api/settings/organization/transfer-ownership`; `api:GET|POST /api/settings/organization/roles`; `api:PATCH|DELETE /api/settings/organization/roles/{roleId}`; `api:GET|POST /api/settings/organization/groups`; `api:GET /api/settings/organization/shared`; `api:PUT|PATCH|DELETE /api/settings/organization/shared/projects/{projectId}`; `api:POST|GET|PUT|DELETE /api/share`; `api:GET|PATCH|DELETE /api/share/{token}`; `api:GET /api/settings/organization/policy/effective`. [code] (route files listed by directory scan of apps/web/app/api/settings)

## Data and state

**Tables (database, Postgres on Neon).**
| Table | Holds | Notes |
|---|---|---|
| table:organizations | the tenant | 0015 |
| table:organization_members | `organization_id`, `user_id`, `role`, `status` (invited, active, suspended, deprovisioned), `seat_type`, generated `is_primary_owner` | 0015, 0085, 0234 |
| table:organization_invitations | pending invites, token hash, expiry | 0085 family |
| table:organization_roles | built-in (org NULL) and custom roles with permission arrays | 0200 |
| table:organization_member_roles, table:organization_group_roles, table:organization_group_managers | extra roles, directory-group roles, delegated group managers | 0200, 0248 |
| table:organization_admin_delegations | scoped, expiring admin delegation; revoke sets `revoked_at` | 0256 |
| table:organization_shared_projects, table:organization_project_access | project shares and per-member access (`read`, `write`, `none`) | 0086, 0315 |
| table:organization_shared_sessions, table:shared_sessions | conversation shares and their audience | 0051, 0186 |
| table:user_settings | `settings.workspace.activeOrganizationId` (the saved selection) | active-workspace-service.ts |
| content tables with `organization_id` | conversations, projects, artifacts, memories, scheduled tasks, cloud agent runs, connectors, search history, media, api_keys, usage events | NULL means Personal; 0073, 0110 |
| table:scim_group_members | directory group membership, written only by the provisioner | 0248 |

**Database roles.** `app_rls` is a NOLOGIN role without BYPASSRLS; user queries run as it. The owner role bypasses RLS and is used by `getNeonDb()`. [code] (apps/web/db/neon/0037_rls_user_isolation.sql:60-80)

**Session variables (GUCs).** `request.jwt.claim.sub` (user) and `request.jwt.claim.org_id` (active organization) are set per transaction with `set_config(..., true)`, so they end at commit. [code] (packages/platform/data-layer/src/adapters/sql-session.ts:52-56)

**Caches.** The active organization id is cached per user (`getCachedActiveOrganizationId`) and invalidated on member change, selection change, and removal. [code] (apps/web/lib/services/active-workspace-service.ts:90-100, apps/web/app/api/settings/organization/members/[userId]/route.ts:118) The IP allow list has its own cache (apps/web/lib/services/organization-ip-allow-list-cache.ts). Guard `check:workspace-cache-scope` covers cache keys.

**Device stores.** [unknown] No device store holds authorization decisions in the files read. Mobile reads and sets the workspace through `/api/settings/organization` and `/api/settings/organization/active` (apps/mobile/src/features/team/service.ts:68,123). The CLI caches the effective workspace policy in a sealed file keyed through the OS keychain service name `com.agiworkforce.cli.workspace-policy`, refreshed hourly, usable up to 7 days old. [code] (apps/cli/src/cloud/workspace_policy.rs:14-24)

**What a workspace switch changes.** `WORKSPACE_SWITCH_SURFACES` lists each surface as partitioned (chat history, projects, artifacts, memory, and others), account-wide, or organization-only. [code] (apps/web/lib/server/workspace-scope/switch-surfaces.ts:25-60)

## Rules: access, plans, modes

**Plan rules.** [code]
- Creating or administering a team needs plan capability `team_admin`: plan:team, plan:team_premium, plan:enterprise (packages/contracts/types/src/billing-catalog.ts:362). SSO, SCIM and admin controls need `enterprise_controls`: plan:enterprise only (billing-catalog.ts:363).
- When an organization has no subscription of its own, team administration follows the owner's personal plan; handing ownership to someone whose plan lacks the capability fails with 409 `ORG_TRANSFER_ENTITLEMENT_REQUIRED`. [code] (apps/web/lib/services/organization-membership-service.ts:60-80)
- Individual plans are not gates for Personal scope: personal scope allows everything the entitlement system allows; `evaluateAuthorization` returns allowed for a null workspace. Quotas and usage accounting are a different layer; see SYS-chat-turn-pipeline and the subscription pages. [inferred]
- Product decision (owner memory, not a project document): no subscription sales on any surface before 2027-01-01. That bears on who can hold paid team seats today. [unknown] whether code gates this; not read.

**Mode rules.**
| Mode | Authorization behavior |
|---|---|
| mode:cloud | Full model on this page. Every request is authenticated, scoped to a user and a workspace, and the database enforces RLS. |
| mode:own-key | [inferred] A request that still goes through our server (account, sync, sharing) is authorized the same way. A call straight from the device to a provider is outside this layer. The requirement is that Local-to-BYOK is an explicit fork with consent and a visible provider label (AGENTS.md section 6, [requirement]). Not traced in this page. |
| mode:local | [requirement] Local inference on mobile and desktop does not require a paid plan (task brief). [unknown] What the code requires for sign-in in local mode was not read here. Nothing in this layer is consulted for content that never leaves the device. |

**Trust boundary rule.** Local, BYOK and Managed Cloud are separate trust boundaries; nothing may silently route a Local chat to BYOK or managed cloud. [requirement] (AGENTS.md section 6).

**Hard rules the code enforces.**
1. Inactive members get nothing: `suspended`, `deprovisioned` and `invited` memberships give no permissions and no workspace content. [code] (apps/web/db/neon/0272_active_membership_authorization.sql:5-20, 62-73)
2. An admin sees other members' rows only in the active organization, never personal rows. [code] (apps/web/lib/server/workspace-scope/index.ts:98-125)
3. Only the Primary Owner can transfer ownership, delete the workspace, or manage the billing contract. [code] (0200 constraints; packages/contracts/types/src/enterprise/authorization.ts:~228)
4. Viewer is read-only: `content.read` and nothing else; a viewer cannot share into the workspace or hold write access on a shared project. [code] (apps/web/db/neon/0200_organization_permission_grid.sql header; 0358 header)
5. A role grant cannot exceed what the granter holds. [code] (authorization.ts:85-100)
6. Platform operator access is by an environment allowlist, not by org role; customer admins cannot confirm the operator surface exists (404). [code] (apps/web/lib/auth-guards.ts:10-14)
7. Workspace API keys reach only routes listed in `WORKSPACE_ROUTE_ACCESS`, at the same permission a person needs. [code] (route-access.ts:18-24)
8. A public share link is a bearer capability: anyone with the token reads it until expiry; `organization` visibility closes the anonymous page. [code] (apps/web/lib/services/org-shared-session-service.ts:15-21)

## Differences between apps

| App | How it reaches authorization | Evidence |
|---|---|---|
| surface:web | Cookie session through `getCookieSessionAuthUser`; workspace from the saved selection or header; RLS connection. Hosts the admin and workspace screens (apps/web/features/admin, workspaces, workspace-console, teams). | [code] apps/web/lib/server/rls-db.ts:116-165 |
| surface:desktop | The public Desktop (Electron) shows the hosted web app, so it inherits the web path. The Tauri build is retained internal code and reaches Rust only through registered commands. | [requirement] AGENTS.md section 5. Not traced further here. |
| surface:mobile | Bearer token. Lists workspaces, switches with `PUT /api/settings/organization/active`, shows team administration and project sharing; reloads chats after a switch. | [code] apps/mobile/src/features/team/service.ts:68,123; switchWorkspace.ts:1-20; apps/mobile/src/features/projects/projectSharing.ts:5 |
| surface:cli | Bearer or device token. Reads `/api/settings/organization` and caches the effective workspace policy, sealed on disk, refreshed hourly; a policy older than 7 days needs a fresh read. | [code] apps/cli/src/cloud/workspace_policy.rs:14-24; apps/cli/src/cloud/mod.rs:619 |
| surface:vscode | Reads `/api/settings/workspaces` for account memory. [unknown] whether it sends the organization header or applies workspace policy. In its source, "workspace" mostly means the editor workspace. | [code] apps/extension-vscode/src/memory/accountMemoryClient.ts:18 |
| surface:chrome | Carries an `organizationId` on synced conversations (`cloudSync.organizationId`). [unknown] how it selects the workspace. | [code] apps/extension/src/features/cloud-bridge/conversationSync.ts:86,452-497 |

Device (developer) tokens are a separate surface class: they cannot reach platform-admin routes (404), and their refresh families are tied to a workspace since migration 0187. [code] (apps/web/lib/auth-guards.ts:38-42, apps/web/lib/services/deprovision-service.ts:176-200)

The shared client for the cloud chat API sends the organization header on every call when an `organizationId` is passed, using `personal` for NULL. [code] (packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts:258-280)

## Failure handling

| Situation | Result | Evidence |
|---|---|---|
| No or bad credential | 401 | [code] apps/web/lib/api-auth.ts:520-527 |
| API key on a route with no `apiKeyScope`, or wrong scope | `ApiKeyScopeError` | [code] apps/web/lib/api-auth.ts:437-443 |
| Header names an organization the caller is not an active member of | 403 `You are not a member of that workspace`; a rejection metric is recorded | [code] active-workspace-service.ts:75-79 |
| Header is not a UUID or `personal` | 400 validation error | [code] active-workspace-service.ts:70-73 |
| Workspace lookup throws or times out | 503, request denied (fail closed) | [code] rls-db.ts:56-68, api-auth.ts:240-256 |
| Saved selection points to an org the user left | resolves to Personal and clears the cache | [code] active-workspace-service.ts:85-93 |
| Tenant lockdown, MFA policy, IP allow list | request refused before any query | [code] api-auth.ts:159-171, 450-460 |
| GUC unset in the database | helper functions return NULL, policies deny | [code] 0073 header |
| Permission missing | `EnterpriseDenialError` with a code (`not_a_member`, `permission_denied`, `primary_owner_only`, `policy_denied`, ...) and a stage | [code] authorization.ts:28-57 |
| Caller has no membership at all | refused before the decision function, because the decision function treats an absent workspace as Personal and allows | [code] organization-permission-service.ts:60-63 |
| Deprovision step fails | other steps still run; errors returned and logged as an error | [code] deprovision-service.ts:176-291 |
| Provider session listing fails during deprovision | no sessions revoked, error recorded; the membership delete is what cuts the workspace off | [code] deprovision-service.ts:60-100 |
| Shared link expired | 410 `SHARE_EXPIRED` | [code] apps/web/app/api/share/[token]/route.ts:60-72 |
| A guard finds an unscoped statement | CI check exits 1 with the file and table | [code] scripts/check-rls-boundary.mjs:99-130 |
| Operator allowlist unset | every platform-admin route answers 404 and an error is logged | [code] auth-guards.ts:29-35 |

**Weak points.** Revocation of already-issued sessions depends on the identity provider answering; unreached sessions are reported, not retried. The membership delete still stops the next request from resolving the workspace. [code] (deprovision-service.ts:13-40)

## How it should work

[requirement] AGENTS.md section 6: Local, BYOK and Managed Cloud are separate trust boundaries; security fails closed; validate at trust boundaries; least privilege. AGENTS.md section 9: an action a user cannot undo asks first, naming the consequence (`useConfirmAction`).

[requirement] AGENTS.md section 5: `apps/web/db/neon` is an append-only, checksummed migration chain; add the next numbered file, never edit an applied one.

[requirement] The task brief: one consistent experience across models, subscription capabilities on every app connect to one AGI Subscription system, local inference is free of any paid subscription, execution boundaries are explicit.

[proposed] Items the code leaves open, offered as suggestions:
1. One authority for the workspace on every non-web surface, with the same selection header and the same denial copy, tested per surface (VS Code and Chrome are unverified today).
2. Retire the baseline in `check-db-isolation.mjs` (18 files that still read Personal and every organization at once) to zero, since each entry is a real cross-workspace read.
3. Move the roughly 25 policies that still pass the role pair `array['owner','admin']` to permission checks, as migration 0100 itself asks when each is next edited.

## Gaps

Implementation status is separate from verification status below.

**Implemented (code present and connected) [code]**
- RLS helpers, content-table policies, workspace-mutual-exclusion, permission grid, membership status gating, shared-project policies (migrations listed above).
- Request-to-scope path in `rls-db.ts`, claimed scope for API keys, active-workspace resolution.
- Deprovision, leave, invitation, role change, ownership transfer services and routes.

**Known gaps**
1. **Workspace-scope ratchet.** 18 files are listed in `WORKSPACE_SCOPE_BASELINE` as reading Personal and every organization at once (for example cloud-agent-run-service.ts with 25 statements, mcp-custom-connections.ts with 5, user-connector-tools.ts with 4). The guard's own comment calls each a real leak until it reaches zero. [code] (scripts/check-db-isolation.mjs:~200-222)
2. **Privileged-connection allowlist.** 78 files may reach `getNeonDb()` over user-owned tables, each with a reason; none is marked `pending scoped migration` in the current file. [code] (scripts/config/rls-boundary-allowlist.json)
3. **Unattended-work baseline.** Statements that run work with nobody present and do not check owner membership are recorded in scripts/config/membership-unattended-work-baseline.json and may only shrink. Contents not read. [unknown]
4. **Workspaces table not the scoping key.** Migration 0234 adds `public.workspaces` and says every `organization_id` column points at the primary workspace; live scoping still uses `organization_id` and an organization can hold only the primary workspace for now. [inferred] from 0234 header and the absence of workspace-id predicates in the code read. Not verified.
5. **No first-party document of the full model.** The closest are migration headers and docs/architecture/code-knowledge-graph.md, which records source-level slices and says no runtime acceptance is claimed. [code] (docs/architecture/code-knowledge-graph.md:60-66)
6. **Surface coverage unknown** for VS Code and Chrome (see Differences).
7. **Stale header comments** in migrations (see outdated documents) can mislead a reader about what is applied.
8. **Role pair duplication.** `isOrganizationAdminRole` and `isOrgAdminRole` still exist beside the permission grid; guard `check:org-role-checks` exists to stop inline copies. [code] (packages/contracts/types/src/enterprise/index.ts:209, apps/web/lib/services/org-sharing-service.ts:68)

**Verification status**: see next section. No run was made for this page.

## How to verify

Nothing below was run by the author of this page. No project document found records a passing live run of these checks. [unknown]

**Source-reading guards** (they scan the working tree, so stage first; AGENTS.md section 12):
| Command | What it proves |
|---|---|
| `pnpm check:db-isolation` | each SQL statement over a user-owned table carries an owner or workspace predicate; workspace-scope ratchet; tables with no isolation decision fail |
| `pnpm check:rls-boundary` | a file that uses the BYPASSRLS handle over a user-owned table is on the allowlist, and the allowlist only shrinks |
| `pnpm check:membership-isolation` | statements over membership tables name the organization |
| `pnpm check:membership-revocation`, `check:membership-exit-revocation` | every way a membership ends revokes the credential classes |
| `pnpm check:membership-unattended-work` | background work re-asks whether its owner is still an active member |
| `pnpm check:memory-isolation` | memory reads carry the workspace predicate |
| `pnpm check:admin-route-guards`, `check:org-permissions`, `check:org-role-checks`, `check:workspace-cache-scope`, `check:workspace-policy-enforcement`, `check:client-trusted-authz` | related checks, all in the guard chain `pnpm check:llm-operability` |
[code] (package.json:247,250,332-334,422-423)

**Live database probe** (needs a Neon branch; do not point at production): `pnpm db:rls-probe` runs `apps/web/scripts/rls-probe.mjs`, which, for each membership status, checks `organization_member_permissions`, `current_app_org_role`, `app_row_is_visible`, `app_row_is_writable`. A new table needs a row in the probe (docs/development/troubleshooting.md:89). [code]

**Unit tests**: test:apps/web/lib/server/rls-db.test.ts, test:apps/web/lib/server/claimed-user-scope-db.test.ts, test:apps/web/lib/server/project-read-access.test.ts, test:apps/web/lib/server/workspace-scope/__tests__/workspace-scope.test.ts, test:apps/web/db/neon/active-workspace-content-scope-migration.test.ts, test:apps/web/db/neon/shared-project-editor-write-migration.test.ts. These read SQL text; per code-knowledge-graph.md, SQL-source fixtures are not live PostgreSQL proof. Run `apps/web` tests with the web package script, not the root runner.

**By hand (human-style)**: sign in as two accounts in two workspaces on a local database, switch workspace, and confirm a Personal chat does not appear in the organization and the reverse; demote a member to viewer and confirm they cannot share; remove a member and confirm their next request fails.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The server resolves a request's workspace from the x-agi-organization-id header (value 'personal' means Personal), else a cached selection, else the saved user setting joined to an active membership. | read in the code | `apps/web/lib/services/active-workspace-service.ts:63-110`; `packages/contracts/cloud-contracts/src/conversation-contract.json:5-6` |
| A header naming an organization where the caller has no active membership is refused with 403; a malformed selector gives 400; a failed lookup gives 503. | read in the code | `apps/web/lib/services/active-workspace-service.ts:70-79`; `apps/web/lib/server/rls-db.ts:56-68` |
| User queries run as the NOLOGIN, NOBYPASSRLS role app_rls, with request.jwt.claim.sub and request.jwt.claim.org_id set per transaction. | read in the code | `apps/web/db/neon/0037_rls_user_isolation.sql:60-80`; `packages/platform/data-layer/src/adapters/sql-session.ts:52-56`; `apps/web/lib/server/claimed-user-scope-db.ts:20-28` |
| getNeonDb() is the owner connection that bypasses RLS; code using it over user-owned tables must be on a ratcheting allowlist (78 entries, none marked pending). | read in the code | `scripts/check-rls-boundary.mjs:13-17`; `scripts/config/rls-boundary-allowlist.json` |
| Personal (organization_id NULL) and each organization are mutually exclusive scopes for content rows; an admin sees others' rows only in the active organization, never personal rows. | read in the code | `apps/web/db/neon/0110_active_workspace_content_scope.sql:1-14`; `apps/web/lib/server/workspace-scope/index.ts:98-125` |
| The latest app_row_is_visible (migration 0272) shows the owner their row in the active workspace only while an active member, and shows other members' org rows only to holders of content.govern. | read in the code | `apps/web/db/neon/0272_active_membership_authorization.sql:76-90` |
| Only membership status 'active' carries access; invited, suspended and deprovisioned memberships yield no permissions and no org role. | read in the code | `packages/contracts/types/src/workspace.ts:40-47`; `apps/web/db/neon/0272_active_membership_authorization.sql:5-20,62-73` |
| Built-in roles are primary_owner, owner, admin, member, viewer; permissions are a union of the membership role, extra roles and SCIM directory-group roles. | read in the code | `apps/web/db/neon/0200_organization_permission_grid.sql:45-140`; `apps/web/db/neon/0272_active_membership_authorization.sql:5-58` |
| organization_members.role 'owner' is the single Primary Owner; only it can transfer ownership, delete the workspace, or manage the billing contract, enforced by a check constraint on role rows. | read in the code | `apps/web/db/neon/0200_organization_permission_grid.sql:45-75`; `apps/web/lib/services/organization-permission-service.ts:84` |
| evaluateAuthorization runs five ordered stages (membership, entitlement, permission, policy, rollout); the first refusal wins and Personal scope is allowed outright. | read in the code | `packages/contracts/types/src/enterprise/authorization.ts:20-26,180-290` |
| A role grant cannot give permissions the granter lacks; this is enforced in RLS WITH CHECK and in TypeScript. | read in the code | `apps/web/db/neon/0200_organization_permission_grid.sql:45-52`; `packages/contracts/types/src/enterprise/authorization.ts:85-100` |
| Workspace routes resolve a caller through a per-route, per-method permission table; routes absent from it are closed to workspace API keys (prefix agiadm_). | read in the code | `apps/web/lib/server/service-principals/caller.ts:39-75`; `apps/web/lib/server/service-principals/route-access.ts:18-24`; `apps/web/lib/server/admin-api-keys.ts:19` |
| Team administration needs plan capability team_admin (team, team_premium, enterprise); SSO, SCIM and admin controls need enterprise_controls (enterprise). | read in the code | `packages/contracts/types/src/billing-catalog.ts:362-363`; `apps/web/app/api/settings/team/team-admin-access.ts:21-40` |
| A shared project is readable by its owner, or by a member whose coalesce(per-member grant, default_access) is read or write; 'none' hides it. Write needs an explicit per-member grant and a role that still holds content.share. | read in the code | `apps/web/lib/server/project-read-access.ts:7-46`; `apps/web/db/neon/0315_private_shared_projects.sql:1-40`; `apps/web/db/neon/0358_shared_project_editor_needs_share_permission.sql:1-40` |
| A project's owner can share it and choose who opens it if their role holds content.share; others need sharing.manage. | read in the code | `apps/web/lib/services/org-sharing-service.ts:91-118`; `apps/web/db/neon/0316_project_owner_sharing.sql:1-20` |
| Conversation shares have visibility 'public' (anyone with the 24-char token until expiry) or 'organization' (members with a grant row); only the share's owner changes it. | read in the code | `apps/web/lib/services/org-shared-session-service.ts:15-25`; `apps/web/db/neon/0186_organization_shared_sessions.sql:1-40`; `apps/web/app/api/share/[token]/route.ts:46-72` |
| Removing a member deletes the membership, clears the cached selection, then revokes this workspace's sessions, device tokens, mobile intent tokens, API keys and shared connectors for that (user, organization) pair; step failures are reported, not thrown. | read in the code | `apps/web/app/api/settings/organization/members/[userId]/route.ts:96-140`; `apps/web/lib/services/deprovision-service.ts:176-291` |
| Invitations last 7 days and can be resent at most 10 times; invitable roles are admin, member, viewer. | read in the code | `apps/web/lib/services/organization-invitation-service.ts:16-19` |
| A Primary Owner cannot leave without naming an active, entitled successor; a sole owner cannot leave and must delete the workspace. | read in the code | `apps/web/lib/services/organization-membership-service.ts:117-226` |
| Platform operators are user ids in an environment allowlist (AGI_PLATFORM_ADMIN_USER_IDS); org admins never qualify; non-operators and device tokens get 404; an unset list denies all. | read in the code | `apps/web/lib/auth-guards.ts:26-52`; `apps/web/features/admin/lib/platform-admin-access.ts:6-24` |
| Operator access to customer content goes through support access grants with scopes and a hash-chained trail that also records refused reads. | read in the code | `apps/web/lib/server/support-access-service.ts:11-30` |
| check:db-isolation keeps a workspace-scope baseline of 18 files that still read Personal and every organization together; the guard's comment calls each a real leak. | read in the code | `scripts/check-db-isolation.mjs:~200-222` (not found) |
| Guards check that every membership-ending path revokes credentials and that unattended work re-checks owner membership; both keep baselines that may only shrink. | read in the code | `scripts/check-membership-exit-revocation.mjs:1-20`; `scripts/check-membership-unattended-work.mjs:1-22`; `scripts/config/membership-unattended-work-baseline.json` |
| withUser() decodes the token subject without checking its signature and throws unless the adapter was built with unsafeAllowUnverifiedJwtSubject; the web code verifies tokens first. | read in the code | `packages/platform/data-layer/src/adapters/neon.ts:504-522`; `apps/web/lib/server/rls-db.ts:30-37` |
| Mobile switches workspace via PUT /api/settings/organization/active and reloads chats; the CLI caches the effective workspace policy hourly in a sealed file, valid up to 7 days. | read in the code | `apps/mobile/src/features/team/service.ts:123`; `apps/mobile/src/features/team/switchWorkspace.ts:1-20`; `apps/cli/src/cloud/workspace_policy.rs:14-24` |
| No document in the project records a live run of the RLS probe or the guards; this page's author ran nothing. | unknown | `docs/architecture/code-knowledge-graph.md:60-66`; `apps/web/scripts/rls-probe.mjs:1-40` |
| Local, BYOK and Managed Cloud are separate trust boundaries; nothing may silently route a Local chat to BYOK or managed cloud. | stated requirement | `AGENTS.md section 6` |
| The public Desktop (Electron) shows the hosted web app, so it inherits the web authorization path. | stated requirement | `AGENTS.md section 5` |

## Open questions

- Which migrations are applied in production? Several migration headers (0200, 0217, 0234, 0236, 0248) say NOT YET APPLIED, but later migrations and live code depend on them. The migration ledger on the target database was not read.
- Has pnpm db:rls-probe or any guard run green against a live database, and when? No project document found records it.
- Does surface:vscode send the x-agi-organization-id header or apply the effective workspace policy? Not found in the files read.
- How does surface:chrome choose the workspace it syncs conversations into?
- What does mode:local require for sign-in or account on mobile and desktop, and does local mode ever consult this layer? Not traced.
- What is in scripts/config/membership-unattended-work-baseline.json and membership-exit-revocation-baseline.json today (the open leaks)?
- Is the public.workspaces table (migration 0234) intended to become the scoping key instead of organization_id? Product choice left undecided by the code read.
- Are paid team seats purchasable today, given the owner's decision of no subscription sales before 2027-01-01? Not checked in code.
- Which of the roughly 25 policies still use the role pair array['owner','admin'] after 0200, and is any still reachable by a custom role holder?

## Project documents found out of date

- `apps/web/db/neon/0037_rls_user_isolation.sql (header, PRODUCTION ENFORCEMENT CAVEAT)`: Says the live web query path uses getNeonDb() without withUser(), so RLS is correct-but-dormant for the live path. The code says: getUserScopedDb binds withUser(token).withOrg(organizationId), or a claimed scope for API keys, and the data layer sets SET LOCAL ROLE app_rls per transaction. (apps/web/lib/server/rls-db.ts:81-105,116-165; apps/web/lib/server/claimed-user-scope-db.ts:20-28)
- `apps/web/db/neon/0073_tenancy_foundation.sql (header and app_row_is_visible body)`: The owner sees all their rows regardless of workspace, and org owner/admin see the active org's rows. The code says: Superseded twice: 0110 makes Personal and each organization mutually exclusive; 0272 makes visibility depend on active membership and the content.govern permission rather than the owner/admin role pair. (apps/web/db/neon/0110_active_workspace_content_scope.sql:18-32; apps/web/db/neon/0272_active_membership_authorization.sql:76-90)
- `apps/web/db/neon/0100_admin_role_helper.sql (rewired app_row_is_visible)`: Its app_row_is_visible body (owner/admin role helper) is no longer the live definition. The code says: The latest definition found is in 0272 and uses app_has_org_permission(..., 'content.govern'). (apps/web/db/neon/0272_active_membership_authorization.sql:76-90)
- `apps/web/db/neon/0200, 0217, 0234, 0236, 0248 headers ('NOT YET APPLIED : draft only')`: The label says the migration is a draft not yet applied. The code says: Applied-state is not recorded in these files. Later migrations (0272 depends on 0234 and 0248; 0315 depends on 0200 and 0217; 0358 restates 0217) and live code that reads organization_members.status and calls app_has_org_permission rely on them, so the label is stale. Whether each is applied to a given database is not established here. (apps/web/db/neon/0272_active_membership_authorization.sql:1-3; apps/web/db/neon/0315_private_shared_projects.sql:17-18; apps/web/lib/services/active-workspace-service.ts:95-105)
