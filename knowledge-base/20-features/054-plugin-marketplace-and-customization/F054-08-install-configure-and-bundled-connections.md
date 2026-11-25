---
id: "F054-08"
type: "feature"
title: "Install, configure and bundled connections"
aliases: ["Install plugin", "Install button", "agi plugin install", "Plugin settings", "Configure", "Turned on", "Connect bundled connections", "agi plugin login", "agi plugin configure", "S54.21 Install", "S54.22 Configure", "S54.23 Authenticate bundled connections"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.21", "S54.22", "S54.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:POST /api/plugins/installations", "api:POST /api/plugins/marketplace-installations", "api:GET /api/plugins/[id]/settings", "api:PATCH /api/plugins/[id]/settings", "table:plugin_installations", "table:plugin_marketplace_installations", "table:user_custom_connectors", "F054-07", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-08 Install, configure and bundled connections

Install a plugin for your account (web, desktop, mobile), or into a folder on your device (CLI, VS Code). Install turns the plugin on and installs its dependencies first, unless org policy refuses. Per-plugin settings choose which skills are on; bundled connections are signed in through the connector path or 'agi plugin login'.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.21](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5421), [S54.22](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5422), [S54.23](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5423).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Adds a plugin to a person's account or device, records it as turned on, installs the plugins it depends on, saves per-plugin settings and helps the person sign in to the connections the plugin bundles.

**Why it exists.** Installing is the step that makes a plugin's skills, agents and connectors usable in chats (brief: S54.21-S54.23; doc: docs/product/requirements.md section 19 lists Install and included MCP servers).

**Who uses it.** Signed-in users on web, desktop (hosted web), mobile; CLI and VS Code users with a local runtime; org admins who set install policy.

**Problems it solves**

- Getting a ready-made set of skills and connectors without building them.
- Needing one plugin that depends on another.
- Org control over which plugins members may install.
- Signing in to a plugin's remote servers.

**Use cases**

- Install a built-in pack on web and see 'Also installed: ...' for its dependencies.
- Install a public directory plugin that bundles an MCP server and sign in to it as a connector.
- Run agi plugin install <git-url> --ref <tag> on a laptop.
- Switch off one skill of an installed plugin on the plugin page.

## 2. User experience

**Where to find it**

- Web: Settings > Customize > Plugins > a plugin > button 'Install' (becomes 'Installed') (packages/ui/ui/src/directory/PluginDetailView.tsx:1006-1015 via primaryLabel; constants.ts:120-122).
- Desktop (public Electron app): the same hosted web page; the retained Tauri build opens it in the browser through 'Manage plugins' (apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx:7,45).
- Mobile: Customize > Plugins > plugin > 'Install' (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:369).
- CLI: agi plugin install <source>, agi plugin configure <name>, agi plugin login <name> (apps/cli/src/lib.rs:2017-2060).
- VS Code: command-palette Plugins list > 'Install a plugin' (local), or 'Browse AGI Cloud Marketplace' (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:470,319).
- Chrome: not available (no plugin reference under apps/extension/src).

**Before you start**

- Cloud sign-in for web, desktop, mobile.
- An org policy that allows the plugin and the 'plugins' feature (install-gate.ts:13-48).
- CLI: a git URL or folder; either a sha256 pin or a publisher signature (apps/cli/src/lib.rs:6850-6868).
- Installing from a user-added marketplace needs a verified email only for submission, not install (apps/web/app/api/plugins/submissions/route.ts:49).

**Screens and controls**

- Web detail page: primary button 'Install' / 'Installed'; 'Uninstall' beside it (PluginDetailView.tsx:900-905).
- Web detail page tabs 'Skills' and 'Connectors' for an installed plugin; each skill has a switch labelled 'Use <skill>' (constants.ts:171-172,395; PluginDetailView.tsx:540-558).
- Web connectors tab shows 'Connected', 'Not connected' and a 'Connect' button for connectors the plugin requires (constants.ts:123,391-392; PluginDetailView.tsx:563-600).
- Mobile: 'Install', 'Turned on' switch, per-skill switches under a card titled 'Customize' (which only toggles skills), 'Connect' buttons per connector (PluginDetailScreen.tsx:353,434,549).
- CLI: interactive prompts for each declared setting at install in a terminal (apps/cli/src/lib.rs:6915-6925).

