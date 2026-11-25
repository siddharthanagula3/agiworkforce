---
id: "F087-07"
type: "feature"
title: "Connectors, skills and private marketplace"
aliases: ["Connector policy", "Connectors (workspace console page)", "Skill and plugin policy", "Private marketplace", "Workspace plugins", "S87.16", "S87.17", "S87.18", "organization_connector_policies", "organization_plugins"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.16", "S87.17", "S87.18"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "plan:team", "plan:team_premium", "plan:enterprise", "file:apps/web/lib/services/connector-policy-gate.ts", "file:packages/client/client-runtime/src/connectors/policy.ts", "api:GET /api/settings/organization/connector-policy", "api:PUT /api/settings/organization/connector-policy", "api:POST /api/settings/organization/plugins", "api:GET /api/plugins/organization", "table:organization_connector_policies", "table:organization_plugins", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-07 Connectors, skills and private marketplace

Workspace admins decide which connectors (including custom ones), plugin keys, MCP hosts and websites members may use, and publish a private plugin catalogue to members. The web server enforces this at connect, install and chat-tool time. The desktop shows the same hosted screens. The CLI only partly honours it.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.16](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8716), [S87.17](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8717), [S87.18](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8718).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets an owner or admin set allow and block lists for connectors, allow or block custom connectors, set approved plugin keys and MCP server hosts, set allowed and blocked websites and per-tool rules, and publish plugins or single skills to the workspace so members get them as required, installed by default, available, or hidden (WorkspaceConnectorPolicy.tsx:221, WorkspacePlugins.tsx:32-52, connector-policy/route.ts:104).

**Why it exists.** A company needs to say which outside systems and add-ons its people may connect to company data, and to give them vetted add-ons without sending them to the public directory (connector-policy-gate.ts:21-40 comment, WorkspacePlugins.tsx:415).

**Who uses it.** Workspace owners and admins (permission policy.manage) edit; every member of the workspace is governed by it and can read the policy to learn why an integration is missing (connector-policy/route.ts:80-86, plugins/route.ts:62-70).

**Problems it solves**

- A member connecting a connector the company forbids before any credential is exchanged (connector-policy-gate.ts:139,216).
- Unvetted plugins being installed (install-gate.ts:21-50).
- No private place to distribute company plugins and skills (plugins/route.ts:62).

**Use cases**

- An admin blocks one connector and switches custom connectors off.
- An admin approves only three plugin keys; other installs are refused.
- An admin uploads a plugin .zip and marks it Installed by default for all members.
- An admin retires a plugin so every member loses it at once (WorkspacePlugins.tsx:394).

## 2. User experience

**Where to find it**

- Web: Workspace console at /workspace, Controls section, links 'Connectors' (/workspace/connectors) and 'Plugins' (/workspace/plugins) (WorkspaceConsoleNav.tsx:90,108). Page titles 'Connectors' and 'Plugins' (connectors/page.tsx, plugins/page.tsx:14).
- Desktop: [inferred] the same hosted web screens, because the public Desktop shows the hosted web app (doc: AGENTS.md section 5). No Electron code that loads /workspace was opened.
- Members: the Plugins area of the app lists workspace plugins (WorkspacePlugins.tsx:415 text 'Members find these under Plugins'); data comes from GET /api/plugins/organization (plugins/organization/route.ts:16).
- Mobile, VS Code, Chrome: no screen found.

**Before you start**

- Signed in, active member of a workspace on plan team, team_premium or enterprise: requireTeamAdminAccess refuses other plans (team-admin-access.ts, billing-catalog.ts:362; WorkspaceConnectorPolicy.tsx:602 'needs a Team or Enterprise workspace').
- Owner or admin role with policy.manage to change anything (connector-policy/route.ts:112-116).

**Screens and controls**

