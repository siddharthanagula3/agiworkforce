---
id: "F054-04"
type: "feature"
title: "Organization private marketplace and admin assignment"
aliases: ["Workspace plugins", "Organization plugins", "Private organization marketplace", "Plugin assignment", "Required / Installed by default / Available to install / Not available", "/workspace/plugins", "S54.06", "S54.30", "S54.31", "Installation approval request"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.06", "S54.30", "S54.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:GET /api/settings/organization/plugins", "api:POST /api/settings/organization/plugins", "api:PATCH /api/settings/organization/plugins", "api:GET /api/plugins/organization", "table:organization_plugins", "table:organization_plugin_files", "table:organization_plugin_members", "table:organization_plugin_group_settings", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "F054-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-04 Organization private marketplace and admin assignment

A workspace administrator uploads plugins or single skills to a private list for the workspace and sets each one to Required, Installed by default, Available to install or Not available, for everyone or for groups. Members see their allowed plugins on web and mobile. Approval requests for blocked plugins do not exist. There is no per-member assignment.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.06](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5406), [S54.30](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5430), [S54.31](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5431).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores plugins published by a workspace and resolves, for each member, which are required, on by default, available or hidden. Admins manage this on the workspace Plugins page; members see the result in their Plugins tab group 'From <workspace>' (apps/web/lib/services/organization-plugin-service.ts:214-470; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:33-55; apps/web/features/directory/constants.ts:35-43).

**Why it exists.** Brief S54.06 (private organization marketplace) and S54.30 (assign plugins to an organization, its groups or members). The migration says Claude lets an owner set each plugin to required, installed by default, available or not available and override it per group (apps/web/db/neon/0327_organization_plugin_group_settings.sql:3-12).

**Who uses it.** Workspace administrators with the policy.manage permission, and workspace members who receive the plugins.

**Problems it solves**

- A company shares its own skills and plugins without publishing them.
- Administrators decide who gets what, by default or by group.
- A required plugin cannot be turned off by a member.

**Use cases**

- An admin uploads a plugin zip and leaves it 'Available to install'.
- An admin marks a plugin 'Required' for everyone, so it stays on.
- An admin sets a plugin 'Installed by default' for the Engineering group only.
- A member opens Plugins and sees 'From <workspace>' plugins with a note.

## 2. User experience

**Where to find it**

- Admin: web route /workspace/plugins, nav label 'Plugins' with hint 'Plugins this workspace publishes, and who gets them' (apps/web/app/workspace/plugins/page.tsx:10-17; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:108-110). Page title 'Plugins', description 'Choose whether each plugin is required, installed, available or hidden.'
- Member (web and Desktop): Settings, Customize, Plugins, group 'From <workspace name>' (apps/web/features/directory/constants.ts:35-43).
- Member (mobile): Plugins, then 'Sources', section 'From <workspace>' with the preference and version (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:215-262).
- CLI, VS Code, Chrome: not available.

**Before you start**

- A workspace (organization) the person belongs to and that is the active workspace.
- Admin actions need the workspace permission policy.manage (apps/web/app/api/settings/organization/plugins/route.ts:36, 70-74).
- Members need plugins not switched off for the workspace.

**Screens and controls**

- Admin page: list 'Workspace plugins' with a per-plugin selector 'Setting for <plugin>' (Required, Installed by default, Available to install, Not available), group overrides 'Group settings for <plugin>' with 'Group to set <plugin> for' and 'Setting for that group', Retire (confirm title 'Retire <plugin>?', button 'Retire for everyone', 'Keep it published'), and 'Publish a plugin or a skill' with button 'Upload a plugin or skill' (apps/web/features/workspace-console/components/WorkspacePlugins.tsx:33-55, 240-300, 391-396, 545-580).
- Member: toggles to install and turn on or off, with notes 'Your workspace requires this plugin, so it stays on with all its skills.' and 'Your workspace offers this plugin to its members.' (apps/web/features/directory/constants.ts:27-31).

**Journey**

1. Admin opens /workspace/plugins and uploads a zip (a plugin, or a zip with one SKILL.md).
2. The server scans the files; findings that need review ask the admin to acknowledge before publishing.
3. The plugin appears with default setting 'Available to install' (a single skill defaults to 'Installed by default').
4. Admin changes the setting or sets group overrides.
5. Members open Plugins and see or receive the plugin as set; required plugins are on and locked.
6. Admin can retire a plugin for everyone.

