---
id: "F004-12"
type: "feature"
title: "Skills, plugins and connected accounts"
aliases: ["Customize", "Skills", "Plugins", "Connectors", "Connected accounts (S4.37)", "Skills manager (S4.35)", "Plugins manager (S4.36)", "/settings/connections", "/chat/customize", "agi plugin", "agi connectors"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "built", chrome: "missing"}
verification: {web: "partly seen (2 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S4.35", "S4.36", "S4.37"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "api:GET /api/skills", "api:POST /api/plugins/installations", "api:GET /api/connectors", "table:user_skills", "plan:basic", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-12 Skills, plugins and connected accounts

The places where a person adds abilities to the assistant: skills (reusable instructions), plugins (bundles) and connectors (links to other services). On the web they open as panes in the settings window; deep links like /chat/customize?section=skills and /settings/connections redirect there. Connect, reconnect and disconnect per service.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.35](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s435), [S4.36](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s436), [S4.37](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s437).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (2 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person browse, add, enable and remove skills and plugins, and connect, reconnect or disconnect third-party services, with plan and release gating. (apps/web/features/directory/hooks/useDirectoryAdapter.ts) (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757)

**Why it exists.** To extend the assistant the way the leaders do with skills, plugins and connectors.

**Who uses it.** Signed-in people on web, desktop, mobile, CLI and VS Code.

**Problems it solves**

- Repeating instructions for a task type.
- Giving the assistant access to Gmail, Linear or GitHub.
- Installing a vetted bundle of tools.

**Use cases**

- Open /skills signed in and add a skill.
- Connect GitHub and see 'GitHub connected.'
- Install a plugin in the terminal with agi plugin install.
- Disconnect a service with agi connectors disconnect.

## 2. User experience

**Where to find it**

- Web: /chat/customize?section=skills|plugins|connectors redirects to /settings/<section>; unknown sections go to /settings/general (apps/web/app/chat/customize/page.tsx:5). Signed-in /skills opens the skills pane (apps/web/app/skills/page.tsx:44). /settings/connections opens Connectors (apps/web/app/settings/connections/page.tsx:12). Settings then opens as a window on /chat via ?settings=<section> (apps/web/features/settings/components/SettingsModalRedirect.tsx:35).
- Desktop: through the hosted web app (doc: AGENTS.md section 5).
- Mobile: Skills screen /(app)/skills, Plugins screens /(app)/plugins, Connectors /(app)/connectors and Settings integrations; customize screen /(app)/customize (apps/mobile/app/(app)).
- CLI: agi plugin (list, install, info, login, configure, remove, enable, disable, update, digest, sign), agi connectors (list, disconnect), skills in the TUI (apps/cli/src/lib.rs:2016) (apps/cli/src/lib.rs:1275).
- VS Code: capability management for skills and plugins (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:197).
- Chrome: none found.

**Before you start**

- Signed in for the panes; signed-out visitors see a public skills list at /skills and a sign-in prompt at /settings/connections.
- Connectors need a paid plan and a released connector; plugins and skills are on all cloud-chat plans (packages/contracts/types/src/billing-catalog.ts:350).

**Screens and controls**

- Settings panes 'Skills', 'Plugins', 'Connectors' with directory lists, search, install and connect buttons.
- Connectors rows: Connect, Reconnect (needs reauthorization), Disconnect; custom connectors can be added by URL; API-key forms; tool permissions panel (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:998).
- Locked rows show 'Coming soon' or a plan upgrade message.
- Signed-out /settings/connections: heading 'Your connections live in settings', button 'Sign in to see your connections', link 'Browse the MCP directory' (apps/web/app/settings/connections/page.tsx:17).

**Journey**

1. Open Customize, Skills, Plugins or Connectors from settings, or follow a deep link.
2. Browse and search the directory.
3. Press install or Connect; a connector opens the provider's authorization and returns to the settings window.
4. After a GitHub connect, a toast reads 'GitHub connected.' or an error message.
5. Disconnect or remove from the row; connector disconnect removes saved sign-in and tool permissions.

**What the person sees and gets**

- Toasts: 'GitHub connected.' and error notices such as 'GitHub authorization was canceled.' (apps/web/features/connectors/lib/github-callback-notice.ts:7).
- Done titles 'Skill added', 'Plugin installed', 'Plugin created', 'Plugin saved' (apps/web/features/directory/constants.ts:305).
- 'Connectors are unavailable right now' when the capability is off.

**Settings**

- Connector tool permissions; plugin updates; skill authoring on or off (AGI_USER_SKILL_AUTHORING, name only) (apps/web/lib/services/user-skill-authoring.ts:6).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Redirects and signed-out handling on web (apps/web/app/chat/customize/page.tsx:5) (apps/web/app/skills/page.tsx:44) (apps/web/app/settings/connections/page.tsx:12).
- Skills API GET and POST with workspace feature gate and uploads (apps/web/app/api/skills/route.ts:212).
- Plugins routes for list, installations, updates, marketplaces, authored, uploads (apps/web/app/api/plugins).
- Connectors API and settings adapter with connect, reconnect, disconnect, custom connectors and GitHub installations (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757).
- Mobile skills, plugins and connectors screens calling the same endpoints (apps/mobile/src/features/skills/service.ts:16) (apps/mobile/src/features/plugins/service.ts:2).
- CLI local plugin manager and connectors list and disconnect with capability refusal (apps/cli/src/lib.rs:7377).

**Incomplete**

- Connectors are in 'coming soon' state globally; only a fixed list of connector ids is released (packages/contracts/types/src/connector-release.ts:11). Other rows show 'Coming soon'.
- CLI plugins are installed from local or git sources on the machine, not through the web plugin marketplace routes (apps/cli/src/lib.rs:2021). Whether they sync with web plugins is unknown.
- Brief says Plugins not on mobile and connected accounts missing in CLI; the code has mobile plugin screens and a CLI connectors command.

**Present but disconnected or switched off**

- Skill authoring returns not found when AGI_USER_SKILL_AUTHORING is 0 (apps/web/lib/services/user-skill-authoring.ts:9).
- Mobile FEATURES.pluginMarketplaceAdmin false (apps/mobile/lib/v1FeatureFlags.ts:23); bank linking false hides the bank-accounts connector (apps/mobile/app/(app)/connectors/[id].tsx:11).
- Connectors directory plan-locked for non-paid plans (apps/web/features/directory/services/connectors-directory.ts:1019).

**Not available**

- Chrome extension: no skills, plugins or connectors manager found.
- Connected accounts in VS Code: none found.

## 4. Required behaviour

**Established requirements**

- A skills manager lists installed and available skills and lets the user install, enable or disable, author and remove them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.35)
- A plugins manager lists, installs, configures, updates and removes plugins. (source: S4.36 (same brief))
- A connected-accounts destination lists services and lets the user connect, reconnect and disconnect each. (source: S4.37 (same brief))
- Plugin install, update and remove go through the plugins routes. (source: (apps/web/app/api/plugins/installations/route.ts:62))
- Disconnect names what is lost. (source: (apps/cli/src/lib.rs:7394))