- Connectors page: 'Custom connectors' switch labelled 'Allow custom connectors' (WorkspaceConnectorPolicy.tsx:633); 'Catalog connectors' list with per-connector allow/block toggles and per-tool choices 'Member decides', 'Always allow', 'Needs approval', 'Blocked' (lines 418-423, 669); 'Approved plugins' and 'Blocked plugins' lists (221,230); 'MCP server hosts' (261); 'Allowed sites' and 'Blocked sites' (388,397); button 'Save policy' (797).
- Plugins page: 'Workspace plugins' list, 'Upload a plugin or skill' (WorkspacePlugins.tsx:579), install preference select Required / Installed by default / Available to install / Not available (lines 32-52), per-group settings, 'Retire for everyone' confirmation (394).

**Journey**

1. Open Workspace > Connectors.
2. Choose a catalog connector and mark allowed or blocked, toggle custom connectors, add plugin keys, MCP hosts and sites.
3. Select 'Save policy'; the page sends PUT /api/settings/organization/connector-policy.
4. Open Workspace > Plugins and upload a plugin or skill .zip; files are scanned, then published.
5. Pick Required, Installed by default, Available to install or Not available for each plugin, optionally per group.
6. Members open Plugins and see only what the workspace offers; a blocked connector is missing from their tools.

**What the person sees and gets**

- Error text 'Could not update connector policy. Try again.' (WorkspaceConnectorPolicy.tsx).
- Validation messages when an item is both allowed and blocked (connector-policy/route.ts:146).
- Refusal texts from the shared evaluator, for example 'Your workspace administrator has blocked the "x" connector.' (policy.ts:28-60).
- Each save writes an admin_policy_changed audit row (connector-policy/route.ts:166-180, plugins/route.ts:84-95).

**Settings**