**Journey**

1. Find the plugin in Customize > Plugins.
2. Read the detail page, then press Install (mobile first shows an alert listing permissions and 'Install').
3. The server checks policy and dependencies, installs dependencies, then the plugin, and turns it on.
4. The page shows 'Installed' and a note naming dependencies installed, and connectors added with whether sign-in is needed.
5. Open the Skills tab to switch skills on or off; settings save at once.
6. Open the Connectors tab and press 'Connect' for a required connector, or finish sign-in in the connector page.
7. CLI: run agi plugin login <name> to sign in to each bundled remote server.

**What the person sees and gets**

- Web: updated installed state, dependency line, connector lines (useDirectoryAdapter.ts:1330-1429).
- Web error text from the server, for example 'This plugin is not available for Managed Cloud installation.' (apps/web/app/api/plugins/installations/route.ts:79).
- Mobile toast 'Installed <name>. Also installed: ...' (usePluginActions.ts:44-47).
- CLI prints 'Installed to <path>', contents list, settings table and dependency notices (apps/cli/src/lib.rs:6872-6930).
- CLI login prints 'Signed in to <server>' per server and where tokens are stored (apps/cli/src/lib.rs:6932-6985).

**Settings**

- Per-plugin skill switches and custom example prompts, saved through PATCH /api/plugins/[id]/settings (apps/web/app/api/plugins/[id]/settings/route.ts:51-84).
- CLI per-plugin user_config values saved by agi plugin configure KEY=VALUE and --unset (apps/cli/src/installs.rs:502-533).
- VS Code 'Configure options' button when a plugin is configurable (capabilityManagement.ts:377,488).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: POST /api/plugins/installations runs the install gate, plans dependencies, checks policy per dependency, installs them first and returns {installation, dependencies} with 201 (apps/web/app/api/plugins/installations/route.ts:42-117).
- Web: install upserts the installation with enabled = true and records approved permissions (apps/web/lib/services/plugin-installation-service.ts:369-395).
- Web: POST /api/plugins/marketplace-installations installs a public directory plugin or a user marketplace entry, audits each dependency and the plugin, and registers bundled MCP servers as custom connectors (apps/web/app/api/plugins/marketplace-installations/route.ts:53-125,128-169; apps/web/lib/connectors/plugin-connectors.ts:39-80).
- Web: install is refused with 403 PLUGIN_NOT_PERMITTED by workspace policy (install-gate.ts:21-50; install-responses.ts:47).
- Web: settings are saved per installation; only declared skills are kept (apps/web/lib/services/plugin-installation-service.ts:559-600).
- Web: connector status for required connectors reads connected or not (plugin-installation-service.ts:525-557).
- Mobile: install with permission alert, turn on/off switch, remove, per-skill switches (apps/mobile/src/features/plugins/usePluginActions.ts:65-145; PluginDetailScreen.tsx:353,549).
- CLI: install from git or local folder with sha256 pin or signature, interactive settings prompt, dependency auto-install with notices, agi plugin configure, agi plugin login (apps/cli/src/installs.rs:85-125,150-272,502-533; apps/cli/src/lib.rs:6833-7028).
- VS Code: local install through the CLI runtime after a confirm, plugin options dialog, Cloud marketplace install of user-added entries (capabilityManagement.ts:319-415; accountMarketplace.ts:20-160).

**Incomplete**