**Acceptance criteria**

1. /chat/customize?section=plugins opens the Plugins pane; an unknown section opens General.
2. Signed-out /settings/connections shows the sign-in prompt, not data.
3. Signed-out /skills shows the public skills list.
4. After GitHub callback with status connected a success toast shows; with an error status an error toast shows.
5. A free account sees connectors locked with an upgrade message.
6. A connector not on the released list shows 'Coming soon' and cannot connect.
7. Disconnect asks first and removes saved sign-in and tool permissions.
8. Installing a plugin lists its dependencies and results in an installation row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Connector connect state should survive reload because it is read from /api/connectors. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show CLI users the web connect URL for 'coming soon' connectors consistently.
- [proposed] Update the brief rows S4.36 and S4.37 for mobile and CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Customize redirect | `apps/web/app/chat/customize/page.tsx` | Maps section param to settings pane. |
| screen | Skills page | `apps/web/app/skills/page.tsx` | Signed-in redirect to Skills pane; public list when signed out. |
| screen | Connections page | `apps/web/app/settings/connections/page.tsx` | Redirect or sign-in prompt. |
| component | SettingsModalRedirect | `apps/web/features/settings/components/SettingsModalRedirect.tsx` | Opens settings window and shows GitHub and top-up toasts. |
| config | web-settings-sections | `apps/web/features/settings/lib/web-settings-sections.ts` | Which sections a link may open; built-in connectors, skills, plugins. |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Skills, plugins and connectors directory actions. |
| hook | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Connector rows, connect, disconnect, custom connectors. |
| service | skills-directory | `apps/web/features/directory/services/skills-directory.ts` | Skills directory data. |
| service | plugins-directory | `apps/web/features/directory/services/plugins-directory.ts` | Plugins directory data and actions. |
| service | connectors-directory | `apps/web/features/directory/services/connectors-directory.ts` | Connector directory with plan lock. |
| endpoint | /api/skills | `apps/web/app/api/skills/route.ts` | List and create skills; feature gate. |
| endpoint | /api/plugins/installations | `apps/web/app/api/plugins/installations/route.ts` | Install and list installed plugins. |
| endpoint | /api/connectors | `apps/web/app/api/connectors/route.ts` | Connected connectors. |
| endpoint | /api/connectors/custom | `apps/web/app/api/connectors/custom/route.ts` | Custom connectors. |
| service | connector-release | `packages/contracts/types/src/connector-release.ts` | Release state and released connector ids. |
| config | capabilities | `packages/contracts/types/src/capabilities.ts` | canUseConnectors, canUsePlugins, canUseSkills per app. |
| table | user_skills | `apps/web/lib/services/user-skill-service.ts` | User-authored skills. |
| screen | Mobile skills, plugins, connectors | `apps/mobile/src/features/skills/SkillsScreen.tsx` | Mobile screens (plugins in features/plugins, connectors in features/settings/cloud-connectors). |
| command | agi plugin / agi connectors | `apps/cli/src/lib.rs` | CLI commands. |
| service | capabilityManagement | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | VS Code skills and plugins management. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A deep link or page redirects the browser to /chat?settings=<section>, which opens the settings window on that pane. | device | apps/web/features/settings/components/SettingsModalRedirect.tsx:35 |
| Directory adapter fetches skills, plugins and connectors from the API and applies plan and release locks. | device and our servers | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:520 |
| Plugin install posts the plugin id; server plans dependencies and writes an installation. | our servers | apps/web/app/api/plugins/installations/route.ts:62 |
| Connect starts an authorization with the outside service, then returns to the app with a status. | outside service | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757 |
| Skill create validates a draft or uploaded archive, checks the workspace feature gate and writes a user skill row and an audit event. | our servers | apps/web/app/api/skills/route.ts:212 |
| CLI plugins are read and written on the local machine; CLI connectors call the account API. | device | apps/cli/src/lib.rs:2021 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector grants and saved credentials | server connector tables (names not read) | Shared by all apps on the account | Disconnect removes saved sign-in and tool permissions (apps/cli/src/lib.rs:7394) |
| User skills | table user_skills | Read by web, mobile, CLI and VS Code | Removed on delete; retention unknown |
| Plugin installations | server installation rows for web and mobile; local plugin folders for CLI | web and mobile yes; CLI local no [inferred] | remove via route or command |