- Feature switches 'skills' and 'plugins' on the Policy page (WorkspaceFeatureControls.tsx:40-41) turn the whole capability off for the workspace.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web connection gate: connect, OAuth start/callback, credentials, custom creation and bank-link routes call evaluateConnectorPolicyForUser, which refuses blocked, not-listed and disallowed custom connectors before any credential exchange (connector-policy-gate.ts:139-215; callers listed under app/api/connectors/*).
- Web plugin install gate refuses a plugin key that is blocked or not on a non-empty approved list, and checks dependencies (install-gate.ts:21-50, connector-policy-gate.ts:216).
- Web chat-turn tool list drops blocked connectors and fails closed with an empty list when the policy cannot be read (user-connector-tools.ts:1920-1945); capability loading fails closed too (user-connector-tools.ts:1977-2000).
- Chat requests refuse with 403 feature_disabled when the workspace turned a feature off, and plugin loading is skipped when the plugins switch is off (request-processor.ts:3730,3745).
- Private catalogue: admins publish plugins and single skills, set install preference per plugin and per group, retire plugins (plugins/route.ts:62,114); members read their list (plugins/organization/route.ts:16, organization-plugin-service.ts:384); required plugins cannot be turned off by members (organization-plugin-service.ts:418).
- The catalogue uses its own tables, separate from the user's public-directory installs (organization-plugin-service.ts:143-181 versus installed-skills.ts:90-105).
- Desktop: [inferred] shows the web screens; no separate code.

**Incomplete**

- Per-item skill allow list: only plugin keys have allow/block lists; skills are controlled by the 'skills' feature switch and by plugin membership. No per-skill list found (connector-policy/route.ts:119-129).
- CLI: the workspace connector policy is read and evaluated (claude_parity.rs:2105,2354) but the production caller found only refuses the GitHub-app install help text (claude_parity.rs:753) and applies website rules to web search and fetch (site_rules.rs:107).
- CLI MCP servers: refused when the workspace turned MCP off or restricts the list (workspace_policy.rs:371,409; mcp/mod.rs:301).

**Present but disconnected or switched off**

- CLI evaluate_plugin_access is defined but its only callers found are in tests (claude_parity.rs:2412, 4295); the CLI plugin loader does not apply the workspace plugin lists.
- CLI managed.rs plugin policy is a local signed-plugin requirement from a device file, not the workspace allow list (managed.rs:29, plugins.rs:254-300).
- Connectors are gated by connectorsReleased() before policy, so unreleased connectors answer 'coming soon' (connector-policy-gate.ts:144-150).

**Not available**

- Mobile: no connector or plugin policy screen or enforcement found.
- VS Code and Chrome: none found.
- CLI private marketplace: no code that reads the workspace catalogue.

## 4. Required behaviour

**Established requirements**

- A blocked connector is not offered in the tool list and cannot be connected. (source: brief S87.16 Should)
- Skill and plugin allow lists are enforced at install time and at request time. (source: brief S87.17 Should)
- A workspace curates a private catalogue separate from the public directory that members browse and install. (source: brief S87.18 Should)
- An empty allow list means unrestricted, not deny-all; block beats allow. (source: policy.ts:22-27 comment, connector-policy-evaluator.test.ts:28)
- A policy that cannot be read must not become an unrestricted connection. (source: connector-policy-gate.ts:40-41 comment)

**Acceptance criteria**

1. With connector X blocked, connecting X returns a refusal naming X and no credential is stored.
2. With a non-empty approved plugin list, installing an unlisted plugin key is refused with the 'not on the approved list' reason.
3. With custom connectors off, creating a custom connector is refused even if its id is on the approved list.
4. A blocked connector's tools do not appear in a chat turn's tool list for a member.
5. A plugin set to Not available is absent from a member's Plugins list; a Required plugin cannot be turned off by the member.
6. Saving a policy where one item is both allowed and blocked is refused with a validation message.
7. Every policy save and plugin publish writes an admin_policy_changed audit row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should apply workspace plugin and connector lists for managed sessions, matching web [inferred from brief S87.17 'CLI done' versus the code].
- A per-skill list is needed if 'per item' in S87.17 means skills [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Wire evaluate_plugin_access into the CLI plugin install and load path and cache it with the existing sealed policy cache.
- [proposed] Add a skill-level allow list or state clearly that skills follow their plugin.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Connectors page | `apps/web/app/workspace/connectors/page.tsx` | Console page titled Connectors |
| component | WorkspaceConnectorPolicy | `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx` | Edits connector, plugin, MCP host, site and tool rules |
| hook | useConnectorPolicy | `apps/web/features/workspace-console/hooks/use-connector-policy.ts` | Reads and saves the policy |
| screen | Plugins page | `apps/web/app/workspace/plugins/page.tsx` | Console page titled Plugins |
| component | WorkspacePlugins | `apps/web/features/workspace-console/components/WorkspacePlugins.tsx` | Upload, install preference, retire |
| endpoint | GET/PUT /api/settings/organization/connector-policy | `apps/web/app/api/settings/organization/connector-policy/route.ts` | Read for members, write needs policy.manage, audits changes |
| endpoint | GET/POST/PATCH /api/settings/organization/plugins | `apps/web/app/api/settings/organization/plugins/route.ts` | Admin catalogue list, publish, change |
| endpoint | GET /api/plugins/organization | `apps/web/app/api/plugins/organization/route.ts` | Member view of the workspace catalogue |
| service | connector-policy-service | `apps/web/lib/services/connector-policy-service.ts` | Reads and upserts organization_connector_policies |
| service | connector-policy-gate | `apps/web/lib/services/connector-policy-gate.ts` | One gate for connect, authorize, create and plugin install |
| service | evaluateConnectorAccess / evaluatePluginAccess | `packages/client/client-runtime/src/connectors/policy.ts` | Pure shared decision rules |
| service | install-gate | `apps/web/features/plugins/server/directory/install-gate.ts` | Plugin install refusal incl. dependencies |
| service | organization-plugin-service | `apps/web/lib/services/organization-plugin-service.ts` | Catalogue tables, member preferences |
| service | user-connector-tools | `apps/web/lib/user-connector-tools.ts` | Filters offered tools by policy at chat time |
| service | request-processor feature gate | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | feature_disabled refusal and plugins switch |
| table | organization_connector_policies | `apps/web/lib/services/connector-policy-service.ts` | One row per workspace; no row means ungoverned |
| table | organization_plugins and group settings | `apps/web/lib/services/organization-plugin-service.ts` | Private catalogue rows and per-group preferences |
| command | CLI workspace policy | `apps/cli/src/cloud/workspace_policy.rs` | Effective policy fetch, hooks and MCP refusal |
| command | CLI connector policy module | `apps/cli/src/claude_parity.rs` | Connector evaluator and web site rules reader |
| config | CLI managed settings | `apps/cli/src/features/hooks/managed.rs` | Device file for managed hooks and signed plugins |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin saves the policy on the web or desktop screen; browser sends PUT with CSRF token. | device and our servers | connector-policy/route.ts:104-118 |
| Server checks membership, plan, policy.manage, validates overlaps, writes the whole row and an audit event. | our servers | connector-policy/route.ts:119-180, connector-policy-service.ts:107 |
| A member connects a connector or installs a plugin; the gate reads the policy and refuses before any credential exchange or install. | our servers | connector-policy-gate.ts:139-215, install-gate.ts:40 |
| A chat turn builds its tool list; blocked connectors are removed; unreadable policy gives an empty list. | our servers | user-connector-tools.ts:1920-1945 |
| CLI in managed mode reads the effective policy and connector policy with the stored sign-in, caches them, refuses MCP servers and website reads accordingly. | device and our servers | workspace_policy.rs:14,371; claude_parity.rs:2696; site_rules.rs:107 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector policy lists, tool rules | table organization_connector_policies | Read live by each request; CLI caches it in process | Replaced by each save; retention rule unknown |
| Published plugin files and install preferences | tables organization_plugins, organization_plugin_files, organization_plugin_group_settings, organization_plugin_member_preferences | Served to members on request | Retire marks status retired; republishing restores the same settings (WorkspacePlugins.tsx:394) |
| CLI sealed policy cache | device cache sealed with an OS credential-store key | Refreshed hourly; older than 7 days needs a fresh read | Device files; deletion rule unknown |

**Models and providers.** No model or provider takes part in the decision; it is a rules check. Policy applies to Cloud turns on the server; connectors only run through our servers, so Local mode has no connectors (inferred from the server-only call paths above). Per-tool rules may also bind agent tool loops (WorkspaceConnectorPolicy.tsx:418-423).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account in a workspace; a personal account is ungoverned (connector-policy-gate.ts:78). |
| Permissions | policy.manage to change; any workspace member may read the policy; plugin publish needs policy.manage (plugins/route.ts:62-70). |
| Subscription | plan:team, plan:team_premium, plan:enterprise for the console (billing-catalog.ts:362). Connectors themselves need a plan that includes them; Free gets an upgrade refusal (connector-policy-gate.ts:171-180). |
| Limits and metering | Rate limits 'settings-org' and 'settings-org-patch' (connector-policy/route.ts:88,108). List size ceiling enforced (connector-policy/__tests__/route.test.ts:357). No credit metering. |
| Feature flags | connectorsReleased() and per-connector release flags gate before policy (connector-policy-gate.ts:144). Feature switches skills and plugins (WorkspaceFeatureControls.tsx:40). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Server gates do not run for Local chats. CLI web-site rules apply even in Local and BYOK (claude_parity.rs LocalToolPolicy comment at ~2680); the rest apply in Managed mode only (workspace_policy.rs:783). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading, error | Spinner and error text 'We could not load your connector policy' with retry (WorkspaceConnectorPolicy.tsx:575-590). | WorkspaceConnectorPolicy.tsx:575 |
| Plan too low or not admin | 'Connector governance is not available for this workspace'. | WorkspaceConnectorPolicy.tsx:602 |
| No catalog connectors configured | Page says there is nothing to approve; custom switch still applies. | WorkspaceConnectorPolicy.tsx:675-685 |
| Policy unreadable at connect time | Connection refused with 503 'Workspace connector policy is unavailable. Try again.' | connector-policy-gate.ts:114 |
| Policy unreadable at chat time | Empty tool list returned (fail closed). | user-connector-tools.ts:1935 |
| Plugin with dependencies published | Refused with message to publish dependencies separately. | plugins/route.ts:39,70 |
| Offline or retry for admin screen | not handled in the code beyond a retry button. | WorkspaceConnectorPolicy.tsx |
| CLI policy unread | MCP servers stay off and hooks are skipped with a warning. | workspace_policy.rs:371-395, 752 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/connector-policy-gate.test.ts`: Refuses blocked, unlisted and custom connectors; allows empty policy; refuses on unreadable policy, unconfirmed email, Free plan
- `apps/web/lib/services/__tests__/connector-policy-evaluator.test.ts`: Block beats allow, empty allowlist unrestricted, custom switch, MCP host matching
- `apps/web/lib/services/__tests__/connector-policy-coverage.test.ts`: Shared tool loader applies policy before per-turn denial
- `apps/web/app/api/settings/organization/connector-policy/__tests__/route.test.ts`: Member read, refusal of members and viewers, overlap rejection, audit, plan check
- `apps/web/app/api/settings/organization/plugins/__tests__/route.test.ts`: Publish, dependency refusal, patch, audit, 404 for unpublished plugin
- `apps/web/features/workspace-console/components/__tests__/WorkspaceConnectorPolicy.test.tsx`: Plugin and MCP host lists saving and validation
- `apps/cli/src/claude_parity.rs`: In-file tests for the CLI connector evaluator (tests module near line 4211)

**Test scenarios**

- **Blocked connector cannot connect**
  1. As admin block connector X and save.
  2. As member start the connect flow for X.
  - Expected: Refusal naming X; no credential row created; audit row for admin change exists.
- **Approved plugin list**
  1. Add plugin key A to Approved plugins and save.
  2. As member install plugin B from the public directory.
  - Expected: B refused with 'not on the approved list'; A installs.
- **Private catalogue visibility**
  1. Upload a plugin .zip, set Not available.
  2. Open Plugins as a member.
  - Expected: Plugin absent; set Available to install and it appears.
- **Fail closed**
  1. Make the policy read fail in a test environment.
  2. Start a chat turn and a connect.
  - Expected: Tool list empty; connect returns 503.
- **CLI managed plugin install**
  1. Block plugin P in the web policy.
  2. Install P from the CLI while signed in managed.
  - Expected: Current code expected to allow it (gap); record the result.

**Where to look when it fails**

- Log lines '[connector-policy] workspace policy refused a connection before any credential was exchanged' and '[connector-policy] unavailable; catalog withheld'.
- Audit event admin_policy_changed with resourceType organization_connector_policy or organization_plugin.
- Table organization_connector_policies.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)
- CLI: [70-qa/test-plans/cli/087-enterprise-administration-screens.md](../../70-qa/test-plans/cli/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **CLI does not enforce workspace plugin allow/block lists or connector lists at install** Affects: CLI users in managed mode. Evidence: claude_parity.rs:2412 callers only in tests; claude_parity.rs:753 only GitHub install text. Work needed: Call the evaluator in the plugin install and load path
- **CLI has no private marketplace** Affects: CLI. Evidence: No CLI file reads /api/plugins/organization. Work needed: Add a catalogue client and install flow
- **No per-skill allow or block list** Affects: Admins wanting item-level skill control. Evidence: connector-policy/route.ts:119-129 lists only plugins. Work needed: Decide scope and add lists or document plugin-level control
- **Mobile has no enforcement path found** Affects: Mobile users in a governed workspace. Evidence: No mobile reference to connector-policy. Work needed: Confirm mobile connector availability and apply policy server side

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- plan:team
- plan:team_premium
- plan:enterprise
- file:apps/web/lib/services/connector-policy-gate.ts
- file:packages/client/client-runtime/src/connectors/policy.ts
- api:GET /api/settings/organization/connector-policy
- api:PUT /api/settings/organization/connector-policy
- api:POST /api/settings/organization/plugins
- api:GET /api/plugins/organization
- table:organization_connector_policies
- table:organization_plugins
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy

## Unknown

- Whether members of a Pro or Free personal workspace see any of this (they are ungoverned by design; not confirmed in UI).
- How the separate 'MCP servers' console page (WorkspaceMcpServers) fits S87.18; not read.
- Exact desktop loading of /workspace in Electron; no Electron file opened.
- Mobile connector availability and any policy read on mobile.
- Retention or deletion of organization_connector_policies rows.