**What the person sees and gets**

- Admin: 'Scanning and publishing…' with a spinner; caution list of scan findings with acknowledge and cancel; error alert 'That change could not be saved.' (apps/web/features/workspace-console/components/WorkspacePlugins.tsx:425-435, 570-600).
- Admin refusal: 'Your workspace role does not allow publishing plugins to this workspace.' or '... changing this workspace’s plugins.' (apps/web/app/api/settings/organization/plugins/route.ts:72, 120).
- Publishing a plugin that declares dependencies is refused with a message telling the admin to publish the dependencies too (apps/web/app/api/settings/organization/plugins/route.ts:37-38, 81-84).

**Settings**

- Per plugin: install preference (required, installed_by_default, available, not_available) and status (published or retired). Per group: install preference override. A member in several groups gets the most permissive of their groups' settings in the order required, installed by default, available, not available (apps/web/db/neon/0327_organization_plugin_group_settings.sql:6-11).
- Separate workspace allow and block lists of plugin keys can refuse installs (packages/client/client-runtime/src/connectors/policy.ts:105-128).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Admin API: GET list, POST publish zip, PATCH change setting or status, each with CSRF, rate limits and permission check; POST and PATCH write an 'admin_policy_changed' audit event (apps/web/app/api/settings/organization/plugins/route.ts:46-150).
- Service: publish with scan acknowledgement, replace files, update status or preference, replace group settings in a transaction (apps/web/lib/services/organization-plugin-service.ts:214-350).
- Member API: GET /api/plugins/organization lists the plugins the member may see with their resolved preference (apps/web/app/api/plugins/organization/route.ts:15-40; apps/web/lib/services/organization-plugin-service.ts:384-407).
- A required plugin cannot be turned off by the member (apps/web/lib/services/organization-plugin-service.ts:418-421).
- Install gate refuses a plugin that the workspace blocks or does not approve, with 403 PLUGIN_NOT_PERMITTED (apps/web/features/plugins/server/directory/install-gate.ts:21-52; packages/client/client-runtime/src/connectors/policy.ts:105-128; apps/web/features/plugins/server/directory/install-responses.ts:44-52).
- Tables organization_plugins, organization_plugin_files, organization_plugin_members, organization_plugin_group_settings and a member-preference SQL function (apps/web/db/neon/0326_organization_plugins.sql:33; apps/web/db/neon/0327_organization_plugin_group_settings.sql:29, 63).
- Mobile lists the workspace's plugins with install and turn-on states (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:215-262; apps/mobile/src/features/plugins/sourcesService.ts:23-38).

**Incomplete**

- The brief and first draft say assignment can target named members. The code supports workspace-wide and group settings only; the member's own install or enable state is the member's choice (apps/web/lib/services/organization-plugin-service.ts:306-350, 408-470). No per-member assignment was found.
- Whether plugin groups come from directory (SCIM) groups or managed groups is stated in the migration (apps/web/db/neon/0327_organization_plugin_group_settings.sql:14-18); the admin UI for creating groups was not traced.
- Workspace plugins cannot declare dependencies (apps/web/app/api/settings/organization/plugins/route.ts:37-38).

**Present but disconnected or switched off**

- Mobile admin features (add marketplace, submit) are flag-off, but the member list of workspace plugins is on (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:215, 267).

**Not available**

- Approval request: a member cannot ask an admin to approve a blocked plugin. No code, route or table for it was found in plugin, directory, organization-plugin or mobile plugin code (searched). Missing on all six apps (S54.31).
- Admin management on mobile, CLI, VS Code and Chrome: none found.
- The public Desktop shows the web page, so admin management is available there as the web page (doc: AGENTS.md section 5); no separate desktop code.

## 4. Required behaviour

**Established requirements**