**Models and providers.** Skills are instruction text loaded on demand; plugins and connectors add tools. No specific model or provider is needed to manage them. Connector tools run through the chat pipeline with a model; connector tool counts are limited by plan (apps/web/app/api/connectors/route.ts:480).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for manage actions; signed-out gets public skills and sign-in prompt. |
| Permissions | Workspace policy can gate skills (feature gate 'skills') (apps/web/app/api/skills/route.ts:215); connectors may be blocked by organization connector policy [inferred from route name connector-policy]. |
| Subscription | Skills: all cloud-chat plans; connectors: paid plans (basic and up); canUseConnectors, canUsePlugins, canUseSkills are true on web, desktop and mobile rows (packages/contracts/types/src/billing-catalog.ts:350) (packages/contracts/types/src/capabilities.ts:53). CLI refuses connectors by tier cache (apps/cli/src/lib.rs:7378). |
| Limits and metering | Connector tool capacity per plan (apps/web/app/api/connectors/route.ts:480); skill upload size ceiling (apps/web/features/directory/constants.ts:301). |
| Feature flags | Connector release state 'coming_soon' with a list of released ids (packages/contracts/types/src/connector-release.ts:11); AGI_USER_SKILL_AUTHORING; mobile FEATURES.connectors and skills true. |
| Model compatibility | none found in the code |
| Provider restrictions | Connectors depend on each outside service's authorization; GitHub needs the GitHub App configured, else 'GitHub App is not configured in this deployment.' (apps/web/features/connectors/lib/github-callback-notice.ts:12). |
| Local mode | Directory, connectors and web plugins need our servers and an account. CLI plugins work locally without sign-in. Local skills outside the account: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out /settings/connections | Sign-in prompt with MCP directory link. | apps/web/app/settings/connections/page.tsx:12 |
| Signed out /skills | Public skills list or unavailable fallback null. | apps/web/app/skills/page.tsx:36 |
| Unknown customize section | Falls back to general. | apps/web/app/chat/customize/page.tsx:20 |
| GitHub callback | Success or error toast by status; unknown status gives a generic error. | apps/web/features/connectors/lib/github-callback-notice.ts:42 |
| Connector needs reauthorization | Row shows reconnect; count 'need reconnect' summary. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1152 |
| Capability off | Rows disabled with 'Connectors are unavailable right now'. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:398 |
| Plan locked | Install returns the upgrade message; connect and create do nothing. | apps/web/features/directory/services/connectors-directory.ts:1026 |
| Skill name clashes with built-in | Conflict error. | apps/web/app/api/skills/route.ts:238 |
| Upload too large | Message with MB limit. | apps/web/features/directory/constants.ts:302 |
| Offline or timeout | not handled in the code I read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/customize/page.test.tsx`: Customize redirect.
- `apps/web/app/skills/__tests__`: Skills page (files not listed).
- `apps/web/features/directory/__tests__/useDirectoryAdapter.test.tsx`: Directory adapter.
- `apps/web/features/directory/__tests__/connectors-directory.plan-lock.test.ts`: Connector plan lock.
- `apps/web/features/directory/__tests__/skills-directory.test.ts`: Skills directory.
- `apps/web/features/directory/__tests__/plugins-directory.test.ts`: Plugins directory.
- `apps/web/features/connectors/hooks/__tests__/useConnectorsSettingsAdapter.test.tsx`: Connector settings adapter.
- `apps/web/app/api/skills/__tests__/skill-crud.test.ts`: Skill create, read, delete.
- `apps/web/app/api/plugins/__tests__/route.test.ts`: Plugins route.
- `apps/web/app/api/connectors/route.test.ts`: Connectors route.
- `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx`: Mobile plugins.
- `apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx`: Mobile skills.
- `apps/mobile/__tests__/CloudConnectorsPage.test.tsx`: Mobile connectors.

**Test scenarios**

- **Deep links**
  1. Open /chat/customize?section=skills, then =plugins, then =bogus.
  - Expected: Skills pane, Plugins pane, General.
- **Signed out**
  1. Open /settings/connections and /skills signed out.
  - Expected: Sign-in prompt; public skills list.
- **GitHub toast**
  1. Open /settings/connections?github=connected signed in.
  2. Repeat with github=oauth_denied.
  - Expected: Success toast; error toast.
- **Free plan connectors**
  1. Sign in on Free, open Connectors.
  - Expected: Locked with an upgrade message.
- **Plugin install**
  1. Install a plugin from the Plugins pane.
  - Expected: 'Plugin installed' and the row shows installed.
- **CLI disconnect**
  1. Run agi connectors disconnect <id>, answer no then yes.
  - Expected: Left connected; then disconnected with receipt.

**Where to look when it fails**

- Routes /api/connectors, /api/connectors/custom, /api/skills, /api/plugins/installations.
- Toast text from github-callback-notice by status code.
- Audit event skill_installed (apps/web/app/api/skills/route.ts:245).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Connectors are globally coming soon; only listed ids are released.** Affects: All apps. Evidence: packages/contracts/types/src/connector-release.ts:11. Work needed: Owner release decision.
- **CLI plugins do not use the web plugin marketplace routes.** Affects: CLI and web users expecting one plugin list. Evidence: apps/cli/src/lib.rs:2021. Work needed: Decide whether CLI plugins should sync with the account.
- **Brief out of date for mobile plugins and CLI connectors.** Affects: Documentation. Evidence: apps/mobile/app/(app)/plugins/index.tsx; apps/cli/src/lib.rs:1275. Work needed: Update brief.
- **No Chrome manager for skills, plugins or connectors; VS Code has no connected accounts view.** Affects: Chrome, VS Code. Evidence: none found. Work needed: Decide scope.
- **CLI cannot connect a connector, only list and disconnect.** Affects: CLI. Evidence: apps/cli/src/lib.rs:1275. Work needed: Open the web connect URL from the CLI.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- api:GET /api/skills
- api:POST /api/plugins/installations
- api:GET /api/connectors
- table:user_skills
- plan:basic
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether CLI plugins sync with account plugins.
- Table names for connector grants and plugin installations.
- Whether desktop Tauri shows its own settings panes for these.
- How the mobile connectors flow differs from web (only file names seen).
- Contents of apps/web/app/skills/__tests__.
- Whether released connector ids match what the server exposes at runtime.
- How VS Code surfaces connected accounts, if at all.