- Registry (built-in pack) installs do not register connectors; only the directory/marketplace route calls registerPluginConnectors (apps/web/app/api/plugins/installations/route.ts has no such call; marketplace-installations/route.ts:95-112).
- Bundled MCP servers shipped by a plugin get no 'Connect' button in the plugin page (ConnectorStatus hides it when bundled is true) and no status once installed; sign-in goes through the connector page (PluginDetailView.tsx:593-600; plugins-directory.ts:1060-1072).
- Mobile 'Connect' targets for plugin connectors were not traced (see unknowns).
- VS Code Cloud marketplace install has no dependency, connector sign-in or settings step (accountMarketplace.ts:149-160).

**Present but disconnected or switched off**

- Mobile and web 'Customize' controls named 'Customize' differ: mobile's card only switches skills; the copy-and-edit action exists on web only (see F054-10).

**Not available**

- Chrome: no plugin install.
- CLI: install policy from an organization is not applied; the CLI has only its own signature policy (apps/cli/src/features/plugins/plugins.rs:254-300).
- VS Code: no per-skill settings for plugins other than 'Configure options'.

## 4. Required behaviour

**Established requirements**

- A user can install a plugin (S54.21). (source: brief: S54.21 Should)
- A user can configure an installed plugin's settings (S54.22). (source: brief: S54.22 Should)
- A user can authenticate the connections a plugin bundles (S54.23). (source: brief: S54.23 Should)
- Install records the plugin for the user and turns it on; dependencies install first; policy or workspace gate can refuse. (source: brief: draft Should for S54.21-S54.23, checked against apps/web/app/api/plugins/installations/route.ts:58-85)
- Plugin requirements: Install, Included MCP servers, skills, hooks, subagents and prompts. (source: doc: docs/product/requirements.md section 19)
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing silently routes Local data to Cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Pressing Install on web creates an installation with enabled true and lists any installed dependencies in the response.
2. An org policy that blocks the plugin makes Install return 403 with the policy reason and writes nothing.
3. Saving a skill switch persists after reload and ignores skill names the plugin did not declare.
4. Installing a directory plugin with a bundled MCP server adds a custom connector named '<plugin>: <server>' and reports whether sign-in is needed.
5. agi plugin install with neither --integrity nor a valid signature fails; with --integrity sha256:<hex> that matches, it installs.
6. agi plugin login <name> on a disabled plugin refuses and tells the user to enable it first.
7. Mobile install shows the permission alert when the plugin lists permissions and cancel installs nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A plugin's bundled connections should be signable from the plugin page on web, because the brief item names that action.
- [inferred] Install on every surface should honour the same org policy.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a 'Sign in' button for bundled servers on the plugin page after install.
- [proposed] Have the CLI read org plugin policy when the user is signed in.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/plugins/installations | `apps/web/app/api/plugins/installations/route.ts` | Install a built-in registry pack with dependencies (line 42). |
| endpoint | POST /api/plugins/marketplace-installations | `apps/web/app/api/plugins/marketplace-installations/route.ts` | Install a directory plugin or user marketplace entry; registers connectors (lines 53, 128). |
| service | install-gate | `apps/web/features/plugins/server/directory/install-gate.ts` | Workspace feature gate and per-plugin org policy before install. |
| service | plugin-installation-service | `apps/web/lib/services/plugin-installation-service.ts` | planWebPluginInstall (255), installWebPlugin (346), writeInstallation (369), settings read and write (525, 559). |
| service | directory install | `apps/web/features/plugins/server/directory/install.ts` | installDirectoryPlugin and shadow entry upserts for directory plugins. |
| service | plugin-connectors | `apps/web/lib/connectors/plugin-connectors.ts` | registerPluginConnectors (39), removePluginConnectors (82), setPluginConnectorsEnabled (113). |
| endpoint | GET and PATCH /api/plugins/[id]/settings | `apps/web/app/api/plugins/[id]/settings/route.ts` | Read and save skill switches and example prompts. |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | installPlugin (1330), openConnector (1769), settings state. |
| component | PluginDetailView | `packages/ui/ui/src/directory/PluginDetailView.tsx` | Install button, Skills and Connectors tabs, ConnectorStatus (563). |
| table | plugin_installations | `apps/web/db/neon/0109_web_plugin_installations.sql` | Registry pack installs per user. |
| table | plugin_marketplace_installations | `apps/web/db/neon/0159_plugin_marketplace_sources.sql` | Directory and marketplace installs per user. |
| table | user_custom_connectors | `apps/web/db/neon/0332_custom_connector_plugin_source.sql` | Connectors created by a plugin (installed_by_plugin column, per plugin-connectors.ts:61). |
| screen | Mobile PluginDetailScreen | `apps/mobile/src/features/plugins/PluginDetailScreen.tsx` | Install, switch, skill toggles, Connect. |
| hook | Mobile usePluginActions | `apps/mobile/src/features/plugins/usePluginActions.ts` | install and requestInstall with permission alert. |
| service | Mobile plugin service | `apps/mobile/src/features/plugins/service.ts` | installPlugin (90) calls the web API. |
| command | CLI plugin install, configure, login | `apps/cli/src/lib.rs` | PluginSubcommand (2017), Install handler (6833), Login (6932), Configure (6993). |
| service | CLI installs | `apps/cli/src/installs.rs` | install_plugin (85), install_dependencies (150), configure_plugin (502). |
| command | VS Code managePlugins | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Install a plugin (319), options (377), list (418). |
| command | VS Code Cloud marketplace | `apps/extension-vscode/src/features/surfaces/accountMarketplace.ts` | Install a marketplace entry to AGI Cloud (20). |
| component | Tauri CloudPluginsSection | `apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx` | Button that opens the web plugins page. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Install; the browser sends POST with a CSRF token. | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1330-1400 |
| Server rate-limits, validates the id, applies workspace gate and per-plugin policy. | our servers | apps/web/app/api/plugins/installations/route.ts:42-61 |
| Server plans dependencies, refuses if a dependency is blocked by policy, installs dependencies then the plugin in order. | our servers | apps/web/app/api/plugins/installations/route.ts:62-74; plugin-installation-service.ts:346-366 |
| For directory plugins the server fetches the plugin files from the public source (an outside service), stores a shadow entry and installation, and registers bundled remote MCP servers as connectors. | our servers | apps/web/features/plugins/server/directory/install.ts:100-330; apps/web/app/api/plugins/marketplace-installations/route.ts:95-112 |
| Server returns 201; the browser refreshes installs and the skill catalog. | our servers | apps/web/app/api/plugins/installations/route.ts:117; useDirectoryAdapter.ts:1396-1425 |
| Person signs in to a connector through the connector flow (OAuth start or credentials form). | outside service | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1255-1329 |
| CLI install clones or copies, checks signature or hash, validates the manifest, installs dependencies from the registry, prompts for settings, all on the device; login stores tokens in the OS credential store. | device | apps/cli/src/installs.rs:85-272; apps/cli/src/lib.rs:6932-6985 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Installation row (plugin, version, enabled, enabled skills) | tables plugin_installations and plugin_marketplace_installations | Server side, visible on all Cloud surfaces | Deleted on uninstall (plugin-installation-service.ts:434) |
| Custom connectors created for bundled servers | table user_custom_connectors with installed_by_plugin | Server side | Deleted with the plugin (plugin-connectors.ts:82-110) |
| Audit events plugin_installed | workspace audit log | Server side | Retention not examined |
| CLI plugin folder, settings values | CLI config directory on the device (settings via plugin settings store) | No | Removed by agi plugin remove; settings clearing on remove not examined |
| Remote server tokens | OS credential store (CLI) | No | Not examined |