- An organization has a private marketplace of plugins for its members. (source: S54.06 (brief))
- An admin can assign plugins to an organization, its groups or members. (source: S54.30 (brief); code supports organization and groups only)
- A member can request admin approval to install a blocked plugin. (source: S54.31 (brief); not built)
- Organization plugins are stored per organization with files, members and group settings. (source: apps/web/db/neon/0326_organization_plugins.sql:33; apps/web/db/neon/0327_organization_plugin_group_settings.sql:29)
- A member is refused when organization policy blocks a plugin. (source: apps/web/features/plugins/server/directory/install-gate.ts:40-48 (code))
- Security review of plugins should include organization approval requirements, and sharing should be private, project, organization or public with clear ownership and revocation. (source: doc: docs/product/competitive-guidance.md items 101-102)
- Revoked workspace permissions are explained without claiming installation. (source: doc: docs/product/experience-contract.md row W15)

**Acceptance criteria**

1. An admin with policy.manage can upload a zip and see the plugin listed as 'Available to install'; a member without the permission gets the refusal text.
2. Setting a plugin to Required makes it on for every member and a member's attempt to turn it off is refused with the 403 text.
3. Setting a plugin Not available hides it from members.
4. A group override replaces the workspace setting for members of that group.
5. A member in two groups gets the most permissive setting.
6. Publishing a zip with dependencies is refused.
7. Installing a plugin that the workspace policy blocks returns 403 PLUGIN_NOT_PERMITTED with the administrator message.
8. Each publish and change records an audit event.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Installation approval request' needs a new request record, an admin queue and a notification; none exist.
- [inferred] Per-member assignment can be approximated by creating a one-person group.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Request access' button on a blocked plugin that creates a request visible to admins.
- [proposed] Show admins which members have each plugin on.
- [proposed] Add per-member overrides if product wants the brief's 'named members'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Workspace plugins page | `apps/web/app/workspace/plugins/page.tsx` | Console page for admins. |
| component | WorkspacePlugins | `apps/web/features/workspace-console/components/WorkspacePlugins.tsx` | Admin UI: settings, group overrides, retire, upload (lines 33-600). |
| config | Workspace console nav | `apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx` | Adds the Plugins entry (line 108). |
| endpoint | GET/POST/PATCH /api/settings/organization/plugins | `apps/web/app/api/settings/organization/plugins/route.ts` | Admin list, publish, change; policy.manage; audit. |
| endpoint | GET /api/plugins/organization | `apps/web/app/api/plugins/organization/route.ts` | Member view of workspace plugins. |
| endpoint | /api/plugins/organization/{pluginId} | `apps/web/app/api/plugins/organization/[pluginId]/route.ts` | Member install and turn on or off; workspace feature gate (line 52). |
| endpoint | /api/plugins/organization/{pluginId}/settings | `apps/web/app/api/plugins/organization/[pluginId]/settings` | Member per-plugin settings. |
| service | organization-plugin-service | `apps/web/lib/services/organization-plugin-service.ts` | publish, update, list, member state, files (lines 136-525). |
| service | plugin-owned-source-service | `apps/web/lib/services/plugin-owned-source-service.ts` | Scan, hash and file handling of uploaded plugin content. |
| service | install gate | `apps/web/features/plugins/server/directory/install-gate.ts` | Workspace feature gate and per-plugin policy check before install (lines 21-84). |
| service | evaluatePluginAccess | `packages/client/client-runtime/src/connectors/policy.ts` | Blocked and allowed plugin lists (line 105). |
| service | evaluatePluginPolicyForUser | `apps/web/lib/services/connector-policy-gate.ts` | Loads workspace policy for a user and applies evaluatePluginAccess (line 216). |
| table | organization_plugins | `apps/web/db/neon/0326_organization_plugins.sql` | Published workspace plugins, status, preference (line 33). |
| table | organization_plugin_files | `apps/web/db/neon/0326_organization_plugins.sql` | Files of each workspace plugin. |
| table | organization_plugin_members | `apps/web/db/neon/0326_organization_plugins.sql` | Each member's install, enabled and chosen skills. |
| table | organization_plugin_group_settings | `apps/web/db/neon/0327_organization_plugin_group_settings.sql` | Per-group preference override (line 29). |
| schema | organization_plugin_member_preferences function | `apps/web/db/neon/0327_organization_plugin_group_settings.sql` | Resolves one member's preference per plugin (line 63). |
| config | install preference list | `packages/contracts/cloud-contracts/src/plugin-packages.ts` | The four preference values (lines 14-19). |
| service | web workspace plugin mapping | `apps/web/features/directory/services/plugins-directory.ts` | fetchWorkspacePlugins, updateWorkspacePlugin, toWorkspacePluginEntry (lines 426-520). |
| screen | Mobile workspace section | `apps/mobile/src/features/plugins/PluginSourcesScreen.tsx` | Shows 'From <workspace>' plugins (lines 215-262). |
| service | capability handshake | `apps/web/lib/services/capability-handshake-service.ts` | Workspace plugins feature switch (line 184). |
| test | admin route tests | `apps/web/app/api/settings/organization/plugins/__tests__/route.test.ts` | Permission, CSRF, publish, dependencies, change, 404 (lines 135-290). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin uploads a zip; the server reads the archive, refuses dependencies, scans, stores files and a row per plugin. | our servers | apps/web/app/api/settings/organization/plugins/route.ts:62-111; apps/web/lib/services/organization-plugin-service.ts:214 |
| Admin changes a preference or group settings; one transaction updates the plugin and replaces its group rows. | our servers | apps/web/lib/services/organization-plugin-service.ts:306-350 |
| Audit event 'admin_policy_changed' (severity warning) is written for publish and change. | our servers | apps/web/app/api/settings/organization/plugins/route.ts:90-103, 135-148 |
| Member opens Plugins; the member endpoint resolves each plugin's preference with the database function and returns it. | our servers | apps/web/app/api/plugins/organization/route.ts:26-37; apps/web/lib/services/organization-plugin-service.ts:384-407 |
| Member installs or turns on a plugin; the install gate checks workspace feature access and per-plugin policy before the change. | our servers | apps/web/app/api/plugins/organization/[pluginId]/route.ts:52; apps/web/features/plugins/server/directory/install-gate.ts:21-52 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Workspace plugin rows, files, scan verdict and findings | tables organization_plugins and organization_plugin_files | server side; read by every member's surface | retired plugins keep a retired_at date; removal rules not traced (apps/web/db/neon/0326_organization_plugins.sql:56) |
| Group overrides | table organization_plugin_group_settings | server side | removed when the plugin or group is deleted (on delete cascade) |
| Member state (installed, enabled, chosen skills) | table organization_plugin_members | account level across surfaces | not traced |
| Audit event admin_policy_changed | security audit log | server only | retention not traced |

**Models and providers.** No model or provider is used for publishing, assignment or install checks.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account in a workspace. |
| Permissions | Admin publish and change need policy.manage; member reads need membership; install needs the workspace plugins feature on (apps/web/features/plugins/server/directory/install-gate.ts:15-35). |
| Subscription | The workspace feature is controlled by administrators, not a plan, in the code I read (apps/web/lib/services/capability-handshake-service.ts:180-185). Whether the workspace console itself needs a particular plan was not traced (unknown). |
| Limits and metering | Admin writes use rate-limit buckets settings-org and settings-org-patch (apps/web/app/api/settings/organization/plugins/route.ts:48, 66). Upload limits: 2,000 files and 20,000,000 bytes expanded (apps/web/features/plugins/server/directory/constants.ts:131-132). |
| Feature flags | none found in the code for web. Mobile pluginMarketplaceAdmin does not gate the member list. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Workspace plugins live on our servers, so they are Cloud only. Web has no Local mode; mobile Local mode shows the Cloud gate (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:187). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| member lacks policy.manage | Refusal with role message; list shows canManage false. | apps/web/app/api/settings/organization/plugins/route.ts:70-74, 53 |
| no active workspace | Member endpoint returns organizationId null and an empty list. | apps/web/app/api/plugins/organization/route.ts:24-26 |
| required plugin turn-off | 403 'Your workspace requires this plugin, so it stays on with all its skills.' | apps/web/lib/services/organization-plugin-service.ts:418-421 |
| policy blocks or does not approve a plugin | 403 PLUGIN_NOT_PERMITTED with the administrator message; a dependency problem names the dependent plugin. | apps/web/features/plugins/server/directory/install-gate.ts:40-84; packages/client/client-runtime/src/connectors/policy.ts:112-126 |
| group not in this workspace | Validation error 'One of those groups is not in this workspace.' | apps/web/lib/services/organization-plugin-service.ts:299-302 |
| plugin not published by this workspace | 404. | apps/web/app/api/settings/organization/plugins/route.ts:131-133 |
| scan needs review | Caution list; admin must acknowledge and resubmit. | apps/web/features/workspace-console/components/WorkspacePlugins.tsx:585-600 |
| retire | Confirmation dialog naming the effect, then retired for everyone. | apps/web/features/workspace-console/components/WorkspacePlugins.tsx:391-396 |
| loading, offline, timeout, retry | Admin page shows an error alert with the user message; other cases not traced. | apps/web/features/workspace-console/components/WorkspacePlugins.tsx:425-435 |
| approval request | not handled in the code. | no code found for it after searching apps/web/features/plugins, apps/web/features/directory, apps/web/lib/services/organization-plugin-service.ts, packages/ui/ui/src/directory, apps/mobile/src/features/plugins and apps/cli/src/features/plugins |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/plugins/__tests__/route.test.ts`: Admin route: outside workspace, list with canManage, CSRF, policy.manage, upload refusal, dependencies refusal, publish and audit, change, 404.
- `apps/web/app/api/plugins/organization/[pluginId]/settings/__tests__/route.test.ts`: Member plugin settings route (cases not read).
- `apps/web/lib/services/__tests__/connector-policy-evaluator.test.ts`: Policy evaluator including plugin lists (cases not read).
- `apps/mobile/src/features/plugins/__tests__/PluginSources.test.tsx`: Mobile sources and workspace section (cases not fully read).

**Test scenarios**

- **Required plugin**
  1. As admin upload a plugin and set Required.
  2. As a member open Plugins and try to turn it off.
  - Expected: It shows as on and Required; turning off is refused with the workspace message.
- **Group override**
  1. Create or pick a group; set plugin Not available for the workspace and Installed by default for that group.
  2. Open Plugins as a member of the group and as a non-member.
  - Expected: Group member sees it installed; non-member does not see it.
- **Permission**
  1. As a member without policy.manage call PATCH on the admin route.
  - Expected: Refused with the role message; no change.
- **Policy block**
  1. Add the plugin key to the workspace blocked list.
  2. As a member install it from the marketplace.
  - Expected: 403 PLUGIN_NOT_PERMITTED with 'Your workspace administrator has blocked ...'.
- **Approval request**
  1. As a member attempt a blocked install and look for a request control.
  - Expected: No control exists (confirms the gap).
- **Dependencies**
  1. Upload a zip whose plugin lists dependencies.
  - Expected: Rejected with the dependency message.

**Where to look when it fails**

- Audit events of type admin_policy_changed with resourceType organization_plugin.
- Response code PLUGIN_NOT_PERMITTED.
- Tables organization_plugins, organization_plugin_group_settings, organization_plugin_members.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **No installation approval request flow.** Affects: Members and admins on all six apps. Evidence: No matching code in apps/web/features/plugins, apps/web/features/directory, apps/web/lib/services/organization-plugin-service.ts, apps/mobile/src/features/plugins. Work needed: Design request record, admin queue, notification and audit; build UI on web and mobile.
- **No assignment to named members; only organization-wide and group settings.** Affects: Admins. Evidence: apps/web/lib/services/organization-plugin-service.ts:306-350. Work needed: Decide if needed; add member overrides or document group-of-one.
- **Admin management only on web (and Desktop through the web page).** Affects: Admins on mobile, CLI, VS Code. Evidence: WorkspacePlugins.tsx is the only admin UI. Work needed: Product decision.
- **Workspace plugins cannot depend on other plugins.** Affects: Admins publishing bundles. Evidence: apps/web/app/api/settings/organization/plugins/route.ts:37-38. Work needed: Allow dependencies or document.
- **CLI and VS Code do not show workspace plugins.** Affects: Developers in a workspace. Evidence: apps/cli/src and apps/extension-vscode/src: no organization plugin calls found. Work needed: Add read-only listing.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:GET /api/settings/organization/plugins
- api:POST /api/settings/organization/plugins
- api:PATCH /api/settings/organization/plugins
- api:GET /api/plugins/organization
- table:organization_plugins
- table:organization_plugin_files
- table:organization_plugin_members
- table:organization_plugin_group_settings
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- F054-06

## Unknown

- Whether the workspace console needs a specific plan.
- Where admins create the groups used for overrides.
- Member state retention when a member leaves the workspace.
- How the admin allow and block plugin lists are edited (policy evaluator found; editor UI not traced).
- Audit-log retention.