**Models and providers.** No model takes part in install. Installed plugin skills later run in chats with whatever model the chat uses; that is outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud sign-in on web, desktop and mobile (getUserScopedDb at apps/web/app/api/plugins/installations/route.ts:43). CLI install needs no account. |
| Permissions | CSRF token, workspace feature gate 'plugins', per-plugin org policy (install-gate.ts:13-48). Verified email is not required for install. |
| Subscription | none found in the code. No plan, entitlement or credit check in the install routes or services. |
| Limits and metering | plugin-installation-write 20 per minute per user, fails closed (apps/web/lib/rate-limit.ts:519). A plugin may declare at most a fixed number of skills per install (PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL, apps/web/features/plugins/server/directory/constants.ts, value not read). No metering. |
| Feature flags | PLUGIN_SIGNING_PUBLIC_KEYS (apps/web/lib/services/plugin-marketplace-service.ts:78); CLI plugins.require_signed (apps/cli/src/features/plugins/plugins.rs:254-300). |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Web, desktop-hosted and mobile installs are Managed Cloud only (apps/web/app/api/plugins/installations/route.ts:79; apps/mobile/src/features/shell/destinationScope.ts:38). The CLI and VS Code local install work on the device with no AGI account and no paid plan (apps/cli/src/installs.rs:85-125). Own-key mode: none found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Buttons are disabled while an action is pending (PluginDetailView.tsx busy prop; mobile usePluginActions.ts:24-35 single-flight guard). | as cited |
| Error | Install failure text appears in the page; the install error is described by describeActionFailure (useDirectoryAdapter.ts:1385-1392). Mobile shows an ErrorBanner (PluginDetailScreen.tsx:376). | as cited |
| Blocked by org policy | 403 PLUGIN_NOT_PERMITTED with a reason; nothing is written. | install-responses.ts:47-52 |
| Source unreachable | 502 PLUGIN_SOURCE_UNAVAILABLE for directory plugins whose files cannot be fetched. | install-responses.ts:79-85 |
| Not installable on web | 409 PLUGIN_NOT_INSTALLABLE with an install command for the CLI. | install-responses.ts:68-78 |
| Already installed | Web upsert keeps one row; CLI prints 'Already at <path>' (apps/cli/src/lib.rs:6954). | as cited |
| Retry | A failed connector sign-in can be retried from the connector page; CLI login says to run the command again (lib.rs:6980). | as cited |
| Offline | not handled in the code for web install beyond the error banner. | none found |
| Cancel | Mobile alert Cancel installs nothing (usePluginActions.ts:70-72). | as cited |
| Accessibility | Skill switches carry aria-label 'Use <skill>'; the spinner has an aria-label (PluginDetailView.tsx:554,677). | as cited |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/plugins/installations/__tests__/route.test.ts`: Install route; contents not opened.
- `apps/web/app/api/plugins/marketplace-installations/__tests__/route.test.ts`: Directory and marketplace install route; contents not opened.
- `apps/web/lib/services/plugin-installation-service.test.ts`: Install service; contents not opened.
- `apps/web/features/plugins/server/directory/__tests__/install.test.ts`: Directory install; contents not opened.
- `apps/web/app/api/plugins/[id]/settings/__tests__/route.test.ts`: Settings route; contents not opened.
- `apps/web/lib/connectors/__tests__/plugin-connectors.test.ts`: Connector registration for plugins; contents not opened.
- `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx`: Mobile plugin screens; contents not opened.
- `apps/cli/src/installs.rs`: One inline test: dependency install refused when signature policy is unknown (line 597).
- `apps/web/features/plugins/hooks/__tests__/usePluginsSettingsAdapter.test.tsx`: Plugins settings adapter; contents not opened.

**Test scenarios**

- **Install a built-in pack with dependency**
  1. Sign in on web.
  2. Open a pack that declares a dependency.
  3. Press Install.
  - Expected: Both plugins show as installed and enabled; the page names the dependency.
- **Org policy blocks**
  1. Block the plugin key in the workspace plugin policy.
  2. Press Install as a member.
  - Expected: 403 and the policy reason in the page; no row in plugin_installations.
- **Bundled connector appears**
  1. Install a directory plugin that ships a remote MCP server.
  2. Open Customize > Connectors.
  - Expected: A connector '<plugin>: <server>' exists; if sign-in is required the install response says so.
- **Save skill switch**
  1. Open an installed plugin, switch one skill off.
  2. Reload the page.
  - Expected: The switch is still off.
- **CLI install with settings**
  1. Run agi plugin install <folder> --integrity sha256:<digest> in a terminal.
  2. Answer the settings prompts.
  3. Run agi plugin configure <name>.
  - Expected: Plugin installed; configure prints saved values and any 'Still needed' keys.
- **CLI login**
  1. Install a plugin that bundles a remote server and enable it.
  2. Run agi plugin login <name>.
  - Expected: One 'Signed in to <server>' line per server, or a failure count with a retry hint.

**Where to look when it fails**

- Error codes INVALID_PLUGIN, PLUGIN_NOT_INSTALLABLE, PLUGIN_NOT_PERMITTED, PLUGIN_SOURCE_UNAVAILABLE.
- Log '[plugin-connectors] a plugin MCP server was not added as a connector' (apps/web/lib/connectors/plugin-connectors.ts:68).
- Tables plugin_installations, plugin_marketplace_installations, user_custom_connectors; audit event plugin_installed.
- CLI messages beginning 'Refusing install:'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)
- VS Code: [70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **Brief says CLI settings are 'not in the brief'; they exist (agi plugin configure).** Affects: CLI documentation and tests. Evidence: apps/cli/src/lib.rs:6993; apps/cli/src/installs.rs:502. Work needed: Add the item to the brief and a test.
- **Brief says mobile install and configure are missing; mobile has install, permission alert and skill switches.** Affects: Mobile status reporting. Evidence: apps/mobile/src/features/plugins/usePluginActions.ts:65-84; PluginDetailScreen.tsx:353,549. Work needed: Correct the brief; verify on a device.
- **Brief says VS Code install is not listed; VS Code can install local plugins and Cloud marketplace entries.** Affects: VS Code status reporting. Evidence: capabilityManagement.ts:319; accountMarketplace.ts:20. Work needed: Correct the brief.
- **The draft said 'press connect for each bundled connection'; for bundled servers the plugin page hides Connect and shows no status.** Affects: Web and desktop users with plugins that ship their own servers. Evidence: PluginDetailView.tsx:593-600; plugins-directory.ts:1060-1072. Work needed: Add a sign-in action or deep link for bundled servers on the plugin page.
- **Registry packs do not register connectors on install.** Affects: Web, mobile users of built-in packs that bundle servers (if any do). Evidence: installations/route.ts has no registerPluginConnectors call. Work needed: Check whether any built-in pack bundles servers; if so wire it.
- **CLI and VS Code local installs do not apply org policy or Cloud entitlement.** Affects: Org admins. Evidence: apps/cli/src/installs.rs:85-125 uses only signature policy. Work needed: Product decision; document the boundary.
- **No Chrome install path.** Affects: Chrome users. Evidence: no plugin reference under apps/extension/src. Work needed: Product decision.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:POST /api/plugins/installations
- api:POST /api/plugins/marketplace-installations
- api:GET /api/plugins/[id]/settings
- api:PATCH /api/plugins/[id]/settings
- table:plugin_installations
- table:plugin_marketplace_installations
- table:user_custom_connectors
- F054-07
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-execution-boundaries

## Unknown

- Where mobile 'Connect' for a plugin connector navigates (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:434 handler not traced).
- Whether any built-in registry pack bundles remote servers.
- Value of the maximum skills per install constant.
- What CLI plugin settings storage does when a plugin is removed.
- How the Tauri Local settings page installs plugins (apps/desktop/src/features/settings/SkillsPluginsSettings.tsx not read).
- What existing tests assert beyond file names.
- Retention of audit events.
